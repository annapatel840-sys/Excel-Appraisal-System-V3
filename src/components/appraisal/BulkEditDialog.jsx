import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLUMNS } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";
import { useAccess } from "@/lib/access-store";
const EDITABLE_COLUMNS = COLUMNS.filter((c) => c.editable);
const NUMERIC_TYPES = new Set(["currency", "number", "decimal", "percent"]);
export function BulkEditDialog({ open, onOpenChange, ids, onDone }) {
  const { bulkUpdate, rows } = useAppraisal();
  const { canEditField } = useAccess();
  // Only fields the user may edit (all of them when access rules are off).
  const editable = EDITABLE_COLUMNS.filter((c) => canEditField(c.key));
  const [field, setField] = useState(editable[0]?.key ?? "");
  const [mode, setMode] = useState("increasePercent");
  const [value, setValue] = useState("");
  const col = editable.find((c) => c.key === field);
  const isEnum = col?.type === "enum";
  // Arithmetic operations only make sense for numeric columns; text,
  // textarea and date columns can only be "set".
  const isNumeric = NUMERIC_TYPES.has(col?.type);
  const effectiveMode = isNumeric ? mode : "set";
  const apply = () => {
    if (!col || value === "") return;
    let targetIds = ids;
    let skipped = 0;
    // Same promotion rule as inline edits: New Title only for rows
    // eligible for promotion.
    if (field === "newTitle") {
      const eligible = new Set(
        rows.filter((r) => r.eligibleForPromotion === "Yes").map((r) => r.id),
      );
      targetIds = ids.filter((id) => eligible.has(id));
      skipped = ids.length - targetIds.length;
    }
    const count = targetIds.length
      ? bulkUpdate(targetIds, field, effectiveMode, value)
      : 0;
    // Setting promotion to "No" clears New Title, as inline edit does.
    if (field === "eligibleForPromotion" && value === "No") {
      bulkUpdate(ids, "newTitle", "set", null);
    }
    toast.success(`Bulk edit applied`, {
      description: `${col.label} updated on ${count} of ${ids.length} selected employees.${
        skipped ? ` ${skipped} skipped (not eligible for promotion).` : ""
      } Logged to audit trail.`,
    });
    setValue("");
    onOpenChange(false);
    onDone();
  };
  return _jsx(Dialog, {
    open: open,
    onOpenChange: onOpenChange,
    children: _jsxs(DialogContent, {
      className: "sm:max-w-md",
      children: [
        _jsxs(DialogHeader, {
          children: [
            _jsxs(DialogTitle, {
              children: ["Bulk edit ", ids.length, " employees"],
            }),
            _jsx(DialogDescription, {
              children:
                "Every change is recorded in the audit trail as a single bulk operation.",
            }),
          ],
        }),
        _jsxs("div", {
          className: "space-y-4",
          children: [
            _jsxs("div", {
              className: "space-y-1.5",
              children: [
                _jsx(Label, { children: "Field" }),
                _jsxs(Select, {
                  value: field,
                  onValueChange: (v) => {
                    setField(v);
                    setValue("");
                  },
                  children: [
                    _jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }),
                    _jsx(SelectContent, {
                      children: editable.map((c) =>
                        _jsx(
                          SelectItem,
                          { value: c.key, children: c.label },
                          c.key,
                        ),
                      ),
                    }),
                  ],
                }),
              ],
            }),
            isNumeric &&
              _jsxs("div", {
                className: "space-y-1.5",
                children: [
                  _jsx(Label, { children: "Operation" }),
                  _jsxs(Select, {
                    value: mode,
                    onValueChange: (v) => setMode(v),
                    children: [
                      _jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }),
                      _jsxs(SelectContent, {
                        children: [
                          _jsx(SelectItem, {
                            value: "set",
                            children: "Set to value",
                          }),
                          _jsx(SelectItem, {
                            value: "increaseAmount",
                            children: "Increase by amount",
                          }),
                          _jsx(SelectItem, {
                            value: "increasePercent",
                            children: "Increase by percent",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            _jsxs("div", {
              className: "space-y-1.5",
              children: [
                _jsx(Label, { children: "Value" }),
                isEnum
                  ? _jsxs(Select, {
                      value: String(value),
                      onValueChange: setValue,
                      children: [
                        _jsx(SelectTrigger, {
                          children: _jsx(SelectValue, {
                            placeholder: "Select value",
                          }),
                        }),
                        _jsx(SelectContent, {
                          children: (col.options ?? []).map((o) =>
                            _jsx(SelectItem, { value: o, children: o }, o),
                          ),
                        }),
                      ],
                    })
                  : isNumeric
                    ? _jsx(Input, {
                        className: "num",
                        type: "number",
                        value: value,
                        placeholder:
                          mode === "increasePercent" ? "e.g. 8" : "e.g. 25000",
                        onChange: (e) => setValue(e.target.value),
                      })
                    : _jsx(Input, {
                        type: col?.type === "date" ? "date" : "text",
                        value: value,
                        placeholder: "New value",
                        onChange: (e) => setValue(e.target.value),
                      }),
              ],
            }),
          ],
        }),
        _jsxs(DialogFooter, {
          children: [
            _jsx(Button, {
              variant: "outline",
              onClick: () => onOpenChange(false),
              children: "Cancel",
            }),
            _jsxs(Button, {
              onClick: apply,
              disabled: value === "",
              children: ["Apply to ", ids.length],
            }),
          ],
        }),
      ],
    }),
  });
}
