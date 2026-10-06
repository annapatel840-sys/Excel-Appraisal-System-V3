/* =====================================================================
   accessCore.js — the access rules of the Compensation tool (v5)
   Used by accessapi AND copied into every other function (budgetapi,
   appraisalapi, delegation, letters…) so all of them decide access the same way.

   Order a person's access is decided in:
     1. Locked rule (HR Operations screens = HR Admin only; fixed actions)
     2. Personal override (AccessOverride, not past its end date)
     3. Role setting (RoleScreen / RoleAction / FieldAccess)
   Role of a person: Catalyst role (HR Admin + roles added on the Access screen)
     → else Delegation for the active cycle (Appraiser Tech ED → Tech ED,
       Comp Manager → Comp Manager) → else no access.
   Tables store KEYS, never labels. The list of screens / actions / fields is the
   AccessCatalog table — add a row there to add a screen; no code change.
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   SETTINGS — the developer fills these in (same in every copy)
   --------------------------------------------------------------------- */
const SETTINGS = {
  // Catalyst roles always treated as HR Admin (first login before set-up).
  bootstrapHrRoles: ['App Administrator'],

  employeeMaster: {
    table: 'EmployeeMaster',
    empId: 'emp_id', name: 'emp_name', email: 'email',
    status: 'status', activeValue: 'Active'
  },
  // Delegation must hold EMPLOYEE IDs of the Comp Manager and Appraiser Tech ED.
  delegation: {
    table: 'Delegation', cycleColumn: 'cycle_id', empId: 'emp_id',
    compManagerId: 'comp_manager_id', appraiserTechEdId: 'appraiser_tech_ed_id'
  },
  cycle: { table: 'AppraisalCycles', idColumn: 'ROWID', statusColumn: 'status', activeValue: 'Active' },

  // Row keys used by inScope() in the other functions (page keys on each row).
  rowKeys: { compManagerId: 'compManagerId', appraiserTechEdId: 'appraiserTechEdId' }
};

const T = {
  catalog: 'AccessCatalog', role: 'AccessRole', screen: 'RoleScreen', action: 'RoleAction', field: 'FieldAccess',
  override: 'AccessOverride', log: 'AccessLog', version: 'AccessVersion', seen: 'CatalystRoleSeen'
};

// Built-in roles. Their keys are fixed; labels can be changed in AccessRole.
const BUILT_IN_ROLES = [
  { key: 'hr', label: 'HR Admin', source: 'catalyst', catalystRole: 'HR Admin', seesAll: true, fixed: true },
  { key: 'techEd', label: 'Tech ED', source: 'delegation', seesAll: false, fixed: true },
  { key: 'compMgr', label: 'Comp Manager', source: 'delegation', seesAll: false, fixed: true }
];
// Starting catalogue (written to AccessCatalog by POST /seed). d = defaults for [hr, techEd, compMgr].
const START_CATALOG = [
 {
  "type": "screen",
  "key": "appraisalSheet",
  "label": "Appraisal Sheet",
  "group": "Compensation",
  "hrOnly": false,
  "note": "",
  "d": [
   "edit",
   "edit",
   "edit"
  ]
 },
 {
  "type": "screen",
  "key": "detailScreen",
  "label": "Detail screen",
  "group": "Compensation",
  "hrOnly": false,
  "note": "",
  "d": [
   "edit",
   "edit",
   "edit"
  ]
 },
 {
  "type": "screen",
  "key": "agentTab",
  "label": "Agent tab (right panel)",
  "group": "Compensation",
  "hrOnly": false,
  "note": "Also needs the agentReleased switch on",
  "d": [
   "view",
   "view",
   "view"
  ]
 },
 {
  "type": "screen",
  "key": "budgetAllocation",
  "label": "Budget allocation",
  "group": "Compensation",
  "hrOnly": false,
  "note": "Comp Manager edits only if someone reports to them",
  "d": [
   "view",
   "edit",
   "edit"
  ]
 },
 {
  "type": "screen",
  "key": "teamChanges",
  "label": "Team changes",
  "group": "Compensation",
  "hrOnly": false,
  "note": "",
  "d": [
   "view",
   "view",
   "view"
  ]
 },
 {
  "type": "screen",
  "key": "appraisalLetters",
  "label": "Appraisal Letters",
  "group": "Compensation",
  "hrOnly": false,
  "note": "Tech ED sees letter stats for own team",
  "d": [
   "edit",
   "view",
   "none"
  ]
 },
 {
  "type": "screen",
  "key": "delegation",
  "label": "Delegation",
  "group": "Compensation",
  "hrOnly": false,
  "note": "Tech ED changes go to HR for approval",
  "d": [
   "edit",
   "edit",
   "none"
  ]
 },
 {
  "type": "screen",
  "key": "dashboard",
  "label": "Dashboard",
  "group": "Compensation",
  "hrOnly": false,
  "note": "Org-level numbers HR only; others see own team",
  "d": [
   "view",
   "view",
   "view"
  ]
 },
 {
  "type": "screen",
  "key": "metrics",
  "label": "Metrics screens (Pay vs median\u2026)",
  "group": "Compensation",
  "hrOnly": false,
  "note": "",
  "d": [
   "view",
   "view",
   "view"
  ]
 },
 {
  "type": "screen",
  "key": "budgetConfig",
  "label": "Budget config",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "applyBudget",
  "label": "Apply budget",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "budgetAudit",
  "label": "Budget audit trail",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "cycleMaster",
  "label": "Appraisal Cycle Master",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "employeeMaster",
  "label": "Employee Master \u00b7 Eligibility List",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "payroll",
  "label": "Payroll Data \u00b7 Payroll Upload",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "uploads",
  "label": "Uploads (Band, Benchmarks, PB/RB to be Paid, Counter-offer, History)",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "agentSetup",
  "label": "Agent setup",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "config",
  "label": "Config",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "screen",
  "key": "access",
  "label": "Access",
  "group": "HR Operations",
  "hrOnly": true,
  "note": "",
  "d": []
 },
 {
  "type": "action",
  "key": "bulkEdit",
  "label": "Bulk edit",
  "group": "Editing",
  "fixed": "",
  "d": [
   1,
   1,
   1
  ]
 },
 {
  "type": "action",
  "key": "promote",
  "label": "Promote (Designation cell)",
  "group": "Editing",
  "fixed": "",
  "d": [
   1,
   1,
   1
  ]
 },
 {
  "type": "action",
  "key": "pbRbBelowPreload",
  "label": "New PB / New RB below the preloaded amount",
  "group": "Editing",
  "fixed": "HR override only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "editPbRbToBePaid",
  "label": "Edit PB / RB to be Paid",
  "group": "Editing",
  "fixed": "Upload only \u2014 never editable",
  "d": [
   0,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "setOrgPct",
  "label": "Set org % \u00b7 override per Tech ED",
  "group": "Budget",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "allotNextLevel",
  "label": "Allot budget to next level",
  "group": "Budget",
  "fixed": "",
  "d": [
   0,
   1,
   1
  ]
 },
 {
  "type": "action",
  "key": "changeBudgetConfig",
  "label": "Change budget config",
  "group": "Budget",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "delegateRequest",
  "label": "Delegate (request)",
  "group": "Delegation",
  "fixed": "",
  "d": [
   1,
   1,
   0
  ]
 },
 {
  "type": "action",
  "key": "delegateApprove",
  "label": "Approve delegation",
  "group": "Delegation",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "delegationBulkAssign",
  "label": "Bulk assign",
  "group": "Delegation",
  "fixed": "",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "sendLetters",
  "label": "Generate, review and send letters",
  "group": "Letters",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "exportLetters",
  "label": "Export letters grid (Excel)",
  "group": "Letters",
  "fixed": "",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "exportGrid",
  "label": "Export Appraisal Sheet (Excel)",
  "group": "Editing",
  "fixed": "",
  "d": [
   1,
   1,
   1
  ]
 },
 {
  "type": "action",
  "key": "uploadBenchmarks",
  "label": "Upload / edit benchmarks",
  "group": "Benchmarks",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "agentTyped",
  "label": "Typed questions to the agent",
  "group": "Agent",
  "fixed": "",
  "d": [
   1,
   1,
   1
  ]
 },
 {
  "type": "action",
  "key": "agentWhatIf",
  "label": "Run what-ifs",
  "group": "Agent",
  "fixed": "",
  "d": [
   1,
   1,
   1
  ]
 },
 {
  "type": "action",
  "key": "gridLayout",
  "label": "Column order \u00b7 header wrap",
  "group": "Grid",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "closeCycle",
  "label": "Close the cycle",
  "group": "Cycle",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "previewAs",
  "label": "Preview as another role",
  "group": "Access",
  "fixed": "HR only",
  "d": [
   1,
   0,
   0
  ]
 },
 {
  "type": "action",
  "key": "viewAudit",
  "label": "View audit trails",
  "group": "Access",
  "fixed": "",
  "d": [
   1,
   1,
   0
  ]
 },
 {
  "type": "field",
  "key": "name",
  "label": "Employee",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "designation",
  "label": "Designation",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "compManager",
  "label": "Comp. Manager",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "superManager",
  "label": "Super Manager",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "managerMail",
  "label": "Manager Mail",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "appraiser",
  "label": "Appraiser / Super Manager",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "rbPaid",
  "label": "RB to be Paid",
  "kind": "upload"
 },
 {
  "type": "field",
  "key": "rbMonth",
  "label": "Mo (RB)",
  "kind": "upload"
 },
 {
  "type": "field",
  "key": "pbPaid",
  "label": "PB to be Paid",
  "kind": "upload"
 },
 {
  "type": "field",
  "key": "pbMonth",
  "label": "Mo (PB)",
  "kind": "upload"
 },
 {
  "type": "field",
  "key": "basePay",
  "label": "Current Annual Base Pay",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "targetPB",
  "label": "Target PB Allocated for May",
  "kind": "master"
 },
 {
  "type": "field",
  "key": "newPB",
  "label": "New PB to be Offered",
  "kind": "input"
 },
 {
  "type": "field",
  "key": "newPBInst",
  "label": "Inst.",
  "kind": "input"
 },
 {
  "type": "field",
  "key": "totalPB",
  "label": "Total of PB",
  "kind": "calc",
  "deps": [
   "newPB"
  ]
 },
 {
  "type": "field",
  "key": "newRB",
  "label": "New RB",
  "kind": "input"
 },
 {
  "type": "field",
  "key": "totalBonus",
  "label": "Total Bonus",
  "kind": "calc",
  "deps": [
   "totalPB",
   "newRB"
  ]
 },
 {
  "type": "field",
  "key": "hikeAmt",
  "label": "Hike Amount",
  "kind": "input"
 },
 {
  "type": "field",
  "key": "hikePct",
  "label": "Hike %",
  "kind": "pair",
  "pairOf": "hikeAmt"
 },
 {
  "type": "field",
  "key": "totalCtc",
  "label": "Total CTC with Rewards",
  "kind": "calc",
  "deps": [
   "newBasePay",
   "totalBonus"
  ]
 },
 {
  "type": "field",
  "key": "totalBonusHikeAmt",
  "label": "Total Bonus Hike Amount",
  "kind": "calc",
  "deps": [
   "totalBonus"
  ]
 },
 {
  "type": "field",
  "key": "totalBonusHikePct",
  "label": "Bonus Hike %",
  "kind": "calc",
  "deps": [
   "totalBonus"
  ]
 },
 {
  "type": "field",
  "key": "totalRewardsHikeAmt",
  "label": "Total Rewards Hike Amount",
  "kind": "calc",
  "deps": [
   "totalCtc"
  ]
 },
 {
  "type": "field",
  "key": "totalRewardsHikePct",
  "label": "Rewards Hike %",
  "kind": "calc",
  "deps": [
   "totalCtc"
  ]
 },
 {
  "type": "field",
  "key": "newBasePay",
  "label": "New Base Pay",
  "kind": "calc",
  "deps": [
   "basePay",
   "hikeAmt"
  ]
 },
 {
  "type": "field",
  "key": "tpbNext",
  "label": "Target PB for Next Year",
  "kind": "input"
 },
 {
  "type": "field",
  "key": "promo",
  "label": "Promo?",
  "kind": "input"
 },
 {
  "type": "field",
  "key": "newTitle",
  "label": "New Title",
  "kind": "input"
 },
 {
  "type": "field",
  "key": "remarks",
  "label": "Remarks",
  "kind": "input"
 }
];

const LEVELS = ['none', 'view', 'edit'];
const LIMITS = ['edit', 'read', 'hidden'];          // no masking
const STRICT = { edit: 0, read: 1, hidden: 2 };
const OV_TYPES = ['screen', 'action', 'field', 'role', 'team'];

/* ---------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function nowDT() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function today() { return new Date().toISOString().slice(0, 10); }
function q(v) { return String(v).replace(/'/g, "''"); }
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const ID_RE = /^[A-Za-z0-9_.\-@]{1,150}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ZCQL returns at most 300 rows per query, so read in pages by ROWID. */
async function selectAll(zcql, table, where) {
  const out = [];
  let last = '0';
  for (;;) {
    const cond = (where ? '(' + where + ') AND ' : '') + 'ROWID > ' + last;
    const res = await zcql.executeZCQLQuery('SELECT * FROM ' + table + ' WHERE ' + cond + ' ORDER BY ROWID ASC LIMIT 300');
    const rows = res.map((r) => r[table]);
    out.push(...rows);
    if (rows.length < 300) break;
    last = rows[rows.length - 1].ROWID;
  }
  return out;
}

/* ---------------------------------------------------------------------
   Catalogue, roles, matrix
   --------------------------------------------------------------------- */
async function loadCatalog(zcql) {
  const rows = await selectAll(zcql, T.catalog);
  const src = rows.length ? rows.filter((r) => bool(r.active)).map((r) => ({
    type: r.item_type, key: r.item_key, label: r.label, group: r.grp || '', hrOnly: bool(r.hr_only), fixed: r.fixed_note || '',
    note: r.note || '', kind: r.field_kind || '', deps: r.deps ? String(r.deps).split(',').map((s) => s.trim()).filter(Boolean) : [],
    pairOf: r.pair_of || '', sort: Number(r.sort_order) || 0
  })).sort((a, b) => a.sort - b.sort) : START_CATALOG;
  const C = { screens: [], actions: [], fields: [] };
  src.forEach((c) => { if (c.type === 'screen') C.screens.push(c); else if (c.type === 'action') C.actions.push(c); else if (c.type === 'field') C.fields.push(c); });
  C.screenBy = Object.fromEntries(C.screens.map((x) => [x.key, x]));
  C.actionBy = Object.fromEntries(C.actions.map((x) => [x.key, x]));
  C.fieldBy = Object.fromEntries(C.fields.map((x) => [x.key, x]));
  return C;
}
async function loadRoles(zcql) {
  const rows = await selectAll(zcql, T.role);
  const by = {};
  BUILT_IN_ROLES.forEach((r) => { by[r.key] = Object.assign({}, r); });
  rows.forEach((r) => {
    const base = by[r.role_key] || { key: r.role_key, source: 'catalyst', fixed: false };
    by[r.role_key] = Object.assign(base, {
      label: r.label || base.label, catalystRole: base.source === 'catalyst' ? (r.catalyst_role || base.catalystRole) : undefined,
      seesAll: base.key === 'hr' ? true : bool(r.sees_all), retired: base.fixed ? false : bool(r.retired), rowid: r.ROWID
    });
  });
  return Object.values(by);
}
function defaultLevel(C, s, roleKey) {
  if (s.hrOnly) return roleKey === 'hr' ? 'edit' : 'none';
  const i = ['hr', 'techEd', 'compMgr'].indexOf(roleKey);
  return i > -1 && s.d && s.d[i] ? s.d[i] : (roleKey === 'hr' ? 'edit' : 'none');
}
function defaultAllowed(a, roleKey) {
  const i = ['hr', 'techEd', 'compMgr'].indexOf(roleKey);
  return i > -1 && a.d ? !!a.d[i] : roleKey === 'hr';
}
function defaultLimit(f, roleKey) {
  if (f.kind === 'master' || f.kind === 'upload') return 'read';
  if (f.kind === 'input') return ['hr', 'techEd', 'compMgr'].indexOf(roleKey) > -1 ? 'edit' : 'read';
  return null;
}
async function loadMatrix(zcql, C, roles) {
  const [s, a, f] = await Promise.all([selectAll(zcql, T.screen), selectAll(zcql, T.action), selectAll(zcql, T.field)]);
  const m = { screens: {}, actions: {}, fields: {}, rowids: { screen: {}, action: {}, field: {} } };
  roles.forEach((r) => {
    m.screens[r.key] = {}; m.actions[r.key] = {}; m.fields[r.key] = {};
    C.screens.forEach((x) => { m.screens[r.key][x.key] = defaultLevel(C, x, r.key); });
    C.actions.forEach((x) => { m.actions[r.key][x.key] = defaultAllowed(x, r.key); });
    C.fields.forEach((x) => { const d = defaultLimit(x, r.key); if (d) m.fields[r.key][x.key] = d; });
  });
  s.forEach((x) => { const it = C.screenBy[x.screen_key]; if (!it || !m.screens[x.role_key]) return; m.rowids.screen[x.role_key + '|' + x.screen_key] = x.ROWID; if (!it.hrOnly && LEVELS.indexOf(x.level) > -1) m.screens[x.role_key][x.screen_key] = x.level; });
  a.forEach((x) => { const it = C.actionBy[x.action_key]; if (!it || !m.actions[x.role_key]) return; m.rowids.action[x.role_key + '|' + x.action_key] = x.ROWID; if (!it.fixed) m.actions[x.role_key][x.action_key] = bool(x.allowed); });
  f.forEach((x) => { const it = C.fieldBy[x.field_key]; if (!it || !m.fields[x.role_key]) return; m.rowids.field[x.role_key + '|' + x.field_key] = x.ROWID;
    if ((it.kind === 'input' || it.kind === 'master' || it.kind === 'upload') && LIMITS.indexOf(x.access_limit) > -1 && !(it.kind !== 'input' && x.access_limit === 'edit')) m.fields[x.role_key][x.field_key] = x.access_limit; });
  return m;
}
// Paired field = same as partner; calculated = strictest of its inputs.
function resolveFields(C, lim) {
  C.fields.forEach((f) => { if (f.kind === 'pair') lim[f.key] = lim[f.pairOf]; });
  const seen = {};
  function get(k) {
    const f = C.fieldBy[k]; if (!f) return 'read';
    if (f.kind !== 'calc') return lim[k];
    if (seen[k]) return lim[k] || 'read';
    seen[k] = true;
    let worst = 'read';
    (f.deps || []).forEach((d) => { const v = get(d); if (STRICT[v] > STRICT[worst]) worst = v; });
    return (lim[k] = worst);
  }
  C.fields.forEach((f) => { if (f.kind === 'calc') get(f.key); });
  return lim;
}

/* ---------------------------------------------------------------------
   People: Employee Master + Delegation + Catalyst roles
   --------------------------------------------------------------------- */
async function activeCycleId(zcql) {
  const c = SETTINGS.cycle;
  const rows = await selectAll(zcql, c.table, c.statusColumn + " = '" + q(c.activeValue) + "'");
  return rows[0] ? String(rows[0][c.idColumn]) : null;
}
async function loadDelegation(zcql, cycleId) {
  const d = SETTINGS.delegation, out = { techEd: {}, compMgr: {} };
  if (!cycleId) return out;
  const rows = await selectAll(zcql, d.table, d.cycleColumn + " = '" + q(cycleId) + "'");
  rows.forEach((r) => {
    const t = r[d.appraiserTechEdId], c = r[d.compManagerId];
    if (t) out.techEd[t] = (out.techEd[t] || 0) + 1;
    if (c) out.compMgr[c] = (out.compMgr[c] || 0) + 1;
  });
  return out;
}
function emRow(r) {
  const e = SETTINGS.employeeMaster;
  return { empId: String(r[e.empId]), name: r[e.name] || String(r[e.empId]), email: String(r[e.email] || '').toLowerCase(), active: String(r[e.status]) === e.activeValue, inEM: true };
}
async function findEmployee(zcql, by, value) {
  const e = SETTINGS.employeeMaster;
  const rows = await selectAll(zcql, e.table, (by === 'email' ? e.email : e.empId) + " = '" + q(value) + "'");
  return rows[0] ? emRow(rows[0]) : null;
}
function overrideRow(o) {
  return { id: String(o.ROWID), empId: o.emp_id, type: o.ov_type, key: o.target_key || '', value: o.ov_type === 'action' ? bool(o.value) : o.value,
    to: o.end_date || '', reason: o.reason || '', by: o.set_by || '', at: String(o.set_at || '').slice(0, 10) };
}
async function loadOverrides(zcql, empId) {
  const rows = await selectAll(zcql, T.override, empId ? "emp_id = '" + q(empId) + "'" : null);
  return rows.filter((o) => !bool(o.removed)).map(overrideRow);
}
const live = (o) => !o.to || o.to >= today();

/* ---------------------------------------------------------------------
   Effective access of one person
   --------------------------------------------------------------------- */
function baseRoleOf(roles, person, catalystRole, deleg) {
  const cr = roles.find((r) => r.source === 'catalyst' && !r.retired && r.catalystRole && r.catalystRole === catalystRole);
  if (cr) return { role: cr.key, from: 'Catalyst role' };
  if (person && deleg.techEd[person.empId] != null) return { role: 'techEd', from: 'Delegation' };
  if (person && deleg.compMgr[person.empId] != null) return { role: 'compMgr', from: 'Delegation' };
  return { role: '', from: 'No role' };
}
function accessOf(C, roles, m, person, roleKey, ovs) {
  const mine = ovs.filter(live);
  const ro = mine.find((o) => o.type === 'role' && roles.some((r) => r.key === o.value && !r.retired));
  const role = ro ? ro.value : roleKey;
  const screens = {}, actions = {}, lim = {};
  C.screens.forEach((s) => {
    if (!role) { screens[s.key] = 'none'; return; }
    if (s.hrOnly) { screens[s.key] = role === 'hr' ? 'edit' : 'none'; return; }
    const o = mine.find((x) => x.type === 'screen' && x.key === s.key);
    screens[s.key] = o ? o.value : m.screens[role][s.key];
  });
  C.actions.forEach((a) => {
    if (!role) { actions[a.key] = false; return; }
    const o = a.fixed ? null : mine.find((x) => x.type === 'action' && x.key === a.key);
    actions[a.key] = o ? !!o.value : !!m.actions[role][a.key];
  });
  C.fields.forEach((f) => { if (f.kind !== 'calc' && f.kind !== 'pair') lim[f.key] = role ? m.fields[role][f.key] : 'hidden'; });
  mine.forEach((o) => { if (o.type === 'field' && lim[o.key] !== undefined && !(C.fieldBy[o.key].kind !== 'input' && o.value === 'edit')) lim[o.key] = o.value; });
  resolveFields(C, lim);
  return { role, roleOverride: !!ro, screens, actions, fields: lim, teams: mine.filter((o) => o.type === 'team').map((o) => o.key) };
}

/* get(cat): who is signed in and what they may do. Throws 401/403. */
async function get(cat) {
  const u = await cat.userManagement().getCurrentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  const email = String(u.email_id || '').toLowerCase();
  const catalystRole = u.role_details && u.role_details.role_name;
  const zcql = cat.zcql();
  const [C, roles, person, cycleId] = await Promise.all([loadCatalog(zcql), loadRoles(zcql), findEmployee(zcql, 'email', email), activeCycleId(zcql)]);
  const deleg = await loadDelegation(zcql, cycleId);
  let base = baseRoleOf(roles, person, catalystRole, deleg);
  if (!base.role && SETTINGS.bootstrapHrRoles.indexOf(catalystRole) > -1) base = { role: 'hr', from: 'Catalyst bootstrap' };
  if (base.role !== 'hr' && base.from !== 'Catalyst role') {
    if (!person) throw new HttpError(403, 'Your login email is not in the Employee Master. Please contact HR.');
    if (!person.active) throw new HttpError(403, 'You are inactive in the Employee Master. Please contact HR.');
  }
  const m = await loadMatrix(zcql, C, roles);
  const ovs = person ? await loadOverrides(zcql, person.empId) : [];
  const a = accessOf(C, roles, m, person, base.role, ovs);
  if (!a.role) throw new HttpError(403, 'You have no access to the Compensation tool. Please contact HR.');
  const ro = roles.find((r) => r.key === a.role);
  const scope = ro.seesAll ? { all: true } : {
    all: false, cycleId,
    owners: [].concat(person && a.role === 'techEd' ? [{ empId: person.empId, field: 'appraiserTechEdId' }] : [])
      .concat(person && a.role === 'compMgr' ? [{ empId: person.empId, field: 'compManagerId' }] : [])
      .concat(a.teams.map((id) => ({ empId: id, field: deleg.techEd[id] != null ? 'appraiserTechEdId' : 'compManagerId' })))
  };
  return { user: { email, empId: person ? person.empId : '', name: person ? person.name : email }, role: a.role, roleLabel: ro.label, roleFrom: a.roleOverride ? 'Override' : base.from,
    screens: a.screens, actions: a.actions, fields: a.fields, scope };
}
const RANK = { none: 0, view: 1, edit: 2 };
function requireScreen(a, key, level) { if (RANK[a.screens[key] || 'none'] < RANK[level || 'view']) throw new HttpError(403, 'You do not have access to this screen.'); }
function requireAction(a, key) { if (!a.actions[key]) throw new HttpError(403, 'You are not allowed to do this.'); }
function canEdit(a, fieldKey) { return a.fields[fieldKey] === 'edit'; }
function inScope(a, row) {
  if (a.scope.all) return true;
  return (a.scope.owners || []).some((o) => String(row[SETTINGS.rowKeys[o.field]]) === String(o.empId));
}
function shapeRow(a, row) { const out = {}; Object.keys(row).forEach((k) => { if (a.fields[k] !== 'hidden') out[k] = row[k]; }); return out; }

/* Version — raised on every change that can alter anyone's access. Other functions call
   bumpVersion() after Delegation / Employee Master changes. */
async function getVersion(zcql) {
  const rows = await selectAll(zcql, T.version, "version_key = 'ACCESS'");
  return rows[0] ? { version: Number(rows[0].version) || 1, rowid: rows[0].ROWID } : { version: 1, rowid: null };
}
async function bumpVersion(cat, by, why) {
  const zcql = cat.zcql(), v = await getVersion(zcql), t = cat.datastore().table(T.version);
  const row = { version_key: 'ACCESS', version: v.version + 1, changed_by: by || '', changed_at: nowDT(), why: String(why || '').slice(0, 200) };
  if (v.rowid) await t.updateRow(Object.assign({ ROWID: v.rowid }, row)); else await t.insertRow(row);
  return v.version + 1;
}

module.exports = {
  SETTINGS, T, BUILT_IN_ROLES, START_CATALOG, LEVELS, LIMITS, OV_TYPES, HttpError, nowDT, today, q, bool, ID_RE, DATE_RE,
  selectAll, loadCatalog, loadRoles, loadMatrix, resolveFields, activeCycleId, loadDelegation, emRow, findEmployee,
  loadOverrides, live, baseRoleOf, accessOf, get, requireScreen, requireAction, canEdit, inScope, shapeRow, getVersion, bumpVersion
};
