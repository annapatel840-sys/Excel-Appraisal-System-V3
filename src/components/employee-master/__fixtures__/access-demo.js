// Demo data for dev-only smoke tests of AccessPage (NOT imported by the app).
// Adapted from the design's demo() in docs/access-design/Access_Screen_v5.html, using this
// app's real catalogue keys from docs/ACCESS_SPEC.md. Shape = GET /admin/state.

const S = (key, label, group, d, extra = {}) => ({ type: "screen", key, label, group, d, ...extra });
const A = (key, label, group, d, extra = {}) => ({ type: "action", key, label, group, d, ...extra });
const F = (key, label, kind, extra = {}) => ({ type: "field", key, label, kind, deps: [], ...extra });

export const screens = [
  S("dashboard", "Dashboard", "Compensation", ["view", "view", "view"]),
  S("appraisalSheet", "Appraisal Sheet", "Compensation", ["edit", "edit", "edit"]),
  S("detailScreen", "Detailed Screen", "Compensation", ["edit", "edit", "edit"]),
  S("budgetAllocation", "Budget Master", "Compensation", ["edit", "edit", "edit"]),
  S("budgetDistribution", "Budget Distribution", "Compensation", ["edit", "edit", "edit"]),
  S("teamChanges", "Team Changes", "Compensation", ["view", "view", "view"]),
  S("delegation", "Delegation", "Compensation", ["edit", "edit", "none"]),
  S("employeeMaster", "Employee Master · Eligibility List", "HR Operations", null, { hrOnly: true }),
  S("cycleMaster", "Appraisal Cycle Master", "HR Operations", null, { hrOnly: true }),
  S("payroll", "Payroll Data · Payroll Upload", "HR Operations", null, { hrOnly: true }),
  S("settings", "Settings", "HR Operations", null, { hrOnly: true }),
  S("access", "Access", "HR Operations", null, { hrOnly: true }),
];
export const actions = [
  A("bulkEdit", "Bulk edit", "Editing", [1, 1, 1]),
  A("promote", "Promote (Designation cell)", "Editing", [1, 1, 1]),
  A("importAppraisal", "Import appraisal sheet (Excel)", "Editing", [1, 1, 1]),
  A("exportGrid", "Export Appraisal Sheet (Excel)", "Editing", [1, 1, 1]),
  A("delegateRequest", "Delegate (request)", "Delegation", [1, 1, 0]),
  A("delegateApprove", "Approve delegation", "Delegation", [1, 0, 0], { fixed: "HR only" }),
  A("allotNextLevel", "Allot budget to next level", "Budget", [0, 1, 1]),
  A("changeBudgetConfig", "Change budget config", "Budget", [1, 0, 0], { fixed: "HR only" }),
  A("viewAudit", "View audit trails", "Access", [1, 1, 0]),
];
export const fields = [
  F("name", "Employee", "master"), F("designation", "Designation", "master"), F("compManager", "Comp. Manager", "master"),
  F("currentAnnualBasePay", "Current Annual Base Pay", "master"),
  F("rbToBePaid", "RB to be Paid", "upload"), F("pbToBePaid", "PB to be Paid", "upload"),
  F("allocatedPBAmount", "Allocated PB Amount", "input"), F("newPBToBeOffered", "New PB to be Offered", "input"),
  F("newRB", "New RB", "input"), F("hikeAmount", "Hike Amount", "input"),
  F("hikePct", "Hike %", "pair", { pairOf: "hikeAmount" }),
  F("totalOfPB", "Total of PB", "calc", { deps: ["allocatedPBAmount", "newPBToBeOffered"] }),
  F("totalBonus", "Total Bonus", "calc", { deps: ["totalOfPB", "newRB"] }),
  F("newBaseSalary", "New Base Salary", "calc", { deps: ["currentAnnualBasePay", "hikeAmount"] }),
  F("totalBonusHikeAmount", "Total Bonus Hike Amount", "calc", { deps: ["totalBonus", "rbToBePaid", "pbToBePaid"] }),
  F("newTitle", "New Title", "input"),
];

const roles = [
  { key: "hr", label: "HR Admin", source: "catalyst", catalystRole: "HR", seesAll: true, fixed: true, retired: false },
  { key: "techEd", label: "Tech ED", source: "delegation", catalystRole: "", seesAll: false, fixed: true, retired: false },
  { key: "compMgr", label: "Comp Manager", source: "delegation", catalystRole: "", seesAll: false, fixed: true, retired: false },
];

function matrix() {
  const m = { screens: {}, actions: {}, fields: {} };
  roles.forEach((r, ri) => {
    m.screens[r.key] = {}; m.actions[r.key] = {}; m.fields[r.key] = {};
    screens.forEach((s) => { m.screens[r.key][s.key] = s.hrOnly ? (r.key === "hr" ? "edit" : "none") : s.d[ri]; });
    actions.forEach((a) => { m.actions[r.key][a.key] = !!a.d[ri]; });
    fields.forEach((f) => {
      if (f.kind === "upload" || f.kind === "master") m.fields[r.key][f.key] = "read";
      else if (f.kind === "input") m.fields[r.key][f.key] = "edit";
    });
  });
  m.fields.compMgr.newRB = "hidden";
  return m;
}

export function accessDemoState() {
  return {
    ok: true, enforced: false, version: 41,
    me: { email: "priya.nair@company.com", empId: "E1001", name: "Priya Nair" },
    catalog: { screens, actions, fields },
    roles,
    matrix: matrix(),
    people: [
      { empId: "E1001", name: "Priya Nair", email: "priya.nair@company.com", active: true, inEM: true, catalystRole: "HR" },
      { empId: "E1044", name: "Raj Mehta", email: "raj.mehta@company.com", active: true, inEM: true },
      { empId: "E1102", name: "Vikram Rao", email: "vikram.rao@company.com", active: true, inEM: true },
      { empId: "E1210", name: "Anita Sharma", email: "anita.sharma@company.com", active: true, inEM: true },
      { empId: "E1233", name: "Suresh Iyer", email: "suresh.iyer@company.com", active: true, inEM: true },
      { empId: "E1301", name: "Meera K", email: "", active: true, inEM: true },
      { empId: "E1355", name: "R. Gupta", email: "r.gupta@company.com", active: false, inEM: true },
      { empId: "E2291", name: "E2291", email: "", active: true, inEM: false },
    ],
    deleg: { techEd: { E1044: 31, E1102: 28 }, compMgr: { E1210: 14, E1233: 12, E1301: 9, E1355: 6, E2291: 7 } },
    overrides: [
      { id: "o1", empId: "E1210", type: "screen", key: "delegation", value: "view", to: "2099-10-31", reason: "Check her team's delegation", by: "priya.nair@company.com", at: "2026-10-01" },
      { id: "o2", empId: "E1044", type: "action", key: "bulkEdit", value: false, to: "", reason: "Bulk edit errors last cycle", by: "priya.nair@company.com", at: "2026-09-29" },
      { id: "o3", empId: "E1102", type: "team", key: "E1233", value: "add", to: "2099-10-31", reason: "Covering Suresh's team", by: "priya.nair@company.com", at: "2026-09-15" },
    ],
    log: [
      { at: "2026-10-01 10:02:11", by: "priya.nair@company.com", kind: "override", target: "E1210", role: "", from: "", to: "Delegation: view (till 2099-10-31)", reason: "Check her team's delegation" },
      { at: "2026-09-29 16:10:40", by: "priya.nair@company.com", kind: "screen", target: "delegation", role: "techEd", from: "view", to: "edit", reason: "Tech EDs raise delegation requests" },
    ],
  };
}

export const accessDemoCycles = {
  ok: true, enforced: false,
  cycles: [{ id: "1001", name: "Apr-26", status: "Active" }, { id: "1002", name: "Apr-27", status: "Upcoming" }],
  activeCycleId: "1001",
};
