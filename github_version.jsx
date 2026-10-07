import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppraisal } from "@/lib/appraisal-store";
import {
  NEW_TITLES,
  INSTALLMENT_OPTIONS,
  inr,
  totalOfPB,
  totalBonus as calcTotalBonus,
  newBaseSalary,
  totalCTCWithRewards,
} from "@/lib/appraisal-data";
import { useBudget } from "@/lib/budget-store";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";
const APPRAISAL_HISTORY_API_URL = catalystFunctionUrl("appraisalhistoryapi");
const NAVY = "#12304f";
const TEAL = "#14a3a3";
/* Ledger look: Manrope. Load it once in index.html:
   <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"> */
const FONT = '"Manrope", "Segoe UI", system-ui, Arial, sans-serif';
/* Ledger tokens used by the left pane */
const INK = "#102A43";
const LTEAL = "#0B7A75";
const LINE = "#E3E9EC";
const SOFT = "#EEF3F3";
const MUTED = "#5F7482";
const CURRENT_CYCLE = "Apr-26";
/* ------------------------------------------------------------------
   FRONTEND-ONLY SETTINGS (layout / banner). None of these touch data.
   ------------------------------------------------------------------ */
// Where "View budget" goes when no onViewBudget prop is passed.
// Prefer passing onViewBudget={() => navigate("/your-route")}.
const BUDGET_PATH = "https://excel-appraisal-syst-iqjipxdl.onslate.in/employee-master?tab=budget-distribution";
// Placeholder text for the "Budget changed" banner until real budget
// figures are wired in. Pass budgetNotice={{ from, to, changes, since }}
// to override, or budgetNotice={null} to hide the banner message.
const BUDGET_NOTICE_PLACEHOLDER = {
  from: "₹ 10.41 L",
  to: "₹ 9.79 L",
  changes: 5,
  since: "01-Sep-26",
};
// Fields the screen can edit; used only to paint the "Edited this cycle" green.
const EDIT_FIELDS = [
  "hikeAmount",
  "newRB",
  "allocatedPBAmount",
  "pbInstallment",
  "targetPBNextYear",
  "targetPBCriteria",
  "newTitle",
  "atRisk",
];
const DS_CSS = `
.ds-root{display:flex;flex-direction:column;min-height:100%}
.ds-main{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:10px 12px 0;align-items:stretch}
@media (min-width:1000px){.ds-main{grid-template-columns:var(--ds-cols)}}
.ds-side{position:relative;min-height:360px}
.ds-side>.ds-card{position:absolute;top:0;right:0;bottom:0;left:0}
.ds-card{display:flex;flex-direction:column;background:#fff;border:1px solid #E3E9EC;border-radius:10px;box-shadow:0 1px 2px rgba(16,42,67,.04);overflow:hidden;min-width:0}
.ds-hist{flex:0 0 auto;margin:10px 12px 12px;max-height:60vh}
.ds-scroll{scrollbar-width:thin;scrollbar-color:#C4CED6 transparent}
.ds-mq{flex:1;min-width:0;overflow:hidden}
.ds-track{display:inline-block;white-space:nowrap;animation:ds-slide 22s linear infinite}
.ds-mq:hover .ds-track{animation-play-state:paused}
@keyframes ds-slide{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
@media (prefers-reduced-motion:reduce){.ds-track{animation:none}}
.ds-vbtn{writing-mode:vertical-rl;transform:rotate(180deg)}
.ds-root button{cursor:pointer}
.ds-root button:disabled{cursor:not-allowed}
`;
const normalizeHistoryRecord = (record) => {
  const basePay = Number(record?.base_pay) || 0;
  const hike = Number(record?.hike_amount) || 0;
  return {
    year:
      record?.appraisal_year !== null && record?.appraisal_year !== undefined
        ? String(record.appraisal_year)
        : "—",
    basePay,
    joiningBonus: Number(record?.joining_bonus) || 0,
    performanceBonus: Number(record?.performance_bonus) || 0,
    retentionBonus: Number(record?.retention_bonus) || 0,
    totalBonus: Number(record?.total_bonus) || 0,
    hikeAmount: hike,
    designation: record?.designation ? String(record.designation) : "—",
    rating: record?.rating ? String(record.rating) : "—",
    feedback: record?.manager_rating ? String(record.manager_rating) : "—",
    targetPB: Number(record?.target_performance_bonus) || 0,
    newCTC: Number(record?.new_ctc) || 0,
    newBasePay: basePay + hike,
  };
};
const HISTORY_COLUMNS = [
  { key: "basePay", label: "Curr Base Pay" },
  { key: "joiningBonus", label: "Joining Bonus" },
  { key: "performanceBonus", label: "Perf. Bonus" },
  { key: "retentionBonus", label: "Retention Bonus" },
  { key: "totalBonus", label: "Total Bonus" },
  { key: "hikeAmount", label: "Hike Amount" },
  { key: "newCTC", label: "Total CTC" },
  { key: "targetPB", label: "Target PB" },
  { key: "newBasePay", label: "New Base Pay" },
];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");
const lakhs = (n) => `${((Number(n) || 0) / 1e5).toFixed(2)} L`;
const dash = (v) => (v === null || v === undefined || v === "" ? "—" : v);
const yrs = (v) => {
  const d = dash(v);
  return d === "—" || /yr/i.test(String(d)) ? d : `${d} yrs`;
};
const pctText = (v) => {
  const d = dash(v);
  return d === "—" || /%/.test(String(d)) ? d : `${d}%`;
};
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const signedPct = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;
const isBlank = (v) => v === "" || v === null || v === undefined;
// Blank stays blank (like the grid's numeric cells); otherwise format.
const fmtOrBlank = (n) => (isBlank(n) ? "" : fmt(n));
// Parse a formatted amount; an empty input stays "" instead of 0.
const parseAmount = (raw) => {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  return cleaned === "" ? "" : Number(cleaned) || 0;
};
const blankStr = (v) => (isBlank(v) ? "" : String(v));
const normalizeYearKey = (y) =>
  String(y ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const isCurrentCycleYearKey = (year) => {
  const raw = String(year ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  return (
    raw === "2026" ||
    raw === "2026-27" ||
    raw === "fy2026" ||
    raw === "fy 2026" ||
    raw === "apr-26" ||
    raw === "apr 26" ||
    raw === "apr-2026" ||
    raw === "apr 2026" ||
    raw.includes("2026")
  );
};
const isBlankRecord = (h) =>
  h.designation === "—" &&
  h.rating === "—" &&
  h.feedback === "—" &&
  !h.basePay &&
  !h.totalBonus &&
  !h.newCTC &&
  !h.hikeAmount;
// Same formulas the history grid already used for prior cycles.
const priorVals = (h) => {
  const tb = (h.performanceBonus || 0) + (h.retentionBonus || 0);
  return [
    h.basePay,
    h.joiningBonus,
    h.performanceBonus,
    h.retentionBonus,
    tb,
    h.hikeAmount,
    (h.newBasePay || 0) + tb,
    h.targetPB,
    h.newBasePay,
  ];
};
// Shared look for editable controls; green when changed this cycle.
const editableStyle = {
  borderColor: "#D1D5DB",
  background: "#fff",
  color: "#102A43",
};
const editedStyle = {
  borderColor: "#4FA38F",
  background: "#E3F4EF",
  color: "#0B4F46",
  fontWeight: 700,
};
const fieldStyle = (edited) => (edited ? editedStyle : editableStyle);
const COMP_COLS = "minmax(120px,0.9fr) minmax(0,1fr) minmax(0,1.05fr) minmax(92px,0.6fr)";
export function DetailScreenPage({
  onViewBudget,
  budgetNotice = BUDGET_NOTICE_PLACEHOLDER,
} = {}) {
  const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();
  const { currentUser, isHR } = useBudget();
  const catalystUser = useCatalystUser();
  const role = String(catalystUser?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  // The backend already scopes rows to what this login may see, so no
  // extra client-side narrowing by comp manager name here.
  const rows = liveRows || [];
  const isScopedToTeam = isTechEd || rows.length > 0;
  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [historyByEmpId, setHistoryByEmpId] = useState({});
  const historyPromiseRef = useRef(new Map());
  // Layout-only state (no effect on data)
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(true);
  const [cardWide, setCardWide] = useState(false);
  const [fbTab, setFbTab] = useState("manager");
  const baselineRef = useRef({});
  useEffect(() => {
    setIndex(0);
    setSearch("");
  }, [currentUser.name]);
  const employee = rows[Math.min(index, rows.length - 1)] || rows[0];
  // Remember each employee's values when first shown, so edits can be highlighted.
  if (employee && !baselineRef.current[employee.id]) {
    const snap = {};
    EDIT_FIELDS.forEach((f) => {
      snap[f] = employee[f];
    });
    baselineRef.current[employee.id] = snap;
  }
  const isEdited = (field) => {
    if (!employee) return false;
    const base = baselineRef.current[employee.id];
    if (!base) return false;
    return blankStr(base[field]) !== blankStr(employee[field]);
  };
  const loadHistory = useCallback(
    (empId) => {
      const key = String(empId || "").trim();
      if (!key) {
        return Promise.resolve([]);
      }
      const existing = historyPromiseRef.current.get(key);
      if (existing) {
        return existing;
      }
      setHistoryByEmpId((prev) => ({
        ...prev,
        [key]: { loading: true, data: [], error: "" },
      }));
      const promise = (async () => {
        const response = await catalystFetch(
          `${APPRAISAL_HISTORY_API_URL}?emp_id=${encodeURIComponent(key)}`,
        );
        if (!response.ok) {
          throw new Error(`History request failed (${response.status}).`);
        }
        const result = await response.json();
        if (!result?.success) {
          throw new Error(result?.message || "Failed to load history.");
        }
        const records = Array.isArray(result?.data) ? result.data : [];
        return records
          .map(normalizeHistoryRecord)
          .sort((a, b) => String(b.year).localeCompare(String(a.year)));
      })();
      historyPromiseRef.current.set(key, promise);
      promise
        .then((data) => {
          setHistoryByEmpId((prev) => ({
            ...prev,
            [key]: { loading: false, data, error: "" },
          }));
        })
        .catch((error) => {
          historyPromiseRef.current.delete(key);
          setHistoryByEmpId((prev) => ({
            ...prev,
            [key]: {
              loading: false,
              data: [],
              error: error?.message || "Unable to load history.",
            },
          }));
        });
      return promise;
    },
    [],
  );
  useEffect(() => {
    if (employee?.empId) {
      loadHistory(employee.empId).catch(() => {});
    }
  }, [employee?.empId, loadHistory]);
  const empKey = employee ? String(employee.empId || "").trim() : "";
  const historyState = historyByEmpId[empKey];
  const historyRecords = historyState?.data || [];
  const priorCycles = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const record of historyRecords) {
      if (isCurrentCycleYearKey(record.year)) continue;
      if (isBlankRecord(record)) continue;
      const yearKey = normalizeYearKey(record.year);
      if (!yearKey || seen.has(yearKey)) continue;
      seen.add(yearKey);
      result.push(record);
    }
    return result;
  }, [historyRecords]);
  const derived = useMemo(() => {
    if (!employee) return null;
    return {
      totalPB: totalOfPB(employee),
      bonus: calcTotalBonus(employee),
      newBase: newBaseSalary(employee),
      totalCtc: totalCTCWithRewards(employee),
    };
  }, [employee]);
  const handleSearch = (value) => {
    setSearch(value);
    const q = value.trim().toLowerCase();
    if (!q) return;
    const found = rows.findIndex(
      (row) =>
        String(row.name || "")
          .toLowerCase()
          .startsWith(q) || String(row.empId || "").toLowerCase() === q,
    );
    if (found > -1) setIndex(found);
  };
  const commit = (field, value) => {
    const current = isBlank(employee[field]) ? "" : String(employee[field]);
    if (current === (isBlank(value) ? "" : String(value))) return;
    updateCell(employee.id, field, value, "Detail screen edit");
  };
  const commitLinked = (fields) => {
    updateLinkedCells(employee.id, fields, "Detail screen edit");
  };
  const handleNewBasePayChange = (raw) => {
    const value = parseAmount(raw);
    // Cleared input clears the hike (same as the grid's blank hike cells).
    if (value === "") {
      if (!isBlank(employee.hikeAmount) || !isBlank(employee.hikePct)) {
        commitLinked({ hikeAmount: "", hikePct: "" });
      }
      return;
    }
    if (value === derived.newBase) return;
    const hike = value - (Number(employee.currentAnnualBasePay) || 0);
    const pct = employee.currentAnnualBasePay
      ? Number(((hike / employee.currentAnnualBasePay) * 100).toFixed(1))
      : 0;
    commitLinked({ hikeAmount: hike, hikePct: pct });
  };
  const handleNewTitleChange = (value) => {
    const changed = value !== employee.designation;
    // Same rule as the grid: promotion "No" clears New Title.
    commitLinked(
      changed
        ? { newTitle: value, eligibleForPromotion: "Yes" }
        : { eligibleForPromotion: "No", newTitle: null },
    );
  };
  const hikeValue = Number(employee?.hikeAmount) || 0;
  const scopeLabel = isHR
    ? "All employees"
    : isScopedToTeam
      ? `${currentUser.name}'s team`
      : "No assigned team";
  const handleViewBudget = () => {
    if (!isTechEd) return;
    if (typeof onViewBudget === "function") onViewBudget();
    else window.history.pushState({}, "", "/request");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const cols = [
    "minmax(0,1.7fr)",
    metricsOpen ? "minmax(0,1fr)" : "34px",
    cardOpen ? (cardWide ? "minmax(0,1.6fr)" : "minmax(0,1.05fr)") : "34px",
  ].join(" ");
  return (
    <div
      className="ds-root"
      style={{
        fontFamily: FONT,
        background: "#F4F7F7",
        color: "#1F2F3D",
        fontSize: "13px",
      }}
    >
      <style>{DS_CSS}</style>
      <BudgetBanner
        notice={isTechEd && noticeOpen ? budgetNotice : null}
        onGotIt={() => setNoticeOpen(false)}
        onViewBudget={handleViewBudget}
        isTechEd={isTechEd}
      />
      {!employee ? (
        <div className="p-6 text-sm text-slate-500">
          No employees are visible for this login.
        </div>
      ) : (
        <>
          <div className="ds-main" style={{ "--ds-cols": cols }}>
            {/* LEFT — Compensation input */}
            <section className="ds-card" aria-label="Compensation input">
              <div
                className="flex shrink-0 items-center justify-between gap-3 border-b px-3.5 py-2.5"
                style={{ borderColor: NAVY, background: NAVY }}
              >
                <div
                  className="min-w-0 flex-1 text-[12.5px] leading-snug"
                  style={{ color: "#fff" }}
                >
                  <div className="truncate">
                    <b
                      className="text-[15px]"
                      style={{ color: "#fff", letterSpacing: "-.01em" }}
                    >
                      {employee.name}
                    </b>{" "}
                    ·{" "}
                    <span className="font-bold" style={{ color: "#7CE0C3" }}>
                      {employee.empId ?? "—"}
                    </span>{" "}
                    · {dash(employee.designation)}
                    {employee.band ? ` · ${employee.band}` : ""}
                  </div>
                  <div className="truncate" style={{ color: "#BCCCDC" }}>
                    {yrs(employee.totalExperience)} ·{" "}
                    {yrs(employee.wissenExperience)} here · Reports to{" "}
                    {dash(employee.reportingManager)}
                  </div>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold"
                  style={{ color: "#D6E0EC" }}
                >
                  <i
                    className="inline-block h-[11px] w-[11px] rounded-[3px] border"
                    style={{ background: "#E3F4EF", borderColor: "#4FA38F" }}
                  />
                  Edited this cycle
                </span>
              </div>
              <div
                className="flex shrink-0 items-center gap-2 border-b px-3.5 py-2"
                style={{ borderColor: LINE }}
              >
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search your team by name or employee ID"
                  aria-label="Search your team"
                  className="h-[30px] flex-1 rounded border px-2.5 text-[12.5px] outline-none focus:border-[#0B7A75]"
                  style={{ borderColor: "#9AA7B4" }}
                />
                <span
                  title={`Scope: ${scopeLabel}`}
                  className="whitespace-nowrap rounded px-2.5 py-1 text-[11.5px] font-semibold"
                  style={{ background: "#E6F3F2", color: "#0B5F5B" }}
                >
                  {rows.length}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <div
                  className="grid text-[12.5px]"
                  style={{ gridTemplateColumns: COMP_COLS }}
                >
                  <CompHead>Description</CompHead>
                  <CompHead>Current</CompHead>
                  <CompHead>Proposed</CompHead>
                  <CompHead right>Diff</CompHead>
                  <CompRow
                    label="Base Pay"
                    current={inr(employee.currentAnnualBasePay)}
                    diff={`${hikeValue > 0 ? "+" : ""}${fmt(hikeValue)} / ${(Number(employee.hikePct) || 0).toFixed(1)}%`}
                    diffPositive={hikeValue > 0}
                  >
                    <EditInput
                      key={`${employee.id}-newBase`}
                      defaultValue={fmt(derived.newBase)}
                      edited={isEdited("hikeAmount")}
                      onCommit={handleNewBasePayChange}
                    />
                  </CompRow>
                  <CompRow
                    label="Joining Bonus"
                    current="0"
                    diffText="n/a this cycle"
                    muted
                  >
                    <ReadOnlyInput value="0" disabled />
                  </CompRow>
                  <CompRow
                    label="Retention Bonus"
                    current={inr(employee.newRB ?? 0)}
                    diffText="—"
                  >
                    <EditInput
                      key={`${employee.id}-newRB`}
                      defaultValue={fmt(employee.newRB ?? 0)}
                      edited={isEdited("newRB")}
                      onCommit={(v) =>
                        commit(
                          "newRB",
                          Number(String(v).replace(/[^0-9.]/g, "")) || 0,
                        )
                      }
                    />
                  </CompRow>
                  <CompRow
                    label="PB Allotted / Instalments"
                    current={`${inr(employee.targetPBAllocatedForMay)} / ${employee.pbInstallment ?? "—"}`}
                    diffText="—"
                  >
                    <div className="flex w-full items-center gap-1.5">
                      <EditInput
                        key={`${employee.id}-allocatedPBAmount`}
                        className="flex-1"
                        defaultValue={fmtOrBlank(employee.allocatedPBAmount)}
                        edited={isEdited("allocatedPBAmount")}
                        onCommit={(v) =>
                          commit("allocatedPBAmount", parseAmount(v))
                        }
                      />
                      <select
                        key={`${employee.id}-pbInstallment`}
                        value={
                          isBlank(employee.pbInstallment)
                            ? ""
                            : String(employee.pbInstallment)
                        }
                        onChange={(e) =>
                          commit("pbInstallment", e.target.value)
                        }
                        className="h-[28px] w-[54px] shrink-0 rounded border px-1.5 text-[12px] outline-none focus:border-[#0B7A75]"
                        style={fieldStyle(isEdited("pbInstallment"))}
                      >
                        <option value="">—</option>
                        {INSTALLMENT_OPTIONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  </CompRow>
                  <CompRow
                    label="Target PB"
                    current={fmt(employee.targetPBAllocatedForMay)}
                    diffText="next yr"
                  >
                    <EditInput
                      key={`${employee.id}-targetPBNextYear`}
                      defaultValue={fmtOrBlank(employee.targetPBNextYear)}
                      edited={isEdited("targetPBNextYear")}
                      onCommit={(v) =>
                        commit("targetPBNextYear", parseAmount(v))
                      }
                    />
                  </CompRow>
                  <CompFullRow label="Target PB Criteria">
                    <textarea
                      key={`criteria-current-${employee.id}`}
                      defaultValue={
                        employee.targetPBCriteria ||
                        "Client billability >= 85% for Q1-Q3"
                      }
                      rows={2}
                      readOnly
                      aria-label="Current target PB criteria"
                      className="h-[46px] w-full resize-none rounded border px-2 py-1.5 text-[12px] leading-[1.3] outline-none"
                      style={{
                        borderColor: "#C9D1DA",
                        background: "#F1F3F6",
                        color: "#374151",
                      }}
                    />
                    <EditTextarea
                      key={`${employee.id}-targetPBCriteria`}
                      defaultValue={
                        employee.newTargetPBCriteria ||
                        employee.targetPBCriteria ||
                        ""
                      }
                      edited={isEdited("targetPBCriteria")}
                      onCommit={(v) => commit("targetPBCriteria", v)}
                    />
                  </CompFullRow>
                  <CompRow
                    label="Designation"
                    current={dash(employee.designation)}
                    diff={employee.eligibleForPromotion}
                    diffPositive={employee.eligibleForPromotion === "Yes"}
                  >
                    <select
                      key={`${employee.id}-newTitle`}
                      value={employee.newTitle || employee.designation || ""}
                      onChange={(e) => handleNewTitleChange(e.target.value)}
                      className="h-[28px] w-full rounded border px-1.5 text-[12px] outline-none focus:border-[#0B7A75]"
                      style={fieldStyle(isEdited("newTitle"))}
                    >
                      {NEW_TITLES.includes(employee.designation) ? null : (
                        <option>{employee.designation}</option>
                      )}
                      {NEW_TITLES.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </CompRow>
                  <CompFullRow label="Comp Manager Remarks" last>
                    <div
                      className="h-[46px] w-full overflow-auto rounded border px-2 py-1.5 text-[12px] leading-[1.3]"
                      style={{
                        borderColor: "#C9D1DA",
                        background: "#F1F3F6",
                        color: employee.prevRemarks ? "#374151" : "#9AA7B4",
                      }}
                    >
                      {employee.prevRemarks || "No remarks last cycle"}
                    </div>
                    <EditTextarea
                      key={`${employee.id}-atRisk`}
                      defaultValue={employee.atRisk || ""}
                      placeholder="Add remarks"
                      edited={isEdited("atRisk")}
                      onCommit={(v) => commit("atRisk", v)}
                    />
                  </CompFullRow>
                </div>
              </div>
              <div
                className="flex shrink-0 flex-wrap gap-3.5 border-t px-3.5 py-1.5 text-[11px]"
                style={{ color: MUTED, borderColor: LINE }}
              >
                <Legend sw="#F1F3F6" border="#C9D1DA" label="Current (read-only)" />
                <Legend sw="#fff" border="#D1D5DB" label="Proposed (editable)" />
                <Legend sw="#E3F4EF" border="#4FA38F" label="Edited this cycle" />
              </div>
              <div
                className="flex shrink-0 items-center justify-between gap-3 border-t px-3.5 py-2.5"
                style={{ borderColor: LINE }}
              >
                <div className="text-[12.5px]" style={{ color: "#334155" }}>
                  <b style={{ color: INK }}>{index + 1}</b> of {rows.length} ·{" "}
                  {scopeLabel}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    disabled={index === 0}
                    title="Previous and Next move only within the employees this login can see."
                    className="h-[34px] rounded-[7px] border px-4 text-[13px] font-bold disabled:opacity-45"
                    style={{
                      borderColor: "#CBD5DA",
                      background: "#fff",
                      color: INK,
                    }}
                  >
                    ‹ Previous
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIndex((i) => Math.min(rows.length - 1, i + 1))
                    }
                    title="Previous and Next move only within the employees this login can see."
                    className="h-[34px] rounded-[7px] px-4 text-[13px] font-bold"
                    style={{ background: INK, color: "#fff" }}
                  >
                    {index === rows.length - 1 ? "Save" : "Save & next ›"}
                  </button>
                </div>
              </div>
            </section>
            {/* MIDDLE — Metrics (frontend placeholder for now) */}
            {metricsOpen ? (
              <section
                aria-label="Metrics"
                className="relative flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center text-[12.5px]"
                style={{
                  borderColor: "#CBD2E0",
                  background: "#FAFBFD",
                  color: "#6B7280",
                }}
              >
                <button
                  type="button"
                  onClick={() => setMetricsOpen(false)}
                  title="Fold metrics"
                  className="absolute right-2 top-2 rounded border px-2 py-[3px] text-[12px]"
                  style={{
                    borderColor: "#D1D5DB",
                    background: "#fff",
                    color: "#374151",
                  }}
                >
                  ‹ Fold
                </button>
                <b className="text-[14px]" style={{ color: INK }}>
                  Metrics
                </b>
                <div>Placeholder</div>
                <div>Team and org metrics open as separate screens.</div>
              </section>
            ) : (
              <button
                type="button"
                onClick={() => setMetricsOpen(true)}
                title="Open metrics"
                aria-expanded="false"
                className="flex justify-center rounded-xl border pt-3.5"
                style={{ borderColor: "#E5E7EB", background: "#fff" }}
              >
                <span
                  className="ds-vbtn text-[12.5px] font-bold"
                  style={{ color: INK, letterSpacing: ".02em" }}
                >
                  Metrics ›
                </span>
              </button>
            )}
            {/* RIGHT — Employee card + feedback */}
            {cardOpen ? (
              <div className="ds-side">
                <EmployeeCard
                  employee={employee}
                  priorCycles={priorCycles}
                  loading={!!historyState?.loading}
                  tab={fbTab}
                  onTab={setFbTab}
                  wide={cardWide}
                  onToggleWide={() => setCardWide((w) => !w)}
                  onClose={() => setCardOpen(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCardOpen(true)}
                title="Open employee details"
                aria-expanded="false"
                className="flex justify-center rounded-xl border pt-3.5"
                style={{ borderColor: "#E5E7EB", background: "#fff" }}
              >
                <span
                  className="ds-vbtn text-[12.5px] font-bold"
                  style={{ color: INK, letterSpacing: ".02em" }}
                >
                  Employee ›
                </span>
              </button>
            )}
          </div>
          {/* Employee History — fixed-height strip, scrolls inside */}
          <section
            className="ds-card ds-hist"
            aria-label="Employee history"
            style={{ borderColor: "#d3dbe6" }}
          >
            <div
              className="shrink-0 px-3.5 py-1.5 text-left text-[12.5px]"
              style={{
                background: NAVY,
                color: "#fff",
                fontWeight: 600,
                letterSpacing: ".15px",
              }}
            >
              Employee History — {employee.name} · {priorCycles.length + 1}{" "}
              cycles
              {historyState?.loading ? " · loading…" : ""}
            </div>
            <div className="ds-scroll min-h-0 flex-1 overflow-auto">
              <table
                className="w-full border-collapse text-[11.5px]"
                style={{ minWidth: 860 }}
              >
                <thead>
                  <tr>
                    <HistHead width="86px">Year</HistHead>
                    {HISTORY_COLUMNS.map((c) => (
                      <HistHead key={c.key}>{c.label}</HistHead>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <HistRow
                    year="Apr-26 ★"
                    vals={[
                      employee.currentAnnualBasePay,
                      0,
                      derived.totalPB,
                      employee.newRB,
                      derived.bonus,
                      employee.hikeAmount,
                      derived.totalCtc,
                      employee.targetPBNextYear,
                      derived.newBase,
                    ]}
                    prev={priorCycles[0] ? priorVals(priorCycles[0]) : undefined}
                    current
                  />
                  {priorCycles.map((h, i) => (
                    <HistRow
                      key={h.year ?? i}
                      year={h.year}
                      vals={priorVals(h)}
                      prev={
                        priorCycles[i + 1]
                          ? priorVals(priorCycles[i + 1])
                          : undefined
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className="flex shrink-0 flex-wrap gap-3.5 border-t px-3.5 py-1 text-[10.5px]"
              style={{ color: MUTED, borderColor: "#EEF1F5" }}
            >
              <Legend sw="#fff9dc" border="#E8D89A" label="This cycle (not yet final)" />
              <Legend sw="#1F8A3B" border="#1F8A3B" label="Increase vs previous cycle" />
              <Legend sw="#C0392B" border="#C0392B" label="Decrease" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
/* ============================================================
   BUDGET BANNER — scrolls right to left, pauses on hover
   ============================================================ */
function BudgetBanner({ notice, onGotIt, onViewBudget, isTechEd }) {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b px-4 py-1.5"
      style={{ background: "#fff", borderColor: LINE, minHeight: 38 }}
    >
      {notice ? (
        <>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-bold"
            style={{ color: INK }}
          >
            <span style={{ color: "#D0473F" }}>▲</span> Budget changed
          </span>
          <div className="ds-mq" title="Hover to pause">
            <span className="ds-track text-[13px]" style={{ color: "#334155" }}>
              Be aware: your team budget has changed from {notice.from} to{" "}
              {notice.to} — {notice.changes} team change
              {notice.changes === 1 ? "" : "s"} since allocation on{" "}
              {notice.since}.
            </span>
          </div>
        </>
      ) : (
        <div className="flex-1" />
      )}
      {isTechEd && (
        <button
          type="button"
          onClick={onViewBudget}
          className="h-[28px] shrink-0 rounded-[6px] border px-3 text-[12px] font-bold"
          style={{ borderColor: "#CBD5E1", background: "#fff", color: INK }}
        >
          Request
        </button>
      )}
      {notice && (
        <button
          type="button"
          onClick={onGotIt}
          className="h-[28px] shrink-0 rounded-[6px] border px-3 text-[12px] font-bold"
          style={{ background: "#EEF0F3", borderColor: "#E2E5EA", color: INK }}
        >
          Got it
        </button>
      )}
    </div>
  );
}
/* ============================================================
   EMPLOYEE CARD (right) — who they are + Feedback
   ============================================================ */
function EmployeeCard({
  employee,
  priorCycles,
  loading,
  tab,
  onTab,
  wide,
  onToggleWide,
  onClose,
}) {
  const items = [
    {
      year: CURRENT_CYCLE,
      current: true,
      designation: employee.designation,
      client: employee.clientRating,
      rr: employee.rrPercent,
      ic: employee.interviewCount,
      rating: employee.managerRating,
      promo: employee.eligibleForPromotion,
      feedback:
        employee.feedback ||
        employee.atRisk ||
        "Feedback captured during the review.",
    },
    ...priorCycles.map((h) => ({
      year: h.year,
      designation: h.designation,
      client: h.clientRating,
      rr: h.rrPercent,
      ic: h.interviewCount,
      rating: h.rating,
      feedback: h.feedback,
    })),
  ];
  const tabs = [
    ["manager", "Manager"],
    ["client", "Client"],
    ["other", "Other"],
  ];
  return (
    <section className="ds-card" aria-label="Employee">
      {/* Header: just "Feedback" and the expand / close buttons */}
      <div
        className="grid shrink-0 items-center gap-2 px-3.5 py-2"
        style={{ background: NAVY, gridTemplateColumns: "1fr auto 1fr" }}
      >
        <span />
        <span className="text-[13.5px] font-extrabold" style={{ color: "#fff" }}>
          Feedback
        </span>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onToggleWide}
            title={wide ? "Normal width" : "Expand"}
            aria-pressed={wide}
            className="h-[28px] w-[28px] shrink-0 rounded-md border text-[13px]"
          style={{
            borderColor: "rgba(255,255,255,.35)",
            background: "rgba(255,255,255,.12)",
            color: "#fff",
          }}
          >
            {wide ? "⤡" : "⤢"}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close employee card"
            className="h-[28px] w-[28px] shrink-0 rounded-md border text-[13px]"
          style={{
            borderColor: "rgba(255,255,255,.35)",
            background: "rgba(255,255,255,.12)",
            color: "#fff",
          }}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 px-3.5 pb-1 pt-2.5" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => onTab(key)}
            className="rounded-full border px-3 py-[3px] text-[12px]"
            style={{
              borderColor: tab === key ? "#CBD2DA" : "#D1D5DB",
              background: tab === key ? "#EEF0F3" : "#fff",
              color: tab === key ? INK : "#374151",
              fontWeight: tab === key ? 700 : 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="ds-scroll min-h-0 flex-1 overflow-auto px-3.5 pb-3.5 pt-2"
        role="tabpanel"
      >
        {tab === "other" ? (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["Cycle", "RR %", "IC (interviews)"].map((h) => (
                  <th
                    key={h}
                    className="border-b px-1.5 py-1 text-left text-[11px] font-bold"
                    style={{ borderColor: "#CBD5DA", color: MUTED }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((x, i) => (
                <tr
                  key={`${x.year}-${i}`}
                  style={{ background: x.current ? "#F2FAF9" : undefined }}
                >
                  <td
                    className="border-b px-1.5 py-1.5 font-bold"
                    style={{ borderColor: SOFT, color: INK }}
                  >
                    {x.year}
                    {x.current ? " ★" : ""}
                  </td>
                  <td className="border-b px-1.5 py-1.5" style={{ borderColor: SOFT }}>
                    {pctText(x.rr)}
                  </td>
                  <td className="border-b px-1.5 py-1.5" style={{ borderColor: SOFT }}>
                    {dash(x.ic)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ol
            className="m-0 list-none border-l-2 py-0 pl-3.5 pr-0"
            style={{ borderColor: SOFT }}
          >
            {items.map((x, i) => (
              <li key={`${x.year}-${i}`} className="relative pb-3.5 pl-1">
                <span
                  aria-hidden="true"
                  className="absolute top-1 h-2.5 w-2.5 rounded-full border-2"
                  style={{
                    left: -21,
                    background: x.current ? LTEAL : "#fff",
                    borderColor: x.current ? LTEAL : "#CBD5DA",
                  }}
                />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <b className="text-[13px]" style={{ color: INK }}>
                    {x.year}
                  </b>
                  {x.current && (
                    <span
                      className="rounded-md border px-[7px] py-px text-[11px] font-bold"
                      style={{ background: "#F3F4F6", borderColor: "#E2E5EA", color: INK }}
                    >
                      This cycle
                    </span>
                  )}
                </div>
                <div className="text-[12px]" style={{ color: MUTED }}>
                  {dash(x.designation)}
                </div>
                {tab === "manager" ? (
                  <>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Chip>
                        Manager rating <b>{dash(x.rating)}</b>
                      </Chip>
                      {x.current && x.promo && (
                        <Chip good={x.promo === "Yes"}>
                          Eligible for promotion: {x.promo}
                        </Chip>
                      )}
                    </div>
                    <p
                      className="m-0 mt-[5px] text-[12.5px] leading-normal"
                      style={{ color: "#334E5C" }}
                    >
                      {dash(x.feedback)}
                    </p>
                  </>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Chip>
                      Client rating <b>{dash(x.client)}</b>
                    </Chip>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {!priorCycles.length && (
          <div className="text-[12px]" style={{ color: "#9AACB6" }}>
            {loading ? "Loading..." : "No prior cycles."}
          </div>
        )}
        <div className="mt-2.5 text-[11.5px]" style={{ color: MUTED }}>
          Client rating and past RR % are not in the sheet yet, so they show
          “—”.
        </div>
      </div>
    </section>
  );
}
function Chip({ children, good }) {
  return (
    <span
      className="rounded-md border px-1.5 py-px text-[11.5px]"
      style={{
        background: good ? "#ECFDF3" : "#F7F8FA",
        borderColor: good ? "#B7E4C7" : "#E3E9EC",
        color: good ? "#166534" : "#334E5C",
        fontWeight: good ? 700 : 500,
      }}
    >
      {children}
    </span>
  );
}
function BarRow({ label, pct, sub }) {
  const over = pct > 100;
  return (
    <>
      <div
        className="flex items-baseline justify-between gap-1.5 text-[12px]"
        style={{ color: "#334E5C" }}
      >
        <span>{label}</span>
        <b
          className="text-[15px]"
          style={{ color: over ? "#C0392B" : LTEAL }}
        >
          {pct.toFixed(0)}%
        </b>
      </div>
      <div
        className="my-1.5 h-1.5 overflow-hidden rounded-[3px]"
        style={{ background: SOFT }}
      >
        <div
          className="h-1.5"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: over ? "#C0392B" : LTEAL,
          }}
        />
      </div>
      <div className="text-[11px]" style={{ color: MUTED }}>
        {sub}
      </div>
    </>
  );
}
function MetricBox({ title, tag, children }) {
  return (
    <div
      className="mt-2 rounded-lg border px-[11px] py-2"
      style={{ borderColor: LINE }}
    >
      <div
        className="flex justify-between gap-1.5 text-[11px]"
        style={{ color: MUTED }}
      >
        <span>{title}</span>
        <i
          className="whitespace-nowrap rounded-[3px] px-1 text-[9.5px] not-italic"
          style={{ background: "#EEF2F7" }}
        >
          {tag}
        </i>
      </div>
      {children}
    </div>
  );
}
function TeamMetrics({ employee, metrics: m, teamBudget, rowsCount, scopeLabel }) {
  const left = teamBudget - m.used;
  const leftT = teamBudget - m.used - m.tpb;
  return (
    <div>
      <div className="mb-2.5 text-[11.5px]" style={{ color: MUTED }}>
        {scopeLabel} · {CURRENT_CYCLE}
      </div>
      <div className="rounded-lg border px-[11px] py-[9px]" style={{ borderColor: LINE }}>
        {m.cur !== null ? (
          <>
            <BarRow
              label="Current consumption"
              pct={m.cur}
              sub={`${lakhs(m.used)} used · ${
                left >= 0 ? `${lakhs(left)} left` : `${lakhs(-left)} over`
              } of ${lakhs(teamBudget)}`}
            />
            <div className="h-2" />
            <BarRow
              label="Including Target PB"
              pct={m.withT}
              sub={`+${lakhs(m.tpb)} Target PB · ${
                leftT >= 0 ? `${lakhs(leftT)} left` : `${lakhs(-leftT)} over`
              }`}
            />
          </>
        ) : (
          <div className="text-[12px]" style={{ color: MUTED }}>
            Team budget is not connected yet. Used so far: {lakhs(m.used)} of
            hike, plus {lakhs(m.tpb)} Target PB.
          </div>
        )}
      </div>
      <MetricBox title="Hike % — percentile in team" tag="Metric 2">
        {m.percentile !== null ? (
          <>
            <div className="mt-0.5 text-[16px] font-bold" style={{ color: INK }}>
              {ordinal(m.percentile)}{" "}
              <span className="text-[12px] font-normal" style={{ color: MUTED }}>
                percentile · {String(employee.name).split(" ")[0]}{" "}
                {signedPct(m.mine.v)}
              </span>
            </div>
            <div
              className="relative my-1.5 h-1.5 rounded-[3px]"
              style={{ background: SOFT }}
            >
              <div
                className="absolute -top-[3px] h-3 w-[3px] rounded-[1px]"
                style={{ left: `${m.percentile}%`, background: "#B7791F" }}
              />
            </div>
            <div className="text-[11px]" style={{ color: MUTED }}>
              Highest {signedPct(m.top.v)} ({m.top.r.name}) · median{" "}
              {signedPct(m.median)}
            </div>
          </>
        ) : (
          <div className="text-[11px]" style={{ color: MUTED }}>
            Not enough people in the team yet.
          </div>
        )}
      </MetricBox>
      <MetricBox title="No hike this cycle" tag="Metric 3">
        <div className="mt-0.5 text-[16px] font-bold" style={{ color: INK }}>
          {m.noHike}{" "}
          <span className="text-[12px] font-normal" style={{ color: MUTED }}>
            of {rowsCount} employees
          </span>
        </div>
      </MetricBox>
      <MetricBox title="PB paid vs target" tag="Metric 4">
        <div className="mt-0.5 text-[16px] font-bold" style={{ color: INK }}>
          {m.pbTarget ? `${((m.pbPaid / m.pbTarget) * 100).toFixed(0)}%` : "—"}{" "}
          <span className="text-[12px] font-normal" style={{ color: MUTED }}>
            {lakhs(m.pbPaid)} of {lakhs(m.pbTarget)} target
          </span>
        </div>
      </MetricBox>
      <div className="mt-2.5 text-[11.5px]" style={{ color: MUTED }}>
        Team only; org comparisons are HR-only.
      </div>
    </div>
  );
}
/* ============================================================
   Small display primitives for the compensation grid and history
   ============================================================ */
function CompHead({ children, right }) {
  return (
    <div
      className={`flex items-center border-b border-r px-2.5 py-1.5 text-[10.5px] font-bold ${
        right ? "justify-end" : ""
      }`}
      style={{
        borderColor: "#d7dce3",
        background: "#eef2f7",
        color: "#1e3a5f",
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  );
}
function ReadBox({ children }) {
  return (
    <div
      className="flex h-[28px] w-full items-center truncate rounded border px-2 text-[12px]"
      style={{
        borderColor: "#C9D1DA",
        background: "#F1F3F6",
        color: "#374151",
      }}
    >
      {children}
    </div>
  );
}
function CompRow({
  label,
  current,
  diff,
  diffText,
  diffPositive,
  muted,
  children,
}) {
  return (
    <>
      <div
        className="flex items-center border-b border-r px-2.5 py-1.5 font-bold"
        style={{
          borderColor: "#E3E9EC",
          background: "#F8FAFB",
          color: INK,
        }}
      >
        {label}
      </div>
      <div
        className="flex items-center border-b border-r px-2.5 py-1.5"
        style={{ borderColor: "#E3E9EC" }}
      >
        <ReadBox>{current}</ReadBox>
      </div>
      <div
        className="flex items-center border-b border-r px-2.5 py-1.5"
        style={{ borderColor: "#E3E9EC", background: "#fff" }}
      >
        {children}
      </div>
      <div
        className="flex items-center justify-end border-b px-2.5 py-1.5 text-right"
        style={{
          borderColor: "#E3E9EC",
          background: "#fff",
          color: diffPositive ? "#1E7A4A" : "#9AA7B4",
          fontWeight: diffPositive ? 700 : 400,
        }}
      >
        {diff ??
          (muted ? (
            <span className="text-[11px] text-slate-400">{diffText}</span>
          ) : (
            diffText
          ))}
      </div>
    </>
  );
}
function CompFullRow({ label, children, last }) {
  return (
    <>
      <div
        className="flex items-center border-r px-2.5 py-1.5 font-bold"
        style={{
          borderColor: "#E3E9EC",
          borderBottom: last ? "0" : "1px solid #E3E9EC",
          background: "#F8FAFB",
          color: INK,
        }}
      >
        {label}
      </div>
      <div
        className="flex items-stretch border-r px-2.5 py-1.5"
        style={{
          borderColor: "#E3E9EC",
          borderBottom: last ? "0" : "1px solid #E3E9EC",
        }}
      >
        {children[0]}
      </div>
      <div
        className="flex items-stretch border-r px-2.5 py-1.5"
        style={{
          borderColor: "#E3E9EC",
          borderBottom: last ? "0" : "1px solid #E3E9EC",
          background: "#fff",
        }}
      >
        {children[1]}
      </div>
      <div
        style={{
          borderBottom: last ? "0" : "1px solid #E3E9EC",
          background: "#fff",
        }}
      />
    </>
  );
}
function EditInput({ defaultValue, onCommit, className = "", edited }) {
  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onBlur={(e) => onCommit(e.target.value)}
      className={`h-[28px] w-full min-w-0 rounded border px-2 text-[12.5px] outline-none focus:border-[#0B7A75] ${className}`}
      style={fieldStyle(edited)}
    />
  );
}
function EditTextarea({ defaultValue, placeholder, onCommit, edited }) {
  return (
    <textarea
      defaultValue={defaultValue}
      placeholder={placeholder}
      rows={2}
      onBlur={(e) => onCommit(e.target.value)}
      className="h-[46px] w-full resize-y rounded border px-2 py-1.5 text-[12px] leading-[1.3] outline-none focus:border-[#0B7A75]"
      style={fieldStyle(edited)}
    />
  );
}
function ReadOnlyInput({ value, disabled }) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      readOnly
      className="h-[28px] w-full rounded border border-dashed px-2 text-[12.5px] outline-none"
      style={{
        borderColor: "#D1D5DB",
        background: "#fff",
        color: "#9AA7B4",
      }}
    />
  );
}
function Legend({ sw, border, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        className="inline-block h-3 w-3 rounded-[3px] border"
        style={{ background: sw, borderColor: border }}
      />
      {label}
    </span>
  );
}
function HistHead({ children, width }) {
  return (
    <th
      className="sticky top-0 z-[1] break-words border-b px-2 py-1 text-center text-[10.5px] font-bold"
      style={{
        width,
        borderColor: "#d7dce3",
        background: "#eef2f7",
        color: "#1e3a5f",
        lineHeight: 1.2,
      }}
    >
      {children}
    </th>
  );
}
function Delta({ v, prev }) {
  if (prev === undefined || prev === null) return null;
  let text;
  let color = "#7B8F9B";
  if (!prev) {
    text = v ? "new" : "0.00%";
    if (v) color = "#1F8A3B";
  } else {
    const p = ((v - prev) / prev) * 100;
    if (Math.abs(p) < 0.005) {
      text = "0.00%";
    } else {
      text = `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;
      color = p < 0 ? "#C0392B" : "#1F8A3B";
    }
  }
  return (
    <small className="block text-[10px] font-semibold" style={{ color }}>
      {text}
    </small>
  );
}
function HistRow({ year, vals, prev, current }) {
  return (
    <tr style={{ background: current ? "#fff9dc" : undefined }}>
      <td
        className="border-b px-1.5 py-1 text-center font-bold"
        style={{ borderColor: "#eef1f5", color: "#1859a8", whiteSpace: "nowrap" }}
      >
        {year}
      </td>
      {vals.map((v, i) => (
        <td
          key={i}
          className="border-b px-2.5 py-1 text-right"
          style={{
            borderColor: "#eef1f5",
            whiteSpace: "nowrap",
            lineHeight: 1.25,
          }}
        >
          {fmt(v)}
          <Delta v={Number(v) || 0} prev={prev ? Number(prev[i]) || 0 : undefined} />
        </td>
      ))}
    </tr>
  );
}
 