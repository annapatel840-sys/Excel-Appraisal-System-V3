import { useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { TechEdBudgetMasterPage } from "./TechEdBudgetMasterPage";

const NAVY = "#12304f";
const TEAL = "#14a3a3";
const BORDER = "#d3dbe6";

/* Sample data. Replace with the budgetmaster API response when it is wired. */
const TECH_ED_DATA = [
  {
    name: "Prabhu Prasad Parida",
    pct: 8,
    base: 42500000,
    original: 3400000,
    updated: 3400000,
    team0: 48,
    team: 48,
    lastChanged: "01-Sep-26",
  },
  {
    name: "Ashok Kumar",
    pct: 8,
    base: 38000000,
    original: 3040000,
    updated: 3040000,
    team0: 42,
    team: 42,
    lastChanged: "01-Sep-26",
  },
];

const INITIAL_AUDIT = [
  {
    date: "2026-09-01",
    owner: "Prabhu Prasad Parida",
    from: null,
    to: 8,
    before: null,
    after: 3400000,
    by: "HR",
    reason: "Initial allocation",
  },
  {
    date: "2026-09-01",
    owner: "Ashok Kumar",
    from: null,
    to: 8,
    before: null,
    after: 3040000,
    by: "HR",
    reason: "Initial allocation",
  },
];

const INITIAL_ORG_AUDIT = [
  {
    date: "2026-09-01",
    from: null,
    to: 8,
    before: null,
    after: 6440000,
    by: "HR",
    reason: "Initial allocation",
  },
];

/* ---------- helpers ---------- */
function money(value) {
  return "₹ " + ((Number(value) || 0) / 100000).toFixed(2) + " L";
}

function percent(value) {
  return Number(value || 0).toFixed(1) + "%";
}

function dateText(value) {
  if (!value) return "—";
  const p = String(value).split("-");
  if (p.length !== 3) return value;
  return (
    p[2] +
    "-" +
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][Number(p[1]) - 1]
  );
}

function Panel({ title, count, open, onToggle, children }) {
  return (
    <section
      className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]"
      style={{ borderColor: BORDER }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-semibold tracking-[.15px] text-white"
        style={{ background: NAVY }}
      >
        <span>
          {title}
          {count ? (
            <span className="ml-2 font-normal text-[#d6e4f5]">{count}</span>
          ) : null}
        </span>
        <span className="text-[12px]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

/* Audit table: header alignment matches value alignment (numbers right, text left). */
const AUDIT_COLS = [
  ["Date", false],
  ["Owner", false],
  ["Old %", true],
  ["New %", true],
  ["Budget before", true],
  ["Budget after", true],
  ["Changed by", false],
  ["Reason", false],
];

function AuditTable({
  rows,
  showOwner = true,
  ownerLabel = "Owner",
  budgetLabel = "Budget",
}) {
  const cols = AUDIT_COLS.filter(([h]) => showOwner || h !== "Owner").map(
    ([h, r]) => [
      h === "Owner"
        ? ownerLabel
        : h === "Budget before"
          ? budgetLabel + " before"
          : h === "Budget after"
            ? budgetLabel + " after"
            : h,
      r,
    ],
  );
  const td = "border-b border-[#edf0f4] px-4 py-2 align-middle ";
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed border-collapse text-[12px] tabular-nums">
        <colgroup>{cols.map(([h]) => <col key={h} />)}</colgroup>
        <thead>
          <tr>
            {cols.map(([h, right]) => (
              <th
                key={h}
                className={
                  "border-b border-[#d7dce3] px-4 py-2 text-[11px] font-bold text-[#1e3a5f] " +
                  (right ? "text-right" : "text-left")
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                <td className={td + "whitespace-nowrap"}>
                  {dateText(r.date)}
                  {r.time ? " " + r.time : ""}
                </td>
                {showOwner ? (
                  <td className={td + "font-bold"}>{r.owner}</td>
                ) : null}
                <td className={td + "text-right"}>
                  {r.from == null ? "—" : percent(r.from)}
                </td>
                <td className={td + "text-right font-bold"}>{percent(r.to)}</td>
                <td className={td + "text-right"}>
                  {r.before == null ? "—" : money(r.before)}
                </td>
                <td className={td + "text-right"}>{money(r.after)}</td>
                <td className={td}>{r.by}</td>
                <td className={td}>{r.reason || "—"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols.length} className="px-3 py-4 text-slate-500">
                No changes in this date range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* =====================================================================
   HR LOGIN
   ===================================================================== */
const HR_COLS = [
  ["Tech ED", false],
  ["Budget base", true],
  ["% applied", true],
  ["Source", false],
  ["Budget", true],
  ["Original Budget", true],
  ["Updated Budget", true],
  ["Original Count", true],
  ["Current Count", true],
  ["Last Changed", false],
];

function HRApplyBudget() {
  // Access rules (permissive when accessapi is unavailable).
  const access = useAccess();
  const canConfig =
    access.canScreen("budgetAllocation", "edit") &&
    access.canAction("changeBudgetConfig");
  const canAudit = access.canAction("viewAudit");
  const [rows, setRows] = useState(TECH_ED_DATA);
  const [orgPct, setOrgPct] = useState("8");
  const [pending, setPending] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState({});
  const [audit, setAudit] = useState(INITIAL_AUDIT);
  const [orgAudit, setOrgAudit] = useState(INITIAL_ORG_AUDIT);
  const [overrides, setOverrides] = useState({});

  const total = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          base: s.base + r.base,
          original: s.original + r.original,
          updated: s.updated + r.updated,
          team0: s.team0 + r.team0,
          team: s.team + r.team,
        }),
        { base: 0, original: 0, updated: 0, team0: 0, team: 0 },
      ),
    [rows],
  );

  const previewPct = (row) =>
    Object.prototype.hasOwnProperty.call(pending, row.name)
      ? Number(pending[row.name])
      : overrides[row.name]
        ? row.pct
        : Number(orgPct);

  const previewBudget = (row) => (row.base * previewPct(row)) / 100;
  const changes = rows.filter((r) => Number(previewPct(r)) !== r.pct);
  const orgPending = Number(orgPct) !== 8;
  const pendingCount =
    changes.length || orgPending ? changes.length + (orgPending ? 1 : 0) : 0;
  const previewTotal = rows.reduce((s, r) => s + previewBudget(r), 0);

  function setRowPct(name, value) {
    setPending((p) => ({ ...p, [name]: value }));
  }

  function resetRow(name) {
    const value = orgPct;
    const row = rows.find((r) => r.name === name);
    if (Number(value) === row?.pct) {
      setPending((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
      setOverrides((o) => {
        const n = { ...o };
        delete n[name];
        return n;
      });
    } else {
      setPending((p) => ({ ...p, [name]: value }));
    }
  }

  function discard() {
    setPending({});
    setReason("");
    setError("");
  }

  function apply() {
    const org = Number(orgPct);
    if (!(org >= 0 && org <= 100)) {
      setError("Enter a valid org % between 0 and 100.");
      return;
    }

    const invalid = rows.find((r) => {
      const value = previewPct(r);
      return !(value >= 0 && value <= 100);
    });
    if (invalid) {
      setError(
        "Not applied. " + invalid.name + ": enter a valid % between 0 and 100.",
      );
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const changedRows = rows.filter((r) => Number(previewPct(r)) !== r.pct);
    const next = rows.map((r) => {
      const to = Number(previewPct(r));
      return to === r.pct
        ? r
        : {
            ...r,
            pct: to,
            updated: (r.base * to) / 100,
            lastChanged: dateText(now),
          };
    });

    const newAudit = changedRows.map((r) => ({
      date: now,
      owner: r.name,
      from: r.pct,
      to: Number(previewPct(r)),
      before: r.updated,
      after: previewBudget(r),
      by: "HR",
      reason:
        reason.trim() ||
        (Number(previewPct(r)) === org ? "Reset to org %" : "Override"),
    }));

    if (orgPending) {
      setOrgAudit((a) => [
        {
          date: now,
          from: 8,
          to: org,
          before: total.updated,
          after: previewTotal,
          by: "HR",
          reason: reason.trim() || "Org budget percentage change",
        },
        ...a,
      ]);
    }

    setRows(next);
    setAudit((a) => [...newAudit, ...a]);
    setPending({});
    setOverrides((o) => {
      const nextOverrides = { ...o };
      next.forEach((r) => {
        if (r.pct === org) delete nextOverrides[r.name];
        else nextOverrides[r.name] = true;
      });
      return nextOverrides;
    });
    setReason("");
    setError("");
  }

  const orgCell = "shrink-0 min-w-[170px] border-r border-[#d7dce3] px-[22px] py-4";

  const appraisalCycles = ["Apr-26"];
  const [selectedCycle, setSelectedCycle] = useState(appraisalCycles[0]);

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <div className="flex justify-between gap-2 rounded-md border border-[#e3e8ef] border-l-4 border-l-[#c2410c] bg-white px-3 py-2 text-[12px] text-[#7c2d12]">
          <span>{error}</span>
          <button
            type="button"
            className="font-bold"
            onClick={() => setError("")}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section
        className={
          "overflow-hidden rounded-[10px] border bg-white " +
          (orgPending ? "bg-[#fdf8e7]" : "")
        }
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Org Budget %
        </div>
        <div className="overflow-x-auto">
          <div className="flex items-stretch gap-3 px-3 py-1">
            <div className={orgCell}>
              <div className="text-[11px] font-medium text-[#5b6b80]">
                Appraisal Cycle
              </div>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
                className="mt-1 h-[38px] min-w-[140px] rounded border border-[#14a3a3] bg-white px-2 text-[13px] font-bold text-[#12304f] outline-none"
              >
                {appraisalCycles.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {cycle}
                  </option>
                ))}
              </select>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] font-medium text-[#5b6b80]">
                Org % (default for all Tech EDs)
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={orgPct}
                disabled={!canConfig}
                onChange={(e) => setOrgPct(e.target.value)}
                className="mt-1 h-[38px] w-[110px] rounded border border-[#14a3a3] px-2 text-right text-[18px] font-bold text-[#12304f] outline-none"
              />
              {orgPending ? (
                <div className="text-[11px] text-slate-500">was 8%</div>
              ) : null}
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Org budget base</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(total.base)}
              </div>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Original budget</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(total.original)}
              </div>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Updated budget</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(
                  orgPending || changes.length ? previewTotal : total.updated,
                )}
              </div>
            </div>
            <div className="shrink-0 min-w-[150px] rounded-md border border-[#d7dce3] bg-[#f8fafc] px-[22px] py-4">
              <div className="text-[11px] text-[#5b6b80]">Team count</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {total.team0} → {total.team}
              </div>
            </div>
          </div>
        </div>
        <div className="px-[18px] pb-2.5 text-[11.5px] text-slate-500">
          Changing the org % updates every Tech ED on the org default. Tech EDs
          with an override keep their own %.
        </div>
      </section>

      <section
        className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Tech EDs — {rows.length}
        </div>
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full min-w-[1180px] border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {HR_COLS.map(([h, right]) => (
                  <th
                    key={h}
                    className={
                      "sticky top-0 whitespace-nowrap border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " +
                      (right ? "text-right" : "text-left")
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = previewPct(r);
                const changing = Number(p) !== r.pct;
                const open = !!history[r.name];
                const sourceOverride =
                  overrides[r.name] ||
                  (Object.prototype.hasOwnProperty.call(pending, r.name) &&
                    Number(p) !== Number(orgPct));
                const td =
                  "border-b border-[#e1e5eb] px-2.5 py-2 align-middle " +
                  (changing ? "bg-[#fdf8e7] " : "bg-white ");
                return (
                  <FragmentRow key={r.name}>
                    <tr>
                      <td
                        className={td + "whitespace-nowrap text-left font-bold"}
                      >
                        {r.name}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.base)}
                      </td>
                      <td className={td + "text-right"}>
                        <div className="flex flex-col items-end">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={p}
                            disabled={!canConfig}
                            onChange={(e) => setRowPct(r.name, e.target.value)}
                            className="h-8 w-[84px] rounded border border-[#14a3a3] bg-white px-2 text-right text-[14px] font-bold text-[#12304f]"
                          />
                          {changing ? (
                            <div className="whitespace-nowrap text-[11px] text-slate-500">
                              was {r.pct}%
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={td + "text-left"}>
                        {sourceOverride ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="whitespace-nowrap rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">
                              Override
                            </span>
                            <button
                              type="button"
                              className="whitespace-nowrap text-[11.5px] font-bold text-[#1859a8]"
                              onClick={() => resetRow(r.name)}
                            >
                              Reset to org %
                            </button>
                          </div>
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-[#e6f4f4] px-2 py-0.5 text-[11px] font-bold text-[#0f6d6d]">
                            Org default
                          </span>
                        )}
                      </td>
                      <td
                        className={
                          td +
                          "whitespace-nowrap text-right font-bold text-[#17365d]"
                        }
                      >
                        {money((r.base * p) / 100)}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.original)}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.updated)}
                      </td>
                      <td className={td + "text-right"}>{r.team0}</td>
                      <td className={td + "text-right"}>{r.team}</td>
                      <td className={td + "text-left"}>
                        {canAudit && (open || r.lastChanged !== "01-Sep-26") ? (
                          <button
                            type="button"
                            className="whitespace-nowrap rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[12px] font-bold text-[#17365d]"
                            onClick={() =>
                              setHistory((x) => ({
                                ...x,
                                [r.name]: !x[r.name],
                              }))
                            }
                          >
                            {r.lastChanged} {open ? "▴" : "▾"}
                          </button>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </td>
                    </tr>
                    {open && canAudit ? (
                      <tr>
                        <td
                          colSpan={HR_COLS.length}
                          className="border-b border-[#d7dce3] bg-[#f7f9fc] px-10 py-3"
                        >
                          <AuditTable
                            rows={audit.filter((a) => a.owner === r.name)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[#d4dbe5] bg-white px-3.5 py-2.5">
          <span
            className={
              pendingCount ? "font-bold text-[#c2410c]" : "text-slate-500"
            }
          >
            {pendingCount
              ? pendingCount +
                " change" +
                (pendingCount === 1 ? "" : "s") +
                " pending"
              : "No pending changes"}
          </span>
          {canConfig && (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!pendingCount}
                placeholder="Reason (saved in the audit trail)"
                className="h-[30px] min-w-[200px] max-w-[460px] flex-1 rounded border border-[#cbd3df] px-2 text-[12.5px]"
              />
              <button
                type="button"
                disabled={!pendingCount}
                onClick={discard}
                className="rounded-md border border-[#c5d0dd] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#12304f] disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={!pendingCount}
                onClick={apply}
                className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                style={{ background: TEAL }}
              >
                Apply
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* tbody can hold several <tr> per item; a fragment keeps the table valid. */
function FragmentRow({ children }) {
  return <>{children}</>;
}

function HRAuditTrail() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("all");
  const [audit] = useState(INITIAL_AUDIT);
  const [orgAudit] = useState(INITIAL_ORG_AUDIT);

  const orgRows = orgAudit.filter(
    (r) => (!from || r.date >= from) && (!to || r.date <= to),
  );
  const tedRows = audit.filter(
    (r) =>
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (filter === "all" || r.owner === filter),
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-[12px] text-slate-600">
          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2"
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2"
            />
          </label>
          <span className="ml-auto text-[11px]">
            Audit lines can't be edited or deleted
          </span>
        </div>
      </div>
      <section
        className="overflow-hidden rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Org % — audit trail
        </div>
        <div className="p-3.5">
          <AuditTable
            rows={orgRows}
            showOwner={false}
            budgetLabel="Org budget"
          />
        </div>
      </section>
      <section
        className="overflow-hidden rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Tech ED % — audit trail
        </div>
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px]">
          <label>
            Tech ED
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="ml-2 h-7 rounded border border-[#cbd3df] px-2"
            >
              <option value="all">All</option>
              {TECH_ED_DATA.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="p-3.5">
          <AuditTable rows={tedRows} ownerLabel="Tech ED" />
        </div>
      </section>
    </div>
  );
}

/* =====================================================================
   PAGE SWITCH
   ===================================================================== */
export function BudgetMasterPage() {
  const user = useCatalystUser();
  const role = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isHR =
    role === "hr" || role === "humanresources" || role === "hroperation";
  const canAudit = useAccess().canAction("viewAudit");
  const [tab, setTab] = useState("apply");

  return (
    <div
      className="w-full"
      style={{
        fontFamily: '"IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif',
        fontVariantNumeric: "tabular-nums",
        color: "#0f1f33",
      }}
    >
      {isHR ? (
        <>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("apply")}
              className={
                "rounded-2xl border px-4 py-1.5 text-[12px] font-medium " +
                (tab === "apply"
                  ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white"
                  : "bg-white text-[#334155]")
              }
            >
               Apply Budget
            </button>
            {canAudit && <button
              type="button"
              onClick={() => setTab("audit")}
              className={
                "rounded-2xl border px-4 py-1.5 text-[12px] font-medium " +
                (tab === "audit"
                  ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white"
                  : "bg-white text-[#334155]")
              }
            >
               Audit Trail
            </button>}
          </div>
          {tab === "apply" || !canAudit ? <HRApplyBudget /> : <HRAuditTrail />}
        </>
      ) : (
        <TechEdBudgetMasterPage />
      )}
    </div>
  );
}

export { TechEdBudgetMasterPage };
