import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { History, Layers, PencilLine } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
const time = (iso) => new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});
export function AuditList({ entries, compact = false }) {
    if (entries.length === 0) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground", children: [_jsx(History, { className: "size-5" }), "No changes recorded yet."] }));
    }
    return (_jsx("ul", { className: "divide-y divide-border", children: entries.map((e) => (_jsxs("li", { className: "flex gap-3 py-2.5", children: [_jsx("span", { className: "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground", children: e.source === "Bulk edit" ? _jsx(Layers, { className: "size-3.5" }) : _jsx(PencilLine, { className: "size-3.5" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("p", { className: "text-sm", children: [!compact && _jsxs("span", { className: "font-medium", children: [e.employeeName, " "] }), _jsxs("span", { className: "text-muted-foreground", children: [compact ? "" : `(${e.empId}) `, "\u00B7", " "] }), _jsx("span", { className: "font-medium", children: e.field }), " ", _jsx("span", { className: "text-muted-foreground", children: "changed from" }), " ", _jsx("span", { className: "num text-xs", children: e.from || "—" }), " ", _jsx("span", { className: "text-muted-foreground", children: "to" }), " ", _jsx("span", { className: "num text-xs font-medium text-primary", children: e.to })] }), _jsxs("p", { className: "mt-0.5 text-xs text-muted-foreground", children: [e.user, " \u00B7 ", time(e.at), " \u00B7 ", e.source, e.batchId ? ` · batch ${e.batchId.slice(-4)}` : ""] })] })] }, e.id))) }));
}
export function AuditPanel({ entries }) {
    return (_jsx(ScrollArea, { className: "h-[320px] pr-3", children: _jsx(AuditList, { entries: entries }) }));
}
