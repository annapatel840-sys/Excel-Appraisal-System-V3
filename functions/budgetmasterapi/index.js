"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const TABLE_ID = "Budget_Master";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

function value(row, key) {
  if (row && row[key] !== undefined && row[key] !== null) return row[key];
  return "";
}

function mapRow(row) {
  var budget = Number(value(row, "budget_amount")) || 0;
  var additional = Number(value(row, "additional_budget")) || 0;
  var updated = budget + additional;
  var utilized = Number(value(row, "budget_utilized")) || 0;
  var remaining = value(row, "budget_remaining");

  return {
    id: String(value(row, "ROWID") || value(row, "rowid")),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
    tech_ed_id: String(value(row, "tech_ed_id")),
    budget_percentage: Number(value(row, "budget_percentage")) || 0,
    budget_amount: budget,
    additional_budget: additional,
    budget_utilized: utilized,
    budget_remaining:
      remaining === "" ? updated - utilized : Number(remaining) || 0,
    status: String(value(row, "status")),
    updated_budget: updated,
  };
}

function getUserField(user, key) {
  if (user && user[key] !== undefined && user[key] !== null) {
    return String(user[key]).trim();
  }
  return "";
}

function getCurrentUserName(user) {
  var first = getUserField(user, "first_name");
  var last = getUserField(user, "last_name");
  var full = (first + " " + last).trim();

  return (
    getUserField(user, "display_name") ||
    getUserField(user, "name") ||
    full ||
    getUserField(user, "email") ||
    getUserField(user, "email_id")
  );
}

function getUserRole(user) {
  var role = "";

  if (user && user.role_details) {
    role = user.role_details.role_name || "";
  }

  if (!role && user) role = user.role_name || "";
  if (!role && user) role = user.role || "";

  return String(role).trim().toLowerCase();
}

function isHR(user) {
  var role = getUserRole(user);
  return role === "hr" || role.indexOf("hr") !== -1;
}

function getUserValues(user) {
  var values = [];
  var keys = [
    "user_id",
    "email",
    "email_id",
    "display_name",
    "name",
  ];

  keys.forEach(function (key) {
    var v = getUserField(user, key).toLowerCase();
    if (v) values.push(v);
  });

  var full = (
    getUserField(user, "first_name") +
    " " +
    getUserField(user, "last_name")
  ).trim().toLowerCase();

  if (full) values.push(full);

  return values;
}

function matchesUser(techEdId, user) {
  var owner = String(techEdId || "").trim().toLowerCase();
  if (!owner) return false;

  var values = getUserValues(user);

  for (var i = 0; i < values.length; i += 1) {
    if (
      owner === values[i] ||
      owner.indexOf(values[i]) !== -1 ||
      values[i].indexOf(owner) !== -1
    ) {
      return true;
    }
  }

  return false;
}

async function getCurrentUser(app) {
  var user = await app.userManagement().getCurrentUser();
  if (user && user.user_id) return user;
  return null;
}

function parseJson(text) {
  if (!String(text || "").trim()) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

/* A raw Advanced I/O handler has no body parser: req.body is undefined, so
   read and JSON-parse the request stream (this used to make every PUT 400). */
function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);

  if (typeof req.body === "string") return Promise.resolve(parseJson(req.body));

  if (typeof req.on !== "function" || req.readableEnded) return Promise.resolve({});

  return new Promise(function (resolve, reject) {
    var text = "";
    req.on("data", function (chunk) {
      text += chunk.toString();
    });
    req.on("end", function () {
      resolve(parseJson(text));
    });
    req.on("error", reject);
  });
}

/* ============================================================
   ACCESS CONTROL (docs/ACCESS_SPEC.md)

   GET → view on budgetAllocation or budgetDistribution; enforced: users
         without scope.all only get their own Tech ED rows (strict match of
         tech_ed_id to their emp_id, "EMPxxxx - Name" or email).
   PUT → edit on budgetAllocation or budgetDistribution, own row (unless
         scope.all); config fields → action changeBudgetConfig;
         budget_utilized (budget allotted onward) → action allotNextLevel.
   Dry run (ACCESS_ENFORCE != 'true'): legacy behaviour (GET open, PUT
   HR-only by role name); refusals only logged.
   ============================================================ */

var BUDGET_SCREENS = ["budgetAllocation", "budgetDistribution"];
var CONFIG_FIELDS = ["budget_percentage", "budget_amount", "additional_budget", "status"];
var ALLOT_FIELDS = ["budget_utilized"];

async function checkAccess(req) {
  var userApp = catalyst.initialize(req);
  var adminApp = catalyst.initialize(req, { scope: "admin" });

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
  var ok = keys.some(function (key) {
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

/* Strict owner match: tech_ed_id equals the user's emp_id or email, or is
   "EMPxxxx - Name" whose id part equals the emp_id (case-insensitive). */
function isOwnBudgetRow(a, row) {
  var owner = String(value(row, "tech_ed_id")).trim().toLowerCase();
  if (!owner || !a || !a.user) return false;

  var empId = String(a.user.empId || "").trim().toLowerCase();
  var email = String(a.user.email || "").trim().toLowerCase();
  var parts = owner.match(/^(\S+)\s*-\s*(.+)$/);
  var ownerId = parts ? parts[1] : owner;

  return Boolean((empId && ownerId === empId) || (email && owner === email));
}

async function getAllBudgetRows(table) {
  var rows = [];
  var nextToken = null;

  for (var guard = 0; guard < 1000; guard += 1) {
    var options = { maxRows: 200 };
    if (nextToken) options.nextToken = nextToken;
    var page = await table.getPagedRows(options);
    rows = rows.concat(page && Array.isArray(page.data) ? page.data : []);
    nextToken = page && page.next_token ? page.next_token : null;
    if (!(page && page.more_records === true && nextToken)) break;
  }

  return rows;
}

function sendAccessError(res, error) {
  return sendJson(res, error.status || 403, {
    success: false,
    message: error.message,
    enforced: true,
  });
}

module.exports = async function (req, res) {
  try {
    var method = String(req.method || "GET").toUpperCase();

    if (method === "OPTIONS") {
      return sendJson(res, 204, {});
    }

    // Enforced → 401/403 (via catch); dry run → never refuses.
    var a = await checkAccess(req);
    var enforced = Boolean(a && a.enforced);

    var app = catalyst.initialize(req);

    if (method === "GET") {
      access.guard(a, function () {
        requireAnyScreen(a, BUDGET_SCREENS, "view");
      });

      var table = app.datastore().table(TABLE_ID);

      if (enforced && !(a.scope && a.scope.all)) {
        // Own rows only — read every page so the row is found wherever it is.
        var ownRows = (await getAllBudgetRows(table)).filter(function (row) {
          return isOwnBudgetRow(a, row);
        });

        return sendJson(res, 200, {
          success: true,
          data: ownRows.map(mapRow),
          current_user: null,
          more_records: false,
          next_token: null,
        });
      }

      var result = await table.getPagedRows({
        maxRows: 100,
      });

      var rows = result && Array.isArray(result.data) ? result.data : [];

      return sendJson(res, 200, {
        success: true,
        data: rows.map(mapRow),
        current_user: null,
        more_records: result && result.more_records === true,
        next_token: result && result.next_token ? result.next_token : null,
      });
    }

    if (method === "PUT") {
      access.guard(a, function () {
        requireAnyScreen(a, BUDGET_SCREENS, "edit");
      });

      var putUser = null;

      if (!enforced) {
        putUser = await getCurrentUser(app);

        if (!putUser) {
          return sendJson(res, 401, {
            success: false,
            message: "Authentication is required.",
          });
        }

        if (!isHR(putUser)) {
          return sendJson(res, 403, {
            success: false,
            message: "Only HR can update Budget Master.",
          });
        }
      }

      var body = await parseBody(req);
      var id = String(body.id || "").trim();

      if (!id) {
        return sendJson(res, 400, {
          success: false,
          message: "Budget Master row id is required.",
        });
      }

      var allowed = [
        "budget_percentage",
        "budget_amount",
        "additional_budget",
        "budget_utilized",
        "status",
      ];

      var update = { ROWID: id };

      allowed.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          update[key] = body[key];
        }
      });

      if (Object.keys(update).length === 1) {
        return sendJson(res, 400, {
          success: false,
          message: "No Budget Master fields were provided.",
        });
      }

      var putTable = app.datastore().table(TABLE_ID);
      var changed = Object.keys(update).filter(function (key) {
        return key !== "ROWID";
      });

      if (enforced) {
        if (!(a.scope && a.scope.all)) {
          var current = (await getAllBudgetRows(putTable)).find(function (row) {
            return String(value(row, "ROWID") || value(row, "rowid")) === id;
          });
          if (!current || !isOwnBudgetRow(a, current)) {
            throw new access.HttpError(403, "You can only update your own budget.");
          }
        }
      }

      access.guard(a, function () {
        if (changed.some(function (key) { return CONFIG_FIELDS.indexOf(key) !== -1; })) {
          access.requireAction(a, "changeBudgetConfig");
        }
        if (changed.some(function (key) { return ALLOT_FIELDS.indexOf(key) !== -1; })) {
          access.requireAction(a, "allotNextLevel");
        }
      });

      var updated = await putTable.updateRow(update);

      return sendJson(res, 200, {
        success: true,
        data: mapRow(updated),
        changed_by: enforced
          ? a.user.email
          : getUserField(putUser, "email") ||
            getUserField(putUser, "email_id") ||
            getUserField(putUser, "user_id"),
      });
    }

    return sendJson(res, 405, {
      success: false,
      message: "Method not allowed",
    });
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("budgetmasterapi:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Budget Master API failed.",
    });
  }
};
