"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const express = require("express");
const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const app = express();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DATASTORE_PAGE_SIZE = 200;

const EMPLOYEES_TABLE_ID = "Appraisal_Sheet";
const EMPLOYEE_MASTER_TABLE_ID = "Employee_Master";

/* ============================================================
   EXPRESS JSON BODY PARSER
   ============================================================ */

app.use(express.json());

/* ============================================================
   CORS
   ============================================================ */

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
};

app.use(function (req, res, next) {
  Object.entries(corsHeaders).forEach(function ([key, value]) {
    res.setHeader(key, value);
  });

  next();
});

/* ============================================================
   JSON RESPONSE
   ============================================================ */

function sendJson(res, statusCode, body) {
  return res.status(statusCode).json(body);
}

/* ============================================================
   OPTIONS / PREFLIGHT
   ============================================================ */

app.use(function (req, res, next) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, {
      success: true,
    });
  }

  next();
});

/* ============================================================
   ACCESS CONTROL (docs/ACCESS_SPEC.md)

   Dry run (ACCESS_ENFORCE != 'true'): the legacy behaviour below is kept
   unchanged; refusals are only logged ("ACCESS dry-run: would deny ...").
   Enforced: the access object is the single source of truth (the legacy
   isHRUser / employeeBelongsToCurrentUser scoping is not used).
   ============================================================ */

// Screens whose pages read Appraisal_Sheet rows through this function.
const READ_SCREENS = [
  "dashboard",
  "appraisalSheet",
  "detailScreen",
  "budgetAllocation",
  "budgetDistribution",
  "teamChanges",
  "delegation",
  "employeeMaster",
];
const EDIT_SCREENS = ["appraisalSheet", "detailScreen"];

// Field kind (input / pair / master / upload / calc) by field key.
const FIELD_KIND = Object.fromEntries(
  access.START_CATALOG.filter(function (c) {
    return c.type === "field";
  }).map(function (c) {
    return [c.key, c.kind];
  }),
);

// Columns whose change alters the hierarchy / identity used by access.
const HIERARCHY_COLUMNS = new Set([
  "status",
  "eligible_status",
  "reporting_manager",
  "manager",
  "comp_manager",
  "appraiser_tech_ed",
  "manager_email_id",
  "super_man_email_id",
  "name",
  "designation",
]);

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
  const ok = keys.some(function (key) {
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

function requireInScope(a, empIds) {
  const outside = empIds.filter(function (empId) {
    return !access.inScope(a, empId);
  });

  if (outside.length) {
    throw new access.HttpError(
      403,
      "You do not have access to employee(s): " + outside.join(", ") + ".",
    );
  }
}

/*
 * Appraisal_Sheet columns a user may change:
 *   - input / pair fields  → the field must be 'edit' for the user;
 *   - master / upload fields and every non-field column (status,
 *     eligible_status, manager_email_id, department, joining_date…)
 *     → HR master data: edit on the employeeMaster screen.
 */
function isMasterColumn(column) {
  const key = access.fieldOfColumn(column);
  if (!key) return true;
  const kind = FIELD_KIND[key];
  return kind === "master" || kind === "upload";
}

function requireEditableColumns(a, columns) {
  const masterColumns = columns.filter(isMasterColumn);
  const fieldColumns = columns.filter(function (c) {
    return !isMasterColumn(c);
  });

  if (masterColumns.length) {
    try {
      access.requireScreen(a, "employeeMaster", "edit");
    } catch (error) {
      if (!(error instanceof access.HttpError)) throw error;
      throw new access.HttpError(
        403,
        "Only HR (Employee Master edit) can change: " +
          masterColumns.join(", ") +
          ".",
      );
    }
  }

  access.requireEditColumns(a, fieldColumns);
}

// Hidden columns removed; orgExp mirrors wissen_experience so it goes too.
function shapeEmployee(a, row) {
  const out = access.shapeRowByColumns(a, row);

  if (a.fields && a.fields.wissenExperience === "hidden") {
    delete out.orgExp;
    delete out.wissen_experience;
  }

  return out;
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

function sendAccessError(res, error) {
  return sendJson(res, error.status || 403, {
    success: false,
    message: error.message,
    enforced: true,
  });
}

app.use(async function (req, res, next) {
  try {
    req.access = await checkAccess(req);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi ACCESS ERROR:", error);
    return sendJson(res, 500, {
      success: false,
      message: error && error.message ? error.message : "Internal server error.",
    });
  }

  next();
});

/* ============================================================
   HELPERS
   ============================================================ */

function getQueryParams(req) {
  return req.queryParams || req.query || {};
}

function getPositiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(1, Math.floor(number));
}

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

/* ============================================================
   HR UNIVERSAL ACCESS
   HR users are not restricted by appraisal status/eligibility.
   ============================================================ */

function isHRUser(user) {
  const role = String(
    user?.role_details?.role_name || user?.role_name || "",
  )
    .trim()
    .toLowerCase();

  return role === "hr";
}

/* ============================================================
   TECHED ACCESS
   Non-HR users see only employees assigned to them in
   Employees.appraiser_tech_ed.
   The assignment may contain EMP ID + name, so compare against
   the signed-in user's id, email, and display/name variants.
   ============================================================ */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getCurrentUserMatchValues(user) {
  const firstName = user?.first_name || "";
  const lastName = user?.last_name || "";

  return [
    user?.user_id,
    user?.email_id,
    user?.email,
    user?.display_name,
    user?.name,
    firstName,
    lastName,
    [firstName, lastName].filter(Boolean).join(" "),
  ].map(normalizeText).filter(Boolean);
}

function employeeBelongsToCurrentUser(employee, user) {
  const assignedRaw = String(employee?.appraiser_tech_ed || "").trim();
  if (!assignedRaw) return false;

  const assigned = normalizeText(assignedRaw);

  // Direct dynamic matches: user id, email, or complete profile value.
  if (
    getCurrentUserMatchValues(user).some(function (value) {
      return (
        value &&
        (assigned === value || assigned.includes(value) || value.includes(assigned))
      );
    })
  ) {
    return true;
  }

  // Dynamic name match. Catalyst user profiles commonly provide first_name
  // and last_name separately, while the employee assignment can contain
  // "EMPxxxx - First Last". Match the user's name tokens without hardcoding
  // any employee ID or person.
  const firstName = normalizeText(user?.first_name);
  const lastName = normalizeText(user?.last_name);

  if (lastName && !assigned.includes(lastName)) {
    return false;
  }

  if (firstName) {
    const firstNameParts = String(user?.first_name || "")
      .trim()
      .split(/[^A-Za-z0-9]+/)
      .map(normalizeText)
      .filter(Boolean);

    const firstPartMatches = firstNameParts.some(function (part) {
      return part.length >= 3 && assigned.includes(part);
    });

    if (!firstPartMatches) {
      return false;
    }
  }

  return Boolean(lastName || firstName);
}

/* ============================================================
   EMPLOYEE RESPONSE NORMALIZATION
   ============================================================ */

function normalizeEmployeeResponse(employee) {
  const row = employee || {};

  const wissenExperience =
    row.wissen_experience !== undefined && row.wissen_experience !== null
      ? row.wissen_experience
      : row.wissenExperience !== undefined && row.wissenExperience !== null
        ? row.wissenExperience
        : "";

  const orgExp =
    row.orgExp !== undefined && row.orgExp !== null
      ? row.orgExp
      : wissenExperience;

  return {
    ...row,

    wissen_experience: wissenExperience,

    orgExp: orgExp,
  };
}

/* ============================================================
   ALLOWED FIELDS
   ============================================================ */

const ALLOWED_FIELDS = [
  "name",
  "designation",
  "reporting_manager",
  "comp_manager",
  "appraiser_tech_ed",
  "department",
  "manager",
  "status",
  "wissen_experience",
  "total_experience",
  "last_appraisal_date",
  "manager_rating",
  "interview_count",
  "rr_percent",
  "gross_margin",
  "rb_to_be_paid",
  "month_rb",
  "pb_to_be_paid",
  "month_pb",
  "current_annual_base_pay",
  "target_pb_allocated_for_may",
  "allocated_pb_amount",
  "pb_installment",
  "new_pb_to_be_offered",
  "new_pb_installment",
  "new_rb",
  "hike_amount",
  "hike_pct",
  "target_pb_next_year",
  "eligible_for_promotion",
  "new_title",
  "at_risk",
  "joining_date",
  "manager_email_id",
  "super_man_email_id",
  "rating",
  "eligible_status",
  "joining_bonus",
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

/* ============================================================
   GET ALL EMPLOYEES USING DATASTORE PAGINATION
   ============================================================ */

async function getAllEmployees(datastore) {
  const table = datastore.table(EMPLOYEES_TABLE_ID);

  let allRows = [];
  let nextToken = null;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    const pageRows = Array.isArray(result.data) ? result.data : [];

    allRows = allRows.concat(
      pageRows.map(function (employee) {
        return normalizeEmployeeResponse(employee);
      }),
    );

    moreRecords = result.more_records === true;
    nextToken = result.next_token || null;

    if (!nextToken) {
      moreRecords = false;
    }
  }

  return allRows;
}

/* ============================================================
   GET ALL EMPLOYEE MASTER RECORDS USING DATASTORE PAGINATION
   ============================================================ */

async function getAllEmployeeMaster(datastore) {
  const table = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

  let allRows = [];
  let nextToken = null;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    const pageRows = Array.isArray(result.data) ? result.data : [];

    allRows = allRows.concat(pageRows);

    moreRecords = result.more_records === true;
    nextToken = result.next_token || null;

    if (!nextToken) {
      moreRecords = false;
    }
  }

  return allRows;
}

/* ============================================================
   BUILD EMPLOYEE MASTER MAP
   ============================================================ */

function buildEmployeeMasterMap(masterRows) {
  const map = new Map();

  (masterRows || []).forEach(function (row) {
    const empId = String(row.emp_id || "")
      .trim()
      .toLowerCase();

    if (!empId) {
      return;
    }

    map.set(empId, row);
  });

  return map;
}

/* ============================================================
   APPRAISAL_SHEET + EMPLOYEE_MASTER → APPRAISAL API SHAPE

   The new Data Store schema deliberately keeps employee master data
   separate from appraisal values. The UI still consumes one employee
   object, so join the two tables here instead of duplicating columns.
   ============================================================ */

function mergeEmployeeMasterIntoAppraisal(appraisalRows, employeeMasterMap) {
  return (appraisalRows || []).map(function (row) {
    const empId = String(row.emp_id || "").trim();
    const master = employeeMasterMap.get(empId.toLowerCase()) || {};

    const active = normalizeStatus(master.emp_status || "Active");

    return {
      ...row,

      name: String(master.emp_name || row.name || ""),
      designation: String(master.designation || row.designation || row.title || ""),
      reporting_manager: String(master.repo_manager || row.reporting_manager || ""),
      // The current Employee_Master schema has no separate comp_manager column.
      // director is the available compensation-management hierarchy value.
      comp_manager: String(master.director || row.comp_manager || ""),
      appraiser_tech_ed: String(master.appraiser_tech_ed || row.appraiser_tech_ed || ""),
      department: String(master.department || row.department || ""),
      wissen_experience: Number(master.wissen_experience || row.wissen_experience || 0),
      total_experience: Number(master.total_experience || row.total_experience || 0),
      joining_date: String(master.date_of_join || row.joining_date || ""),
      status: active,

      // No eligible_status column exists in the current Employee_Master /
      // Appraisal_Sheet schema. Active employees are therefore eligible;
      // inactive employees are not eligible.
      eligible_status:
        String(row.eligible_status || "").trim() ||
        (active === "Active" ? "eligible" : "not eligible"),

      // Appraisal_Sheet is the source of truth for the current Apr-26 grid.
      // Do NOT map these fields from Payroll_Data aliases such as base_pay.
      current_annual_base_pay: Number(row.current_annual_base_pay || 0),
      target_pb_allocated_for_may: Number(row.target_pb_allocated_for_may || 0),
      allocated_pb_amount: Number(row.allocated_pb_amount || 0),
      pb_installment: String(row.pb_installment ?? ""),
      pb_to_be_paid: Number(row.pb_to_be_paid || 0),
      new_pb_to_be_offered: Number(row.new_pb_to_be_offered || 0),
      new_pb_installment: String(row.new_pb_installment ?? ""),
      new_rb: Number(row.new_rb || 0),
      hike_amount: Number(row.hike_amount || 0),
      hike_pct: Number(row.hike_pct || 0),
      target_pb_next_year: Number(row.target_pb_next_year || 0),
      eligible_for_promotion: String(row.eligible_for_promotion || "No"),
      new_title: String(row.new_title || ""),
      at_risk: String(row.at_risk || ""),
      manager_rating: String(row.manager_rating || ""),
      rating: Number(row.rating || 0),
      joining_bonus: Number(row.joining_bonus || 0),
    };
  });
}

/* ============================================================
   CHECK APPRAISAL SHEET ELIGIBILITY
   ============================================================ */

function isAppraisalEligible(employee, employeeMasterMap) {
  const empId = String(employee.emp_id || "")
    .trim()
    .toLowerCase();

  if (!empId) {
    return false;
  }

  const master = employeeMasterMap.get(empId);

  if (!master) {
    return false;
  }

  const masterStatus = normalizeStatus(master.emp_status);

  const eligibility = String(employee.eligible_status || "")
    .trim()
    .toLowerCase();

  // Current Employee_Master schema has no eligible_status column. When it is
  // absent, Active in Employee_Master is the eligibility source of truth.
  const effectiveEligibility = eligibility || (masterStatus === "Active" ? "eligible" : "not eligible");

  return masterStatus === "Active" && effectiveEligibility === "eligible";
}

/* ============================================================
   FILTER EMPLOYEES
   ============================================================ */

function filterEmployees(
  employees,
  employeeMasterMap,
  search,
  status,
  eligible,
  view,
) {
  let filtered = employees;

  /*
   * NORMAL APPRAISAL VIEW
   *
   * Employee_Master = Active
   * AND
   * Employees = Eligible
   *
   * Eligibility view and Master view show all employees.
   */

  if (view !== "eligibility" && view !== "master") {
    filtered = filtered.filter(function (employee) {
      return isAppraisalEligible(employee, employeeMasterMap);
    });
  }

  /* ==========================================================
     SEARCH
     ========================================================== */

  if (search) {
    const searchValue = search.toLowerCase();

    filtered = filtered.filter(function (employee) {
      const empId = String(employee.emp_id || "").toLowerCase();

      const name = String(employee.name || "").toLowerCase();

      const designation = String(employee.designation || "").toLowerCase();

      const organization = String(
        employee.department || employee.organization || "",
      ).toLowerCase();

      return (
        empId.includes(searchValue) ||
        name.includes(searchValue) ||
        designation.includes(searchValue) ||
        organization.includes(searchValue)
      );
    });
  }

  /* ==========================================================
     STATUS FILTER
     ========================================================== */

  if (status) {
    filtered = filtered.filter(function (employee) {
      return (
        String(employee.status || "")
          .trim()
          .toLowerCase() === status.toLowerCase()
      );
    });
  }

  /* ==========================================================
     ELIGIBILITY FILTER
     ========================================================== */

  if (eligible) {
    filtered = filtered.filter(function (employee) {
      const value = String(employee.eligible_status || "")
        .trim()
        .toLowerCase();

      if (eligible === "eligible") {
        return value === "eligible";
      }

      if (eligible === "not eligible") {
        return value === "not eligible";
      }

      if (eligible === "noteligible") {
        return value === "noteligible";
      }

      return true;
    });
  }

  return filtered;
}

/* ============================================================
   GET EMPLOYEES
   ============================================================ */

async function getEmployees(req, res) {
  const appInstance = catalyst.initialize(req);

  const datastore = appInstance.datastore();

  const a = req.access;
  const enforced = Boolean(a && a.enforced);
  const params = getQueryParams(req);

  const requestedView = String(params.view || "")
    .trim()
    .toLowerCase();
  const requestedEmpIds = String(params.emp_id || params.empId || "")
    .split(",")
    .map(function (value) {
      return value.trim();
    })
    .filter(Boolean);

  access.guard(a, function () {
    requireAnyScreen(a, READ_SCREENS, "view");
    // Roster / eligibility views list every employee — HR Operations only.
    if (requestedView === "master" || requestedView === "eligibility") {
      access.requireScreen(a, "employeeMaster", "view");
    }
    requireInScope(a, requestedEmpIds);
  });

  let currentUser = null;
  let hrUser = false;

  if (!enforced) {
    try {
      currentUser = await appInstance.userManagement().getCurrentUser();
    } catch (error) {
      console.warn("Unable to resolve current Catalyst user for role filtering:", error?.message);
    }

    if (!currentUser || !currentUser.user_id) {
      return sendJson(res, 401, {
        success: false,
        message: "Authentication is required.",
      });
    }

    hrUser = isHRUser(currentUser);
  } else {
    hrUser = Boolean(a.scope && a.scope.all);
  }

  const requestedPage = getPositiveInteger(params.page, 1);

  const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

  const limit = Math.min(requestedLimit, MAX_LIMIT);

  const search = String(params.search || "").trim();

  const status = String(params.status || "")
    .trim()
    .toLowerCase();

  const eligibleParam = String(params.eligible || "")
    .trim()
    .toLowerCase();

  const view = String(params.view || "")
    .trim()
    .toLowerCase();

  /* ==========================================================
     LOAD EMPLOYEES
     ========================================================== */

  const appraisalRows = await getAllEmployees(datastore);

  /* ==========================================================
     LOAD EMPLOYEE MASTER
     ========================================================== */

  const employeeMasterRows = await getAllEmployeeMaster(datastore);

  const employeeMasterMap = buildEmployeeMasterMap(employeeMasterRows);

  // Join the current Appraisal_Sheet schema with Employee_Master so the
  // frontend receives one dynamic, consistent employee object.
  const allEmployees = mergeEmployeeMasterIntoAppraisal(
    appraisalRows,
    employeeMasterMap,
  );

  /* ==========================================================
     DOJ SOURCE
     
     Employees.joining_date is the source of truth.
     ========================================================== */

  allEmployees.forEach(function (employee) {
    employee.date_of_join =
      employee.Joining_date || employee.joining_date || "";
  });

  /* ==========================================================
     COUNTS
     ========================================================== */

  /* ==========================================================
     FILTER
     ========================================================== */

  /*
   * Scope by the signed-in user's access first.
   * HR sees all employees; non-HR users see only their assigned employees.
   * Counts must use this same scoped set so the dashboard reflects the
   * current user's visible Employee Master records, not the whole table.
   */
  // Enforced: access scope (Delegation of the Active cycle) + hidden columns
  // removed BEFORE counting / searching / paginating.
  const scopedEmployees = enforced
    ? allEmployees
        .filter(function (employee) {
          return access.inScope(a, employee);
        })
        .map(function (employee) {
          return shapeEmployee(a, employee);
        })
    : hrUser
      ? allEmployees
      : allEmployees.filter(function (employee) {
          return employeeBelongsToCurrentUser(employee, currentUser);
        });

  const scopedTotalCount = scopedEmployees.length;
  const scopedActiveCount = scopedEmployees.filter(function (employee) {
    return String(employee.status || "").trim().toLowerCase() === "active";
  }).length;
  const scopedInactiveCount = scopedEmployees.filter(function (employee) {
    return String(employee.status || "").trim().toLowerCase() === "inactive";
  }).length;

  const filteredEmployees = filterEmployees(
    scopedEmployees,
    employeeMasterMap,
    search,
    status === "all" ? "" : status,
    eligibleParam === "all" ? "" : eligibleParam,
    hrUser ? "master" : view,
  );

  const userScopedEmployees = filteredEmployees;

  const filteredCount = userScopedEmployees.length;

  /* ==========================================================
     PAGINATION
     ========================================================== */

  const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / limit);

  const safePage = Math.min(requestedPage, totalPages);

  const offset = (safePage - 1) * limit;

  const data = userScopedEmployees
    .slice(offset, offset + limit)
    .map(function (employee) {
      const normalized = normalizeEmployeeResponse(employee);
      return enforced ? shapeEmployee(a, normalized) : normalized;
    });

  /* ==========================================================
     RESPONSE
     ========================================================== */

  return sendJson(res, 200, {
    success: true,

    data: data,

    pagination: {
      page: safePage,
      limit: limit,
      totalCount: filteredCount,
      totalPages: totalPages,
      returnedCount: data.length,
    },

    counts: {
      total: scopedTotalCount,
      active: scopedActiveCount,
      inactive: scopedInactiveCount,
    },

    filters: {
      search: search,
      status: status || "all",
      eligible: eligibleParam || "all",
      view: view || "appraisal",
    },
  });
}

/* ============================================================
   CREATE / IMPORT EMPLOYEES
   ============================================================ */

async function createEmployees(req, res) {
  const appInstance = catalyst.initialize(req);

  const datastore = appInstance.datastore();

  const body = req.body || {};

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

  const table = datastore.table(EMPLOYEES_TABLE_ID);
  const masterTable = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

  const [existingRows, masterRows] = await Promise.all([
    table.getAllRows(),
    masterTable.getAllRows(),
  ]);
  const masterByEmpId = new Map();
  (masterRows || []).forEach(function (row) {
    const key = String(row.emp_id || "").trim().toLowerCase();
    const rowId = row.ROWID || row.rowid;
    if (key && rowId) masterByEmpId.set(key, String(rowId));
  });

  const existingByEmpId = new Map();

  (existingRows || []).forEach(function (row) {
    const key = String(row.emp_id || "")
      .trim()
      .toLowerCase();

    if (key) {
      existingByEmpId.set(key, row);
    }
  });

  const rowsToInsert = [];
  const rowsToUpdate = [];
  const skipped = [];

  incoming.forEach(function (item) {
    const record = item || {};

    const empId = String(record.emp_id || record.empId || "").trim();

    if (!empId) {
      skipped.push({
        emp_id: "",
        reason: "emp_id is missing.",
      });

      return;
    }

    const data = pickAllowedFields(record);
    const masterRowId = masterByEmpId.get(empId.toLowerCase());
    if (masterRowId) data.emp_master_row_id = masterRowId;

    if (data.status !== undefined) {
      const normalizedStatus = normalizeStatus(data.status);

      if (normalizedStatus) {
        data.status = normalizedStatus;
      }
    }

    const existing = existingByEmpId.get(empId.toLowerCase());

    if (existing) {
      const rowId = existing.ROWID || existing.rowid;

      if (!rowId) {
        skipped.push({
          emp_id: empId,
          reason: "Existing row has no ROWID.",
        });

        return;
      }

      rowsToUpdate.push({
        ROWID: rowId,
        ...data,
      });

      return;
    }

    rowsToInsert.push({
      emp_id: empId,
      status: data.status || "Active",
      ...data,
    });
  });

  /* ==========================================================
     ACCESS (checked before anything is written)
     - only appraisal input columns of existing employees
       → importAppraisal + appraisalSheet edit + rows in scope
         + every column editable;
     - roster / master columns or new employees → employeeMaster edit.
     ========================================================== */

  const a = req.access;
  const touchedColumns = new Set();
  const touchedEmpIds = [];

  incoming.forEach(function (item) {
    const record = item || {};
    const empId = String(record.emp_id || record.empId || "").trim();
    if (!empId) return;
    touchedEmpIds.push(empId);
    Object.keys(pickAllowedFields(record)).forEach(function (column) {
      touchedColumns.add(column);
    });
  });

  const columns = Array.from(touchedColumns);
  const masterImport =
    rowsToInsert.length > 0 || columns.some(isMasterColumn);

  access.guard(a, function () {
    if (masterImport) {
      access.requireScreen(a, "employeeMaster", "edit");
      return;
    }
    access.requireAction(a, "importAppraisal");
    access.requireScreen(a, "appraisalSheet", "edit");
    requireInScope(a, touchedEmpIds);
    requireEditableColumns(a, columns);
  });

  let insertedRows = [];

  if (rowsToInsert.length) {
    insertedRows = await table.insertRows(rowsToInsert);
  }

  let updatedRows = [];

  if (rowsToUpdate.length) {
    updatedRows = await table.updateRows(rowsToUpdate);
  }

  if (
    rowsToInsert.length ||
    columns.some(function (column) {
      return HIERARCHY_COLUMNS.has(column);
    })
  ) {
    await bumpAccessVersion(req, a, "employeesapi import changed the roster");
  }

  return sendJson(res, 200, {
    success: true,

    message:
      "Employee import completed. " +
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
    },
  });
}

/* ============================================================
   UPDATE EMPLOYEE
   ============================================================ */

async function updateEmployee(req, res) {
  const appInstance = catalyst.initialize(req);
  const datastore = appInstance.datastore();
  const body = req.body || {};

  const empId = String(body.emp_id || body.empId || "").trim();
  if (!empId) {
    return sendJson(res, 400, { success: false, message: "emp_id is required." });
  }

  const a = req.access;
  const changedColumns = Object.keys(pickAllowedFields(body));

  access.guard(a, function () {
    requireAnyScreen(a, EDIT_SCREENS, "edit");
    requireInScope(a, [empId]);
    requireEditableColumns(a, changedColumns);
  });

  const appraisalTable = datastore.table(EMPLOYEES_TABLE_ID);
  const masterTable = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

  const [appraisalRows, masterRows] = await Promise.all([
    appraisalTable.getAllRows(),
    masterTable.getAllRows(),
  ]);

  const appraisalRow = (appraisalRows || []).find(function (row) {
    return String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase();
  });
  const masterRow = (masterRows || []).find(function (row) {
    return String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase();
  });

  if (!appraisalRow) {
    return sendJson(res, 404, { success: false, message: "Appraisal record " + empId + " not found." });
  }
  if (!masterRow) {
    return sendJson(res, 404, { success: false, message: "Employee Master record " + empId + " not found." });
  }

  const masterFieldMap = {
    name: "emp_name",
    designation: "designation",
    reporting_manager: "repo_manager",
    appraiser_tech_ed: "appraiser_tech_ed",
    department: "department",
    wissen_experience: "wissen_experience",
    total_experience: "total_experience",
    joining_date: "date_of_join",
  };

  const appraisalFieldMap = {
    current_annual_base_pay: "base_pay",
    target_pb_allocated_for_may: "allocated_pb",
    allocated_pb_amount: "allocated_pb",
    pb_installment: "allocated_pb_installment",
    pb_to_be_paid: "performance_bonus",
    new_pb_to_be_offered: "performance_bonus",
    new_pb_installment: "performance_bonus_installment",
    new_rb: "retention_bonus",
    hike_amount: "hike_amount",
    hike_pct: "hike_pct",
    target_pb_next_year: "target_performance_bonus",
    eligible_for_promotion: "promotion",
    new_title: "title",
    manager_rating: "manager_rating",
    rating: "rating",
  };

  const masterUpdate = { ROWID: masterRow.ROWID };
  const appraisalUpdate = { ROWID: appraisalRow.ROWID };

  changedColumns.forEach(function (column) {
    const value = body[column];

    if (column === "status") {
      const normalizedStatus = normalizeStatus(value);
      if (!normalizedStatus) {
        throw new access.HttpError(400, 'status must be either "Active" or "Inactive".');
      }
      masterUpdate.emp_status = normalizedStatus;
      return;
    }

    const masterColumn = masterFieldMap[column];
    if (masterColumn) {
      masterUpdate[masterColumn] = value;
      return;
    }

    const appraisalColumn = appraisalFieldMap[column];
    if (appraisalColumn) {
      appraisalUpdate[appraisalColumn] = value;
    }
  });

  const masterChanged = Object.keys(masterUpdate).length > 1;
  const appraisalChanged = Object.keys(appraisalUpdate).length > 1;

  if (!masterChanged && !appraisalChanged) {
    return sendJson(res, 400, {
      success: false,
      message: "No fields from the current Data Store schema can be updated.",
    });
  }

  let updatedMaster = masterRow;
  let updatedAppraisal = appraisalRow;

  if (masterChanged) {
    updatedMaster = await masterTable.updateRow(masterUpdate);
  }

  if (appraisalChanged) {
    updatedAppraisal = await appraisalTable.updateRow(appraisalUpdate);
  }

  const merged = mergeEmployeeMasterIntoAppraisal(
    [updatedAppraisal],
    new Map([[empId.toLowerCase(), updatedMaster]]),
  )[0];

  if (changedColumns.some(function (column) {
    return HIERARCHY_COLUMNS.has(column) || column === "status";
  })) {
    await bumpAccessVersion(req, a, "Employee hierarchy/status changed: " + empId);
  }

  return sendJson(res, 200, {
    success: true,
    message: "Employee updated successfully.",
    data: a && a.enforced ? shapeEmployee(a, merged) : merged,
  });
}

/* ============================================================
   GET
   ============================================================ */

app.get("/", async function (req, res) {
  try {
    await getEmployees(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi GET ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   POST
   ============================================================ */

app.post("/", async function (req, res) {
  try {
    await createEmployees(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi POST ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   PUT
   ============================================================ */

app.put("/", async function (req, res) {
  try {
    await updateEmployee(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi PUT ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   PATCH
   ============================================================ */

app.patch("/", async function (req, res) {
  try {
    await updateEmployee(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi PATCH ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   METHOD NOT ALLOWED
   ============================================================ */

app.use(function (req, res) {
  return sendJson(res, 405, {
    success: false,
    message: "Method " + req.method + " not allowed.",
  });
});

/* ============================================================
   CATALYST ADVANCED I/O ENTRY
   ============================================================ */

module.exports = function (req, res) {
  app(req, res);
};
