import { useMemo, useState } from "react";

import { AppShell } from "@/components/appraisal/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppraisal } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";
import { cn } from "@/lib/utils";
import {
  budgetTotals,
  byManager,
  byDesignation,
  ratingDistribution,
  payoutDistribution,
} from "@/lib/dashboard-metrics";
import {
  StackedColumnChart,
  RankedBarList,
  GroupTable,
} from "@/components/dashboard/charts";

const COLORS = {
  hike: "#1d4f8c",
  pb: "#5b92d6",
  rb: "#b9d4f1",
  allocated: "#94a3b8",
  target: "#d46b08",
  next: "#ad4e00",
  bar: "#2f6db5",
};

const fmtCr = (v) => `₹ ${(v / 1e7).toFixed(2)} Cr`;
const fmtL = (v) => `₹ ${(v / 1e5).toFixed(2)} L`;
const utilColor = (u) => (u > 100 ? "#cf1322" : u > 90 ? "#d46b08" : "#389e0d");

const TABS = [
  { key: "budget", label: "Budget consumed" },
  { key: "bonus", label: "Bonus analysis" },
  { key: "hike", label: "Hike" },
];

const REPORTS = {
  budget: [
    ["b_mgr", "By comp manager"],
    ["b_desig", "By designation"],
    ["b_util", "Utilisation by manager"],
  ],
  bonus: [
    ["n_mgr", "Target vs paid by manager"],
    ["n_desig", "Target vs paid by designation"],
    ["n_dist", "Payout distribution"],
  ],
  hike: [
    ["h_rating", "Hike by rating"],
    ["h_desig", "Base pay by designation"],
    ["h_mgr", "Hike by manager"],
    ["h_promo", "Promotions by designation"],
  ],
};

export function Dashboard() {
  const { rows } = useAppraisal();

  // Dashboard reporting scope: only Active + Eligible employees.
  const appraisalRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          String(row.status || "").trim().toLowerCase() === "active" &&
          String(row.eligibility || "").trim().toLowerCase() === "eligible",
      ),
    [rows],
  );

  const [tab, setTab] = useState("budget");
  const [selected, setSelected] = useState({
    budget: ["b_mgr", "b_desig", "b_util"],
    bonus: ["n_mgr", "n_desig", "n_dist"],
    hike: ["h_rating", "h_desig", "h_mgr", "h_promo"],
  });

  const {
    totals: budgetMasterTotals,
    loading: budgetLoading,
    error: budgetError,
  } = useBudget();

  // Real Budget Master total when loaded; budgetTotals falls back to the
  // placeholder estimate otherwise.
  const realAllocated =
    !budgetLoading && !budgetError ? budgetMasterTotals?.updated : 0;

  const budget = useMemo(
    () => budgetTotals(appraisalRows, realAllocated),
    [rows, realAllocated],
  );
  const mgrStats = useMemo(() => byManager(appraisalRows), [rows]);
  const desigStats = useMemo(() => byDesignation(appraisalRows), [rows]);
  const ratingStats = useMemo(() => ratingDistribution(appraisalRows), [rows]);
  const payoutDist = useMemo(() => payoutDistribution(appraisalRows), [rows]);

  const tgt = useMemo(
    () => desigStats.reduce((s, d) => s + d.targetPB, 0),
    [desigStats],
  );
  const tgtNext = useMemo(
    () => desigStats.reduce((s, d) => s + d.targetNext, 0),
    [desigStats],
  );
  const promos = useMemo(
    () => desigStats.reduce((s, d) => s + d.promotions, 0),
    [desigStats],
  );
  const avgHike = useMemo(
    () =>
      appraisalRows.length
        ? appraisalRows.reduce((s, r) => s + (Number(r.hikePct) || 0), 0) / appraisalRows.length
        : 0,
    [rows],
  );

  const selectedReports = REPORTS[tab];
  const activeSet = selected[tab];

  const toggleChip = (key) => {
    setSelected((prev) => {
      const current = prev[tab];
      const isOn = current.includes(key);
      const next = isOn
        ? current.filter((k) => k !== key)
        : current.length < 4
          ? [...current, key]
          : current;

      return { ...prev, [tab]: next };
    });
  };

  const kpis = {
    budget: [
      {
        label: "Budget consumed",
        value: fmtCr(budget.consumed),
        sub: "Hike + PB + RB",
      },
      {
        label: "Budget allocated",
        value: fmtCr(budget.allocated),
        sub: budget.allocatedIsEstimate
          ? "Estimate — Budget Master unavailable"
          : "From Budget Master",
      },
      {
        label: "Consumed vs allocated",
        value: `${budget.utilisation.toFixed(1)}%`,
        sub:
          budget.utilisation > 100
            ? `Over by ${fmtCr(budget.consumed - budget.allocated)}`
            : "Within budget",
        color: utilColor(budget.utilisation),
      },
      {
        label: "Headcount",
        value: String(appraisalRows.length),
        sub: "Current appraisal cycle",
      },
    ],
    bonus: [
      {
        label: "Target PB agreed",
        value: fmtCr(tgt),
        sub: "Applicable to this cycle",
      },
      {
        label: "PB paid",
        value: fmtCr(budget.pb),
        sub: `${tgt ? ((budget.pb / tgt) * 100).toFixed(0) : 0}% of target`,
      },
      { label: "RB paid", value: fmtCr(budget.rb), sub: "Retention bonus" },
      {
        label: "Target PB next year",
        value: fmtCr(tgtNext),
        sub: `${tgt ? ((tgtNext / tgt - 1) * 100 >= 0 ? "+" : "") + ((tgtNext / tgt - 1) * 100).toFixed(0) : 0}% vs this year`,
      },
    ],
    hike: [
      {
        label: "Average hike",
        value: `${avgHike.toFixed(1)}%`,
        sub: "Across all employees",
      },
      {
        label: "Total hike amount",
        value: fmtCr(budget.hike),
        sub: "This cycle",
      },
      {
        label: "Promotions",
        value: String(promos),
        sub: `${appraisalRows.length ? ((promos / appraisalRows.length) * 100).toFixed(0) : 0}% of headcount`,
      },
      {
        label: "Headcount",
        value: String(appraisalRows.length),
        sub: "Current appraisal cycle",
      },
    ],
  }[tab];

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Appraisal Dashboard
            </h2>
            <p className="text-sm text-muted-foreground">
              {appraisalRows.length} employees in the current cycle
            </p>
          </div>
        </div>

        <Card className="gap-0 p-0">
          <div className="flex items-stretch gap-7 border-b border-border px-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "border-b-2 py-3 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm font-semibold text-foreground">
              Reports
            </span>
            <span className="text-xs text-muted-foreground">pick up to 4</span>

            {selectedReports.map(([key, label]) => {
              const on = activeSet.includes(key);
              const full = !on && activeSet.length >= 4;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={full}
                  onClick={() => toggleChip(key)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs",
                    on
                      ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                      : full
                        ? "border-border text-muted-foreground/50 cursor-not-allowed"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {on && "✓ "}
                  {label}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="gap-0 p-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {k.label}
              </p>
              <p
                className="num mt-1 text-2xl font-semibold"
                style={{ color: k.color }}
              >
                {k.value}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {k.sub}
              </p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* ============ BUDGET ============ */}

          {tab === "budget" && activeSet.includes("b_mgr") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Consumed vs allocated — by comp manager
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StackedColumnChart
                  columns={mgrStats.map((m) => ({
                    label: m.name,
                    sub: `HC ${m.headcount}`,
                    sub2: `${m.utilisation.toFixed(0)}% of alloc.`,
                    subColor: utilColor(m.utilisation),
                    bars: [
                      {
                        topLabel: fmtL(m.consumed),
                        total: m.consumed,
                        segments: [
                          { value: m.hike, color: COLORS.hike, label: "H" },
                          { value: m.pb, color: COLORS.pb, label: "PB" },
                          {
                            value: m.rb,
                            color: COLORS.rb,
                            textColor: "#0b2a4d",
                            label: "RB",
                          },
                        ],
                      },
                      {
                        topLabel: fmtL(m.allocated),
                        total: m.allocated,
                        outline: "#8c8c8c",
                        segments: [
                          { value: m.allocated, color: COLORS.allocated },
                        ],
                      },
                    ],
                  }))}
                />
              </CardContent>
            </Card>
          )}

          {tab === "budget" && activeSet.includes("b_desig") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Consumed vs allocated — by designation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StackedColumnChart
                  columns={desigStats.map((d) => ({
                    label: d.name,
                    sub: `HC ${d.headcount}`,
                    sub2: d.allocated
                      ? `${((d.consumed / d.allocated) * 100).toFixed(0)}% of alloc.`
                      : "—",
                    subColor: utilColor(
                      (d.consumed / (d.allocated || 1)) * 100,
                    ),
                    bars: [
                      {
                        topLabel: fmtL(d.consumed),
                        total: d.consumed,
                        segments: [
                          { value: d.hike, color: COLORS.hike, label: "H" },
                          { value: d.pb, color: COLORS.pb, label: "PB" },
                          {
                            value: d.rb,
                            color: COLORS.rb,
                            textColor: "#0b2a4d",
                            label: "RB",
                          },
                        ],
                      },
                      {
                        topLabel: fmtL(d.allocated),
                        total: d.allocated,
                        outline: "#8c8c8c",
                        segments: [
                          { value: d.allocated, color: COLORS.allocated },
                        ],
                      },
                    ],
                  }))}
                />
              </CardContent>
            </Card>
          )}

          {tab === "budget" && activeSet.includes("b_util") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Utilisation by manager
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBarList
                  rows={mgrStats
                    .slice()
                    .sort((a, b) => b.utilisation - a.utilisation)
                    .map((m) => ({
                      label: m.name,
                      badge: m.headcount,
                      value: m.utilisation,
                      color: utilColor(m.utilisation),
                      valueColor: utilColor(m.utilisation),
                    }))}
                  maxValue={Math.max(
                    100,
                    ...mgrStats.map((m) => m.utilisation),
                  )}
                  formatValue={(v) => `${v.toFixed(0)}%`}
                />
              </CardContent>
            </Card>
          )}

          {/* ============ BONUS ============ */}

          {tab === "bonus" && activeSet.includes("n_mgr") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Target PB agreed vs PB paid — by comp manager
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StackedColumnChart
                  columns={mgrStats.map((m) => ({
                    label: m.name,
                    sub: `HC ${m.headcount}`,
                    sub2: m.targetPB
                      ? `${((m.pb / m.targetPB) * 100).toFixed(0)}% of target`
                      : "—",
                    subColor: m.pb > m.targetPB ? COLORS.next : "#389e0d",
                    bars: [
                      {
                        topLabel: fmtL(m.targetPB),
                        total: m.targetPB,
                        outline: "#d46b08",
                        segments: [
                          {
                            value: m.targetPB,
                            color: COLORS.target,
                            textColor: "#873800",
                          },
                        ],
                      },
                      {
                        topLabel: fmtL(m.pb),
                        total: m.pb,
                        segments: [{ value: m.pb, color: COLORS.hike }],
                      },
                    ],
                  }))}
                />
              </CardContent>
            </Card>
          )}

          {tab === "bonus" && activeSet.includes("n_desig") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Target PB agreed vs PB paid — by designation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GroupTable
                  columns={[
                    { key: "name", label: "Designation" },
                    { key: "headcount", label: "HC", align: "right" },
                    {
                      key: "target",
                      label: "Target agreed",
                      align: "right",
                      render: (r) => fmtL(r.targetPB),
                    },
                    {
                      key: "paid",
                      label: "Paid",
                      align: "right",
                      render: (r) => fmtL(r.pb),
                    },
                    {
                      key: "pct",
                      label: "Paid vs target",
                      align: "right",
                      render: (r) =>
                        r.targetPB
                          ? `${((r.pb / r.targetPB) * 100).toFixed(0)}%`
                          : "—",
                    },
                  ]}
                  rows={desigStats}
                />
              </CardContent>
            </Card>
          )}

          {tab === "bonus" && activeSet.includes("n_dist") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Payout vs target — employee distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBarList
                  rows={payoutDist.map((b) => ({
                    label: b.label,
                    value: b.count,
                    color: COLORS.bar,
                  }))}
                  formatValue={(v) => String(v)}
                />
              </CardContent>
            </Card>
          )}

          {/* ============ HIKE ============ */}

          {tab === "hike" && activeSet.includes("h_rating") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Average hike % by rating
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBarList
                  rows={ratingStats.map((r) => ({
                    label: r.rating,
                    badge: `${r.count} emp`,
                    value: r.avgHike,
                  }))}
                  formatValue={(v) => `${v.toFixed(1)}%`}
                />
              </CardContent>
            </Card>
          )}

          {tab === "hike" && activeSet.includes("h_desig") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Headcount &amp; base pay by designation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GroupTable
                  columns={[
                    { key: "name", label: "Designation" },
                    {
                      key: "hc",
                      label: "HC",
                      align: "right",
                      render: (r) => r.headcount,
                    },
                    {
                      key: "avg",
                      label: "Avg base",
                      align: "right",
                      render: (r) => fmtL(r.avgBase),
                    },
                    {
                      key: "hike",
                      label: "Avg hike %",
                      align: "right",
                      render: (r) => `${r.avgHike.toFixed(1)}%`,
                    },
                  ]}
                  rows={desigStats}
                />
              </CardContent>
            </Card>
          )}

          {tab === "hike" && activeSet.includes("h_mgr") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Average hike % by comp manager
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBarList
                  rows={mgrStats
                    .slice()
                    .sort((a, b) => b.avgHike - a.avgHike)
                    .map((m) => ({
                      label: m.name,
                      badge: m.headcount,
                      value: m.avgHike,
                    }))}
                  formatValue={(v) => `${v.toFixed(1)}%`}
                />
              </CardContent>
            </Card>
          )}

          {tab === "hike" && activeSet.includes("h_promo") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Promotions by designation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBarList
                  rows={desigStats.map((d) => ({
                    label: d.name,
                    badge: `of ${d.headcount}`,
                    value: d.promotions,
                    color: COLORS.bar,
                  }))}
                  formatValue={(v) => String(v)}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
