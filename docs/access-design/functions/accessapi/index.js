/* =====================================================================
   accessapi v5 — Catalyst Advanced I/O function (Node.js) for the Access screen
   (HR Operations → Access), matching Access_Screen_v5.html.

   All access rules live in accessCore.js (copy that file into your other functions).
   Endpoints (JSON; the user always comes from the Catalyst session):
     GET  /version          tiny check — the page downloads data only when this changes
     GET  /me               what the signed-in user may do (every screen calls this)
     GET  /admin/state      HR: everything the Access screen shows
     POST /apply            HR: pending changes + reason, all or nothing; raises the version
     POST /catalog          HR: add / rename / deactivate screens, actions, fields
     POST /seed             HR: first run — writes the starting catalogue and settings
   ===================================================================== */
'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const A = require('./accessCore');
const { T, HttpError, nowDT, today, q, bool, ID_RE, DATE_RE, selectAll } = A;

const app = express();
app.use(express.json({ limit: '1mb' }));

function asyncRoute(fn) { return (req, res) => fn(req, res).catch((err) => sendError(res, err)); }
// Rule messages come back as HTTP 200 with ok:false so the browser console stays clean.
function sendError(res, err) {
  if (err instanceof HttpError) return res.status(200).json({ ok: false, status: err.status, error: err.message });
  console.error(err);   // server-side log only (Catalyst function logs)
  res.status(500).json({ ok: false, status: 500, error: 'Server error. Please try again.' });
}
async function requireHR(cat) {
  const me = await A.get(cat);
  if (me.role !== 'hr') throw new HttpError(403, 'Only HR Admin can do this.');
  return me;
}

/* ---------------------------------------------------------------------
   GET /version — anyone signed in (the page compares it with its copy)
   --------------------------------------------------------------------- */
app.get('/version', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req);
  const u = await cat.userManagement().getCurrentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  const v = await A.getVersion(cat.zcql());
  res.json({ ok: true, version: v.version });
}));

/* GET /me */
app.get('/me', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req);
  res.json(Object.assign({ ok: true }, await A.get(cat)));
}));

/* ---------------------------------------------------------------------
   Catalyst role changes → audit trail (roles are given in Catalyst, not here)
   --------------------------------------------------------------------- */
async function catalystUsers(cat) {
  try {
    const all = await cat.userManagement().getAllUsers();
    return (all || []).map((u) => ({ email: String(u.email_id || '').toLowerCase(), role: u.role_details && u.role_details.role_name, name: [u.first_name, u.last_name].filter(Boolean).join(' ') }));
  } catch (e) { return null; }   // not available: skip the comparison
}
async function syncCatalystRoles(cat, roles, users, by) {
  if (!users) return false;
  const zcql = cat.zcql(), ds = cat.datastore();
  const tracked = new Set(roles.filter((r) => r.source === 'catalyst' && !r.retired && r.catalystRole).map((r) => r.catalystRole));
  const nowHeld = {};
  users.forEach((u) => { if (u.email && tracked.has(u.role)) nowHeld[u.email] = u; });
  const seen = await selectAll(zcql, T.seen);
  const seenBy = Object.fromEntries(seen.map((s) => [s.email, s]));
  let changed = false;
  const at = nowDT(), log = ds.table(T.log);
  for (const email of Object.keys(nowHeld)) {
    const s = seenBy[email], u = nowHeld[email];
    if (!s || s.role_name !== u.role) {
      changed = true;
      if (s) await ds.table(T.seen).updateRow({ ROWID: s.ROWID, role_name: u.role, seen_at: at });
      else await ds.table(T.seen).insertRow({ email, role_name: u.role, seen_at: at });
      await log.insertRow({ changed_at: at, changed_by: 'Catalyst', kind: 'catalyst', target: u.name || email, role: '', old_value: s ? s.role_name : '', new_value: u.role + ' (Catalyst role)', reason: 'Seen on load — role given in Catalyst', batch_id: 'CAT' + Date.now() });
    }
  }
  for (const s of seen) {
    if (!nowHeld[s.email]) {
      changed = true;
      await ds.table(T.seen).deleteRow(s.ROWID);
      await log.insertRow({ changed_at: at, changed_by: 'Catalyst', kind: 'catalyst', target: s.email, role: '', old_value: s.role_name + ' (Catalyst role)', new_value: '(removed)', reason: 'Seen on load — role removed in Catalyst', batch_id: 'CAT' + Date.now() });
    }
  }
  if (changed) await A.bumpVersion(cat, by, 'Catalyst role change');
  return changed;
}

/* ---------------------------------------------------------------------
   GET /admin/state — HR
   --------------------------------------------------------------------- */
app.get('/admin/state', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req);
  const me = await requireHR(cat);
  const zcql = cat.zcql();
  const [C, roles, cycleId, emRows, overrides, log, users] = await Promise.all([
    A.loadCatalog(zcql), A.loadRoles(zcql), A.activeCycleId(zcql), selectAll(zcql, A.SETTINGS.employeeMaster.table),
    selectAll(zcql, T.override), selectAll(zcql, T.log), catalystUsers(cat)
  ]);
  await syncCatalystRoles(cat, roles, users, me.user.email);
  const [deleg, m, v, log2] = await Promise.all([A.loadDelegation(zcql, cycleId), A.loadMatrix(zcql, C, roles), A.getVersion(zcql), selectAll(zcql, T.log)]);
  delete m.rowids;

  // People = Delegation (Tech ED / Comp Manager) + Catalyst role holders + anyone with an override
  const em = {}; emRows.forEach((r) => { const p = A.emRow(r); em[p.empId] = p; });
  const emByEmail = {}; Object.values(em).forEach((p) => { if (p.email) emByEmail[p.email] = p; });
  const tracked = new Set(roles.filter((r) => r.source === 'catalyst' && !r.retired && r.catalystRole).map((r) => r.catalystRole));
  const people = {};
  function add(empId) { if (!people[empId]) people[empId] = em[empId] ? Object.assign({}, em[empId]) : { empId, name: empId, email: '', active: true, inEM: false }; return people[empId]; }
  Object.keys(deleg.techEd).concat(Object.keys(deleg.compMgr)).forEach(add);
  (users || []).forEach((u) => {
    if (!tracked.has(u.role)) return;
    const p = emByEmail[u.email];
    const row = p ? add(p.empId) : (people[u.email] = people[u.email] || { empId: u.email, name: u.name || u.email, email: u.email, active: true, inEM: false });
    row.catalystRole = u.role;
  });
  const ovs = overrides.filter((o) => !bool(o.removed));
  ovs.forEach((o) => add(o.emp_id));

  res.json({
    ok: true, version: v.version, me: me.user,
    catalog: { screens: C.screens, actions: C.actions, fields: C.fields },
    roles: roles.map((r) => ({ key: r.key, label: r.label, source: r.source, catalystRole: r.catalystRole, seesAll: !!r.seesAll, fixed: !!r.fixed, retired: !!r.retired })),
    matrix: m,
    people: Object.values(people),
    deleg,
    overrides: ovs.map((o) => ({ id: String(o.ROWID), empId: o.emp_id, type: o.ov_type, key: o.target_key || '', value: o.ov_type === 'action' ? bool(o.value) : o.value, to: o.end_date || '', reason: o.reason || '', by: o.set_by || '', at: String(o.set_at || '').slice(0, 10) })),
    log: log2.slice(-500).reverse().map((l) => ({ at: l.changed_at, by: l.changed_by, kind: l.kind, target: l.target, role: l.role, from: l.old_value, to: l.new_value, reason: l.reason })),
    catalystCheck: users ? 'ok' : 'skipped'
  });
}));

/* ---------------------------------------------------------------------
   POST /apply — HR. { reason, changes: [...] }
     { kind:'screen'|'action'|'field', role, key, to }
     { kind:'roleAdd', role:{ label, catalystRole, seesAll } }
     { kind:'roleRetire', key }
     { kind:'ovAdd', ov:{ empId, type, key, value, to, reason } }
     { kind:'ovRemove', id }
   Everything is checked first; if any check fails nothing is saved. If a write fails,
   this batch's writes are undone. The access version is raised once.
   --------------------------------------------------------------------- */
app.post('/apply', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req);
  const me = await requireHR(cat);
  const zcql = cat.zcql();
  const body = req.body || {};
  const reason = String(body.reason || '').trim();
  if (!reason) throw new HttpError(422, 'Please give a reason for the change.');
  if (reason.length > 500) throw new HttpError(422, 'Reason is too long (500 characters max).');
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (!changes.length) throw new HttpError(422, 'No changes to apply.');
  if (changes.length > 500) throw new HttpError(422, 'Too many changes in one go (500 max).');

  const [C, roles, cycleId, ovRows] = await Promise.all([A.loadCatalog(zcql), A.loadRoles(zcql), A.activeCycleId(zcql), selectAll(zcql, T.override)]);
  const deleg = await A.loadDelegation(zcql, cycleId);
  const m = await A.loadMatrix(zcql, C, roles);
  const roleBy = Object.fromEntries(roles.map((r) => [r.key, r]));
  const newRoles = {};
  const ops = [], logs = [], at = nowDT(), batch = 'B' + Date.now();
  const lvl = (k, v) => (k === 'action' ? (v ? 'Yes' : 'No') : String(v));

  changes.forEach((c, i) => {
    const where = 'Change ' + (i + 1) + ': ';
    if (c.kind === 'roleAdd') {
      const r = c.role || {};
      const label = String(r.label || '').trim(), cr = String(r.catalystRole || '').trim();
      if (!label || label.length > 60) throw new HttpError(422, where + 'enter the role name.');
      if (!cr || cr.length > 60) throw new HttpError(422, where + 'enter the Catalyst role name.');
      const all = roles.concat(Object.values(newRoles));
      if (all.some((x) => !x.retired && (String(x.label).toLowerCase() === label.toLowerCase() || (x.catalystRole && x.catalystRole.toLowerCase() === cr.toLowerCase())))) throw new HttpError(409, where + 'a role with this name or Catalyst role already exists.');
      const key = 'r_' + label.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) + '_' + (Date.now() % 100000) + i;
      newRoles[key] = { key, label, source: 'catalyst', catalystRole: cr, seesAll: !!r.seesAll, fixed: false };
      if (c.role && c.role.key) newRoles[c.role.key] = newRoles[key];   // page's temporary key → new role
      ops.push({ table: T.role, op: 'insert', row: { role_key: key, label, catalyst_role: cr, sees_all: !!r.seesAll, retired: false, updated_by: me.user.email, updated_at: at } });
      logs.push({ kind: 'role', target: label, role: '', old_value: '', new_value: 'Added (Catalyst role: ' + cr + ')' });
      return;
    }
    if (c.kind === 'roleRetire') {
      const r = roleBy[c.key];
      if (!r) throw new HttpError(404, where + 'role not found.');
      if (r.fixed) throw new HttpError(409, where + r.label + ' is built in and can’t be retired.');
      ops.push(r.rowid ? { table: T.role, op: 'update', row: { ROWID: r.rowid, retired: true, updated_by: me.user.email, updated_at: at }, before: { ROWID: r.rowid, retired: false } }
        : { table: T.role, op: 'insert', row: { role_key: r.key, label: r.label, catalyst_role: r.catalystRole || '', sees_all: !!r.seesAll, retired: true, updated_by: me.user.email, updated_at: at } });
      logs.push({ kind: 'role', target: r.label, role: '', old_value: 'Active', new_value: 'Retired' });
      return;
    }
    if (c.kind === 'screen' || c.kind === 'action' || c.kind === 'field') {
      const nr = newRoles[c.role];
      const roleKey = nr ? nr.key : c.role;
      if (!roleBy[roleKey] && !nr) throw new HttpError(422, where + 'unknown role.');
      if (roleBy[roleKey] && roleBy[roleKey].retired) throw new HttpError(409, where + 'that role is retired.');
      const rk = roleKey;
      if (c.kind === 'screen') {
        const s = C.screenBy[c.key];
        if (!s) throw new HttpError(422, where + 'unknown screen.');
        if (s.hrOnly) throw new HttpError(409, where + s.label + ' is HR only and locked.');
        if (A.LEVELS.indexOf(c.to) < 0) throw new HttpError(422, where + 'use None, View or Edit.');
        const id = m.rowids.screen[rk + '|' + c.key], old = m.screens[rk] ? m.screens[rk][c.key] : 'none';
        const row = { role_key: rk, screen_key: c.key, level: c.to, updated_by: me.user.email, updated_at: at };
        ops.push(id ? { table: T.screen, op: 'update', row: Object.assign({ ROWID: id }, row), before: { ROWID: id, level: old } } : { table: T.screen, op: 'insert', row });
        logs.push({ kind: 'screen', target: c.key, role: rk, old_value: old, new_value: c.to });
      } else if (c.kind === 'action') {
        const a = C.actionBy[c.key];
        if (!a) throw new HttpError(422, where + 'unknown action.');
        if (a.fixed) throw new HttpError(409, where + a.label + ' is fixed (' + a.fixed + ').');
        const to = A.bool(c.to), id = m.rowids.action[rk + '|' + c.key], old = m.actions[rk] ? !!m.actions[rk][c.key] : false;
        const row = { role_key: rk, action_key: c.key, allowed: to, updated_by: me.user.email, updated_at: at };
        ops.push(id ? { table: T.action, op: 'update', row: Object.assign({ ROWID: id }, row), before: { ROWID: id, allowed: old } } : { table: T.action, op: 'insert', row });
        logs.push({ kind: 'action', target: c.key, role: rk, old_value: lvl('action', old), new_value: lvl('action', to) });
      } else {
        const f = C.fieldBy[c.key];
        if (!f) throw new HttpError(422, where + 'unknown field.');
        if (f.kind === 'calc') throw new HttpError(409, where + f.label + ' is calculated — it follows the columns it is built from.');
        if (f.kind === 'pair') throw new HttpError(409, where + f.label + ' always follows ' + C.fieldBy[f.pairOf].label + '.');
        if (A.LIMITS.indexOf(c.to) < 0) throw new HttpError(422, where + 'use Edit, Read or Hidden.');
        if (f.kind !== 'input' && c.to === 'edit') throw new HttpError(409, where + f.label + ' can never be edited (' + (f.kind === 'upload' ? 'upload only' : 'from the masters') + ').');
        const id = m.rowids.field[rk + '|' + c.key], old = m.fields[rk] ? m.fields[rk][c.key] : 'read';
        const row = { role_key: rk, field_key: c.key, access_limit: c.to, updated_by: me.user.email, updated_at: at };
        ops.push(id ? { table: T.field, op: 'update', row: Object.assign({ ROWID: id }, row), before: { ROWID: id, access_limit: old } } : { table: T.field, op: 'insert', row });
        logs.push({ kind: 'field', target: c.key, role: rk, old_value: old, new_value: c.to });
      }
      return;
    }
    if (c.kind === 'ovAdd') {
      const o = c.ov || {};
      const empId = String(o.empId || '');
      if (!ID_RE.test(empId)) throw new HttpError(422, where + 'pick a person.');
      if (A.OV_TYPES.indexOf(o.type) < 0) throw new HttpError(422, where + 'unknown override type.');
      if (o.to && (!DATE_RE.test(o.to) || o.to < today())) throw new HttpError(422, where + 'the end date must be today or later.');
      let key = '', value = '', text = '';
      if (o.type === 'screen') {
        const s = C.screenBy[o.key]; if (!s) throw new HttpError(422, where + 'unknown screen.');
        if (s.hrOnly) throw new HttpError(409, where + s.label + ' is HR only — it can’t be overridden.');
        if (A.LEVELS.indexOf(o.value) < 0) throw new HttpError(422, where + 'use None, View or Edit.');
        key = o.key; value = o.value; text = s.label + ': ' + value;
      } else if (o.type === 'action') {
        const a = C.actionBy[o.key]; if (!a) throw new HttpError(422, where + 'unknown action.');
        if (a.fixed) throw new HttpError(409, where + a.label + ' is fixed — it can’t be overridden.');
        key = o.key; value = A.bool(o.value) ? 'true' : 'false'; text = a.label + ': ' + (value === 'true' ? 'Yes' : 'No');
      } else if (o.type === 'field') {
        const f = C.fieldBy[o.key]; if (!f) throw new HttpError(422, where + 'unknown field.');
        if (f.kind === 'calc' || f.kind === 'pair') throw new HttpError(409, where + f.label + ' follows other columns — override those instead.');
        if (A.LIMITS.indexOf(o.value) < 0) throw new HttpError(422, where + 'use Edit, Read or Hidden.');
        if (f.kind !== 'input' && o.value === 'edit') throw new HttpError(409, where + f.label + ' can never be edited.');
        key = o.key; value = o.value; text = f.label + ': ' + value;
      } else if (o.type === 'role') {
        const r = roleBy[o.value]; if (!r || r.retired) throw new HttpError(422, where + 'pick an active role.');
        value = r.key; text = 'Role: ' + r.label;
      } else {
        if (deleg.techEd[o.key] == null && deleg.compMgr[o.key] == null) throw new HttpError(422, where + 'that person has no team in Delegation.');
        if (o.key === empId) throw new HttpError(422, where + 'that is the person’s own team.');
        key = o.key; value = 'add'; text = '+ team of ' + o.key;
      }
      ops.push({ table: T.override, op: 'insert', row: { emp_id: empId, ov_type: o.type, target_key: key, value, end_date: o.to || null, reason: String(o.reason || reason).slice(0, 300), set_by: me.user.email, set_at: at, removed: false } });
      logs.push({ kind: 'override', target: empId, role: '', old_value: '', new_value: text + (o.to ? ' (till ' + o.to + ')' : ' (no end date)') });
      return;
    }
    if (c.kind === 'ovRemove') {
      const o = ovRows.find((x) => String(x.ROWID) === String(c.id) && !bool(x.removed));
      if (!o) throw new HttpError(404, where + 'override not found.');
      ops.push({ table: T.override, op: 'update', row: { ROWID: o.ROWID, removed: true, removed_by: me.user.email, removed_at: at }, before: { ROWID: o.ROWID, removed: false, removed_by: '', removed_at: null } });
      logs.push({ kind: 'override', target: o.emp_id, role: '', old_value: o.ov_type + ' ' + (o.target_key || o.value), new_value: '(removed)' });
      return;
    }
    throw new HttpError(422, where + 'unknown change.');
  });

  // write, undoing this batch if a write fails
  const ds = cat.datastore(), done = [];
  try {
    for (const o of ops) {
      const t = ds.table(o.table);
      if (o.op === 'insert') { const r = await t.insertRow(o.row); done.push({ table: o.table, op: 'insert', ROWID: r.ROWID }); }
      else { await t.updateRow(o.row); done.push({ table: o.table, op: 'update', before: o.before }); }
    }
  } catch (err) {
    for (const d of done.reverse()) {
      try { const t = ds.table(d.table); if (d.op === 'insert') await t.deleteRow(d.ROWID); else await t.updateRow(d.before); } catch (e) { console.error('undo failed', e); }
    }
    throw err;
  }
  const logT = ds.table(T.log);
  for (const l of logs) await logT.insertRow(Object.assign({ changed_at: at, changed_by: me.user.email, reason, batch_id: batch }, l));
  const version = await A.bumpVersion(cat, me.user.email, 'Access screen: ' + reason);
  res.json({ ok: true, applied: ops.length, batch, version });
}));

/* ---------------------------------------------------------------------
   POST /catalog — HR. Add a screen / action / field, rename it, or set active:false.
   { items: [ { type, key, label, group, hrOnly, fixed, note, kind, deps:[...], pairOf, sort, active } ] }
   A new screen starts as None for every role (HR Admin: Edit).
   --------------------------------------------------------------------- */
app.post('/catalog', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req);
  const me = await requireHR(cat);
  const zcql = cat.zcql();
  const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
  if (!items.length) throw new HttpError(422, 'No items.');
  const rows = await selectAll(zcql, T.catalog);
  if (!rows.length) throw new HttpError(409, 'Run /seed first.');
  const by = Object.fromEntries(rows.map((r) => [r.item_type + '|' + r.item_key, r]));
  const t = cat.datastore().table(T.catalog), at = nowDT();
  let n = 0;
  for (const it of items) {
    if (['screen', 'action', 'field'].indexOf(it.type) < 0) throw new HttpError(422, 'type must be screen, action or field.');
    if (!/^[A-Za-z][A-Za-z0-9]{1,49}$/.test(String(it.key || ''))) throw new HttpError(422, 'key must be letters and digits, e.g. bellCurve.');
    if (it.type === 'field' && ['master', 'input', 'upload', 'calc', 'pair'].indexOf(it.kind) < 0) throw new HttpError(422, 'field kind must be master, input, upload, calc or pair.');
    const row = { item_type: it.type, item_key: it.key, label: String(it.label || it.key).slice(0, 120), grp: String(it.group || '').slice(0, 60), hr_only: !!it.hrOnly, fixed_note: String(it.fixed || '').slice(0, 120),
      note: String(it.note || '').slice(0, 200), field_kind: it.kind || '', deps: (it.deps || []).join(','), pair_of: it.pairOf || '', sort_order: Number(it.sort) || 9999, active: it.active !== false, updated_by: me.user.email, updated_at: at };
    const old = by[it.type + '|' + it.key];
    if (old) await t.updateRow(Object.assign({ ROWID: old.ROWID }, row)); else await t.insertRow(row);
    n++;
  }
  const version = await A.bumpVersion(cat, me.user.email, 'Catalogue change');
  res.json({ ok: true, saved: n, version });
}));

/* POST /seed — first run: catalogue + version row. Safe to run twice (fills empty tables only). */
app.post('/seed', asyncRoute(async (req, res) => {
  const cat = catalyst.initialize(req);
  const me = await requireHR(cat);
  const zcql = cat.zcql(), ds = cat.datastore(), at = nowDT();
  let n = 0;
  if (!(await selectAll(zcql, T.catalog)).length) {
    for (const [i, c] of A.START_CATALOG.entries()) {
      await ds.table(T.catalog).insertRow({ item_type: c.type, item_key: c.key, label: c.label, grp: c.group || '', hr_only: !!c.hrOnly, fixed_note: c.fixed || '', note: c.note || '',
        field_kind: c.kind || '', deps: (c.deps || []).join(','), pair_of: c.pairOf || '', sort_order: i + 1, active: true, updated_by: me.user.email, updated_at: at });
      n++;
    }
    // starting role settings for the three built-in roles (from the catalogue defaults)
    for (const c of A.START_CATALOG) {
      for (const [ri, r] of ['hr', 'techEd', 'compMgr'].entries()) {
        if (c.type === 'screen' && !c.hrOnly) { await ds.table(T.screen).insertRow({ role_key: r, screen_key: c.key, level: c.d[ri], updated_by: me.user.email, updated_at: at }); n++; }
        if (c.type === 'action' && !c.fixed) { await ds.table(T.action).insertRow({ role_key: r, action_key: c.key, allowed: !!c.d[ri], updated_by: me.user.email, updated_at: at }); n++; }
      }
    }
  }
  if (!(await selectAll(zcql, T.version)).length) { await ds.table(T.version).insertRow({ version_key: 'ACCESS', version: 1, changed_by: me.user.email, changed_at: at, why: 'Seed' }); n++; }
  res.json({ ok: true, rowsWritten: n });
}));

module.exports = app;
