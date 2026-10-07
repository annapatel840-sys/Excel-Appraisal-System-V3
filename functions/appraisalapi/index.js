/* =====================================================================
   appraisalapi v32 — Catalyst Advanced I/O function (Node.js 18)
   Serves Appraisal Sheet v31 and Detail screen v28 (one table, one set of keys).
   Table and column names are the SAME as the screen keys in the HTML
   (AppraisalSheet.hikeAmt, AppraisalSheet.pbPaid, …) — see README section 2.
   Sits next to "budgetapi" and "cycleapi" and reuses BudgetOwner / BudgetConfig
   for "who am I" and team scope, and AppraisalCycles / CycleGates for the cycle lock.

   1. Appraisal data (Appraisal sheet grid + Detail screen), with
      field-level limits (hidden / masked / read-only / editable) enforced here.
   2. Settings for the HR config screen (plug the screen in later).
   3. What-if: preview, save scenario, apply to grid, undo.
      SWITCHED OFF for now — see "WHAT-IF RELEASE" further down.

   Endpoints (JSON; the user always comes from the Catalyst session):
     GET  /rows?cycle_id=X                    rows this login may see + what each field allows
     POST /cells                              { cycle_id, changes: [{ empId, field, value }], source }
     GET  /audit?cycle_id=X[&emp_id=E]        edit history (only fields the caller may see)
     GET  /budget?cycle_id=X                  the caller's budget figures, worked out from ALL fields
                                              (so hidden fields still count), same rules as budgetapi
     GET  /settings                           all settings (defaults + what HR saved)
     POST /settings                           HR: { section, value }
     GET  /designations                       New Title list (DesignationMaster)
     GET  /benchmarks?cycle_id=X              hike P25 / median / P75 per band (BandBenchmark)
     GET  /prefs?screen=appraisalSheet        my saved view (UserGridPrefs)
     POST /prefs                              { screen, prefs }  save my view
     -- What-if (only after the WHAT-IF RELEASE switch is turned on) --
     POST /whatif/preview                     { cycle_id, params }
     GET  /scenarios?cycle_id=X               saved scenarios (own; HR sees all)
     POST /scenarios                          { cycle_id, name, params }
     POST /scenarios/:id/apply                re-checks, writes to the grid, logs
     POST /scenarios/:id/undo                 puts back values the apply changed

   Fill in SETTINGS below before deploying.
   ===================================================================== */
'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ---------------------------------------------------------------------
   SETTINGS — the developer fills these in
   --------------------------------------------------------------------- */
const SETTINGS = {
  hrRoles: ['HR', 'App Administrator'],   // Catalyst role names that count as HR

  appraisal: {
    table: 'Appraisal_Sheet',
    cycleColumn: 'cycle_id',
    // Page key -> { col: appraisal sheet column, type, input: can ever be edited }.
    // Keys follow the Appraisal sheet (v23). Add your other columns the same way.
    fields: {
      // ---- identity / master (read-only here; from Employee Master, Delegation or uploads) ----
      empId:             { col: 'emp_Id',             type: 'text',   label: 'Emp ID' },
      name:              { col: 'name',              type: 'text',   label: 'Employee Name' },
      designation:       { col: 'designation',       type: 'text',   label: 'Designation' },
      band:              { col: 'band',              type: 'text',   label: 'Band' },
      compManager:       { col: 'comp_manager',       type: 'text',   label: 'Comp. Manager' },
      superManager:      { col: 'superManager',      type: 'text',   label: 'Tech Ed' },
      managerMail:       { col: 'managerMail',       type: 'text',   label: 'Manager Mail' },
      appraiser:         { col: 'appraiser_tech_ed',         type: 'text',   label: 'Appraiser Tech ed' },
      orgExperience:     { col: 'orgExperience',     type: 'text',   label: 'Wissen exp as on 1st Jan' },
      overallExperience: { col: 'overallExperience', type: 'text',   label: 'Total Experience as on 1st Jan' },
      lastAppraisal:     { col: 'lastAppraisal',     type: 'text',   label: 'Last Appraisal' },
      rating:            { col: 'rating',            type: 'text',   label: 'Manager Rating' },
      interviews:        { col: 'interviews',        type: 'number', label: 'Interview Count' },
      rr:                { col: 'rr',                type: 'text',   label: 'RR%' },
      grossMargin:       { col: 'grossMargin',       type: 'text',   label: 'Gross Margin' },
      atRisk:            { col: 'atRisk',            type: 'text',   label: 'At Risk' },
      yoeRatio:          { col: 'yoeRatio',          type: 'text',   label: 'YoE Ratio' },
      costCenter:        { col: 'costCenter',        type: 'text',   label: 'Cost Center/Client' },
      clientManager:     { col: 'clientManager',     type: 'text',   label: 'Client Manager' },
      clientRating:      { col: 'clientRating',      type: 'text',   label: 'Client Rating' },
      managerFeedback:   { col: 'managerFeedback',   type: 'text',   label: 'Manager feedback' },
      clientFeedback:    { col: 'clientFeedback',    type: 'text',   label: 'Client feedback' },
      // ---- upload only: never editable on any screen ----
      rbPaid:            { col: 'rbPaid',            type: 'number', label: 'RB to be Paid' },
      rbMonth:           { col: 'rbMonth',           type: 'text',   label: 'Month (RB)' },
      pbPaid:            { col: 'pbPaid',            type: 'number', label: 'PB to be Paid' },
      pbMonth:           { col: 'pbMonth',           type: 'text',   label: 'Month (PB)' },
      // ---- current values (from last archived cycle or payroll at Generate) ----
      basePay:           { col: 'basePay',           type: 'number', label: 'Base pay' },
      joiningBonus:      { col: 'joiningBonus',      type: 'number', label: 'Joining Bonus' },
      targetPB:          { col: 'targetPB',          type: 'number', label: 'Target PB allocated' },
      targetPBCriteria:  { col: 'targetPBCriteria',  type: 'text',   label: 'Target PB criteria (current)' },
      prevRemarks:       { col: 'prevRemarks',       type: 'text',   label: 'Last cycle remarks' },
      // ---- inputs ----
      hikeAmt:           { col: 'hikeAmt',           type: 'number', input: true, label: 'Hike Amount' },
      newRB:             { col: 'newRB',             type: 'number', input: true, label: 'Retention Bonus (RB)', floor: 'rbPaid' },
      newPB:             { col: 'newPB',             type: 'number', input: true, label: 'Performance Bonus (PB)', floor: 'pbPaid' },
      newPBInst:         { col: 'newPBInst',         type: 'select', input: true, options: ['1', '2', '3', '4'], label: 'Instalment' },
      tpbNext:           { col: 'tpbNext',           type: 'number', input: true, label: 'Target PB for Next Year' },
      newTargetPBCriteria: { col: 'newTargetPBCriteria', type: 'text', input: true, label: 'Target PB criteria' },
      remarks:           { col: 'remarks',           type: 'text',   input: true, label: 'Comp Manager Remarks' },
      promo:             { col: 'promo',             type: 'select', input: true, options: ['Yes', 'No'], label: 'Eligible for Promotion' },
      newTitle:          { col: 'newTitle',          type: 'text',   input: true, label: 'New Title' }
    }
  },

  // Optional: agreed PB/RB payouts, used as a floor by the What-if. null = no floor check.
  agreedPayouts: null,  // e.g. { table: 'AgreedPayouts', empId: 'emp_id', type: 'payout_type', amount: 'amount', due: 'due_month', status: 'status' }

  // Cycle lock: edits are refused unless the cycle (AppraisalCycles, from cycleapi) is Active, Start Appraisal is done and
  // Finalisation is not done. false = not checked (only for testing before cycleapi is deployed).
  cycleLock: true
};

// Calculated fields (same formulas as Appraisal Sheet v31 computeRow). Not stored. Access = most restrictive of the inputs.
const DERIVED = {
  hikePct:    { label: 'Hike%',                  from: ['hikeAmt', 'basePay'], calc: (e) => (e.basePay ? e.hikeAmt / e.basePay * 100 : 0) },
  newBasePay: { label: 'New Base Salary',        from: ['basePay', 'hikeAmt'], calc: (e) => e.basePay + e.hikeAmt },
  totalBonus: { label: 'Total Bonus-PB and RB',  from: ['newPB', 'newRB'],     calc: (e) => e.newPB + e.newRB },
  totalCtc:   { label: 'Total CTC with Rewards', from: ['basePay', 'hikeAmt', 'newPB', 'newRB'], calc: (e) => e.basePay + e.hikeAmt + e.newPB + e.newRB },
  // These four compare with last cycle, so the page works them out from the history function.
  // They are listed here only so HR can limit them (access follows their inputs).
  totalBonusHikeAmt:   { label: 'Total Bonus Hike Amount',   from: ['newPB', 'newRB'], calc: null },
  totalBonusHikePct:   { label: 'Total Bonus Hike%',         from: ['newPB', 'newRB'], calc: null },
  totalRewardsHikeAmt: { label: 'Total Rewards Hike Amount', from: ['basePay', 'hikeAmt', 'newPB', 'newRB'], calc: null },
  totalRewardsHikePct: { label: 'Total Rewards Hike%',       from: ['basePay', 'hikeAmt', 'newPB', 'newRB'], calc: null }
};

// Tables (see TABLES.md). BudgetOwner and BudgetConfig come from budgetapi.
const T = { audit: 'AppraisalAudit', settings: 'AppSettings', settingsLog: 'AppSettingsLog', scenario: 'WhatIfScenario',
            designation: 'DesignationMaster', benchmark: 'BandBenchmark', prefs: 'UserGridPrefs', agentLog: 'AgentLog',
            owner: 'BudgetOwner', budgetConfig: 'BudgetConfig', budgetCycle: 'BudgetCycle', snapshot: 'BudgetSnapshot',
            cycles: 'AppraisalCycles', gates: 'CycleGates' };
// budgetapi keeps the Detail screen (v19) column keys; this maps them to the keys used here.
// Allocated PB was removed in v28: old keys allocatedPBAmount / totalOfPB now count as Performance Bonus (PB).
const V19_TO_HERE = { currentAnnualBasePay: 'basePay', allocatedPBAmount: 'newPB', targetPBAllocatedForMay: 'targetPB', hikeAmount: 'hikeAmt',
  totalOfPB: 'newPB', newPB: 'newPB', newRB: 'newRB', targetPBNextYear: 'tpbNext', joiningBonus: 'joiningBonus' };

/* Defaults for every settings section. HR's saved values replace a whole section.
   The HR config screen reads and writes exactly these sections. */
const DEFAULT_SETTINGS = {
  history: { cycles: 3 },
  // fieldAccess[field][role] = 'edit' | 'read' | 'mask' | 'hidden'. Missing = default rule below.
  // Roles: 'HR' and the level names from Budget config (e.g. 'Tech ED', 'Comp Manager').
  fieldAccess: {},
  whatif: {
    filters: ['rating', 'designation', 'band', 'compManager', 'superManager', 'promo'],
    targets: ['hikeAmt', 'newPB', 'newRB'],
    methods: ['pct', 'amount', 'median', 'spread'],
    peerField: 'designation',          // "match median" compares with people of the same …
    limits: { minPct: 0, maxPct: 15, round: 1000, floorAgreed: true },
    roles: {}                          // optional per role: { 'Comp Manager': { filters: [...], methods: [...] } }
  },
  detailScreen: {
    topBox: ['designation', 'experience'],
    tabs: [
      { key: 'mgr', label: 'Manager', fields: ['rating', 'promo', 'managerFeedback'], roles: [] },
      { key: 'client', label: 'Client', fields: ['clientManager', 'clientRating', 'clientFeedback'], roles: [] },
      { key: 'other', label: 'Other', fields: ['rr', 'interviews'], roles: [] }
    ]
  },
  consistency: { sameRatingHikeGapPct: 5, highRatingNoHike: 4.0 },
  marquee: { minChangeAmount: 0, minChangePct: 0 },
  // HR default column order and wrap for the Appraisal Sheet grid (HR config screen). Empty order = v31 order.
  gridLayout: { order: [], wrap: {} }
};
const SETTING_SECTIONS = Object.keys(DEFAULT_SETTINGS);

/* ---------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;
function cycleIdOf(v) { const id = String(v || '').trim(); if (!ID_RE.test(id)) throw new HttpError(400, 'cycle_id is missing or invalid.'); return id; }
function num(v) { return Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) || 0; }
function nowDT() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function parseJSON(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function asyncRoute(fn) { return (req, res) => fn(req, res).catch((err) => sendError(res, err)); }
// Rule messages come back as HTTP 200 + ok:false (clean browser console); unexpected errors as 500.
function sendError(res, err) {
  if (err instanceof HttpError) return res.status(200).json({ ok: false, status: err.status, error: err.message });
  console.error(err);
  res.status(500).json({ ok: false, status: 500, error: 'Server error. Please try again.' });
}
async function selectAll(zcql, table, where) {
  const out = []; let last = '0';
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
const byCycle = (col, id) => col + " = '" + id + "'";
async function inBatches(list, size, fn) { for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size)); }
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ---------------------------------------------------------------------
   Settings
   --------------------------------------------------------------------- */
async function loadSettings(zcql) {
  const rows = await selectAll(zcql, T.settings, '');
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), rowids = {};
  rows.forEach((r) => { if (SETTING_SECTIONS.indexOf(r.section) > -1) { s[r.section] = parseJSON(r.value_json, s[r.section]); rowids[r.section] = r.ROWID; } });
  return { settings: s, rowids };
}

/* ---------------------------------------------------------------------
   Who is calling, their role and their team
   --------------------------------------------------------------------- */
async function whoAmI(cat, cycleId) {
  const zcql = cat.zcql();
  const u = await cat.userManagement().getCurrentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  const email = String(u.email_id || '').toLowerCase();
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  const isHR = SETTINGS.hrRoles.indexOf(u.role_details && u.role_details.role_name) > -1;
  const owners = cycleId ? await selectAll(zcql, T.owner, byCycle('cycle_id', cycleId)) : [];
  const own = owners.find((o) => String(o.owner_email || '').toLowerCase() === email) || owners.find((o) => o.owner_name === full);
  const cfg = (await selectAll(zcql, T.budgetConfig, "config_key = 'GLOBAL'"))[0];
  const levels = cfg ? parseJSON(cfg.levels, ['Tech ED', 'Comp Manager']) : ['Tech ED', 'Comp Manager'];
  const name = own ? own.owner_name : (full || 'HR Admin');
  const role = isHR ? 'HR' : own ? (levels[Number(own.level) - 1] || 'Level ' + own.level) : null;
  // team = everyone whose Comp Manager is me or below me
  const kids = (n) => owners.filter((o) => o.parent_name === n).map((o) => o.owner_name);
  const sub = (n) => [n].concat(...kids(n).map(sub));
  return { name, isHR, role, email, team: isHR ? null : (own ? sub(own.owner_name) : []) };
}

/* ---------------------------------------------------------------------
   Field access
   --------------------------------------------------------------------- */
const RANK = { hidden: 0, mask: 1, read: 2, edit: 3 };
function accessMap(settings, role) {
  const fa = settings.fieldAccess || {}, out = {};
  Object.keys(SETTINGS.appraisal.fields).forEach((k) => {
    const def = SETTINGS.appraisal.fields[k].input ? 'edit' : 'read';
    const set = fa[k] && fa[k][role];
    out[k] = RANK[set] !== undefined ? set : def;
    if (!SETTINGS.appraisal.fields[k].input && out[k] === 'edit') out[k] = 'read';   // master data is never edited here
  });
  Object.keys(DERIVED).forEach((k) => {
    const set = fa[k] && fa[k][role];
    let lvl = RANK[set] !== undefined ? Math.min(RANK[set], RANK.read) : RANK.read;
    DERIVED[k].from.forEach((f) => { lvl = Math.min(lvl, Math.min(RANK[out[f]], RANK.read)); });
    out[k] = Object.keys(RANK).find((x) => RANK[x] === lvl);
  });
  // Hike % is the typed pair of Hike Amount: editable when Hike Amount is, unless HR limited Hike % itself.
  const hp = fa.hikePct && fa.hikePct[role];
  if (out.hikeAmt === 'edit' && RANK[out.basePay] >= RANK.read && (!hp || hp === 'edit')) out.hikePct = 'edit';
  return out;
}

function shapeRow(e, acc) {
  const o = {};
  Object.keys(acc).forEach((k) => {
    if (acc[k] === 'hidden') return;
    const v = DERIVED[k] ? (DERIVED[k].calc ? DERIVED[k].calc(e) : undefined) : e[k];
    if (v === undefined) return;
    o[k] = acc[k] === 'mask' ? '•••' : v;
  });
  o.empId = e.empId;   // always present so rows can be addressed
  return o;
}

/* ---------------------------------------------------------------------
   Appraisal rows
   --------------------------------------------------------------------- */
async function loadRows(zcql, cycleId) {
  const A = SETTINGS.appraisal;
  const raw = await selectAll(zcql, A.table, byCycle(A.cycleColumn, cycleId));
  return raw.map((r) => {
    const e = { _rowid: r.ROWID };
    Object.keys(A.fields).forEach((k) => { const f = A.fields[k]; e[k] = f.type === 'number' ? num(r[f.col]) : (r[f.col] == null ? '' : String(r[f.col])); });
    return e;
  });
}
function scoped(rows, me) { return me.isHR ? rows : rows.filter((r) => me.team.indexOf(r.compManager) > -1); }

// Cycle lock (cycleapi v7 tables): open only while the cycle is Active, Start Appraisal is done and Finalisation is not done.
async function cycleLock(zcql, cycleId) {
  if (!SETTINGS.cycleLock) return { locked: false, reason: '' };
  if (!/^\d{1,20}$/.test(cycleId)) return { locked: true, reason: 'Unknown cycle.' };
  const c = (await selectAll(zcql, T.cycles, 'ROWID = ' + cycleId))[0];
  if (!c) return { locked: true, reason: 'Unknown cycle.' };
  if (c.status !== 'Active') return { locked: true, reason: 'The cycle is ' + c.status + ', so appraisal inputs are read-only.' };
  const gates = await selectAll(zcql, T.gates, "cycle_id = '" + cycleId + "'");
  const has = (k) => gates.some((x) => x.gate === k);
  if (!has('startAppraisal')) return { locked: true, reason: 'The appraisal has not started yet. The sheet opens when HR starts the appraisal.' };
  if (has('finalisation')) return { locked: true, reason: 'Appraisal inputs are locked after Finalisation. Raise a change request to HR.' };
  return { locked: false, reason: '' };
}
async function designationList(zcql) {
  const rows = await selectAll(zcql, T.designation, '');
  return rows.filter((r) => r.active === undefined || r.active === null || r.active === true || String(r.active) === 'true')
    .map((r) => String(r.designation || '').trim()).filter(Boolean);
}

async function context(cat, cycleId) {
  const zcql = cat.zcql();
  const me = await whoAmI(cat, cycleId);
  if (!me.isHR && !me.role) throw new HttpError(403, 'You have no team in this cycle.');
  const { settings } = await loadSettings(zcql);
  const lock = await cycleLock(zcql, cycleId);
  const acc = accessMap(settings, me.role);
  if (lock.locked) Object.keys(acc).forEach((k) => { if (acc[k] === 'edit') acc[k] = 'read'; });
  const all = await loadRows(zcql, cycleId);
  return { me, settings, acc, lock, all, rows: scoped(all, me), notes: [], titles: null };
}

// Validates and converts one change. Returns a list of { row, field, value } in stored form,
// because some edits change a second field too (Promo? <-> New Title).
function cleanChange(ctx, ch) {
  let field = String(ch.field || ''), value = ch.value;
  const row = ctx.rows.find((r) => r.empId === String(ch.empId || ''));
  if (!row) throw new HttpError(403, 'Employee ' + ch.empId + ' is not in your team.');
  if (ctx.lock && ctx.lock.locked) throw new HttpError(409, ctx.lock.reason);
  if (field === 'hikePct') {                       // typed Hike% -> Hike Amount (the paired field)
    if (ctx.acc.hikePct !== 'edit') throw new HttpError(403, 'You cannot edit Hike%.');
    field = 'hikeAmt'; value = Math.round(row.basePay * num(value) / 100);
  }
  const f = SETTINGS.appraisal.fields[field];
  if (!f || !f.input) throw new HttpError(400, (f ? f.label : field) + ' cannot be edited.');
  if (ctx.acc[field] !== 'edit') throw new HttpError(403, 'You cannot edit ' + f.label + '.');
  if (f.type === 'number') { value = Math.round(num(value)); if (value < 0) throw new HttpError(422, f.label + ' cannot be negative.'); }
  else if (f.type === 'select') { value = String(value); if (f.options.indexOf(value) < 0) throw new HttpError(422, f.label + ' must be one of ' + f.options.join(', ') + '.'); }
  else value = String(value == null ? '' : value).trim().slice(0, 2000);

  // PB / RB: never below the amount to be paid (upload). A lower amount is saved as the amount to be paid.
  if (f.floor && value < num(row[f.floor])) {
    ctx.notes.push(row.name + ': ' + f.label + ' less than to be paid — ' + num(row[f.floor]) + ' will be paid.');
    value = num(row[f.floor]);
  }
  const out = [{ row, field, value }];
  // Promotion: a different title sets Promo? = Yes; same title / blank / Promo? = No clears New Title.
  if (field === 'newTitle') {
    if (!value || value === row.designation) { out[0].value = ''; out.push({ row, field: 'promo', value: 'No' }); }
    else {
      if (ctx.titles && ctx.titles.length && ctx.titles.indexOf(value) < 0) throw new HttpError(422, value + ' is not in the Designation Master.');
      out.push({ row, field: 'promo', value: 'Yes' });
    }
  }
  if (field === 'promo' && value === 'No') out.push({ row, field: 'newTitle', value: '' });
  out.slice(1).forEach((x) => { if (ctx.acc[x.field] !== 'edit') throw new HttpError(403, 'You cannot edit ' + SETTINGS.appraisal.fields[x.field].label + '.'); });
  return out;
}
const cleanAll = (ctx, list) => [].concat(...list.map((c) => cleanChange(ctx, c)));

// Writes cleaned changes + audit lines. source: 'grid' | 'detail' | 'whatif:<id>' | 'undo:<id>'
async function writeChanges(cat, ctx, cycleId, cleaned, source) {
  const A = SETTINGS.appraisal, byRow = {}, audit = [], at = nowDT();
  cleaned.forEach((c) => {
    const old = c.row[c.field];
    if (String(old) === String(c.value)) return;
    (byRow[c.row._rowid] = byRow[c.row._rowid] || { ROWID: c.row._rowid })[A.fields[c.field].col] = c.value;
    audit.push({ cycle_id: cycleId, emp_id: c.row.empId, field: c.field, old_value: String(old), new_value: String(c.value), source: source, changed_by: ctx.me.name, changed_at: at });
    c.row[c.field] = c.value;
  });
  const updates = Object.keys(byRow).map((k) => byRow[k]);
  await inBatches(updates, 100, (b) => cat.datastore().table(A.table).updateRows(b));
  await inBatches(audit, 100, (b) => cat.datastore().table(T.audit).insertRows(b));
  return audit.length;
}

/* ---------------------------------------------------------------------
   What-if engine (the page uses the same rules for its live preview)
   params = { filters: [{ field, op: eq|neq|gte|lte|in|contains, value }],
              target: 'hikeAmt'|'newPB'|'newRB', method: 'pct'|'amount'|'median'|'spread', value,
              limits: { minPct, maxPct, round, floorAgreed } }
   --------------------------------------------------------------------- */
function numLike(v) { const n = parseFloat(String(v)); return isNaN(n) ? null : n; }   // "4.3 / 5" -> 4.3
function matches(r, flt) {
  const v = r[flt.field], n = numLike(v), x = flt.value;
  switch (flt.op) {
    case 'eq': return String(v) === String(x);
    case 'neq': return String(v) !== String(x);
    case 'gte': return n !== null && n >= Number(x);
    case 'lte': return n !== null && n <= Number(x);
    case 'in': return Array.isArray(x) && x.map(String).indexOf(String(v)) > -1;
    case 'contains': return String(v).toLowerCase().indexOf(String(x).toLowerCase()) > -1;
    default: throw new HttpError(400, 'Unknown filter operator: ' + flt.op);
  }
}
async function agreedFloors(zcql, cycleId) {
  const P = SETTINGS.agreedPayouts; if (!P || !P.table) return {};
  const rows = await selectAll(zcql, P.table, '');
  const out = {};
  rows.forEach((r) => { if (String(r[P.status]) !== 'Scheduled') return; const k = r[P.empId], t = String(r[P.type]);
    out[k] = out[k] || { PB: 0, RB: 0 }; if (out[k][t] !== undefined) out[k][t] += num(r[P.amount]); });
  return out;
}
function checkParams(ctx, p) {
  const W = ctx.settings.whatif, R = (W.roles && W.roles[ctx.me.role]) || {};
  const filters = R.filters || W.filters, methods = R.methods || W.methods;
  if (!p || typeof p !== 'object') throw new HttpError(400, 'What-if parameters are missing.');
  if (W.targets.indexOf(p.target) < 0) throw new HttpError(400, 'The What-if cannot change ' + p.target + '.');
  if (methods.indexOf(p.method) < 0) throw new HttpError(403, 'The method "' + p.method + '" is not available to you.');
  if (ctx.acc[p.target] !== 'edit') throw new HttpError(403, 'You cannot edit ' + SETTINGS.appraisal.fields[p.target].label + '.');
  (p.filters || []).forEach((f) => {
    if (filters.indexOf(f.field) < 0) throw new HttpError(403, 'Filtering on ' + f.field + ' is not available to you.');
    if (ctx.acc[f.field] === 'hidden' || ctx.acc[f.field] === 'mask') throw new HttpError(403, 'You cannot filter on ' + f.field + '.');
  });
  if (!(Number(p.value) >= 0) && p.method !== 'median') throw new HttpError(400, 'Enter a valid value.');
}
async function runWhatIf(cat, ctx, cycleId, p) {
  checkParams(ctx, p);
  const L = Object.assign({}, ctx.settings.whatif.limits, p.limits || {});
  const sel = ctx.rows.filter((r) => (p.filters || []).every((f) => matches(r, f)));
  const floors = L.floorAgreed ? await agreedFloors(cat.zcql(), cycleId) : {};
  const T0 = p.target, isHike = T0 === 'hikeAmt', val = Number(p.value) || 0;
  const baseSum = sel.reduce((s, r) => s + r.basePay, 0);
  const peerKey = ctx.settings.whatif.peerField;
  const out = sel.map((r) => {
    const before = r[T0];
    let after = before;
    if (p.method === 'pct') after = before + r.basePay * val / 100;
    else if (p.method === 'amount') after = before + val;
    else if (p.method === 'spread') after = before + (baseSum ? val * r.basePay / baseSum : 0);
    else if (p.method === 'median') {
      const peers = ctx.rows.filter((x) => x[peerKey] === r[peerKey] && x.basePay);
      after = r.basePay * median(peers.map((x) => x[T0] / x.basePay));
    }
    if (isHike && r.basePay) after = Math.min(Math.max(after, r.basePay * L.minPct / 100), r.basePay * L.maxPct / 100);
    if (L.round > 0) after = Math.round(after / L.round) * L.round;
    const fl = floors[r.empId]; let floorHit = false;
    if (fl) { const kind = T0 === 'newRB' ? 'RB' : T0 === 'newPB' ? 'PB' : null; if (kind && after < fl[kind]) { after = fl[kind]; floorHit = true; } }
    after = Math.max(0, Math.round(after));
    return { empId: r.empId, name: r.name, compManager: r.compManager, before, after, delta: after - before, floorHit,
             pctBefore: r.basePay ? before / r.basePay * 100 : 0, pctAfter: r.basePay ? after / r.basePay * 100 : 0 };
  });
  const byManager = {};
  out.forEach((x) => { byManager[x.compManager] = (byManager[x.compManager] || 0) + x.delta; });
  return { target: T0, count: out.length, totalDelta: out.reduce((s, x) => s + x.delta, 0), byManager, rows: out };
}

/* ---------------------------------------------------------------------
   Routes — appraisal data
   --------------------------------------------------------------------- */
app.get('/rows', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), cycleId = cycleIdOf(req.query.cycle_id);
  const ctx = await context(cat, cycleId);
  const fields = {};
  Object.keys(ctx.acc).forEach((k) => { if (ctx.acc[k] === 'hidden') return;
    const f = SETTINGS.appraisal.fields[k] || DERIVED[k];
    fields[k] = { label: f.label, access: ctx.acc[k], type: f.type || 'number', options: f.options, derived: !!DERIVED[k] }; });
  res.json({ ok: true, me: { name: ctx.me.name, role: ctx.me.role }, locked: ctx.lock.locked, lockReason: ctx.lock.reason, fields,
    rows: ctx.rows.map((r) => shapeRow(r, ctx.acc)) });
}));

app.post('/cells', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), b = req.body || {}, cycleId = cycleIdOf(b.cycle_id);
  const changes = Array.isArray(b.changes) ? b.changes : [];
  if (!changes.length || changes.length > 500) throw new HttpError(400, 'Send between 1 and 500 changes.');
  const ctx = await context(cat, cycleId);
  if (changes.some((c) => c && c.field === 'newTitle')) ctx.titles = await designationList(cat.zcql());
  const cleaned = cleanAll(ctx, changes);                           // all checked first: nothing is saved if one fails
  const source = /^(grid|detail)$/.test(String(b.source)) ? b.source : 'grid';
  const n = await writeChanges(cat, ctx, cycleId, cleaned, source);
  const ids = {}; cleaned.forEach((c) => { ids[c.row.empId] = c.row; });
  res.json({ ok: true, saved: n, notes: ctx.notes, rows: Object.keys(ids).map((k) => shapeRow(ids[k], ctx.acc)) });
}));

app.get('/audit', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), cycleId = cycleIdOf(req.query.cycle_id);
  const ctx = await context(cat, cycleId);
  const mine = {}; ctx.rows.forEach((r) => { mine[r.empId] = true; });
  const emp = req.query.emp_id ? String(req.query.emp_id) : null;
  const list = (await selectAll(cat.zcql(), T.audit, byCycle('cycle_id', cycleId)))
    .filter((a) => mine[a.emp_id] && (!emp || a.emp_id === emp) && ctx.acc[a.field] !== 'hidden')
    .map((a) => ({ empId: a.emp_id, field: a.field, oldValue: ctx.acc[a.field] === 'mask' ? '•••' : a.old_value, newValue: ctx.acc[a.field] === 'mask' ? '•••' : a.new_value,
                   source: a.source, by: a.changed_by, at: a.changed_at }))
    .sort((x, y) => String(y.at).localeCompare(String(x.at)));
  res.json({ ok: true, audit: list });
}));

/* ---------------------------------------------------------------------
   Budget figures for the top bar and drawer. Worked out here from every field,
   so a column hidden from the caller still counts in the team total.
   Same rules as budgetapi: updated = % x budget base of the current team;
   original = % at allocation x budget base of the team at allocation.
   --------------------------------------------------------------------- */
app.get('/budget', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), cycleId = cycleIdOf(req.query.cycle_id), zcql = cat.zcql();
  const me = await whoAmI(cat, cycleId);
  if (!me.isHR && !me.role) throw new HttpError(403, 'You have no team in this cycle.');
  const [owners, cycles, snaps, cfgRows, rows] = await Promise.all([
    selectAll(zcql, T.owner, byCycle('cycle_id', cycleId)), selectAll(zcql, T.budgetCycle, byCycle('cycle_id', cycleId)),
    selectAll(zcql, T.snapshot, byCycle('cycle_id', cycleId)), selectAll(zcql, T.budgetConfig, "config_key = 'GLOBAL'"), loadRows(zcql, cycleId)]);
  const cfg = cfgRows[0] || {};
  const uniq = (a) => a.filter((k, i) => a.indexOf(k) === i);
  const baseCols = uniq(parseJSON(cfg.base_columns, ['currentAnnualBasePay', 'newPB']).map((k) => V19_TO_HERE[k] || k));
  const usedCols = uniq(parseJSON(cfg.utilised_columns, ['hikeAmount']).map((k) => V19_TO_HERE[k] || k));
  const val = (e, k) => num(e[k]);
  const sum = (list, cols) => list.reduce((s, e) => s + cols.reduce((t, k) => t + val(e, k), 0), 0);
  const H = {}; owners.forEach((o) => { H[o.owner_name] = o; });
  const kids = (n) => owners.filter((o) => o.parent_name === n).map((o) => o.owner_name);
  const sub = (n) => [n].concat(...kids(n).map(sub));
  const byId = {}; rows.forEach((r) => { byId[r.empId] = r; });
  const leaver = (s) => { const v = parseJSON(s.values_json, {}), x = {}; Object.keys(v).forEach((k) => { x[V19_TO_HERE[k] || k] = v[k]; }); return x; };
  function node(n) {
    const t = sub(n), cur = rows.filter((r) => t.indexOf(r.compManager) > -1);
    const then = snaps.filter((s) => t.indexOf(s.owner_name) > -1).map((s) => byId[s.emp_id] || leaver(s));
    const o = H[n] || {};
    return { base: sum(cur, baseCols), updated: sum(cur, baseCols) * (Number(o.pct) || 0) / 100, original: sum(then, baseCols) * (Number(o.pct_original) || 0) / 100,
             used: sum(cur, usedCols), tpb: sum(cur, ['tpbNext']), team: cur.length, team0: then.length };
  }
  const names = me.isHR ? owners.filter((o) => !o.parent_name).map((o) => o.owner_name) : [me.name];
  const out = { base: 0, updated: 0, original: 0, used: 0, tpb: 0, team: 0, team0: 0 };
  names.forEach((n) => { const x = node(n); Object.keys(out).forEach((k) => { out[k] += x[k]; }); });
  Object.keys(out).forEach((k) => { if (k !== 'team' && k !== 'team0') out[k] = Math.round(out[k]); });
  res.json(Object.assign({ ok: true, usedColumns: usedCols, baseColumns: baseCols, date: cycles[0] ? String(cycles[0].alloc_date).slice(0, 10) : '' }, out));
}));

/* ---------------------------------------------------------------------
   Routes — settings (the HR config screen plugs in here)
   --------------------------------------------------------------------- */
app.get('/settings', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req);
  const u = await cat.userManagement().getCurrentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  const { settings } = await loadSettings(cat.zcql());
  res.json({ ok: true, settings, sections: SETTING_SECTIONS,
    fieldCatalog: Object.keys(SETTINGS.appraisal.fields).map((k) => ({ key: k, label: SETTINGS.appraisal.fields[k].label, input: !!SETTINGS.appraisal.fields[k].input }))
      .concat(Object.keys(DERIVED).map((k) => ({ key: k, label: DERIVED[k].label, derived: true }))) });
}));

app.post('/settings', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), b = req.body || {};
  const me = await whoAmI(cat, null);
  if (!me.isHR) throw new HttpError(403, 'Only HR can change settings.');
  const section = String(b.section || '');
  if (SETTING_SECTIONS.indexOf(section) < 0) throw new HttpError(400, 'Unknown settings section: ' + section);
  const value = b.value;
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Settings value must be an object.');
  if (section === 'history' && !(Number(value.cycles) >= 1 && Number(value.cycles) <= 10)) throw new HttpError(422, 'Cycles of history must be between 1 and 10.');
  if (section === 'fieldAccess') Object.keys(value).forEach((k) => {
    if (!SETTINGS.appraisal.fields[k] && !DERIVED[k]) throw new HttpError(422, 'Unknown field: ' + k);
    Object.keys(value[k] || {}).forEach((role) => { if (RANK[value[k][role]] === undefined) throw new HttpError(422, 'Access for ' + k + ' must be edit, read, mask or hidden.'); });
  });
  if (section === 'gridLayout') {
    if (!Array.isArray(value.order)) throw new HttpError(422, 'gridLayout.order must be a list of column keys.');
    value.order.forEach((k) => { if (!SETTINGS.appraisal.fields[k] && !DERIVED[k]) throw new HttpError(422, 'Unknown column: ' + k); });
    if (value.wrap && typeof value.wrap !== 'object') throw new HttpError(422, 'gridLayout.wrap must be { key: true/false }.');
  }
  const { settings, rowids } = await loadSettings(cat.zcql());
  const json = JSON.stringify(value), t = cat.datastore().table(T.settings);
  if (rowids[section]) await t.updateRow({ ROWID: rowids[section], value_json: json, updated_by: me.name, updated_at: nowDT() });
  else await t.insertRow({ section, value_json: json, updated_by: me.name, updated_at: nowDT() });
  await cat.datastore().table(T.settingsLog).insertRow({ section, old_json: JSON.stringify(settings[section]), new_json: json, changed_by: me.name, changed_at: nowDT() });
  settings[section] = value;
  res.json({ ok: true, settings });
}));

/* ---------------------------------------------------------------------
   Routes — masters and my view
   --------------------------------------------------------------------- */
async function signedIn(cat) {
  const u = await cat.userManagement().getCurrentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  return { email: String(u.email_id || '').toLowerCase(), name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email_id };
}
// New Title list for "★ Promote" / Designation / New Title (searchable on the page).
app.get('/designations', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req); await signedIn(cat);
  const rows = await selectAll(cat.zcql(), T.designation, '');
  const list = rows.filter((r) => r.active === undefined || r.active === null || r.active === true || String(r.active) === 'true')
    .map((r) => ({ designation: String(r.designation || ''), band: r.band || '', level: Number(r.level) || 0 }))
    .filter((r) => r.designation).sort((a, b) => (a.level - b.level) || a.designation.localeCompare(b.designation));
  res.json({ ok: true, designations: list });
}));
// Hike P25 / median / P75 per band for the out-of-range flag and the agent.
app.get('/benchmarks', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), cycleId = cycleIdOf(req.query.cycle_id); await signedIn(cat);
  const rows = await selectAll(cat.zcql(), T.benchmark, byCycle('cycle_id', cycleId));
  const out = {}; rows.forEach((r) => { out[r.band] = { p25: Number(r.p25) || 0, median: Number(r.median) || 0, p75: Number(r.p75) || 0 }; });
  res.json({ ok: true, benchmarks: out, asOf: rows[0] ? String(rows[0].MODIFIEDTIME || '').slice(0, 10) : '' });
}));
// My view (column widths, wrap, show/hide, filters, sort, density) — one row per user per screen.
const PREF_SCREENS = ['appraisalSheet', 'detail', 'history'];
app.get('/prefs', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), u = await signedIn(cat), screen = String(req.query.screen || 'appraisalSheet');
  if (PREF_SCREENS.indexOf(screen) < 0) throw new HttpError(400, 'Unknown screen.');
  const r = (await selectAll(cat.zcql(), T.prefs, "user_email = '" + u.email.replace(/'/g, "''") + "' AND screen = '" + screen + "'"))[0];
  res.json({ ok: true, prefs: r ? parseJSON(r.prefs_json, {}) : {} });
}));
app.post('/prefs', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req), u = await signedIn(cat), b = req.body || {}, screen = String(b.screen || '');
  if (PREF_SCREENS.indexOf(screen) < 0) throw new HttpError(400, 'Unknown screen.');
  if (!b.prefs || typeof b.prefs !== 'object') throw new HttpError(400, 'prefs must be an object.');
  const json = JSON.stringify(b.prefs); if (json.length > 30000) throw new HttpError(422, 'Saved view is too large.');
  const t = cat.datastore().table(T.prefs);
  const r = (await selectAll(cat.zcql(), T.prefs, "user_email = '" + u.email.replace(/'/g, "''") + "' AND screen = '" + screen + "'"))[0];
  if (r) await t.updateRow({ ROWID: r.ROWID, prefs_json: json, updated_at: nowDT() });
  else await t.insertRow({ user_email: u.email, screen, prefs_json: json, updated_at: nowDT() });
  res.json({ ok: true });
}));

/* ---------------------------------------------------------------------
   Routes — What-if   (SWITCHED OFF for now)
   WHAT-IF RELEASE: put // in front of the first line below and remove // from the second.
   While it is off, none of the What-if calls exist on the server.
   --------------------------------------------------------------------- */
const whatIfReleased = false;
// const whatIfReleased = true;
if (whatIfReleased) {
  app.post('/whatif/preview', asyncRoute(async (req, res) => {
    const cat = catalyst.initialize(req), b = req.body || {}, cycleId = cycleIdOf(b.cycle_id);
    const ctx = await context(cat, cycleId);
    res.json(Object.assign({ ok: true }, await runWhatIf(cat, ctx, cycleId, b.params)));
  }));

  async function loadScenario(cat, ctx, id) {
    if (!/^\d{1,20}$/.test(String(id))) throw new HttpError(400, 'Invalid scenario id.');
    const s = (await selectAll(cat.zcql(), T.scenario, 'ROWID = ' + id))[0];
    if (!s) throw new HttpError(404, 'Scenario not found.');
    if (!ctx.me.isHR && s.owner_name !== ctx.me.name) throw new HttpError(403, 'This scenario belongs to someone else.');
    return s;
  }

  app.get('/scenarios', asyncRoute(async (req, res) => {
    const cat = catalyst.initialize(req), cycleId = cycleIdOf(req.query.cycle_id);
    const me = await whoAmI(cat, cycleId);
    const list = (await selectAll(cat.zcql(), T.scenario, byCycle('cycle_id', cycleId)))
      .filter((s) => me.isHR || s.owner_name === me.name)
      .map((s) => ({ id: s.ROWID, name: s.name, owner: s.owner_name, status: s.status, params: parseJSON(s.params_json, {}), summary: parseJSON(s.summary_json, {}), createdAt: s.created_at, appliedAt: s.applied_at || '' }));
    res.json({ ok: true, scenarios: list });
  }));

  app.post('/scenarios', asyncRoute(async (req, res) => {
    const cat = catalyst.initialize(req), b = req.body || {}, cycleId = cycleIdOf(b.cycle_id);
    const ctx = await context(cat, cycleId);
    const result = await runWhatIf(cat, ctx, cycleId, b.params);
    const name = String(b.name || '').trim().slice(0, 100) || 'Scenario ' + nowDT().slice(0, 16);
    const row = await cat.datastore().table(T.scenario).insertRow({ cycle_id: cycleId, name, owner_name: ctx.me.name, status: 'Saved',
      params_json: JSON.stringify(b.params), summary_json: JSON.stringify({ count: result.count, totalDelta: result.totalDelta, byManager: result.byManager }), created_at: nowDT() });
    res.json({ ok: true, id: row.ROWID, preview: result });
  }));

  // Apply: recalculated now (the grid may have changed since it was saved), then written like any edit.
  app.post('/scenarios/:id/apply', asyncRoute(async (req, res) => {
    const cat = catalyst.initialize(req), b = req.body || {}, cycleId = cycleIdOf(b.cycle_id);
    const ctx = await context(cat, cycleId), s = await loadScenario(cat, ctx, req.params.id);
    if (s.status === 'Applied') throw new HttpError(409, 'This scenario was already applied on ' + s.applied_at + '.');
    const result = await runWhatIf(cat, ctx, cycleId, parseJSON(s.params_json, {}));
    const cleaned = cleanAll(ctx, result.rows.filter((x) => x.delta !== 0).map((x) => ({ empId: x.empId, field: result.target, value: x.after })));
    const n = await writeChanges(cat, ctx, cycleId, cleaned, 'whatif:' + s.ROWID);
    await cat.datastore().table(T.scenario).updateRow({ ROWID: s.ROWID, status: 'Applied', applied_at: nowDT(),
      summary_json: JSON.stringify({ count: result.count, totalDelta: result.totalDelta, byManager: result.byManager, saved: n }) });
    res.json({ ok: true, saved: n, result });
  }));

  // Undo: puts back the old value only where nobody has changed the cell since the apply.
  app.post('/scenarios/:id/undo', asyncRoute(async (req, res) => {
    const cat = catalyst.initialize(req), b = req.body || {}, cycleId = cycleIdOf(b.cycle_id);
    const ctx = await context(cat, cycleId), s = await loadScenario(cat, ctx, req.params.id);
    if (s.status !== 'Applied') throw new HttpError(409, 'Only an applied scenario can be undone.');
    const lines = (await selectAll(cat.zcql(), T.audit, byCycle('cycle_id', cycleId))).filter((a) => a.source === 'whatif:' + s.ROWID);
    const skipped = [], cleaned = [];
    lines.forEach((a) => {
      const row = ctx.rows.find((r) => r.empId === a.emp_id);
      if (!row || String(row[a.field]) !== String(a.new_value)) { skipped.push(a.emp_id); return; }
      cleaned.push(...cleanChange(ctx, { empId: a.emp_id, field: a.field, value: a.old_value }));
    });
    const n = await writeChanges(cat, ctx, cycleId, cleaned, 'undo:' + s.ROWID);
    await cat.datastore().table(T.scenario).updateRow({ ROWID: s.ROWID, status: 'Undone' });
    res.json({ ok: true, restored: n, skipped, note: skipped.length ? 'Some cells were changed after the apply and were left as they are.' : '' });
  }));
}   // end What-if

module.exports = app;
