import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Download, History, Layers, RotateCcw, Search, X } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { AppraisalGrid } from "@/components/appraisal/AppraisalGrid";
import { AuditPanel } from "@/components/appraisal/AuditTrail";
import { BulkEditDialog } from "@/components/appraisal/BulkEditDialog";
import { EmployeeDrawer } from "@/components/appraisal/EmployeeDrawer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet as UISheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, } from "@/components/ui/sheet";
import { useAppraisal } from "@/lib/appraisal-store";
import { applyFilters, describeFilter, isEmptyFilter, optionsFor as optionsForField, } from "@/lib/appraisal-filters";
import { exportToExcel } from "@/lib/export-excel";
export function SheetPage() {
    const { rows, audit } = useAppraisal();
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState({});
    const [selected, setSelected] = useState({});
    const [bulkOpen, setBulkOpen] = useState(false);
    const [drawerRow, setDrawerRow] = useState(null);
    const filtered = useMemo(() => applyFilters(rows, filters, search), [rows, filters, search]);
    const setFilter = (key, f) => setFilters((prev) => {
        const next = { ...prev };
        if (!f || isEmptyFilter(f))
            delete next[key];
        else
            next[key] = f;
        return next;
    });
    const selectedIds = filtered.filter((r) => selected[r.id]).map((r) => r.id);
    const progress = useMemo(() => {
        const done = rows.filter((r) => r.status === "Completed" || r.status === "Submitted").length;
        return Math.round((done / rows.length) * 100);
    }, [rows]);
    const activeFilters = Object.entries(filters);
    return (_jsxs(AppShell, { children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-semibold tracking-tight", children: "Appraisal Sheet" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Tab / Shift+Tab move across cells \u00B7 Enter moves down \u00B7 Arrow keys navigate like Excel" })] }), _jsxs("div", { className: "w-64", children: [_jsx("p", { className: "text-xs font-medium tracking-wide text-muted-foreground uppercase", children: "Appraisal Progress" }), _jsx(Progress, { value: progress, className: "mt-2 h-2.5" }), _jsxs("p", { className: "mt-1 text-sm font-medium", children: [progress, "% Completed"] })] })] }), _jsxs(Card, { className: "gap-0 p-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "relative min-w-[240px] flex-1", children: [_jsx(Search, { className: "absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" }), _jsx(Input, { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search employee, ID, department\u2026", className: "pl-9" })] }), _jsxs(Button, { variant: "outline", onClick: () => { setFilters({}); setSearch(""); }, disabled: activeFilters.length === 0 && !search, children: [_jsx(RotateCcw, { className: "size-4" }), " Reset Filters"] }), _jsxs(Button, { onClick: () => setBulkOpen(true), disabled: selectedIds.length === 0, children: [_jsx(Layers, { className: "size-4" }), " Bulk Edit (", selectedIds.length, ")"] }), _jsxs(UISheet, { children: [_jsx(SheetTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", children: [_jsx(History, { className: "size-4" }), " Audit Trail (", audit.length, ")"] }) }), _jsxs(SheetContent, { className: "w-full sm:max-w-xl", children: [_jsx(SheetHeader, { children: _jsx(SheetTitle, { children: "Compensation Audit Trail" }) }), _jsx("div", { className: "overflow-y-auto px-4 pb-6", children: _jsx(AuditPanel, { entries: audit }) })] })] }), _jsxs(Button, { variant: "outline", onClick: () => exportToExcel(filtered), children: [_jsx(Download, { className: "size-4" }), " Export Excel"] })] }), activeFilters.length > 0 && (_jsx("div", { className: "mt-3 flex flex-wrap gap-2 border-t border-border pt-3", children: activeFilters.map(([key, f]) => (_jsxs("button", { onClick: () => setFilter(key, undefined), className: "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/18", children: [describeFilter(key, f), _jsx(X, { className: "size-3" })] }, key))) }))] }), _jsxs("div", { className: "flex items-center justify-between text-xs text-muted-foreground", children: [_jsxs("span", { children: ["Showing ", _jsx("span", { className: "num font-medium text-foreground", children: filtered.length }), " of ", rows.length, " employees"] }), _jsx("span", { children: "Modified cells are highlighted in yellow and saved automatically." })] }), _jsx(AppraisalGrid, { rows: filtered, filters: filters, setFilter: setFilter, optionsFor: (key) => optionsForField(key, rows), selected: selected, toggleSelected: (id, on) => setSelected((prev) => {
                            const next = { ...prev };
                            if (on)
                                next[id] = true;
                            else
                                delete next[id];
                            return next;
                        }), toggleAll: (on) => setSelected(on ? Object.fromEntries(filtered.map((r) => [r.id, true])) : {}), onRowOpen: setDrawerRow }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-base", children: "Recent Changes" }) }), _jsx(CardContent, { children: _jsx(AuditPanel, { entries: audit.slice(0, 40) }) })] })] }), _jsx(BulkEditDialog, { open: bulkOpen, onOpenChange: setBulkOpen, ids: selectedIds, onDone: () => setSelected({}) }), _jsx(EmployeeDrawer, { employee: drawerRow, onOpenChange: (o) => !o && setDrawerRow(null) })] }));
}
