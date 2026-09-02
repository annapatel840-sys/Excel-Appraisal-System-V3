import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NUMBER_OPS, TEXT_OPS, fieldByKey, isEmptyFilter, } from "@/lib/appraisal-filters";
export function ColumnFilter({ columnKey, filter, options, onChange }) {
    const meta = fieldByKey(columnKey);
    if (!meta)
        return null;
    const active = !!filter && !isEmptyFilter(filter);
    const current = filter ??
        (meta.kind === "enum"
            ? { kind: "enum", values: [] }
            : meta.kind === "number"
                ? { kind: "number", op: "gt", value: "", value2: "" }
                : { kind: "text", op: "contains", value: "" });
    return (_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx("button", { type: "button", "aria-label": `Filter ${meta.label}`, className: cn("rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground", active && "bg-primary/12 text-primary"), children: _jsx(Filter, { className: "size-3.5" }) }) }), _jsxs(PopoverContent, { align: "start", className: "w-72 space-y-3 p-3", children: [_jsx("p", { className: "text-sm font-semibold", children: meta.label }), current.kind === "enum" && (_jsx("div", { className: "max-h-56 space-y-1.5 overflow-y-auto pr-1", children: options.map((opt) => (_jsxs("label", { className: "flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted", children: [_jsx(Checkbox, { checked: current.values.includes(opt), onCheckedChange: (c) => {
                                        const values = c
                                            ? [...current.values, opt]
                                            : current.values.filter((v) => v !== opt);
                                        onChange(values.length ? { kind: "enum", values } : undefined);
                                    } }), _jsx("span", { className: "truncate", children: opt || "(blank)" })] }, opt))) })), current.kind === "text" && (_jsxs("div", { className: "space-y-2", children: [_jsxs(Select, { value: current.op, onValueChange: (op) => onChange({ ...current, op: op }), children: [_jsx(SelectTrigger, { className: "h-8", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: TEXT_OPS.map((o) => (_jsx(SelectItem, { value: o.value, children: o.label }, o.value))) })] }), _jsx(Input, { className: "h-8", value: current.value, placeholder: "Value", onChange: (e) => onChange({ ...current, value: e.target.value }) })] })), current.kind === "number" && (_jsxs("div", { className: "space-y-2", children: [_jsxs(Select, { value: current.op, onValueChange: (op) => onChange({ ...current, op: op }), children: [_jsx(SelectTrigger, { className: "h-8", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: NUMBER_OPS.map((o) => (_jsx(SelectItem, { value: o.value, children: o.label }, o.value))) })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex-1 space-y-1", children: [_jsx(Label, { className: "text-[11px] text-muted-foreground", children: current.op === "between" ? "From" : "Value" }), _jsx(Input, { className: "h-8 num", type: "number", value: current.value, onChange: (e) => onChange({ ...current, value: e.target.value }) })] }), current.op === "between" && (_jsxs("div", { className: "flex-1 space-y-1", children: [_jsx(Label, { className: "text-[11px] text-muted-foreground", children: "To" }), _jsx(Input, { className: "h-8 num", type: "number", value: current.value2, onChange: (e) => onChange({ ...current, value2: e.target.value }) })] }))] })] })), _jsx("div", { className: "flex justify-end", children: _jsx(Button, { variant: "ghost", size: "sm", onClick: () => onChange(undefined), children: "Clear" }) })] })] }));
}
