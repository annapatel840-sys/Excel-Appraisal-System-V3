/*
 * ============================================================
 * PREVIOUS YEAR APPRAISAL DATA
 * ============================================================
 *
 * Demo data for previous-year appraisal.
 *
 * IMPORTANT:
 * The employee IDs are generated from the current appraisal
 * employee list so that every current employee has previous-year
 * data.
 *
 * Later this can be replaced with data fetched from Zoho Creator.
 *
 * ============================================================
 */

import { buildEmployees } from "./appraisal-data";

/*
 * ------------------------------------------------------------
 * Generate previous-year data for all employees
 * ------------------------------------------------------------
 */

const CURRENT_EMPLOYEES = buildEmployees();

const PREVIOUS_YEAR_DATA = {};

CURRENT_EMPLOYEES.forEach((employee, index) => {
  const empId = employee.empId;

  /*
   * Use current employee information where possible.
   * Previous-year values are demo values and can later be
   * replaced by Zoho Creator data.
   */

  const currentBasePay =
    Number(employee.currentAnnualBasePay) || Number(employee.basePay) || 400000;

  /*
   * Create slightly different demo values for each employee.
   * This avoids having identical previous-year records.
   */

  const basePay = Math.round(currentBasePay / (1 + 0.08 + (index % 5) * 0.01));

  const allocatedPB = Math.round(basePay * 0.08);

  const performanceBonus = Math.round(basePay * 0.06);

  const retentionBonus = Math.round(basePay * 0.04);

  const totalPB = allocatedPB + performanceBonus;

  const totalBonus = totalPB + retentionBonus;

  const hikePct = 8 + (index % 5);

  const hikeAmount = Math.round(basePay * (hikePct / 100));

  const newCTC = basePay + hikeAmount + totalBonus;

  /*
   * Promotion demo logic.
   *
   * Every 10th employee is treated as promoted.
   * This can later be replaced with actual previous-year
   * promotion data.
   */

  const promotion = index % 10 === 0 ? "Yes" : "No";

  const title =
    employee.newTitle || employee.designation || "Software Engineer";

  PREVIOUS_YEAR_DATA[empId] = {
    appraisalYear: "2024-25",

    basePay,

    allocatedPB,
    allocatedPBInstallment: "4",

    performanceBonus,
    performanceBonusInstallment: "4",

    retentionBonus,
    retentionBonusInstallment: "2",

    totalPB,
    totalBonus,

    hikeAmount,
    hikePct,

    promotion,
    title,

    targetPerformanceBonus: Math.round(basePay * 0.08),

    targetPBInstallment: "4",

    newCTC,
  };
});

/*
 * ------------------------------------------------------------
 * Get previous-year data for an employee
 * ------------------------------------------------------------
 */

export function getPreviousYearData(empId) {
  if (!empId) {
    return null;
  }

  return PREVIOUS_YEAR_DATA[empId] ?? null;
}

/*
 * ------------------------------------------------------------
 * Optional helper
 * ------------------------------------------------------------
 *
 * Useful for debugging / checking how many employees have
 * previous-year data.
 * ------------------------------------------------------------
 */

export function getPreviousYearDataCount() {
  return Object.keys(PREVIOUS_YEAR_DATA).length;
}

/*
 * ------------------------------------------------------------
 * Optional helper
 * ------------------------------------------------------------
 *
 * Returns the complete previous-year dataset.
 * Useful later for export/API integration.
 * ------------------------------------------------------------
 */

export function getAllPreviousYearData() {
  return PREVIOUS_YEAR_DATA;
}
