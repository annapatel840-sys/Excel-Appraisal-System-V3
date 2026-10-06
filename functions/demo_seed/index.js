"use strict";

const catalyst = require("zcatalyst-sdk-node");
const accessCore = require("./accessCore");

const TABLES = {
  audit: "74008000000034940",
  cycle: "74008000000034190",
  budget: "74008000000034565",
  employeeMaster: "74008000000035727",
  appraisal: "74008000000039094",
  payroll: "74008000000035326",
  delegation: "74008000000036124",
};

const HR = "EMP001 - Prabhuprasad Parida";
const TECH_ED = ["EMP002 - Ashok Kumar", "EMP003 - Sarmistha Acharya"];

const YEARS = ["Apr-24", "Apr-25", "Apr-26"];
const CURRENT_YEAR = "Apr-26";
const PREVIOUS_YEAR = "Apr-25";

// Joining bonus is a ONE-TIME payment, recorded only in the first cycle (Apr-24).
const JOINING_BONUS_YEAR = "Apr-24";
const JOINING_BONUS_DEFAULT = 25000; // used only when no value is stored yet

// PB Installment dropdown options in the app are "1", "2", "4".
const installmentLabel = (n) => String(n);

// Read-only sheet columns: always corrected by the seed (your manual edits are never touched,
// because editable columns are only filled when blank/0, unless ?force=true).
const APPRAISAL_ALWAYS_SYNC = new Set([
  "joining_bonus",
  "rb_to_be_paid",
  "pb_to_be_paid",
  "manager_rating",
  "current_annual_base_pay",
  "target_pb_allocated_for_may",
  "last_appraisal_date",
]);

// ============================================================
// COMPENSATION MODEL (how a company runs an appraisal cycle)
//
//  1. Manager rating decides everything:
//       Exceeds Expectation          -> merit hike 12-15%, PB payout 120% of target
//       Meets Expectation            -> merit hike  8-11%, PB payout 100% of target
//       Sometimes Meets Expectation  -> merit hike  4-7%,  PB payout  70% of target
//     A promotion adds +3 points to the hike (promotion increment).
//
//  2. Fixed pay
//       Hike Amount   = Base Pay x Hike %
//       New Base Pay  = Base Pay + Hike Amount         (next year's base)
//       Total CTC     = Base Pay + Hike Amount         (fixed pay)
//
//  3. Variable pay
//       Target PB (cycle)  = 10% of Base Pay
//       Total PB           = Target PB x payout factor
//       Allocated PB       = 60% of Target PB (already allocated)
//       New PB to offer    = Total PB - Allocated PB
//       Retention Bonus    = 1.5% of Base Pay
//       Total Bonus        = Total PB + Retention Bonus      (joining bonus excluded)
//       Target PB next yr  = 10% of New Base Pay
//
//  4. Total Rewards = Total CTC + Total Bonus + Joining Bonus
//
//  5. Chain between years (exact):
//       Apr-24 base + Apr-24 hike = Apr-25 base
//       Apr-25 base + Apr-25 hike = Apr-26 base (= Employee_Master.current_salary)
//     "RB / PB to be paid" in the Apr-26 sheet = the Apr-25 Retention Bonus / Total PB,
//     so Bonus Hike % and Total Rewards Hike % in the sheet equal the % change in History.
// ============================================================

const ratingLabel = (r) =>
  r >= 4.4
    ? "Exceeds Expectation"
    : r >= 3.6
      ? "Meets Expectation"
      : "Sometimes Meets Expectation";

const PAYOUT_FACTOR = {
  "Exceeds Expectation": 1.2,
  "Meets Expectation": 1.0,
  "Sometimes Meets Expectation": 0.7,
};

const meritPct = (label, index, promoted) => {
  const spread = index % 4;
  const base =
    label === "Exceeds Expectation"
      ? 12 + spread
      : label === "Meets Expectation"
        ? 8 + spread
        : 4 + spread;
  return base + (promoted ? 3 : 0);
};

// Titles must exist in the app's NEW_TITLES dropdown:
// Associate, Senior Associate, Senior Analyst, Team Lead, Manager,
// Senior Manager, Program Executive, Specialist
const promotionTitle = (designation) => {
  const d = String(designation || "").toLowerCase();
  let title = "Senior Associate";
  if (d.includes("senior manager")) title = "Senior Manager";
  else if (d.includes("manager")) title = "Senior Manager";
  else if (d.includes("lead")) title = "Manager";
  else if (d.includes("senior")) title = "Team Lead";
  else if (d.includes("analyst")) title = "Senior Analyst";
  else if (d.includes("associate")) title = "Senior Associate";
  return title;
};

// ============================================================
// generic helpers
// ============================================================

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function allRows(table) {
  const rows = [];
  let nextToken = null;
  for (;;) {
    const options = { maxRows: 200 };
    if (nextToken) options.nextToken = nextToken;
    const page = await table.getPagedRows(options);
    rows.push(...(Array.isArray(page.data) ? page.data : []));
    if (!page.more_records || !page.next_token) break;
    nextToken = page.next_token;
  }
  return rows;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function insertInBatches(table, rows) {
  for (const part of chunk(rows, 100)) await table.insertRows(part);
}

async function updateInBatches(table, rows) {
  for (const part of chunk(rows, 100)) await table.updateRows(part);
}

async function insertMissing(table, rows, keyFn, existingRows, dry) {
  const existing = new Set((existingRows || []).map(keyFn).filter(Boolean));
  const missing = rows.filter((row) => {
    const key = keyFn(row);
    return key && !existing.has(key);
  });
  if (!missing.length) return 0;
  if (!dry) await insertInBatches(table, missing);
  return missing.length;
}

const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

function same(a, b) {
  if (isBlank(a) && isBlank(b)) return true;
  const na = Number(a);
  const nb = Number(b);
  if (
    !isBlank(a) &&
    !isBlank(b) &&
    Number.isFinite(na) &&
    Number.isFinite(nb)
  ) {
    return Math.abs(na - nb) < 0.005;
  }
  return String(a ?? "").trim() === String(b ?? "").trim();
}

// "missing" = blank, or 0 while the target is a non-zero number
function isMissing(current, target) {
  if (isBlank(current)) return true;
  return typeof target === "number" && target !== 0 && Number(current) === 0;
}

function buildPatch(existing, target, { force, alwaysSync }) {
  const patch = {};
  Object.keys(target).forEach((key) => {
    const want = target[key];
    const have = existing[key];
    if (same(have, want)) return;
    if (force || (alwaysSync && alwaysSync.has(key)) || isMissing(have, want)) {
      patch[key] = want;
    }
  });
  return Object.keys(patch).length ? patch : null;
}

async function syncTable(table, targetRows, keyFn, existingRows, opts) {
  const byKey = new Map();
  (existingRows || []).forEach((row) => {
    const key = keyFn(row);
    if (key && !byKey.has(key)) byKey.set(key, row);
  });

  const updates = [];
  const inserts = [];

  targetRows.forEach((target) => {
    const key = keyFn(target);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      inserts.push(target);
      return;
    }
    const patch = buildPatch(existing, target, opts);
    if (patch) updates.push({ ROWID: existing.ROWID, ...patch });
  });

  if (!opts.dry) {
    if (updates.length) await updateInBatches(table, updates);
    if (inserts.length) await insertInBatches(table, inserts);
  }

  return { updated: updates.length, inserted: inserts.length };
}

function normalizeEmpId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function resolveMasterPerson(employees, value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  return (
    employees.find((e) => {
      const id = String(e.emp_id || "")
        .trim()
        .toLowerCase();
      const name = String(e.emp_name || "")
        .trim()
        .toLowerCase();
      return (
        raw === id ||
        raw === name ||
        raw.includes(id) ||
        (name && raw.includes(name))
      );
    }) || null
  );
}

function safeDate(value, fallback) {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

// ============================================================
// PAYROLL / HISTORY ROWS (3 cycles per employee)
// ============================================================

function buildHistoryRows(employees, existingPayroll = []) {
  // keep any Apr-24 joining bonus already stored in the table
  const existingJoining = new Map();
  existingPayroll.forEach((r) => {
    if (String(r.appraisal_year || "").trim() === JOINING_BONUS_YEAR) {
      const v = Number(r.joining_bonus) || 0;
      if (v > 0) existingJoining.set(normalizeEmpId(r.emp_id), v);
    }
  });

  return employees.flatMap((e, index) => {
    // Apr-26 base = Employee_Master.current_salary
    const currentBase = Math.max(
      600000,
      Math.round(Number(e.current_salary || 0) / 10000) * 10000 ||
        600000 + (index % 10) * 50000,
    );

    // rating per cycle (3.2 .. 4.6)
    const ratings = YEARS.map((_, yearIndex) =>
      Number((3.2 + ((index + yearIndex) % 8) * 0.2).toFixed(1)),
    );
    const labels = ratings.map(ratingLabel);

    const promoted = index % 7 === 0; // promotion recommended in the current cycle
    const designation = String(e.designation || "Consultant").trim();
    const newTitle = promoted ? promotionTitle(designation) : designation;

    const pct = [
      meritPct(labels[0], index, false), // Apr-24
      meritPct(labels[1], index, false), // Apr-25
      meritPct(labels[2], index, promoted), // Apr-26
    ];

    // base / hike chain (exact): base24 + hike24 = base25, base25 + hike25 = base26
    const base25 = Math.round(currentBase / (1 + pct[1] / 100));
    const base24 = Math.round(base25 / (1 + pct[0] / 100));

    const bases = { "Apr-24": base24, "Apr-25": base25, "Apr-26": currentBase };
    const hikes = {
      "Apr-24": base25 - base24,
      "Apr-25": currentBase - base25,
      "Apr-26": Math.round((currentBase * pct[2]) / 100),
    };

    return YEARS.map((year, yearIndex) => {
      const basePay = bases[year];
      const hikeAmount = hikes[year];
      const hikePct =
        year === CURRENT_YEAR
          ? pct[2]
          : Number(((hikeAmount / basePay) * 100).toFixed(2));
      const label = labels[yearIndex];

      // variable pay
      const targetPB = Math.round(basePay * 0.1);
      const totalPB = Math.round(targetPB * PAYOUT_FACTOR[label]);
      const allocatedPB = Math.round(targetPB * 0.6);
      const retentionBonus = Math.round(basePay * 0.015);
      const joiningBonus =
        year === JOINING_BONUS_YEAR
          ? existingJoining.get(normalizeEmpId(e.emp_id)) ||
            JOINING_BONUS_DEFAULT
          : 0;

      const totalBonus = totalPB + retentionBonus; // joining bonus excluded
      const newBasePay = basePay + hikeAmount;
      const targetPBNextYear = Math.round(newBasePay * 0.1);

      const isPromo = year === CURRENT_YEAR && promoted;

      return {
        emp_id: String(e.emp_id || "").trim(),
        appraisal_year: year,
        base_pay: basePay,
        allocated_pb: allocatedPB,
        allocated_pb_installment: year === "Apr-24" ? 1 : 2,
        performance_bonus: totalPB,
        performance_bonus_installment: year === "Apr-24" ? 1 : 2,
        retention_bonus: retentionBonus,
        total_pb: totalPB,
        joining_bonus: joiningBonus,
        total_bonus: totalBonus,
        hike_amount: hikeAmount,
        hike_pct: hikePct,
        promotion: isPromo ? "Yes" : "No",
        title: isPromo ? newTitle : designation,
        target_performance_bonus: targetPBNextYear,
        new_ctc: newBasePay, // Total CTC = Base + Hike (rewards are added in the UI)
        manager_rating: label,
        rating: ratings[yearIndex],
      };
    });
  });
}

// ============================================================
// APPRAISAL SHEET ROWS (current cycle, Apr-26)
// ============================================================

function buildAppraisalRows(employees, historyRows) {
  const byKey = new Map(
    historyRows.map((r) => [
      normalizeEmpId(r.emp_id) + "|" + r.appraisal_year,
      r,
    ]),
  );
  const currentRows = historyRows.filter(
    (r) => r.appraisal_year === CURRENT_YEAR,
  );

  return currentRows.map((h, index) => {
    const e =
      employees.find(
        (emp) => normalizeEmpId(emp.emp_id) === normalizeEmpId(h.emp_id),
      ) || {};
    const p = byKey.get(normalizeEmpId(h.emp_id) + "|" + PREVIOUS_YEAR) || {};

    const reportingManager = resolveMasterPerson(employees, e.repo_manager);
    const compManager = resolveMasterPerson(employees, e.director);
    const techEd = resolveMasterPerson(employees, e.appraiser_tech_ed);
    const promotion = h.promotion === "Yes";
    const nameOf = (person, fallback) =>
      person
        ? String(person.emp_name || "").trim()
        : String(fallback || "").trim();

    return {
      emp_id: String(e.emp_id || "").trim(),
      name: String(e.emp_name || "").trim(),
      designation: String(e.designation || "Consultant").trim(),
      reporting_manager: nameOf(reportingManager, e.repo_manager),
      comp_manager: nameOf(compManager, e.director),
      appraiser_tech_ed: nameOf(techEd, e.appraiser_tech_ed),
      department: String(e.department || "").trim(),
      manager: nameOf(reportingManager, e.repo_manager),
      status: String(e.emp_status || "Active").trim(),
      wissen_experience: Number(e.wissen_experience || 0),
      total_experience: Number(e.total_experience || 0),
      last_appraisal_date: "2025-04-01", // previous completed cycle
      manager_rating: h.manager_rating,
      interview_count: (index % 4) + 1,
      rr_percent: Number((72 + (index % 6) * 2.5).toFixed(2)),
      gross_margin: Math.round(22 + (index % 5) * 3),

      // rewards being paid now = what was awarded in the previous cycle
      rb_to_be_paid: Number(p.retention_bonus) || 0,
      month_rb: "Apr-26",
      pb_to_be_paid: Number(p.performance_bonus) || 0,
      month_pb: "Apr-26",

      current_annual_base_pay: h.base_pay,
      // this cycle's PB target = last cycle's "target PB next year"
      target_pb_allocated_for_may:
        Number(p.target_performance_bonus) || Math.round(h.base_pay * 0.1),
      allocated_pb_amount: h.allocated_pb,
      pb_installment: installmentLabel(h.allocated_pb_installment),
      new_pb_to_be_offered: h.performance_bonus - h.allocated_pb,
      new_pb_installment: installmentLabel(h.performance_bonus_installment),
      new_rb: h.retention_bonus,
      hike_amount: h.hike_amount,
      hike_pct: h.hike_pct,
      target_pb_next_year: h.target_performance_bonus,
      eligible_for_promotion: promotion ? "Yes" : "No",
      new_title: promotion ? h.title : "",
      at_risk:
        h.manager_rating === "Sometimes Meets Expectation"
          ? "Performance improvement plan under review."
          : "",
      joining_date: safeDate(e.date_of_join, "2021-01-15"),
      manager_email_id: reportingManager
        ? String(reportingManager.email_id || "").trim()
        : "",
      super_man_email_id: compManager
        ? String(compManager.email_id || "").trim()
        : "",
      rating: h.rating,
      eligible_status:
        String(e.emp_status || "").toLowerCase() === "active"
          ? "eligible"
          : "not eligible",
      joining_bonus: 0, // one-time Apr-24 payment, never in the current cycle
      emp_master_row_id: e.ROWID,
    };
  });
}

function buildAuditRows(employees) {
  return employees.slice(0, 20).map((e, index) => ({
    emp_id: e.emp_id,
    employee_name: e.emp_name,
    field_name: index % 2 === 0 ? "hike_amount" : "eligible_for_promotion",
    old_value: index % 2 === 0 ? "0" : "No",
    new_value: index % 2 === 0 ? String(25000 + index * 1000) : "Yes",
    changed_by: HR,
    changed_at:
      "2026-04-" + String((index % 20) + 1).padStart(2, "0") + " 10:30:00",
    source: "demo_seed",
    batch_id: "DEMO-APR26",
    appraisal_year: CURRENT_YEAR,
  }));
}

async function ensureCycle(cycleTable, dry) {
  const cycles = await allRows(cycleTable);
  const cycle = cycles.find(
    (r) => String(r.cycle_name || "").trim() === CURRENT_YEAR,
  );
  if (cycle) return cycle;

  const activeExists = cycles.some(
    (r) => String(r.status || "").toLowerCase() === "active",
  );
  const row = {
    cycle_name: CURRENT_YEAR,
    start_date: "2026-04-01",
    end_date: "2027-03-31",
    status: activeExists ? "Upcoming" : "Active",
    remarks: "Demo appraisal cycle for application testing",
    changed_by: HR,
    changed_at: "2026-04-01 09:00:00",
    archived: false,
  };
  if (dry) return { ROWID: "DRY", ...row };
  return cycleTable.insertRow(row);
}

// ============================================================
// SYNC (PUT)    ?dry=true    counts only, writes nothing
//               ?force=true  also overwrite EDITABLE sheet columns
// ============================================================

async function sync(req, res) {
  const userApp = catalyst.initialize(req);

  try {
    await userApp.userManagement().getCurrentUser();
  } catch (error) {
    return send(res, 401, {
      success: false,
      message: "Please sign in as HR before running demo seed.",
    });
  }

  const app = catalyst.initialize(req, { scope: "admin" });
  const ds = app.datastore();

  let access;
  try {
    access = await accessCore.get(userApp, { admin: app });
  } catch (error) {
    return send(res, 403, {
      success: false,
      message: error?.message || "Demo seed is restricted to HR.",
    });
  }
  if (access?.role !== "hr") {
    return send(res, 403, {
      success: false,
      message: "Demo seed is restricted to HR.",
    });
  }

  const url = new URL(req.url || "/", "http://localhost");
  const force = url.searchParams.get("force") === "true";
  const dry = url.searchParams.get("dry") === "true";

  const tables = {
    audit: ds.table(TABLES.audit),
    cycle: ds.table(TABLES.cycle),
    budget: ds.table(TABLES.budget),
    employeeMaster: ds.table(TABLES.employeeMaster),
    appraisal: ds.table(TABLES.appraisal),
    payroll: ds.table(TABLES.payroll),
    delegation: ds.table(TABLES.delegation),
  };

  const employees = (await allRows(tables.employeeMaster))
    .filter((e) => String(e.emp_id || "").trim())
    .sort((a, b) =>
      normalizeEmpId(a.emp_id).localeCompare(normalizeEmpId(b.emp_id)),
    )
    .slice(0, 30);

  if (employees.length !== 30) {
    return send(res, 400, {
      success: false,
      message:
        "Expected 30 Employee Master records, found " +
        employees.length +
        ". Nothing was changed.",
    });
  }

  const cycle = await ensureCycle(tables.cycle, dry);
  const cycleId = String(cycle.ROWID);

  const existingPayroll = await allRows(tables.payroll);
  const historyRows = buildHistoryRows(employees, existingPayroll);

  // Payroll Data (history): always fully synced, it is reference data.
  const payroll = await syncTable(
    tables.payroll,
    historyRows,
    (r) =>
      normalizeEmpId(r.emp_id) + "|" + String(r.appraisal_year || "").trim(),
    existingPayroll,
    { force: true, dry },
  );

  // Appraisal Sheet: read-only columns always corrected, editable ones only when blank/0 (or force).
  const appraisal = await syncTable(
    tables.appraisal,
    buildAppraisalRows(employees, historyRows),
    (r) => normalizeEmpId(r.emp_id),
    await allRows(tables.appraisal),
    { force, alwaysSync: APPRAISAL_ALWAYS_SYNC, dry },
  );

  // Supporting tables: insert only what is missing.
  const hrPerson =
    employees.find((e) => normalizeEmpId(e.emp_id) === "EMP001") ||
    employees[0];
  const techEdPeople = ["EMP002", "EMP003"]
    .map((id) => employees.find((e) => normalizeEmpId(e.emp_id) === id))
    .filter(Boolean);
  const owners =
    techEdPeople.length === 2 ? techEdPeople : employees.slice(1, 3);

  const delegationAdded = await insertMissing(
    tables.delegation,
    employees
      .filter(
        (e) =>
          !["EMP001", "EMP002", "EMP003"].includes(normalizeEmpId(e.emp_id)),
      )
      .map((e, index) => ({
        cycle_id: cycleId,
        emp_id: String(e.emp_id).trim(),
        comp_manager_id: String(hrPerson.emp_id).trim(),
        appraiser_tech_ed_id: String(
          owners[index % owners.length].emp_id,
        ).trim(),
      })),
    (r) => String(r.cycle_id || "") + "|" + normalizeEmpId(r.emp_id),
    await allRows(tables.delegation),
    dry,
  );

  const budgetAdded = await insertMissing(
    tables.budget,
    [
      {
        appraisal_cycle_id: cycleId,
        tech_ed_id: String(owners[0].emp_id).trim(),
        budget_percentage: 50,
        budget_amount: 1000000,
        additional_budget: 50000,
        budget_utilized: 375000,
        budget_remaining: 675000,
        status: "Active",
      },
      {
        appraisal_cycle_id: cycleId,
        tech_ed_id: String(owners[1].emp_id).trim(),
        budget_percentage: 50,
        budget_amount: 1000000,
        additional_budget: 50000,
        budget_utilized: 425000,
        budget_remaining: 625000,
        status: "Active",
      },
    ],
    (r) =>
      String(r.appraisal_cycle_id || "") + "|" + normalizeEmpId(r.tech_ed_id),
    await allRows(tables.budget),
    dry,
  );

  const auditAdded = await insertMissing(
    tables.audit,
    buildAuditRows(employees),
    (r) =>
      String(r.batch_id || "") +
      "|" +
      String(r.emp_id || "") +
      "|" +
      String(r.field_name || ""),
    await allRows(tables.audit),
    dry,
  );

  return send(res, 200, {
    success: true,
    dryRun: dry,
    force,
    message: dry
      ? "Dry run only, nothing was written."
      : "Demo data sync completed.",
    cycle: { id: cycleId, name: cycle.cycle_name, status: cycle.status },
    payrollData: payroll,
    appraisalSheet: appraisal,
    inserted: {
      delegation: delegationAdded,
      budgetMaster: budgetAdded,
      auditTrail: auditAdded,
    },
  });
}

module.exports = async function demoSeed(req, res) {
  try {
    if (req.method === "GET") {
      return send(res, 200, {
        success: true,
        message:
          "Demo seed is ready. Send PUT /server/demo_seed/ as HR. Options: ?dry=true, ?force=true",
        targetEmployees: 30,
        targetBudgetOwners: TECH_ED,
        cycle: CURRENT_YEAR,
      });
    }
    if (req.method !== "PUT") {
      return send(res, 405, {
        success: false,
        message: "Use PUT /server/demo_seed/.",
      });
    }
    return await sync(req, res);
  } catch (error) {
    console.error("demo_seed:", error);
    return send(res, 500, {
      success: false,
      message: error?.message || "Demo seed failed.",
    });
  }
};
