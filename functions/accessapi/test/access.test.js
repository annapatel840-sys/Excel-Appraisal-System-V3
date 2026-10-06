/* Plain-node test for accessapi + accessCore.
   Run:  node functions/accessapi/test/access.test.js
   Stubs zcatalyst-sdk-node with an in-memory Data Store + ZCQL. */
'use strict';

const Module = require('module');
const path = require('path');
const assert = require('assert');

/* ------------------------------------------------------------------ */
/* In-memory Catalyst stub                                             */
/* ------------------------------------------------------------------ */
const DB = {};             // table -> rows
let nextId = 1000n;
const stats = { queries: 0, log: [] };
const fail = { table: null, op: null, after: 0 };   // fail the (after+1)-th op on table
let users = [];            // getAllUsers

function tbl(name) { return (DB[name] = DB[name] || []); }
function cleanVal(v) { return typeof v === 'boolean' ? String(v) : v; }   // Catalyst returns booleans as strings
function maybeFail(table, op) {
  if (fail.table === table && fail.op === op) {
    if (fail.after <= 0) { fail.table = null; throw new Error('Injected write failure on ' + table + ' ' + op); }
    fail.after--;
  }
}
function insert(name, row) {
  const r = {};
  Object.keys(row).forEach((k) => { r[k] = cleanVal(row[k]); });
  r.ROWID = String(nextId++);
  tbl(name).push(r);
  return Object.assign({}, r);
}
function parseVal(s) {
  s = s.trim();
  if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
}
function splitAnd(cond) {
  // split on AND outside quotes
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < cond.length; i++) {
    const ch = cond[i];
    if (ch === "'") { if (inQ && cond[i + 1] === "'") { cur += "''"; i++; continue; } inQ = !inQ; }
    if (!inQ && cond.slice(i, i + 5).toUpperCase() === ' AND ') { out.push(cur); cur = ''; i += 4; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^\(+/, '').replace(/\)+$/, '').trim());
}
function execZcql(sql) {
  stats.queries++; stats.log.push(sql);
  const m = sql.match(/^SELECT \* FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY ROWID ASC)?(?: LIMIT (\d+))?$/i);
  if (!m) throw new Error('Stub ZCQL cannot parse: ' + sql);
  const [, table, where, limit] = m;
  let rows = tbl(table).slice();
  if (where) {
    splitAnd(where).forEach((term) => {
      const t = term.match(/^(\w+)\s*(=|>)\s*(.+)$/);
      if (!t) throw new Error('Stub ZCQL cannot parse term: ' + term);
      const [, col, op, raw] = t, val = parseVal(raw);
      rows = rows.filter((r) => {
        if (op === '>') return BigInt(String(r[col])) > BigInt(val);
        return r[col] != null && String(r[col]) === String(val);
      });
    });
  }
  rows.sort((a, b) => (BigInt(a.ROWID) < BigInt(b.ROWID) ? -1 : 1));
  if (limit) rows = rows.slice(0, Number(limit));
  return rows.map((r) => ({ [table]: Object.assign({}, r) }));
}
function makeApp(req) {
  const h = (req && req.headers) || {};
  return {
    userManagement: () => ({
      getCurrentUser: async () => (h['x-user-email'] ? { email_id: h['x-user-email'], role_details: { role_name: h['x-user-role'] || 'App User' } } : null),
      getAllUsers: async () => users
    }),
    zcql: () => ({ executeZCQLQuery: async (sql) => execZcql(sql) }),
    datastore: () => ({
      table: (name) => ({
        insertRow: async (row) => { maybeFail(name, 'insert'); return insert(name, row); },
        insertRows: async (rows) => {
          if (rows.length > 200) throw new Error('insertRows > 200');
          maybeFail(name, 'insert');
          return rows.map((r) => insert(name, r));
        },
        updateRow: async (row) => {
          maybeFail(name, 'update');
          const r = tbl(name).find((x) => x.ROWID === String(row.ROWID));
          if (!r) throw new Error('No row ' + row.ROWID);
          Object.keys(row).forEach((k) => { if (k !== 'ROWID') r[k] = cleanVal(row[k]); });
          return Object.assign({}, r);
        },
        deleteRow: async (id) => { DB[name] = tbl(name).filter((x) => x.ROWID !== String(id)); return true; },
        deleteRows: async (ids) => {
          if (ids.length > 200) throw new Error('deleteRows > 200');
          const s = new Set(ids.map(String)); DB[name] = tbl(name).filter((x) => !s.has(x.ROWID)); return true;
        }
      })
    })
  };
}
const STUB_ID = '__zcatalyst_stub__';
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'zcatalyst-sdk-node') return STUB_ID;
  return origResolve.call(this, request, ...rest);
};
require.cache[STUB_ID] = { id: STUB_ID, filename: STUB_ID, loaded: true, exports: { initialize: (req) => makeApp(req) } };

const A = require(path.join(__dirname, '..', 'accessCore.js'));
const app = require(path.join(__dirname, '..', 'index.js'));

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
const EM = 'Employee_Master', DEL = 'Delegation', CYC = 'Appraisal_Cycle_Master', SHEET = 'Appraisal_Sheet';
function em(id, name, email, status, tech) { return insert(EM, { emp_id: id, emp_name: name, email_id: email, emp_status: status || 'Active', appraiser_tech_ed: tech || '' }); }
const cOld = insert(CYC, { cycle_name: 'FY2025', status: 'Closed' });
const cAct = insert(CYC, { cycle_name: 'FY2026', status: 'Active' });
const cNext = insert(CYC, { cycle_name: 'FY2027', status: 'Upcoming' });
em('EMP0001', 'Hema R', 'hr@x.com');
em('EMP0051', 'Ashok Kumar', 'ashok@x.com');
em('EMP0060', 'Priya Shah', 'priya@x.com');
em('EMP0070', 'Ina Active', 'inactive@x.com', 'Inactive');
em('EMP0080', 'Ravi Kumar', 'ravi1@x.com');
em('EMP0081', 'Ravi Kumar', 'ravi2@x.com');
em('EMP0090', 'Neha Rao', 'neha@x.com');
em('EMP0100', 'Emp A', 'a@x.com', 'Active', 'EMP0051 - Ashok Kumar');
em('EMP0101', 'Emp B', 'b@x.com', 'Active', 'emp0051 - Ashok Kumar');
em('EMP0102', 'Emp C', 'c@x.com', 'Active', 'Someone Without Id');
function del(cycle, emp, cm, te) { return insert(DEL, { cycle_id: cycle, emp_id: emp, comp_manager_id: cm, appraiser_tech_ed_id: te }); }
del(cAct.ROWID, 'EMP0100', 'EMP0060', 'EMP0051');
del(cAct.ROWID, 'EMP0101', 'EMP0090', 'emp0051 ');
del(cAct.ROWID, 'EMP0102', 'EMP0090', 'EMP0070');
del(cAct.ROWID, 'EMP0051', 'EMP0060', 'EMP0051');   // self — must not be in own scope
del(cOld.ROWID, 'EMP0103', 'EMP0060', 'EMP0051');   // other cycle
insert(SHEET, { emp_id: 'EMP0100', name: 'Emp A', comp_manager: 'Priya Shah', hike_amount: 10 });
insert(SHEET, { emp_id: 'EMP0101', name: 'Emp B', comp_manager: 'priya  SHAH.' });
insert(SHEET, { emp_id: 'EMP0102', name: 'Emp C', comp_manager: 'Ravi Kumar' });
insert(SHEET, { emp_id: 'EMP0200', name: 'Sheet Only', comp_manager: 'Unknown Person', appraiser_tech_ed: 'EMP0051 - Ashok Kumar' });
users = [{ email_id: 'hr@x.com', role_details: { role_name: 'HR' }, first_name: 'Hema' }];

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */
let base, server;
const results = [];
async function call(method, url, who, body) {
  const headers = { 'content-type': 'application/json' };
  if (who) { headers['x-user-email'] = who.email; headers['x-user-role'] = who.role || 'App User'; }
  const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  j._http = r.status;
  return j;
}
const U = {
  admin: { email: 'admin@x.com', role: 'App Administrator' },
  hr: { email: 'HR@x.com', role: 'HR' },
  ashok: { email: 'ashok@x.com' }, priya: { email: 'priya@x.com' }, b: { email: 'b@x.com' },
  inactive: { email: 'inactive@x.com' }, nobody: { email: 'nobody@x.com' }
};
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name]); console.log('FAIL', name, '\n   ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e); }
}
const sorted = (a) => a.slice().sort();
const fakeReq = (who) => ({ headers: who ? { 'x-user-email': who.email, 'x-user-role': who.role || 'App User' } : {} });
const count = (t, f) => tbl(t).filter(f || (() => true)).length;
const version = () => Number((tbl('AccessVersion')[0] || {}).version || 0);

(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  delete process.env.ACCESS_ENFORCE;

  await test('seed by App Administrator writes catalogue, defaults and version 1', async () => {
    const r = await call('POST', '/seed', U.admin);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.enforced, false);
    assert.strictEqual(count('AccessCatalog'), 12 + 9 + 37);
    assert.strictEqual(count('RoleScreen'), 7 * 3);
    assert.strictEqual(count('RoleAction'), 7 * 3);     // 2 fixed actions have no rows
    assert.strictEqual(version(), 1);
    const again = await call('POST', '/seed', U.admin);
    assert.strictEqual(again.rowsWritten, 0);
  });

  await test('catalogue matches the spec (keys, order, hrOnly, fixed, kinds, deps, pairOf)', async () => {
    const C = await A.loadCatalog(makeApp().zcql());
    assert.deepStrictEqual(C.screens.map((s) => s.key), ['dashboard', 'appraisalSheet', 'detailScreen', 'budgetAllocation', 'budgetDistribution', 'teamChanges', 'delegation', 'employeeMaster', 'cycleMaster', 'payroll', 'settings', 'access']);
    assert.deepStrictEqual(C.screens.filter((s) => s.hrOnly).map((s) => s.key), ['employeeMaster', 'cycleMaster', 'payroll', 'settings', 'access']);
    assert.deepStrictEqual(C.actions.filter((a) => a.fixed).map((a) => a.key), ['delegateApprove', 'changeBudgetConfig']);
    assert.strictEqual(C.fieldBy.hikePct.pairOf, 'hikeAmount');
    assert.deepStrictEqual(C.fieldBy.totalBonusHikePct.deps, ['totalBonus', 'rbToBePaid', 'pbToBePaid']);
    assert.strictEqual(C.fieldBy.rbToBePaid.kind, 'upload');
    assert.strictEqual(A.FIELD_COLUMNS.targetPBAllocatedForMay, 'target_pb_allocated_for_may');
  });

  await test('HR via Catalyst role HR (sees all); App Administrator = bootstrap HR', async () => {
    const r = await call('GET', '/me', U.hr);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.role, 'hr'); assert.strictEqual(r.roleLabel, 'HR Admin'); assert.strictEqual(r.roleFrom, 'Catalyst role');
    assert.deepStrictEqual(r.scope, { all: true });
    assert.strictEqual(r.user.empId, 'EMP0001');
    assert.strictEqual(r.screens.access, 'edit');
    assert.strictEqual(r.enforced, false);
    const ad = await call('GET', '/me', U.admin);
    assert.strictEqual(ad.role, 'hr'); assert.strictEqual(ad.roleFrom, 'Catalyst bootstrap');
  });

  await test('/admin/state: 403 for non-HR, full state for HR', async () => {
    const n = await call('GET', '/admin/state', U.ashok);
    assert.strictEqual(n.ok, false); assert.strictEqual(n.status, 403); assert.strictEqual(n._http, 200);
    const h = await call('GET', '/admin/state', U.hr);
    assert.strictEqual(h.ok, true, JSON.stringify(h));
    assert.strictEqual(h.catalog.screens.length, 12);
    assert.ok(h.people.some((p) => p.empId === 'EMP0051'));
    assert.strictEqual(typeof h.enforced, 'boolean');
  });

  await test('Tech ED / Comp Manager from Delegation of the Active cycle; scope excludes self', async () => {
    const t = await call('GET', '/me', U.ashok);
    assert.strictEqual(t.role, 'techEd', JSON.stringify(t)); assert.strictEqual(t.roleFrom, 'Delegation');
    assert.deepStrictEqual(sorted(t.scope.empIds), ['EMP0100', 'EMP0101']);
    assert.strictEqual(t.scope.all, false); assert.strictEqual(t.scope.cycleId, cAct.ROWID);
    assert.strictEqual(t.screens.employeeMaster, 'none'); assert.strictEqual(t.screens.delegation, 'edit');
    const c = await call('GET', '/me', U.priya);
    assert.strictEqual(c.role, 'compMgr');
    assert.deepStrictEqual(sorted(c.scope.empIds), ['EMP0051', 'EMP0100']);
    assert.strictEqual(c.screens.delegation, 'none'); assert.strictEqual(c.actions.allotNextLevel, true); assert.strictEqual(c.actions.viewAudit, false);
  });

  await test('no Active cycle → non-HR refused, HR still in', async () => {
    tbl(CYC).find((r) => r.ROWID === cAct.ROWID).status = 'Closed'; A.resetCache();
    const t = await call('GET', '/me', U.ashok);
    assert.strictEqual(t.ok, false); assert.strictEqual(t.status, 403);
    assert.strictEqual((await call('GET', '/me', U.hr)).ok, true);
    tbl(CYC).find((r) => r.ROWID === cAct.ROWID).status = 'Active'; A.resetCache();
    assert.strictEqual((await call('GET', '/me', U.ashok)).ok, true);
  });

  await test('inactive in Employee_Master / email not found / no team → refused', async () => {
    const i = await call('GET', '/me', U.inactive);
    assert.strictEqual(i.ok, false); assert.match(i.error, /inactive/i); assert.strictEqual(i.enforced, false);
    const n = await call('GET', '/me', U.nobody);
    assert.strictEqual(n.ok, false); assert.match(n.error, /not in the Employee Master/);
    const b = await call('GET', '/me', U.b);
    assert.strictEqual(b.ok, false); assert.match(b.error, /no access/);
  });

  await test('hrOnly screens locked; fixed actions; calc/pair/master/upload edits refused — nothing saved', async () => {
    const before = [count('RoleScreen'), count('RoleAction'), count('FieldAccess'), version()];
    const cases = [
      { kind: 'screen', role: 'techEd', key: 'employeeMaster', to: 'view' },
      { kind: 'action', role: 'techEd', key: 'delegateApprove', to: true },
      { kind: 'field', role: 'techEd', key: 'totalBonus', to: 'hidden' },
      { kind: 'field', role: 'techEd', key: 'hikePct', to: 'hidden' },
      { kind: 'field', role: 'techEd', key: 'name', to: 'edit' },
      { kind: 'field', role: 'techEd', key: 'rbToBePaid', to: 'edit' },
      { kind: 'ovAdd', ov: { empId: 'EMP0051', type: 'screen', key: 'access', value: 'view' } },
      { kind: 'ovAdd', ov: { empId: 'EMP0051', type: 'field', key: 'name', value: 'edit' } }
    ];
    for (const c of cases) {
      const r = await call('POST', '/apply', U.hr, { reason: 'test', changes: [{ kind: 'screen', role: 'techEd', key: 'dashboard', to: 'none' }, c] });
      assert.strictEqual(r.ok, false, JSON.stringify(c)); assert.ok([409, 422].includes(r.status), JSON.stringify(r));
    }
    assert.deepStrictEqual([count('RoleScreen'), count('RoleAction'), count('FieldAccess'), version()], before);
    const t = await call('GET', '/me', U.ashok);
    assert.strictEqual(t.screens.dashboard, 'view');
  });

  await test('/apply: version bump; calc follows strictest dep; hikePct follows hikeAmount', async () => {
    const v0 = version();
    const r = await call('POST', '/apply', U.hr, { reason: 'tighten', changes: [
      { kind: 'field', role: 'compMgr', key: 'allocatedPBAmount', to: 'hidden' },
      { kind: 'field', role: 'compMgr', key: 'hikeAmount', to: 'read' },
      { kind: 'screen', role: 'compMgr', key: 'teamChanges', to: 'none' }
    ] });
    assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.version, v0 + 1); assert.strictEqual(version(), v0 + 1);
    const c = await call('GET', '/me', U.priya);
    assert.strictEqual(c.version, v0 + 1);
    assert.strictEqual(c.fields.allocatedPBAmount, 'hidden');
    assert.strictEqual(c.fields.totalOfPB, 'hidden'); assert.strictEqual(c.fields.totalBonus, 'hidden'); assert.strictEqual(c.fields.totalCTCWithRewards, 'hidden');
    assert.strictEqual(c.fields.hikeAmount, 'read'); assert.strictEqual(c.fields.hikePct, 'read'); assert.strictEqual(c.fields.newBaseSalary, 'read');
    assert.strictEqual(c.fields.newRB, 'edit'); assert.strictEqual(c.fields.name, 'read');
    assert.strictEqual(c.screens.teamChanges, 'none');
    assert.ok(count('AccessLog', (l) => l.reason === 'tighten') === 3);
  });

  await test('/apply all-or-nothing: failed write rolls back earlier writes, version unchanged', async () => {
    const v0 = version(), rs = count('RoleScreen'), fa = count('FieldAccess');
    const lvl = tbl('RoleScreen').find((x) => x.role_key === 'techEd' && x.screen_key === 'dashboard').level;
    fail.table = 'RoleAction'; fail.op = 'update'; fail.after = 0;
    const r = await call('POST', '/apply', U.hr, { reason: 'boom', changes: [
      { kind: 'screen', role: 'techEd', key: 'dashboard', to: 'edit' },
      { kind: 'field', role: 'techEd', key: 'newRB', to: 'read' },
      { kind: 'action', role: 'techEd', key: 'bulkEdit', to: false }
    ] });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.status, 500);
    assert.strictEqual(fail.table, null, 'failure was injected');
    assert.strictEqual(version(), v0); assert.strictEqual(count('RoleScreen'), rs); assert.strictEqual(count('FieldAccess'), fa);
    assert.strictEqual(tbl('RoleScreen').find((x) => x.role_key === 'techEd' && x.screen_key === 'dashboard').level, lvl);
    assert.strictEqual(count('AccessLog', (l) => l.reason === 'boom'), 0);
  });

  await test('overrides: extra team, role, screen, action, field; expired ignored', async () => {
    const d = new Date(Date.now() + 330 * 60000 + 10 * 86400000).toISOString().slice(0, 10);
    const r = await call('POST', '/apply', U.hr, { reason: 'ovs', changes: [
      { kind: 'ovAdd', ov: { empId: 'EMP0051', type: 'team', key: 'EMP0090', to: d } },
      { kind: 'ovAdd', ov: { empId: 'EMP0101', type: 'role', value: 'compMgr' } },
      { kind: 'ovAdd', ov: { empId: 'EMP0060', type: 'screen', key: 'delegation', value: 'view', to: d } },
      { kind: 'ovAdd', ov: { empId: 'EMP0060', type: 'action', key: 'viewAudit', value: true } },
      { kind: 'ovAdd', ov: { empId: 'EMP0051', type: 'field', key: 'hikeAmount', value: 'hidden' } }
    ] });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const t = await call('GET', '/me', U.ashok);
    assert.deepStrictEqual(sorted(t.scope.empIds), ['EMP0100', 'EMP0101', 'EMP0102']);
    assert.strictEqual(t.fields.hikeAmount, 'hidden'); assert.strictEqual(t.fields.hikePct, 'hidden');
    assert.strictEqual(t.fields.newBaseSalary, 'hidden'); assert.strictEqual(t.fields.totalRewardsHikeAmount, 'hidden'); assert.strictEqual(t.fields.totalRewardsHikePct, 'hidden');
    const b = await call('GET', '/me', U.b);
    assert.strictEqual(b.ok, true, JSON.stringify(b)); assert.strictEqual(b.role, 'compMgr'); assert.strictEqual(b.roleFrom, 'Override'); assert.deepStrictEqual(b.scope.empIds, []);
    const p = await call('GET', '/me', U.priya);
    assert.strictEqual(p.screens.delegation, 'view'); assert.strictEqual(p.actions.viewAudit, true);
    // expired (yesterday IST) — written directly, must be ignored
    const y = new Date(Date.now() + 330 * 60000 - 86400000).toISOString().slice(0, 10);
    insert('AccessOverride', { emp_id: 'EMP0060', ov_type: 'action', target_key: 'bulkEdit', value: 'false', end_date: y, removed: false });
    insert('AccessOverride', { emp_id: 'EMP0060', ov_type: 'screen', target_key: 'dashboard', value: 'edit', end_date: A.today(), removed: false });
    A.resetCache();
    const p2 = await call('GET', '/me', U.priya);
    assert.strictEqual(p2.actions.bulkEdit, true, 'expired override ignored');
    assert.strictEqual(p2.screens.dashboard, 'edit', 'override ending today still live');
    // past end date refused by /apply
    const bad = await call('POST', '/apply', U.hr, { reason: 'x', changes: [{ kind: 'ovAdd', ov: { empId: 'EMP0060', type: 'action', key: 'bulkEdit', value: false, to: y } }] });
    assert.strictEqual(bad.ok, false); assert.strictEqual(bad.status, 422);
    // remove
    const id = tbl('AccessOverride').find((o) => o.ov_type === 'role').ROWID;
    const rm = await call('POST', '/apply', U.hr, { reason: 'rm', changes: [{ kind: 'ovRemove', id }] });
    assert.strictEqual(rm.ok, true);
    assert.strictEqual((await call('GET', '/me', U.b)).ok, false);
  });

  await test('row helpers: inScope, shapeRowByColumns, canEdit/canEditColumn, requireScreen/Action', async () => {
    const a = await A.get(makeApp(fakeReq(U.ashok)), makeApp(fakeReq()));
    assert.ok(A.inScope(a, ' emp0100 ')); assert.ok(A.inScope(a, { emp_id: 'EMP0102' })); assert.ok(A.inScope(a, { empId: 'EMP0101' }));
    assert.ok(!A.inScope(a, 'EMP0051')); assert.ok(!A.inScope(a, { emp_id: 'EMP0103' }));
    const row = { ROWID: '1', emp_id: 'EMP0100', name: 'A', hike_amount: 5, hike_pct: 1, new_rb: 3 };
    assert.deepStrictEqual(A.shapeRowByColumns(a, row), { ROWID: '1', emp_id: 'EMP0100', name: 'A', new_rb: 3 });
    assert.deepStrictEqual(Object.keys(A.shapeRow(a, { empId: 'x', hikeAmount: 1, newRB: 2 })), ['empId', 'newRB']);
    assert.strictEqual(A.canEdit(a, 'newRB'), true); assert.strictEqual(A.canEdit(a, 'name'), false); assert.strictEqual(A.canEdit(a, 'rbToBePaid'), false);
    assert.strictEqual(A.canEditColumn(a, 'new_rb'), true); assert.strictEqual(A.canEditColumn(a, 'hike_amount'), false); assert.strictEqual(A.canEditColumn(a, 'emp_id'), null);
    assert.throws(() => A.requireEditColumns(a, ['new_rb', 'name']), /name/);
    assert.throws(() => A.requireScreen(a, 'access', 'view'), A.HttpError);
    A.requireScreen(a, 'appraisalSheet', 'edit'); A.requireAction(a, 'bulkEdit');
    assert.throws(() => A.requireAction(a, 'delegateApprove'), A.HttpError);
  });

  await test('/catalog adds a screen (HR edit, others none); version bumps', async () => {
    const v0 = version();
    const r = await call('POST', '/catalog', U.hr, { items: [{ type: 'screen', key: 'bellCurve', label: 'Bell curve', group: 'Compensation' }] });
    assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(version(), v0 + 1);
    assert.strictEqual((await call('GET', '/me', U.hr)).screens.bellCurve, 'edit');
    assert.strictEqual((await call('GET', '/me', U.ashok)).screens.bellCurve, 'none');
    assert.strictEqual((await call('POST', '/catalog', U.ashok, { items: [{ type: 'screen', key: 'zz', label: 'x' }] })).status, 403);
  });

  await test('/cycles and /delegation?cycle= (HR only)', async () => {
    const c = await call('GET', '/cycles', U.hr);
    assert.strictEqual(c.ok, true); assert.strictEqual(c.cycles.length, 3); assert.strictEqual(c.activeCycleId, cAct.ROWID);
    assert.deepStrictEqual(c.cycles[1], { id: cAct.ROWID, name: 'FY2026', status: 'Active' });
    const d = await call('GET', '/delegation?cycle=' + cAct.ROWID, U.hr);
    assert.strictEqual(d.rows.length, 4); assert.strictEqual(d.rows[0].appraiserTechEdName, 'Ashok Kumar');
    assert.strictEqual((await call('GET', '/cycles', U.priya)).status, 403);
    assert.strictEqual((await call('GET', '/delegation?cycle=' + cAct.ROWID, U.ashok)).status, 403);
  });

  await test('/delegation/fill maps "EMP0051 - Ashok Kumar" and comp manager names; reports unmatched/ambiguous; replace', async () => {
    const v0 = version();
    const r = await call('POST', '/delegation/fill', U.hr, { cycleId: cNext.ROWID, replace: true });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.employees, 11); assert.strictEqual(r.inserted, 11); assert.strictEqual(version(), v0 + 1);
    const rows = tbl(DEL).filter((x) => x.cycle_id === cNext.ROWID);
    const by = Object.fromEntries(rows.map((x) => [x.emp_id, x]));
    assert.strictEqual(rows.length, 11);
    assert.strictEqual(by.EMP0100.appraiser_tech_ed_id, 'EMP0051'); assert.strictEqual(by.EMP0101.appraiser_tech_ed_id, 'EMP0051');
    assert.strictEqual(by.EMP0200.appraiser_tech_ed_id, 'EMP0051');
    assert.strictEqual(by.EMP0100.comp_manager_id, 'EMP0060'); assert.strictEqual(by.EMP0101.comp_manager_id, 'EMP0060');
    assert.strictEqual(by.EMP0102.comp_manager_id, ''); assert.strictEqual(by.EMP0102.appraiser_tech_ed_id, '');
    assert.deepStrictEqual(r.unmatched.techEd.map((x) => x.value), ['Someone Without Id']);
    assert.deepStrictEqual(r.unmatched.compManager.map((x) => x.name), ['Unknown Person']);
    assert.deepStrictEqual(r.ambiguous.compManager[0].candidates.sort(), ['EMP0080', 'EMP0081']);
    const r2 = await call('POST', '/delegation/fill', U.hr, { cycleId: cNext.ROWID, replace: true });
    assert.strictEqual(r2.deleted, 11); assert.strictEqual(count(DEL, (x) => x.cycle_id === cNext.ROWID), 11);
    const r3 = await call('POST', '/delegation/fill', U.hr, { cycleId: cNext.ROWID, replace: false });
    assert.strictEqual(r3.skipped, 11); assert.strictEqual(count(DEL, (x) => x.cycle_id === cNext.ROWID), 11);
    assert.strictEqual(count(DEL, (x) => x.cycle_id === cAct.ROWID), 4, 'active cycle untouched');
    assert.strictEqual((await call('POST', '/delegation/fill', U.priya, { cycleId: cNext.ROWID })).status, 403);
  });

  await test('dry run: check() returns dryRun instead of throwing; throws when ACCESS_ENFORCE=true', async () => {
    delete process.env.ACCESS_ENFORCE;
    const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
    let a;
    try { a = await A.check(makeApp(fakeReq(U.nobody)), makeApp(fakeReq())); } finally { console.log = orig; }
    assert.strictEqual(a.dryRun, true); assert.strictEqual(a.enforced, false); assert.ok(a.denied instanceof A.HttpError); assert.strictEqual(a.denied.status, 403);
    assert.ok(logs.some((l) => l.startsWith('ACCESS dry-run: would deny nobody@x.com')), logs.join('|'));
    const ok = await A.check(makeApp(fakeReq(U.ashok)), { admin: makeApp(fakeReq()) });
    assert.strictEqual(ok.dryRun, true); assert.strictEqual(ok.role, 'techEd');
    assert.strictEqual(A.guard(ok, () => A.requireScreen(ok, 'access')), true);   // logged only
    assert.deepStrictEqual(A.scopeRows(ok, [{ emp_id: 'EMP0999', hike_amount: 1 }]).length, 1);
    process.env.ACCESS_ENFORCE = 'true';
    try {
      await assert.rejects(A.check(makeApp(fakeReq(U.nobody)), makeApp(fakeReq())), (e) => e instanceof A.HttpError && e.status === 403);
      const en = await A.check(makeApp(fakeReq(U.ashok)), makeApp(fakeReq()));
      assert.strictEqual(en.enforced, true); assert.strictEqual(en.dryRun, false);
      assert.throws(() => A.guard(en, () => A.requireScreen(en, 'access')), A.HttpError);
      assert.deepStrictEqual(A.scopeRows(en, [{ emp_id: 'EMP0999' }, { emp_id: 'EMP0100', hike_amount: 1, new_rb: 2 }]), [{ emp_id: 'EMP0100', new_rb: 2 }]);
      const me = await call('GET', '/me', U.nobody);
      assert.strictEqual(me.ok, false); assert.strictEqual(me.enforced, true);
      assert.strictEqual((await call('GET', '/me', U.ashok)).enforced, true);
    } finally { delete process.env.ACCESS_ENFORCE; }
  });

  await test('cache: second get() within 30 s issues 0 queries; after 30 s exactly 1 (version check)', async () => {
    A.resetCache();
    const u = makeApp(fakeReq(U.ashok)), ad = makeApp(fakeReq());
    await A.get(u, ad);
    let q0 = stats.queries;
    await A.get(u, ad);
    assert.strictEqual(stats.queries - q0, 0);
    A._cache.checkedAt -= 31000;
    q0 = stats.queries;
    await A.get(u, ad);
    assert.strictEqual(stats.queries - q0, 1, stats.log.slice(q0).join('\n'));
    // version change elsewhere → full reload on next check
    tbl('AccessVersion')[0].version = String(version() + 1);
    A._cache.checkedAt -= 31000;
    q0 = stats.queries;
    const a = await A.get(u, ad);
    assert.ok(stats.queries - q0 > 1); assert.strictEqual(a.version, version());
    // /version uses the cache too
    q0 = stats.queries;
    const v = await call('GET', '/version', U.ashok);
    assert.strictEqual(v.version, version()); assert.strictEqual(stats.queries - q0, 0); assert.strictEqual(v.enforced, false);
  });

  await test('selectAll pages through >300 rows (string ROWIDs)', async () => {
    for (let i = 0; i < 650; i++) insert('BigT', { n: i, k: i % 2 ? 'odd' : 'even' });
    const q0 = stats.queries;
    const all = await A.selectAll(makeApp().zcql(), 'BigT');
    assert.strictEqual(all.length, 650); assert.strictEqual(stats.queries - q0, 3);
    const odd = await A.selectAll(makeApp().zcql(), 'BigT', "k = 'odd'");
    assert.strictEqual(odd.length, 325);
  });

  await test('today() is IST', async () => {
    const ist = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    assert.strictEqual(A.today(), ist);
  });

  server.close();
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
