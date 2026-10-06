
import { useEffect, useMemo, useState } from "react";

const COLUMNS = [
  { key: "status", label: "Status" },
  { key: "designation", label: "Designation" },
  { key: "organization", label: "Organization" },
  { key: "doj", label: "Date of Joining" },
  { key: "orgExp", label: "Org Exp" },
  { key: "totalExp", label: "Total Exp" },
  { key: "reportingManager", label: "Reporting Manager" },
  { key: "compManager", label: "Comp Manager" },
  { key: "superManager", label: "Super Manager" },
  { key: "managerMail", label: "Manager Email" },
  { key: "superManagerMail", label: "Super Manager Email" },
];

function getEmployeeId(employee) {
  return String(
    employee?.empId ??
      employee?.employeeId ??
      employee?.EMP_ID ??
      employee?.["EMP ID"] ??
      "",
  ).trim();
}

function getEmployeeName(employee) {
  return (
    employee?.empName ??
    employee?.employeeName ??
    employee?.name ??
    employee?.EMP_NAME ??
    employee?.["EMP Name"] ??
    "-"
  );
}

function getValue(employee, key) {
  let value = employee?.[key];

  if (key === "orgExp") {
    value =
      employee?.orgExp ??
      employee?.wissen_experience ??
      employee?.wissenExperience ??
      "";
  }

  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return value;
}

function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

function StatusBadge({ status }) {
  const isActive = normalizeStatus(status) === "active";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "68px",
        padding: "3px 9px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: isActive ? "#dcfce7" : "#fee2e2",
        color: isActive ? "#15803d" : "#dc2626",
        border: `1px solid ${isActive ? "#86efac" : "#fca5a5"}`,
      }}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function EmployeeRosterTable({
  rows = [],
  filters = {},
  setFilters,
  currentPage = 1,
  setCurrentPage,
  totalPages = 1,
  totalCount = 0,
  onToggleStatus,
  onBulkStatusChange,
  statusUpdatingIds = new Set(),
  bulkStatusUpdating = false,
  canEdit = true,
}) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(new Set());

  /*
   * Existing filtering behaviour.
   * Only the displayed rows on the current page are filtered.
   */
  const filteredRows = useMemo(() => {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.filter((employee) => {
      return COLUMNS.every((column) => {
        const filterValue = String(filters?.[column.key] ?? "")
          .trim()
          .toLowerCase();

        if (!filterValue) {
          return true;
        }

        const employeeValue = String(getValue(employee, column.key))
          .trim()
          .toLowerCase();

        return employeeValue.includes(filterValue);
      });
    });
  }, [rows, filters]);

  /*
   * Keep selection only for employees currently visible.
   */
  useEffect(() => {
    const visibleIds = new Set(
      filteredRows.map((employee) => getEmployeeId(employee)).filter(Boolean),
    );

    setSelectedEmployeeIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));

      if (next.size === current.size) {
        return current;
      }

      return next;
    });
  }, [filteredRows]);

  const visibleEmployeeIds = useMemo(() => {
    return filteredRows
      .map((employee) => getEmployeeId(employee))
      .filter(Boolean);
  }, [filteredRows]);

  const allVisibleSelected =
    visibleEmployeeIds.length > 0 &&
    visibleEmployeeIds.every((id) => selectedEmployeeIds.has(id));

  const someVisibleSelected = visibleEmployeeIds.some((id) =>
    selectedEmployeeIds.has(id),
  );

  /*
   * Select / unselect one employee.
   */
  const toggleEmployeeSelection = (employeeId) => {
    const normalizedId = String(employeeId ?? "").trim();

    if (!normalizedId) {
      return;
    }

    setSelectedEmployeeIds((current) => {
      const next = new Set(current);

      if (next.has(normalizedId)) {
        next.delete(normalizedId);
      } else {
        next.add(normalizedId);
      }

      return next;
    });
  };

  /*
   * Select / unselect all employees currently visible
   * on this page.
   */
  const toggleSelectAll = () => {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleEmployeeIds.forEach((id) => {
          next.delete(id);
        });
      } else {
        visibleEmployeeIds.forEach((id) => {
          next.add(id);
        });
      }

      return next;
    });
  };

  /*
   * Bulk Active / Inactive.
   */
  const handleBulkStatus = async (status) => {
    const selectedEmployees = filteredRows.filter((employee) =>
      selectedEmployeeIds.has(getEmployeeId(employee)),
    );

    if (selectedEmployees.length === 0) {
      return;
    }

    await onBulkStatusChange?.(status, selectedEmployees);

    setSelectedEmployeeIds(new Set());
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) {
      return;
    }

    setCurrentPage?.(page);
  };

  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
      }}
    >
      <table
        className="em-table"
        style={{
          width: "100%",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            {/* =====================================================
                SELECTION COLUMN
            ====================================================== */}
            {canEdit && (
            <th
              style={{
                whiteSpace: "nowrap",
                width: "105px",
                minWidth: "105px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(element) => {
                    if (element) {
                      element.indeterminate =
                        !allVisibleSelected && someVisibleSelected;
                    }
                  }}
                  onChange={toggleSelectAll}
                  disabled={filteredRows.length === 0 || bulkStatusUpdating}
                  title="Select all"
                  style={{
                    width: "15px",
                    height: "15px",
                    cursor:
                      filteredRows.length === 0 || bulkStatusUpdating
                        ? "not-allowed"
                        : "pointer",
                  }}
                />

                <span>Select</span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "5px",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleBulkStatus("Active")}
                  disabled={!someVisibleSelected || bulkStatusUpdating}
                  style={{
                    border: "1px solid #86efac",
                    backgroundColor: "#dcfce7",
                    color: "#15803d",
                    borderRadius: "4px",
                    padding: "2px 5px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor:
                      !someVisibleSelected || bulkStatusUpdating
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !someVisibleSelected || bulkStatusUpdating ? 0.5 : 1,
                  }}
                  title="Set selected employees Active"
                >
                  Active
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkStatus("Inactive")}
                  disabled={!someVisibleSelected || bulkStatusUpdating}
                  style={{
                    border: "1px solid #fca5a5",
                    backgroundColor: "#fee2e2",
                    color: "#dc2626",
                    borderRadius: "4px",
                    padding: "2px 5px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor:
                      !someVisibleSelected || bulkStatusUpdating
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !someVisibleSelected || bulkStatusUpdating ? 0.5 : 1,
                  }}
                  title="Set selected employees Inactive"
                >
                  Inactive
                </button>
              </div>
            </th>
            )}

            {/* =====================================================
                EMPLOYEE COLUMN
                EMP ID + NAME remain together.
            ====================================================== */}
            <th
              style={{
                whiteSpace: "nowrap",
                minWidth: "180px",
              }}
            >
              Employee
            </th>

            {/* =====================================================
                EXISTING COLUMNS
            ====================================================== */}
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                style={{
                  whiteSpace: "nowrap",
                }}
              >
                {column.label}
              </th>
            ))}

            {/* =====================================================
                ACTION COLUMN
                ALWAYS LAST.
            ====================================================== */}
            {canEdit && (
            <th
              style={{
                whiteSpace: "nowrap",
                minWidth: "115px",
              }}
            >
              Action
            </th>
            )}
          </tr>
        </thead>

        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length + (canEdit ? 2 : 1)}
                style={{
                  textAlign: "center",
                  padding: "24px",
                }}
              >
                No employees found.
              </td>
            </tr>
          ) : (
            filteredRows.map((employee) => {
              const employeeId = getEmployeeId(employee);
              const employeeName = getEmployeeName(employee);

              const status = String(employee?.status ?? "Inactive").trim();

              const isActive = normalizeStatus(status) === "active";

              const isSelected = selectedEmployeeIds.has(employeeId);

              const isUpdating =
                statusUpdatingIds?.has?.(employeeId) || bulkStatusUpdating;

              return (
                <tr key={employeeId || employeeName}>
                  {/* =================================================
                      SELECTION CELL
                  ================================================== */}
            {canEdit && (
                  <td
                    style={{
                      width: "105px",
                      minWidth: "105px",
                      textAlign: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleEmployeeSelection(employeeId)}
                      disabled={bulkStatusUpdating}
                      title={`Select ${employeeName}`}
                      style={{
                        width: "15px",
                        height: "15px",
                        cursor: bulkStatusUpdating ? "not-allowed" : "pointer",
                      }}
                    />
                  </td>
            )}

                  {/* =================================================
                      EMPLOYEE CELL
                      EMP ID + NAME
                  ================================================== */}
                  <td
                    style={{
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {employeeName}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          color: "#6b7280",
                        }}
                      >
                        {employeeId || "-"}
                      </span>
                    </div>
                  </td>

                  {/* =================================================
                      EXISTING COLUMNS
                  ================================================== */}
                  {COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        whiteSpace: "nowrap",
                      }}
                    >
                      {column.key === "status" ? (
                        <StatusBadge status={status} />
                      ) : (
                        getValue(employee, column.key)
                      )}
                    </td>
                  ))}

                  {/* =================================================
                      ACTION - LAST COLUMN
                      NO CHECKBOX HERE.
                  ================================================== */}
            {canEdit && (
                  <td>
                    <button
                      type="button"
                      onClick={() => onToggleStatus?.(employee)}
                      disabled={isUpdating}
                      style={{
                        border: `1px solid ${isActive ? "#fca5a5" : "#86efac"}`,
                        backgroundColor: isActive ? "#fee2e2" : "#dcfce7",
                        color: isActive ? "#dc2626" : "#15803d",
                        borderRadius: "5px",
                        padding: "5px 9px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: isUpdating ? "not-allowed" : "pointer",
                        opacity: isUpdating ? 0.6 : 1,
                        minWidth: "85px",
                      }}
                    >
                      {isUpdating
                        ? "Saving..."
                        : isActive
                          ? "Set Inactive"
                          : "Set Active"}
                    </button>
                  </td>
            )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* ===========================================================
          PAGINATION
      ============================================================ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "#6b7280",
          }}
        >
          {totalCount > 0
            ? `Showing page ${currentPage} of ${totalPages} • ${totalCount} employees`
            : "No employees"}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <button
            type="button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || bulkStatusUpdating}
            style={{
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              borderRadius: "4px",
              padding: "5px 10px",
              cursor:
                currentPage <= 1 || bulkStatusUpdating
                  ? "not-allowed"
                  : "pointer",
              opacity: currentPage <= 1 || bulkStatusUpdating ? 0.5 : 1,
            }}
          >
            Previous
          </button>

          <span
            style={{
              fontSize: "12px",
              color: "#374151",
              minWidth: "55px",
              textAlign: "center",
            }}
          >
            {currentPage} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || bulkStatusUpdating}
            style={{
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              borderRadius: "4px",
              padding: "5px 10px",
              cursor:
                currentPage >= totalPages || bulkStatusUpdating
                  ? "not-allowed"
                  : "pointer",
              opacity:
                currentPage >= totalPages || bulkStatusUpdating ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmployeeRosterTable;
