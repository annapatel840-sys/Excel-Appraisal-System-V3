import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Clock3,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "";
  return value;
};

const STATUS_CLASS = {
  Upcoming: "acm-status-upcoming",
  Active: "acm-status-active",
  Closed: "acm-status-closed",
};

export function AppraisalCycleMasterPage() {
  const user = useCatalystUser();
  // Access rules (permissive when accessapi is unavailable) can only narrow this.
  const access = useAccess();
  const canManageCycles =
    String(user?.role || "").trim().toLowerCase() === "hr" &&
    access.canScreen("cycleMaster", "edit");
  const canAudit = access.canAction("viewAudit");
  const [cycles, setCycles] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // A failed refresh after a successful save keeps the existing table.
  const [refreshError, setRefreshError] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  const [editCycle, setEditCycle] = useState(null);
  const [remarksCycle, setRemarksCycle] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [newCycleOpen, setNewCycleOpen] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "",
    start: "",
    end: "",
  });

  const [remarksText, setRemarksText] = useState("");

  const [newForm, setNewForm] = useState({
    type: "Annual",
    from: "",
    to: "",
    start: "",
    end: "",
    remarks: "",
  });

  const generateCycleName = (type, start, end) => {
    if (!type || !start || !end) return "";

    const startDate = new Date(start + "T00:00:00");
    const endDate = new Date(end + "T00:00:00");

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return "";
    }

    // FY runs from April to March: Apr-26 to Mar-27 => FY26-27.
    const fiscalStartYear =
      startDate.getMonth() >= 3
        ? startDate.getFullYear()
        : startDate.getFullYear() - 1;
    const fiscalEndYear = fiscalStartYear + 1;
    const fy =
      "FY" +
      String(fiscalStartYear).slice(-2) +
      "-" +
      String(fiscalEndYear).slice(-2);

    return type + " Appraisal " + fy;
  };

  const loadData = useCallback(async () => {
    const [cycleRows, auditRows] = await Promise.all([
      payrollCycleRequest("cycles"),
      payrollCycleRequest("audit"),
    ]);
    setCycles(cycleRows);
    setAudit(auditRows.map((entry) => ({
      id: entry.id,
      cycleId: entry.cycleId,
      cycle: entry.cycle,
      action: entry.field,
      changedBy: entry.user,
      changedAt: entry.time,
      details: entry.details,
      remarks: entry.remarks,
    })));
    setLoadError("");
    setRefreshError("");
  }, []);

  useEffect(() => {
    let mounted = true;
    loadData()
      .catch((error) => {
        if (mounted) setLoadError(error.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadData]);

  const remarksHistory = useMemo(
    () => audit
      .filter((entry) =>
        entry.cycleId === remarksCycle?.id &&
        (entry.action === "Remarks changed" || entry.action === "Created cycle"),
      )
      .map((entry) => ({
        remarks: entry.remarks || "",
        changedBy: entry.changedBy,
        changedAt: entry.changedAt,
      }))
      .reverse(),
    [audit, remarksCycle],
  );

  const showBanner = (title, body, error = false) => {
    setBanner({ title, body, error });
  };

  const mutateCycle = async (resource, body, successTitle, successMessage) => {
    if (!canManageCycles) {
      showBanner("Permission denied", "HR role is required to administer appraisal cycles.", true);
      return false;
    }
    setSaving(true);
    try {
      await payrollCycleRequest(resource, { method: "POST", body });
    } catch (error) {
      showBanner("Unable to save appraisal cycle", error.message, true);
      setSaving(false);
      return false;
    }
    try {
      await loadData();
    } catch (error) {
      setRefreshError(`The change was saved, but the latest data could not be refreshed: ${error.message}`);
    }
    setSaving(false);
    showBanner(successTitle, successMessage);
    return true;
  };

  // Client-side overlap check (inclusive dates). The backend should enforce
  // this as well.
  const findOverlappingCycle = (start, end, excludeId) =>
    cycles.find(
      (cycle) =>
        cycle.id !== excludeId &&
        cycle.start &&
        cycle.end &&
        start <= cycle.end &&
        end >= cycle.start,
    );

  const handleStatusChange = async (cycleId, nextStatus) => {
    const cycle = cycles.find((item) => item.id === cycleId);
    if (!cycle || cycle.status === nextStatus) return;
    await mutateCycle(
      `cycles/status/${cycleId}`,
      { status: nextStatus },
      "Status updated",
      `${cycle.name} is now ${nextStatus}.`,
    );
  };

  const openEditCycle = (cycle) => {
    setEditCycle(cycle);
    setEditForm({
      name: cycle.name,
      start: cycle.start,
      end: cycle.end,
    });
  };

  const saveEditCycle = async () => {
    if (!editCycle) return;

    const name = editForm.name.trim();

    if (!name || name.length > 100 || !editForm.start || !editForm.end) {
      showBanner("Validation failed", "Cycle name (up to 100 characters), start date and end date are required.", true);
      return;
    }

    if (editForm.end <= editForm.start) {
      showBanner(
        "Validation failed",
        "End date must be after start date.",
        true,
      );
      return;
    }

    const editOverlap = findOverlappingCycle(editForm.start, editForm.end, editCycle.id);
    if (editOverlap) {
      showBanner(
        "Validation failed",
        `These dates overlap "${editOverlap.name}" (${formatDate(editOverlap.start)} – ${formatDate(editOverlap.end)}). Cycles cannot overlap.`,
        true,
      );
      return;
    }

    const saved = await mutateCycle(
      `cycles/update/${editCycle.id}`,
      { name, start: editForm.start, end: editForm.end },
      "Cycle updated",
      `${name} was updated successfully.`,
    );
    if (saved) setEditCycle(null);
  };

  const openRemarks = (cycle) => {
    setRemarksCycle(cycle);
    setRemarksText(cycle.remarks || "");
  };

  const saveRemarks = async () => {
    if (!remarksCycle) return;

    const remarks = remarksText.trim();
    if (remarks.length > 10000) {
      showBanner("Validation failed", "Remarks cannot exceed 10,000 characters.", true);
      return;
    }
    const saved = await mutateCycle(
      `cycles/remarks/${remarksCycle.id}`,
      { remarks },
      "Remarks updated",
      `${remarksCycle.name} remarks were saved.`,
    );
    if (saved) setRemarksCycle(null);
  };

  const handleArchive = async (cycle) => {
    await mutateCycle(
      `cycles/archive/${cycle.id}`,
      { archived: !cycle.archived },
      cycle.archived ? "Cycle unarchived" : "Cycle archived",
      `${cycle.name} was ${cycle.archived ? "unarchived" : "archived"}.`,
    );
  };

  const handleDelete = async (cycle) => {
    const confirmed = window.confirm(
      `Delete "${cycle.name}"? This action cannot be undone.`,
    );
    if (!confirmed) return;
    await mutateCycle(
      `cycles/delete/${cycle.id}`,
      {},
      "Cycle deleted",
      `${cycle.name} was deleted.`,
    );
  };

  const createCycle = async () => {
    const name = generateCycleName(newForm.type, newForm.from, newForm.to);

    if (!newForm.type || !name || name.length > 100 || !newForm.from || !newForm.to || !newForm.start || !newForm.end) {
      showBanner("Validation failed", "Cycle name (up to 100 characters), start date and end date are required.", true);
      return;
    }

    if (newForm.to <= newForm.from) {
      showBanner(
        "Validation failed",
        "To date must be after From date.",
        true,
      );
      return;
    }

    if (newForm.end <= newForm.start) {
      showBanner(
        "Validation failed",
        "End date must be after start date.",
        true,
      );
      return;
    }

    const newOverlap = findOverlappingCycle(newForm.start, newForm.end, null);
    if (newOverlap) {
      showBanner(
        "Validation failed",
        `These dates overlap "${newOverlap.name}" (${formatDate(newOverlap.start)} – ${formatDate(newOverlap.end)}). Cycles cannot overlap.`,
        true,
      );
      return;
    }

    if (newForm.remarks.length > 10000) {
      showBanner("Validation failed", "Remarks cannot exceed 10,000 characters.", true);
      return;
    }
    const saved = await mutateCycle(
      "cycles/create",
      { name, start: newForm.start, end: newForm.end, remarks: newForm.remarks.trim() },
      "Cycle created",
      `${name} was created as Upcoming.`,
    );
    if (saved) {
      setNewCycleOpen(false);
      setNewForm({ type: "Annual", from: "", to: "", start: "", end: "", remarks: "" });
    }
  };

  return (
    <div className="acm-page">
      <style>{`
        .acm-page {
          width: 100%;
          font-family: Arial, sans-serif;
          color: #172033;
          background: #fff;
        }

        .acm-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 14px 18px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          margin-bottom: 14px;
        }

        .acm-title {
          margin: 0;
          font-size: 19px;
          font-weight: 700;
        }

        .acm-subtitle {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 12px;
        }

        .acm-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .acm-btn {
          border: 1px solid #d8dee9;
          background: #fff;
          color: #27364d;
          border-radius: 7px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .acm-btn:hover {
          background: #f8fafc;
        }

        .acm-btn-primary {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }

        .acm-btn-primary:hover {
          background: #1d4ed8;
        }

        .acm-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 11px 13px;
          margin-bottom: 14px;
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
          border-radius: 8px;
          font-size: 12px;
        }

        .acm-banner.error {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .acm-banner strong {
          display: block;
          margin-bottom: 2px;
        }

        .acm-banner span {
          color: #475569;
        }

        .acm-banner-close {
          margin-left: auto;
          border: 0;
          background: transparent;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        .acm-table-wrap {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          overflow-x: auto;
          background: #fff;
        }

        .acm-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 920px;
        }

        .acm-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          text-align: left;
          padding: 11px 12px;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }

        .acm-table td {
          padding: 11px 12px;
          border-bottom: 1px solid #eef2f7;
          font-size: 12px;
          vertical-align: middle;
        }

        .acm-table tr:last-child td {
          border-bottom: 0;
        }

        .acm-cycle-name {
          font-weight: 700;
          color: #1e293b;
        }

        .acm-muted {
          color: #64748b;
        }

        .acm-status {
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 700;
          border: 0;
          cursor: pointer;
        }

        .acm-status-upcoming {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .acm-status-active {
          background: #ecfdf5;
          color: #047857;
        }

        .acm-status-closed {
          background: #f1f5f9;
          color: #475569;
        }

        .acm-select-status {
          border: 1px solid #d8dee9;
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 11px;
          background: #fff;
        }

        .acm-icon-btn {
          border: 1px solid #e2e8f0;
          background: #fff;
          border-radius: 6px;
          padding: 6px;
          cursor: pointer;
          color: #475569;
          display: inline-flex;
        }

        .acm-icon-btn:hover {
          background: #f8fafc;
        }

        .acm-icon-btn.delete:hover {
          color: #dc2626;
          border-color: #fecaca;
          background: #fef2f2;
        }

        .acm-empty {
          text-align: center;
          padding: 35px;
          color: #64748b;
          font-size: 13px;
        }

        .acm-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .acm-modal {
          width: min(560px, 100%);
          max-height: 90vh;
          overflow: auto;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
        }

        .acm-modal-wide {
          width: min(820px, 100%);
        }

        .acm-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px 17px;
          border-bottom: 1px solid #e5e7eb;
        }

        .acm-modal-header h3 {
          margin: 0;
          font-size: 15px;
        }

        .acm-modal-close {
          border: 0;
          background: transparent;
          cursor: pointer;
          color: #64748b;
        }

        .acm-modal-body {
          padding: 17px;
        }

        .acm-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 17px;
          border-top: 1px solid #e5e7eb;
        }

        .acm-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
        }

        .acm-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .acm-field.full {
          grid-column: 1 / -1;
        }

        .acm-field label {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
        }

        .acm-field input,
        .acm-field textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d8dee9;
          border-radius: 7px;
          padding: 9px 10px;
          font-size: 12px;
          outline: none;
        }

        .acm-field textarea {
          min-height: 90px;
          resize: vertical;
        }

        .acm-history {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .acm-history-item {
          padding: 10px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #f8fafc;
        }

        .acm-history-item strong {
          display: block;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .acm-history-meta {
          font-size: 10px;
          color: #64748b;
        }

        .acm-audit-table {
          width: 100%;
          border-collapse: collapse;
        }

        .acm-audit-table th,
        .acm-audit-table td {
          padding: 9px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
          font-size: 11px;
          vertical-align: top;
        }

        .acm-audit-table th {
          background: #f8fafc;
          color: #475569;
        }

        @media (max-width: 700px) {
          .acm-topbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .acm-form-grid {
            grid-template-columns: 1fr;
          }

          .acm-field.full {
            grid-column: auto;
          }
        }
      `}</style>

      <div className="acm-topbar">
        <div>
          <h2 className="acm-title">Appraisal Cycle Master</h2>
          <p className="acm-subtitle">
            Manage appraisal cycles, activation, remarks and audit history.
          </p>
        </div>

        <div className="acm-actions">
          {canAudit && (
            <button
              type="button"
              className="acm-btn"
              disabled={loading}
              onClick={() => setAuditOpen(true)}
            >
              <History size={14} />
              Audit Trail
            </button>
          )}

          {canManageCycles && (
            <button
              type="button"
              className="acm-btn acm-btn-primary"
              disabled={loading || saving}
              onClick={() => setNewCycleOpen(true)}
            >
              <Plus size={14} />
              New Cycle
            </button>
          )}
        </div>
      </div>

      {loading && <div className="acm-empty">Loading appraisal cycles…</div>}
      {!loading && loadError && (
        <div className="acm-banner error" role="alert">
          <AlertCircle size={17} />
          <div>
            <strong>Unable to load appraisal cycle data</strong>
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            className="acm-btn"
            onClick={() => {
              setLoading(true);
              loadData()
                .catch((error) => setLoadError(error.message))
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !loadError && refreshError && (
        <div className="acm-banner error" role="alert">
          <AlertCircle size={17} />
          <div>
            <strong>Data may be out of date</strong>
            <span>{refreshError}</span>
          </div>
          <button
            type="button"
            className="acm-btn"
            onClick={() => {
              loadData().catch((error) =>
                setRefreshError(`The latest data could not be refreshed: ${error.message}`),
              );
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!canManageCycles && !loading && !loadError && (
        <div className="acm-banner">
          <div>
            <strong>Read-only access</strong>
            <span>HR role is required to administer appraisal cycles.</span>
          </div>
        </div>
      )}

      {banner && (
        <div className={`acm-banner ${banner.error ? "error" : ""}`}>
          {banner.error ? (
            <AlertCircle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}

          <div>
            <strong>{banner.title}</strong>
            <span>{banner.body}</span>
          </div>

          <button
            type="button"
            className="acm-banner-close"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="acm-table-wrap">
        {!loading && !loadError && cycles.length === 0 ? (
          <div className="acm-empty">No appraisal cycles found.</div>
        ) : !loading && !loadError ? (
          <table className="acm-table">
            <thead>
              <tr>
                <th>Cycle</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>Last changed by</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.id}>
                  <td>
                    <div className="acm-cycle-name">{cycle.name}</div>
                  </td>

                  <td>{formatDate(cycle.start)}</td>

                  <td>{formatDate(cycle.end)}</td>

                  <td>
                    {canManageCycles ? (
                      <select
                        className={`acm-select-status ${STATUS_CLASS[cycle.status] || ""}`}
                        value={cycle.status}
                        disabled={saving || cycle.archived}
                        onChange={(event) =>
                          handleStatusChange(cycle.id, event.target.value)
                        }
                      >
                        <option value="Upcoming">Upcoming</option>
                        <option value="Active">Active</option>
                        <option value="Closed">Closed</option>
                      </select>
                    ) : (
                      <span className={`acm-status ${STATUS_CLASS[cycle.status] || ""}`}>
                        {cycle.status}
                      </span>
                    )}
                    {cycle.archived && <div className="acm-muted">Archived</div>}
                  </td>

                  <td>
                    <span className="acm-muted">{cycle.remarks || "—"}</span>
                  </td>

                  <td>
                    <div>{cycle.changedBy}</div>
                    <div className="acm-muted">
                      {formatDateTime(cycle.changedAt)}
                    </div>
                  </td>

                  <td>
                    {canManageCycles ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="acm-icon-btn"
                          disabled={saving}
                          aria-label={`Actions for ${cycle.name}`}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end" className="min-w-[160px]">
                        <DropdownMenuItem
                          disabled={saving || cycle.archived}
                          onSelect={() => openEditCycle(cycle)}
                        >
                          <Pencil />
                          Edit Cycle
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          disabled={saving || cycle.archived}
                          onSelect={() => openRemarks(cycle)}
                        >
                          <Clock3 />
                          Edit Remarks
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          disabled={saving}
                          onSelect={() => handleArchive(cycle)}
                        >
                          {cycle.archived ? <ArchiveRestore /> : <Archive />}
                          {cycle.archived ? "Unarchive Cycle" : "Archive Cycle"}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          disabled={saving || cycle.archived}
                          className="text-red-600 focus:text-red-600"
                          onSelect={() => handleDelete(cycle)}
                        >
                          <Trash2 />
                          Delete Cycle
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {editCycle && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal">
            <div className="acm-modal-header">
              <h3>Edit Cycle</h3>

              <button
                type="button"
                className="acm-modal-close"
                disabled={saving}
                onClick={() => setEditCycle(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div className="acm-form-grid">
                <div className="acm-field full">
                  <label>Cycle Name</label>
                  <input
                    disabled={saving}
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>Start Date</label>
                  <input
                    type="date"
                    disabled={saving}
                    value={editForm.start}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        start: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>End Date</label>
                  <input
                    type="date"
                    disabled={saving}
                    value={editForm.end}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        end: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                disabled={saving}
                onClick={() => setEditCycle(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="acm-btn acm-btn-primary"
                disabled={saving}
                onClick={saveEditCycle}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {remarksCycle && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal">
            <div className="acm-modal-header">
              <h3>Edit Remarks</h3>

              <button
                type="button"
                className="acm-modal-close"
                disabled={saving}
                onClick={() => setRemarksCycle(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div className="acm-field">
                <label>{remarksCycle.name}</label>

                <textarea
                  disabled={saving}
                  value={remarksText}
                  onChange={(event) => setRemarksText(event.target.value)}
                />
              </div>

              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  Remarks History
                </div>

                <div className="acm-history">
                  {remarksHistory.map((item, index) => (
                      <div
                        className="acm-history-item"
                        key={`${remarksCycle.id}-${index}`}
                      >
                        <strong>{item.remarks || "No remarks"}</strong>

                        <div className="acm-history-meta">
                          {item.changedBy} · {item.changedAt}
                        </div>
                      </div>
                    ))}
                  {!remarksHistory.length && (
                    <div className="acm-muted">No remarks history yet.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                disabled={saving}
                onClick={() => setRemarksCycle(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="acm-btn acm-btn-primary"
                disabled={saving}
                onClick={saveRemarks}
              >
                {saving ? "Saving…" : "Save Remarks"}
              </button>
            </div>
          </div>
        </div>
      )}

      {auditOpen && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal acm-modal-wide">
            <div className="acm-modal-header">
              <h3>Audit Trail</h3>

              <button
                type="button"
                className="acm-modal-close"
                onClick={() => setAuditOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div style={{ overflowX: "auto" }}>
                <table className="acm-audit-table">
                  <thead>
                    <tr>
                      <th>Cycle</th>
                      <th>Action</th>
                      <th>Changed by</th>
                      <th>Changed at</th>
                      <th>Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {audit.map((item) => (
                      <tr key={item.id}>
                        <td>{item.cycle}</td>
                        <td>{item.action}</td>
                        <td>{item.changedBy}</td>
                        <td>{item.changedAt}</td>
                        <td>{item.details || item.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                onClick={() => setAuditOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {newCycleOpen && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal">
            <div className="acm-modal-header">
              <h3>New Cycle</h3>

              <button
                type="button"
                className="acm-modal-close"
                disabled={saving}
                onClick={() => setNewCycleOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div className="acm-form-grid">
                <div className="acm-field">
                  <label>Cycle Type</label>

                  <select
                    disabled={saving}
                    value={newForm.type}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1px solid #d8dee9",
                      borderRadius: "7px",
                      padding: "9px 10px",
                      fontSize: "12px",
                      background: "#fff",
                    }}
                  >
                    <option value="Annual">Annual</option>
                    <option value="Exceptional">Exceptional</option>
                  </select>
                </div>

                <div className="acm-field">
                  <label>Cycle Name</label>
                  <input
                    disabled
                    value={generateCycleName(newForm.type, newForm.from, newForm.to)}
                    placeholder="Generated from From and To"
                  />
                </div>

                <div className="acm-field">
                  <label>From</label>

                  <input
                    type="date"
                    disabled={saving}
                    value={newForm.from}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        from: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>To</label>

                  <input
                    type="date"
                    disabled={saving}
                    value={newForm.to}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        to: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>Start Date</label>

                  <input
                    type="date"
                    disabled={saving}
                    value={newForm.start}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        start: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>End Date</label>

                  <input
                    type="date"
                    disabled={saving}
                    value={newForm.end}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        end: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field full">
                  <label>Remarks</label>

                  <textarea
                    disabled={saving}
                    value={newForm.remarks}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        remarks: event.target.value,
                      }))
                    }
                    placeholder="Optional remarks"
                  />
                </div>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                disabled={saving}
                onClick={() => setNewCycleOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="acm-btn acm-btn-primary"
                disabled={saving}
                onClick={createCycle}
              >
                {saving ? "Creating…" : "Create Cycle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppraisalCycleMasterPage;
