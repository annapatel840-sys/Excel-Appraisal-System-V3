// "use strict";

// /* =====================================================================
//    appraisalsheetapi — Appraisal Sheet read + save (Catalyst Advanced I/O)

//    GET    /                  rows the signed-in user may see (own scope,
//                              hidden columns removed)
//    PATCH  /                  { changes: [{ emp_id, field, value }], source }
//                              validates ALL changes first, then saves, then
//                              writes Appraisal_Audit lines.

//    ./accessCore.js must stay a byte-for-byte copy of
//    functions/accessapi/accessCore.js (see docs/ACCESS_SPEC.md).
//    Columns are the real Appraisal_Sheet columns (snake_case).
//    ===================================================================== */

// const catalyst = require("zcatalyst-sdk-node");
// const access = require("./accessCore");

// const SHEET_TABLE = "Appraisal_Sheet";
// const AUDIT_TABLE = "Appraisal_Audit";
// const CYCLE_TABLE = "Appraisal_Cycle_Master";
// const SCREEN_KEY = "appraisalSheet";

// // true  = edits are refused unless a cycle with status 'Active' exists
// // false = no cycle check (use while testing)
// const CHECK_CYCLE_LOCK = true;

// const BATCH = 100;      // Data Store accepts at most 200 rows per call
// const MAX_CHANGES = 500;

// /* Columns a user can EVER change here. Everything else is master/upload data. */
// const EDITABLE = {
//   hike_amount:            { type: "int",    label: "Hike Amount" },
//   hike_pct:               { type: "pct",    label: "Hike %" },
//   new_rb:                 { type: "int",    label: "Retention Bonus (RB)",    floor: "rb_to_be_paid" },
//   new_pb_to_be_offered:   { type: "int",    label: "Performance Bonus (PB)",  floor: "pb_to_be_paid" },
//   new_pb_installment:     { type: "select", label: "PB Instalment", options: ["1", "2", "3", "4"] },
//   target_pb_next_year:    { type: "int",    label: "Target PB for Next Year" },
//   eligible_for_promotion: { type: "select", label: "Eligible for Promotion", options: ["Yes", "No"] },
//   new_title:              { type: "text",   label: "New Title" },
// };

// /* ============================================================
//    Helpers
//    ============================================================ */

// function sendJson(res, status, body) {
//   res.statusCode = status;
//   res.setHeader("Content-Type", "application/json");
//   res.end(JSON.stringify(body));
// }

// function getQuery(req) {
//   if (req.queryParams) return req.queryParams;
//   const url = String(req.url || "");
//   const i = url.indexOf("?");
//   return i === -1 ? {} : Object.fromEntries(new URLSearchParams(url.slice(i + 1)));
// }

// async function readBody(req) {
//   if (req.body && typeof req.body === "object") return req.body;
//   return new Promise((resolve, reject) => {
//     let s = "";
//     req.on("data", (c) => (s += c));
//     req.on("end", () => {
//       try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new access.HttpError(400, "Invalid JSON request body.")); }
//     });
//     req.on("error", reject);
//   });
// }

// const toInt = (v) => Math.round(Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")) || 0);
// const toNum = (v) => Number(v) || 0;
// const round2 = (n) => Math.round(n * 100) / 100;

// async function inBatches(list, fn) {
//   for (let i = 0; i < list.length; i += BATCH) await fn(list.slice(i, i + BATCH));
// }

// async function checkAccess(req) {
//   const userApp = catalyst.initialize(req);
//   const adminApp = catalyst.initialize(req, { scope: "admin" });
//   try {
//     return await access.check(userApp, adminApp);
//   } catch (e) {
//     if (access.isEnforced()) throw e;
//     console.log("ACCESS dry-run: access check failed:", e && e.message);
//     return { dryRun: true, enforced: false, denied: e };
//   }
// }

// // Open only while a cycle with status 'Active' exists.
// async function cycleLockReason(zcql) {
//   if (!CHECK_CYCLE_LOCK) return "";
//   const rows = await access.selectAll(zcql, CYCLE_TABLE, "status = 'Active'");
//   return rows.length ? "" : "No appraisal cycle is Active, so the sheet is read-only.";
// }

// /* ============================================================
//    GET /  — rows
//    ============================================================ */

// async function getRows(req, res, a) {
//   const app = catalyst.initialize(req);
//   const zcql = app.zcql();

//   access.guard(a, () => access.requireScreen(a, SCREEN_KEY, "view"));

//   const all = await access.selectAll(zcql, SHEET_TABLE, "");
//   // Enforced: own scope + hidden columns removed. Dry run: unchanged.
//   const rows = access.scopeRows(a, all);
//   const lockReason = await cycleLockReason(zcql);

//   sendJson(res, 200, { success: true, count: rows.length, locked: !!lockReason, lockReason, data: rows });
// }

// /* ============================================================
//    PATCH /  — save edits
//    ============================================================ */

// // Turns one requested change into one or more { row, column, value } (stored form).
// function cleanChange(ch, rowsById, notes) {
//   const empId = String(ch.emp_id || ch.empId || "").trim();
//   const row = rowsById.get(access.norm(empId));
//   if (!row) throw new access.HttpError(404, "Employee " + empId + " was not found.");

//   let column = String(ch.field || ch.column || "").trim();
//   let value = ch.value;
//   let def = EDITABLE[column];
//   if (!def) throw new access.HttpError(400, (column || "(blank)") + " cannot be edited here.");

//   const out = [];

//   if (def.type === "int") {
//     value = toInt(value);
//     if (value < 0) throw new access.HttpError(422, def.label + " cannot be negative.");
//   } else if (def.type === "pct") {
//     // Hike % typed -> store Hike Amount, then hike_pct is recalculated below.
//     const pct = toNum(value);
//     if (pct < 0) throw new access.HttpError(422, def.label + " cannot be negative.");
//     column = "hike_amount";
//     def = EDITABLE.hike_amount;
//     value = Math.round((toNum(row.current_annual_base_pay) * pct) / 100);
//   } else if (def.type === "select") {
//     value = String(value == null ? "" : value);
//     if (def.options.indexOf(value) < 0) throw new access.HttpError(422, def.label + " must be one of " + def.options.join(", ") + ".");
//   } else {
//     value = String(value == null ? "" : value).trim().slice(0, 200);
//   }

//   // PB / RB can never be lower than the amount already due.
//   if (def.floor && value < toInt(row[def.floor])) {
//     notes.push(row.name + ": " + def.label + " is below the amount to be paid; " + toInt(row[def.floor]) + " will be saved.");
//     value = toInt(row[def.floor]);
//   }

//   out.push({ row, column, value });

//   // Hike % is always kept in step with Hike Amount.
//   if (column === "hike_amount") {
//     const base = toNum(row.current_annual_base_pay);
//     out.push({ row, column: "hike_pct", value: base ? round2((value / base) * 100) : 0 });
//   }

//   // Promotion pair: a different title means Yes; blank / same title / "No" clears the title.
//   if (column === "new_title") {
//     if (!value || value === row.designation) {
//       out[0].value = "";
//       out.push({ row, column: "eligible_for_promotion", value: "No" });
//     } else {
//       out.push({ row, column: "eligible_for_promotion", value: "Yes" });
//     }
//   }
//   if (column === "eligible_for_promotion" && value === "No") {
//     out.push({ row, column: "new_title", value: "" });
//   }
//   return out;
// }

// async function patchCells(req, res, a) {
//   const body = await readBody(req);
//   const changes = Array.isArray(body.changes) ? body.changes : [];
//   if (!changes.length || changes.length > MAX_CHANGES) throw new access.HttpError(400, "Send between 1 and " + MAX_CHANGES + " changes.");

//   const app = catalyst.initialize(req);
//   const zcql = app.zcql();

//   // 1. screen + column + scope checks (before anything is read or saved)
//   access.guard(a, () => access.requireScreen(a, SCREEN_KEY, "edit"));
//   const wantedColumns = Array.from(new Set(changes.map((c) => String(c.field || c.column || ""))));
//   wantedColumns.forEach((c) => { if (!EDITABLE[c]) throw new access.HttpError(400, (c || "(blank)") + " cannot be edited here."); });
//   access.guard(a, () => access.requireEditColumns(a, wantedColumns.map((c) => (c === "hike_pct" ? "hike_amount" : c))));

//   const empIds = Array.from(new Set(changes.map((c) => String(c.emp_id || c.empId || "").trim())));
//   access.guard(a, () => {
//     const outside = empIds.filter((id) => !access.inScope(a, id));
//     if (outside.length) throw new access.HttpError(403, "You do not have access to employee(s): " + outside.join(", ") + ".");
//   });

//   // 2. cycle lock
//   const lock = await cycleLockReason(zcql);
//   if (lock) throw new access.HttpError(409, lock);

//   // 3. load the rows being changed
//   const all = await access.selectAll(zcql, SHEET_TABLE, "");
//   const rowsById = new Map(all.map((r) => [access.norm(r.emp_id), r]));

//   // 4. validate EVERYTHING first — nothing is saved if one change fails
//   const notes = [];
//   const cleaned = [].concat(...changes.map((c) => cleanChange(c, rowsById, notes)));

//   // 5. build updates + audit lines (only real changes)
//   const byRow = new Map(), audit = [];
//   const at = access.nowDT();
//   const actor = (a && a.user && (a.user.email || a.user.name)) || "system";
//   const batchId = "B" + Date.now();
//   const source = /^(grid|detail|import)$/.test(String(body.source)) ? body.source : "grid";

//   cleaned.forEach((c) => {
//     const old = c.row[c.column];
//     if (String(old == null ? "" : old) === String(c.value)) return;
//     if (!byRow.has(c.row.ROWID)) byRow.set(c.row.ROWID, { ROWID: c.row.ROWID });
//     byRow.get(c.row.ROWID)[c.column] = c.value;
//     audit.push({
//       emp_id: c.row.emp_id, employee_name: c.row.name, field_name: c.column,
//       old_value: String(old == null ? "" : old), new_value: String(c.value),
//       changed_by: actor, changed_at: at, source, batch_id: batchId,
//     });
//     c.row[c.column] = c.value;      // later changes in this same request see the new value
//   });

//   // 6. write
//   await inBatches(Array.from(byRow.values()), (b) => app.datastore().table(SHEET_TABLE).updateRows(b));
//   await inBatches(audit, (b) => app.datastore().table(AUDIT_TABLE).insertRows(b));

//   // 7. return the changed rows so the grid can refresh without another call
//   const touched = Array.from(new Set(cleaned.map((c) => c.row)));
//   const shaped = a && a.enforced ? touched.map((r) => access.shapeRowByColumns(a, r)) : touched;
//   sendJson(res, 200, { success: true, saved: audit.length, notes, batch_id: batchId, data: shaped });
// }

// /* ============================================================
//    MAIN
//    ============================================================ */

// module.exports = async function (req, res) {
//   const method = String(req.method || "GET").toUpperCase();
//   try {
//     if (method === "OPTIONS") return sendJson(res, 200, { success: true });
//     const a = await checkAccess(req);
//     if (method === "GET") return await getRows(req, res, a);
//     if (method === "PATCH" || method === "POST") return await patchCells(req, res, a);
//     sendJson(res, 405, { success: false, message: "Method " + method + " not allowed." });
//   } catch (e) {
//     if (e instanceof access.HttpError) return sendJson(res, e.status || 403, { success: false, message: e.message });
//     console.error("APPRAISAL SHEET API ERROR:", e);
//     sendJson(res, 500, { success: false, message: "Server error. Please try again." });
//   }
// };

"use strict";

const express = require("express");
const catalyst = require("zcatalyst-sdk-node");

const app = express();

app.use(express.json({ limit: "2mb" }));

/*
 * ---------------------------------------------------------
 * CATALYST
 * ---------------------------------------------------------
 */

function getCatalyst(req) {
    try {
        return catalyst.initialize(req);
    } catch (error) {
        console.error("Catalyst initialization error:", error);
        throw error;
    }
}

/*
 * ---------------------------------------------------------
 * TABLE
 * ---------------------------------------------------------
 */

const TABLES = {
    AppraisalSheet: "Appraisal_Sheet"
};

/*
 * ---------------------------------------------------------
 * ERROR HANDLING
 * ---------------------------------------------------------
 */

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function sendError(res, error) {
    console.error(error);

    if (error instanceof HttpError) {
        return res.status(error.status).json({
            success: false,
            message: error.message
        });
    }

    return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
    });
}

function asyncRoute(handler) {
    return function (req, res) {
        Promise.resolve(handler(req, res)).catch(function (error) {
            sendError(res, error);
        });
    };
}

/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function cleanString(value) {
    return String(value == null ? "" : value).trim();
}

function nowDateTime() {
    return new Date()
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
}

function escapeZCQL(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "''");
}

/*
 * ---------------------------------------------------------
 * GET ALL ROWS
 * ---------------------------------------------------------
 */

async function getAllRows(cat, tableName) {
    const table = cat.datastore().table(tableName);

    const rows = [];
    let nextToken = null;

    while (true) {
        const options = {
            maxRows: 200
        };

        if (nextToken) {
            options.nextToken = nextToken;
        }

        const response = await table.getPagedRows(options);

        if (response && Array.isArray(response.data)) {
            rows.push(...response.data);
        }

        if (
            !response ||
            !response.more_records ||
            !response.next_token
        ) {
            break;
        }

        nextToken = response.next_token;
    }

    return rows;
}

/*
 * ---------------------------------------------------------
 * GET ROW BY ROWID
 * ---------------------------------------------------------
 */

async function getRowById(cat, tableName, rowId) {
    const id = cleanString(rowId);

    if (!/^\d+$/.test(id)) {
        throw new HttpError(400, "Invalid ROWID.");
    }

    const query =
        "SELECT * FROM " +
        tableName +
        " WHERE ROWID = " +
        id;

    const result = await cat
        .zcql()
        .executeZCQLQuery(query);

    if (!result || result.length === 0) {
        return null;
    }

    return result[0][tableName];
}

/*
 * ---------------------------------------------------------
 * GET ROW BY EMPLOYEE ID
 * ---------------------------------------------------------
 */

async function getRowByEmployeeId(cat, empId) {
    const employeeId = cleanString(empId);

    if (!employeeId) {
        throw new HttpError(
            400,
            "emp_id is required."
        );
    }

    const query =
        "SELECT * FROM " +
        TABLES.AppraisalSheet +
        " WHERE emp_id = '" +
        escapeZCQL(employeeId) +
        "' LIMIT 1";

    const result = await cat
        .zcql()
        .executeZCQLQuery(query);

    if (!result || result.length === 0) {
        return null;
    }

    return result[0][TABLES.AppraisalSheet];
}

/*
 * ---------------------------------------------------------
 * REMOVE CATALYST SYSTEM FIELDS
 * ---------------------------------------------------------
 */

function removeSystemFields(data) {
    const output = {};

    Object.keys(data || {}).forEach(function (key) {
        if (
            key !== "ROWID" &&
            key !== "CREATORID" &&
            key !== "CREATEDTIME" &&
            key !== "MODIFIEDTIME"
        ) {
            output[key] = data[key];
        }
    });

    return output;
}

/*
 * ---------------------------------------------------------
 * HEALTH
 * ---------------------------------------------------------
 */

app.get(
    "/health",
    asyncRoute(async function (req, res) {
        return res.status(200).json({
            success: true,
            function: "appraisalapi1",
            message: "Appraisal API is working"
        });
    })
);

/*
 * ---------------------------------------------------------
 * ROOT
 * ---------------------------------------------------------
 */

app.get(
    "/",
    asyncRoute(async function (req, res) {
        return res.status(200).json({
            success: true,
            function: "appraisalapi1",
            message: "Appraisal API is running"
        });
    })
);

/*
 * ---------------------------------------------------------
 * GET ALL APPRAISAL ROWS
 *
 * GET /rows
 * ---------------------------------------------------------
 */

app.get(
    "/rows",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const rows = await getAllRows(
            cat,
            TABLES.AppraisalSheet
        );

        return res.json({
            success: true,
            count: rows.length,
            data: rows
        });
    })
);

/*
 * ---------------------------------------------------------
 * GET ONE APPRAISAL ROW BY ROWID
 *
 * GET /rows/id/:id
 * ---------------------------------------------------------
 */

app.get(
    "/rows/id/:id",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const row = await getRowById(
            cat,
            TABLES.AppraisalSheet,
            req.params.id
        );

        if (!row) {
            throw new HttpError(
                404,
                "Appraisal record not found."
            );
        }

        return res.json({
            success: true,
            data: row
        });
    })
);

/*
 * ---------------------------------------------------------
 * GET APPRAISAL BY EMPLOYEE ID
 *
 * GET /rows/employee/:emp_id
 * ---------------------------------------------------------
 */

app.get(
    "/rows/employee/:emp_id",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const row = await getRowByEmployeeId(
            cat,
            req.params.emp_id
        );

        if (!row) {
            throw new HttpError(
                404,
                "Appraisal record not found."
            );
        }

        return res.json({
            success: true,
            data: row
        });
    })
);

/*
 * ---------------------------------------------------------
 * CREATE APPRAISAL ROW
 *
 * POST /rows
 * ---------------------------------------------------------
 */

app.post(
    "/rows",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const body = removeSystemFields(
            req.body || {}
        );

        if (
            !body ||
            Object.keys(body).length === 0
        ) {
            throw new HttpError(
                400,
                "Request body cannot be empty."
            );
        }

        if (!cleanString(body.emp_id)) {
            throw new HttpError(
                400,
                "emp_id is required."
            );
        }

        /*
         * Check duplicate employee appraisal record
         */

        const existing = await getRowByEmployeeId(
            cat,
            body.emp_id
        );

        if (existing) {
            throw new HttpError(
                409,
                "An appraisal record already exists for this employee."
            );
        }

        const result = await cat
            .datastore()
            .table(TABLES.AppraisalSheet)
            .insertRow(body);

        return res.status(201).json({
            success: true,
            message:
                "Appraisal record created successfully.",
            data: result
        });
    })
);

/*
 * ---------------------------------------------------------
 * UPDATE APPRAISAL ROW BY ROWID
 *
 * PUT /rows/id/:id
 * ---------------------------------------------------------
 */

app.put(
    "/rows/id/:id",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const id = cleanString(
            req.params.id
        );

        if (!/^\d+$/.test(id)) {
            throw new HttpError(
                400,
                "Invalid ROWID."
            );
        }

        const existing = await getRowById(
            cat,
            TABLES.AppraisalSheet,
            id
        );

        if (!existing) {
            throw new HttpError(
                404,
                "Appraisal record not found."
            );
        }

        const body = removeSystemFields(
            req.body || {}
        );

        if (
            !body ||
            Object.keys(body).length === 0
        ) {
            throw new HttpError(
                400,
                "Request body cannot be empty."
            );
        }

        body.ROWID = id;

        const result = await cat
            .datastore()
            .table(TABLES.AppraisalSheet)
            .updateRow(body);

        return res.json({
            success: true,
            message:
                "Appraisal record updated successfully.",
            data: result
        });
    })
);

/*
 * ---------------------------------------------------------
 * UPDATE APPRAISAL BY EMPLOYEE ID
 *
 * PUT /rows/employee/:emp_id
 * ---------------------------------------------------------
 */

app.put(
    "/rows/employee/:emp_id",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const employeeId = cleanString(
            req.params.emp_id
        );

        const existing = await getRowByEmployeeId(
            cat,
            employeeId
        );

        if (!existing) {
            throw new HttpError(
                404,
                "Appraisal record not found."
            );
        }

        const body = removeSystemFields(
            req.body || {}
        );

        if (
            !body ||
            Object.keys(body).length === 0
        ) {
            throw new HttpError(
                400,
                "Request body cannot be empty."
            );
        }

        body.ROWID = existing.ROWID;

        const result = await cat
            .datastore()
            .table(TABLES.AppraisalSheet)
            .updateRow(body);

        return res.json({
            success: true,
            message:
                "Appraisal record updated successfully.",
            data: result
        });
    })
);

/*
 * ---------------------------------------------------------
 * UPDATE INDIVIDUAL CELL
 *
 * POST /cells
 *
 * Example:
 * {
 *   "emp_id": "EMP001",
 *   "field": "manager_rating",
 *   "value": 4
 * }
 * ---------------------------------------------------------
 */

app.post(
    "/cells",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const body = req.body || {};

        const empId = cleanString(
            body.emp_id
        );

        const field = cleanString(
            body.field
        );

        if (!empId) {
            throw new HttpError(
                400,
                "emp_id is required."
            );
        }

        if (!field) {
            throw new HttpError(
                400,
                "field is required."
            );
        }

        if (body.value === undefined) {
            throw new HttpError(
                400,
                "value is required."
            );
        }

        /*
         * Prevent updating Catalyst system fields.
         */

        const blockedFields = [
            "ROWID",
            "CREATORID",
            "CREATEDTIME",
            "MODIFIEDTIME"
        ];

        if (blockedFields.includes(field)) {
            throw new HttpError(
                400,
                "This field cannot be updated."
            );
        }

        const existing = await getRowByEmployeeId(
            cat,
            empId
        );

        if (!existing) {
            throw new HttpError(
                404,
                "Appraisal record not found."
            );
        }

        const update = {
            ROWID: existing.ROWID
        };

        update[field] = body.value;

        const result = await cat
            .datastore()
            .table(TABLES.AppraisalSheet)
            .updateRow(update);

        return res.json({
            success: true,
            message:
                "Appraisal cell updated successfully.",
            data: result
        });
    })
);

/*
 * ---------------------------------------------------------
 * DELETE APPRAISAL ROW
 *
 * DELETE /rows/id/:id
 *
 * This is included for admin/testing use.
 * ---------------------------------------------------------
 */

app.delete(
    "/rows/id/:id",
    asyncRoute(async function (req, res) {
        const cat = getCatalyst(req);

        const id = cleanString(
            req.params.id
        );

        if (!/^\d+$/.test(id)) {
            throw new HttpError(
                400,
                "Invalid ROWID."
            );
        }

        const existing = await getRowById(
            cat,
            TABLES.AppraisalSheet,
            id
        );

        if (!existing) {
            throw new HttpError(
                404,
                "Appraisal record not found."
            );
        }

        await cat
            .datastore()
            .table(TABLES.AppraisalSheet)
            .deleteRow(id);

        return res.json({
            success: true,
            message:
                "Appraisal record deleted successfully."
        });
    })
);

/*
 * ---------------------------------------------------------
 * 404
 * ---------------------------------------------------------
 */

app.use(function (req, res) {
    return res.status(404).json({
        success: false,
        message: "API route not found.",
        method: req.method,
        path: req.path
    });
});

/*
 * ---------------------------------------------------------
 * EXPORT
 * ---------------------------------------------------------
 */

module.exports = app;