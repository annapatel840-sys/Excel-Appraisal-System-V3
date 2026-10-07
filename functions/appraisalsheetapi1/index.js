"use strict";

/* =====================================================================
   appraisalsheetapi — Appraisal Sheet read + save (Catalyst Advanced I/O)

   GET    /                  rows the signed-in user may see (own scope,
                             hidden columns removed)
   PATCH  /                  { changes: [{ emp_id, field, value }], source }
                             validates ALL changes first, then saves, then
                             writes Appraisal_Audit lines.

   ./accessCore.js must stay a byte-for-byte copy of
   functions/accessapi/accessCore.js (see docs/ACCESS_SPEC.md).
   Columns are the real Appraisal_Sheet columns (snake_case).
   ===================================================================== */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const SHEET_TABLE = "Appraisal_Sheet";
const AUDIT_TABLE = "Appraisal_Audit";
const CYCLE_TABLE = "Appraisal_Cycle_Master";
const SCREEN_KEY = "appraisalSheet";

// true  = edits are refused unless a cycle with status 'Active' exists
// false = no cycle check (use while testing)
const CHECK_CYCLE_LOCK = true;

const BATCH = 100;      // Data Store accepts at most 200 rows per call
const MAX_CHANGES = 500;

/* Columns a user can EVER change here. Everything else is master/upload data. */
const EDITABLE = {
  hike_amount:            { type: "int",    label: "Hike Amount" },
  hike_pct:               { type: "pct",    label: "Hike %" },
  new_rb:                 { type: "int",    label: "Retention Bonus (RB)",    floor: "rb_to_be_paid" },
  new_pb_to_be_offered:   { type: "int",    label: "Performance Bonus (PB)",  floor: "pb_to_be_paid" },
  new_pb_installment:     { type: "select", label: "PB Instalment", options: ["1", "2", "3", "4"] },
  target_pb_next_year:    { type: "int",    label: "Target PB for Next Year" },
  eligible_for_promotion: { type: "select", label: "Eligible for Promotion", options: ["Yes", "No"] },
  new_title:              { type: "text",   label: "New Title" },
};

/* ============================================================
   Helpers
   ============================================================ */

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getQuery(req) {
  if (req.queryParams) return req.queryParams;
  const url = String(req.url || "");
  const i = url.indexOf("?");
  return i === -1 ? {} : Object.fromEntries(new URLSearchParams(url.slice(i + 1)));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new access.HttpError(400, "Invalid JSON request body.")); }
    });
    req.on("error", reject);
  });
}

const toInt = (v) => Math.round(Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")) || 0);
const toNum = (v) => Number(v) || 0;
const round2 = (n) => Math.round(n * 100) / 100;

async function inBatches(list, fn) {
  for (let i = 0; i < list.length; i += BATCH) await fn(list.slice(i, i + BATCH));
}

async function checkAccess(req) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });
  try {
    return await access.check(userApp, adminApp);
  } catch (e) {
    if (access.isEnforced()) throw e;
    console.log("ACCESS dry-run: access check failed:", e && e.message);
    return { dryRun: true, enforced: false, denied: e };
  }
}

// Open only while a cycle with status 'Active' exists.
async function cycleLockReason(zcql) {
  if (!CHECK_CYCLE_LOCK) return "";
  const rows = await access.selectAll(zcql, CYCLE_TABLE, "status = 'Active'");
  return rows.length ? "" : "No appraisal cycle is Active, so the sheet is read-only.";
}

/* ============================================================
   GET /  — rows
   ============================================================ */

async function getRows(req, res, a) {
  const app = catalyst.initialize(req);
  const zcql = app.zcql();

  access.guard(a, () => access.requireScreen(a, SCREEN_KEY, "view"));

  const all = await access.selectAll(zcql, SHEET_TABLE, "");
  // Enforced: own scope + hidden columns removed. Dry run: unchanged.
  const rows = access.scopeRows(a, all);
  const lockReason = await cycleLockReason(zcql);

  sendJson(res, 200, { success: true, count: rows.length, locked: !!lockReason, lockReason, data: rows });
}

/* ============================================================
   PATCH /  — save edits
   ============================================================ */

// Turns one requested change into one or more { row, column, value } (stored form).
function cleanChange(ch, rowsById, notes) {
  const empId = String(ch.emp_id || ch.empId || "").trim();
  const row = rowsById.get(access.norm(empId));
  if (!row) throw new access.HttpError(404, "Employee " + empId + " was not found.");

  let column = String(ch.field || ch.column || "").trim();
  let value = ch.value;
  let def = EDITABLE[column];
  if (!def) throw new access.HttpError(400, (column || "(blank)") + " cannot be edited here.");

  const out = [];

  if (def.type === "int") {
    value = toInt(value);
    if (value < 0) throw new access.HttpError(422, def.label + " cannot be negative.");
  } else if (def.type === "pct") {
    // Hike % typed -> store Hike Amount, then hike_pct is recalculated below.
    const pct = toNum(value);
    if (pct < 0) throw new access.HttpError(422, def.label + " cannot be negative.");
    column = "hike_amount";
    def = EDITABLE.hike_amount;
    value = Math.round((toNum(row.current_annual_base_pay) * pct) / 100);
  } else if (def.type === "select") {
    value = String(value == null ? "" : value);
    if (def.options.indexOf(value) < 0) throw new access.HttpError(422, def.label + " must be one of " + def.options.join(", ") + ".");
  } else {
    value = String(value == null ? "" : value).trim().slice(0, 200);
  }

  // PB / RB can never be lower than the amount already due.
  if (def.floor && value < toInt(row[def.floor])) {
    notes.push(row.name + ": " + def.label + " is below the amount to be paid; " + toInt(row[def.floor]) + " will be saved.");
    value = toInt(row[def.floor]);
  }

  out.push({ row, column, value });

  // Hike % is always kept in step with Hike Amount.
  if (column === "hike_amount") {
    const base = toNum(row.current_annual_base_pay);
    out.push({ row, column: "hike_pct", value: base ? round2((value / base) * 100) : 0 });
  }

  // Promotion pair: a different title means Yes; blank / same title / "No" clears the title.
  if (column === "new_title") {
    if (!value || value === row.designation) {
      out[0].value = "";
      out.push({ row, column: "eligible_for_promotion", value: "No" });
    } else {
      out.push({ row, column: "eligible_for_promotion", value: "Yes" });
    }
  }
  if (column === "eligible_for_promotion" && value === "No") {
    out.push({ row, column: "new_title", value: "" });
  }
  return out;
}

async function patchCells(req, res, a) {
  const body = await readBody(req);
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (!changes.length || changes.length > MAX_CHANGES) throw new access.HttpError(400, "Send between 1 and " + MAX_CHANGES + " changes.");

  const app = catalyst.initialize(req);
  const zcql = app.zcql();

  // 1. screen + column + scope checks (before anything is read or saved)
  access.guard(a, () => access.requireScreen(a, SCREEN_KEY, "edit"));
  const wantedColumns = Array.from(new Set(changes.map((c) => String(c.field || c.column || ""))));
  wantedColumns.forEach((c) => { if (!EDITABLE[c]) throw new access.HttpError(400, (c || "(blank)") + " cannot be edited here."); });
  access.guard(a, () => access.requireEditColumns(a, wantedColumns.map((c) => (c === "hike_pct" ? "hike_amount" : c))));

  const empIds = Array.from(new Set(changes.map((c) => String(c.emp_id || c.empId || "").trim())));
  access.guard(a, () => {
    const outside = empIds.filter((id) => !access.inScope(a, id));
    if (outside.length) throw new access.HttpError(403, "You do not have access to employee(s): " + outside.join(", ") + ".");
  });

  // 2. cycle lock
  const lock = await cycleLockReason(zcql);
  if (lock) throw new access.HttpError(409, lock);

  // 3. load the rows being changed
  const all = await access.selectAll(zcql, SHEET_TABLE, "");
  const rowsById = new Map(all.map((r) => [access.norm(r.emp_id), r]));

  // 4. validate EVERYTHING first — nothing is saved if one change fails
  const notes = [];
  const cleaned = [].concat(...changes.map((c) => cleanChange(c, rowsById, notes)));

  // 5. build updates + audit lines (only real changes)
  const byRow = new Map(), audit = [];
  const at = access.nowDT();
  const actor = (a && a.user && (a.user.email || a.user.name)) || "system";
  const batchId = "B" + Date.now();
  const source = /^(grid|detail|import)$/.test(String(body.source)) ? body.source : "grid";

  cleaned.forEach((c) => {
    const old = c.row[c.column];
    if (String(old == null ? "" : old) === String(c.value)) return;
    if (!byRow.has(c.row.ROWID)) byRow.set(c.row.ROWID, { ROWID: c.row.ROWID });
    byRow.get(c.row.ROWID)[c.column] = c.value;
    audit.push({
      emp_id: c.row.emp_id, employee_name: c.row.name, field_name: c.column,
      old_value: String(old == null ? "" : old), new_value: String(c.value),
      changed_by: actor, changed_at: at, source, batch_id: batchId,
    });
    c.row[c.column] = c.value;      // later changes in this same request see the new value
  });

  // 6. write
  await inBatches(Array.from(byRow.values()), (b) => app.datastore().table(SHEET_TABLE).updateRows(b));
  await inBatches(audit, (b) => app.datastore().table(AUDIT_TABLE).insertRows(b));

  // 7. return the changed rows so the grid can refresh without another call
  const touched = Array.from(new Set(cleaned.map((c) => c.row)));
  const shaped = a && a.enforced ? touched.map((r) => access.shapeRowByColumns(a, r)) : touched;
  sendJson(res, 200, { success: true, saved: audit.length, notes, batch_id: batchId, data: shaped });
}

/* ============================================================
   MAIN
   ============================================================ */

module.exports = async function (req, res) {
  const method = String(req.method || "GET").toUpperCase();
  try {
    if (method === "OPTIONS") return sendJson(res, 200, { success: true });
    const a = await checkAccess(req);
    if (method === "GET") return await getRows(req, res, a);
    if (method === "PATCH" || method === "POST") return await patchCells(req, res, a);
    sendJson(res, 405, { success: false, message: "Method " + method + " not allowed." });
  } catch (e) {
    if (e instanceof access.HttpError) return sendJson(res, e.status || 403, { success: false, message: e.message });
    console.error("APPRAISAL SHEET API ERROR:", e);
    sendJson(res, 500, { success: false, message: "Server error. Please try again." });
  }
};