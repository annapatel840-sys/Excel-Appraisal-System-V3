import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuditList } from "./AuditTrail";
import { StatusBadge } from "./StatusBadge";
import { MANAGER_RATINGS, hikePct, inr, payoutPct, revisedCTC, totalPayout, } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";
function Field({ label, value }) {
    return (_jsxs("div", { className: "rounded-lg border border-border bg-card p-3", children: [_jsx("p", { className: "text-[11px] tracking-wide text-muted-foreground uppercase", children: label }), _jsx("p", { className: "mt-1 text-sm font-medium", children: value })] }));
}
export function EmployeeDrawer({ employee, onOpenChange, }) {
    const { updateCell, historyFor } = useAppraisal();
    const [comments, setComments] = useState("");
    useEffect(() => setComments(employee?.comments ?? ""), [employee]);
    if (!employee)
        return null;
    const history = historyFor(employee.empId);
    const save = () => {
        updateCell(employee.id, "comments", comments, "Drawer");
        toast.success("Appraisal saved", { description: `${employee.name} · changes recorded in audit trail.` });
    };
    const submit = () => {
        updateCell(employee.id, "comments", comments, "Drawer");
        updateCell(employee.id, "status", "Submitted", "Drawer");
        toast.success("Appraisal submitted", { description: `${employee.name} moved to Submitted.` });
        onOpenChange(false);
    };
    return (_jsx(Sheet, { open: !!employee, onOpenChange: onOpenChange, children: _jsxs(SheetContent, { className: "flex w-full flex-col gap-0 p-0 sm:max-w-lg", children: [_jsxs(SheetHeader, { className: "border-b border-border", children: [_jsx(SheetTitle, { children: "Employee Details" }), _jsxs(SheetDescription, { children: [employee.empId, " \u00B7 ", employee.department] })] }), _jsxs(Tabs, { defaultValue: "details", className: "flex min-h-0 flex-1 flex-col", children: [_jsx("div", { className: "px-4 pt-3", children: _jsxs(TabsList, { className: "w-full", children: [_jsx(TabsTrigger, { value: "details", className: "flex-1", children: "Appraisal" }), _jsxs(TabsTrigger, { value: "history", className: "flex-1", children: ["History ", history.length ? `(${history.length})` : ""] })] }) }), _jsx(TabsContent, { value: "details", className: "min-h-0 flex-1", children: _jsx(ScrollArea, { className: "h-full", children: _jsxs("div", { className: "space-y-4 p-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Employee ID", value: employee.empId }), _jsx(Field, { label: "Employee Name", value: employee.name }), _jsx(Field, { label: "Department", value: employee.department }), _jsx(Field, { label: "Designation", value: employee.designation }), _jsx(Field, { label: "Manager", value: employee.manager }), _jsx(Field, { label: "Status", value: _jsx(StatusBadge, { status: employee.status }) })] }), _jsx(Separator, {}), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { children: "Current Manager Rating" }), _jsxs(Select, { value: employee.managerRating, onValueChange: (v) => updateCell(employee.id, "managerRating", v, "Drawer"), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MANAGER_RATINGS.map((r) => (_jsx(SelectItem, { value: r, children: r }, r))) })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Field, { label: "Current CTC", value: _jsx("span", { className: "num", children: inr(employee.currentCTC) }) }), _jsx(Field, { label: "Revised CTC", value: _jsx("span", { className: "num text-primary", children: inr(revisedCTC(employee)) }) }), _jsx(Field, { label: "Target Perf. Bonus", value: _jsx("span", { className: "num", children: inr(employee.targetPerformanceBonus) }) }), _jsx(Field, { label: "Performance Bonus", value: _jsx("span", { className: "num", children: inr(employee.performanceBonus) }) }), _jsx(Field, { label: "Retention Bonus", value: _jsx("span", { className: "num", children: inr(employee.retentionBonus) }) }), _jsx(Field, { label: "Bonus Payout %", value: _jsxs("span", { className: "num", children: [payoutPct(employee).toFixed(1), "%"] }) }), _jsx(Field, { label: "Hike Amount", value: _jsx("span", { className: "num", children: inr(employee.hikeAmount) }) }), _jsx(Field, { label: "Hike %", value: _jsxs("span", { className: "num", children: [hikePct(employee).toFixed(1), "%"] }) })] }), _jsxs("div", { className: "rounded-lg border border-primary/25 bg-primary/6 p-3", children: [_jsx("p", { className: "text-[11px] tracking-wide text-muted-foreground uppercase", children: "Total Payout" }), _jsx("p", { className: "num mt-1 text-2xl font-semibold text-primary", children: inr(totalPayout(employee)) })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx(Label, { htmlFor: "comments", children: "Manager Comments" }), _jsx(Textarea, { id: "comments", rows: 4, value: comments, placeholder: "Summary of performance, compensation rationale\u2026", onChange: (e) => setComments(e.target.value) })] }), _jsxs("div", { className: "flex gap-2 pb-4", children: [_jsx(Button, { variant: "outline", className: "flex-1", onClick: save, children: "Save" }), _jsx(Button, { className: "flex-1", onClick: submit, children: "Submit Appraisal" })] })] }) }) }), _jsx(TabsContent, { value: "history", className: "min-h-0 flex-1", children: _jsx(ScrollArea, { className: "h-full", children: _jsx("div", { className: "p-4", children: _jsx(AuditList, { entries: history, compact: true }) }) }) })] })] }) }));
}
