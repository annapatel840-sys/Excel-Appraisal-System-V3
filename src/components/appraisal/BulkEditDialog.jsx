import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLUMNS } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";
const editable = COLUMNS.filter((c) => c.editable);
export function BulkEditDialog({ open, onOpenChange, ids, onDone, }) {
    const { bulkUpdate } = useAppraisal();
    const [field, setField] = useState("performanceBonus");
    const [mode, setMode] = useState("increasePercent");
    const [value, setValue] = useState("");
    const col = editable.find((c) => c.key === field);
    const isEnum = col.type === "enum";
    const apply = () => {
        if (value === "")
            return;
        const count = bulkUpdate(ids, field, isEnum ? "set" : mode, value);
        toast.success(`Bulk edit applied`, {
            description: `${col.label} updated on ${count} of ${ids.length} selected employees. Logged to audit trail.`,
        });
        setValue("");
        onOpenChange(false);
        onDone();
    };
    return (_jsx(Dialog, { open: open, onOpenChange: onOpenChange, children: _jsxs(DialogContent, { className: "sm:max-w-md", children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { children: ["Bulk edit ", ids.length, " employees"] }), _jsx(DialogDescription, { children: "Every change is recorded in the audit trail as a single bulk operation." })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { children: "Field" }), _jsxs(Select, { value: field, onValueChange: (v) => { setField(v); setValue(""); }, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: editable.map((c) => (_jsx(SelectItem, { value: c.key, children: c.label }, c.key))) })] })] }), !isEnum && (_jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { children: "Operation" }), _jsxs(Select, { value: mode, onValueChange: (v) => setMode(v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "set", children: "Set to value" }), _jsx(SelectItem, { value: "increaseAmount", children: "Increase by amount" }), _jsx(SelectItem, { value: "increasePercent", children: "Increase by percent" })] })] })] })), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { children: "Value" }), isEnum ? (_jsxs(Select, { value: String(value), onValueChange: setValue, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Select value" }) }), _jsx(SelectContent, { children: (col.options ?? []).map((o) => (_jsx(SelectItem, { value: o, children: o }, o))) })] })) : (_jsx(Input, { className: "num", type: "number", value: value, placeholder: mode === "increasePercent" ? "e.g. 8" : "e.g. 25000", onChange: (e) => setValue(e.target.value) }))] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { variant: "outline", onClick: () => onOpenChange(false), children: "Cancel" }), _jsxs(Button, { onClick: apply, disabled: value === "", children: ["Apply to ", ids.length] })] })] }) }));
}
