"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

// ============================================================
// TABLE IDs
// ============================================================

const EMPLOYEE_MASTER_TABLE_ID = "Employee_Master";
const EMPLOYEES_TABLE_ID = "Appraisal_Sheet";
// ============================================================
// TABLE NAME
// ============================================================

const EMPLOYEE_MASTER_TABLE_NAME = "Employee_Master";

// ============================================================
// CORS
// ============================================================

function setCorsHeaders(res) {
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, OPTIONS",
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization",
  );

  res.setHeader("Access-Control-Max-Age", "86400");
}

// ============================================================
// JSON RESPONSE
// ============================================================

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

// ============================================================
// ACCESS CONTROL (docs/ACCESS_SPEC.md)
//
// Employee_Master is HR master data: GET = view, writes = edit on the
// HR-only screen 'employeeMaster'. No non-HR screen in src/ calls this
// function (the roster / eligibility pages read through employeesapi).
// Dry run (ACCESS_ENFORCE != 'true'): legacy behaviour, refusals only logged.
// Every write raises the access version (Employee_Master drives identity).
// ============================================================

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

async function bumpAccessVersion(req, a, why) {
  try {
    await access.bumpVersion(
      catalyst.initialize(req, { scope: "admin" }),
      (a && a.user && a.user.email) || "",
      why,
    );
  } catch (error) {
    console.error("ACCESS bumpVersion failed:", error && error.message);
  }
}

// ============================================================
// READ REQUEST BODY
// ============================================================

function readRequestBody(req) {
  return new Promise(function (resolve, reject) {
    let body = "";

    req.on("data", function (chunk) {
      body += chunk.toString();
    });

    req.on("end", function () {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });

    req.on("error", function (error) {
      reject(error);
    });
  });
}

// ============================================================
// STATUS NORMALIZATION
// ============================================================

function normalizeStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();

  if (status === "active") {
    return "Active";
  }

  if (status === "inactive") {
    return "Inactive";
  }

  return "";
}

// ============================================================
// ALLOWED EMPLOYEE MASTER FIELDS
// ============================================================

const ALLOWED_FIELDS = [
  "emp_name",
  "designation",
  "department",
  "repo_manager",
  "director",
  "appraiser_tech_ed",
  "email_id",
  "date_of_join",
  "emp_status",
  "emp_type",
  "wissen_experience",
  "total_experience",
  "cost_center",
  "current_salary",
  "location",
  "last_appraisal_month_year",
  "emp_id",
];

function pickAllowedFields(body) {
  const data = {};

  ALLOWED_FIELDS.forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = body[field];
    }
  });

  return data;
}

// ============================================================
// GET ALL EMPLOYEE MASTER RECORDS
//
// Used only for import/update operations.
// GET pagination does NOT use this function.
// ============================================================

async function getAllRoster(table) {
  let allRows = [];
  let nextToken;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: 200,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    allRows = allRows.concat(result.data || []);

    moreRecords = result.more_records === true;
    nextToken = result.next_token;
  }

  return allRows;
}

// ============================================================
// GET ALL EMPLOYEES
//
// Used for import/update synchronization.
// ============================================================

async function getAllEmployees(employeesTable) {
  let allRows = [];
  let nextToken;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: 200,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await employeesTable.getPagedRows(options);

    allRows = allRows.concat(result.data || []);

    moreRecords = result.more_records === true;
    nextToken = result.next_token;
  }

  return allRows;
}

// ============================================================
// BUILD EMPLOYEE MAP
// ============================================================

function buildEmployeeMap(employeeRows) {
  const map = new Map();

  employeeRows.forEach(function (row) {
    const empId = String(row.emp_id || "")
      .trim()
      .toLowerCase();

    if (!empId) {
      return;
    }

    const rowId = row.ROWID || row.rowid;

    if (!rowId) {
      return;
    }

    map.set(empId, row);
  });

  return map;
}

// ============================================================
// FIND EMPLOYEE BY EMP ID
// ============================================================

function findEmployeeByEmpId(employeeMap, empId) {
  const key = String(empId || "")
    .trim()
    .toLowerCase();

  return employeeMap.get(key) || null;
}

// ============================================================
// SYNCHRONIZE STATUS TO EMPLOYEES TABLE
// ============================================================

async function synchronizeEmployeeStatus(
  employeesTable,
  employeeMap,
  empId,
  normalizedStatus,
  masterRowId,
) {
  const employee = findEmployeeByEmpId(employeeMap, empId);

  if (!employee) {
    return {
      success: false,
      found: false,
      message: "Employee " + empId + " was not found in Employees table.",
    };
  }

  const rowId = employee.ROWID || employee.rowid;

  if (!rowId) {
    throw new Error("Employees ROWID not found for " + empId);
  }

  await employeesTable.updateRow({
    ROWID: rowId,
    status: normalizedStatus,
    emp_master_row_id: masterRowId,
  });

  return {
    success: true,
    found: true,
    emp_id: empId,
    status: normalizedStatus,
  };
}

// ============================================================
// BUILD SEARCH CONDITION
// ============================================================

function buildSearchCondition(search) {
  if (!search) {
    return "";
  }

  const escaped = search.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return (
    "(emp_id LIKE '%" +
    escaped +
    "%' OR " +
    "emp_name LIKE '%" +
    escaped +
    "%' OR " +
    "designation LIKE '%" +
    escaped +
    "%' OR " +
    "department LIKE '%" +
    escaped +
    "%')"
  );
}

// ============================================================
// BUILD WHERE CONDITION
// ============================================================

function buildWhereCondition(search, statusParam) {
  const conditions = [];

  const searchCondition = buildSearchCondition(search);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (statusParam && statusParam !== "all") {
    if (statusParam === "active") {
      conditions.push("emp_status = 'Active'");
    }

    if (statusParam === "inactive") {
      conditions.push("emp_status = 'Inactive'");
    }
  }

  if (!conditions.length) {
    return "";
  }

  return " WHERE " + conditions.join(" AND ");
}

// ============================================================
// EXTRACT COUNT
// ============================================================

function extractCount(result) {
  if (!Array.isArray(result) || !result.length) {
    return 0;
  }

  const row = result[0] || {};

  const possibleKeys = ["COUNT(ROWID)", "COUNT(*)", "count", "COUNT"];

  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null) {
      return Number(row[key]) || 0;
    }
  }

  const values = Object.values(row);

  if (values.length) {
    return Number(values[0]) || 0;
  }

  return 0;
}

// ============================================================
// GET EMPLOYEE MASTER
//
// IMPORTANT:
//
// This GET no longer loads the entire Employee_Master table.
//
// It fetches only the requested page.
//
// Counts are calculated separately.
// ============================================================

async function getRoster(req, res, appInstance) {
  const url = new URL(req.url, "https://" + (req.headers.host || "localhost"));

  const pageValue = parseInt(url.searchParams.get("page"), 10);
  const limitValue = parseInt(url.searchParams.get("limit"), 10);

  const page = Math.max(1, pageValue || 1);

  const limit = Math.min(100, Math.max(1, limitValue || 20));

  const search = String(url.searchParams.get("search") || "")
    .trim()
    .toLowerCase();

  const statusParam = String(url.searchParams.get("status") || "")
    .trim()
    .toLowerCase();

  const whereCondition = buildWhereCondition(search, statusParam);

  const offset = (page - 1) * limit;

  const dataQuery =
    "SELECT * FROM " +
    EMPLOYEE_MASTER_TABLE_NAME +
    whereCondition +
    " LIMIT " +
    limit +
    " OFFSET " +
    offset;

  const filteredCountQuery =
    "SELECT COUNT(ROWID) FROM " + EMPLOYEE_MASTER_TABLE_NAME + whereCondition;

  const totalCountQuery =
    "SELECT COUNT(ROWID) FROM " + EMPLOYEE_MASTER_TABLE_NAME;

  const activeCountQuery =
    "SELECT COUNT(ROWID) FROM " +
    EMPLOYEE_MASTER_TABLE_NAME +
    " WHERE emp_status = 'Active'";

  const inactiveCountQuery =
    "SELECT COUNT(ROWID) FROM " +
    EMPLOYEE_MASTER_TABLE_NAME +
    " WHERE emp_status = 'Inactive'";

  const zcql = appInstance.zcql();

  // Run independent database queries together.
  const results = await Promise.all([
    zcql.executeZCQLQuery(dataQuery),
    zcql.executeZCQLQuery(filteredCountQuery),
    zcql.executeZCQLQuery(totalCountQuery),
    zcql.executeZCQLQuery(activeCountQuery),
    zcql.executeZCQLQuery(inactiveCountQuery),
  ]);

  const data = Array.isArray(results[0])
    ? results[0].map(function (row) {
        if (row[EMPLOYEE_MASTER_TABLE_NAME]) {
          return row[EMPLOYEE_MASTER_TABLE_NAME];
        }

        return row;
      })
    : [];

  const filteredCount = extractCount(results[1]);
  const totalCount = extractCount(results[2]);
  const activeCount = extractCount(results[3]);
  const inactiveCount = extractCount(results[4]);

  const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / limit);

  const safePage = Math.min(page, totalPages);

  // If requested page is outside the valid range,
  // fetch the final valid page.
  let finalData = data;

  if (safePage !== page) {
    const safeOffset = (safePage - 1) * limit;

    const safeDataQuery =
      "SELECT * FROM " +
      EMPLOYEE_MASTER_TABLE_NAME +
      whereCondition +
      " LIMIT " +
      limit +
      " OFFSET " +
      safeOffset;

    const safeResult = await zcql.executeZCQLQuery(safeDataQuery);

    finalData = Array.isArray(safeResult)
      ? safeResult.map(function (row) {
          if (row[EMPLOYEE_MASTER_TABLE_NAME]) {
            return row[EMPLOYEE_MASTER_TABLE_NAME];
          }

          return row;
        })
      : [];
  }

  sendJson(res, 200, {
    success: true,
    data: finalData,

    pagination: {
      page: safePage,
      limit: limit,
      totalCount: filteredCount,
      totalPages: totalPages,
      returnedCount: finalData.length,
    },

    counts: {
      total: totalCount,
      active: activeCount,
      inactive: inactiveCount,
    },
  });
}

// ============================================================
// CREATE / IMPORT EMPLOYEE MASTER
// ============================================================

async function createRoster(req, res, table, employeesTable, afterWrite) {
  const body = await readRequestBody(req);

  const incoming = Array.isArray(body.employees)
    ? body.employees
    : Array.isArray(body)
      ? body
      : [body];

  if (!incoming.length) {
    return sendJson(res, 400, {
      success: false,
      message: "No employee records were provided.",
    });
  }

  const existingRows = await getAllRoster(table);

  const existingByEmpId = new Map();

  existingRows.forEach(function (row) {
    const key = String(row.emp_id || "")
      .trim()
      .toLowerCase();

    if (key) {
      existingByEmpId.set(key, row);
    }
  });

  const employeeRows = await getAllEmployees(employeesTable);

  const employeeMap = buildEmployeeMap(employeeRows);

  const rowsToInsert = [];
  const rowsToUpdate = [];
  const skipped = [];
  const statusChanges = [];

  incoming.forEach(function (item) {
    const record = item || {};

    const empId = String(record.emp_id || "").trim();

    if (!empId) {
      skipped.push({
        emp_id: "",
        reason: "emp_id is missing.",
      });

      return;
    }

    const employee = findEmployeeByEmpId(employeeMap, empId);

    if (!employee) {
      skipped.push({
        emp_id: empId,
        reason: "Matching employee was not found in Employees table.",
      });

      return;
    }

    const employeeRowId = employee.ROWID || employee.rowid;

    if (!employeeRowId) {
      skipped.push({
        emp_id: empId,
        reason: "Employees ROWID was not found.",
      });

      return;
    }

    const data = pickAllowedFields(record);

    if (data.emp_status !== undefined) {
      const normalized = normalizeStatus(data.emp_status);

      if (normalized) {
        data.emp_status = normalized;
      } else {
        data.emp_status = "Active";
      }
    }

    const masterStatus = data.emp_status || "Active";

    const existing = existingByEmpId.get(empId.toLowerCase());

    if (existing) {
      const masterRowId = existing.ROWID || existing.rowid;

      if (!masterRowId) {
        skipped.push({
          emp_id: empId,
          reason: "Existing Employee_Master row has no ROWID.",
        });

        return;
      }

      rowsToUpdate.push({
        ROWID: masterRowId,
        ...data,
      });

      if (data.emp_status !== undefined) {
        statusChanges.push({
          empId: empId,
          status: masterStatus,
        });
      }

      return;
    }

    rowsToInsert.push({
      emp_id: empId,
      emp_status: masterStatus,
      ...data,
    });

    statusChanges.push({
      empId: empId,
      status: masterStatus,
    });
  });

  let insertedRows = [];
  let updatedRows = [];

  if (rowsToInsert.length) {
    insertedRows = await table.insertRows(rowsToInsert);
  }

  if (rowsToUpdate.length) {
    updatedRows = await table.updateRows(rowsToUpdate);
  }

  const updatedMasterRows = rowsToInsert.length
    ? await getAllRoster(table)
    : existingRows;
  const masterByEmpId = new Map(
    updatedMasterRows.map((row) => [String(row.emp_id || "").trim().toLowerCase(), row]),
  );
  const affectedEmpIds = new Set([
    ...rowsToInsert.map((row) => row.emp_id),
    ...rowsToUpdate.map((row) => existingRows.find((existing) =>
      String(existing.ROWID || existing.rowid) === String(row.ROWID),
    )?.emp_id).filter(Boolean),
  ]);
  for (const empId of affectedEmpIds) {
    const master = masterByEmpId.get(String(empId).trim().toLowerCase());
    const employee = findEmployeeByEmpId(employeeMap, empId);
    const parentRowId = master && (master.ROWID || master.rowid);
    const childRowId = employee && (employee.ROWID || employee.rowid);
    if (!parentRowId || !childRowId) {
      throw new Error("Unable to synchronize Employee_Master reference for " + empId);
    }
    await employeesTable.updateRow({
      ROWID: childRowId,
      emp_master_row_id: parentRowId,
    });
  }

  const statusSyncResults = [];

  for (const statusChange of statusChanges) {
    const master = masterByEmpId.get(statusChange.empId.toLowerCase());
    const masterRowId = master && (master.ROWID || master.rowid);
    if (!masterRowId) {
      throw new Error("Employee_Master ROWID not found for " + statusChange.empId);
    }
    const result = await synchronizeEmployeeStatus(
      employeesTable,
      employeeMap,
      statusChange.empId,
      statusChange.status,
      masterRowId,
    );

    statusSyncResults.push(result);
  }

  if (afterWrite && (rowsToInsert.length || rowsToUpdate.length)) {
    await afterWrite("Employee_Master import");
  }

  sendJson(res, 200, {
    success: true,

    message:
      "Roster import completed. " +
      rowsToInsert.length +
      " created, " +
      rowsToUpdate.length +
      " updated.",

    data: {
      created: rowsToInsert.length,
      updated: rowsToUpdate.length,
      skipped: skipped.length,
      skippedRecords: skipped,
      insertedRows: insertedRows,
      updatedRows: updatedRows,
      statusSyncResults: statusSyncResults,
    },
  });
}

// ============================================================
// UPDATE EMPLOYEE MASTER EMPLOYEE
// ============================================================

async function updateRosterEmployee(req, res, table, employeesTable, afterWrite) {
  const body = await readRequestBody(req);

  const empId = String(body.emp_id || "").trim();

  if (!empId) {
    return sendJson(res, 400, {
      success: false,
      message: "emp_id is required.",
    });
  }

  const rows = await getAllRoster(table);

  const existingRow = rows.find(function (row) {
    return (
      String(row.emp_id || "")
        .trim()
        .toLowerCase() === empId.toLowerCase()
    );
  });

  if (!existingRow) {
    return sendJson(res, 404, {
      success: false,
      message: "Employee " + empId + " not found in Employee_Master.",
    });
  }

  const masterRowId = existingRow.ROWID || existingRow.rowid;

  if (!masterRowId) {
    throw new Error("Employee_Master ROWID not found for " + empId);
  }

  const employeeRows = await getAllEmployees(employeesTable);

  const employeeMap = buildEmployeeMap(employeeRows);

  const employee = findEmployeeByEmpId(employeeMap, empId);

  if (!employee) {
    return sendJson(res, 404, {
      success: false,
      message: "Employee " + empId + " not found in Employees table.",
    });
  }

  const employeeRowId = employee.ROWID || employee.rowid;

  if (!employeeRowId) {
    throw new Error("Employees ROWID not found for " + empId);
  }

  // ==========================================================
  // STATUS UPDATE
  // ==========================================================

  if (Object.prototype.hasOwnProperty.call(body, "emp_status")) {
    const normalized = normalizeStatus(body.emp_status);

    if (!normalized) {
      return sendJson(res, 400, {
        success: false,
        message: 'emp_status must be either "Active" or "Inactive".',
      });
    }

    await table.updateRow({
      ROWID: masterRowId,
      emp_row_id: employeeRowId,
      emp_status: normalized,
    });

    const statusSync = await synchronizeEmployeeStatus(
      employeesTable,
      employeeMap,
      empId,
      normalized,
      masterRowId,
    );

    if (afterWrite) await afterWrite("Employee_Master status changed: " + empId);

    return sendJson(res, 200, {
      success: true,

      message: statusSync.found
        ? "Employee status updated and synchronized successfully."
        : "Employee Master status updated, but matching Employees record was not found.",

      data: {
        emp_id: empId,
        emp_status: normalized,
        employees_status: statusSync.found ? normalized : null,
        statusSync: statusSync,
      },
    });
  }

  // ==========================================================
  // GENERIC EMPLOYEE MASTER UPDATE
  // ==========================================================

  const updateData = pickAllowedFields(body);

  if (Object.keys(updateData).length === 0) {
    return sendJson(res, 400, {
      success: false,
      message: "No valid fields were provided.",
    });
  }

  await table.updateRow({
    ROWID: masterRowId,
    ...updateData,
  });

  await employeesTable.updateRow({
    ROWID: employeeRowId,
    emp_master_row_id: masterRowId,
  });

  if (afterWrite) await afterWrite("Employee_Master updated: " + empId);

  sendJson(res, 200, {
    success: true,
    message: "Employee updated successfully.",
    data: {
      emp_id: empId,
      ...updateData,
    },
  });
}

// ============================================================
// CATALYST ADVANCED I/O ENTRY
// ============================================================

module.exports = async function (req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;

    res.end(
      JSON.stringify({
        success: true,
      }),
    );

    return;
  }

  try {
    // Access first: enforced → 401/403 here; dry run → never refuses.
    const a = await checkAccess(req);
    const isRead = req.method === "GET";

    access.guard(a, function () {
      access.requireScreen(a, "employeeMaster", isRead ? "view" : "edit");
    });

    const afterWrite = function (why) {
      return bumpAccessVersion(req, a, why);
    };

    const appInstance = catalyst.initialize(req);

    const datastore = appInstance.datastore();

    const table = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

    const employeesTable = datastore.table(EMPLOYEES_TABLE_ID);

    // GET reads only from Employee_Master.
    if (req.method === "GET") {
      await getRoster(req, res, appInstance);
      return;
    }

    // POST imports Employee_Master records.
    if (req.method === "POST") {
      await createRoster(req, res, table, employeesTable, afterWrite);
      return;
    }

    // PUT / PATCH updates Employee_Master.
    if (req.method === "PUT" || req.method === "PATCH") {
      await updateRosterEmployee(req, res, table, employeesTable, afterWrite);
      return;
    }

    sendJson(res, 405, {
      success: false,
      message: "Method " + req.method + " not allowed.",
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

    console.error("employee-master-api ERROR:", error);

    sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
};
