import { useMemo, useState } from "react";

import { useBudget } from "@/lib/budget-store";
import {
  buildChangeLog,
  dateText,
  fmtLakh,
  rootsOf,
  subtreeOf,
  TYPE_LABEL,
} from "@/lib/budget-engine";

const NAVY = "#17365d";

const PILL_CLASS = {
  left: "bg-[#fff1f0] text-[#a8071a]",
  added: "bg-[#f6ffed] text-[#237804]",
  in: "bg-[#e6f0fb] text-[#1d4f8c]",
  out: "bg-[#f9f0ff] text-[#531dab]",
};

export function TeamInsightsPanel({ onViewChanges }) {
  const {
    currentUser,
    isHR,
    hierarchy,
    node,
    budgetFor,
    eligibilityEvents,
    gridSupervisorChanges,
    allocationSnapshot,
    budgetRows,
  } = useBudget();

  const [open, setOpen] = useState(true);
  const [budgetOpen, setBudgetOpen] = useState(true);

  const b = budgetFor();

  const utilised = useMemo(() => {
    if (isHR)
      return rootsOf(hierarchy).reduce((s, r) => s + node(r).utilised, 0);
    const nd = node(currentUser.name);
    return nd ? nd.utilised : 0;
  }, [isHR, hierarchy, node, currentUser]);

  const teamSize = useMemo(() => {
    if (isHR) return rootsOf(hierarchy).reduce((s, r) => s + node(r).team, 0);
    const nd = node(currentUser.name);
    return nd ? nd.team : 0;
  }, [isHR, hierarchy, node, currentUser]);

  const pct = b.updated ? (utilised / b.updated) * 100 : 0;
  const color = pct > 100 ? "#cf1322" : pct > 90 ? "#d46b08" : "#2f6db5";

  const allChanges = useMemo(
    () => buildChangeLog(eligibilityEvents, gridSupervisorChanges),
    [eligibilityEvents, gridSupervisorChanges],
  );

  const myChanges = useMemo(() => {
    if (isHR) return allChanges;
    const tree = subtreeOf(hierarchy, currentUser.name);
    return allChanges.filter((c) => tree.indexOf(c.manager) > -1);
  }, [allChanges, isHR, hierarchy, currentUser]);

  const initialTeamSize = isHR
    ? Object.values(allocationSnapshot.teams || {}).reduce(
        (s, t) => s + t.length,
        0,
      )
    : (
        (allocationSnapshot.teams &&
          allocationSnapshot.teams[currentUser.name]) ||
        []
      ).length;

  if (budgetRows.length === 0 || Object.keys(hierarchy).length === 0) {
    return (
      <aside
        className="flex w-[280px] flex-shrink-0 flex-col border-l border-[#d4dbe5] bg-white"
        aria-label="Team insights"
      >
        <div
          className="flex h-9 items-center px-3 text-sm font-bold text-white"
          style={{ background: NAVY }}
        >
          Team insights
        </div>
        <p className="px-3 py-4 text-xs text-slate-500">
          Budget and team data is not configured for this cycle.
        </p>
      </aside>
    );
  }

  if (!open) {
    return (
      <aside
        className="flex w-10 flex-shrink-0 flex-col items-center gap-3 border-l border-[#d4dbe5] bg-white pt-2"
        aria-label="Team insights (collapsed)"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-6 w-6 rounded text-xs font-bold text-white"
          style={{ background: NAVY }}
          aria-label="Expand team insights"
        >
          ‹
        </button>
        <div className="text-[11px] font-bold" style={{ color: NAVY }}>
          {pct.toFixed(0)}%
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-[280px] flex-shrink-0 flex-col border-l border-[#d4dbe5] bg-white"
      aria-label="Team insights"
    >
      <div
        className="flex h-9 items-center justify-between px-3 text-sm font-bold text-white"
        style={{ background: NAVY }}
      >
        Team insights
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-6 w-6 rounded"
          style={{ background: "#24497a" }}
          aria-label="Collapse team insights"
        >
          ›
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-auto p-2">
        <div className="text-[11px] text-slate-500">
          {isHR ? "All teams" : `${currentUser.name}'s team`}
        </div>

        <div className="rounded border border-[#e1e5eb]">
          <button
            type="button"
            onClick={() => setBudgetOpen((v) => !v)}
            className="flex w-full items-center justify-between bg-[#f5f7fa] px-2 py-1.5 text-xs font-bold text-[#1e3a5f]"
          >
            <span>{budgetOpen ? "▾" : "▸"} Budget</span>
            <span className="text-[11px] font-bold text-slate-500">
              {pct.toFixed(0)}% utilised
            </span>
          </button>

          {budgetOpen && (
            <div className="flex flex-col gap-2 border-t border-[#e1e5eb] p-2">
              <div className="rounded border border-[#e1e5eb] p-2">
                <div className="text-[11px] text-slate-500">Updated budget</div>
                <div className="text-[19px] font-bold" style={{ color: NAVY }}>
                  {fmtLakh(b.updated)}
                </div>
                <div className="text-[11px] text-slate-500">
                  Initially allocated {fmtLakh(b.initial)}
                </div>
              </div>

              <div className="rounded border border-[#e1e5eb] p-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-500">
                    Budget utilised
                  </span>
                  <span className="text-[16px] font-bold" style={{ color }}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#eef1f5]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: color,
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] font-bold">
                  <span className="text-slate-600">
                    {fmtLakh(utilised)} utilised
                  </span>
                  <span
                    style={{
                      color: b.updated - utilised < 0 ? "#c2410c" : "#13804a",
                    }}
                  >
                    {fmtLakh(b.updated - utilised)} remaining
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded border border-[#eef1f5] bg-[#fafbfd] p-1.5">
                  <div className="text-[11px] text-slate-500">
                    Initial team size
                  </div>
                  <div className="text-sm font-bold" style={{ color: NAVY }}>
                    {initialTeamSize}
                  </div>
                </div>
                <div className="rounded border border-[#eef1f5] bg-[#fafbfd] p-1.5">
                  <div className="text-[11px] text-slate-500">
                    Current team size
                  </div>
                  <div className="text-sm font-bold" style={{ color: NAVY }}>
                    {teamSize}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-[11.5px] font-bold text-slate-700">
                  Team changes ({myChanges.length})
                </div>
                {myChanges.length === 0 ? (
                  <div className="text-[11px] text-slate-500">
                    No changes since allocation.
                  </div>
                ) : (
                  myChanges.slice(0, 4).map((c, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[92px_1fr] items-start gap-1 text-[11px]"
                    >
                      <span
                        className={`justify-self-start rounded-full px-2 py-[1px] font-bold ${PILL_CLASS[c.type]}`}
                      >
                        {TYPE_LABEL[c.type]}
                      </span>
                      <span>
                        {c.name}
                        <span className="text-slate-500">
                          {" "}
                          {c.type === "in"
                            ? `from ${c.from}`
                            : c.type === "out"
                              ? `to ${c.to}`
                              : ""}{" "}
                          · {dateText(c.date)}
                        </span>
                      </span>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={onViewChanges}
                  className="text-left text-[11.5px] font-bold text-[#1859a8]"
                >
                  View all changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
