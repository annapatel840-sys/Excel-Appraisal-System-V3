import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, X, History } from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

import {
  FIELD_DEFS,
  fetchEmployeeMasterEmployees,
  fetchAllEmployeeMasterEmployees,
  fetchEligibilityEmployees,
  updateEmployeeMasterEmployee,
  updateEmployeeEligibility,
  createEmployeeMasterEmployees,
} from "@/lib/employee-master-data";

import {
  findFieldForHeader,
  normalizeEligibleValue,
  parseCsv,
  csvRowsToObjects,
} from "@/lib/employee-master-utils";

import {
  downloadRosterTemplate,
  downloadRosterData,
  downloadEligibilityTemplate,
  exportEligibilityData,
} from "@/lib/employee-master-export";

import { EmployeeMasterToolbar } from "@/components/employee-master/EmployeeMasterToolbar";
import { EmployeeRosterTable } from "@/components/employee-master/EmployeeRosterTable";
import { EligibilityCriteria } from "@/components/employee-master/EligibilityCriteria";
import { EligibilityList } from "@/components/employee-master/EligibilityList";
import { EligibilityModal } from "@/components/employee-master/EligibilityModal";
import { ImportPreviewModal } from "@/components/employee-master/ImportPreviewModal";
import { AppraisalCycleMasterPage } from "@/components/employee-master/AppraisalCycleMasterPage";
import { PayrollDataPage } from "@/components/employee-master/PayrollDataPage";
import { PayrollUploadPage } from "@/components/employee-master/PayrollUploadPage";
import { TeamChangesPage } from "@/components/employee-master/TeamChangesPage";
import { BudgetMasterPage } from "@/components/employee-master/BudgetMasterPage";
import { BudgetDistributionPage } from "@/components/employee-master/BudgetDistributionPage";
import DelegationScreen from "@/components/employee-master/DelegationScreen";
import AccessPage from "@/components/employee-master/AccessPage";
import { HR_TAB_SCREENS, useAccess } from "@/lib/access-store";

import "@/styles/employee-master.css";

const PAGE_SIZE = 20;

const ROSTER_FIELD_TO_CATALYST = {
  name: "name",
  designation: "designation",
  organization: "department",
  doj: "joining_date",
  orgExp: "wissen_experience",
  totalExp: "total_experience",
  reportingManager: "reporting_manager",
  compManager: "comp_manager",
  // Only the Appraiser / Tech-ED column feeds appraiser_tech_ed. The
  // "Super Manager" name column has no backend field and is not imported.
  appraiser: "appraiser_tech_ed",
  managerMail: "manager_email_id",
  superManagerMail: "super_man_email_id",
  status: "status",
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmpId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
}

function getImportedEmpId(row) {
  const directHeaders = [
    "Emp ID",
    "Employee ID",
    "EmpID",
    "EmployeeID",
    "EMP ID",
    "EMPLOYEE ID",
    "EMPID",
  ];

  for (const header of directHeaders) {
    if (row[header] !== undefined && row[header] !== null) {
      const value = String(row[header]).trim();

      if (value) {
        return value;
      }
    }
  }

  for (const [header, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(header);

    if (normalized === "empid" || normalized === "employeeid") {
      const result = String(value || "").trim();

      if (result) {
        return result;
      }
    }
  }

  return "";
}

/*
 * Normalise a date value to "yyyy-mm-dd" so it can be compared with the
 * <input type="date"> cutoff. Accepts ISO strings, dd-mm-yyyy / dd/mm/yyyy
 * and anything Date can parse. Returns "" when the value is not a date.
 */
function toIsoDate(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (iso) {
    return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  }

  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (dmy) {
    return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

/* Canonical appraiser format, e.g. "EMP0051 - Ashok Kumar". */
function isCanonicalPersonValue(value) {
  return /^\s*[A-Za-z]*\d+\s+-\s+\S/.test(String(value || ""));
}

/* ============================================================
   AUDIT PERSISTENCE (shared Appraisal_Audit table)
   ============================================================ */

const AUDIT_API_URL = catalystFunctionUrl("appraisalauditapi");

const AUDIT_SOURCE_STATUS = "Employee Master - Status";
const AUDIT_SOURCE_ELIGIBILITY = "Employee Master - Eligibility";

function formatAuditTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

async function postAuditEntries(entries) {
  if (!entries.length) {
    return;
  }

  const response = await catalystFetch(AUDIT_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      entries.map((entry) => ({
        emp_id: entry.empId,
        employee_name: entry.employeeName,
        field_name: entry.fieldName,
        old_value: entry.oldValue,
        new_value: entry.newValue,
        changed_by: entry.changedBy,
        changed_at: entry.changedAtIso,
        source: entry.source,
      })),
    ),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message || `Audit API failed with status ${response.status}`,
    );
  }
}

async function fetchAuditEntries(source) {
  const url = new URL(AUDIT_API_URL);

  url.searchParams.set("limit", "500");
  url.searchParams.set("_ts", String(Date.now()));

  const response = await catalystFetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message || `Audit API failed with status ${response.status}`,
    );
  }

  return (Array.isArray(result.data) ? result.data : [])
    .map((record) => record?.Appraisal_Audit || record || {})
    .filter((row) => String(row.source || "") === source)
    .map((row, index) => ({
      id: String(row.ROWID || row.id || `audit-${index}`),
      empId: String(row.emp_id || ""),
      employeeName: String(row.employee_name || ""),
      fieldName: String(row.field_name || ""),
      oldValue: String(row.old_value || ""),
      newValue: String(row.new_value || ""),
      changedAt: formatAuditTime(row.changed_at || row.CREATEDTIME),
    }));
}

/* ============================================================
   AUDIT PANEL
   ============================================================ */

function AuditHistoryPanel({ open, title, description, entries, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(1100px, 95vw)",
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <History size={18} />

              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                {title}
              </h2>
            </div>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: "32px",
              height: "32px",
              border: 0,
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* COUNT */}
        <div
          style={{
            padding: "10px 20px",
            borderBottom: "1px solid #e5e7eb",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          {entries.length} change{entries.length === 1 ? "" : "s"} recorded
        </div>

        {/* TABLE */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Employee ID
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Employee Name
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Field
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Old Value
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  New Value
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Changed At
                </th>
              </tr>
            </thead>

            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.empId}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.employeeName}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.fieldName}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.oldValue || "—"}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                    }}
                  >
                    {entry.newValue || "—"}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.changedAt}
                  </td>
                </tr>
              ))}

              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px 20px",
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    No audit history available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 20px",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            type="button"
            className="em-btn em-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   COMPONENT
   ============================================================ */

export function EmployeeMaster() {
  const catalystUser = useCatalystUser();
  const role = String(catalystUser?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  // UI gating only (the backend enforces authorization). Roster/status and
  // eligibility writes are for HR and App Administrator; others read only.
  const access = useAccess();
  const isRoleHR = role === "hr" || role === "appadministrator";
  // With access rules (/me ok) a 'view' level makes the screen read-only.
  const canEditEmployees = isRoleHR && access.canScreen("employeeMaster", "edit");
  // Mirrors payrollcycleapi: payroll upload is allowed for HR and Comp. Manager.
  const canUploadPayroll = role === "hr" || role === "compmanager";
  // Mirrors payrollcycleapi canAccessPayroll (HR, Comp. Manager, Tech-Ed).
  const canViewPayroll = canUploadPayroll || isTechEd;
  // Which HR Operations tabs to show: access rules when /me answered,
  // otherwise the role-based rules used before access control.
  const isTabVisible = (tab) => {
    if (access.ok) {
      if (tab === "payroll-upload") return access.canScreen("payroll", "edit");
      return access.canScreen(HR_TAB_SCREENS[tab] || "employeeMaster");
    }
    if (tab === "roster" || tab === "eligibility") return true;
    if (tab === "payroll-data") return canViewPayroll;
    if (tab === "payroll-upload") return canUploadPayroll;
    if (tab === "access") return isRoleHR;
    return !isTechEd;
  };
  const [allEmployees, setAllEmployees] = useState([]);

  const [eligibilityEmployees, setEligibilityEmployees] = useState([]);

  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const [loading, setLoading] = useState(true);

  const [statusActionLoading, setStatusActionLoading] = useState(false);

  const initialTab = new URLSearchParams(window.location.search).get("tab");
  const allowedTabs = new Set([
    "roster",
    "eligibility",
    "appraisal-cycle",
    "payroll-data",
    "payroll-upload",
    "team-changes",
    "budget-master",
    "budget-distribution",
    "delegation",
    "access",
  ].filter(isTabVisible));
  const defaultTab = allowedTabs.has("roster") || !allowedTabs.size ? "roster" : [...allowedTabs][0];
  const [activeTab, setActiveTab] = useState(
    isTechEd && !access.ok
      ? "roster"
      : allowedTabs.has(initialTab)
        ? initialTab
        : defaultTab,
  );

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("All");

  const [rosterFilters, setRosterFilters] = useState({});

  const [eligibilitySearch, setEligibilitySearch] = useState("");

  const [eligibilityFilters, setEligibilityFilters] = useState({});

  const [excludedEmployees, setExcludedEmployees] = useState([]);

  const [banner, setBanner] = useState(null);

  const [eligibilityEmployee, setEligibilityEmployee] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  const [previewChanges, setPreviewChanges] = useState([]);

  const [pendingImportType, setPendingImportType] = useState(null);

  const [previewWarnings, setPreviewWarnings] = useState([]);

  const [importPreparing, setImportPreparing] = useState(false);

  const [importSubmitting, setImportSubmitting] = useState(false);

  const importSubmittingRef = useRef(false);

  const [eligibilityReloadKey, setEligibilityReloadKey] = useState(0);

  const fileInputRef = useRef(null);

  const [currentPage, setCurrentPage] = useState(1);

  const [rosterPagination, setRosterPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  });

  const [rosterCounts, setRosterCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onPopState = () => {
      const tab = new URLSearchParams(window.location.search).get("tab");

      if (isTechEd && !access.ok) {
        setActiveTab("roster");
        return;
      }

      setActiveTab(allowedTabs.has(tab) ? tab : defaultTab);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [isTechEd, access.ok, defaultTab]);

  const eligibilityLoadedKeyRef = useRef(null);

  /* ============================================================
     SEPARATE AUDIT STATES
     ============================================================ */

  const [employeeMasterAudit, setEmployeeMasterAudit] = useState([]);

  const [eligibilityAudit, setEligibilityAudit] = useState([]);

  const [employeeMasterAuditOpen, setEmployeeMasterAuditOpen] = useState(false);

  const [eligibilityAuditOpen, setEligibilityAuditOpen] = useState(false);

  /* ============================================================
     AUDIT HELPERS
     ============================================================ */

  /*
   * Entries are shown immediately and also saved to the shared
   * Appraisal_Audit table (appraisalauditapi) so they survive a reload.
   * Entries whose save failed stay visible for this session only and are
   * flagged "(not saved)".
   */
  const [remoteEmployeeMasterAudit, setRemoteEmployeeMasterAudit] =
    useState(null);

  const [remoteEligibilityAudit, setRemoteEligibilityAudit] = useState(null);

  const [auditLoadError, setAuditLoadError] = useState("");

  const auditUserName = String(
    catalystUser?.name || catalystUser?.email || "Unknown user",
  );

  const recordAudit = (setLocal, source, entry) => {
    const now = new Date();

    const fullEntry = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
      ...entry,
      changedBy: auditUserName,
      changedAtIso: now.toISOString(),
      changedAt: formatAuditTime(now),
      source,
      saved: true,
    };

    setLocal((current) => [fullEntry, ...current]);

    postAuditEntries([fullEntry]).catch((error) => {
      console.error("Audit save failed:", error);

      setLocal((current) =>
        current.map((item) =>
          item.id === fullEntry.id
            ? {
                ...item,
                saved: false,
                newValue: `${item.newValue} (not saved)`,
              }
            : item,
        ),
      );
    });
  };

  const addEmployeeMasterAudit = ({
    empId,
    employeeName,
    oldValue,
    newValue,
  }) => {
    const oldText = String(oldValue ?? "").trim();
    const newText = String(newValue ?? "").trim();

    if (oldText === newText) {
      return;
    }

    recordAudit(setEmployeeMasterAudit, AUDIT_SOURCE_STATUS, {
      empId: String(empId || "").trim(),
      employeeName: String(employeeName || "").trim(),
      fieldName: "Status",
      oldValue: oldText,
      newValue: newText,
    });
  };

  const addEligibilityAudit = ({ empId, employeeName, oldValue, newValue }) => {
    const oldText = String(oldValue ?? "").trim();
    const newText = String(newValue ?? "").trim();

    if (oldText === newText) {
      return;
    }

    recordAudit(setEligibilityAudit, AUDIT_SOURCE_ELIGIBILITY, {
      empId: String(empId || "").trim(),
      employeeName: String(employeeName || "").trim(),
      fieldName: "Eligibility",
      oldValue:
        oldText === "Yes"
          ? "Eligible"
          : oldText === "No"
            ? "Not Eligible"
            : oldText,
      newValue:
        newText === "Yes"
          ? "Eligible"
          : newText === "No"
            ? "Not Eligible"
            : newText,
    });
  };

  const openAuditHistory = async (kind) => {
    const isStatus = kind === "status";

    if (isStatus) {
      setEmployeeMasterAuditOpen(true);
    } else {
      setEligibilityAuditOpen(true);
    }

    setAuditLoadError("");

    try {
      const entries = await fetchAuditEntries(
        isStatus ? AUDIT_SOURCE_STATUS : AUDIT_SOURCE_ELIGIBILITY,
      );

      if (isStatus) {
        setRemoteEmployeeMasterAudit(entries);
      } else {
        setRemoteEligibilityAudit(entries);
      }
    } catch (error) {
      setAuditLoadError(
        `Saved history could not be loaded (${
          error?.message || "unknown error"
        }). Showing this session's changes only.`,
      );
    }
  };

  // Saved history from the server plus any local entries that failed to save.
  const mergeAuditEntries = (remote, local) =>
    remote === null
      ? local
      : [...local.filter((entry) => entry.saved === false), ...remote];

  const showBanner = (title, body, error = false) => {
    setBanner({ title, body, error });
  };

  /* ============================================================
     LOAD ONLY CURRENT ROSTER PAGE
     ============================================================ */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const result = await fetchEmployeeMasterEmployees({
          page: currentPage,
          limit: PAGE_SIZE,
          search,
          status:
            statusFilter === "All"
              ? "all"
              : String(statusFilter || "").toLowerCase(),
        });

        if (cancelled) {
          return;
        }

        const employees = Array.isArray(result?.data) ? result.data : [];

        setAllEmployees(employees);

        setRosterPagination({
          page:
            result?.pagination?.page !== undefined
              ? Number(result.pagination.page)
              : currentPage,
          limit:
            result?.pagination?.limit !== undefined
              ? Number(result.pagination.limit)
              : PAGE_SIZE,
          totalCount:
            result?.pagination?.totalCount !== undefined
              ? Number(result.pagination.totalCount)
              : employees.length,
          totalPages:
            result?.pagination?.totalPages !== undefined
              ? Number(result.pagination.totalPages)
              : 1,
        });

        setRosterCounts({
          total:
            result?.counts?.total !== undefined
              ? Number(result.counts.total)
              : employees.length,
          active:
            result?.counts?.active !== undefined
              ? Number(result.counts.active)
              : 0,
          inactive:
            result?.counts?.inactive !== undefined
              ? Number(result.counts.inactive)
              : 0,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAllEmployees([]);

        setRosterPagination({
          page: 1,
          limit: PAGE_SIZE,
          totalCount: 0,
          totalPages: 1,
        });

        setRosterCounts({
          total: 0,
          active: 0,
          inactive: 0,
        });

        showBanner(
          "Employee data failed to load",
          error?.message || "Unable to load employee data from Catalyst.",
          true,
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [currentPage, search, statusFilter, refreshKey]);

  /* ============================================================
     RESET PAGE WHEN SEARCH / STATUS FILTER CHANGES
     ============================================================ */

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  // Deep link from the Detail Screen's "View all changes" link.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "teamChanges" && isTabVisible("team-changes")) setActiveTab("team-changes");
    if (tab === "budget-master" && isTabVisible("budget-master")) setActiveTab("budget-master");
  }, []);

  /* ============================================================
     COUNTS
     ============================================================ */

  const counts = useMemo(() => {
    return {
      total: rosterCounts.total,
      active: rosterCounts.active,
      inactive: rosterCounts.inactive,
    };
  }, [rosterCounts]);

  /* ============================================================
     CURRENT PAGE ROSTER FILTERS
     ============================================================ */

  const filteredRosterEmployees = useMemo(() => {
    return allEmployees.filter((employee) => {
      return Object.entries(rosterFilters).every(([field, filter]) => {
        if (!filter) {
          return true;
        }

        if (typeof filter === "string" && filter.trim() === "") {
          return true;
        }

        const value = String(employee?.[field] || "").toLowerCase();

        if (typeof filter === "string") {
          return value.includes(filter.toLowerCase());
        }

        if (typeof filter === "object" && filter.value) {
          return value.includes(String(filter.value).toLowerCase());
        }

        return true;
      });
    });
  }, [allEmployees, rosterFilters]);

  const rosterTotalPages = Math.max(1, rosterPagination.totalPages);

  const rosterSafePage = Math.min(currentPage, rosterTotalPages);

  /* ============================================================
     LOAD ELIGIBILITY LIST
     ============================================================ */

  useEffect(() => {
    if (activeTab !== "eligibility") {
      return;
    }

    if (eligibilityLoadedKeyRef.current === "loaded") {
      return;
    }

    eligibilityLoadedKeyRef.current = "loaded";

    let cancelled = false;
    let finished = false;

    const loadEligibilityEmployees = async () => {
      try {
        setEligibilityLoading(true);

        const firstPage = await fetchEligibilityEmployees({
          page: 1,
          limit: 100,
          search: "",
        });

        let all = Array.isArray(firstPage?.data) ? firstPage.data : [];

        const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

        for (let page = 2; page <= totalPages; page += 1) {
          if (cancelled) {
            return;
          }

          const result = await fetchEligibilityEmployees({
            page,
            limit: 100,
            search: "",
          });

          all = all.concat(Array.isArray(result?.data) ? result.data : []);
        }

        if (cancelled) {
          return;
        }

        finished = true;

        setEligibilityEmployees(all);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEligibilityEmployees([]);

        eligibilityLoadedKeyRef.current = null;

        showBanner(
          "Eligibility data failed to load",
          error?.message ||
            "Unable to load employees for the Eligibility List.",
          true,
        );
      } finally {
        if (!cancelled) {
          setEligibilityLoading(false);
        }
      }
    };

    loadEligibilityEmployees();

    return () => {
      cancelled = true;
      // Allow a retry if this load was interrupted before it finished.
      if (!finished && eligibilityLoadedKeyRef.current === "loaded") {
        eligibilityLoadedKeyRef.current = null;
      }
    };
  }, [activeTab, eligibilityReloadKey]);

  // Force the Eligibility List to reload from Catalyst on its next view.
  const invalidateEligibilityList = () => {
    eligibilityLoadedKeyRef.current = null;
    setEligibilityReloadKey((value) => value + 1);
  };

  /* ============================================================
     FILE READING
     ============================================================ */

  const readFile = async (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      const text = await file.text();

      return csvRowsToObjects(parseCsv(text));
    }

    if (extension === "xlsx" || extension === "xls") {
      const XLSX = await import("xlsx");

      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, { type: "array" });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!firstSheet) {
        throw new Error("No worksheet found in the file.");
      }

      return XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
        raw: false,
      });
    }

    throw new Error(
      "Unsupported file format. Please upload CSV or Excel file.",
    );
  };

  /* ============================================================
     ROSTER IMPORT CHANGES
     ============================================================ */

  /*
   * existingEmployees must be the COMPLETE employee list (not the current
   * roster page), otherwise existing employees are treated as new.
   * Returns { changes, warnings }. Each change carries a readable
   * field-level diff list for the preview.
   */
  const buildRosterImportChanges = (rows, existingEmployees) => {
    const changes = [];
    const warnings = [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return { changes, warnings };
    }

    const existingById = new Map(
      existingEmployees.map((employee) => [
        normalizeEmpId(employee.empId),
        employee,
      ]),
    );

    const employeesByName = new Map();

    existingEmployees.forEach((employee) => {
      const key = String(employee.name || "").trim().toLowerCase();

      if (!key) {
        return;
      }

      employeesByName.set(key, [...(employeesByName.get(key) || []), employee]);
    });

    /* De-duplicate by normalized emp_id; the last row in the file wins. */
    const mappedById = new Map();
    const duplicateIds = new Set();
    let missingIdCount = 0;

    rows.forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const mapped = {};

      Object.entries(row).forEach(([header, value]) => {
        const field = findFieldForHeader(header);

        if (field) {
          mapped[field.key] = String(value ?? "").trim();
        }
      });

      const importedEmpId = getImportedEmpId(row);

      if (importedEmpId) {
        mapped.empId = importedEmpId;
      }

      if (!mapped.empId) {
        if (Object.values(mapped).some((value) => value !== "")) {
          missingIdCount += 1;
        }

        return;
      }

      const key = normalizeEmpId(mapped.empId);

      if (mappedById.has(key)) {
        duplicateIds.add(mapped.empId);
      }

      mappedById.set(key, mapped);
    });

    if (duplicateIds.size > 0) {
      warnings.push(
        `Duplicate Emp IDs in file (last row used): ${[...duplicateIds].join(
          ", ",
        )}`,
      );
    }

    if (missingIdCount > 0) {
      warnings.push(`${missingIdCount} row(s) without an Emp ID were skipped.`);
    }

    const unresolvedAppraisers = [];

    mappedById.forEach((mapped, key) => {
      const existing = existingById.get(key);

      /* Bare appraiser names are resolved to "EMPxxxx - Name". */
      if (mapped.appraiser && !isCanonicalPersonValue(mapped.appraiser)) {
        const matches =
          employeesByName.get(mapped.appraiser.toLowerCase()) || [];

        if (matches.length === 1) {
          mapped.appraiser = `${matches[0].empId} - ${matches[0].name}`;
        } else {
          unresolvedAppraisers.push(
            `${mapped.empId} ("${mapped.appraiser}"${
              matches.length > 1 ? `, ${matches.length} matches` : ", no match"
            })`,
          );

          delete mapped.appraiser;
        }
      }

      const fields = {};
      const diffs = [];

      FIELD_DEFS.forEach((field) => {
        if (field.key === "empId") {
          return;
        }

        /* Only fields the backend can store are imported / previewed. */
        if (!ROSTER_FIELD_TO_CATALYST[field.key]) {
          return;
        }

        if (mapped[field.key] === undefined) {
          return;
        }

        let importedValue = String(mapped[field.key] || "").trim();

        if (importedValue === "") {
          return;
        }

        if (field.key === "status") {
          const lower = importedValue.toLowerCase();

          if (lower === "active" || lower === "inactive") {
            importedValue = lower === "active" ? "Active" : "Inactive";
          }
        }

        const existingValue = String(existing?.[field.key] ?? "").trim();

        if (!existing || existingValue !== importedValue) {
          fields[field.key] = importedValue;

          diffs.push({
            field: field.label,
            from: existing ? existingValue : "",
            to: importedValue,
          });
        }
      });

      if (!existing) {
        changes.push({
          empId: mapped.empId,
          name: mapped.name || "",
          fields,
          diffs,
          isNew: true,
        });

        return;
      }

      if (Object.keys(fields).length > 0) {
        changes.push({
          empId: existing.empId,
          name: mapped.name || existing.name || "",
          fields,
          diffs,
          isNew: false,
          previousStatus: existing.status,
        });
      }
    });

    if (unresolvedAppraisers.length > 0) {
      warnings.push(
        `Appraiser / Tech-ED not updated (name must match exactly one employee, or use "EMPxxxx - Name"): ${unresolvedAppraisers.join(
          "; ",
        )}`,
      );
    }

    return { changes, warnings };
  };

  /* ============================================================
     ELIGIBILITY IMPORT CHANGES
     ============================================================ */

  const buildEligibilityImportChanges = (rows, sourceEmployees) => {
    const changes = [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return changes;
    }

    rows.forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const empId = getImportedEmpId(row);

      if (!empId) {
        return;
      }

      let eligibleValue = "";

      Object.entries(row).forEach(([header, value]) => {
        const normalized = normalizeImportHeader(header);

        if (normalized === "eligible" || normalized === "eligibility") {
          eligibleValue = String(value || "").trim();
        }
      });

      if (!eligibleValue) {
        return;
      }

      const eligible = normalizeEligibleValue(eligibleValue);

      if (!eligible) {
        return;
      }

      let reason = "";

      Object.entries(row).forEach(([header, value]) => {
        const normalized = normalizeImportHeader(header);

        if (
          normalized === "reason" ||
          normalized === "eligiblereason" ||
          normalized === "remarks"
        ) {
          reason = String(value || "").trim();
        }
      });

      const employee = sourceEmployees.find(
        (item) => normalizeEmpId(item.empId) === normalizeEmpId(empId),
      );

      if (!employee) {
        return;
      }

      const nextReason = reason !== "" ? reason : employee.eligibleReason || "";

      // Only eligible_status is stored in Catalyst; a reason-only
      // difference is not a change that can be saved.
      if (employee.eligible !== eligible) {
        const label = (value) =>
          value === "Yes" ? "Eligible" : "Not Eligible";

        changes.push({
          empId: employee.empId,
          name: employee.name,
          fields: {
            Eligible: eligible,
            Reason: nextReason,
          },
          diffs: [
            {
              field: "Eligibility",
              from: label(employee.eligible),
              to: label(eligible),
            },
          ],
        });
      }
    });

    return changes;
  };

  /* ============================================================
     FILE HANDLERS
     ============================================================ */

  const handleRosterFile = async (file) => {
    if (!canEditEmployees || importPreparing) {
      return;
    }

    try {
      setImportPreparing(true);

      const rows = await readFile(file);

      // Compare against the complete employee list, not the current page.
      const fullEmployees = await fetchAllEmployeeMasterEmployees();

      const { changes, warnings } = buildRosterImportChanges(
        rows,
        fullEmployees,
      );

      setPendingImportType("roster");
      setPreviewChanges(changes);
      setPreviewWarnings(warnings);
      setPreviewOpen(true);
    } catch (error) {
      showBanner(
        "Import failed",
        error?.message || "Unable to read the file.",
        true,
      );
    } finally {
      setImportPreparing(false);
    }
  };

  const handleEligibilityFile = async (file) => {
    if (!canEditEmployees) {
      return;
    }

    try {
      let sourceEmployees = eligibilityEmployees;

      if (sourceEmployees.length === 0) {
        setEligibilityLoading(true);

        const firstPage = await fetchEligibilityEmployees({
          page: 1,
          limit: 100,
          search: "",
        });

        sourceEmployees = Array.isArray(firstPage?.data) ? firstPage.data : [];

        const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

        for (let page = 2; page <= totalPages; page += 1) {
          const result = await fetchEligibilityEmployees({
            page,
            limit: 100,
            search: "",
          });

          sourceEmployees = sourceEmployees.concat(
            Array.isArray(result?.data) ? result.data : [],
          );
        }

        setEligibilityEmployees(sourceEmployees);
        eligibilityLoadedKeyRef.current = "loaded";
        setEligibilityLoading(false);
      }

      const rows = await readFile(file);

      const changes = buildEligibilityImportChanges(rows, sourceEmployees);

      setPendingImportType("eligibility");
      setPreviewChanges(changes);
      setPreviewWarnings([
        "Eligibility reasons are shown for reference only and are not saved (no backend column).",
      ]);
      setPreviewOpen(true);
    } catch (error) {
      setEligibilityLoading(false);

      showBanner(
        "Import failed",
        error?.message || "Unable to read the file.",
        true,
      );
    }
  };

  /* ============================================================
     STATUS PERSISTENCE
     ============================================================ */

  const persistStatusChange = async (empId, nextStatus) => {
    const normalizedStatus = String(nextStatus || "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      throw new Error("Invalid employee status.");
    }

    return updateEmployeeMasterEmployee(empId, {
      status: normalizedStatus,
    });
  };

  /* ============================================================
     LOCAL STATUS UPDATE
     ============================================================ */

  const applyLocalStatusChanges = (successfulChanges) => {
    const statusMap = new Map(
      successfulChanges.map((change) => [
        normalizeEmpId(change.empId),
        change.status,
      ]),
    );

    const updateEmployee = (employee) => {
      const nextStatus = statusMap.get(normalizeEmpId(employee.empId));

      if (!nextStatus) {
        return employee;
      }

      return {
        ...employee,
        status: nextStatus,
      };
    };

    setAllEmployees((current) => current.map(updateEmployee));

    setEligibilityEmployees((current) => current.map(updateEmployee));

    setRosterCounts((current) => {
      let activeDelta = 0;

      successfulChanges.forEach((change) => {
        const previous = allEmployees.find(
          (employee) =>
            normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
        );

        if (!previous) {
          return;
        }

        if (previous.status === "Active" && change.status === "Inactive") {
          activeDelta -= 1;
        }

        if (previous.status === "Inactive" && change.status === "Active") {
          activeDelta += 1;
        }
      });

      return {
        ...current,
        active: current.active + activeDelta,
        inactive: current.inactive - activeDelta,
      };
    });

    invalidateEligibilityList();
  };

  /* ============================================================
     INDIVIDUAL ACTIVE / INACTIVE
     ============================================================ */

  const toggleEmployeeStatus = async (employee) => {
    if (!canEditEmployees || !employee?.empId) {
      return;
    }

    const oldStatus = employee.status;

    const nextStatus = employee.status === "Active" ? "Inactive" : "Active";

    try {
      setStatusActionLoading(true);

      await persistStatusChange(employee.empId, nextStatus);

      addEmployeeMasterAudit({
        empId: employee.empId,
        employeeName: employee.name,
        oldValue: oldStatus,
        newValue: nextStatus,
      });

      applyLocalStatusChanges([
        {
          empId: employee.empId,
          status: nextStatus,
        },
      ]);

      showBanner(
        "Status updated",
        `${employee.empId} is now ${nextStatus}. Saved to Catalyst.`,
      );
    } catch (error) {
      showBanner(
        "Status update failed",
        error?.message || "Unable to save employee status to Catalyst.",
        true,
      );
    } finally {
      setStatusActionLoading(false);
    }
  };

  /* ============================================================
     BULK ACTIVE / INACTIVE
     ============================================================ */

  const bulkUpdateEmployeeStatus = async (nextStatus, selectedEmployees) => {
    if (!canEditEmployees) {
      return;
    }

    if (!Array.isArray(selectedEmployees) || selectedEmployees.length === 0) {
      showBanner(
        "No employees selected",
        "Please select at least one employee before using Active or Inactive.",
        true,
      );
      return;
    }

    const normalizedStatus = String(nextStatus || "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      return;
    }

    const uniqueEmployees = Array.from(
      new Map(
        selectedEmployees
          .filter((employee) => employee?.empId)
          .map((employee) => [normalizeEmpId(employee.empId), employee]),
      ).values(),
    );

    const employeesToUpdate = uniqueEmployees.filter(
      (employee) => employee.status !== normalizedStatus,
    );

    if (employeesToUpdate.length === 0) {
      showBanner(
        "No status changes needed",
        `All selected employees are already ${normalizedStatus}.`,
      );
      return;
    }

    try {
      setStatusActionLoading(true);

      const results = await Promise.allSettled(
        employeesToUpdate.map(async (employee) => {
          const oldStatus = employee.status;

          await persistStatusChange(employee.empId, normalizedStatus);

          return {
            empId: employee.empId,
            employeeName: employee.name,
            oldStatus,
            status: normalizedStatus,
          };
        }),
      );

      const successfulChanges = [];
      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successfulChanges.push(result.value);

          addEmployeeMasterAudit({
            empId: result.value.empId,
            employeeName: result.value.employeeName,
            oldValue: result.value.oldStatus,
            newValue: result.value.status,
          });
        } else {
          failedCount += 1;

          console.error("Bulk status update failed:", result.reason);
        }
      });

      if (successfulChanges.length > 0) {
        applyLocalStatusChanges(successfulChanges);
      }

      if (failedCount > 0) {
        showBanner(
          "Bulk status partially completed",
          `${successfulChanges.length} employee(s) updated to ${normalizedStatus}. ${failedCount} employee(s) failed.`,
          true,
        );
      } else {
        showBanner(
          "Bulk status updated",
          `${successfulChanges.length} employee(s) are now ${normalizedStatus}. Changes saved to Catalyst.`,
        );
      }
    } catch (error) {
      showBanner(
        "Bulk status update failed",
        error?.message || "Unable to update employee status.",
        true,
      );
    } finally {
      setStatusActionLoading(false);
    }
  };

  /* ============================================================
     LOCAL ELIGIBILITY UPDATE
     ============================================================ */

  /*
   * manual = true only for genuine manual edits (modal / file import).
   * Criteria-driven changes must not set manualOverride, otherwise the
   * next Apply Criteria skips those rows.
   */
  const applyLocalEligibilityChanges = (
    successfulChanges,
    { manual = false } = {},
  ) => {
    const changeMap = new Map(
      successfulChanges.map((change) => [normalizeEmpId(change.empId), change]),
    );

    const updateEmployee = (employee) => {
      const change = changeMap.get(normalizeEmpId(employee.empId));

      if (!change) {
        return employee;
      }

      const nextEligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";

      return {
        ...employee,
        eligible: nextEligible,
        eligibleStatus: nextEligible === "Yes" ? "Eligible" : "Not Eligible",
        eligibleReason: manual
          ? change.fields?.Reason || employee.eligibleReason || ""
          : change.fields?.Reason || "",
        manualOverride: manual ? true : Boolean(employee.manualOverride),
        status: employee.status,
      };
    };

    setEligibilityEmployees((current) => current.map(updateEmployee));

    setAllEmployees((current) => current.map(updateEmployee));
  };

  /* ============================================================
     SAVE ELIGIBILITY TO CATALYST
     ============================================================ */

  const persistEligibilityChange = async (change) => {
    const eligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";

    const eligibleReason = change.fields?.Reason || "";

    await updateEmployeeEligibility(change.empId, eligible, eligibleReason);

    return {
      empId: change.empId,
      name: change.name,
      fields: {
        Eligible: eligible,
        Reason: eligibleReason,
      },
    };
  };

  /* ============================================================
     CONFIRM IMPORT
     ============================================================ */

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewChanges([]);
    setPreviewWarnings([]);
    setPendingImportType(null);
  };

  /* In-flight guard: prevents double POSTs from repeated clicks. */
  const confirmImport = async () => {
    if (importSubmittingRef.current || !canEditEmployees) {
      return;
    }

    importSubmittingRef.current = true;
    setImportSubmitting(true);

    try {
      await runConfirmImport();
    } finally {
      importSubmittingRef.current = false;
      setImportSubmitting(false);
    }
  };

  const runConfirmImport = async () => {
    if (previewChanges.length === 0) {
      closePreview();

      showBanner("Nothing to import", "No changes were found in the file.");

      return;
    }

    if (pendingImportType === "eligibility") {
      try {
        const results = await Promise.allSettled(
          previewChanges.map(async (change) => {
            const oldEmployee = eligibilityEmployees.find(
              (employee) =>
                normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
            );

            const oldEligible = oldEmployee?.eligible;

            const result = await persistEligibilityChange(change);

            return {
              ...result,
              oldEligible,
            };
          }),
        );

        const successfulChanges = [];
        let failedCount = 0;

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            successfulChanges.push(result.value);

            addEligibilityAudit({
              empId: result.value.empId,
              employeeName: result.value.name,
              oldValue: result.value.oldEligible,
              newValue: result.value.fields?.Eligible,
            });
          } else {
            failedCount += 1;

            console.error("Eligibility import update failed:", result.reason);
          }
        });

        if (successfulChanges.length > 0) {
          applyLocalEligibilityChanges(successfulChanges, { manual: true });
        }

        closePreview();

        if (failedCount > 0) {
          showBanner(
            "Eligibility import partially completed",
            `${successfulChanges.length} updated in Catalyst. ${failedCount} record(s) failed.`,
            true,
          );
        } else {
          showBanner(
            "Eligibility imported",
            `${successfulChanges.length} employee record(s) updated in Employees table. Active/Inactive status was not changed.`,
          );
        }
      } catch (error) {
        showBanner(
          "Eligibility import failed",
          error?.message || "Unable to update eligibility.",
          true,
        );
      }

      return;
    }

    /* ==========================================================
       ROSTER IMPORT
       ========================================================== */

    try {
      const records = previewChanges.map((change) => {
        const payload = {
          emp_id: change.empId,
        };

        Object.entries(change.fields || {}).forEach(([key, value]) => {
          const catalystField = ROSTER_FIELD_TO_CATALYST[key];

          if (catalystField) {
            payload[catalystField] = value;
          }
        });

        // Status is sent only when the file has a Status value. New rows
        // default to Active on the backend; existing rows keep their status.

        return payload;
      });

      const result = await createEmployeeMasterEmployees(records);

      /* Log status changes from roster import only when the
         employee already existed and its status was changed. */
      previewChanges.forEach((change) => {
        if (change.isNew) {
          return;
        }

        const importedStatus = change.fields?.status;

        if (!importedStatus) {
          return;
        }

        if (!change.previousStatus || change.previousStatus === importedStatus) {
          return;
        }

        addEmployeeMasterAudit({
          empId: change.empId,
          employeeName: change.name,
          oldValue: change.previousStatus,
          newValue: importedStatus,
        });
      });

      closePreview();

      setRefreshKey((value) => value + 1);

      invalidateEligibilityList();

      const created = result?.data?.created || 0;
      const updated = result?.data?.updated || 0;
      const skipped = result?.data?.skipped || 0;

      showBanner(
        "Employee import completed",
        `${created} created, ${updated} updated${
          skipped ? `, ${skipped} skipped` : ""
        } in Catalyst.`,
      );
    } catch (error) {
      showBanner(
        "Employee import failed",
        error?.message || "Unable to import employees to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     ELIGIBILITY CRITERIA
     ============================================================ */

  const applyEligibilityCriteria = async ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
  }) => {
    if (!canEditEmployees) {
      return;
    }

    let evaluated = 0;

    const changes = [];

    const reasonOnlyChanges = [];

    const cutoffIso = toIsoDate(cutoffDate);

    eligibilityEmployees.forEach((employee) => {
      if (employee.manualOverride) {
        return;
      }

      // Inactive employees are left untouched by criteria.
      if (employee.status === "Inactive") {
        return;
      }

      evaluated += 1;

      const reasons = [];

      if (departments.length && departments.includes(employee.organization)) {
        reasons.push("Department excluded");
      }

      if (designations.length && designations.includes(employee.designation)) {
        reasons.push("Designation excluded");
      }

      if (excluded.includes(employee.empId)) {
        reasons.push("Employee excluded");
      }

      if (cutoffIso) {
        const dojIso = toIsoDate(employee.doj);

        // The cutoff rule needs a DOJ; without one eligibility can't be shown.
        if (!dojIso) {
          reasons.push("Missing DOJ");
        } else if (dojIso > cutoffIso) {
          reasons.push("Joined after cutoff date");
        }
      }

      const nextEligible = reasons.length > 0 ? "No" : "Yes";

      const nextReason = reasons.join(", ");

      // Only eligible_status is persisted; a differing (derived) reason is
      // refreshed locally without a PATCH.
      if (employee.eligible === nextEligible) {
        if (employee.eligibleReason !== nextReason) {
          reasonOnlyChanges.push({
            empId: employee.empId,
            fields: { Eligible: nextEligible, Reason: nextReason },
          });
        }

        return;
      }

      changes.push({
        empId: employee.empId,
        name: employee.name,
        oldEligible: employee.eligible,
        fields: {
          Eligible: nextEligible,
          Reason: nextReason,
        },
      });
    });

    if (reasonOnlyChanges.length > 0) {
      applyLocalEligibilityChanges(reasonOnlyChanges);
    }

    if (changes.length === 0) {
      showBanner(
        "Criteria applied",
        `${evaluated} employee(s) evaluated. No eligibility changes were required.`,
      );

      return;
    }

    try {
      const results = await Promise.allSettled(
        changes.map((change) => persistEligibilityChange(change)),
      );

      const successfulChanges = [];
      let failedCount = 0;

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successfulChanges.push(result.value);

          addEligibilityAudit({
            empId: result.value.empId,
            employeeName: result.value.name,
            oldValue: changes[index].oldEligible,
            newValue: result.value.fields?.Eligible,
          });
        } else {
          failedCount += 1;

          console.error("Eligibility criteria update failed:", result.reason);
        }
      });

      if (successfulChanges.length > 0) {
        applyLocalEligibilityChanges(successfulChanges);
      }

      if (failedCount > 0) {
        showBanner(
          "Criteria partially applied",
          `${successfulChanges.length} employee(s) updated in Catalyst. ${failedCount} employee(s) failed.`,
          true,
        );
      } else {
        showBanner(
          "Criteria applied",
          `${successfulChanges.length} employee(s) eligibility updated in Catalyst. Active/Inactive status was not changed.`,
        );
      }
    } catch (error) {
      showBanner(
        "Criteria update failed",
        error?.message || "Unable to save eligibility changes to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     SAVE INDIVIDUAL ELIGIBILITY
     ============================================================ */

  const saveEligibility = async ({ empId, eligible, eligibleReason }) => {
    if (!canEditEmployees) {
      return;
    }

    try {
      const normalizedEligible = eligible === "Yes" ? "Yes" : "No";

      const existingEmployee = eligibilityEmployees.find(
        (employee) => normalizeEmpId(employee.empId) === normalizeEmpId(empId),
      );

      const oldEligible = existingEmployee?.eligible;

      await updateEmployeeEligibility(
        empId,
        normalizedEligible,
        eligibleReason || "",
      );

      addEligibilityAudit({
        empId,
        employeeName: existingEmployee?.name || "",
        oldValue: oldEligible,
        newValue: normalizedEligible,
      });

      applyLocalEligibilityChanges([
        {
          empId,
          fields: {
            Eligible: normalizedEligible,
            Reason: eligibleReason || "",
          },
        },
      ], { manual: true });

      setEligibilityEmployee(null);

      showBanner(
        "Eligibility updated",
        `${empId} is now ${
          normalizedEligible === "Yes" ? "Eligible" : "Not Eligible"
        }. Saved to Employees table. Active/Inactive status was not changed.`,
      );
    } catch (error) {
      showBanner(
        "Eligibility update failed",
        error?.message || "Unable to save eligibility to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <AppShell>
      <div className="employee-master-page">
        {isTabVisible("roster") && <div className="em-page-stats mb-2">
          <div>
            <span>Total</span>
            <strong>{counts.total}</strong>
          </div>

          <div>
            <span>Active</span>
            <strong className="active">{counts.active}</strong>
          </div>

          <div>
            <span>Inactive</span>
            <strong className="inactive">{counts.inactive}</strong>
          </div>
        </div>}

        {/* ======================================================
            TABS
            ====================================================== */}

        <div className="em-tabs">
          {isTabVisible("roster") && <button
            type="button"
            className={activeTab === "roster" ? "active" : ""}
            onClick={() => setActiveTab("roster")}
          >
            Employee Master
          </button>}

          {isTabVisible("eligibility") && <button
            type="button"
            className={activeTab === "eligibility" ? "active" : ""}
            onClick={() => setActiveTab("eligibility")}
          >
            Eligibility List
          </button>}

          {isTabVisible("appraisal-cycle") && <button
            type="button"
            className={activeTab === "appraisal-cycle" ? "active" : ""}
            onClick={() => setActiveTab("appraisal-cycle")}
          >
            Appraisal Cycle Master
          </button>}

          {isTabVisible("payroll-data") && <button
            type="button"
            className={activeTab === "payroll-data" ? "active" : ""}
            onClick={() => setActiveTab("payroll-data")}
          >
            Payroll Data
          </button>}

          {isTabVisible("payroll-upload") && <button
            type="button"
            className={activeTab === "payroll-upload" ? "active" : ""}
            onClick={() => setActiveTab("payroll-upload")}
          >
            Payroll Upload
          </button>}
          {isTabVisible("team-changes") && <button
            type="button"
            className={activeTab === "team-changes" ? "active" : ""}
            onClick={() => setActiveTab("team-changes")}
          >
            Team Changes
          </button>}
          {isTabVisible("budget-master") && <button
              type="button"
              className={activeTab === "budget-master" ? "active" : ""}
              onClick={() => setActiveTab("budget-master")}
            >
              Budget Master
            </button>}
          {isTabVisible("budget-distribution") && <button
              type="button"
              className={activeTab === "budget-distribution" ? "active" : ""}
              onClick={() => setActiveTab("budget-distribution")}
            >
              Budget Distribution
            </button>}
          {isTabVisible("delegation") && (
            <button
              type="button"
              className={activeTab === "delegation" ? "active" : ""}
              onClick={() => setActiveTab("delegation")}
            >
              Delegation
            </button>
          )}
          {isTabVisible("access") && (
            <button
              type="button"
              className={activeTab === "access" ? "active" : ""}
              onClick={() => setActiveTab("access")}
            >
              Access
            </button>
          )}
        </div>

        {/* ======================================================
            BANNER
            ====================================================== */}

        {banner && (
          <div className={`em-banner ${banner.error ? "error" : ""}`}>
            <div>
              {banner.error ? (
                <AlertCircle size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
            </div>

            <div>
              <strong>{banner.title}</strong>

              <span>{banner.body}</span>
            </div>

            <button type="button" onClick={() => setBanner(null)}>
              ×
            </button>
          </div>
        )}

        {/* ======================================================
            EMPLOYEE MASTER TAB
            ====================================================== */}

        {isTabVisible("roster") && activeTab === "roster" && (
          <div className="em-tab-content">
            <EmployeeMasterToolbar
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onDownloadTemplate={downloadRosterTemplate}
              onUpload={
                canEditEmployees && !importPreparing
                  ? () => fileInputRef.current?.click()
                  : undefined
              }
              onDownloadData={() => downloadRosterData(filteredRosterEmployees)}
              onAuditHistory={
                access.canAction("viewAudit") ? () => openAuditHistory("status") : undefined
              }
            />

            {importPreparing && (
              <div className="em-empty">
                Reading file and loading all employees for comparison...
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  handleRosterFile(file);
                }

                event.target.value = "";
              }}
            />

            {loading ? (
              <div className="em-empty">Loading employees...</div>
            ) : (
              <EmployeeRosterTable
                rows={filteredRosterEmployees}
                filters={rosterFilters}
                setFilters={setRosterFilters}
                currentPage={rosterSafePage}
                setCurrentPage={setCurrentPage}
                totalPages={rosterTotalPages}
                totalCount={rosterPagination.totalCount}
                onToggleStatus={toggleEmployeeStatus}
                onBulkStatusChange={bulkUpdateEmployeeStatus}
                bulkStatusUpdating={statusActionLoading}
                canEdit={canEditEmployees}
              />
            )}

          </div>
        )}

        {/* ======================================================
            ELIGIBILITY TAB
            ====================================================== */}

        {isTabVisible("eligibility") && activeTab === "eligibility" && (
          <div className="em-tab-content">
            {eligibilityLoading ? (
              <div className="em-empty">
                Loading all employees for Eligibility List...
              </div>
            ) : (
              <div
                className="em-eligibility-layout"
                style={
                  canEditEmployees
                    ? undefined
                    : { gridTemplateColumns: "minmax(0, 1fr)" }
                }
              >
                {canEditEmployees && (
                  <EligibilityCriteria
                    employees={eligibilityEmployees}
                    excludedEmployees={excludedEmployees}
                    setExcludedEmployees={setExcludedEmployees}
                    onApply={applyEligibilityCriteria}
                  />
                )}

                <EligibilityList
                  employees={eligibilityEmployees}
                  search={eligibilitySearch}
                  setSearch={setEligibilitySearch}
                  filters={eligibilityFilters}
                  setFilters={setEligibilityFilters}
                  onChangeEligibility={
                    canEditEmployees ? setEligibilityEmployee : undefined
                  }
                  onDownloadTemplate={downloadEligibilityTemplate}
                  onImport={canEditEmployees ? handleEligibilityFile : undefined}
                  onExport={exportEligibilityData}
                  onAuditHistory={
                    access.canAction("viewAudit")
                      ? () => openAuditHistory("eligibility")
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* ======================================================
            APPRAISAL CYCLE MASTER
            NO AUDIT HISTORY HERE
            ====================================================== */}

        {isTabVisible("appraisal-cycle") && activeTab === "appraisal-cycle" && (
          <div className="em-tab-content">
            <AppraisalCycleMasterPage />
          </div>
        )}

        {/* ======================================================
            PAYROLL DATA
            ====================================================== */}

        {isTabVisible("payroll-data") && activeTab === "payroll-data" && (
          <div className="em-tab-content">
            <PayrollDataPage />
          </div>
        )}

        {/* ======================================================
            PAYROLL UPLOAD
            ====================================================== */}

        {isTabVisible("payroll-upload") && activeTab === "payroll-upload" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 180px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <PayrollUploadPage />
          </div>
        )}
        {isTabVisible("team-changes") && activeTab === "team-changes" && <TeamChangesPage />}
        {isTabVisible("budget-master") && activeTab === "budget-master" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 180px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <BudgetMasterPage />
          </div>
        )}

        {isTabVisible("budget-distribution") && activeTab === "budget-distribution" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 180px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <BudgetDistributionPage />
          </div>
        )}
        {isTabVisible("delegation") && activeTab === "delegation" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 180px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <DelegationScreen showRoleSwitch={false} />
          </div>
        )}
        {isTabVisible("access") && activeTab === "access" && (
          <div className="em-tab-content">
            <AccessPage />
          </div>
        )}

        {/* ======================================================
            ELIGIBILITY MODAL
            ====================================================== */}

        <EligibilityModal
          employee={eligibilityEmployee}
          onClose={() => setEligibilityEmployee(null)}
          onSave={saveEligibility}
        />

        {/* ======================================================
            IMPORT PREVIEW
            ====================================================== */}

        <ImportPreviewModal
          open={previewOpen}
          title={
            pendingImportType === "eligibility"
              ? "Eligibility Import Preview"
              : "Employee Import Preview"
          }
          changes={previewChanges}
          warnings={previewWarnings}
          submitting={importSubmitting}
          onCancel={closePreview}
          onConfirm={confirmImport}
        />

        {/* ======================================================
            EMPLOYEE MASTER AUDIT HISTORY
            ====================================================== */}

        <AuditHistoryPanel
          open={employeeMasterAuditOpen}
          title="Employee Master Audit History"
          description={
            auditLoadError ||
            "Active / Inactive status changes only (saved to the Appraisal audit log)."
          }
          entries={mergeAuditEntries(
            remoteEmployeeMasterAudit,
            employeeMasterAudit,
          )}
          onClose={() => setEmployeeMasterAuditOpen(false)}
        />

        {/* ======================================================
            ELIGIBILITY AUDIT HISTORY
            ====================================================== */}

        <AuditHistoryPanel
          open={eligibilityAuditOpen}
          title="Eligibility Audit History"
          description={
            auditLoadError ||
            "Eligible / Not Eligible changes only (saved to the Appraisal audit log)."
          }
          entries={mergeAuditEntries(remoteEligibilityAudit, eligibilityAudit)}
          onClose={() => setEligibilityAuditOpen(false)}
        />
      </div>
    </AppShell>
  );
}
