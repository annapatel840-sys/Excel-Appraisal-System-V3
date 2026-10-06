import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  NUMBER_OPS,
  TEXT_OPS,
  fieldByKey,
  isEmptyFilter,
} from "@/lib/appraisal-filters";

/* ============================================================
   COLUMN FILTER
   - sort asc / desc
   - operator filter (text / number)
   - OR pick values (search + select all)
   - bulk edit this column  ->  ONLY for editable columns
   ============================================================ */

export function ColumnFilter({
  columnKey,
  filter,
  options = [],
  onChange,

  // sort (wired to the grid's group/sort handlers)
  sortDirection = null,
  onSortAsc,
  onSortDesc,
  onClearSort,

  // bulk edit
  bulkEditable = false,
  bulkRowCount = 0,
  onBulkApply,
}) {
  const meta = fieldByKey(columnKey);

  const [open, setOpen] = useState(false);

  // operator draft
  const [op, setOp] = useState("contains");
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");

  // pick-values draft
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);

  // bulk edit draft
  const [bulkValue, setBulkValue] = useState("");

  const isNumberColumn = meta?.kind === "number";
  const isEnumColumn = meta?.kind === "enum";

  const operators = useMemo(() => {
    if (isNumberColumn) {
      return NUMBER_OPS;
    }

    if (columnKey === "empId" || columnKey === "name") {
      return TEXT_OPS.filter((operator) => operator.value === "contains");
    }

    return TEXT_OPS;
  }, [isNumberColumn, columnKey]);

  // sync drafts whenever the popover opens or the applied filter changes
  useEffect(() => {
    if (!open) {
      return;
    }

    setSearch("");
    setBulkValue("");

    if (filter?.kind === "enum") {
      setPicked(filter.values || []);
      setOp(isNumberColumn ? "gt" : "contains");
      setValue("");
      setValue2("");
      return;
    }

    setPicked([]);

    setOp(filter?.op || (isNumberColumn ? "gt" : "contains"));
    setValue(filter?.value !== undefined ? filter.value : "");
    setValue2(filter?.value2 !== undefined ? filter.value2 : "");
  }, [open, filter, isNumberColumn]);

  if (!meta) {
    return null;
  }

  const filterActive = !!filter && !isEmptyFilter(filter);
  const triggerActive = filterActive || !!sortDirection;

  // Raw value is what the filter engine matches on; the label is prettified.
  const formatOption = (option) => {
    const text = String(option === null || option === undefined ? "" : option);

    if (!isNumberColumn || text.trim() === "") {
      return text;
    }

    const number = Number(text);

    return Number.isFinite(number) ? number.toLocaleString("en-IN") : text;
  };

  const visibleOptions = options
    .filter((option) => {
      if (!search.trim()) {
        return true;
      }

      const needle = search.trim().toLowerCase();

      const raw = String(
        option === null || option === undefined ? "" : option,
      ).toLowerCase();

      return (
        raw.includes(needle) ||
        formatOption(option).toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      if (isNumberColumn) {
        return (Number(a) || 0) - (Number(b) || 0);
      }

      return String(a).localeCompare(String(b));
    });

  const allVisibleSelected =
    visibleOptions.length > 0 &&
    visibleOptions.every((option) => picked.includes(option));

  const toggleSelectAll = (checked) => {
    if (checked) {
      const next = [...picked];

      visibleOptions.forEach((option) => {
        if (!next.includes(option)) {
          next.push(option);
        }
      });

      setPicked(next);
      return;
    }

    setPicked(picked.filter((item) => !visibleOptions.includes(item)));
  };

  const applyOperatorFilter = () => {
    if (String(value).trim() === "" && String(value2).trim() === "") {
      onChange(undefined);
      setOpen(false);
      return;
    }

    onChange(
      isNumberColumn
        ? { kind: "number", op, value, value2 }
        : { kind: "text", op, value },
    );

    setOpen(false);
  };

  const applyPickedValues = () => {
    onChange(picked.length ? { kind: "enum", values: picked } : undefined);
    setOpen(false);
  };

  const clearAll = () => {
    setPicked([]);
    setValue("");
    setValue2("");
    onChange(undefined);

    if (sortDirection && onClearSort) {
      onClearSort();
    }
  };

  const applyBulkEdit = () => {
    if (!onBulkApply) {
      return;
    }

    if (String(bulkValue).trim() === "") {
      return;
    }

    onBulkApply(bulkValue);
    setBulkValue("");
    setOpen(false);
  };

  const inputClass =
    "h-8 w-full rounded border border-[#cbd5e1] bg-white px-2 text-[12px] text-[#1e293b] outline-none focus:border-[#17365d] focus:ring-1 focus:ring-[#17365d]";

  const darkButtonClass =
    "h-8 w-full rounded bg-[#17365d] px-3 text-[12px] font-semibold text-white hover:bg-[#122b4a] disabled:opacity-50";
  const isSimpleTextColumn = columnKey === "empId" || columnKey === "name";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${meta.label}`}
          className={cn(
            "rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700",
            triggerActive && "bg-[#17365d]/12 text-[#17365d]",
          )}
        >
          <Filter className="size-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[300px] overflow-hidden p-0"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {/* SORT — hidden for empId / name */}

        {!isSimpleTextColumn && (
          <div className="flex border-b border-[#e2e8f0]">
            <button
              type="button"
              onClick={onSortAsc}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100",
                sortDirection === "asc" && "bg-[#e6eefb] text-[#17365d]",
              )}
            >
              <ChevronUp className="size-3.5" />
              Group ASC
            </button>

            <div className="w-px bg-[#e2e8f0]" />

            <button
              type="button"
              onClick={onSortDesc}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100",
                sortDirection === "desc" && "bg-[#e6eefb] text-[#17365d]",
              )}
            >
              <ChevronDown className="size-3.5" />
              Group DESC
            </button>
          </div>
        )}

        {/* OPERATOR FILTER */}

        {!isEnumColumn && (
          <div className="space-y-2 px-3 py-3">
            {isSimpleTextColumn ? (
              <div className="flex h-8 w-full items-center rounded border border-[#cbd5e1] bg-slate-50 px-2 text-[12px] font-medium text-[#1e293b]">
                Contains
              </div>
            ) : (
              <select
                value={op}
                onChange={(event) => setOp(event.target.value)}
                className={cn(inputClass, "cursor-pointer")}
              >
                {operators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
            )}

            <div className="flex gap-2">
              <input
                className={inputClass}
                type={isNumberColumn ? "number" : "text"}
                placeholder={op === "between" ? "From" : "Value"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyOperatorFilter();
                  }
                }}
              />

              {op === "between" && (
                <input
                  className={inputClass}
                  type="number"
                  placeholder="To"
                  value={value2}
                  onChange={(event) => setValue2(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyOperatorFilter();
                    }
                  }}
                />
              )}
            </div>

            <button
              type="button"
              className={darkButtonClass}
              onClick={applyOperatorFilter}
            >
              Apply filter
            </button>

            {isSimpleTextColumn && (
              <button
                type="button"
                onClick={clearAll}
                className="h-8 w-full rounded border border-[#e0b4ab] bg-white text-[12px] font-medium text-[#b4402c] hover:bg-[#fdf2f0]"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* PICK VALUES — hidden for empId / name */}

        {!isSimpleTextColumn && (
          <div className="border-t border-[#e2e8f0] px-3 py-2">
            {!isEnumColumn && (
              <p className="mb-2 text-center text-[10px] font-semibold tracking-wide text-slate-400">
                OR PICK VALUES
              </p>
            )}

            <input
              className={inputClass}
              placeholder="Search values..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <label className="mt-2 flex cursor-pointer items-center gap-2 px-1 py-1 text-[12px] font-semibold text-slate-700">
              <input
                type="checkbox"
                className="size-3.5 accent-[#17365d]"
                checked={allVisibleSelected}
                onChange={(event) => toggleSelectAll(event.target.checked)}
              />
              (Select all)
            </label>

            <div className="max-h-[180px] overflow-y-auto pr-1">
              {visibleOptions.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-slate-400">
                  No values match this search.
                </p>
              ) : (
                visibleOptions.map((option) => {
                  const text = String(
                    option === null || option === undefined ? "" : option,
                  );

                  return (
                    <label
                      key={text}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[12px] text-slate-700 hover:bg-slate-100"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[#17365d]"
                        checked={picked.includes(option)}
                        onChange={(event) => {
                          setPicked(
                            event.target.checked
                              ? [...picked, option]
                              : picked.filter((item) => item !== option),
                          );
                        }}
                      />

                      <span className="truncate">
                        {formatOption(option) || "(blank)"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={clearAll}
                className="h-8 flex-1 rounded border border-[#e0b4ab] bg-white text-[12px] font-medium text-[#b4402c] hover:bg-[#fdf2f0]"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={applyPickedValues}
                className={cn(darkButtonClass, "flex-1")}
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {/* BULK EDIT — editable columns only */}

        {bulkEditable && (
          <div className="border-t border-[#e2e8f0] bg-[#f8fafc] px-3 py-3">
            <p className="text-[10px] font-semibold tracking-wide text-slate-400">
              BULK EDIT THIS COLUMN
            </p>

            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Applies to <b className="text-slate-700">{bulkRowCount}</b> rows
              matching the current grid filters
            </p>

            <div className="mt-2 flex gap-2">
              {isEnumColumn && meta.options ? (
                // Enum columns: only the allowed options, no free text.
                <select
                  className={cn(inputClass, "cursor-pointer")}
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                >
                  <option value="">Select value...</option>
                  {meta.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputClass}
                  type={isNumberColumn ? "number" : "text"}
                  placeholder="New value"
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyBulkEdit();
                    }
                  }}
                />
              )}

              <button
                type="button"
                onClick={applyBulkEdit}
                disabled={String(bulkValue).trim() === ""}
                className={cn(darkButtonClass, "w-[72px] shrink-0")}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
