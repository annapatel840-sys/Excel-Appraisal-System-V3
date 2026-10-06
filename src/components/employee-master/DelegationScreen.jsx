import React, { useEffect, useMemo, useState } from "react";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
 
/* ------------------------------------------------------------------ data */
const EMPLOYEE_API_URL = catalystFunctionUrl("employeesapi");
const FIELDS = { comp: "Comp Manager", app: "Appraiser Tech Ed" };
const ST = { CF: "Carried forward", NEW: "New – Tech Ed default", HR: "Changed – HR", TE: "Changed – Tech Ed (approved)", PD: "Pending HR approval" };
const TAG = { [ST.CF]: "cf", [ST.NEW]: "nw", [ST.HR]: "hr", [ST.TE]: "te", [ST.PD]: "pd" };
const PAGE = 50;
const nameOf = (value) => String(value || "").trim();
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const fmt = (s) => { const d = new Date(String(s).replace(" ", "T")); return isNaN(d) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const csvCell = (v) => /[",\n]/.test(String(v ?? "")) ? "\"" + String(v).replace(/"/g, '""') + "\"" : String(v ?? "");
let seq = 1;
const refNo = (p) => p + "-" + now().replace(/\D/g, "").slice(2, 12) + "-" + String(seq++).padStart(4, "0");
/* -------------------------------------------------------------- component */
export default function DelegationScreen({
  initialRows,
  cycleName = "Apr-26",
  showRoleSwitch = false,
  onRefresh, // optional: () => void
  onUpload, // optional: () => void
}) {
  const catalystUser = useCatalystUser();
  const loggedInName = String(catalystUser?.name || catalystUser?.email || "").trim();
  const isHRUser = String(catalystUser?.role || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes("hr");
  const [user, setUser] = useState({ id: loggedInName, name: loggedInName, role: isHRUser ? "HR Admin" : "Tech Ed" });
  const [rows, setRows] = useState(() => initialRows || []);
  const [reqs, setReqs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("appraisal-delegation-requests") || "[]");
    } catch {
      return [];
    }
  });
  const [audit, setAudit] = useState([]);
  const [locked, setLocked] = useState(false);
  const [filter, setFilter] = useState({ q: "", te: "", comp: "", status: "" });
  const [sel, setSel] = useState({});
  const [page, setPage] = useState(1);
  const [reqTab, setReqTab] = useState("Pending");
  const [bulk, setBulk] = useState({
    field: "app",
    scope: "sel",
    person: "",
    reason: "",
  });
  const [bulkOpen, setBulkOpen] = useState(false); // ADDED: Bulk assign starts folded
  const [reqOpen, setReqOpen] = useState(false); // ADDED: Pending approvals starts folded
  const [remarks, setRemarks] = useState({});
  const [modal, setModal] = useState(null); // {type, ...}
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState(null);
 
  useEffect(() => {
    try {
      localStorage.setItem("appraisal-delegation-requests", JSON.stringify(reqs));
    } catch {
      // Local persistence is a temporary bridge until the delegation Data Store/API is connected.
    }
  }, [reqs]);
 
  const isHR = user.role === "HR Admin";
  // Access rules (permissive when accessapi is unavailable).
  const access = useAccess();
  const canApprove = access.canAction("delegateApprove");
  const canAudit = access.canAction("viewAudit");
  // View-only screen, or a Tech Ed without the delegateRequest action: no edits.
  const editLocked =
    locked ||
    !access.canScreen("delegation", "edit") ||
    (!isHR && !access.canAction("delegateRequest"));
 
  useEffect(() => {
    if (initialRows || rows.length) return;
    let cancelled = false;
    const loadRoster = async () => {
      try {
        const firstResponse = await catalystFetch(EMPLOYEE_API_URL + "?page=1&limit=100", { method: "GET", cache: "no-store" });
        const first = await firstResponse.json();
        if (!firstResponse.ok || !first?.success) throw new Error(first?.message || "Unable to load appraisal employees.");
        const all = Array.isArray(first.data) ? [...first.data] : [];
        const totalPages = Math.max(1, Number(first.pagination?.totalPages || 1));
        for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
          const response = await catalystFetch(EMPLOYEE_API_URL + "?page=" + pageNo + "&limit=100", { method: "GET", cache: "no-store" });
          const payload = await response.json();
          if (response.ok && Array.isArray(payload.data)) all.push(...payload.data);
        }
        if (cancelled) return;
        setRows(all.map((item) => ({ id: String(item.emp_id || item.ROWID || "").trim(), name: String(item.name || item.emp_id || "").trim(), rm: String(item.reporting_manager || "").trim(), teId: String(item.appraiser_tech_ed || "").trim(), te: String(item.appraiser_tech_ed || "").trim(), comp: String(item.comp_manager || "").trim(), app: String(item.appraiser_tech_ed || "").trim(), prevComp: "", prevApp: "", base: "", lastRole: "" })).filter((row) => row.id));
      } catch (error) {
        if (!cancelled) say(error?.message || "Unable to load appraisal employees.", true);
      }
    };
    loadRoster();
    return () => { cancelled = true; };
  }, [initialRows]);
  const say = (msg, err) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), err ? 6000 : 3500);
  };
  const log = (a) =>
    setAudit((l) => [
      { on: now(), by: user.name, role: user.role, ...a },
      ...l,
    ]);
 
  /* derived */
  const pendingFor = (rid, reqList = reqs) =>
    reqList.some((q) => q.rowId === rid && q.status === "Pending");
  const statusOf = (r) =>
    pendingFor(r.id)
      ? ST.PD
      : r.lastRole === "HR Admin"
        ? ST.HR
        : r.lastRole === "Tech Ed"
          ? ST.TE
          : r.base;
  const scoped = useMemo(
    () => rows.filter((r) => {
      if (isHR) return true;
      const assigned = String(r.te || r.teId || "").trim().toLowerCase();
      const loggedIn = String(user.name || user.id || "").trim().toLowerCase();
      return assigned === loggedIn || assigned.includes(loggedIn);
    }),
    [rows, user, isHR],
  );
  const myReqs = reqs.filter((q) => FIELDS[q.field] && (isHR || q.byId === user.id));
  const people = useMemo(() => [...new Set([...rows.map((r) => r.comp), ...rows.map((r) => r.app)].filter(Boolean).map((v) => String(v).trim()))].sort((a, b) => a.localeCompare(b)).map((value) => ({ id: value, name: value, roles: [] })), [rows]);
  const pending = myReqs.filter((q) => q.status === "Pending");
  const list = useMemo(() => {
    const q = filter.q.toLowerCase();
    return scoped
      .filter(
        (r) =>
          (!q ||
            r.id.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q)) &&
          (!filter.te || r.te === filter.te) &&
          (!filter.comp || nameOf(r.comp) === filter.comp) &&
          (!filter.status || statusOf(r) === filter.status),
      )
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [scoped, filter, reqs]); // eslint-disable-line
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * PAGE, cur * PAGE);
  const selIds = Object.keys(sel).filter((k) => sel[k]);
  const count = (s) => scoped.filter((r) => statusOf(r) === s).length;
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
 
  /* mutations */
  const applyTo = (rows0, rid, field, pid, role, why, by) =>
    rows0.map((r) =>
      r.id === rid
        ? {
            ...r,
            [field]: pid,
            lastRole: role,
            lastBy: by,
            lastOn: now(),
            lastWhy: why,
          }
        : r,
    );
 
  const raise = (reqList, r, field, pid, why, batch) => {
    const out = reqList.map((q) =>
      q.rowId === r.id && q.field === field && q.status === "Pending"
        ? { ...q, status: "Superseded", decidedOn: now() }
        : q,
    );
    out.push({
      id: `${Date.now()}${Math.random()}`,
      no: refNo("DR"),
      rowId: r.id,
      empId: r.id,
      empName: r.name,
      field,
      oldId: r[field],
      newId: pid,
      reason: why,
      byId: user.id,
      byName: user.name,
      on: now(),
      batch: batch || "",
      status: "Pending",
      decidedBy: "",
      decidedOn: "",
      remarks: "",
    });
    return out;
  };
 
  const saveChange = () => {
    const { row, field, person } = modal;
    if (!reason.trim()) return say("Reason is mandatory.", true);
    if (isHR) {
      setRows((rs) =>
        applyTo(
          rs,
          row.id,
          field,
          person.id,
          "HR Admin",
          reason.trim(),
          user.name,
        ),
      );
      setReqs((qs) =>
        qs.map((q) =>
          q.rowId === row.id && q.field === field && q.status === "Pending"
            ? { ...q, status: "Superseded" }
            : q,
        ),
      );
      log({
        emp: row.id,
        field: FIELDS[field],
        from: nameOf(row[field]),
        to: person.name,
        action: "Edited",
        why: reason,
      });
      say(`${FIELDS[field]} for ${row.name} changed to ${person.name}.`);
    } else {
      const next = raise(reqs, row, field, person.id, reason.trim());
      setReqs(next);
      log({
        emp: row.id,
        field: FIELDS[field],
        from: nameOf(row[field]),
        to: person.name,
        action: "Requested",
        why: reason,
      });
      say(`Request ${next[next.length - 1].no} sent to HR for approval.`);
    }
    setModal(null);
  };
 
  const doBulk = () => {
    const { field, scope, person, reason: why } = bulk;
    if (!person) return say("Choose who to assign.", true);
    if (!why.trim()) return say("Reason is mandatory.", true);
    let t =
      scope === "sel"
        ? scoped.filter((r) => sel[r.id])
        : scoped.filter((r) => r.teId === scope.slice(3));
    if (scope === "sel" && !t.length)
      return say(
        'Select employees in the grid, or choose "All under Tech Ed".',
        true,
      );
    t = t.filter((r) => r[field] !== person);
    if (!t.length)
      return say("No employees to change (already assigned).", true);
    setModal({
      type: "confirm",
      title: "Bulk assign",
      body: `${FIELDS[field]} → ${nameOf(person)} for ${t.length} employee(s). ${isHR ? "This applies immediately." : "One request per employee will be sent to HR."}`,
      ok: () => {
        const no = refNo("BA");
        if (isHR) {
          let rs = rows;
          t.forEach(
            (r) =>
              (rs = applyTo(
                rs,
                r.id,
                field,
                person,
                "HR Admin",
                why.trim(),
                user.name,
              )),
          );
          setRows(rs);
          log({
            field: FIELDS[field],
            to: nameOf(person),
            action: "Bulk applied",
            why: `${no} – ${why}`,
          });
          say(`${t.length} employee(s) changed to ${nameOf(person)} (${no}).`);
        } else {
          let qs = reqs;
          t.forEach((r) => (qs = raise(qs, r, field, person, why.trim(), no)));
          setReqs(qs);
          say(`${t.length} request(s) sent to HR for approval (${no}).`);
        }
        setSel({});
        setBulk({ ...bulk, person: "", reason: "" });
      },
    });
  };
 
  const persistDelegationChange = async (q) => {
    const field = q.field === "comp" ? "comp_manager" : "appraiser_tech_ed";
    const response = await catalystFetch(EMPLOYEE_API_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ emp_id: String(q.empId || q.rowId), [field]: String(q.newId || "") }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.message || "Delegation update failed.");
  };
  const decide = async (q, approve, rm = remarks[q.id] || "") => {
    if (!approve && !rm.trim())
      return say("HR remarks are mandatory when rejecting.", true);
    if (approve) {
      try {
        await persistDelegationChange(q);
      } catch (error) {
        return say(error?.message || "Unable to apply delegation change.", true);
      }
      setRows((rs) => applyTo(rs, q.rowId, q.field, q.newId, "HR Admin", q.reason, q.byName + " (approved by " + user.name + ")"));
    }
    setReqs((qs) =>
      qs.map((x) =>
        x.id === q.id
          ? {
              ...x,
              status: approve ? "Approved" : "Rejected",
              decidedBy: user.name,
              decidedOn: now(),
              remarks: rm.trim(),
            }
          : x,
      ),
    );
    log({
      emp: q.empId,
      field: FIELDS[q.field],
      from: nameOf(q.oldId),
      to: nameOf(q.newId),
      action: approve ? "Approved" : "Rejected",
      why: rm,
    });
    say("Request " + q.no + (approve ? " approved and saved." : " rejected."));
  };
  const withdraw = (q) =>
    setModal({
      type: "confirm",
      title: "Withdraw request",
      body: "Withdraw this request? The current value stays as it is.",
      ok: () => {
        setReqs((qs) =>
          qs.map((x) =>
            x.id === q.id ? { ...x, status: "Withdrawn", decidedOn: now() } : x,
          ),
        );
        say(`Request ${q.no} withdrawn.`);
      },
    });
  const approveAll = () =>
    setModal({
      type: "confirm",
      title: "Approve all",
      body: `Approve all ${pending.length} pending request(s)?`,
      ok: async () => {
        try {
          for (const q of pending) await persistDelegationChange(q);
        } catch (error) {
          say(error?.message || "Unable to approve all delegation requests.", true);
          return;
        }
        let rs = rows;
        pending.forEach((q) => (rs = applyTo(rs, q.rowId, q.field, q.newId, "HR Admin", q.reason, q.byName + " (approved by " + user.name + ")")));
        setRows(rs);
        const ids = new Set(pending.map((q) => q.id));
        setReqs((qs) =>
          qs.map((x) =>
            ids.has(x.id)
              ? {
                  ...x,
                  status: "Approved",
                  decidedBy: user.name,
                  decidedOn: now(),
                }
              : x,
          ),
        );
        say(`${ids.size} request(s) approved.`);
      },
    });
  const lock = () =>
    setModal({
      type: "confirm",
      title: "Save & lock delegation",
      body: `Lock the delegation for ${cycleName} (${rows.length} employees)? No changes are possible afterwards.`,
      ok: () => {
        setLocked(true);
        log({
          action: "Locked",
          why: `${rows.length} employees locked for ${cycleName}`,
        });
        say(`Delegation for ${cycleName} locked.`);
      },
    });
 
  const exportCsv = () => {
    const head = [
      "Employee ID",
      "Employee Name",
      "Reporting Manager",
      "Tech Ed",
      "Comp Manager",
      "Appraiser Tech Ed",
      "Prev. Comp Manager",
      "Prev. Appraiser Tech Ed",
      "Status",
    ];
    const body = list.map((r) => [
      r.id,
      r.name,
      r.rm,
      r.te,
      nameOf(r.comp),
      nameOf(r.app),
      nameOf(r.prevComp),
      nameOf(r.prevApp),
      statusOf(r),
    ]);
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            [head, ...body].map((x) => x.map(csvCell).join(",")).join("\n"),
        ],
        { type: "text/csv" },
      ),
    );
    Object.assign(document.createElement("a"), {
      href: url,
      download: `Delegation_${cycleName}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  };
 
  // The demo role switcher had a USERS list that was never defined; only the signed-in user remains.
  const USERS = [user];

  const switchUser = (id) => {
    setUser(USERS.find((u) => u.id === id) || user);
    setSel({});
    setPage(1);
    setReqTab("Pending");
    setFilter({ q: "", te: "", comp: "", status: "" });
  };
 
  const shownReqs = myReqs
    .filter((q) =>
      reqTab === "Pending" ? q.status === "Pending" : q.status !== "Pending",
    )
    .sort((a, b) => b.on.localeCompare(a.on));
  const teScopes = isHR
    ? uniq(scoped.map((r) => r.te)).map((t) => {
        const rs = scoped.filter((r) => r.te === t);
        return {
          id: rs[0].teId,
          label: `All under Tech Ed ${t} (${rs.length})`,
        };
      })
    : scoped.length
      ? [{ id: user.id, label: `All my employees (${scoped.length})` }]
      : [];
  const allSel = slice.length > 0 && slice.every((r) => sel[r.id]);
 
  return (
    <div className="dg">
      <style>{CSS}</style>
 
      {showRoleSwitch && (
        <div className="dg-pv">
          <span>Preview data. Logged in as</span>
          <select value={user.id} onChange={(e) => switchUser(e.target.value)}>
            {USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.role === "Tech Ed" ? " · Tech Ed" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {locked && (
        <div className="dg-mq lock">
          Delegation for {cycleName} is locked. It will be used as
          previous-cycle data for the next cycle.
        </div>
      )}
      {!locked && pending.length > 0 && (
        <div className="dg-mq">
          ⚠{" "}
          {isHR
            ? `${pending.length} delegation request(s) from Tech Eds awaiting your approval.`
            : `${pending.length} of your request(s) awaiting HR approval.`}
        </div>
      )}
 
      <div className="dg-body">
        {/* ------------------------------ main */}
        <div className="dg-card dg-main">
          <div className="dg-ch">Delegation Screen</div>
          <div className="dg-stats">
            {[
              ["Total employees", scoped.length, "#1f2a37"],
              ["Carried forward", count(ST.CF), "#1e7a45"],
              ["New – defaulted to Tech Ed", count(ST.NEW), "#1d4ed8"],
              ["Changed this cycle", count(ST.HR) + count(ST.TE), "#94620a"],
              [
                isHR ? "Pending HR approval" : "My pending requests",
                pending.length,
                "#b42318",
              ],
            ].map(([l, v, c]) => (
              <div className="dg-st" key={l}>
                <div className="l">{l}</div>
                <div className="v" style={{ color: c }}>
                  {v}
                </div>
              </div>
            ))}
          </div>
 
          <div className="dg-tb">
            <input
              className="srch"
              placeholder="Search employee by name or employee ID"
              value={filter.q}
              onChange={(e) => {
                setFilter({ ...filter, q: e.target.value });
                setPage(1);
              }}
            />
            <select
              className="f"
              value={filter.te}
              onChange={(e) => {
                setFilter({ ...filter, te: e.target.value });
                setPage(1);
              }}
            >
              <option value="">Tech Ed: All</option>
              {uniq(scoped.map((r) => r.te)).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              className="f"
              value={filter.comp}
              onChange={(e) => {
                setFilter({ ...filter, comp: e.target.value });
                setPage(1);
              }}
            >
              <option value="">Comp Manager: All</option>
              {uniq(scoped.map((r) => nameOf(r.comp))).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              className="f"
              value={filter.status}
              onChange={(e) => {
                setFilter({ ...filter, status: e.target.value });
                setPage(1);
              }}
            >
              <option value="">Status: All</option>
              {Object.values(ST).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <span style={{ flex: 1 }} />
            {isHR && (
              <button
                className="btn"
                disabled={editLocked}
                onClick={() =>
                  onRefresh
                    ? onRefresh()
                    : say("Connect onRefresh to your Employee Master API.")
                }
              >
                Refresh from master
              </button>
            )}
            {isHR && (
              <button
                className="btn"
                disabled={editLocked}
                onClick={() =>
                  onUpload
                    ? onUpload()
                    : say("Connect onUpload to your upload flow.")
                }
              >
                ⇧ Upload previous cycle
              </button>
            )}
            <button
              className="btn"
              onClick={() =>
                document
                  .getElementById("dg-bulk")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Bulk assign ({selIds.length})
            </button>
            <button className="btn" onClick={exportCsv}>
              Export
            </button>
            {isHR && canAudit && (
              <button
                className="btn"
                onClick={() => setModal({ type: "audit" })}
              >
                Audit trail
              </button>
            )}
            {isHR && (
              <button
                className="btn p"
                disabled={editLocked || pending.length > 0 || !rows.length}
                title={
                  pending.length
                    ? "Approve or reject pending requests first"
                    : ""
                }
                onClick={lock}
              >
                Save &amp; lock delegation
              </button>
            )}
          </div>
 
          <div className="dg-tw">
            {!scoped.length ? (
              <div className="empty">
                No employees are mapped to you as Tech Ed in {cycleName}.
              </div>
            ) : (
              <table>
                <thead>
                  <tr className="grp">
                    <th className="g g1" colSpan={5}>
                      <span>FROM EMPLOYEE MASTER · READ-ONLY</span>
                    </th>
                    <th className="g g2" colSpan={2}>
                      <span>THIS CYCLE · EDITABLE</span>
                    </th>
                    <th className="g g3" colSpan={2}>
                      <span>PREVIOUS CYCLE · REFERENCE</span>
                    </th>
                    <th />
                  </tr>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allSel}
                        disabled={editLocked}
                        onChange={(e) => {
                          const n = { ...sel };
                          slice.forEach((r) => (n[r.id] = e.target.checked));
                          setSel(n);
                        }}
                      />
                    </th>
                    {[
                      "EMPLOYEE ID",
                      "EMPLOYEE NAME",
                      "REPORTING MANAGER",
                      "TECH ED",
                      "COMP MANAGER",
                      "APPRAISER TECH ED",
                      "PREV. COMP MANAGER",
                      "PREV. APPRAISER TECH ED",
                      "STATUS",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slice.map((r) => {
                    const st = statusOf(r);
                    return (
                      <tr key={r.id} className={sel[r.id] ? "sel" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!sel[r.id]}
                            disabled={editLocked}
                            onChange={(e) =>
                              setSel({ ...sel, [r.id]: e.target.checked })
                            }
                          />
                        </td>
                        <td className="ref">{r.id}</td>
                        <td className="nm">{r.name}</td>
                        <td>{r.rm}</td>
                        <td>{r.te}</td>
                        {["comp", "app"].map((f) => {
                          const prev = f === "comp" ? r.prevComp : r.prevApp;
                          return (
                            <td key={f}>
                              <select
                                className={
                                  "in" + (prev && r[f] !== prev ? " c" : "")
                                }
                                disabled={editLocked}
                                value={r[f]}
                                onChange={(e) => {
                                  setReason("");
                                  setModal({
                                    type: "reason",
                                    row: r,
                                    field: f,
                                    person: people.find(
                                      (p) => p.id === e.target.value,
                                    ),
                                  });
                                }}
                              >
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                        <td className="ref">{nameOf(r.prevComp) || "—"}</td>
                        <td className="ref">{nameOf(r.prevApp) || "—"}</td>
                        <td>
                          <span className={`tag ${TAG[st]}`}>{st}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {scoped.length > 0 && !slice.length && (
              <div className="empty">No employees match the filters.</div>
            )}
          </div>
 
          <div className="dg-foot">
            <span>
              <b style={{ color: "#e0914f" }}>■</b> Orange = differs from
              previous cycle
            </span>
            <span>New employee → Comp Manager defaults to Tech Ed</span>
            <span>Appraiser Tech Ed defaults to Tech Ed</span>
            <span style={{ flex: 1 }} />
            <span className="pg">
              <button
                className="btn sm"
                disabled={cur <= 1}
                onClick={() => setPage(cur - 1)}
              >
                ‹ Previous
              </button>
              <span>
                {list.length
                  ? `${(cur - 1) * PAGE + 1}–${Math.min(cur * PAGE, list.length)}`
                  : 0}{" "}
                of {list.length}
              </span>
              <button
                className="btn sm"
                disabled={cur >= pages}
                onClick={() => setPage(cur + 1)}
              >
                Next ›
              </button>
            </span>
          </div>
          <div className="dg-help">
            <b>How it works:</b>{" "}
            {isHR
              ? "Tech Ed and Reporting Manager come from the Employee Master. Comp Manager defaults to last cycle's; for new employees it defaults to the Tech Ed. Your changes apply immediately. Changes by a Tech Ed arrive as requests on the right and apply only when you approve. Save & lock is allowed only when no requests are pending."
              : 'You see employees whose Tech Ed is you. Any change you make is sent to HR for approval; the current value stays until HR approves. You can withdraw a pending request from "My requests".'}
          </div>
        </div>
 
        {/* ------------------------------ side */}
        <div className={"dg-side" + (bulkOpen && reqOpen ? " both" : "")}>
          {/* ADDED: Bulk assign folds left to right; folded on load */}
          <div className={"dg-col" + (bulkOpen ? " open" : "")} id="dg-bulk">
          {bulkOpen ? (
            <div className="dg-card">
              <div className="sh">
                <span className="ic">⇄</span>
                <div>
                  <div className="tt">Bulk assign</div>
                  <div className="ss">
                    {selIds.length} employee{selIds.length === 1 ? "" : "s"}{" "}
                    selected
                  </div>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginLeft: "auto" }}
                  onClick={() => setBulkOpen(false)}
                  title="Fold bulk assign"
                >
                  ‹ Fold
                </button>
              </div>
              <div className="sb">
                <div className="lb">Field to change</div>
                <select
                  className="fld"
                  disabled={editLocked}
                  value={bulk.field}
                  onChange={(e) => setBulk({ ...bulk, field: e.target.value })}
                >
                  <option value="comp">Comp Manager</option>
                  <option value="app">Appraiser Tech Ed</option>
                </select>
                <div className="lb">Apply to</div>
                <select
                  className="fld"
                  disabled={editLocked}
                  value={bulk.scope}
                  onChange={(e) => setBulk({ ...bulk, scope: e.target.value })}
                >
                  <option value="sel">
                    Selected employees ({selIds.length})
                  </option>
                  {teScopes.map((s) => (
                    <option key={s.id} value={`te:${s.id}`}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <div className="lb">Assign to</div>
                <select
                  className="fld"
                  disabled={editLocked}
                  value={bulk.person}
                  onChange={(e) => setBulk({ ...bulk, person: e.target.value })}
                >
                  <option value="">— choose —</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.roles.join(", ")}
                    </option>
                  ))}
                </select>
                <div className="lb">Reason (mandatory)</div>
                <input
                  className="fld"
                  disabled={editLocked}
                  maxLength={2000}
                  value={bulk.reason}
                  onChange={(e) => setBulk({ ...bulk, reason: e.target.value })}
                />
                <button className="btn p sm" disabled={editLocked} onClick={doBulk}>
                  Apply
                </button>{" "}
                <button
                  className="btn sm"
                  disabled={editLocked}
                  onClick={() => {
                    setSel({});
                    setBulk({ ...bulk, person: "", reason: "" });
                  }}
                >
                  Clear
                </button>
                <div className="note">
                  {isHR
                    ? "HR Admin: applied immediately."
                    : "Tech Ed: one request per employee is sent to HR for approval."}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="dg-fold"
              onClick={() => setBulkOpen(true)}
              title="Open bulk assign"
              aria-expanded="false"
            >
              <span className="dg-vbtn">Bulk assign ({selIds.length}) ›</span>
            </button>
          )}
          </div>
 
          {/* ADDED: Pending approvals folds left to right; folded on load */}
          <div className={"dg-col" + (reqOpen ? " open" : "")}>
          {reqOpen ? (
          <div className="dg-card">
            <div className="sh">
              <span className="ic o">✓</span>
              <div>
                <div className="tt">
                  {isHR ? "Pending approvals" : "My requests"}
                </div>
                <div className="ss">
                  {isHR
                    ? "Requests raised by Tech Eds"
                    : "Changes you sent to HR"}
                </div>
              </div>
              <button
                type="button"
                className="btn sm"
                style={{ marginLeft: "auto" }}
                onClick={() => setReqOpen(false)}
                title="Fold pending approvals"
              >
                ‹ Fold
              </button>
            </div>
            <div className="sb">
              <div className="rtabs">
                {["Pending", "Decided"].map((t) => (
                  <button
                    key={t}
                    className={"btn sm" + (reqTab === t ? " p" : "")}
                    onClick={() => setReqTab(t)}
                  >
                    {t}
                  </button>
                ))}
                {isHR &&
                  canApprove &&
                  reqTab === "Pending" &&
                  pending.length > 1 &&
                  !locked && (
                    <>
                      <span style={{ flex: 1 }} />
                      <button className="btn p sm" onClick={approveAll}>
                        Approve all shown
                      </button>
                    </>
                  )}
              </div>
              <div className="rq-list">
                {!shownReqs.length && (
                  <div className="none">
                    {reqTab === "Pending"
                      ? "No pending requests."
                      : "No decided requests yet."}
                  </div>
                )}
                {shownReqs.map((q) => (
                  <div className="req" key={q.id}>
                    <div className="n">
                      <span>
                        {q.empId} · {q.empName}
                      </span>
                      <span
                        className={
                          "tag " +
                          (q.status === "Approved"
                            ? "cf"
                            : q.status === "Pending" || q.status === "Rejected"
                              ? "pd"
                              : "gr")
                        }
                      >
                        {q.status}
                      </span>
                    </div>
                    <div className="m">
                      {FIELDS[q.field]}: {nameOf(q.oldId) || "—"}{" "}
                      <span className="ar">→ {nameOf(q.newId)}</span>
                      <br />
                      {isHR ? (
                        <>
                          Raised by <b>{q.byName}</b> (Tech Ed)
                        </>
                      ) : (
                        "Raised"
                      )}{" "}
                      · {fmt(q.on)} · {q.no}
                      <br />
                      Reason: {q.reason}
                      {q.status !== "Pending" && q.decidedBy && (
                        <>
                          <br />
                          {q.status} by {q.decidedBy} · {fmt(q.decidedOn)}
                        </>
                      )}
                      {q.remarks && (
                        <>
                          <br />
                          HR remarks: {q.remarks}
                        </>
                      )}
                    </div>
                    {q.status === "Pending" &&
                      !locked &&
                      (!isHR || canApprove) &&
                      (isHR ? (
                        <>
                          <input
                            className="fld"
                            placeholder="HR remarks (mandatory if rejecting)"
                            maxLength={2000}
                            value={remarks[q.id] || ""}
                            onChange={(e) =>
                              setRemarks({ ...remarks, [q.id]: e.target.value })
                            }
                          />
                          <button
                            className="btn p sm"
                            onClick={() => decide(q, true)}
                          >
                            Approve
                          </button>{" "}
                          <button
                            className="btn sm r"
                            onClick={() => decide(q, false)}
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn sm r"
                          onClick={() => withdraw(q)}
                        >
                          Withdraw
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          ) : (
            <button
              type="button"
              className="dg-fold"
              onClick={() => setReqOpen(true)}
              title="Open pending approvals"
              aria-expanded="false"
            >
              <span className="dg-vbtn">
                {isHR ? "Pending approvals" : "My requests"} ({pending.length}) ›
              </span>
            </button>
          )}
          </div>
        </div>
      </div>
 
      {/* ------------------------------ modals */}
      {modal?.type === "reason" && (
        <Modal
          title={isHR ? "Confirm change" : "Send change to HR for approval"}
          onClose={() => setModal(null)}
          foot={
            <>
              <button className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn p" onClick={saveChange}>
                {isHR ? "Save" : "Send to HR"}
              </button>
            </>
          }
        >
          <div className="chg">
            <b>
              {modal.row.id} · {modal.row.name}
            </b>
            <br />
            {FIELDS[modal.field]}: {nameOf(modal.row[modal.field]) || "—"}{" "}
            <span className="ar">→ {modal.person.name}</span>
          </div>
          <div className="lb">Reason (mandatory)</div>
          <textarea
            className="fld"
            autoFocus
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="note">
            {isHR
              ? "Applies immediately and is recorded in the audit trail."
              : "The current value stays until HR approves."}
          </div>
        </Modal>
      )}
      {modal?.type === "confirm" && (
        <Modal
          title={modal.title}
          onClose={() => setModal(null)}
          foot={
            <>
              <button className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn p"
                onClick={() => {
                  const ok = modal.ok;
                  setModal(null);
                  ok();
                }}
              >
                Confirm
              </button>
            </>
          }
        >
          {modal.body}
        </Modal>
      )}
      {modal?.type === "audit" && (
        <Modal
          title="Audit trail"
          wide
          onClose={() => setModal(null)}
          foot={
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          }
        >
          {!audit.length ? (
            <div className="none">No entries yet.</div>
          ) : (
            <table className="aud">
              <thead>
                <tr>
                  {[
                    "DATE & TIME",
                    "EMPLOYEE",
                    "FIELD",
                    "CHANGE",
                    "ACTION",
                    "BY",
                    "REMARKS",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((a, i) => (
                  <tr key={i}>
                    <td>{a.on}</td>
                    <td>{a.emp}</td>
                    <td>{a.field}</td>
                    <td>
                      {a.from || a.to
                        ? `${a.from || "—"} → ${a.to || "—"}`
                        : ""}
                    </td>
                    <td>{a.action}</td>
                    <td>
                      {a.by}
                      <br />
                      <span className="note">{a.role}</span>
                    </td>
                    <td>{a.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
      {toast && (
        <div className={"dg-toast " + (toast.err ? "err" : "ok")}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
 
function Modal({ title, children, foot, onClose, wide }) {
  return (
    <div
      className="dg-ov"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={"mdl" + (wide ? " wide" : "")}>
        <div className="mh">{title}</div>
        <div className="mb">{children}</div>
        <div className="mf">{foot}</div>
      </div>
    </div>
  );
}
 
/* ---------------------------------------------------------------- styles */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
.dg,.dg *{box-sizing:border-box}
.dg{font-family:Manrope,Arial,sans-serif;background:#f3f5f8;color:#1f2a37;font-size:13px;min-height:100%}
.dg button,.dg input,.dg select,.dg textarea{font-family:inherit;font-size:inherit}
.dg-pv{background:#e8f5f1;border-bottom:1px solid #b9dcc4;color:#146b5a;padding:7px 12px;font-size:12px;font-weight:600;display:flex;gap:10px;align-items:center}
.dg-pv select{border:1px solid #b9dcc4;border-radius:4px;padding:3px 6px;font-weight:600}
.dg-mq{background:#fff7e8;border-bottom:1px solid #f1d9a8;color:#8a5a06;padding:7px 12px;font-size:12px;font-weight:600}
.dg-mq.lock{background:#eef1f5;border-color:#d6dce4;color:#374151}
.dg-body{display:flex;gap:14px;padding:14px 12px;align-items:flex-start}
.dg-card{background:#fff;border:1px solid #dfe4ea;border-radius:10px;overflow:hidden}
.dg-main{flex:1;min-width:0}
.dg-ch{background:#15365a;color:#fff;text-align:center;font-weight:800;font-size:15.5px;padding:10px}
.dg-stats{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid #e6eaef}
.dg-st{padding:10px 14px;border-right:1px solid #e6eaef}.dg-st:last-child{border-right:none}
.dg-st .l{font-size:11.5px;color:#6b7685}.dg-st .v{font-size:17px;font-weight:800}
.dg-tb{display:flex;gap:8px;padding:10px 12px;align-items:center;border-bottom:1px solid #e6eaef;flex-wrap:wrap}
.dg .srch{border:1px solid #cfd8e1;border-radius:6px;padding:7px 11px;width:230px}
.dg .f{border:1px solid #cfd8e1;border-radius:6px;padding:6px 8px;color:#374151;background:#fff;max-width:190px}
.dg .btn{border:1px solid #cfd8e1;border-radius:6px;padding:7px 13px;font-weight:700;color:#15365a;background:#fff;cursor:pointer}
.dg .btn:hover{background:#f1f4f8}
.dg .btn.p{background:#1a8a74;border-color:#1a8a74;color:#fff}.dg .btn.p:hover{background:#157563}
.dg .btn.r{color:#b42318}
.dg .btn:disabled{opacity:.5;cursor:not-allowed}
.dg .btn.sm{padding:5px 12px;font-size:12px}
.dg-tw{overflow:auto;max-height:calc(100vh - 330px);min-height:220px}
.dg table{border-collapse:collapse;width:100%}
.dg th{font-size:11px;letter-spacing:.3px;color:#5b6675;text-align:left;padding:9px 8px;background:#f6f8fa;border-bottom:1px solid #e1e6ec;font-weight:700;white-space:nowrap;position:sticky;top:31px;z-index:1}
.dg tr.grp th{top:0;background:#fff;text-align:center;font-size:10.5px;padding:6px;border-bottom:none;z-index:2}
.dg th.g span{display:block;border-radius:4px;padding:3px}
.dg .g1 span{background:#eef1f5;color:#4b5563}.dg .g2 span{background:#e3f3ee;color:#146b5a}.dg .g3 span{background:#f3f4f6;color:#6b7280}
.dg td{padding:6px 8px;border-bottom:1px solid #eef1f4;font-size:12.5px;white-space:nowrap}
.dg td.ref{color:#6b7685}.dg td.nm{font-weight:700}
.dg tr.sel td{background:#f7fbfa}
.dg .in{border:1px solid #b9dcc4;background:#eff8f1;border-radius:5px;padding:4px 6px;width:150px;color:#1f2a37}
.dg .in.c{border-color:#e0914f;background:#fff4ea}
.dg .in:disabled{background:#f3f5f8;border-color:#dfe4ea;color:#4b5563}
.dg .tag{font-size:10.5px;padding:2px 8px;border-radius:9px;font-weight:700;white-space:nowrap}
.dg .tag.cf{background:#e8f5ee;color:#1e7a45}.dg .tag.nw{background:#e6efff;color:#1d4ed8}.dg .tag.hr{background:#fff1d6;color:#94620a}
.dg .tag.te{background:#efe8fb;color:#6b3fb0}.dg .tag.pd{background:#fde8e6;color:#b42318}.dg .tag.gr{background:#eef1f5;color:#4b5563}
.dg-foot{display:flex;padding:9px 12px;font-size:11.5px;color:#6b7685;gap:18px;align-items:center;flex-wrap:wrap;border-top:1px solid #eef1f4}
.dg .pg{display:flex;gap:6px;align-items:center}
.dg-help{padding:9px 12px 12px;font-size:11.5px;color:#6b7685;line-height:1.6;border-top:1px solid #eef1f4;background:#fbfcfd}
.dg-help b{color:#374151}
.dg .empty{padding:40px;text-align:center;color:#6b7685}
.dg-side{flex:0 0 auto;display:flex;flex-direction:row;gap:14px;align-self:stretch}
.dg-col{flex:0 0 34px;width:34px;min-width:0;display:flex;flex-direction:column}
.dg-col.open{flex:0 0 330px;width:330px;align-self:flex-start}
.dg-side.both{flex-direction:column;flex:0 0 330px;width:330px}
.dg-side.both .dg-col.open{flex:none;width:100%;align-self:stretch}
.dg .sh{padding:11px 13px;border-bottom:1px solid #e6eaef;display:flex;gap:9px;align-items:center}
.dg .ic{background:#1a8a74;color:#fff;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 28px}
.dg .ic.o{background:#e0662f}
.dg .sh .tt{font-weight:800;font-size:14.5px}.dg .sh .ss{font-size:11.5px;color:#6b7685}
.dg .sb{padding:11px 13px}
.dg .lb{font-size:11px;color:#6b7685;margin:0 0 3px}
.dg .fld{border:1px solid #cfd8e1;border-radius:6px;padding:6px 9px;margin-bottom:9px;width:100%;background:#fff}
.dg textarea.fld{resize:vertical;min-height:54px}
.dg .note{font-size:11px;color:#8591a0;margin-top:7px;line-height:1.5}
.dg .rtabs{display:flex;gap:6px;margin-bottom:10px}
.dg .rq-list{max-height:calc(100vh - 560px);min-height:140px;overflow:auto}
.dg .req{border:1px solid #e6eaef;border-radius:8px;padding:10px;margin-bottom:9px}
.dg .req .n{font-weight:800;color:#15365a;display:flex;justify-content:space-between;gap:6px}
.dg .req .m{color:#4b5563;font-size:11.8px;margin:4px 0 8px;line-height:1.5}
.dg .ar{color:#1a8a74;font-weight:700}
.dg .req .fld{font-size:11.5px;margin-bottom:7px}
.dg .none{color:#8591a0;font-size:12px;padding:10px 0}
.dg-toast{position:fixed;right:16px;bottom:16px;max-width:460px;padding:11px 14px;border-radius:8px;font-weight:600;font-size:12.5px;box-shadow:0 6px 20px rgba(15,42,68,.18);z-index:60}
.dg-toast.ok{background:#e8f5ee;color:#1e5c3a;border:1px solid #b9dcc4}
.dg-toast.err{background:#fde8e6;color:#8f1d14;border:1px solid #f3b8b1}
.dg-ov{position:fixed;inset:0;background:rgba(15,42,68,.45);display:flex;align-items:center;justify-content:center;z-index:50}
.dg .mdl{background:#fff;border-radius:10px;width:480px;max-width:94vw;max-height:88vh;overflow:auto}
.dg .mdl.wide{width:880px}
.dg .mdl .mh{background:#15365a;color:#fff;font-weight:800;padding:11px 14px;font-size:14.5px}
.dg .mdl .mb{padding:14px}
.dg .mdl .mf{padding:10px 14px;border-top:1px solid #e6eaef;display:flex;gap:8px;justify-content:flex-end}
.dg .chg{background:#f6f8fa;border-radius:6px;padding:9px;margin-bottom:10px;line-height:1.6}
.dg .aud td{white-space:normal;font-size:11.5px;vertical-align:top}
.dg .aud th{position:static}
.dg .dg-fold{flex:1;min-height:160px;display:flex;justify-content:center;padding-top:14px;background:#fff;border:1px solid #dfe4ea;border-radius:10px;cursor:pointer;color:#15365a;font-weight:800}
.dg .dg-fold:hover{background:#f1f4f8}
.dg .dg-vbtn{writing-mode:vertical-rl;transform:rotate(180deg);font-size:12.5px;letter-spacing:.02em}
@media(max-width:1100px){.dg-body{flex-direction:column}.dg-side{width:100%;flex:none;flex-direction:column}.dg-side.both{width:100%;flex:none}.dg-stats{grid-template-columns:repeat(2,1fr)}.dg-col,.dg-col.open{width:100%;flex:none}.dg .dg-fold{min-height:0;padding:10px;align-items:center}.dg .dg-vbtn{writing-mode:horizontal-tb;transform:none}}
`;