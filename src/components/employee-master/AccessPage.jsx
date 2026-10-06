/* =====================================================================
   HR Operations -> Access
   React port of docs/access-design/Access_Screen_v5.html (main area + right panel).
   Data comes from the accessapi Catalyst function (src/lib/access-admin-api.js);
   contract: docs/ACCESS_SPEC.md. Settings are stored by KEY, never by label.
   ===================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apply as applyChanges,
  fillDelegation,
  getAdminState,
  getCycles,
  getDelegation,
  getVersion,
} from "@/lib/access-admin-api";
import "./access-page.css";

/* ---------- constants & helpers ---------- */
const LIMIT_LABEL = { edit: "Edit", read: "Read", hidden: "Hidden" };
const STRICT = { edit: 0, read: 1, hidden: 2 };
const LEVEL_LABEL = { none: "None", view: "View", edit: "Edit" };
const KIND_LABEL = { input: "Input", master: "Master", upload: "Upload only", calc: "Calculated", pair: "Paired" };
const CACHE_KEY = "accessData.v5";
const EMPTY_DELEG = { techEd: {}, compMgr: {} };

const TABS = [
  { key: "people", label: "People", title: "People", sub: "From Catalyst roles and Delegation — nobody is added here" },
  { key: "screens", label: "Screens", title: "Screens by role", sub: "None · View (read-only) · Edit" },
  { key: "actions", label: "Actions", title: "Actions by role", sub: "Yes · No" },
  { key: "fields", label: "Fields", title: "Field limits by role", sub: "Edit · Read · Hidden" },
  { key: "overrides", label: "Overrides", title: "Personal overrides", sub: "Override → role. Locked rules always apply" },
  { key: "scope", label: "Extra scope", title: "Extra scope", sub: "Extra teams for a set period" },
  { key: "audit", label: "Audit trail", title: "Access audit trail", sub: "Includes role changes seen from Catalyst" },
];

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtD(d) {
  if (!d) return "";
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = String(d).slice(0, 10).split("-");
  if (p.length < 3 || !m[+p[1] - 1]) return String(d);
  return p[2] + "-" + m[+p[1] - 1];
}
function byKey(list, k) {
  for (let i = 0; i < list.length; i++) if (list[i].key === k) return list[i];
  return null;
}
function readCache() {
  try {
    const c = sessionStorage.getItem(CACHE_KEY);
    return c ? JSON.parse(c) : null;
  } catch {
    return null;
  }
}
function writeCache(version, data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ version, data }));
  } catch {
    /* storage blocked: keep working without a copy */
  }
}
function roleClass(roleObj, key) {
  return roleObj && roleObj.fixed ? key : "custom";
}

/* =====================================================================
   Model — a pure port of the design's access logic, over saved data + pending changes
   ===================================================================== */
function buildModel(data, pending, today, cycleName) {
  const SCREENS = data?.catalog?.screens || [];
  const ACTIONS = data?.catalog?.actions || [];
  const FIELDS = (data?.catalog?.fields || []).map((f) => ({ ...f, deps: Array.isArray(f.deps) ? f.deps : [] }));
  const savedRoles = data?.roles || [];
  const matrix = data?.matrix || { screens: {}, actions: {}, fields: {} };
  const people = data?.people || [];
  const deleg = { techEd: data?.deleg?.techEd || {}, compMgr: data?.deleg?.compMgr || {} };
  // People-tab cycle (may not be the Active one); effective access uses deleg only.
  const listDeleg = { techEd: data?.listDeleg?.techEd || deleg.techEd, compMgr: data?.listDeleg?.compMgr || deleg.compMgr };
  const listActive = data?.listCycleActive !== false;
  const overrides = data?.overrides || [];
  const log = data?.log || [];
  const pendList = Object.values(pending);

  // roles(): includes pending new roles, excludes retired (incl. pending retire)
  const activeRoles = savedRoles.filter((r) => !r.retired && !pending["roleRetire|" + r.key]);
  pendList.forEach((p) => { if (p.kind === "roleAdd") activeRoles.push(p.role); });
  const allRoles = savedRoles.concat(pendList.filter((p) => p.role).map((p) => p.role));
  const roleOf = (key) => { let r = null; allRoles.forEach((x) => { if (x.key === key) r = x; }); return r; };
  const roleLabel = (k) => { const r = roleOf(k); return r ? r.label : k; };
  const isNewRole = (k) => !!pending["roleAdd|" + k];

  const itemOf = (kind, key) => (kind === "screen" ? byKey(SCREENS, key) : kind === "action" ? byKey(ACTIONS, key) : byKey(FIELDS, key));

  // A role added in this session starts with None / No / Read (design's initRole with no defaults).
  function newRoleDefault(kind, key) {
    if (kind === "screen") return "none";
    if (kind === "action") return false;
    const f = byKey(FIELDS, key);
    return f && (f.kind === "input" || f.kind === "master" || f.kind === "upload") ? "read" : undefined;
  }
  function saved(kind, role, key) {
    const g = kind === "screen" ? "screens" : kind === "action" ? "actions" : "fields";
    if (matrix[g] && matrix[g][role]) return matrix[g][role][key];
    if (isNewRole(role)) return newRoleDefault(kind, key);
    return undefined;
  }
  function cur(kind, role, key) {
    const p = pending[kind + "|" + role + "|" + key];
    return p ? p.to : saved(kind, role, key);
  }

  const peopleBy = {};
  people.forEach((p) => { peopleBy[p.empId] = p; });
  const personByEmp = (id) => peopleBy[id] || null;

  // saved minus pending removals, plus pending adds; not expired
  const ovAll = overrides.filter((o) => !pending["ovRemove|" + o.id]);
  pendList.forEach((p) => { if (p.kind === "ovAdd") ovAll.push(p.ov); });
  const active = ovAll.filter((o) => !o.to || o.to >= today);
  const activeOverrides = () => active;
  const ovMap = {};
  active.forEach((o) => { (ovMap[o.empId] = ovMap[o.empId] || []).push(o); });
  const ovFor = (empId) => ovMap[empId] || [];

  const delegFrom = "Delegation" + (cycleName ? " · " + cycleName : "");
  // Role of a person: Catalyst role first, then Delegation; then a role override
  function baseRole(p) {
    if (p.catalystRole) {
      let r = null;
      activeRoles.forEach((x) => { if (x.source === "catalyst" && x.catalystRole === p.catalystRole) r = x; });
      if (r) return { role: r.key, from: "Catalyst role" };
    }
    if (deleg.techEd[p.empId] != null) return { role: "techEd", from: delegFrom };
    if (deleg.compMgr[p.empId] != null) return { role: "compMgr", from: delegFrom };
    return { role: "", from: p.catalystRole ? "Catalyst role " + p.catalystRole + " (not an access role)" : "No role" };
  }
  const effCache = {};
  function effRole(p) {
    if (effCache[p.empId]) return effCache[p.empId];
    const b = baseRole(p);
    const ro = ovFor(p.empId).filter((o) => o.type === "role")[0];
    const r = ro
      ? { role: ro.value, from: "Override (was " + (b.role ? roleLabel(b.role) : "no role") + ")", ov: ro, base: b }
      : { role: b.role, from: b.from, base: b };
    effCache[p.empId] = r;
    return r;
  }
  const canLogIn = (p) => !!(p.inEM && p.active && p.email);

  // Effective access of one person: locked rule -> override -> role
  function effScreen(p, key) {
    const s = byKey(SCREENS, key), r = effRole(p).role;
    if (!canLogIn(p) || !r) return { v: "none", src: !canLogIn(p) ? "cannot log in" : "no role" };
    if (s && s.hrOnly) return { v: r === "hr" ? "edit" : "none", src: "locked", locked: true };
    const o = ovFor(p.empId).filter((x) => x.type === "screen" && x.key === key)[0];
    if (o) return { v: o.value, src: "override", ov: o };
    return { v: cur("screen", r, key) || "none", src: "role", role: r };
  }
  function effAction(p, key) {
    const a = byKey(ACTIONS, key), r = effRole(p).role;
    if (!canLogIn(p) || !r) return { v: false, src: !canLogIn(p) ? "cannot log in" : "no role" };
    if (a && a.fixed) return { v: !!cur("action", r, key), src: "locked", locked: true, role: r };
    const o = ovFor(p.empId).filter((x) => x.type === "action" && x.key === key)[0];
    if (o) return { v: o.value, src: "override", ov: o };
    return { v: !!cur("action", r, key), src: "role", role: r };
  }
  function limitsFor(role, ovs) {
    const lim = {}, seen = {};
    FIELDS.forEach((f) => { if (f.kind !== "calc" && f.kind !== "pair") lim[f.key] = role ? cur("field", role, f.key) || "read" : "hidden"; });
    (ovs || []).forEach((o) => { if (o.type === "field" && lim[o.key] !== undefined) lim[o.key] = o.value; });
    FIELDS.forEach((f) => { if (f.kind === "pair") lim[f.key] = lim[f.pairOf] || "read"; });
    function get(k) {
      const f = byKey(FIELDS, k);
      if (!f || f.kind !== "calc") return lim[k];
      if (seen[k]) return lim[k] || "read";
      seen[k] = true;
      let worst = "read";
      f.deps.forEach((d) => { const v = get(d); if (STRICT[v] > STRICT[worst]) worst = v; });
      return (lim[k] = worst); // calculated = strictest of what it is built from
    }
    FIELDS.forEach((f) => { if (f.kind === "calc") get(f.key); });
    return lim;
  }
  function effField(p, key) {
    const r = effRole(p).role, ovs = ovFor(p.empId);
    const lim = limitsFor(r, ovs), f = byKey(FIELDS, key);
    const kind = f ? f.kind : "";
    const o = ovs.filter((x) => x.type === "field" && x.key === (kind === "pair" ? f.pairOf : key))[0];
    return { v: lim[key], src: kind === "calc" ? "calculated" : kind === "pair" ? "pair" : o ? "override" : "role", ov: o, role: r };
  }
  function teamOf(p) {
    const r = effRole(p).role, ro = roleOf(r);
    let n = 0, txt = "";
    if (!r) return { n: 0, txt: "No team", extra: [] };
    if (ro && ro.seesAll) txt = "All employees";
    else if (r === "techEd") { n = deleg.techEd[p.empId] || 0; txt = n + " employees (Appraiser Tech ED = " + p.name + ")"; }
    else if (r === "compMgr") { n = deleg.compMgr[p.empId] || 0; txt = n + " employees (Comp Manager = " + p.name + ")"; }
    else txt = "No team";
    const extra = ovFor(p.empId).filter((o) => o.type === "team").map((o) => { const q = personByEmp(o.key); return (q ? q.name : o.key) + "'s team"; });
    return { n, txt, extra };
  }
  function ovText(o) {
    const lbl = (it, k) => (it ? it.label : k);
    if (o.type === "screen") return lbl(byKey(SCREENS, o.key), o.key) + ": " + (LEVEL_LABEL[o.value] || o.value);
    if (o.type === "action") return lbl(byKey(ACTIONS, o.key), o.key) + ": " + (o.value ? "Yes" : "No");
    if (o.type === "field") return lbl(byKey(FIELDS, o.key), o.key) + ": " + (LIMIT_LABEL[o.value] || o.value);
    if (o.type === "role") return "Role: " + roleLabel(o.value);
    if (o.type === "team") { const q = personByEmp(o.key); return "+ " + (q ? q.name : o.key) + "'s team"; }
    return "";
  }
  function flagsOf(p) {
    const f = [];
    if (!p.inEM) f.push(["Not in Employee Master", ""]);
    else if (!p.email) f.push(["No email", ""]);
    if (p.inEM && !p.active) f.push(["Inactive in Employee Master", "a"]);
    if (canLogIn(p) && !effRole(p).role) {
      const inSel = listDeleg.techEd[p.empId] != null ? "Tech ED" : listDeleg.compMgr[p.empId] != null ? "Comp Manager" : "";
      f.push([inSel && !listActive ? inSel + " in this cycle — cycle not Active" : "No role", "a"]);
    }
    return f;
  }
  function pendFor(t) {
    let n = 0;
    pendList.forEach((p) => {
      const c = p.kind;
      if ((t === "screens" && (c === "screen" || c === "roleAdd" || c === "roleRetire")) || (t === "actions" && c === "action") || (t === "fields" && c === "field") ||
        (t === "overrides" && (c === "ovAdd" || c === "ovRemove") && !(p.ov && p.ov.type === "team") && !(c === "ovRemove" && p.type === "team")) ||
        (t === "scope" && ((c === "ovAdd" && p.ov.type === "team") || (c === "ovRemove" && p.type === "team")))) n++;
    });
    return n;
  }
  function ovRows(filterTeam) {
    const rows = overrides.map((o) => ({ o, removing: !!pending["ovRemove|" + o.id] }));
    pendList.forEach((p) => { if (p.kind === "ovAdd") rows.push({ o: p.ov, adding: true }); });
    return rows.filter((r) => (filterTeam ? r.o.type === "team" : r.o.type !== "team"));
  }
  function lastRoleChange(kind, role, key) {
    for (let i = 0; i < log.length; i++) { const l = log[i]; if (l.kind === kind && l.role === role && l.target === key) return l; }
    return null;
  }
  const valText = (kind, v) => (kind === "screen" ? LEVEL_LABEL[v] || v : kind === "action" ? (v ? "Yes" : "No") : LIMIT_LABEL[v] || v);
  const eff = (p, kind, key) => (kind === "screen" ? effScreen(p, key) : kind === "action" ? effAction(p, key) : effField(p, key));

  return {
    SCREENS, ACTIONS, FIELDS, people, deleg, overrides, log, savedRoles,
    roles: () => activeRoles, roleOf, roleLabel, isNewRole, itemOf, saved, cur, personByEmp,
    activeOverrides, ovFor, baseRole, effRole, canLogIn, effScreen, effAction, limitsFor, effField,
    teamOf, ovText, flagsOf, pendFor, ovRows, lastRoleChange, valText, eff,
  };
}

/* changes in the shape accessapi /apply expects (new roles first, so settings for them can follow) */
function changeList(pending) {
  const order = { roleAdd: 0, roleRetire: 1, screen: 2, action: 2, field: 2, ovAdd: 3, ovRemove: 3 };
  return Object.values(pending).sort((a, b) => order[a.kind] - order[b.kind]).map((p) => {
    if (p.kind === "screen" || p.kind === "action" || p.kind === "field") return { kind: p.kind, role: p.role, key: p.key, to: p.to };
    if (p.kind === "roleAdd") return { kind: "roleAdd", role: { key: p.role.key, label: p.role.label, catalystRole: p.role.catalystRole, seesAll: p.role.seesAll } };
    if (p.kind === "roleRetire") return { kind: "roleRetire", key: p.key };
    if (p.kind === "ovAdd") return { kind: "ovAdd", ov: { empId: p.ov.empId, type: p.ov.type, key: p.ov.key, value: p.ov.value, to: p.ov.to, reason: p.ov.reason } };
    return { kind: "ovRemove", id: p.id };
  });
}

/* =====================================================================
   Small presentational pieces
   ===================================================================== */
function Seg({ value, savedValue, disabled, onSet }) {
  return (
    <span className={"cell" + (value !== savedValue ? " chg" : "")}>
      <span className="seg">
        {["none", "view", "edit"].map((o) => (
          <button key={o} type="button" className={o === value ? "on " + o : ""} disabled={disabled} onClick={disabled ? undefined : () => onSet(o)}>
            {LEVEL_LABEL[o]}
          </button>
        ))}
      </span>
    </span>
  );
}

function YesNo({ value, savedValue, onSet }) {
  return (
    <span className={"cell" + (value !== savedValue ? " chg" : "")}>
      <span className="yn">
        <button type="button" className={value ? "on y" : ""} onClick={() => onSet(true)}>Yes</button>
        <button type="button" className={!value ? "on n" : ""} onClick={() => onSet(false)}>No</button>
      </span>
    </span>
  );
}

function RoleBadge({ M, roleKey }) {
  if (!roleKey) return <span className="derived">—</span>;
  return <span className={"role " + roleClass(M.roleOf(roleKey), roleKey)}>{M.roleLabel(roleKey)}</span>;
}

function Flag({ f }) {
  return <span className={"flag " + f[1]}>{f[0]}</span>;
}

function RoleHeads({ M, onRetire }) {
  return M.roles().map((r) => {
    const isNew = M.isNewRole(r.key);
    return (
      <th key={r.key}>
        {r.label}
        {isNew && <> <span className="pill e">new</span></>}
        <span className="src">
          {r.source === "catalyst" ? "Catalyst role" + (r.catalystRole && r.catalystRole !== r.label ? ": " + r.catalystRole : "") : "Delegation"}
          {r.seesAll && r.key !== "hr" ? " · all employees" : ""}
        </span>
        {!r.fixed && (
          <span className="rtools">
            <button type="button" onClick={() => onRetire(r.key)}>{isNew ? "Undo" : "Retire"}</button>
          </span>
        )}
      </th>
    );
  });
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mbox" role="dialog" aria-modal="true" aria-label={title}>
        <div className="chead"><span>{title}</span><button type="button" className="btn sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

/* =====================================================================
   Tabs
   ===================================================================== */
function ScreensTab({ M, pending, setVal, onRetire, onAddRole }) {
  const rs = M.roles();
  const retiring = Object.values(pending).filter((p) => p.kind === "roleRetire");
  let g = null;
  const rows = [];
  M.SCREENS.forEach((s) => {
    if (s.group !== g) { g = s.group; rows.push(<tr className="grp" key={"g-" + g}><td colSpan={rs.length + 2}>{g}</td></tr>); }
    rows.push(
      <tr key={s.key}>
        <td>{s.label}{s.note && <span className="note">{s.note}</span>}</td>
        {s.hrOnly ? (
          <>
            <td><Seg value="edit" savedValue="edit" disabled /></td>
            <td colSpan={rs.length} className="lock">HR only — locked</td>
          </>
        ) : (
          <>
            {rs.map((r) => (
              <td key={r.key}><Seg value={M.cur("screen", r.key, s.key)} savedValue={M.saved("screen", r.key, s.key)} onSet={(o) => setVal("screen", r.key, s.key, o)} /></td>
            ))}
            <td />
          </>
        )}
      </tr>,
    );
  });
  return (
    <table>
      <thead>
        <tr>
          <th>Screen</th>
          <RoleHeads M={M} onRetire={onRetire} />
          <th style={{ textAlign: "right" }}>
            <span className="addrole" role="button" tabIndex={0} onClick={onAddRole} onKeyDown={(e) => { if (e.key === "Enter") onAddRole(); }}>+ Add role</span>
            {retiring.map((p) => (
              <span className="rtools" key={p.key}>
                Retiring {M.roleLabel(p.key)} <button type="button" onClick={() => onRetire(p.key)}>Undo</button>
              </span>
            ))}
          </th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

function ActionsTab({ M, setVal, onRetire }) {
  const rs = M.roles();
  let g = null;
  const rows = [];
  M.ACTIONS.forEach((a) => {
    if (a.group !== g) { g = a.group; rows.push(<tr className="grp" key={"g-" + g}><td colSpan={rs.length + 1}>{g}</td></tr>); }
    rows.push(
      <tr key={a.key}>
        <td>{a.label}{a.fixed && <span className="note">🔒 {a.fixed}</span>}</td>
        {rs.map((r) => {
          const v = !!M.cur("action", r.key, a.key), sv = !!M.saved("action", r.key, a.key);
          if (a.fixed) return <td key={r.key} className="lock">{v ? "Yes" : "No"}</td>;
          return <td key={r.key}><YesNo value={v} savedValue={sv} onSet={(to) => setVal("action", r.key, a.key, to)} /></td>;
        })}
      </tr>,
    );
  });
  return (
    <table>
      <thead><tr><th>Action</th><RoleHeads M={M} onRetire={onRetire} /></tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

function FieldsTab({ M, setVal, onRetire, filt, setFilt }) {
  const rs = M.roles();
  const lims = {};
  rs.forEach((r) => { lims[r.key] = M.limitsFor(r.key, []); });
  const q = filt.fieldSearch.toLowerCase();
  const list = M.FIELDS.filter((f) => {
    if (filt.fieldKind && f.kind !== filt.fieldKind) return false;
    if (q && (f.label + " " + f.key).toLowerCase().indexOf(q) < 0) return false;
    if (filt.fieldShowLim) {
      const keys = filt.fieldShowRole ? [filt.fieldShowRole] : rs.map((r) => r.key);
      if (!keys.some((rk) => lims[rk] && lims[rk][f.key] === filt.fieldShowLim)) return false;
    }
    return true;
  });
  return (
    <>
      <div className="tools">
        <input type="text" placeholder="Search field" value={filt.fieldSearch} onChange={(e) => setFilt({ fieldSearch: e.target.value })} />
        <select value={filt.fieldKind} onChange={(e) => setFilt({ fieldKind: e.target.value })}>
          <option value="">All kinds</option><option value="input">Input</option><option value="master">Master</option>
          <option value="upload">Upload only</option><option value="calc">Calculated</option><option value="pair">Paired</option>
        </select>
        <span className="hint">Show fields where</span>
        <select value={filt.fieldShowRole} onChange={(e) => setFilt({ fieldShowRole: e.target.value })}>
          <option value="">any role</option>
          {rs.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <span className="hint">is</span>
        <select value={filt.fieldShowLim} onChange={(e) => setFilt({ fieldShowLim: e.target.value })}>
          <option value="">anything</option><option value="edit">Edit (can edit)</option><option value="read">Read</option><option value="hidden">Hidden (can’t see)</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Field</th><th>Kind</th><RoleHeads M={M} onRetire={onRetire} /></tr></thead>
        <tbody>
          {list.map((f) => {
            const pairItem = f.kind === "pair" ? byKey(M.FIELDS, f.pairOf) : null;
            return (
              <tr key={f.key}>
                <td>
                  {f.label} <span className="key">{f.key}</span>
                  {f.kind === "calc" && <span className="note">from {f.deps.map((d) => (byKey(M.FIELDS, d) || { label: d }).label).join(" + ")}</span>}
                </td>
                <td><span className={"kind " + f.kind}>{KIND_LABEL[f.kind] || f.kind}</span></td>
                {rs.map((r) => {
                  if (f.kind === "calc") return <td key={r.key} className="derived">{LIMIT_LABEL[lims[r.key][f.key]]} (auto)</td>;
                  if (f.kind === "pair") return <td key={r.key} className="derived">{LIMIT_LABEL[lims[r.key][f.key]]} (same as {pairItem ? pairItem.label : f.pairOf})</td>;
                  const v = M.cur("field", r.key, f.key) || "read", sv = M.saved("field", r.key, f.key) || "read";
                  const opts = f.kind === "input" ? ["edit", "read", "hidden"] : ["read", "hidden"];
                  return (
                    <td key={r.key}>
                      <span className={"cell" + (v !== sv ? " chg" : "")}>
                        <select className={"lim lim-" + v} value={v} onChange={(e) => setVal("field", r.key, f.key, e.target.value)}>
                          {opts.map((o) => <option key={o} value={o}>{LIMIT_LABEL[o]}</option>)}
                        </select>
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={rs.length + 2} className="empty">No field matches.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

function PeopleTab({ M, filt, setFilt, onPick, onExport, delegationHelper }) {
  const rs = M.roles();
  const q = filt.peopleSearch.toLowerCase();
  const list = M.people.filter((p) => {
    const er = M.effRole(p), fl = M.flagsOf(p);
    if (filt.peopleRole === "_attn" ? !fl.length : filt.peopleRole && er.role !== filt.peopleRole) return false;
    if (q && (p.name + " " + p.email + " " + p.empId).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  return (
    <>
      {delegationHelper}
      <div className="tools">
        <input type="text" placeholder="Search" value={filt.peopleSearch} onChange={(e) => setFilt({ peopleSearch: e.target.value })} />
        <select value={filt.peopleRole} onChange={(e) => setFilt({ peopleRole: e.target.value })}>
          <option value="">All roles</option>
          {rs.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          <option value="_attn">Needs attention</option>
        </select>
        <button type="button" className="btn sm" onClick={onExport}>Export (CSV)</button>
        <span className="hint">To change who is a Tech ED / Comp Manager, change Delegation. HR Admin and added roles are given in Catalyst.</span>
      </div>
      <table>
        <thead><tr><th>Person</th><th>Role</th><th>Role from</th><th>Team</th><th>Overrides</th><th>Flags</th></tr></thead>
        <tbody>
          {list.map((p) => {
            const er = M.effRole(p), fl = M.flagsOf(p), t = M.teamOf(p), n = M.ovFor(p.empId).length;
            return (
              <tr key={p.empId} style={{ cursor: "pointer" }} onClick={() => onPick(p.empId)}>
                <td><b>{p.name}</b><span className="note">{p.empId}{p.email ? " · " + p.email : ""}</span></td>
                <td><RoleBadge M={M} roleKey={er.role} /></td>
                <td style={{ fontSize: 12 }}>{er.from}</td>
                <td style={{ fontSize: 12 }}>{t.txt}{t.extra && t.extra.length ? " · + " + t.extra.join(", ") : ""}</td>
                <td>{n || ""}</td>
                <td>{fl.map((x) => <span key={x[0]}><Flag f={x} /> </span>)}</td>
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={6} className="empty">No one matches.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

function OverridesTab({ M, team, today, onNew, onToggleRemove, onUndoAdd }) {
  const rows = M.ovRows(team);
  return (
    <>
      <div className="tools">
        <button type="button" className="btn p sm" onClick={() => onNew(team)}>+ {team ? "Extra team" : "Override"}</button>
        <span className="hint">
          {team ? "Adds another person's team to someone, until the end date." : "An override applies to one person and wins over their role. HR Operations screens and fixed actions can’t be overridden."}
        </span>
      </div>
      <table>
        <thead><tr><th>Person</th><th>{team ? "Extra team" : "Override"}</th><th>Ends</th><th>Reason</th><th>Set by</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const p = M.personByEmp(r.o.empId), exp = r.o.to && r.o.to < today;
            const style = r.removing || exp ? { opacity: 0.55, textDecoration: r.removing ? "line-through" : undefined } : undefined;
            return (
              <tr key={r.o.id} style={style}>
                <td><b>{p ? p.name : r.o.empId}</b>{r.adding && <> <span className="pill e">new</span></>}</td>
                <td>{M.ovText(r.o)}</td>
                <td>{r.o.to ? fmtD(r.o.to) + (exp ? " (ended)" : "") : <span className="flag a">No end date</span>}</td>
                <td style={{ fontSize: 12 }}>{r.o.reason || "(pending)"}</td>
                <td style={{ fontSize: 12 }}>{r.o.by || ""}</td>
                <td>
                  {r.adding
                    ? <button type="button" className="btn sm" onClick={() => onUndoAdd(r.o.id)}>Undo</button>
                    : <button type="button" className="btn sm" onClick={() => onToggleRemove(r.o.id)}>{r.removing ? "Keep" : "Remove"}</button>}
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="empty">None.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

function AuditTab({ M, filt, setFilt }) {
  function target(l) {
    const it = (list, k) => { const x = byKey(list, k); return x ? x.label : k; };
    if (l.kind === "screen") return "Screen · " + it(M.SCREENS, l.target);
    if (l.kind === "action") return "Action · " + it(M.ACTIONS, l.target);
    if (l.kind === "field") return "Field · " + it(M.FIELDS, l.target);
    if (l.kind === "override") return "Override · " + l.target;
    if (l.kind === "catalyst") return "Catalyst role · " + l.target;
    if (l.kind === "role") return "Role · " + l.target;
    return l.target;
  }
  const rows = M.log.filter((l) => {
    const d = String(l.at || "").slice(0, 10);
    return (!filt.logFrom || d >= filt.logFrom) && (!filt.logTo || d <= filt.logTo);
  });
  return (
    <>
      <div className="tools">
        <span className="hint">From</span>
        <input type="date" value={filt.logFrom} onChange={(e) => setFilt({ logFrom: e.target.value })} />
        <span className="hint">To</span>
        <input type="date" value={filt.logTo} onChange={(e) => setFilt({ logTo: e.target.value })} />
        <span className="hint">Audit lines can’t be edited or deleted.</span>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Changed by</th><th>What</th><th>Role</th><th>Old</th><th>New</th><th>Reason</th></tr></thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: "nowrap" }}>{l.at}</td>
              <td>{l.by}</td>
              <td>{target(l)}</td>
              <td>{l.role ? M.roleLabel(l.role) : ""}</td>
              <td>{String(l.from ?? "")}</td>
              <td>{String(l.to ?? "")}</td>
              <td style={{ fontSize: 12 }}>{l.reason}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="empty">No changes in this period.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

/* =====================================================================
   Delegation helper (People tab) — active cycle, row count, fill from hierarchy
   ===================================================================== */
function nameOf(x) {
  if (x == null) return "";
  if (typeof x === "string" || typeof x === "number") return String(x);
  return x.name || x.empName || x.emp_name || x.label || x.empId || x.emp_id || JSON.stringify(x);
}

function NameList({ title, names }) {
  if (!names || !names.length) return null;
  return (
    <span className="note" style={{ color: "inherit" }}>
      {title} ({names.length}): {names.slice(0, 40).join(", ")}{names.length > 40 ? " … +" + (names.length - 40) + " more" : ""}
    </span>
  );
}

function DelegationHelper({ cyc, onFilled, noteEnforced, pick, setPick }) {
  const [count, setCount] = useState(null);
  const [countErr, setCountErr] = useState("");
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const selId = pick || cyc.activeId || (cyc.list[0] && cyc.list[0].id) || "";
  const selCycle = cyc.list.find((c) => c.id === selId);
  const activeCycle = cyc.list.find((c) => c.id === cyc.activeId);

  useEffect(() => {
    if (!selId) return undefined;
    let live = true;
    setCount(null);
    setCountErr("");
    getDelegation(selId).then(
      (r) => {
        if (!live) return;
        noteEnforced(r.enforced);
        const rows = r.rows || r.delegation || r.data || [];
        setCount(typeof r.count === "number" ? r.count : Array.isArray(rows) ? rows.length : 0);
      },
      (e) => { if (live) { noteEnforced(e.enforced); setCountErr(e.message); } },
    );
    return () => { live = false; };
  }, [selId, tick, noteEnforced]);

  async function doFill() {
    setConfirm(false);
    setBusy(true);
    setResult(null);
    try {
      const r = await fillDelegation(selId);
      noteEnforced(r.enforced);
      // accessapi: { employees, inserted, deleted, techEdSet, compManagerSet,
      //   unmatched:{ techEd:[{value,count}], compManager:[{name,count}] }, ambiguous:{ compManager:[{name,candidates,count}] } }
      const um = r.unmatched && !Array.isArray(r.unmatched) && typeof r.unmatched === "object" ? r.unmatched : null;
      const label = (x) => nameOf(x && typeof x === "object" && x.value != null ? x.value : x) + (x && x.count > 1 ? " ×" + x.count : "");
      const unTech = um ? (um.techEd || []).map(label) : [];
      const unComp = um ? (um.compManager || []).map(label) : Array.isArray(r.unmatched) ? r.unmatched.map(nameOf) : [];
      const amb = ((r.ambiguous && r.ambiguous.compManager) || []).map(label);
      setResult({
        ok: true,
        employees: r.employees, inserted: r.inserted ?? r.matched ?? 0, deleted: r.deleted,
        techEdSet: r.techEdSet, compManagerSet: r.compManagerSet,
        unTech, unComp, amb,
      });
      setTick((t) => t + 1);
      onFilled();
    } catch (e) {
      noteEnforced(e.enforced);
      setResult({ ok: false, error: e.message || "Could not fill Delegation." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dlg">
      <span className="lbl">Delegation</span>
      {!cyc.loaded ? (
        <span className="hint">Loading cycles…</span>
      ) : cyc.error ? (
        <span className="flag">{cyc.error}</span>
      ) : (
        <>
          <span className="hint">Active cycle:</span>
          <b>{activeCycle ? activeCycle.name : "—"}</b>
          <span className="hint">· Cycle</span>
          <select value={selId} onChange={(e) => { setPick(e.target.value); setResult(null); }} disabled={!cyc.list.length}>
            {!cyc.list.length && <option value="">No cycles</option>}
            {cyc.list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status ? " (" + c.status + ")" : ""}</option>)}
          </select>
          <span className="hint">
            {selId ? (countErr ? "Row count unavailable: " + countErr : count == null ? "Counting rows…" : count + " Delegation row" + (count === 1 ? "" : "s")) : ""}
          </span>
          <button type="button" className="btn sm p" disabled={!selId || busy} onClick={() => setConfirm(true)}>
            {busy ? "Filling…" : "Fill Delegation from current hierarchy"}
          </button>
          {!cyc.activeId && (
            <div className="banner">No Active cycle — Tech EDs and Comp Managers get no access until a cycle is set to Active in Appraisal Cycle Master.</div>
          )}
        </>
      )}
      {result && (
        <div className="res">
          {result.ok ? (
            <div className={result.unTech.length || result.unComp.length || result.amb.length ? "banner" : "msg ok"} style={{ margin: 0 }}>
              Delegation filled for {selCycle ? selCycle.name : "the cycle"}: {result.inserted} rows written
              {result.deleted ? " (" + result.deleted + " old rows replaced)" : ""}
              {result.techEdSet != null ? " · Tech ED matched for " + result.techEdSet : ""}
              {result.compManagerSet != null ? " · Comp Manager matched for " + result.compManagerSet : ""}
              {result.employees != null ? " of " + result.employees + " employees" : ""}
              {" · unmatched: " + (result.unTech.length + result.unComp.length) + (result.amb.length ? " · ambiguous: " + result.amb.length : "")}.
              <NameList title="Tech ED not matched" names={result.unTech} />
              <NameList title="Comp Manager not matched" names={result.unComp} />
              <NameList title="Comp Manager ambiguous (same name in Employee Master)" names={result.amb} />
            </div>
          ) : (
            <div className="msg err" style={{ margin: 0 }}>{result.error}</div>
          )}
        </div>
      )}
      {confirm && (
        <Modal title="Fill Delegation from current hierarchy" onClose={() => setConfirm(false)}>
          <div className="mbody">
            <p style={{ margin: "0 0 8px" }}>
              This <b>replaces all Delegation rows</b> for <b>{selCycle ? selCycle.name : "this cycle"}</b> with rows built from the current hierarchy:
            </p>
            <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>
              <li>Tech ED from Employee Master (Appraiser Tech ED)</li>
              <li>Comp Manager from the Appraisal Sheet (Comp Manager name matched to Employee Master)</li>
            </ul>
            <p style={{ margin: 0 }} className="derived">
              Any changes made to this cycle&apos;s Delegation by hand will be lost. Names that can&apos;t be matched are listed afterwards. Access is recalculated for everyone.
            </p>
          </div>
          <div className="mfoot">
            <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancel</button>
            <button type="button" className="btn p" onClick={doFill}>Replace and fill</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =====================================================================
   Modals: + Override / + Extra team, + Add role
   ===================================================================== */
function OverrideModal({ M, empId, teamOnly, today, onSave, onClose }) {
  const persons = M.people.filter(M.canLogIn);
  const [f, setF] = useState(() => ({
    empId: persons.some((p) => p.empId === empId) ? empId : persons[0] ? persons[0].empId : "",
    type: teamOnly ? "team" : "screen", key: "", value: "", to: "", reason: "",
  }));
  const [err, setErr] = useState("");
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setErr(""); };

  let keyOpts = [], valOpts = [];
  if (f.type === "screen") { keyOpts = M.SCREENS.filter((s) => !s.hrOnly).map((s) => [s.key, s.label]); valOpts = [["none", "None"], ["view", "View (read-only)"], ["edit", "Edit"]]; }
  if (f.type === "action") { keyOpts = M.ACTIONS.filter((a) => !a.fixed).map((a) => [a.key, a.label]); valOpts = [["true", "Yes"], ["false", "No"]]; }
  if (f.type === "field") { keyOpts = M.FIELDS.filter((x) => x.kind !== "calc" && x.kind !== "pair").map((x) => [x.key, x.label]); valOpts = [["edit", "Edit"], ["read", "Read"], ["hidden", "Hidden"]]; }
  if (f.type === "role") { valOpts = M.roles().map((r) => [r.key, r.label]); }
  if (f.type === "team") {
    keyOpts = M.people.filter((p) => { const r = M.baseRole(p).role; return r === "techEd" || r === "compMgr"; })
      .map((p) => [p.empId, p.name + " (" + M.roleLabel(M.baseRole(p).role) + ")"]);
  }
  const key = keyOpts.some((o) => o[0] === f.key) ? f.key : keyOpts[0] ? keyOpts[0][0] : "";
  const value = valOpts.some((o) => o[0] === f.value) ? f.value : valOpts[0] ? valOpts[0][0] : "";

  function save() {
    if (!f.empId) return setErr("Pick a person.");
    if (f.type !== "role" && !key) return setErr("Nothing to pick.");
    if (f.to && f.to < today) return setErr("The end date is in the past.");
    const o = { empId: f.empId, type: f.type, key: f.type === "role" ? "" : key, to: f.to, reason: f.reason.trim(), by: "", at: today };
    o.value = f.type === "action" ? value === "true" : f.type === "team" ? "add" : value;
    if (f.type === "field") { const fld = byKey(M.FIELDS, o.key); if (fld && fld.kind !== "input" && o.value === "edit") return setErr(fld.label + " can’t be set to Edit."); }
    if (f.type === "team" && o.key === o.empId) return setErr("That is the person’s own team.");
    onSave(o);
  }

  const typeOpts = teamOnly ? [["team", "Extra team"]] : [["screen", "Screen"], ["action", "Action"], ["field", "Field"], ["role", "Whole role"], ["team", "Extra team"]];
  return (
    <Modal title={teamOnly ? "+ Extra team" : "+ Override"} onClose={onClose}>
      <div className="mform">
        <div>
          <label>Person</label>
          <select value={f.empId} onChange={(e) => set({ empId: e.target.value })}>
            {persons.map((p) => { const r = M.effRole(p).role; return <option key={p.empId} value={p.empId}>{p.name + " (" + (r ? M.roleLabel(r) : "no role") + ")"}</option>; })}
          </select>
        </div>
        <div>
          <label>Type</label>
          <select value={f.type} onChange={(e) => set({ type: e.target.value, key: "", value: "" })}>
            {typeOpts.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}
          </select>
        </div>
        <div className="full">
          {(f.type === "screen" || f.type === "action" || f.type === "field") && (
            <div className="mform inner">
              <div>
                <label>{f.type === "screen" ? "Screen" : f.type === "action" ? "Action" : "Field"}</label>
                <select value={key} onChange={(e) => set({ key: e.target.value })}>{keyOpts.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
              </div>
              <div>
                <label>{f.type === "screen" ? "Access" : f.type === "action" ? "Allowed" : "Limit"}</label>
                <select value={value} onChange={(e) => set({ value: e.target.value })}>{valOpts.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
              </div>
            </div>
          )}
          {f.type === "role" && (
            <>
              <label>Treat as role</label>
              <select value={value} onChange={(e) => set({ value: e.target.value })}>{valOpts.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            </>
          )}
          {f.type === "team" && (
            <>
              <label>Add the team of</label>
              <select value={key} onChange={(e) => set({ key: e.target.value })}>{keyOpts.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            </>
          )}
        </div>
        <div>
          <label>End date (leave empty = no end date)</label>
          <input type="date" value={f.to} min={today} onChange={(e) => set({ to: e.target.value })} />
        </div>
        <div>
          <label>Reason (also asked at Apply)</label>
          <input maxLength={300} value={f.reason} onChange={(e) => set({ reason: e.target.value })} />
        </div>
      </div>
      {err && <div className="msg err" style={{ margin: "0 14px 10px" }}>{err}</div>}
      <div className="mfoot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn p" onClick={save}>Add to pending</button>
      </div>
    </Modal>
  );
}

function RoleModal({ M, onSave, onClose }) {
  const [label, setLabel] = useState("");
  const [catalystRole, setCatalystRole] = useState("");
  const [seesAll, setSeesAll] = useState(false);
  const [err, setErr] = useState("");
  function save() {
    const l = label.trim(), c = catalystRole.trim();
    if (!l) return setErr("Enter the display name.");
    if (!c) return setErr("Enter the Catalyst role name.");
    if (M.roles().some((r) => r.label.toLowerCase() === l.toLowerCase() || (r.catalystRole && r.catalystRole.toLowerCase() === c.toLowerCase())))
      return setErr("A role with this name or Catalyst role already exists.");
    onSave({ label: l, catalystRole: c, seesAll });
  }
  return (
    <Modal title="+ Add role" onClose={onClose}>
      <div className="mform">
        <div><label>Display name</label><input placeholder="e.g. Comp Viewer" value={label} onChange={(e) => { setLabel(e.target.value); setErr(""); }} /></div>
        <div><label>Catalyst role (Authentication → Roles)</label><input placeholder="exact Catalyst role name" value={catalystRole} onChange={(e) => { setCatalystRole(e.target.value); setErr(""); }} /></div>
        <div className="full">
          <label><input type="checkbox" checked={seesAll} onChange={(e) => setSeesAll(e.target.checked)} /> Sees all employees (otherwise no team unless given extra scope)</label>
        </div>
        <div className="full derived">The new role starts with <b>None</b> on every screen and <b>No</b> on every action. HR Operations screens stay HR only.</div>
      </div>
      {err && <div className="msg err" style={{ margin: "0 14px 10px" }}>{err}</div>}
      <div className="mfoot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn p" onClick={save}>Add to pending</button>
      </div>
    </Modal>
  );
}


/* =====================================================================
   Quick check (no AI — looks up the access data on this screen)
   ===================================================================== */
function normQc(qc, M, sel) {
  const pickT = (kind, preferred) => {
    const list = kind === "screen" ? M.SCREENS : kind === "action" ? M.ACTIONS : M.FIELDS;
    if (byKey(list, preferred)) return kind + ":" + preferred;
    return list[0] ? kind + ":" + list[0].key : "";
  };
  const exists = (t) => { if (!t) return false; const [k, key] = t.split(":"); return !!M.itemOf(k, key); };
  let t = qc.t;
  const q = qc.q;
  if (q === "who" || q === "why") { if (!exists(t)) t = pickT("screen", "appraisalSheet"); }
  if (q === "does") { if (!exists(t) || t.indexOf("screen:") !== 0) t = pickT("screen", "payroll"); }
  if (q === "can") { if (!exists(t) || t.indexOf("action:") !== 0) t = pickT("action", "bulkEdit"); }
  const k = (t || "screen:").split(":")[0];
  const levels = k === "screen" ? [["view", "View (read-only)"], ["edit", "Edit"], ["none", "None"]] : k === "action" ? [["true", "Yes"], ["false", "No"]] : [["edit", "Edit"], ["read", "Read"], ["hidden", "Hidden"]];
  const l = levels.some((x) => x[0] === qc.l) ? qc.l : levels[0][0];
  let p = qc.p || sel || (M.people[0] && M.people[0].empId) || "";
  if (p && !M.personByEmp(p)) p = (M.people[0] && M.people[0].empId) || "";
  return { q, t, l, p, levels };
}

function TargetOptions({ M, kind }) {
  const groups = kind ? [kind] : ["screen", "action", "field"];
  const lists = { screen: M.SCREENS, action: M.ACTIONS, field: M.FIELDS };
  const names = { screen: "Screens", action: "Actions", field: "Fields" };
  return groups.map((g) => (
    <optgroup key={g} label={names[g]}>
      {lists[g].map((x) => <option key={g + x.key} value={g + ":" + x.key}>{x.label}</option>)}
    </optgroup>
  ));
}

function srcText(M, e) {
  if (e.src === "locked") return "Locked rule";
  if (e.src === "override") return "Override: " + (e.ov.reason || "") + " — set by " + (e.ov.by || "HR") + (e.ov.at ? " on " + fmtD(e.ov.at) : "") + (e.ov.to ? ", ends " + fmtD(e.ov.to) : ", no end date");
  if (e.src === "role") return "Role setting (" + M.roleLabel(e.role) + ")";
  if (e.src === "calculated") return "Calculated — follows the columns it is built from";
  if (e.src === "pair") return "Follows Hike Amount";
  return e.src;
}

function QuickCheckAnswer({ M, n }) {
  const [kind, key] = (n.t || "").split(":");
  const item = M.itemOf(kind, key) || { label: key || "", fixed: "" };
  const p = M.personByEmp(n.p);
  const flagsText = (x) => M.flagsOf(x).map((f) => f[0]).join(", ");

  if (n.q === "who") {
    const want = kind === "action" ? n.l === "true" : n.l;
    const hits = M.people.filter((x) => M.canLogIn(x) && M.effRole(x).role && M.eff(x, kind, key).v === want);
    const byRole = {}, ovHits = [];
    hits.forEach((x) => { const e = M.eff(x, kind, key); if (e.src === "override") ovHits.push(x.name); else { const r = M.effRole(x).role; byRole[r] = (byRole[r] || 0) + 1; } });
    return (
      <>
        <b>{hits.length} {hits.length === 1 ? "person" : "people"}</b> have {M.valText(kind, want)} on {item.label}.
        <ul>
          {Object.keys(byRole).map((r) => <li key={r}>{M.roleLabel(r)}: {byRole[r]} (role setting)</li>)}
          {ovHits.length > 0 && <li>By override: {ovHits.join(", ")}</li>}
        </ul>
        {hits.length > 0 && (
          <div className="src" style={{ marginTop: 4 }}>
            {hits.slice(0, 8).map((x) => x.name).join(", ")}{hits.length > 8 ? " … +" + (hits.length - 8) + " more" : ""}
          </div>
        )}
      </>
    );
  }
  if (!p) return <>Pick a person.</>;
  const er = M.effRole(p);
  if (n.q === "does" || n.q === "can" || n.q === "why") {
    const e = M.eff(p, kind, key);
    const yes = kind === "screen" ? e.v !== "none" : kind === "action" ? !!e.v : e.v !== "hidden";
    let why = "";
    if (!M.canLogIn(p)) why = "Can’t log in: " + flagsText(p) + ".";
    else if (!er.role) why = "No role — not in Delegation and no Catalyst role.";
    else if (e.src === "locked") why = kind === "screen" ? item.label + " is HR Admin only and can’t be changed." : "Fixed rule: " + item.fixed + ".";
    else if (e.src === "override") why = srcText(M, e) + ". Without it, " + M.roleLabel(er.role) + " gives " + M.valText(kind, kind === "field" ? M.limitsFor(er.role, [])[key] : M.cur(kind, er.role, key)) + ".";
    else if (e.src === "role") {
      const lc = M.lastRoleChange(kind, e.role, key);
      why = "Role setting: " + M.roleLabel(e.role) + " gets " + M.valText(kind, e.v) + (lc ? " — set by " + lc.by + " on " + fmtD(String(lc.at).slice(0, 10)) + ": “" + lc.reason + "”" : " (starting value)") + ".";
    } else why = srcText(M, e) + ".";
    return (
      <>
        {n.q === "why" ? (
          <><b>{p.name}</b> has <b>{M.valText(kind, e.v)}</b> on {item.label}.</>
        ) : (
          <><b className={yes ? "y" : "n"}>{yes ? "Yes." : "No."}</b> {p.name}{kind === "screen" ? " has " + M.valText(kind, e.v) + " on " : yes ? " can use " : " can’t use "}{item.label}.</>
        )}
        <div className="src" style={{ marginTop: 4 }}>{why}</div>
        <div className="src">{p.name} is {er.role ? M.roleLabel(er.role) : "—"} · {er.from}</div>
      </>
    );
  }
  // what
  const scr = M.SCREENS.filter((s) => M.effScreen(p, s.key).v !== "none");
  const act = M.ACTIONS.filter((a) => M.effAction(p, a.key).v);
  const ok = M.canLogIn(p) && !!er.role, lim = M.limitsFor(er.role, M.ovFor(p.empId));
  const ed = ok ? M.FIELDS.filter((f) => lim[f.key] === "edit") : [];
  const hid = ok ? M.FIELDS.filter((f) => lim[f.key] === "hidden") : [];
  return (
    <>
      <b>{p.name}</b> · {er.role ? M.roleLabel(er.role) : "no role"}{M.canLogIn(p) ? "" : " · can’t log in (" + flagsText(p) + ")"}
      <ul>
        <li>Screens: {scr.length ? scr.map((s) => s.label + " (" + LEVEL_LABEL[M.effScreen(p, s.key).v] + ")").join(", ") : "none"}</li>
        <li>Actions: {act.length ? act.map((a) => a.label).join(", ") : "none"}</li>
        <li>Can edit: {ed.length ? ed.map((f) => f.label).join(", ") : "nothing"}</li>
        <li>Can’t see: {hid.length ? hid.map((f) => f.label).join(", ") : "nothing hidden"}</li>
      </ul>
    </>
  );
}

function QuickCheck({ M, qc, setQc, sel, shown, setShown }) {
  const n = normQc(qc, M, sel);
  const change = (patch) => { setQc((x) => ({ ...x, ...patch })); setShown(false); };
  const personSel = (
    <select value={n.p} onChange={(e) => change({ p: e.target.value })}>
      {M.people.map((p) => <option key={p.empId} value={p.empId}>{p.name}</option>)}
    </select>
  );
  return (
    <div className="qc">
      <h4><span>Quick check</span></h4>
      <div className="row">
        <select value={n.q} onChange={(e) => change({ q: e.target.value, t: "" })}>
          {[["who", "Who has"], ["does", "Does"], ["can", "Can"], ["why", "Why does"], ["what", "What does"]].map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}
        </select>
        {n.q === "who" && (
          <>
            <select value={n.l} onChange={(e) => change({ l: e.target.value, t: n.t })}>{n.levels.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            <span className="hint">on</span>
            <select value={n.t} onChange={(e) => change({ t: e.target.value })}><TargetOptions M={M} /></select>
          </>
        )}
        {n.q === "does" && (
          <>{personSel}<span className="hint">have access to</span><select value={n.t} onChange={(e) => change({ t: e.target.value })}><TargetOptions M={M} kind="screen" /></select></>
        )}
        {n.q === "can" && (
          <>{personSel}<select value={n.t} onChange={(e) => change({ t: e.target.value })}><TargetOptions M={M} kind="action" /></select></>
        )}
        {n.q === "why" && (
          <>{personSel}<span className="hint">have this access to</span><select value={n.t} onChange={(e) => change({ t: e.target.value })}><TargetOptions M={M} /></select></>
        )}
        {n.q === "what" && <>{personSel}<span className="hint">have</span></>}
        <button type="button" className="btn p sm" onClick={() => setShown(true)}>Check</button>
      </div>
      {shown && <div className="qans"><QuickCheckAnswer M={M} n={n} /></div>}
    </div>
  );
}

/* =====================================================================
   Right side panel
   ===================================================================== */
function SidePanel({ M, sel, onPick, onNewOv, onToggleRemove, onTab, qcProps }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    function onDown(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const ql = q.trim().toLowerCase();
  const hits = ql ? M.people.filter((p) => (p.name + " " + p.email + " " + p.empId).toLowerCase().indexOf(ql) > -1).slice(0, 12) : [];
  const pick = (id) => { onPick(id); setQ(""); setOpen(false); };

  const p = sel && M.personByEmp(sel);
  const ovs = M.activeOverrides();
  const attn = [];
  M.people.forEach((x) => { M.flagsOf(x).forEach((f) => attn.push({ empId: x.empId, name: x.name, t: f[0], c: f[1] })); });
  ovs.filter((o) => !o.to).forEach((o) => { const x = M.personByEmp(o.empId); attn.push({ empId: o.empId, name: x ? x.name : o.empId, t: "Override with no end date", c: "a" }); });
  const counts = {};
  M.people.forEach((x) => { const r = M.effRole(x).role; if (r && M.canLogIn(x)) counts[r] = (counts[r] || 0) + 1; });

  let card;
  if (!p) card = <div className="pcard derived">Search a person to see their role, team and overrides.</div>;
  else {
    const er = M.effRole(p), t = M.teamOf(p), fl = M.flagsOf(p);
    card = (
      <div className="pcard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
          <div><h3>{p.name}</h3><div className="meta">{p.empId}{p.email ? " · " + p.email : ""}</div></div>
          {er.role && <RoleBadge M={M} roleKey={er.role} />}
        </div>
        <div className="kv">
          <b>Role from</b><span>{er.from}</span>
          <b>Team</b><span>{t.txt}</span>
          <b>Extra team</b><span>{t.extra && t.extra.length ? t.extra.join(", ") : "—"}</span>
        </div>
        {fl.map((x) => <div key={x[0]} style={{ marginTop: 6 }}><Flag f={x} /></div>)}
        {M.ovFor(p.empId).map((o) => (
          <div className="ov" key={o.id}>
            <span>{M.ovText(o)}{o.to ? " · till " + fmtD(o.to) : <> · <span className="flag a">No end date</span></>}</span>
            <button type="button" className="btn sm" onClick={() => onToggleRemove(o.id)}>Remove</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={() => onNewOv(false, p.empId)}>+ Override</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card side">
      <div className="chead"><span>Find a person</span><small>{M.people.length} people</small></div>
      <div className="sbox" ref={boxRef}>
        <input placeholder="Search name, email or Employee ID" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        {open && ql && (
          <div className="sres">
            {hits.length ? hits.map((x) => {
              const r = M.effRole(x).role;
              return <div key={x.empId} onClick={() => pick(x.empId)}><span><b>{x.name}</b> {x.empId}</span><span>{r ? M.roleLabel(r) : "—"}</span></div>;
            }) : <div className="derived">No one found</div>}
          </div>
        )}
      </div>
      <QuickCheck M={M} sel={sel} {...qcProps} />
      {card}
      <div className="sec">
        <h4><span>Overrides ({ovs.length})</span><span className="link" onClick={() => onTab("overrides")}>See all ›</span></h4>
        {ovs.length ? ovs.slice(0, 5).map((o) => {
          const x = M.personByEmp(o.empId);
          return <div className="li" key={o.id} onClick={() => onPick(o.empId)}><span>{x ? x.name : o.empId}</span><span>{M.ovText(o)}{o.to ? " · " + fmtD(o.to) : ""}</span></div>;
        }) : <div className="derived">None</div>}
      </div>
      <div className="sec">
        <h4><span>Needs attention ({attn.length})</span></h4>
        {attn.length ? attn.map((x, i) => (
          <div className="li" key={x.empId + "|" + x.t + "|" + i} onClick={() => onPick(x.empId)}><span>{x.name}</span><span className={"flag " + x.c}>{x.t}</span></div>
        )) : <div className="derived">Nothing</div>}
      </div>
      <div className="counts">{M.roles().map((r) => r.label + " " + (counts[r.key] || 0)).join(" · ")}</div>
    </div>
  );
}

/* =====================================================================
   Page
   ===================================================================== */
export default function AccessPage() {
  const today = useMemo(todayStr, []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataVer, setDataVer] = useState({ version: 0, from: "" });
  const [enforced, setEnforced] = useState(null);
  const [pending, setPending] = useState({});
  const [tab, setTab] = useState("screens");
  const [sel, setSel] = useState(null);
  const [filt, setFiltState] = useState({ fieldSearch: "", fieldKind: "", fieldShowRole: "", fieldShowLim: "", peopleRole: "", peopleSearch: "", logFrom: "", logTo: "" });
  const [qc, setQc] = useState({ q: "who", t: "", l: "", p: "" });
  const [qcShown, setQcShown] = useState(false);
  const [msg, setMsg] = useState(null);
  const [reason, setReason] = useState("");
  const [modal, setModal] = useState(null);
  const [applying, setApplying] = useState(false);
  const [cyc, setCyc] = useState({ loaded: false, list: [], activeId: "", error: "" });
  const reasonRef = useRef(null);
  const tmp = useRef(0);

  const setFilt = useCallback((patch) => setFiltState((f) => ({ ...f, ...patch })), []);
  const showMsg = useCallback((text, ok) => setMsg({ text, ok: !!ok }), []);
  const noteEnforced = useCallback((v) => { if (typeof v === "boolean") setEnforced(v); }, []);

  /* load only when changed: keep a copy for this browser session, download again only if the version changed */
  // Cycle whose Delegation the People tab lists ("" = the Active cycle).
  const [listCycle, setListCycle] = useState("");
  const listCycleRef = useRef("");

  const loadData = useCallback(async (force) => {
    const cache = readCache();
    try {
      const v = await getVersion();
      noteEnforced(v.enforced);
      if (!force && !listCycleRef.current && cache && cache.data && cache.version === v.version) {
        setData(cache.data);
        setDataVer({ version: v.version, from: "from copy, nothing downloaded" });
        return;
      }
      const d = await getAdminState(listCycleRef.current);
      noteEnforced(d.enforced);
      const snap = {
        catalog: d.catalog || { screens: [], actions: [], fields: [] },
        roles: d.roles || [], matrix: d.matrix || { screens: {}, actions: {}, fields: {} },
        people: d.people || [], deleg: d.deleg || EMPTY_DELEG, overrides: d.overrides || [], log: d.log || [],
        listDeleg: d.listDeleg || d.deleg || EMPTY_DELEG, listCycleId: d.listCycleId || "", listCycleActive: d.listCycleActive !== false,
      };
      writeCache(d.version, snap);
      setData(snap);
      setDataVer({ version: d.version, from: "downloaded" });
    } catch (err) {
      noteEnforced(err?.enforced);
      showMsg(err?.message || "Could not reach accessapi.");
    } finally {
      setLoading(false);
    }
  }, [noteEnforced, showMsg]);

  const loadCycles = useCallback(async () => {
    try {
      const r = await getCycles();
      noteEnforced(r.enforced);
      const list = (r.cycles || []).map((c) => ({ id: String(c.id ?? c.ROWID ?? ""), name: c.name ?? c.cycle_name ?? String(c.id), status: c.status || "" }));
      const act = r.activeCycleId ?? r.activeId ?? r.active?.id ?? (list.find((c) => String(c.status).toLowerCase() === "active") || {}).id ?? "";
      setCyc({ loaded: true, list, activeId: act ? String(act) : "", error: "" });
    } catch (err) {
      noteEnforced(err?.enforced);
      setCyc({ loaded: true, list: [], activeId: "", error: err?.message || "Could not load cycles." });
    }
  }, [noteEnforced]);

  useEffect(() => {
    loadData(false);
    loadCycles();
  }, [loadData, loadCycles]);

  // With no Active cycle, list people for the cycle the Delegation bar shows (the first one).
  useEffect(() => {
    if (!cyc.loaded || cyc.activeId || listCycleRef.current || !cyc.list.length) return;
    listCycleRef.current = cyc.list[0].id;
    setListCycle(cyc.list[0].id);
    loadData(true);
  }, [cyc, loadData]);

  const cycleName = (cyc.list.find((c) => c.id === cyc.activeId) || {}).name || "";
  const M = useMemo(() => buildModel(data, pending, today, cycleName), [data, pending, today, cycleName]);

  /* ---------- pending changes ---------- */
  const setVal = (kind, role, key, to) => {
    setPending((prev) => {
      const k = kind + "|" + role + "|" + key;
      const next = { ...prev };
      if (M.saved(kind, role, key) === to) delete next[k];
      else next[k] = { kind, role, key, to };
      return next;
    });
  };
  const onRetire = (rk) => {
    setPending((prev) => {
      const next = { ...prev };
      if (next["roleAdd|" + rk]) {
        delete next["roleAdd|" + rk];
        Object.keys(next).forEach((k) => { const p = next[k]; if (p.role === rk || (p.ov && p.ov.type === "role" && p.ov.value === rk)) delete next[k]; });
      } else if (next["roleRetire|" + rk]) delete next["roleRetire|" + rk];
      else next["roleRetire|" + rk] = { kind: "roleRetire", key: rk };
      return next;
    });
  };
  const onToggleRemove = (id) => {
    const o = M.overrides.find((x) => x.id === id);
    setPending((prev) => {
      const next = { ...prev }, k = "ovRemove|" + id;
      if (!o) delete next["ovAdd|" + id];
      else if (next[k]) delete next[k];
      else next[k] = { kind: "ovRemove", id: o.id, type: o.type };
      return next;
    });
  };
  const onUndoAdd = (id) => setPending((prev) => { const next = { ...prev }; delete next["ovAdd|" + id]; return next; });

  const onPick = (empId) => { setSel(empId); setQc((x) => ({ ...x, p: empId })); setQcShown(false); };
  const onTab = (t) => { setTab(t); setMsg(null); };

  const saveOv = (o) => {
    const id = "n" + ++tmp.current;
    const ov = { ...o, id };
    setPending((prev) => ({ ...prev, ["ovAdd|" + id]: { kind: "ovAdd", ov } }));
    setModal(null);
    setSel(ov.empId);
  };
  const saveRole = ({ label, catalystRole, seesAll }) => {
    const key = "r" + label.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) + ++tmp.current;
    const role = { key, label, source: "catalyst", catalystRole, seesAll, fixed: false };
    setPending((prev) => ({ ...prev, ["roleAdd|" + key]: { kind: "roleAdd", role } }));
    setModal(null);
  };

  const discard = () => { setPending({}); setReason(""); setMsg(null); };
  const doApply = async () => {
    const r = reason.trim();
    if (!r) { showMsg("Please give a reason for the change."); reasonRef.current?.focus(); return; }
    setApplying(true);
    try {
      const d = await applyChanges(r, changeList(pending));
      noteEnforced(d.enforced);
      setPending({});
      setReason("");
      showMsg(d.applied + " change(s) applied and logged. Access version is now v" + d.version + ".", true);
      await loadData(true);
    } catch (err) {
      noteEnforced(err?.enforced);
      showMsg(err?.message || "Could not save.");
    } finally {
      setApplying(false);
    }
  };

  const exportPeople = () => {
    const rows = [["Employee ID", "Name", "Email", "Role", "Role from", "Team", "Overrides", "Flags"]];
    M.people.forEach((p) => {
      const er = M.effRole(p);
      rows.push([p.empId, p.name, p.email, er.role ? M.roleLabel(er.role) : "", er.from, M.teamOf(p).txt, M.ovFor(p.empId).map(M.ovText).join("; "), M.flagsOf(p).map((f) => f[0]).join("; ")]);
    });
    const csv = rows.map((r) => r.map((c) => '"' + String(c ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "access_people_" + today + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const nPending = Object.keys(pending).length;
  const tabDef = byKey(TABS, tab);
  const lastLog = M.log[0];

  let body;
  if (!data) body = <div className="empty">{loading ? "Loading access settings…" : "Access settings could not be loaded."}</div>;
  else if (tab === "screens") body = <ScreensTab M={M} pending={pending} setVal={setVal} onRetire={onRetire} onAddRole={() => setModal({ type: "role" })} />;
  else if (tab === "actions") body = <ActionsTab M={M} setVal={setVal} onRetire={onRetire} />;
  else if (tab === "fields") body = <FieldsTab M={M} setVal={setVal} onRetire={onRetire} filt={filt} setFilt={setFilt} />;
  else if (tab === "people") {
    body = (
      <PeopleTab
        M={M} filt={filt} setFilt={setFilt} onPick={onPick} onExport={exportPeople}
        delegationHelper={
          <DelegationHelper
            cyc={cyc}
            noteEnforced={noteEnforced}
            pick={listCycle}
            setPick={(id) => { listCycleRef.current = id; setListCycle(id); loadData(true); }}
            onFilled={() => { loadData(true); loadCycles(); }}
          />
        }
      />
    );
  } else if (tab === "overrides" || tab === "scope") {
    body = <OverridesTab M={M} team={tab === "scope"} today={today} onNew={(team) => setModal({ type: "ov", teamOnly: team, empId: sel })} onToggleRemove={onToggleRemove} onUndoAdd={onUndoAdd} />;
  } else body = <AuditTab M={M} filt={filt} setFilt={setFilt} />;

  return (
    <div className="access-screen">
      {enforced === false && (
        <div className="banner">Access rules are in dry-run (ACCESS_ENFORCE is off): settings are saved and shown, but not yet enforced.</div>
      )}

      <div className="info">
        <div><span className="t">Access</span><span className="d">Roles from Catalyst and Delegation. Set what each role can do; override for one person.</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="d" title="Access data is downloaded only when it has changed">{dataVer.version ? "Data v" + dataVer.version + " · " + dataVer.from + " · " : ""}</span>
          <span className="d">{lastLog ? "Last change " + fmtD(String(lastLog.at).slice(0, 10)) + " by " + lastLog.by : ""}</span>
        </div>
      </div>

      <div className="wrap">
        <div className="card">
          <div className="chead"><span>{tabDef.title}</span><small>{tabDef.sub}</small></div>
          <div className="tabs">
            {TABS.map((t) => {
              const n = M.pendFor(t.key);
              const cnt = t.key === "overrides" ? M.activeOverrides().filter((o) => o.type !== "team").length : 0;
              return (
                <button type="button" key={t.key} className={"tab" + (tab === t.key ? " on" : "")} onClick={() => onTab(t.key)}>
                  {t.label}
                  {n ? <span className="n">{n}</span> : cnt ? <span className="n cnt0">{cnt}</span> : null}
                </button>
              );
            })}
          </div>
          {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.text}</div>}
          <div className="body">{body}</div>
          <div className="pend">
            <span className={"cnt" + (nPending ? "" : " z")}>{nPending ? nPending + " pending change" + (nPending > 1 ? "s" : "") : "No pending changes"}</span>
            <input ref={reasonRef} placeholder="Reason for the change (saved in the audit trail)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <button type="button" className="btn" onClick={discard} disabled={applying}>Discard</button>
            <button type="button" className="btn p" onClick={doApply} disabled={!nPending || applying}>{applying ? "Applying…" : "Apply"}</button>
          </div>
        </div>

        <SidePanel
          M={M} sel={sel} onPick={onPick} onTab={onTab} onToggleRemove={onToggleRemove}
          onNewOv={(team, empId) => setModal({ type: "ov", teamOnly: team, empId: empId || sel })}
          qcProps={{ qc, setQc, shown: qcShown, setShown: setQcShown }}
        />
      </div>

      {modal?.type === "ov" && <OverrideModal M={M} empId={modal.empId} teamOnly={modal.teamOnly} today={today} onSave={saveOv} onClose={() => setModal(null)} />}
      {modal?.type === "role" && <RoleModal M={M} onSave={saveRole} onClose={() => setModal(null)} />}
    </div>
  );
}
