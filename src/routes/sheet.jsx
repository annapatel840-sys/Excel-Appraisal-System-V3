import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  History,
  WalletCards,
  CircleDollarSign,
  Percent,
  Layers,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";
import { AppraisalGrid } from "@/components/appraisal/AppraisalGrid";
import { AuditPanel } from "@/components/appraisal/AuditTrail";
import { BulkEditDialog } from "@/components/appraisal/BulkEditDialog";
import { useAppraisalImport } from "@/components/appraisal/ImportAppraisalButton"; // <-- update path if your file is named differently

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import { useAppraisal } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";
import { useCatalystUser } from "@/lib/catalyst-auth";

import {
  applyFilters,
  describeFilter,
  isEmptyFilter,
  optionsFor as optionsForField,
} from "@/lib/appraisal-filters";

import { exportToExcel } from "@/lib/export-excel";
import { useAccess } from "@/lib/access-store";
import { useSettings } from "@/lib/settings-store";

// ============================================================
// BUDGET
// The real total comes from Budget Master (budget store). This demo
// value is only a fallback when that data is unavailable, and is
// labelled as an estimate in the header.
// ============================================================

const FALLBACK_BUDGET_ALLOCATED = 42500000; // ₹ 4.25 Cr (estimate)
const ONE_CRORE = 10000000;

const formatCrore = (amount) => `₹ ${(amount / ONE_CRORE).toFixed(2)} Cr`;

// ============================================================
// HEADER COUNTER
// ============================================================

function BudgetCounter({ label, value, valueClassName, title }) {
  return (
    <div
      className="shrink-0 border-l border-white/25 pl-4 text-right"
      title={title}
    >
      <span className="block whitespace-nowrap text-[10px] leading-tight text-white/75">
        {label}
      </span>

      <strong
        className={cn(
          "block whitespace-nowrap text-[15px] font-bold leading-tight text-white",
          valueClassName,
        )}
      >
        {value}
      </strong>
    </div>
  );
}

// ============================================================
// PAGE
// ============================================================

export function SheetPage() {
  const {
    rows,
    audit,
    error: loadError,
    saveError,
    clearSaveError,
  } = useAppraisal();
  const {
    totals: budgetMasterTotals,
    loading: budgetLoading,
    error: budgetError,
  } = useBudget();
  const { openImportPicker, importUi } = useAppraisalImport();
  const catalystUser = useCatalystUser();
  const role = String(catalystUser?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  const isHR = role.includes("hr");
  // Access rules (permissive when accessapi is unavailable).
  const access = useAccess();
  const { settings } = useSettings();
  const sheetEditable = access.canScreen("appraisalSheet", "edit");
  const canBulkEdit = sheetEditable && access.canAction("bulkEdit");
  const canImport = sheetEditable && access.canAction("importAppraisal");
  const canExport = access.canAction("exportGrid");
  const canViewAudit = access.canAction("viewAudit");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState({});
  const [bulkOpen, setBulkOpen] = useState(false);

  const [showHistory, setShowHistory] = useState(true);
  const [showEditedOnly, setShowEditedOnly] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const [auditOpen, setAuditOpen] = useState(false);
  const [lastEditedTarget, setLastEditedTarget] = useState("");

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const appraisalRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          String(row.status || "").trim().toLowerCase() === "active" &&
          String(row.eligibility || "").trim().toLowerCase() === "eligible",
      ),
    [rows],
  );

  const editedEmployeeIds = useMemo(
    () =>
      new Set(
        audit
          .filter(
            (entry) =>
              String(entry.appraisalYear || "Apr-26") === "Apr-26",
          )
          .map((entry) => String(entry.empId || "").trim())
          .filter(Boolean),
      ),
    [audit],
  );

  const filtered = useMemo(() => {
    const baseRows = showEditedOnly
      ? appraisalRows.filter((row) =>
          editedEmployeeIds.has(String(row.empId || "").trim()),
        )
      : appraisalRows;

    return applyFilters(baseRows, filters, search);
  }, [appraisalRows, editedEmployeeIds, filters, search, showEditedOnly]);

  const setFilter = (key, f) =>
    setFilters((prev) => {
      const next = { ...prev };

      if (!f) {
        delete next[key];
      } else {
        next[key] = f;
      }

      return next;
    });

  const selectedIds = filtered.filter((r) => selected[r.id]).map((r) => r.id);

  const activeFilters = Object.entries(filters).filter(
    ([, filter]) => !isEmptyFilter(filter),
  );

  const editedCount = useMemo(
    () =>
      appraisalRows.filter((row) =>
        editedEmployeeIds.has(String(row.empId || "").trim()),
      ).length,
    [appraisalRows, editedEmployeeIds],
  );

  const promotionCount = useMemo(
    () =>
      appraisalRows.filter(
        (row) =>
          String(row.eligibleForPromotion || "")
            .trim()
            .toLowerCase() === "yes",
      ).length,
    [appraisalRows],
  );
  const lastEditedEntry =
    audit.find(
      (entry) =>
        String(entry.appraisalYear || "Apr-26") === "Apr-26" &&
        String(entry.empId || "").trim(),
    ) || null;
  const lastEditedRow = lastEditedEntry
    ? rows.find(
        (row) => String(row.empId).trim() === String(lastEditedEntry.empId).trim(),
      )
    : null;

  // ============================================================
  // BUDGET NUMBERS
  // Consumed = Hike Amount + Total Bonus (Allocated PB + New PB + New RB)
  // for every employee, independent of search / column filters.
  // ============================================================

  const budgetConsumed = useMemo(
    () =>
      rows
        .filter(
        (row) =>
          String(row.status || "").trim().toLowerCase() === "active" &&
          String(row.eligibility || "").trim().toLowerCase() === "eligible",
      )
        .reduce(
          (sum, row) =>
            sum +
            (Number(row.hikeAmount) || 0) +
            (Number(row.allocatedPBAmount) || 0) +
            (Number(row.newPBToBeOffered) || 0) +
            (Number(row.newRB) || 0),
          0,
        ),
    [rows],
  );

  const realBudget =
    !budgetLoading && !budgetError ? Number(budgetMasterTotals?.updated) || 0 : 0;
  const budgetIsEstimate = realBudget <= 0;
  const budgetAllocated = budgetIsEstimate
    ? FALLBACK_BUDGET_ALLOCATED
    : realBudget;

  const budgetUtilisation = budgetAllocated
    ? (budgetConsumed / budgetAllocated) * 100
    : 0;

  const utilisationTone =
    budgetUtilisation > 100
      ? "text-[#ff9a8a]"
      : budgetUtilisation > 85
        ? "text-[#ffcf70]"
        : "";

  // ============================================================
  // HEADER: Show History + budget counters
  // ============================================================

  const budgetVertical = settings.menuPosition === "left";
  const budgetCollapsed = budgetVertical && settings.menuCollapsed;

  const headerActions = budgetCollapsed ? (
    <div className="flex flex-col items-center gap-1">
      <span title={`Budget Allocated: ${formatCrore(budgetAllocated)}`} className="flex size-7 items-center justify-center rounded-md text-white/85 hover:bg-white/10">
        <WalletCards className="size-4" />
      </span>
      <span title={`Consumed (Hikes + Bonuses): ${formatCrore(budgetConsumed)}`} className="flex size-7 items-center justify-center rounded-md text-white/85 hover:bg-white/10">
        <CircleDollarSign className="size-4" />
      </span>
      <span title={`Utilisation: ${budgetUtilisation.toFixed(1)}%`} className="flex size-7 items-center justify-center rounded-md text-white/85 hover:bg-white/10">
        <Percent className="size-4" />
      </span>
    </div>
  ) : (
    <div className={cn(
      "flex min-w-0",
      budgetVertical ? "w-full flex-col gap-2" : "items-center gap-4",
    )}>
      <BudgetCounter
        label={budgetIsEstimate ? "Budget Allocated (est.)" : "Budget Allocated"}
        title={
          budgetIsEstimate
            ? "Estimate — Budget Master data is unavailable"
            : "Total from Budget Master"
        }
        value={formatCrore(budgetAllocated)}
      />
      <BudgetCounter
        label="Consumed (Hikes + Bonuses)"
        title="Hike Amount + Total Bonus, this cycle"
        value={formatCrore(budgetConsumed)}
      />
      <BudgetCounter
        label="Utilisation"
        value={`${budgetUtilisation.toFixed(1)}%`}
        valueClassName={utilisationTone}
      />
    </div>
  );

  return (
    <>
      <AppShell headerActions={headerActions}>
        <div className={cn("flex min-h-0 flex-1 flex-col gap-2", budgetVertical && "pl-1 pr-0 pt-0")}>
          {(saveError || loadError) && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
            >
              <span>{saveError || loadError}</span>
              {saveError && (
                <button
                  type="button"
                  onClick={clearSaveError}
                  className="shrink-0 text-xs font-medium underline"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {/* TOOLBAR: search on the left, reset + menu on the right */}

          <div className="flex items-center gap-2 rounded-md border border-[#d9dee7] bg-white px-3 py-2">
            <div className="relative w-[320px]">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee name / ID / designation"
                className="h-9 border-[#cbd3df] bg-background pl-8 text-[13px]"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 px-3 text-[12px]"
                onClick={() => {
                  setFilters({});
                  setSearch("");
                  setShowEditedOnly(false);
                }}
                disabled={
                  activeFilters.length === 0 && !search && !showEditedOnly
                }
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>

              <button
                type="button"
                onClick={() => setShowHistory((previous) => !previous)}
                aria-pressed={showHistory}
                aria-label="Show History"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#17365d] bg-white px-3 text-[12px] font-medium text-[#17365d] hover:bg-[#f1f5f9]"
              >
                <History className="size-3.5" />
                <span>Show History</span>
                <span
                  className={cn(
                    "relative block h-[16px] w-[30px] rounded-full transition-colors duration-200",
                    showHistory ? "bg-[#3fae6a]" : "bg-[#5c7396]",
                  )}
                >
                  <span
                    className="absolute top-[2px] left-[2px] h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{
                      transform: showHistory
                        ? "translateX(14px)"
                        : "translateX(0)",
                    }}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowEditedOnly((previous) => !previous);
                  setSearch("");
                }}
                aria-pressed={showEditedOnly}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium",
                  showEditedOnly
                    ? "border-[#17365d] bg-[#17365d] text-white"
                    : "border-[#17365d] bg-white text-[#17365d] hover:bg-[#f1f5f9]",
                )}
                title="Filter to employees edited in this appraisal cycle"
              >
                <span>✎ Edited</span>
                <strong>{editedCount}</strong>
                <span
                  className={
                    showEditedOnly ? "text-white/70" : "text-slate-400"
                  }
                >
                  of {appraisalRows.length}
                </span>
              </button>

              <button type="button" onClick={() => {
                  setShowEditedOnly(false);
                  setFilters((previous) => ({
                    ...previous,
                    eligibleForPromotion: { kind: "enum", values: ["Yes"] },
                  }));
                  setSearch("");
                }} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#17365d] bg-white px-3 text-[12px] font-medium text-[#17365d] hover:bg-[#f1f5f9]" title="Show employees marked for promotion">
                <span>★ {promotionCount}</span><span className="text-slate-500">promotion</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!lastEditedRow) {
                    return;
                  }
                  setFilters({});
                  setSearch("");
                  setShowHistory(true);
                  setLastEditedTarget(String(lastEditedRow.empId).trim());
                }}
                className="flex h-9 min-w-0 max-w-[220px] shrink-0 items-center gap-1.5 rounded-full border border-[#17365d] bg-white px-3 text-[12px] font-medium text-[#17365d] hover:bg-[#f1f5f9]"
                title={lastEditedRow ? "Last edited: " + lastEditedRow.name : "No edits recorded"}
              >
                <span>↪ Last edited:</span>
                <span className="truncate">{lastEditedRow?.name || "—"}</span>
              </button>
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((previous) => !previous)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#17365d] bg-[#17365d] px-4 text-[13px] font-semibold text-white hover:bg-[#123056]"
                >
                  Menu
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      menuOpen && "rotate-180",
                    )}
                  />
                </button>

                {menuOpen && (
                  <div
                    className="absolute top-full right-0 z-50 mt-1.5 w-[200px] overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-lg"
                    role="menu"
                  >
                    {canBulkEdit && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-[#334155] hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          setMenuOpen(false);
                          setBulkOpen(true);
                        }}
                        disabled={selectedIds.length === 0}
                      >
                        <Layers className="size-4" />
                        <span>Bulk Edit ({selectedIds.length})</span>
                      </button>
                    )}

                    {canViewAudit && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-[#334155] hover:bg-[#f1f5f9]"
                        onClick={() => {
                          setMenuOpen(false);
                          setAuditOpen(true);
                        }}
                      >
                        <History className="size-4" />
                        <span>Audit ({audit.length})</span>
                      </button>
                    )}
                    {canImport && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-[#334155] hover:bg-[#f1f5f9]"
                        onClick={() => {
                          setMenuOpen(false);
                          openImportPicker();
                        }}
                      >
                        <Upload className="size-4" />
                        <span>Import</span>
                      </button>
                    )}

                    {canExport && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-[#334155] hover:bg-[#f1f5f9]"
                        onClick={() => {
                          exportToExcel(filtered, undefined, {
                            isHidden: access.isHidden,
                          }).catch((error) => {
                            console.error("Excel export failed:", error);
                            window.alert(
                              "Excel export failed: " +
                                (error?.message || "unknown error"),
                            );
                          });
                          setMenuOpen(false);
                        }}
                      >
                        <Download className="size-4" />
                        <span>Export</span>
                      </button>
                    )}
                    {!canBulkEdit && !canViewAudit && !canImport && !canExport && (
                      <div className="px-3 py-2.5 text-[12px] text-slate-400">
                        No actions available
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-0.5">
              {activeFilters.map(([key, f]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key, undefined)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                >
                  {describeFilter(key, f)}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}

          {showEditedOnly && (
            <div className="flex flex-wrap items-center gap-1.5 px-0.5">
              <button
                type="button"
                onClick={() => setShowEditedOnly(false)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
              >
                Edited employees: {editedCount}
                <X className="size-3" />
              </button>
            </div>
          )}

          <AppraisalGrid
            verticalLayout={budgetVertical}
            rows={filtered}
            filters={filters}
            setFilter={setFilter}
            optionsFor={(key) => optionsForField(key, rows)}
            selected={selected}
            toggleSelected={(id, on) =>
              setSelected((prev) => {
                const next = { ...prev };

                if (on) {
                  next[id] = true;
                } else {
                  delete next[id];
                }

                return next;
              })
            }
            toggleAll={(on, ids) =>
              // Only the rows the grid is showing (current page); other
              // pages keep their selections.
              setSelected((prev) => {
                const next = { ...prev };

                ids.forEach((id) => {
                  if (on) {
                    next[id] = true;
                  } else {
                    delete next[id];
                  }
                });

                return next;
              })
            }
            showHistory={showHistory}
            setShowHistory={setShowHistory}
            focusEmployeeId={lastEditedTarget}
            onFocusEmployeeHandled={() => setLastEditedTarget("")}
            isTechEd={isTechEd}
            isHR={isHR}
            onRequest={(request) => {
              const key = request.type === "delegation" ? "appraisal-delegation-requests" : "appraisal-screen-requests";
              const current = JSON.parse(localStorage.getItem(key) || "[]");
              current.unshift({
                id: request.type.toUpperCase() + "-" + Date.now(),
                rowId: request.employee?.id || request.employee?.empId || "",
                empId: request.employee?.empId || "",
                empName: request.employee?.name || "",
                field: request.field || request.type,
                oldId: request.oldId || "",
                newId: request.newId || "",
                reason: "Requested from appraisal detail panel",
                byId: catalystUser?.name || catalystUser?.email || catalystUser?.user_id || "",
                byName: catalystUser?.name || catalystUser?.email || "Tech Ed",
                on: new Date().toISOString(),
                status: "Pending",
                decidedBy: "",
                decidedOn: "",
                remarks: "",
              });
              localStorage.setItem(key, JSON.stringify(current));
              window.alert(request.type === "delegation" ? "Delegation request sent to HR." : "Screen request sent.");
            }}
          />
        </div>
      </AppShell>

      <Dialog open={auditOpen && canViewAudit} onOpenChange={setAuditOpen}>
        <DialogContent
          className="flex max-h-[80vh] w-[90vw] max-w-3xl flex-col gap-0 overflow-hidden p-0"
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-[#e2e8f0] px-5 py-4">
            <DialogTitle className="text-sm font-semibold text-[#1e293b]">
              Compensation Audit Trail
            </DialogTitle>

            <p className="text-[11px] text-[#64748b]">
              {audit.length} changes recorded in this session
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <AuditPanel entries={audit} />
          </div>
        </DialogContent>
      </Dialog>

      <BulkEditDialog
        open={bulkOpen && canBulkEdit}
        onOpenChange={setBulkOpen}
        ids={selectedIds}
        onDone={() => setSelected({})}
      />

      {importUi}
    </>
  );
}
