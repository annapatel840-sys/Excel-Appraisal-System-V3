import { EXPERIENCE_REF_DATE, FIELD_DEFS } from "./employee-master-data";
import { calcOrgExperience, fmtDoj } from "./employee-master-utils";

/* ============================================================
   DOWNLOAD CSV
============================================================ */

function downloadCsv(filename, rows) {
  if (!rows || rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);

  const escapeCsv = (value) => {
    const text = value == null ? "" : String(value);

    if (
      text.includes(",") ||
      text.includes('"') ||
      text.includes("\n") ||
      text.includes("\r")
    ) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  };

  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsv(row[header])).join(","),
    ),
  ].join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/* ============================================================
   EMPLOYEE MASTER TEMPLATE
============================================================ */

export function downloadRosterTemplate() {
  const headers = FIELD_DEFS.map((field) => field.label);

  const row = {};

  headers.forEach((header) => {
    row[header] = "";
  });

  downloadCsv("employee-master-template.csv", [row]);
}

/* ============================================================
   EMPLOYEE MASTER DATA EXPORT
============================================================ */

export function downloadRosterData(employees = []) {
  const rows = employees.map((employee) => ({
    "Employee Name": employee.name || "",
    "Emp ID": employee.empId || "",
    Designation: employee.designation || "",
    Organization: employee.organization || "",
    "Date of Joining": employee.doj || "",
    "Org. Exp (as on 1 Jan)": calcOrgExperience(
      employee.doj,
      EXPERIENCE_REF_DATE,
    ),
    "Total Experience (as on 1 Jan)": employee.totalExp || "",
    "Reporting Manager": employee.reportingManager || "",
    "Comp. Manager": employee.compManager || "",
    "Super Manager": employee.superManager || "",
    "Appraiser / Super Manager": employee.appraiser || "",
    "Manager Email ID": employee.managerMail || "",
    "Super Manager Email ID": employee.superManagerMail || "",
    Status: employee.status || "",
  }));

  if (rows.length === 0) {
    return;
  }

  downloadCsv("employee-master-data.csv", rows);
}

/* ============================================================
   ELIGIBILITY TEMPLATE
============================================================ */

export function downloadEligibilityTemplate() {
  const row = {
    "Employee Name": "",
    "Emp ID": "",
    "Appraisal Year": "Apr-26",
    Organization: "",
    Designation: "",
    DOJ: "",
    Eligible: "",
    Reason: "",
  };

  downloadCsv("eligibility-template.csv", [row]);
}

/* ============================================================
   ELIGIBILITY EXPORT
============================================================ */

export function exportEligibilityData(employees = []) {
  const rows = employees.map((employee) => ({
    "Employee Name": employee.name || "",
    "Emp ID": employee.empId || "",
    "Appraisal Year": "Apr-26",
    Organization: employee.organization || "",
    Designation: employee.designation || "",
    DOJ: employee.doj || "",
    Eligible: employee.eligible === "Yes" ? "Eligible" : "Not Eligible",
    Reason: employee.eligibleReason || "",
    Source: employee.manualOverride ? "Manual" : "Criteria/Default",
  }));

  if (rows.length === 0) {
    return;
  }

  downloadCsv("eligibility-data.csv", rows);
}
