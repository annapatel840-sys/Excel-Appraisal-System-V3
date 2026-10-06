"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const PAYROLL_DATA_TABLE_ID = "74008000000035326";

const DATASTORE_PAGE_SIZE = 200;

/* ============================================================
CORS
============================================================ */

function setCorsHeaders(res) {
  // DO NOT set Access-Control-Allow-Origin.
  // Catalyst automatically handles the allowed origin.

  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Requested-With",
  );

  res.setHeader("Access-Control-Max-Age", "86400");
}

/* ============================================================
SEND JSON
============================================================ */

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/* ============================================================
READ REQUEST BODY
============================================================ */

const readRequestBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });

    req.on("error", reject);
  });
};

/* ============================================================
ALLOWED HISTORY FIELDS
============================================================ */

const ALLOWED_FIELDS = [
  "base_pay",
  "allocated_pb",
  "allocated_pb_installment",
  "performance_bonus",
  "performance_bonus_installment",
  "retention_bonus",
  "total_pb",
  "total_bonus",
  "hike_amount",
  "hike_pct",
  "promotion",
  "title",
  "target_performance_bonus",
  "new_ctc",
  "manager_rating",
  "rating",
];

/* ============================================================
ACCESS CONTROL (docs/ACCESS_SPEC.md)

GET   ?emp_id → view on appraisalSheet / detailScreen / dashboard, emp_id
               in scope; enforced: history columns of hidden fields removed.
PATCH        → edit on appraisalSheet / detailScreen, emp_id in scope and
               every changed history column editable (see HISTORY_FIELDS).
Dry run (ACCESS_ENFORCE != 'true'): legacy behaviour, refusals only logged.
============================================================ */

const READ_SCREENS = ["appraisalSheet", "detailScreen", "dashboard"];
const EDIT_SCREENS = ["appraisalSheet", "detailScreen"];

/*
 * Payroll_Data (history) column → Appraisal grid field whose access limit
 * applies. Same mapping the frontend uses to write history
 * (src/lib/appraisal-store.jsx REACT_TO_HISTORY_FIELD, and DetailScreen's
 * HISTORY_FIELD for new_ctc). Columns not listed (e.g. rating) only need
 * appraisalSheet edit.
 */
const HISTORY_FIELDS = {
  base_pay: "currentAnnualBasePay",
  allocated_pb: "targetPBAllocatedForMay",
  allocated_pb_installment: "pbInstallment",
  performance_bonus: "pbToBePaid",
  performance_bonus_installment: "newPBInstallment",
  retention_bonus: "newRB",
  total_pb: "totalOfPB",
  total_bonus: "totalBonus",
  hike_amount: "hikeAmount",
  hike_pct: "hikePct",
  promotion: "eligibleForPromotion",
  title: "newTitle",
  target_performance_bonus: "targetPBNextYear",
  new_ctc: "totalCTCWithRewards",
  manager_rating: "managerRating",
};

const FIELD_KIND = Object.fromEntries(
  access.START_CATALOG.filter((c) => c.type === "field").map((c) => [
    c.key,
    c.kind,
  ]),
);

async function checkAccess(req) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });

  try {
    return await access.check(userApp, adminApp);
  } catch (error) {
    if (access.isEnforced()) throw error;
    // Dry run must never change legacy behaviour, even if access data is unreadable.
    console.log("ACCESS dry-run: access check failed:", error && error.message);
    return { dryRun: true, enforced: false, denied: error };
  }
}

function requireAnyScreen(a, keys, level) {
  const ok = keys.some((key) => {
    try {
      access.requireScreen(a, key, level);
      return true;
    } catch (error) {
      if (error instanceof access.HttpError) return false;
      throw error;
    }
  });

  if (!ok) {
    throw new access.HttpError(403, "You do not have access to this screen.");
  }
}

function requireInScope(a, empId) {
  if (!access.inScope(a, empId)) {
    throw new access.HttpError(
      403,
      "You do not have access to employee " + empId + ".",
    );
  }
}

/*
 * input / pair field → must be 'edit';
 * calc field (derived totals written with their inputs) → not hidden;
 * master / upload field → HR master data (employeeMaster edit);
 * unmapped column → appraisalSheet edit.
 */
function requireEditableHistoryColumns(a, columns) {
  const bad = [];
  let needsMaster = false;
  let needsSheet = false;

  columns.forEach((column) => {
    const key = HISTORY_FIELDS[column];

    if (!key) {
      needsSheet = true;
      return;
    }

    const kind = FIELD_KIND[key];
    const limit = a.fields && a.fields[key];

    if (kind === "calc") {
      if (limit === "hidden") bad.push(column);
      return;
    }

    if (kind === "master" || kind === "upload") {
      needsMaster = true;
      if (limit === "hidden") bad.push(column);
      return;
    }

    if (limit !== "edit") bad.push(column);
  });

  if (bad.length) {
    throw new access.HttpError(403, "You cannot edit: " + bad.join(", ") + ".");
  }

  if (needsSheet) access.requireScreen(a, "appraisalSheet", "edit");

  if (needsMaster) {
    try {
      access.requireScreen(a, "employeeMaster", "edit");
    } catch (error) {
      if (!(error instanceof access.HttpError)) throw error;
      throw new access.HttpError(
        403,
        "Only HR (Employee Master edit) can change: " +
          columns
            .filter((c) => {
              const kind = FIELD_KIND[HISTORY_FIELDS[c]];
              return kind === "master" || kind === "upload";
            })
            .join(", ") +
          ".",
      );
    }
  }
}

function shapeHistoryRow(a, row) {
  const out = {};

  Object.keys(row).forEach((column) => {
    const key = HISTORY_FIELDS[column];
    if (key && a.fields && a.fields[key] === "hidden") return;
    out[column] = row[column];
  });

  return out;
}

/* ============================================================
GET ALL PREVIOUS APPRAISAL RECORDS
============================================================ */

const getAllPreviousAppraisalRecords = async (table) => {
  let allRecords = [];
  let nextToken = undefined;

  while (true) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    console.log("Payroll_Data getPagedRows:", options);

    const result = await table.getPagedRows(options);

    const rows = Array.isArray(result?.data) ? result.data : [];

    console.log(
      "Payroll_Data page received:",
      rows.length,
      "more_records:",
      result?.more_records,
    );

    allRecords = allRecords.concat(rows);

    if (result?.more_records !== true) {
      break;
    }

    nextToken = result?.next_token;

    if (!nextToken) {
      console.warn(
        "Payroll_Data says more_records=true but no next_token was returned.",
      );
      break;
    }
  }

  console.log("Payroll_Data total records fetched:", allRecords.length);

  return allRecords;
};

/* ============================================================
GET HISTORY FOR EMPLOYEE
============================================================ */

const getHistory = async (table, empId) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);

  const history = allRecords
    .filter((record) => String(record.emp_id || "").trim() === empId)
    .sort((a, b) =>
      String(b.appraisal_year || "").localeCompare(
        String(a.appraisal_year || ""),
      ),
    );

  console.log("History records for", empId, ":", history.length);

  return history;
};

/* ============================================================
BUILD UPDATE DATA
============================================================ */

const buildUpdateData = (body) => {
  const updateData = {};

  ALLOWED_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updateData[field] = body[field];
    }
  });

  return updateData;
};

/* ============================================================
FIND CURRENT YEAR RECORD
============================================================ */

const findHistoryRecord = async (table, empId, appraisalYear) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);

  return allRecords.find(
    (item) =>
      String(item.emp_id || "").trim() === empId &&
      String(item.appraisal_year || "").trim() === appraisalYear,
  );
};

/* ============================================================
UPDATE EXISTING HISTORY
============================================================ */

const updateExistingHistory = async (table, record, updateData) => {
  const payload = {
    ...updateData,
    ROWID: record.ROWID,
  };

  console.log("Payroll_Data updateRow payload:", JSON.stringify(payload));

  const result = await table.updateRow(payload);

  console.log("Payroll_Data updateRow result:", JSON.stringify(result));

  return result;
};

/* ============================================================
CREATE HISTORY RECORD IF MISSING
============================================================ */

const createHistoryRecord = async (table, empId, appraisalYear, updateData) => {
  const payload = {
    emp_id: empId,
    appraisal_year: appraisalYear,
    ...updateData,
  };

  console.log(
    "Payroll_Data insertRows payload:",
    JSON.stringify(payload),
  );

  const result = await table.insertRows([payload]);

  console.log("Payroll_Data insertRows result:", JSON.stringify(result));

  return Array.isArray(result) ? result[0] : result;
};

/* ============================================================
MAIN API
============================================================ */

module.exports = async (req, res) => {
  setCorsHeaders(res);

  console.log("================================================");
  console.log("APPRAISAL HISTORY API REQUEST");
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("TABLE ID:", PAYROLL_DATA_TABLE_ID);
  console.log("================================================");

  /* ----------------------------------------------------------
  OPTIONS
  ---------------------------------------------------------- */

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    /* --------------------------------------------------------
    ACCESS (enforced → 401/403; dry run → never refuses)
    -------------------------------------------------------- */

    const a = await checkAccess(req);

    /* --------------------------------------------------------
    INITIALIZE CATALYST
    -------------------------------------------------------- */

    const app = catalyst.initialize(req);

    const datastore = app.datastore();

    const table = datastore.table(PAYROLL_DATA_TABLE_ID);

    const requestUrl = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`,
    );

    /* ========================================================
    GET
    ======================================================== */

    if (req.method === "GET") {
      const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

      console.log("GET emp_id:", empId);

      access.guard(a, () => requireAnyScreen(a, READ_SCREENS, "view"));

      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });
        return;
      }

      access.guard(a, () => requireInScope(a, empId));

      const history = await getHistory(table, empId);

      const data = a.enforced
        ? history.map((row) => shapeHistoryRow(a, row))
        : history;

      sendJson(res, 200, {
        success: true,
        emp_id: empId,
        count: data.length,
        data: data,
      });

      return;
    }

    /* ========================================================
    PATCH
    ======================================================== */

    if (req.method === "PATCH") {
      access.guard(a, () => requireAnyScreen(a, EDIT_SCREENS, "edit"));

      const body = await readRequestBody(req);

      console.log("PATCH BODY:", JSON.stringify(body));

      const empId = String(body.emp_id || "").trim();

      const appraisalYear = String(body.appraisal_year || "").trim();

      console.log("PATCH emp_id:", empId);
      console.log("PATCH appraisal_year:", appraisalYear);

      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });
        return;
      }

      if (!appraisalYear) {
        sendJson(res, 400, {
          success: false,
          message: "appraisal_year is required.",
        });
        return;
      }

      /* ------------------------------------------------------
      ONLY ALLOW 2025 AND 2026 HISTORY
      ------------------------------------------------------ */

      const normalizedYear = appraisalYear.toLowerCase().trim();

      const is2025 =
        normalizedYear.includes("2025") || normalizedYear.includes("apr-25");

      const is2026 =
        normalizedYear.includes("2026") || normalizedYear.includes("apr-26");

      if (!is2025 && !is2026) {
        sendJson(res, 400, {
          success: false,
          message: "Only 2025 and 2026 appraisal history can be updated.",
        });
        return;
      }

      /* ------------------------------------------------------
      BUILD UPDATE DATA
      ------------------------------------------------------ */

      const updateData = buildUpdateData(body);

      console.log("VALID HISTORY UPDATE DATA:", JSON.stringify(updateData));

      if (!Object.keys(updateData).length) {
        sendJson(res, 400, {
          success: false,
          message: "No valid Payroll_Data fields were provided.",
        });
        return;
      }

      access.guard(a, () => {
        requireInScope(a, empId);
        requireEditableHistoryColumns(a, Object.keys(updateData));
      });

      /* ------------------------------------------------------
      FIND EXISTING RECORD
      ------------------------------------------------------ */

      console.log("Searching Payroll_Data for:", empId, appraisalYear);

      const existingRecord = await findHistoryRecord(
        table,
        empId,
        appraisalYear,
      );

      /* ------------------------------------------------------
      UPDATE EXISTING RECORD
      ------------------------------------------------------ */

      if (existingRecord) {
        console.log(
          "Existing Payroll_Data record found:",
          existingRecord.ROWID,
        );

        const updatedRecord = await updateExistingHistory(
          table,
          existingRecord,
          updateData,
        );

        sendJson(res, 200, {
          success: true,
          action: "updated",
          emp_id: empId,
          appraisal_year: appraisalYear,
          message: "Payroll_Data updated successfully.",
          data: updatedRecord,
        });

        return;
      }

      /* ------------------------------------------------------
      CREATE RECORD IF IT DOES NOT EXIST
      ------------------------------------------------------ */

      console.log("No Payroll_Data record found.");

      console.log("Creating new history record for:", empId, appraisalYear);

      const createdRecord = await createHistoryRecord(
        table,
        empId,
        appraisalYear,
        updateData,
      );

      sendJson(res, 200, {
        success: true,
        action: "created",
        emp_id: empId,
        appraisal_year: appraisalYear,
        message: "Payroll_Data history created successfully.",
        data: createdRecord,
      });

      return;
    }

    /* ========================================================
    OTHER METHODS
    ======================================================== */

    sendJson(res, 405, {
      success: false,
      message: "Only GET, PATCH and OPTIONS methods are allowed.",
    });
  } catch (error) {
    if (error instanceof access.HttpError) {
      sendJson(res, error.status || 403, {
        success: false,
        message: error.message,
        enforced: true,
      });
      return;
    }

    console.error("================================================");

    console.error("APPRAISAL HISTORY API ERROR");

    console.error("MESSAGE:", error?.message);

    console.error("STACK:", error?.stack);

    console.error(
      "FULL ERROR:",
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    );

    console.error("================================================");

    sendJson(res, 500, {
      success: false,
      message: error?.message || "Failed to process appraisal history request.",
    });
  }
};
