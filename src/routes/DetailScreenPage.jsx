import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppraisal } from "@/lib/appraisal-store";
import {
  NEW_TITLES,
  INSTALLMENT_OPTIONS,
  totalOfPB,
  totalBonus as calcTotalBonus,
  newBaseSalary,
  totalCTCWithRewards,
} from "@/lib/appraisal-data";
import { useBudget } from "@/lib/budget-store";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

/* index.html: <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"> */
const HISTORY_URL = catalystFunctionUrl("appraisalhistoryapi");
const CYCLE = "Apr-26";

const n = (v) => Number(v) || 0;
const blank = (v) => v === "" || v == null;
const fmt = (v) => Math.round(n(v)).toLocaleString("en-IN");
const fmtB = (v) => (blank(v) ? "" : fmt(v));
const lakhs = (v) => `${(n(v) / 1e5).toFixed(2)} L`;
const dash = (v) => (blank(v) ? "—" : v);
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v));
const amount = (raw) => {
  const c = String(raw ?? "").replace(/[^0-9.]/g, "");
  return c === "" ? "" : Number(c) || 0;
};
const yearKey = (y) =>
  String(y ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const isCurrentYear = (y) =>
  String(y ?? "")
    .toLowerCase()
    .includes("2026");
const ordinal = (v) => {
  const s = ["th", "st", "nd", "rd"],
    r = v % 100;
  return v + (s[(r - 20) % 10] || s[r] || s[0]);
};
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y),
    m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const tone = (p) => (p > 100 ? "danger" : p > 90 ? "warn" : "ok");
const goBudget = () => {
  window.history.pushState({}, "", "/budget-allocation");
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const normalize = (r) => {
  const basePay = n(r?.base_pay),
    hike = n(r?.hike_amount);
  return {
    year: r?.appraisal_year != null ? String(r.appraisal_year) : "—",
    basePay,
    hikeAmount: hike,
    newBasePay: basePay + hike,
    joiningBonus: n(r?.joining_bonus),
    performanceBonus: n(r?.performance_bonus),
    retentionBonus: n(r?.retention_bonus),
    totalBonus: n(r?.total_bonus),
    designation: r?.designation ? String(r.designation) : "—",
    rating: r?.rating ? String(r.rating) : "—",
    feedback: r?.manager_rating ? String(r.manager_rating) : "—",
    targetPB: n(r?.target_performance_bonus),
    newCTC: n(r?.new_ctc),
  };
};
const emptyRecord = (h) =>
  h.designation === "—" &&
  h.rating === "—" &&
  h.feedback === "—" &&
  !h.basePay &&
  !h.totalBonus &&
  !h.newCTC &&
  !h.hikeAmount;

/* Adapter for useBudget(): change key names here if your store differs. null = no budget for this login. */
function readBudget(store) {
  const b = store?.myBudget ?? store?.budget ?? store?.summary ?? null;
  const allocated = Number(b?.updated ?? b?.updatedBudget ?? b?.allocated);
  if (!b || !Number.isFinite(allocated)) return null;
  const initial = Number(b.initial ?? b.original ?? b.originalBudget);
  return {
    allocated,
    initial: Number.isFinite(initial) ? initial : null,
    changes: store?.teamChanges ?? b.teamChanges ?? [],
    since: b.allocatedOn ?? store?.allocatedOn ?? "",
  };
}
/* PB / RB to be paid: appraisal sheet columns pbToBePaid, pbMonth, rbToBePaid, rbMonth */
const toBePaid = (e) => ({
  pb: n(e.pbToBePaid),
  pbMonth: e.pbMonth,
  rb: n(e.rbToBePaid),
  rbMonth: e.rbMonth,
});
const withFloor = (e) => {
  const t = toBePaid(e);
  return {
    ...e,
    newPB: blank(e.newPB) || n(e.newPB) < t.pb ? t.pb : e.newPB,
    newRB: blank(e.newRB) || n(e.newRB) < t.rb ? t.rb : e.newRB,
  };
};
const EDIT_FIELDS = [
  "hikeAmount",
  "newPB",
  "newRB",
  "pbInstallment",
  "targetPBNextYear",
  "newTitle",
  "newTargetPBCriteria",
  "atRisk",
];
const HIST_COLS = [
  ["base", "Curr Base Pay"],
  ["jb", "Joining Bonus"],
  ["pb", "Perf. Bonus"],
  ["rb", "Retention Bonus"],
  ["tb", "Total Bonus"],
  ["hike", "Hike Amount"],
  ["ctc", "Total CTC"],
  ["tpb", "Target PB"],
  ["nb", "New Base Pay"],
];

const CSS = `
.ds{min-height:100vh;background:#F4F7F7;color:#1F2F3D;font-family:"Manrope","Segoe UI",system-ui,Arial,sans-serif;font-size:13px;font-variant-numeric:tabular-nums;padding:14px 16px 24px;-webkit-font-smoothing:antialiased}
.ds *,.ds *::before,.ds *::after{box-sizing:border-box}
.ds button,.ds input,.ds select,.ds textarea{font-family:inherit}
.ds :focus-visible{outline:2px solid #0B7A75;outline-offset:2px}
.ds .wrap{max-width:none;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.ds .kpis{display:flex;gap:22px;justify-content:flex-end;flex-wrap:wrap}
.ds .kpi{text-align:right;line-height:1.15}.ds .kpi span{display:block;font-size:10.5px;font-weight:700;color:#5F7482}.ds .kpi b{font-size:17px;color:#102A43}
.ds .ok{color:#0B7A75!important}.ds .warn{color:#B7791F!important}.ds .danger{color:#C0392B!important}
.ds .alert{display:flex;align-items:center;gap:12px;height:38px;padding:0 14px;background:#FAFAFB;border:1px solid #E5E7EB;border-radius:10px;font-size:12.5px}
.ds .alert .tag{font-weight:700;color:#111827}.ds .alert .tag i{color:#D0473F;font-style:normal;margin-right:4px}
.ds .alert .vp{flex:1;min-width:0;overflow:hidden}.ds .alert .mq{display:inline-block;white-space:nowrap;animation:dsmq 22s linear infinite}
@keyframes dsmq{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
@media(prefers-reduced-motion:reduce){.ds .alert .mq{animation:none}}
.ds .sbtn{height:28px;padding:0 12px;border-radius:6px;border:1px solid #CBD5E1;background:#fff;color:#111827;font-size:12px;font-weight:700;cursor:pointer}
.ds .sbtn.g{background:#EEF0F3;border-color:#E2E5EA}
.ds .ws{display:grid;gap:14px;align-items:stretch}
.ds .card{background:#fff;border:1px solid #E3E9EC;border-radius:10px;box-shadow:0 1px 2px rgba(16,42,67,.04)}
.ds .cis-t{display:flex;align-items:center;justify-content:space-between;height:38px;padding:0 14px;border-bottom:1px solid #E5E7EB;font-size:15px;font-weight:700;color:#102A43}
.ds .edleg{font-size:11.5px;font-weight:600;color:#6B7280;display:inline-flex;align-items:center;gap:6px}
.ds .edleg i{width:11px;height:11px;border-radius:3px;background:#E3F4EF;border:1px solid #4FA38F}
.ds .cis-s{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #E3E9EC}
.ds .cis-s input{flex:1;height:30px;border:1px solid #9AA7B4;border-radius:4px;padding:0 10px;font-size:12.5px}
.ds .scope{font-size:11.5px;font-weight:600;color:#0B5F5B;background:#E6F3F2;border-radius:6px;padding:4px 9px}
.ds table.cis{width:100%;border-collapse:collapse;table-layout:fixed}
.ds .cis th{background:#F4F6F9;color:#6B7A89;font-size:10.5px;font-weight:700;text-align:left;padding:6px 10px;border-bottom:1px solid #E3E9EC;border-right:1px solid #E3E9EC;text-transform:uppercase;letter-spacing:.02em}
.ds .cis th.r{text-align:right}
.ds .cis td{padding:5px 10px;border-bottom:1px solid #E3E9EC;border-right:1px solid #E3E9EC;vertical-align:top;font-size:12px}
.ds .cis th:last-child,.ds .cis td:last-child{border-right:0}
.ds .cis td.d{font-weight:700;color:#102A43;background:#F8FAFB;padding-top:11px}
.ds .cis td.f{text-align:right;font-weight:700;white-space:nowrap;padding-top:11px}
.ds .up{color:#1F8A3B}.ds .dn{color:#C0392B}.ds .mut{color:#9AA7B4;font-weight:400;font-size:11px}.ds .dark{color:#1F2937}
.ds .sub{display:block;font-size:10px;font-weight:400;color:#6B7280}
.ds .cap{display:flex;gap:8px;font-size:10px;color:#6B7280;margin-top:1px}.ds .cap span:first-child{flex:1}.ds .cap span:last-child{width:56px;flex:0 0 56px}
.ds .ro{height:26px;line-height:24px;border:1px solid #C9D1DA;background:#F1F3F6;border-radius:4px;padding:0 8px;font-size:12px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds .ro.na{color:#9AA7B4;font-size:11px;background:#fff;border-style:dashed}.ds .ro.calc{background:#fff;color:#102A43}
.ds .pair{display:flex;gap:8px}.ds .pair>.ro,.ds .pair>input{flex:1;min-width:0}.ds .pair .q{flex:0 0 56px;width:56px}
.ds .gi,.ds .gs{width:100%;height:26px;border:1px solid #D1D5DB;background:#fff;border-radius:4px;padding:0 8px;font-size:12px;color:#1F2937}
.ds .pair .gs{flex:0 0 56px;width:56px;padding:0 6px}
.ds .ed{background:#E3F4EF!important;border-color:#4FA38F!important;font-weight:700;color:#0B4F46!important}
.ds .ta{width:100%;height:30px;border-radius:4px;padding:5px 7px;font-size:11.5px;line-height:1.35;resize:vertical}
.ds .ta.cur{background:#F1F3F6;border:1px solid #C9D1DA;color:#374151;resize:none}.ds .ta.new{background:#fff;border:1px solid #D1D5DB}
.ds .note{font-size:10px;color:#9A3412;font-weight:700;margin-top:1px}.ds .pre{font-size:10px;color:#0B5F5B;margin-top:1px}
.ds .leg{display:flex;flex-wrap:wrap;gap:14px;padding:6px 12px;font-size:11px;color:#5F7482}
.ds .leg span{display:inline-flex;align-items:center;gap:5px}.ds .leg i{width:11px;height:11px;border-radius:2px;border:1px solid}
.ds .foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid #E3E9EC}
.ds .pg{font-size:13px;color:#486070}.ds .pg b{color:#102A43}.ds .acts{display:flex;gap:8px}
.ds .btn{height:34px;padding:0 16px;border-radius:7px;border:1px solid #102A43;background:#102A43;color:#fff;font-size:13px;font-weight:700;cursor:pointer}
.ds .btn.ghost{background:#fff;color:#102A43;border-color:#CBD5DA}.ds .btn:disabled{opacity:.45;cursor:not-allowed}
.ds .empty{padding:36px;color:#5F7482}
/* metrics strip */
.ds .mfold{border:1px solid #E5E7EB;background:#fff;border-radius:12px;cursor:pointer;display:flex;justify-content:center;padding:14px 0 0}
.ds .mfold:hover{background:#F6F7F9}
.ds .mfold span{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:700;color:#102A43;font-size:12.5px;letter-spacing:.02em}
.ds .ph20{position:relative;border:2px dashed #CBD2E0;background:#FAFBFD;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#6B7280;gap:6px;padding:16px;font-size:12.5px;min-width:0}
.ds .ph20 b{color:#102A43;font-size:14px}
.ds .ph20 button{position:absolute;top:8px;right:8px;border:1px solid #D1D5DB;background:#fff;border-radius:6px;font-size:12px;padding:3px 8px;cursor:pointer;color:#374151}
/* right panel */
.ds .rpw{position:relative;min-height:600px}
.ds .rp{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;font-size:12.5px;color:#111827}
.ds .rp-head{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 16px;border-bottom:1px solid #E5E7EB}
.ds .rp-who{flex:1;min-width:0;font-size:12px;color:#374151;line-height:1.35}.ds .rp-who b{color:#102A43;font-size:13px}
.ds .rp-ic{border:1px solid #D1D5DB;background:#fff;border-radius:6px;height:26px;min-width:26px;padding:0 6px;font-size:13px;color:#374151;cursor:pointer}
.ds .rp-tabs{display:flex;border-bottom:1px solid #E5E7EB;background:#FAFAFB}
.ds .rp-tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;padding:9px 0;font-size:13px;font-weight:600;color:#6B7280;cursor:pointer}
.ds .rp-tabs button[aria-selected=true]{color:#111827;border-bottom-color:#102A43;font-weight:800}
.ds .rp-subs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 4px 16px}
.ds .rp-subs button{border:1px solid #D1D5DB;background:#fff;border-radius:14px;padding:3px 10px;font-size:11.5px;color:#374151;cursor:pointer}
.ds .rp-subs button[aria-pressed=true]{background:#EEF0F3;border-color:#CBD2DA;color:#111827;font-weight:700}
.ds .rp-body{flex:1;min-height:0;overflow:auto;padding:6px 14px 14px 16px}
.ds .rclosed{border:1px solid #E5E7EB;background:#fff;border-radius:12px;cursor:pointer;display:flex;justify-content:center;padding:14px 8px 0;height:100%}
.ds .rclosed span{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:700;color:#102A43;font-size:12.5px}
.ds .rtl{list-style:none;margin:4px 0 0;padding:0 0 0 18px;position:relative}
.ds .rtl::before{content:"";position:absolute;left:5px;top:8px;bottom:8px;width:1px;background:#E0E4EA}
.ds .rtl li{position:relative;padding:6px 0 10px}
.ds .rtl li::before{content:"";position:absolute;left:-17px;top:11px;width:9px;height:9px;border-radius:50%;border:2px solid #C7CDD6;background:#fff}
.ds .rtl li.cur::before{border-color:#102A43;background:#102A43}
.ds .ry{font-weight:800;color:#102A43}.ds .rmut{color:#6B7280}
.ds .chip{display:inline-block;border:1px solid #E5E7EB;background:#F7F8FA;border-radius:4px;padding:1px 6px;font-size:11px;margin:3px 4px 0 0}
.ds .chip.good{background:#ECFDF3;border-color:#B7E4C7;color:#166534;font-weight:700}.ds .chip.now{background:#EEF0F3;font-weight:700}
.ds .rtxt{margin-top:4px;line-height:1.45}
.ds .rc{border:1px solid #E5E7EB;border-radius:10px;padding:10px 12px;margin-top:8px}
.ds .rc h4{margin:0 0 6px;font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#6B7280;text-transform:uppercase}
.ds .rrow{display:flex;justify-content:space-between;gap:8px;padding:3px 0}.ds .rrow+.rrow{border-top:1px dashed #EEF0F3}
.ds .rbig{font-size:20px;font-weight:800}
.ds .rbar{height:7px;border-radius:4px;background:#EEF1F4;overflow:hidden;margin:6px 0 4px}.ds .rbar i{display:block;height:100%;background:#15803D}
.ds .rbar i.warn{background:#B7791F}.ds .rbar i.danger{background:#C0392B}
.ds .rok{color:#15803D}.ds .rwarn{color:#B7791F}.ds .rbad{color:#C0392B}
.ds .rinfo{border:1px solid #E5E7EB;background:#F7F8FA;border-radius:8px;padding:6px 10px;margin-top:8px}
.ds .rlist{margin:0;padding-left:16px}.ds .rlist li{margin:2px 0}
.ds .rtbl{width:100%;border-collapse:collapse;font-size:12px}.ds .rtbl th{text-align:left;font-size:10.5px;color:#6B7280;padding:4px;border-bottom:1px solid #E5E7EB}
.ds .rtbl td{padding:4px;border-bottom:1px solid #F1F3F5}.ds .rn{text-align:right!important}.ds .rtbl tr.me td{background:#EEF0F3;font-weight:700}
.ds .rlink{background:none;border:0;padding:0;font:inherit;color:#102A43;font-weight:700;cursor:pointer;text-decoration:underline}
.ds .rnote{font-size:10.5px;color:#6B7280}
.ds .fold{text-align:center;font-size:11px;color:#7B8F9B}
.ds .yh{background:#fff;border:1px solid #E3E9EC;border-radius:10px;overflow:hidden}
.ds .yh-h{background:#102A43;color:#fff;padding:6px 14px;font-size:12.5px;font-weight:700}
.ds .yh-w{overflow:auto}.ds .yh table{width:100%;min-width:980px;border-collapse:collapse}
.ds .yh th{background:#EEF2F7;font-size:10.5px;padding:5px 8px;text-align:center;color:#334E5C}
.ds .yh td{text-align:right;padding:3px 10px;font-size:11.5px;border-top:1px solid #EEF1F5;line-height:1.25;white-space:nowrap}
.ds .yh td:first-child{text-align:center;color:#1859A8;font-weight:700}
.ds .yh tr.cur td{background:#FFF9DC}.ds .yh tr.cur td.chg{background:#FFE8A3;font-weight:700;box-shadow:inset 0 -2px 0 #E8B04A}
.ds .yh small{display:block;font-size:10px}.ds .yh small.up,.ds .yh small.nw{color:#1F8A3B;font-weight:600}.ds .yh small.dn{color:#C0392B;font-weight:600}.ds .yh small.z{color:#7B8F9B}
.ds .yh small.was{font-size:9.5px;font-weight:400;color:#8A6D1F;text-decoration:line-through}
.ds .yh-l{display:flex;gap:14px;flex-wrap:wrap;padding:5px 14px;font-size:10.5px;color:#5F7482;border-top:1px solid #EEF1F5}
.ds .yh-l i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.ds .yh-e{padding:10px 14px;font-size:12px;color:#5F7482}
@media(max-width:1200px){.ds .ws{grid-template-columns:1fr!important}.ds .ph20{display:none}.ds .rpw{width:100%!important}}
`;

const Card = ({ title, children }) => (
  <div className="rc">
    <h4>{title}</h4>
    {children}
  </div>
);
const Bar = ({ p }) => (
  <div className="rbar">
    <i
      className={tone(p) === "ok" ? "" : tone(p)}
      style={{ width: `${Math.min(100, p)}%` }}
    />
  </div>
);
const rc = (p) =>
  tone(p) === "ok" ? "rok" : tone(p) === "warn" ? "rwarn" : "rbad";

export function DetailScreenPage() {
  const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();
  const budgetStore = useBudget();
  const { currentUser, isHR } = budgetStore;
  const rows = liveRows || [];
  const bud = useMemo(() => readBudget(budgetStore), [budgetStore]);

  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [historyByEmpId, setHistoryByEmpId] = useState({});
  const [notes, setNotes] = useState({});
  const [hideAlert, setHideAlert] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [panel, setPanel] = useState({
    open: true,
    wide: false,
    tab: "feedback",
    sub: { feedback: "manager", budget: "budget" },
  });
  const historyPromiseRef = useRef(new Map());
  const origRef = useRef({});

  useEffect(() => {
    setIndex(0);
    setSearch("");
  }, [currentUser?.name]);
  const employee = rows[Math.min(index, rows.length - 1)] || rows[0];

  const loadHistory = useCallback((empId) => {
    const key = String(empId || "").trim();
    if (!key) return Promise.resolve([]);
    const existing = historyPromiseRef.current.get(key);
    if (existing) return existing;
    setHistoryByEmpId((p) => ({
      ...p,
      [key]: { loading: true, data: [], error: "" },
    }));
    const promise = (async () => {
      const res = await catalystFetch(
        `${HISTORY_URL}?emp_id=${encodeURIComponent(key)}`,
      );
      if (!res.ok) throw new Error(`History request failed (${res.status}).`);
      const json = await res.json();
      if (!json?.success)
        throw new Error(json?.message || "Failed to load history.");
      return (Array.isArray(json?.data) ? json.data : [])
        .map(normalize)
        .sort((a, b) => String(b.year).localeCompare(String(a.year)));
    })();
    historyPromiseRef.current.set(key, promise);
    promise
      .then((data) =>
        setHistoryByEmpId((p) => ({
          ...p,
          [key]: { loading: false, data, error: "" },
        })),
      )
      .catch((err) => {
        historyPromiseRef.current.delete(key);
        setHistoryByEmpId((p) => ({
          ...p,
          [key]: {
            loading: false,
            data: [],
            error: err?.message || "Unable to load history.",
          },
        }));
      });
    return promise;
  }, []);
  useEffect(() => {
    if (employee?.empId) loadHistory(employee.empId).catch(() => {});
  }, [employee?.empId, loadHistory]);

  const empKey = employee ? String(employee.empId || "").trim() : "";
  const hs = historyByEmpId[empKey];
  const prior = useMemo(() => {
    const seen = new Set(),
      out = [];
    for (const r of hs?.data || []) {
      const k = yearKey(r.year);
      if (isCurrentYear(r.year) || emptyRecord(r) || !k || seen.has(k))
        continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }, [hs]);

  if (employee && !origRef.current[empKey])
    origRef.current[empKey] = Object.fromEntries(
      EDIT_FIELDS.map((f) => [f, employee[f]]),
    );
  const orig = origRef.current[empKey] || {};
  const isEd = (f) => {
    const k = f === "newBase" ? "hikeAmount" : f;
    return employee && String(orig[k] ?? "") !== String(employee[k] ?? "");
  };

  const commit = (field, value) => {
    if (
      String(blank(employee[field]) ? "" : employee[field]) ===
      String(blank(value) ? "" : value)
    )
      return;
    updateCell(employee.id, field, value, "Detail screen edit");
  };
  const commitLinked = (fields) =>
    updateLinkedCells(employee.id, fields, "Detail screen edit");
  const onBase = (raw) => {
    const v = amount(raw),
      base = n(employee.currentAnnualBasePay);
    if (v === "") {
      if (!blank(employee.hikeAmount) || !blank(employee.hikePct))
        commitLinked({ hikeAmount: "", hikePct: "" });
      return;
    }
    if (v === newBaseSalary(employee)) return;
    const hike = v - base;
    commitLinked({
      hikeAmount: hike,
      hikePct: base ? Number(((hike / base) * 100).toFixed(1)) : 0,
    });
  };
  const onReward = (field, raw) => {
    const t = toBePaid(employee)[field === "newPB" ? "pb" : "rb"],
      key = `${empKey}:${field}`;
    let v = amount(raw);
    if (v === "") v = 0;
    if (t && v < t) {
      setNotes((p) => ({
        ...p,
        [key]: `Less than to be paid — ${fmt(t)} will be paid`,
      }));
      v = t;
    } else
      setNotes((p) => {
        const c = { ...p };
        delete c[key];
        return c;
      });
    commit(field, v);
  };
  const onTitle = (v) =>
    commitLinked(
      v !== employee.designation
        ? { newTitle: v, eligibleForPromotion: "Yes" }
        : { eligibleForPromotion: "No", newTitle: null },
    );
  const onSearch = (value) => {
    setSearch(value);
    const q = value.trim().toLowerCase();
    if (!q) return;
    const i = rows.findIndex(
      (r) =>
        String(r.name || "")
          .toLowerCase()
          .startsWith(q) || String(r.empId || "").toLowerCase() === q,
    );
    if (i > -1) setIndex(i);
  };
  const flush = () => {
    const a = document.activeElement;
    if (a && a.hasAttribute?.("data-f")) a.blur();
  };

  if (!employee)
    return (
      <div className="ds">
        <style>{CSS}</style>
        <div className="empty">No employees are visible for this login.</div>
      </div>
    );

  /* ---------- derived ---------- */
  const view = withFloor(employee),
    t = toBePaid(employee);
  const base = n(employee.currentAnnualBasePay),
    hike = n(view.hikeAmount),
    hp = base ? (hike / base) * 100 : 0;
  const lastH = prior[0];
  const lastCTC = lastH
    ? lastH.newCTC ||
      lastH.newBasePay + lastH.performanceBonus + lastH.retentionBonus
    : 0;
  const total = totalCTCWithRewards(view),
    trPct = lastCTC ? ((total - lastCTC) / lastCTC) * 100 : 0;
  const pbD = n(view.newPB) - t.pb,
    rbD = n(view.newRB) - t.rb;
  const scopeLabel = isHR ? "All employees" : `${currentUser?.name}'s team`;
  const titles = NEW_TITLES.includes(employee.designation)
    ? NEW_TITLES
    : [employee.designation, ...NEW_TITLES];
  const last = index === rows.length - 1;

  const used = rows.reduce((s, r) => s + n(r.hikeAmount), 0);
  const tpb = rows.reduce((s, r) => s + n(r.targetPBNextYear), 0);
  const uCur = bud?.allocated ? (used / bud.allocated) * 100 : 0;
  const uTpb = bud?.allocated ? ((used + tpb) / bud.allocated) * 100 : 0;

  const cro = (v, c = "") => <div className={`ro ${c}`}>{v}</div>;
  const amt = (f, value, onCommit, label) => (
    <input
      key={`${employee.id}-${f}-${fmtB(value)}`}
      data-f={f}
      className={`gi${isEd(f) ? " ed" : ""}`}
      inputMode="numeric"
      defaultValue={fmtB(value)}
      aria-label={label}
      onBlur={(e) => {
        if (e.target.value !== e.target.defaultValue) onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
  const noteOf = (f, a) =>
    notes[`${empKey}:${f}`] ? (
      <div className="note">{notes[`${empKey}:${f}`]}</div>
    ) : (
      <div className="pre">Preloaded · less than this → {fmt(a)} paid</div>
    );
  const dTxt = (d) =>
    d ? (
      <>
        {signed(d)}
        <span className="sub">vs to be paid</span>
      </>
    ) : (
      <>
        —<span className="sub">= to be paid</span>
      </>
    );
  const dCls = (d) => (d > 0 ? "up" : d < 0 ? "dn" : "mut");
  const area = (f, value, ph) => (
    <textarea
      key={`${employee.id}-${f}-${value}`}
      data-f={f}
      className={`ta new${isEd(f) ? " ed" : ""}`}
      defaultValue={value || ""}
      placeholder={ph}
      onBlur={(e) => commit(f, e.target.value)}
    />
  );

  /* ---------- history grid ---------- */
  const mk = (x) => ({
    base: n(x.currentAnnualBasePay),
    jb: n(x.joiningBonus),
    pb: totalOfPB(x),
    rb: n(x.newRB),
    tb: calcTotalBonus(x),
    hike: n(x.hikeAmount),
    ctc: totalCTCWithRewards(x),
    tpb: n(x.targetPBNextYear),
    nb: newBaseSalary(x),
  });
  const curRow = mk(view),
    origRow = mk(withFloor({ ...employee, ...orig }));
  const pastRows = prior.map((h) => ({
    year: h.year,
    base: h.basePay,
    jb: h.joiningBonus,
    pb: h.performanceBonus,
    rb: h.retentionBonus,
    tb: h.performanceBonus + h.retentionBonus,
    hike: h.hikeAmount,
    ctc: h.newCTC || h.newBasePay + h.performanceBonus + h.retentionBonus,
    tpb: h.targetPB,
    nb: h.newBasePay,
  }));
  const pctChg = (v, p) => {
    if (!p)
      return v ? (
        <small className="nw">new</small>
      ) : (
        <small className="z">0.00%</small>
      );
    const c = ((v - p) / p) * 100;
    return (
      <small className={Math.abs(c) < 0.005 ? "z" : c < 0 ? "dn" : "up"}>
        {c > 0 ? "+" : ""}
        {c.toFixed(2)}%
      </small>
    );
  };

  /* ---------- right panel ---------- */
  const setTab = (tab) => setPanel((p) => ({ ...p, tab }));
  const setSub = (s) =>
    setPanel((p) => ({ ...p, sub: { ...p.sub, [p.tab]: s } }));
  const SUBS = {
    feedback: [
      ["manager", "Manager"],
      ["client", "Client"],
      ["other", "Other"],
    ],
    budget: [
      ["budget", "Budget"],
      ["team", "Team metrics"],
      ["pct", "Hike percentile"],
      ["nohike", "No hike"],
      ["pb", "PB paid vs target"],
      ["changes", "Team changes"],
    ],
  };
  const sub = panel.sub[panel.tab];
  const whoParts = [
    employee.empId,
    employee.designation,
    employee.band,
    !blank(employee.totalExperience)
      ? `${String(employee.totalExperience).replace(/\s*yrs?$/i, "")} yrs${!blank(employee.wissenExperience) ? ` (${String(employee.wissenExperience).replace(/\s*yrs?$/i, "")} here)` : ""}`
      : "",
  ].filter(Boolean);
  const hikeOf = (r) =>
    n(r.currentAnnualBasePay)
      ? (n(r.hikeAmount) / n(r.currentAnnualBasePay)) * 100
      : 0;
  const rewardHike = (r) =>
    n(r.currentAnnualBasePay)
      ? ((n(r.hikeAmount) + n(r.newPB) + n(r.newRB)) /
          n(r.currentAnnualBasePay)) *
        100
      : 0;

  function feedbackBody() {
    if (sub === "manager") {
      const items = [
        {
          y: CYCLE,
          cur: true,
          d: employee.designation,
          r: employee.managerRating,
          el: employee.eligibleForPromotion,
          tx: employee.feedback,
        },
      ].concat(
        prior.map((h, i) => ({
          y: h.year,
          d: h.designation,
          r: h.rating,
          tx: h.feedback,
          promo:
            prior[i + 1]?.designation &&
            prior[i + 1].designation !== h.designation &&
            h.designation !== "—",
        })),
      );
      return (
        <ul className="rtl">
          {items.map((c) => (
            <li key={c.y} className={c.cur ? "cur" : ""}>
              <span className="ry">{c.y}</span>
              {c.cur && <span className="chip now">This cycle</span>}
              <div className="rmut">{dash(c.d)}</div>
              <span className="chip">
                Manager rating <b>{dash(c.r)}</b>
              </span>
              {c.el ? (
                <span className={`chip${c.el === "Yes" ? " good" : ""}`}>
                  Eligible for promotion: {c.el}
                </span>
              ) : null}
              {c.promo ? <span className="chip good">Promoted</span> : null}
              {!blank(c.tx) && c.tx !== "—" ? (
                <div className="rtxt">{c.tx}</div>
              ) : null}
            </li>
          ))}
        </ul>
      );
    }
    if (sub === "client")
      return blank(employee.clientRating) ? (
        <div className="rinfo">No client feedback recorded.</div>
      ) : (
        <ul className="rtl">
          <li className="cur">
            <span className="ry">{CYCLE}</span>
            <div>
              <span className="chip">
                Client rating <b>{employee.clientRating}</b>
              </span>
            </div>
          </li>
        </ul>
      );
    return (
      <table className="rtbl">
        <thead>
          <tr>
            <th>Cycle</th>
            <th className="rn">RR %</th>
            <th className="rn">IC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{CYCLE}</td>
            <td className="rn">{dash(employee.rrPercent)}</td>
            <td className="rn">{dash(employee.interviewCount)}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  function budgetBody() {
    if (sub === "budget") {
      if (!bud)
        return (
          <div className="rinfo">No budget is allotted to this login.</div>
        );
      const left = bud.allocated - used;
      return (
        <>
          <Card title="Current consumption">
            <div className="rrow">
              <span>Used</span>
              <span className={`rbig ${rc(uCur)}`}>{f1(uCur)}%</span>
            </div>
            <Bar p={uCur} />
            <div className="rmut">
              {lakhs(used)} used ·{" "}
              {left >= 0 ? `${lakhs(left)} left` : `${lakhs(-left)} over`} of{" "}
              {lakhs(bud.allocated)}
            </div>
          </Card>
          <Card title="Including Target PB">
            <div className="rrow">
              <span>Used + Target PB</span>
              <span className={`rbig ${rc(uTpb)}`}>{f1(uTpb)}%</span>
            </div>
            <Bar p={uTpb} />
            <div className="rmut">+{lakhs(tpb)} Target PB</div>
          </Card>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="rlink" onClick={goBudget}>
              View budget ›
            </button>
          </div>
        </>
      );
    }
    if (sub === "team") {
      const hk = rows.filter((r) => n(r.hikeAmount) > 0).map(hikeOf),
        rt = rows.map((r) => n(r.rating ?? r.managerRating)).filter(Boolean);
      const promo = rows.filter(
        (r) => r.newTitle && r.newTitle !== r.designation,
      ).length;
      return (
        <Card title={`Team · ${rows.length} people`}>
          <div className="rrow">
            <span>Promotions</span>
            <b>{promo}</b>
          </div>
          <div className="rrow">
            <span>Average hike % (where given)</span>
            <b>
              {hk.length
                ? `${f1(hk.reduce((a, x) => a + x, 0) / hk.length)}%`
                : "—"}
            </b>
          </div>
          <div className="rrow">
            <span>Median hike %</span>
            <b>{hk.length ? `${f1(median(hk))}%` : "—"}</b>
          </div>
          <div className="rrow">
            <span>Average rating</span>
            <b>
              {rt.length
                ? (rt.reduce((a, x) => a + x, 0) / rt.length).toFixed(1)
                : "—"}
            </b>
          </div>
        </Card>
      );
    }
    if (sub === "pct") {
      const tr = rows
          .map((r) => ({ r, v: rewardHike(r) }))
          .sort((a, b) => b.v - a.v),
        i = tr.findIndex((x) => x.r.empId === employee.empId);
      return (
        <Card title="Total Reward hike % in team">
          <table className="rtbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th className="rn">Reward hike %</th>
              </tr>
            </thead>
            <tbody>
              {tr.map((x, k) => (
                <tr
                  key={x.r.empId}
                  className={x.r.empId === employee.empId ? "me" : ""}
                >
                  <td>{k + 1}</td>
                  <td>{x.r.name}</td>
                  <td className="rn">{f1(x.v)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tr.length > 1 && i > -1 ? (
            <div className="rnote" style={{ marginTop: 6 }}>
              {employee.name} is{" "}
              {ordinal(
                Math.round(((tr.length - 1 - i) / (tr.length - 1)) * 100),
              )}{" "}
              percentile
            </div>
          ) : null}
        </Card>
      );
    }
    if (sub === "nohike") {
      const nh = rows.filter((r) => !(n(r.hikeAmount) > 0));
      return (
        <Card title={`No hike this cycle · ${nh.length} of ${rows.length}`}>
          {nh.length ? (
            <ul className="rlist">
              {nh.map((r) => (
                <li key={r.empId}>
                  {r.name} <span className="rmut">· {r.designation}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rmut">Everyone has a hike.</div>
          )}
        </Card>
      );
    }
    if (sub === "pb") {
      const paid = rows.reduce((s, r) => s + n(r.allocatedPBAmount), 0),
        tgt = rows.reduce((s, r) => s + n(r.targetPBAllocatedForMay), 0),
        p = tgt ? (paid / tgt) * 100 : 0;
      return (
        <Card title="PB paid vs target">
          <div className="rrow">
            <span>Paid</span>
            <span className="rbig">{tgt ? `${f1(p)}%` : "—"}</span>
          </div>
          <div className="rbar">
            <i style={{ width: `${Math.min(100, p)}%` }} />
          </div>
          <div className="rmut">
            {lakhs(paid)} paid of {lakhs(tgt)} target
          </div>
        </Card>
      );
    }
    const ch = bud?.changes || [];
    return (
      <Card title={`Team changes · ${ch.length}`}>
        {ch.length ? (
          <ul className="rlist">
            {ch.map((c, k) => (
              <li key={k}>
                {c.name || c.empName || c.empId}{" "}
                <span className="rmut">
                  · {c.type}
                  {c.date ? ` · ${c.date}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rmut">No changes since allocation.</div>
        )}
      </Card>
    );
  }

  const cols = metricsOpen
    ? `minmax(520px,611px) minmax(0,1fr) ${panel.open ? "auto" : "34px"}`
    : `minmax(520px,1fr) 34px ${panel.open ? "auto" : "34px"}`;
  const panelW = panel.wide ? 640 : 360;

  return (
    <div className="ds">
      <style>{CSS}</style>
      <div className="wrap">
        {bud?.allocated ? (
          <div className="kpis">
            <div className="kpi">
              <span>Budget Allocated</span>
              <b>₹ {lakhs(bud.allocated)}</b>
            </div>
            <div className="kpi">
              <span>Utilisation</span>
              <b className={tone(uCur)}>{uCur.toFixed(1)}%</b>
            </div>
            <div className="kpi">
              <span>Incl. Target PB</span>
              <b className={tone(uTpb)}>{uTpb.toFixed(1)}%</b>
            </div>
          </div>
        ) : null}

        {bud &&
        bud.initial != null &&
        Math.round(bud.initial) !== Math.round(bud.allocated) &&
        !hideAlert ? (
          <div className="alert" role="status">
            <span className="tag">
              <i>▲</i>Budget changed
            </span>
            <div className="vp">
              <span className="mq">
                Be aware: your team budget has changed from ₹{" "}
                {lakhs(bud.initial)} to ₹ {lakhs(bud.allocated)} —{" "}
                {bud.changes.length} team change
                {bud.changes.length === 1 ? "" : "s"}
                {bud.since ? ` since allocation on ${bud.since}` : ""}.
              </span>
            </div>
            <button type="button" className="sbtn" onClick={goBudget}>
              View budget
            </button>
            <button
              type="button"
              className="sbtn g"
              onClick={() => setHideAlert(true)}
            >
              Got it
            </button>
          </div>
        ) : null}

        <div className="ws" style={{ gridTemplateColumns: cols }}>
          {/* ---------- 1. Compensation input ---------- */}
          <section className="card" aria-label="Compensation input">
            <div className="cis-t">
              <span>Compensation input</span>
              <span className="edleg">
                <i />
                Edited this cycle
              </span>
            </div>
            <div className="cis-s">
              <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search your team by name or employee ID"
                aria-label="Search your team"
              />
              <span className="scope" title={scopeLabel}>
                {rows.length}
              </span>
            </div>
            <table className="cis">
              <colgroup>
                <col style={{ width: 150 }} />
                <col />
                <col />
                <col style={{ width: 112 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Current</th>
                  <th>Proposed</th>
                  <th className="r">Diff</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="d">Base Pay</td>
                  <td>{cro(fmt(base))}</td>
                  <td>
                    {amt(
                      "newBase",
                      newBaseSalary(employee),
                      onBase,
                      "Proposed base pay",
                    )}
                  </td>
                  <td className={`f ${hike < 0 ? "dn" : "up"}`}>
                    {signed(hike)}
                    <br />/ {hp.toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="d">Joining Bonus</td>
                  <td>{cro(fmt(employee.joiningBonus))}</td>
                  <td>{cro("n/a this cycle", "na")}</td>
                  <td className="f" />
                </tr>
                <tr>
                  <td className="d">PB / Inst.</td>
                  <td>
                    <div className="pair">
                      {cro(fmt(t.pb))}
                      {cro(dash(t.pbMonth), "q")}
                    </div>
                    <div className="cap">
                      <span>PB to be Paid</span>
                      <span>Mo (PB)</span>
                    </div>
                  </td>
                  <td>
                    <div className="pair">
                      {amt(
                        "newPB",
                        view.newPB,
                        (v) => onReward("newPB", v),
                        "Proposed PB",
                      )}
                      <select
                        data-f="pbInstallment"
                        className={`gs${isEd("pbInstallment") ? " ed" : ""}`}
                        value={String(employee.pbInstallment || "1")}
                        onChange={(e) =>
                          commit("pbInstallment", e.target.value)
                        }
                        aria-label="PB instalments"
                      >
                        {INSTALLMENT_OPTIONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    {noteOf("newPB", t.pb)}
                  </td>
                  <td className={`f ${dCls(pbD)}`}>{dTxt(pbD)}</td>
                </tr>
                <tr>
                  <td className="d">RB</td>
                  <td>
                    <div className="pair">
                      {cro(fmt(t.rb))}
                      {cro(dash(t.rbMonth), "q")}
                    </div>
                    <div className="cap">
                      <span>RB to be Paid</span>
                      <span>Mo (RB)</span>
                    </div>
                  </td>
                  <td>
                    <div className="pair">
                      {amt(
                        "newRB",
                        view.newRB,
                        (v) => onReward("newRB", v),
                        "Proposed RB",
                      )}
                      <div className="q" style={{ flex: "0 0 56px" }} />
                    </div>
                    {noteOf("newRB", t.rb)}
                  </td>
                  <td className={`f ${dCls(rbD)}`}>{dTxt(rbD)}</td>
                </tr>
                <tr>
                  <td className="d">Total Reward</td>
                  <td>{cro(fmt(lastCTC))}</td>
                  <td>{cro(<b>{fmt(total)}</b>, "calc")}</td>
                  <td className={`f ${trPct < 0 ? "dn" : "up"}`}>
                    {lastCTC
                      ? `${trPct < 0 ? "−" : ""}${Math.abs(trPct).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="d">Target PB</td>
                  <td>{cro(fmt(employee.targetPBAllocatedForMay))}</td>
                  <td>
                    {amt(
                      "targetPBNextYear",
                      employee.targetPBNextYear,
                      (v) => commit("targetPBNextYear", amount(v)),
                      "Proposed target PB",
                    )}
                  </td>
                  <td className="f mut">next yr</td>
                </tr>
                <tr>
                  <td className="d">Target PB Criteria</td>
                  <td>
                    <textarea
                      className="ta cur"
                      readOnly
                      value={employee.targetPBCriteria || "—"}
                    />
                  </td>
                  <td>
                    {area(
                      "newTargetPBCriteria",
                      employee.newTargetPBCriteria || employee.targetPBCriteria,
                    )}
                  </td>
                  <td className="f" />
                </tr>
                <tr>
                  <td className="d">Designation</td>
                  <td>{cro(employee.designation)}</td>
                  <td>
                    <select
                      data-f="newTitle"
                      className={`gi${isEd("newTitle") ? " ed" : ""}`}
                      value={employee.newTitle || employee.designation || ""}
                      onChange={(e) => onTitle(e.target.value)}
                      aria-label="New title"
                    >
                      {titles.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                  <td className="f dark">
                    {employee.eligibleForPromotion === "Yes" ? "Yes" : "No"}
                  </td>
                </tr>
                <tr>
                  <td className="d" style={{ borderBottom: 0 }}>
                    Comp Manager Remarks
                  </td>
                  <td style={{ borderBottom: 0 }}>
                    <textarea
                      className="ta cur"
                      readOnly
                      value={employee.prevRemarks || "None last cycle"}
                    />
                  </td>
                  <td style={{ borderBottom: 0 }}>
                    {area(
                      "atRisk",
                      employee.atRisk,
                      "Add remarks for this cycle",
                    )}
                  </td>
                  <td className="f" style={{ borderBottom: 0 }} />
                </tr>
              </tbody>
            </table>
            <div className="leg">
              <span>
                <i style={{ background: "#F1F3F6", borderColor: "#C9D1DA" }} />
                Current (read-only)
              </span>
              <span>
                <i style={{ background: "#fff", borderColor: "#D1D5DB" }} />
                Proposed (editable)
              </span>
              <span>
                <i style={{ background: "#E3F4EF", borderColor: "#4FA38F" }} />
                Edited this cycle
              </span>
            </div>
            <div className="foot">
              <div className="pg">
                <b>{index + 1}</b> of {rows.length} · {scopeLabel}
              </div>
              <div className="acts">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={index === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    flush();
                    setIndex((i) => Math.max(0, i - 1));
                  }}
                >
                  ‹ Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    flush();
                    if (!last) setIndex((i) => i + 1);
                  }}
                >
                  {last ? "Save" : "Save & next ›"}
                </button>
              </div>
            </div>
          </section>

          {/* ---------- 2. Metrics strip ---------- */}
          {metricsOpen ? (
            <section className="ph20" aria-label="Metrics">
              <button
                type="button"
                onClick={() => setMetricsOpen(false)}
                title="Fold metrics"
              >
                ‹ Fold
              </button>
              <b>Metrics</b>
              <div>Placeholder</div>
              <div>Team and org metrics open as separate screens.</div>
            </section>
          ) : (
            <button
              type="button"
              className="mfold"
              onClick={() => setMetricsOpen(true)}
              aria-expanded="false"
              title="Open metrics"
            >
              <span>Metrics ›</span>
            </button>
          )}

          {/* ---------- 3. Right panel ---------- */}
          {panel.open ? (
            <div className="rpw" style={{ width: panelW }}>
              <aside className="rp" aria-label="Employee panel">
                <div className="rp-head">
                  <div className="rp-who" title={whoParts.join(" · ")}>
                    <b>{employee.name}</b> · {whoParts.join(" · ")}
                  </div>
                  <button
                    type="button"
                    className="rp-ic"
                    aria-pressed={panel.wide}
                    title={panel.wide ? "Normal width" : "Expand"}
                    onClick={() => setPanel((p) => ({ ...p, wide: !p.wide }))}
                  >
                    {panel.wide ? "⤡" : "⤢"}
                  </button>
                  <button
                    type="button"
                    className="rp-ic"
                    aria-label="Close panel"
                    onClick={() => setPanel((p) => ({ ...p, open: false }))}
                  >
                    ✕
                  </button>
                </div>
                <div className="rp-tabs" role="tablist">
                  {[
                    ["feedback", "Feedback"],
                    ["budget", "Budget"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={panel.tab === k}
                      onClick={() => setTab(k)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="rp-subs">
                  {SUBS[panel.tab].map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={sub === k}
                      onClick={() => setSub(k)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="rp-body">
                  {panel.tab === "feedback" ? feedbackBody() : budgetBody()}
                </div>
              </aside>
            </div>
          ) : (
            <button
              type="button"
              className="rclosed"
              onClick={() => setPanel((p) => ({ ...p, open: true }))}
              aria-label="Open panel"
            >
              <span>Details ›</span>
            </button>
          )}
        </div>

        {/* ---------- Employee history ---------- */}
        <div className="fold">▾ Scroll down for Employee History</div>
        <section className="yh" aria-label="Employee history">
          <div className="yh-h">
            Employee History — {employee.name} · {pastRows.length + 1} cycle
            {pastRows.length ? "s" : ""}
          </div>
          {hs?.loading ? (
            <div className="yh-e">Loading history…</div>
          ) : hs?.error ? (
            <div className="yh-e">{hs.error}</div>
          ) : (
            <>
              <div className="yh-w">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      {HIST_COLS.map(([k, l]) => (
                        <th key={k}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="cur">
                      <td>{CYCLE} ★</td>
                      {HIST_COLS.map(([k]) => {
                        const ch =
                          Math.round(origRow[k]) !== Math.round(curRow[k]);
                        return (
                          <td key={k} className={ch ? "chg" : ""}>
                            {fmt(curRow[k])}
                            {pctChg(curRow[k], pastRows[0]?.[k])}
                            {ch ? (
                              <small className="was">
                                was {fmt(origRow[k])}
                              </small>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                    {pastRows.map((r, i) => (
                      <tr key={r.year}>
                        <td>{r.year}</td>
                        {HIST_COLS.map(([k]) => (
                          <td key={k}>
                            {fmt(r[k])}
                            {pctChg(r[k], pastRows[i + 1]?.[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="yh-l">
                <span>
                  <i style={{ background: "#FFE8A3" }} />
                  Changed this cycle (not yet final)
                </span>
                <span>
                  <i style={{ background: "#1F8A3B" }} />
                  Increase vs previous cycle
                </span>
                <span>
                  <i style={{ background: "#C0392B" }} />
                  Decrease
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
