import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Menu,
  Search,
  Upload,
} from "lucide-react";

import { ColumnFilter } from "./ColumnFilter";
import { fmtDoj } from "@/lib/employee-master-utils";

const COLUMNS = [
  {
    key: "name",
    label: "Employee",
    type: "text",
    get: (employee) => `${employee.name} ${employee.empId}`,
  },
  {
    key: "appraisalYear",
    label: "Appraisal Year",
    type: "text",
    get: () => "Apr-26",
  },
  {
    key: "organization",
    label: "Organization",
    type: "select",
    get: (employee) => employee.organization || "",
  },
  {
    key: "designation",
    label: "Designation",
    type: "select",
    get: (employee) => employee.designation || "",
  },
  {
    key: "doj",
    label: "Date of Joining",
    type: "text",
    get: (employee) => fmtDoj(employee.doj),
  },
  {
    key: "eligible",
    label: "Eligible",
    type: "select",
    get: (employee) =>
      employee.eligible === "Yes" ? "Eligible" : "Not Eligible",
  },
  {
    key: "eligibleReason",
    // Reason has no backend column: it is derived/entered locally and is
    // lost on reload.
    label: "Reason (not saved)",
    type: "text",
    get: (employee) => employee.eligibleReason || "",
  },
];

const PAGE_SIZE = 10;

export function EligibilityList({
  employees,
  search,
  setSearch,
  filters,
  setFilters,
  onChangeEligibility,
  onDownloadTemplate,
  onImport,
  onExport,
  onAuditHistory,
}) {
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  /*
   * ------------------------------------------------------------
   * CLOSE MENU WHEN CLICKING OUTSIDE
   * ------------------------------------------------------------
   */
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  /*
   * ------------------------------------------------------------
   * ACTIVE EMPLOYEES
   * ------------------------------------------------------------
   */
  const activeEmployees = useMemo(() => employees, [employees]);

  /*
   * ------------------------------------------------------------
   * FILTERED ROWS
   * ------------------------------------------------------------
   */
  const rows = useMemo(() => {
    return activeEmployees.filter((employee) => {
      const searchTerm = search.trim().toLowerCase();

      if (
        searchTerm &&
        !String(employee.name ?? "")
          .toLowerCase()
          .includes(searchTerm) &&
        !String(employee.empId ?? "")
          .toLowerCase()
          .includes(searchTerm)
      ) {
        return false;
      }

      return COLUMNS.every((column) => {
        const filter = filters[column.key];

        if (!filter) {
          return true;
        }

        const value = String(column.get?.(employee) ?? "").toLowerCase();

        if (filter.type === "text") {
          return value.includes(String(filter.term || "").toLowerCase());
        }

        return filter.values.has(column.get?.(employee) ?? "");
      });
    });
  }, [activeEmployees, filters, search]);

  /*
   * ------------------------------------------------------------
   * COUNTS
   * ------------------------------------------------------------
   */
  const eligibleCount = activeEmployees.filter(
    (employee) => employee.eligible === "Yes",
  ).length;

  const notEligibleCount = activeEmployees.length - eligibleCount;

  /*
   * ------------------------------------------------------------
   * PAGINATION
   * ------------------------------------------------------------
   */
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const safePage = Math.min(currentPage, totalPages);

  // Keep currentPage in range when the row count shrinks.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;

    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

  /*
   * ------------------------------------------------------------
   * SEARCH
   * ------------------------------------------------------------
   */
  const handleSearchChange = (value) => {
    setSearch(value);
    setCurrentPage(1);
    setMenuOpen(false);
  };

  /*
   * ------------------------------------------------------------
   * FILTER CHANGE
   * ------------------------------------------------------------
   */
  const handleFilterChange = (key, value) => {
    setFilters((current) => {
      const next = {
        ...current,
      };

      if (!value) {
        delete next[key];
      } else {
        next[key] = value;
      }

      return next;
    });

    setCurrentPage(1);
    setMenuOpen(false);
  };

  /*
   * ------------------------------------------------------------
   * PAGINATION DISPLAY
   * ------------------------------------------------------------
   */
  const startRecord = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

  const endRecord = Math.min(safePage * PAGE_SIZE, rows.length);

  /*
   * ------------------------------------------------------------
   * ROW ELIGIBILITY ACTION
   * ------------------------------------------------------------
   */
  const getActionLabel = (employee) => {
    return employee.eligible === "Yes"
      ? "Update to Not Eligible"
      : "Update to Eligible";
  };

  return (
    <div className="em-eligibility-list">
      {/* ======================================================
          HEADER
          ====================================================== */}

      <div className="em-eligibility-header">
        <div className="em-eligibility-stats">
          <div>
            <strong>{activeEmployees.length}</strong>
            <span>Total</span>
          </div>

          <div>
            <strong>{eligibleCount}</strong>
            <span>Eligible</span>
          </div>

          <div>
            <strong>{notEligibleCount}</strong>
            <span>Not Eligible</span>
          </div>
        </div>

        <div className="em-eligibility-actions">
          {/* ==================================================
              SEARCH
              ================================================== */}

          <div className="em-search">
            <Search size={14} />

            <input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search employee..."
            />
          </div>

          {/* ==================================================
              3-LINE MENU
              ================================================== */}

          <div
            ref={menuRef}
            className="em-menu-wrapper"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="em-btn em-btn-ghost"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <Menu size={16} />
            </button>

            {menuOpen && (
              <div
                className="em-menu-dropdown"
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}
              >
                {/* Download Template */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDownloadTemplate();
                  }}
                >
                  <Download size={14} />
                  Download Template
                </button>

                {/* Import Eligibility (only when the user may write) */}
                {onImport && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={14} />
                    Import Eligibility
                  </button>
                )}

                {/* Export Visible */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onExport(rows);
                  }}
                >
                  <Download size={14} />
                  Export Visible
                </button>

                {/* Audit History */}
                {onAuditHistory && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onAuditHistory?.();
                    }}
                  >
                    <History size={14} />
                    Audit History
                  </button>
                )}
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
                  onImport?.(file);
                }

                event.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      {/* ======================================================
          TABLE
          ====================================================== */}

      <div className="em-grid-wrap">
        <table className="em-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key}>
                  <div className="em-th-inner">
                    <span>{column.label}</span>

                    <ColumnFilter
                      column={column}
                      rows={activeEmployees}
                      value={filters[column.key]}
                      onChange={(value) =>
                        handleFilterChange(column.key, value)
                      }
                    />
                  </div>
                </th>
              ))}

              {onChangeEligibility && <th>Action</th>}
            </tr>
          </thead>

          <tbody>
            {paginatedRows.map((employee) => (
              <tr key={employee.empId}>
                {/* EMPLOYEE */}
                <td>
                  <div className="em-name-cell">
                    <strong>{employee.name}</strong>
                    <span>{employee.empId}</span>
                  </div>
                </td>

                {/* APPRAISAL YEAR */}
                <td>Apr-26</td>

                {/* ORGANIZATION */}
                <td>{employee.organization}</td>

                {/* DESIGNATION */}
                <td>{employee.designation}</td>

                {/* DOJ */}
                <td>{fmtDoj(employee.doj)}</td>

                {/* ELIGIBILITY */}
                <td>
                  <span
                    className={`em-elig-badge ${
                      employee.eligible === "Yes" ? "yes" : "no"
                    }`}
                  >
                    {employee.eligible === "Yes" ? "Eligible" : "Not Eligible"}
                  </span>
                </td>

                {/* REASON */}
                <td>
                  <div className="em-reason">
                    <span title="Not saved: there is no backend column for the reason">
                      {employee.eligibleReason || "—"}
                    </span>

                    {employee.manualOverride && <small>Manual</small>}
                  </div>
                </td>

                {/* ACTION (only when the user may write) */}
                {onChangeEligibility && (
                  <td>
                    <button
                      type="button"
                      className="em-change-btn"
                      onClick={() => onChangeEligibility(employee)}
                    >
                      {getActionLabel(employee)}
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {!paginatedRows.length && (
              <tr>
                <td colSpan={8} className="em-empty">
                  No eligibility records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ======================================================
          PAGINATION
          ====================================================== */}

      <div className="em-pagination">
        <div className="em-pagination-info">
          Showing{" "}
          <strong>
            {startRecord}-{endRecord}
          </strong>{" "}
          of <strong>{rows.length}</strong> employees
        </div>

        <div className="em-pagination-controls">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (page) => (
              <button
                key={page}
                type="button"
                className={page === safePage ? "active" : ""}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
