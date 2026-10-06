import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";
import * as XLSX from "xlsx";

import { COLUMNS } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";
import { cn } from "@/lib/utils";

const EDITABLE_COLUMNS = COLUMNS.filter(
  (column) => column.editable && !column.computed,
);

const NUMERIC_TYPES = new Set(["currency", "number", "decimal", "percent"]);

const MAX_PREVIEW_ROWS = 300;

const normalizeHeader = (value) =>
  String(value === null || value === undefined ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Emp IDs are matched on letters/digits only — this absorbs "EMP-001",
// "emp 001", "EMP001", stray whitespace, etc. all matching each other.
const normalizeEmpId = (value) =>
  String(value === null || value === undefined ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// Header text -> column key (accepts the label or the key)
const HEADER_TO_KEY = (() => {
  const map = new Map();

  EDITABLE_COLUMNS.forEach((column) => {
    map.set(normalizeHeader(column.label), column.key);
    map.set(normalizeHeader(column.key), column.key);
  });

  map.set("empid", "empId");
  map.set("employeeid", "empId");
  map.set("id", "empId");

  return map;
})();

const RECOGNIZED_HEADER_SET = new Set(HEADER_TO_KEY.keys());

// Returns the value to store, or undefined when the cell is not valid.
const cellToValue = (column, raw) => {
  if (raw === null || raw === undefined) {
    return "";
  }

  const text = String(raw).trim();

  if (text === "") {
    return "";
  }

  if (NUMERIC_TYPES.has(column.type)) {
    const number = Number(text.replace(/[₹,\s%]/g, ""));

    return Number.isFinite(number) ? number : undefined;
  }

  if (column.type === "enum") {
    const match = (column.options || []).find(
      (option) => String(option).toLowerCase() === text.toLowerCase(),
    );

    return match !== undefined ? match : undefined;
  }

  return text;
};

const readFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
};

// ============================================================
// HOOK
// ============================================================

export function useAppraisalImport({ onDone } = {}) {
  const { rows, updateCell, updateLinkedCells } = useAppraisal();

  const fileInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [changes, setChanges] = useState([]);
  const [unmatchedIds, setUnmatchedIds] = useState([]);

  const openImportPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const close = () => {
    setOpen(false);
    setChanges([]);
    setUnmatchedIds([]);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const sheetRows = await readFile(file);

      if (!sheetRows.length) {
        setChanges([]);
        setUnmatchedIds([]);
        setMessage(`${file.name} has no data rows.`);
        setOpen(true);
        return;
      }

      // --- Diagnose the header row up front ---
      const rawHeaders = Object.keys(sheetRows[0] || {});
      const unrecognizedHeaders = rawHeaders.filter(
        (header) => !RECOGNIZED_HEADER_SET.has(normalizeHeader(header)),
      );
      const recognizedDataHeaders = rawHeaders.filter((header) => {
        const key = HEADER_TO_KEY.get(normalizeHeader(header));
        return key && key !== "empId";
      });

      if (recognizedDataHeaders.length === 0) {
        setChanges([]);
        setUnmatchedIds([]);
        setMessage(
          `${file.name} — none of the column headers matched a known field. ` +
            `Detected headers: ${rawHeaders.join(", ") || "(none)"}. ` +
            `Expected column labels like: ${EDITABLE_COLUMNS.slice(0, 6)
              .map((c) => c.label)
              .join(", ")}...`,
        );
        setOpen(true);
        return;
      }

      const byEmpId = new Map(
        rows.map((row) => [normalizeEmpId(row.empId), row]),
      );

      const found = [];
      const unmatchedList = [];
      let invalid = 0;
      const skippedTitles = [];

      sheetRows.forEach((sheetRow) => {
        const mapped = {};

        Object.entries(sheetRow).forEach(([header, value]) => {
          const key = HEADER_TO_KEY.get(normalizeHeader(header));

          if (key) {
            mapped[key] = value;
          }
        });

        const rawEmpId = String(mapped.empId || "").trim();

        if (!rawEmpId) {
          return;
        }

        const row = byEmpId.get(normalizeEmpId(rawEmpId));

        if (!row) {
          unmatchedList.push(rawEmpId);
          return;
        }

        // Resolve promotion eligibility first (file value if valid, else the
        // current row) so the New Title rule doesn't depend on column order.
        const promotionColumn = EDITABLE_COLUMNS.find(
          (column) => column.key === "eligibleForPromotion",
        );
        const fileEligibility =
          promotionColumn && "eligibleForPromotion" in mapped
            ? cellToValue(promotionColumn, mapped.eligibleForPromotion)
            : undefined;
        const eligibility =
          fileEligibility !== undefined
            ? fileEligibility
            : row.eligibleForPromotion;

        EDITABLE_COLUMNS.forEach((column) => {
          if (!(column.key in mapped)) {
            return;
          }

          const nextValue = cellToValue(column, mapped[column.key]);

          if (nextValue === undefined) {
            invalid += 1;
            return;
          }

          // New Title only applies to employees eligible for promotion.
          if (
            column.key === "newTitle" &&
            nextValue !== "" &&
            eligibility !== "Yes"
          ) {
            skippedTitles.push(row.empId || row.name);
            return;
          }

          const before =
            row[column.key] === null || row[column.key] === undefined
              ? ""
              : String(row[column.key]);

          const after = String(nextValue);

          if (before === after) {
            return;
          }

          found.push({
            rowId: row.id,
            empId: row.empId,
            name: row.name,
            key: column.key,
            value: nextValue,
            label: column.label,
            before: before || "—",
            after: after || "—",
          });
        });
      });

      const notes = [];

      if (unmatchedList.length) {
        notes.push(
          `${unmatchedList.length} row(s) had no matching EMP ID (e.g. ${unmatchedList
            .slice(0, 5)
            .join(", ")})`,
        );
      }

      if (invalid) {
        notes.push(`${invalid} cell(s) skipped (invalid value)`);
      }

      if (skippedTitles.length) {
        notes.push(
          `${skippedTitles.length} New Title value(s) skipped because Eligible for Promotion is not "Yes" (e.g. ${skippedTitles
            .slice(0, 5)
            .join(", ")})`,
        );
      }

      if (unrecognizedHeaders.length) {
        notes.push(
          `columns not recognized and ignored: ${unrecognizedHeaders.join(", ")}`,
        );
      }

      const noteText = notes.length ? ` ${notes.join("; ")}.` : "";

      setChanges(found);
      setUnmatchedIds(unmatchedList);

      setMessage(
        found.length
          ? `${file.name} — ${found.length} cell${
              found.length === 1 ? "" : "s"
            } will change.${noteText}`
          : `${file.name} — no cell changes detected (matched rows already have these values).${noteText}`,
      );

      setOpen(true);
    } catch (error) {
      console.error("Appraisal import failed:", error);

      setChanges([]);
      setUnmatchedIds([]);
      setMessage(
        error?.message ||
          "That file could not be read. Use the exported sheet format.",
      );
      setOpen(true);
    }
  };

  const confirmImport = () => {
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    const hikeRows = new Map();

    changes.forEach((change) => {
      if (change.key === "hikePct" || change.key === "hikeAmount") {
        const entry = hikeRows.get(change.rowId) || {};

        entry[change.key] = change.value;
        hikeRows.set(change.rowId, entry);
        return;
      }

      if (change.key === "eligibleForPromotion" && change.value === "No") {
        updateLinkedCells(
          change.rowId,
          { eligibleForPromotion: "No", newTitle: null },
          "Import",
        );
        return;
      }

      updateCell(change.rowId, change.key, change.value, "Import");
    });

    hikeRows.forEach((entry, rowId) => {
      const row = rowsById.get(rowId);

      const basePayChange = changes.find(
        (change) =>
          change.rowId === rowId && change.key === "currentAnnualBasePay",
      );

      const basePay = Number(
        basePayChange ? basePayChange.value : row?.currentAnnualBasePay,
      );

      if ("hikePct" in entry) {
        const pct = Number(entry.hikePct) || 0;

        updateLinkedCells(
          rowId,
          {
            hikePct: entry.hikePct === "" ? "" : pct,
            hikeAmount:
              entry.hikePct === ""
                ? ""
                : Math.round((basePay || 0) * (pct / 100)),
          },
          "Import",
        );
      } else {
        const amount = Number(entry.hikeAmount) || 0;

        updateLinkedCells(
          rowId,
          {
            hikeAmount: entry.hikeAmount === "" ? "" : amount,
            hikePct:
              entry.hikeAmount === ""
                ? ""
                : basePay
                  ? Number(((amount / basePay) * 100).toFixed(1))
                  : 0,
          },
          "Import",
        );
      }
    });

    const count = changes.length;

    close();

    if (onDone) {
      onDone(count);
    }
  };

  const modal = open
    ? createPortal(
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-md bg-white shadow-xl">
            <div className="flex items-center justify-between bg-[#173b63] px-4 py-2.5 text-white">
              <span className="text-[13px] font-bold">
                Import appraisal sheet
              </span>

              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex size-6 items-center justify-center rounded hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="border-b border-[#e2e8f0] px-4 py-2.5 text-[12px] text-slate-700">
              {message}
            </div>

            {changes.length > 0 && (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#eef2f7] text-left text-[11px] font-bold text-[#24364d]">
                      <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">
                        Employee
                      </th>
                      <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">
                        Field
                      </th>
                      <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">
                        Change
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {changes.slice(0, MAX_PREVIEW_ROWS).map((change, index) => (
                      <tr
                        key={`${change.rowId}-${change.key}-${index}`}
                        className="border-b border-[#eef2f7]"
                      >
                        <td className="px-3 py-1.5 text-slate-700">
                          {change.name}
                          <span className="ml-1 text-[11px] text-slate-400">
                            {change.empId}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">
                          {change.label}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums">
                          <span className="text-slate-400">
                            {change.before}
                          </span>
                          {" → "}
                          <span className="font-semibold text-[#173b63]">
                            {change.after}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {changes.length > MAX_PREVIEW_ROWS && (
                  <div className="px-3 py-2 text-[11px] text-slate-500">
                    Showing the first {MAX_PREVIEW_ROWS} of {changes.length}{" "}
                    changes. All will be applied.
                  </div>
                )}
              </div>
            )}

            {!changes.length && unmatchedIds.length > 0 && (
              <div className="max-h-[220px] overflow-auto border-b border-[#e2e8f0] px-4 py-2.5">
                <div className="mb-1 text-[11px] font-semibold text-slate-600">
                  Unmatched EMP IDs from the file:
                </div>
                <div className="text-[11px] text-slate-500">
                  {unmatchedIds.join(", ")}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
              <button
                type="button"
                onClick={close}
                className="h-8 rounded border border-[#cbd5e1] bg-white px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-100"
              >
                {changes.length ? "Cancel" : "Close"}
              </button>

              {changes.length > 0 && (
                <button
                  type="button"
                  onClick={confirmImport}
                  className="h-8 rounded bg-[#173b63] px-3 text-[12px] font-semibold text-white hover:bg-[#122e4d]"
                >
                  Apply {changes.length} change
                  {changes.length === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const importUi = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFile}
      />

      {modal}
    </>
  );

  return { openImportPicker, importUi };
}

// ============================================================
// READY-MADE MENU ITEM (option B)
// ============================================================

export function ImportAppraisalButton({ className, onDone, onClick }) {
  const { openImportPicker, importUi } = useAppraisalImport({ onDone });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          openImportPicker();

          if (onClick) {
            onClick();
          }
        }}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100",
          className,
        )}
      >
        <Upload className="size-4 text-slate-500" />
        Import
      </button>

      {importUi}
    </>
  );
}
