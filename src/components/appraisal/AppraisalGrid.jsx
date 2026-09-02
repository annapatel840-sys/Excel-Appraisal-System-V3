import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilter } from "./ColumnFilter";
import {
    COLUMNS,
    formatValue,
} from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";

const editableCols = COLUMNS.filter((c) => c.editable);
const editableIndex = new Map(
    editableCols.map((c, i) => [c.key, i])
);

export function AppraisalGrid({
    rows,
    filters,
    setFilter,
    optionsFor,
    selected,
    toggleSelected,
    toggleAll,
    onRowOpen,
}) {
    const { updateCell, modified } = useAppraisal();

    const cellRefs = useRef({});
    const [active, setActive] = useState(null);
    const [saving, setSaving] = useState({});

    const focusCell = useCallback((r, c) => {
        const el = cellRefs.current[`${r}:${c}`];

        if (el) {
            el.focus();

            if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement
            ) {
                el.select();
            }
        }
    }, []);

    const flashSaved = useCallback((key) => {
        setSaving((p) => ({
            ...p,
            [key]: Date.now(),
        }));

        setTimeout(() => {
            setSaving((p) => {
                const n = { ...p };
                delete n[key];
                return n;
            });
        }, 1200);
    }, []);

    const convertValue = (col, raw) => {
        if (
            col.type === "currency" ||
            col.type === "number" ||
            col.type === "decimal" ||
            col.type === "percent"
        ) {
            return Number(raw) || 0;
        }

        return raw;
    };

    const commit = useCallback(
        (row, col, raw) => {
            const value = convertValue(col, raw);

            if (String(row[col.key] ?? "") === String(value)) {
                return;
            }

            updateCell(row.id, col.key, value);
            flashSaved(`${row.id}:${col.key}`);
        },
        [updateCell, flashSaved]
    );

    const onKeyDown = (e, r, c) => {
        const max = rows.length - 1;
        const maxC = editableCols.length - 1;
        const target = e.target;

        const atStart =
            !("selectionStart" in target) ||
            target.selectionStart === 0;

        const atEnd =
            !("selectionEnd" in target) ||
            target.selectionEnd === (target.value?.length ?? 0);

        if (e.key === "Enter") {
            // Do not move rows when editing the multi-line At Risk field.
            if (target instanceof HTMLTextAreaElement && !e.shiftKey) {
                return;
            }

            e.preventDefault();

            focusCell(
                e.shiftKey
                    ? Math.max(0, r - 1)
                    : Math.min(max, r + 1),
                c
            );
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusCell(Math.min(max, r + 1), c);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusCell(Math.max(0, r - 1), c);
        } else if (e.key === "ArrowRight" && atEnd) {
            if (c < maxC) {
                e.preventDefault();
                focusCell(r, c + 1);
            }
        } else if (e.key === "ArrowLeft" && atStart) {
            if (c > 0) {
                e.preventDefault();
                focusCell(r, c - 1);
            }
        } else if (e.key === "Escape") {
            target.blur();
        }
    };

    const allSelected =
        rows.length > 0 &&
        rows.every((r) => selected[r.id]);

    // IMPORTANT:
    // COLUMNS already contains the exact requested order, including
    // calculated columns. Do not append COMPUTED_COLUMNS at the end.
    const headers = useMemo(
        () =>
            COLUMNS.map((c) => ({
                key: c.key,
                label: c.label,
                width: c.width,
            })),
        []
    );

    return (
        <div
            className="relative overflow-auto rounded-xl border border-border bg-card"
            style={{ maxHeight: "calc(100vh - 300px)" }}
        >
            <table className="w-max border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-30">
                    <tr>
                        <th className="sticky left-0 z-40 w-10 border-r border-b border-grid-line bg-grid-header px-2 py-2">
                            <Checkbox
                                checked={allSelected}
                                onCheckedChange={(v) => toggleAll(!!v)}
                                aria-label="Select all"
                            />
                        </th>

                        {headers.map((h, i) => (
                            <th
                                key={h.key}
                                style={{
                                    width: h.width,
                                    minWidth: h.width,
                                    left:
                                        i === 0
                                            ? 40
                                            : i === 1
                                                ? 140
                                                : undefined,
                                }}
                                className={cn(
                                    "border-r border-b border-grid-line bg-grid-header px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                                    i < 2 && "sticky z-40"
                                )}
                            >
                                <div className="flex items-center justify-between gap-1">
                                    <span
                                        className="truncate"
                                        title={h.label}
                                    >
                                        {h.label}
                                    </span>

                                    <ColumnFilter
                                        columnKey={h.key}
                                        filter={filters[h.key]}
                                        options={optionsFor(h.key)}
                                        onChange={(f) =>
                                            setFilter(h.key, f)
                                        }
                                    />
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {rows.map((row, r) => (
                        <tr
                            key={row.id}
                            className="group transition-colors hover:bg-accent/40"
                        >
                            <td className="sticky left-0 z-20 border-r border-b border-grid-line bg-card px-2 py-1 group-hover:bg-accent/40">
                                <Checkbox
                                    checked={!!selected[row.id]}
                                    onCheckedChange={(v) =>
                                        toggleSelected(row.id, !!v)
                                    }
                                    aria-label={`Select ${row.name}`}
                                />
                            </td>

                            {COLUMNS.map((col, ci) => {
                                const cellKey = `${row.id}:${col.key}`;
                                const isModified = !!modified[cellKey];
                                const c = editableIndex.get(col.key);
                                const isActive =
                                    active === `${r}:${c}`;
                                const sticky = ci < 2;

                                return (
                                    <td
                                        key={col.key}
                                        style={{
                                            width: col.width,
                                            minWidth: col.width,
                                            left:
                                                ci === 0
                                                    ? 40
                                                    : ci === 1
                                                        ? 140
                                                        : undefined,
                                        }}
                                        onDoubleClick={() =>
                                            !col.editable &&
                                            !col.computed &&
                                            onRowOpen(row)
                                        }
                                        className={cn(
                                            "relative border-r border-b border-grid-line px-0 py-0 align-middle",
                                            sticky
                                                ? "sticky z-20 bg-card group-hover:bg-accent/40"
                                                : "bg-transparent",
                                            isModified &&
                                                "bg-cell-modified/70",
                                            isActive &&
                                                "ring-2 ring-primary ring-inset"
                                        )}
                                    >
                                        {/* CALCULATED COLUMN */}
                                        {col.computed ? (
                                            <div
                                                className={cn(
                                                    "num w-full px-3 py-2 text-right text-[13px] font-medium",
                                                    isModified
                                                        ? "text-foreground"
                                                        : "text-muted-foreground"
                                                )}
                                                title="Calculated automatically"
                                            >
                                                {formatValue(row, col)}
                                            </div>
                                        ) : !col.editable ? (
                                            /* READ-ONLY COLUMN */
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onRowOpen(row)
                                                }
                                                className={cn(
                                                    "block w-full truncate px-3 py-2 text-left",
                                                    col.key === "name" &&
                                                        "font-medium text-foreground hover:text-primary",
                                                    col.key === "empId" &&
                                                        "num text-xs text-muted-foreground"
                                                )}
                                            >
                                                {String(
                                                    row[col.key] ?? ""
                                                )}
                                            </button>
                                        ) : col.type === "enum" ? (
                                            /* DROPDOWN */
                                            <select
                                                ref={(el) => {
                                                    cellRefs.current[
                                                        `${r}:${c}`
                                                    ] = el;
                                                }}
                                                value={String(
                                                    row[col.key] ?? ""
                                                )}
                                                onFocus={() =>
                                                    setActive(`${r}:${c}`)
                                                }
                                                onBlur={() =>
                                                    setActive(null)
                                                }
                                                onKeyDown={(e) =>
                                                    onKeyDown(e, r, c)
                                                }
                                                onChange={(e) => {
                                                    updateCell(
                                                        row.id,
                                                        col.key,
                                                        e.target.value
                                                    );
                                                    flashSaved(cellKey);
                                                }}
                                                className="w-full cursor-pointer appearance-none bg-transparent px-3 py-2 text-sm outline-none"
                                            >
                                                <option value="">
                                                    Select...
                                                </option>

                                                {(col.options ?? []).map(
                                                    (o) => (
                                                        <option
                                                            key={o}
                                                            value={o}
                                                        >
                                                            {o}
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        ) : col.type === "textarea" ? (
                                            /* MULTI-LINE TEXT */
                                            <textarea
                                                ref={(el) => {
                                                    cellRefs.current[
                                                        `${r}:${c}`
                                                    ] = el;
                                                }}
                                                defaultValue={String(
                                                    row[col.key] ?? ""
                                                )}
                                                onFocus={() =>
                                                    setActive(`${r}:${c}`)
                                                }
                                                onBlur={(e) => {
                                                    setActive(null);
                                                    commit(
                                                        row,
                                                        col,
                                                        e.target.value
                                                    );
                                                }}
                                                onKeyDown={(e) =>
                                                    onKeyDown(e, r, c)
                                                }
                                                className="w-full min-h-[70px] resize-y bg-transparent px-3 py-2 text-sm outline-none"
                                            />
                                        ) : (
                                            /* TEXT / NUMBER / DECIMAL / PERCENT / CURRENCY / DATE */
                                            <div className="relative">
                                                <input
                                                    ref={(el) => {
                                                        cellRefs.current[
                                                            `${r}:${c}`
                                                        ] = el;
                                                    }}
                                                    type={
                                                        col.type === "date"
                                                            ? "date"
                                                            : "text"
                                                    }
                                                    defaultValue={String(
                                                        row[col.key] ?? ""
                                                    )}
                                                    inputMode={
                                                        col.type ===
                                                            "currency" ||
                                                        col.type ===
                                                            "number" ||
                                                        col.type ===
                                                            "decimal" ||
                                                        col.type ===
                                                            "percent"
                                                            ? "decimal"
                                                            : undefined
                                                    }
                                                    onFocus={(e) => {
                                                        setActive(
                                                            `${r}:${c}`
                                                        );
                                                        if (
                                                            col.type !==
                                                            "date"
                                                        ) {
                                                            e.currentTarget.select();
                                                        }
                                                    }}
                                                    onBlur={(e) => {
                                                        setActive(null);
                                                        commit(
                                                            row,
                                                            col,
                                                            e.target.value
                                                        );
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (
                                                            e.key === "Enter"
                                                        ) {
                                                            commit(
                                                                row,
                                                                col,
                                                                e.target.value
                                                            );
                                                        }

                                                        onKeyDown(
                                                            e,
                                                            r,
                                                            c
                                                        );
                                                    }}
                                                    className={cn(
                                                        "w-full bg-transparent px-3 py-2 text-[13px] outline-none",
                                                        (
                                                            col.type ===
                                                                "currency" ||
                                                            col.type ===
                                                                "number" ||
                                                            col.type ===
                                                                "decimal" ||
                                                            col.type ===
                                                                "percent"
                                                        ) &&
                                                            "text-right num"
                                                    )}
                                                />

                                                {saving[cellKey] !==
                                                    undefined && (
                                                    <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-status-submitted">
                                                        <Check className="size-3.5" />
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}

                    {rows.length === 0 && (
                        <tr>
                            <td
                                colSpan={headers.length + 1}
                                className="px-6 py-16 text-center text-sm text-muted-foreground"
                            >
                                No employees match the current filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <div className="pointer-events-none sticky bottom-0 left-0 hidden">
                <Loader2 className="size-3" />
            </div>
        </div>
    );
}
