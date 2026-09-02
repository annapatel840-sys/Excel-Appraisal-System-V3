import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Download, RotateCcw, Search, Table2, Users, Clock, CheckCircle2, Send, IndianRupee, TrendingUp, AlertTriangle, Gauge, } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { AuditPanel } from "@/components/appraisal/AuditTrail";
import { StatusBadge } from "@/components/appraisal/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEPARTMENTS, MANAGERS, MANAGER_RATINGS, STATUSES, hikePct, inr, payoutPct, revisedCTC, totalPayout, } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";
import { exportToExcel } from "@/lib/export-excel";
import { cn } from "@/lib/utils";
const ALL = "__all__";
const hikeTone = (p) => p >= 12
    ? "text-status-submitted bg-status-submitted/12 ring-status-submitted/25"
    : p >= 8
        ? "text-status-completed bg-status-completed/12 ring-status-completed/25"
        : p >= 5
            ? "text-status-progress bg-status-progress/14 ring-status-progress/30"
            : "text-destructive bg-destructive/10 ring-destructive/25";
const ratingTone = {
    "Exceeds Expectation": "bg-status-submitted",
    "Meets Expectation": "bg-status-completed",
    "Sometimes Meets Expectation": "bg-status-progress",
};
export function Dashboard() {
    const { rows, audit } = useAppraisal();
    const [search, setSearch] = useState("");
    const [dept, setDept] = useState(ALL);
    const [manager, setManager] = useState(ALL);
    const [status, setStatus] = useState(ALL);
    const filtered = useMemo(() => rows.filter((r) => {
        const q = search.trim().toLowerCase();
        if (q && !`${r.empId} ${r.name}`.toLowerCase().includes(q))
            return false;
        if (dept !== ALL && r.department !== dept)
            return false;
        if (manager !== ALL && r.manager !== manager)
            return false;
        if (status !== ALL && r.status !== status)
            return false;
        return true;
    }), [rows, search, dept, manager, status]);
    const stats = useMemo(() => {
        const by = (s) => filtered.filter((r) => r.status === s).length;
        const done = by("Completed") + by("Submitted");
        const payout = filtered.reduce((s, r) => s + totalPayout(r), 0);
        const target = filtered.reduce((s, r) => s + r.targetPerformanceBonus, 0);
        const currentCtc = filtered.reduce((s, r) => s + r.currentCTC, 0);
        const revised = filtered.reduce((s, r) => s + revisedCTC(r), 0);
        return {
            total: filtered.length,
            pending: by("Pending") + by("In Progress"),
            completed: by("Completed"),
            submitted: by("Submitted"),
            progress: filtered.length ? Math.round((done / filtered.length) * 100) : 0,
            payout,
            target,
            budgetUse: target ? Math.round((payout / target) * 100) : 0,
            avgHike: filtered.length ? filtered.reduce((s, r) => s + hikePct(r), 0) / filtered.length : 0,
            ctcDelta: currentCtc ? ((revised - currentCtc) / currentCtc) * 100 : 0,
            hikeCost: revised - currentCtc,
            lowPayout: filtered.filter((r) => payoutPct(r) < 70).length,
            lowHike: filtered.filter((r) => hikePct(r) < 5).length,
            noRetention: filtered.filter((r) => r.retentionBonus === 0 && r.managerRating === "Exceeds Expectation").length,
        };
    }, [filtered]);
    const deptStats = useMemo(() => DEPARTMENTS.map((d) => {
        const list = filtered.filter((r) => r.department === d);
        const done = list.filter((r) => r.status === "Completed" || r.status === "Submitted").length;
        return {
            d,
            pct: list.length ? Math.round((done / list.length) * 100) : 0,
            count: list.length,
            payout: list.reduce((s, r) => s + totalPayout(r), 0),
            avgHike: list.length ? list.reduce((s, r) => s + hikePct(r), 0) / list.length : 0,
        };
    })
        .filter((x) => x.count > 0)
        .sort((a, b) => b.pct - a.pct), [filtered]);
    const managerStats = useMemo(() => MANAGERS.map((m) => {
        const list = filtered.filter((r) => r.manager === m);
        const done = list.filter((r) => r.status === "Completed" || r.status === "Submitted").length;
        return { m, count: list.length, pending: list.length - done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
    })
        .filter((x) => x.count > 0)
        .sort((a, b) => b.pending - a.pending), [filtered]);
    const ratingMix = useMemo(() => MANAGER_RATINGS.map((r) => {
        const count = filtered.filter((x) => x.managerRating === r).length;
        return { r, count, pct: filtered.length ? Math.round((count / filtered.length) * 100) : 0 };
    }), [filtered]);
    const hikeBands = useMemo(() => {
        const bands = [
            { label: "< 5%", test: (p) => p < 5, color: "bg-destructive", text: "text-destructive" },
            { label: "5 – 8%", test: (p) => p >= 5 && p < 8, color: "bg-status-progress", text: "text-status-progress" },
            { label: "8 – 12%", test: (p) => p >= 8 && p < 12, color: "bg-status-completed", text: "text-status-completed" },
            { label: "12%+", test: (p) => p >= 12, color: "bg-status-submitted", text: "text-status-submitted" },
        ];
        return bands.map((b) => {
            const count = filtered.filter((r) => b.test(hikePct(r))).length;
            return { ...b, count, pct: filtered.length ? Math.round((count / filtered.length) * 100) : 0 };
        });
    }, [filtered]);
    const topHikes = useMemo(() => [...filtered].sort((a, b) => hikePct(b) - hikePct(a)).slice(0, 6), [filtered]);
    const cards = [
        {
            label: "Total Employees",
            value: String(stats.total),
            sub: `${stats.progress}% cycle complete`,
            icon: Users,
            accent: "bg-primary",
            tone: "text-primary bg-primary/10",
        },
        {
            label: "Pending Review",
            value: String(stats.pending),
            sub: `${managerStats[0]?.m ?? "—"} has most open`,
            icon: Clock,
            accent: "bg-status-progress",
            tone: "text-status-progress bg-status-progress/12",
        },
        {
            label: "Completed",
            value: String(stats.completed),
            sub: "Awaiting submission",
            icon: CheckCircle2,
            accent: "bg-status-completed",
            tone: "text-status-completed bg-status-completed/12",
        },
        {
            label: "Submitted",
            value: String(stats.submitted),
            sub: "Locked for payroll",
            icon: Send,
            accent: "bg-status-submitted",
            tone: "text-status-submitted bg-status-submitted/12",
        },
        {
            label: "Total Payout",
            value: inr(stats.payout),
            sub: `${stats.budgetUse}% of target bonus`,
            icon: IndianRupee,
            accent: "bg-chart-5",
            tone: "text-chart-5 bg-chart-5/12",
        },
        {
            label: "Average Hike",
            value: `${stats.avgHike.toFixed(1)}%`,
            sub: `CTC impact ${inr(stats.hikeCost)}`,
            icon: TrendingUp,
            accent: "bg-chart-2",
            tone: "text-chart-2 bg-chart-2/14",
        },
        {
            label: "Budget Utilisation",
            value: `${stats.budgetUse}%`,
            sub: `Target ${inr(stats.target)}`,
            icon: Gauge,
            accent: stats.budgetUse > 100 ? "bg-destructive" : "bg-status-submitted",
            tone: stats.budgetUse > 100
                ? "text-destructive bg-destructive/10"
                : "text-status-submitted bg-status-submitted/12",
        },
        {
            label: "Attention Needed",
            value: String(stats.lowPayout + stats.lowHike),
            sub: `${stats.lowHike} low hike · ${stats.lowPayout} low payout`,
            icon: AlertTriangle,
            accent: "bg-destructive",
            tone: "text-destructive bg-destructive/10",
        },
    ];
    const reset = () => {
        setSearch("");
        setDept(ALL);
        setManager(ALL);
        setStatus(ALL);
    };
    const rowTone = (r) => r.status === "Submitted"
        ? "border-l-status-submitted"
        : r.status === "Completed"
            ? "border-l-status-completed"
            : r.status === "In Progress"
                ? "border-l-status-progress"
                : "border-l-border";
    return (_jsx(AppShell, { children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-semibold tracking-tight", children: "Appraisal Dashboard" }), _jsxs("p", { className: "text-sm text-muted-foreground", children: ["Compensation review cycle \u00B7 ", filtered.length, " of ", rows.length, " employees in view"] })] }), _jsxs(Card, { className: "w-full max-w-xs gap-0 p-4 sm:w-72", children: [_jsx("p", { className: "text-xs font-medium tracking-wide text-muted-foreground uppercase", children: "Appraisal Progress" }), _jsx(Progress, { value: stats.progress, className: "mt-3 h-2.5" }), _jsxs("div", { className: "mt-2 flex items-center justify-between text-sm", children: [_jsxs("span", { className: "font-medium", children: [stats.progress, "% Completed"] }), _jsxs("span", { className: "num text-status-progress", children: [stats.pending, " open"] })] })] })] }), _jsx("div", { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4", children: cards.map((c) => (_jsxs(Card, { className: "relative gap-0 overflow-hidden p-5 transition-shadow hover:shadow-md", children: [_jsx("span", { className: cn("absolute inset-y-0 left-0 w-1", c.accent) }), _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-xs font-medium tracking-wide text-muted-foreground uppercase", children: c.label }), _jsx("p", { className: "num mt-2 truncate text-2xl font-semibold", children: c.value }), _jsx("p", { className: "mt-1 truncate text-xs text-muted-foreground", children: c.sub })] }), _jsx("span", { className: cn("flex size-9 shrink-0 items-center justify-center rounded-lg", c.tone), children: _jsx(c.icon, { className: "size-4.5" }) })] })] }, c.label))) }), _jsx(Card, { className: "gap-0 p-4", children: _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsxs("div", { className: "relative min-w-[220px] flex-1", children: [_jsx(Search, { className: "absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" }), _jsx(Input, { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search employee or ID", className: "pl-9" })] }), _jsxs(Select, { value: dept, onValueChange: setDept, children: [_jsx(SelectTrigger, { className: "w-[170px]", children: _jsx(SelectValue, { placeholder: "Department" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: ALL, children: "All Departments" }), DEPARTMENTS.map((d) => _jsx(SelectItem, { value: d, children: d }, d))] })] }), _jsxs(Select, { value: manager, onValueChange: setManager, children: [_jsx(SelectTrigger, { className: "w-[170px]", children: _jsx(SelectValue, { placeholder: "Manager" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: ALL, children: "All Managers" }), MANAGERS.map((m) => _jsx(SelectItem, { value: m, children: m }, m))] })] }), _jsxs(Select, { value: status, onValueChange: setStatus, children: [_jsx(SelectTrigger, { className: "w-[150px]", children: _jsx(SelectValue, { placeholder: "Status" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: ALL, children: "All Statuses" }), STATUSES.map((s) => _jsx(SelectItem, { value: s, children: s }, s))] })] }), _jsxs(Button, { variant: "outline", onClick: reset, children: [_jsx(RotateCcw, { className: "size-4" }), " Reset Filters"] }), _jsxs("div", { className: "ml-auto flex gap-2", children: [_jsx(Button, { asChild: true, children: _jsxs("a", { href: "/sheet", children: [_jsx(Table2, { className: "size-4" }), " Open Appraisal Sheet"] }) }), _jsxs(Button, { variant: "outline", onClick: () => exportToExcel(filtered), children: [_jsx(Download, { className: "size-4" }), " Export Excel"] })] })] }) }), _jsxs("div", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-base", children: "Department Wise Completion" }) }), _jsx(CardContent, { className: "space-y-4", children: deptStats.map((d) => (_jsxs("div", { children: [_jsxs("div", { className: "flex items-baseline justify-between text-sm", children: [_jsx("span", { className: "font-medium", children: d.d }), _jsxs("span", { className: cn("num rounded px-1.5 text-xs font-semibold", d.pct >= 75
                                                            ? "bg-status-submitted/12 text-status-submitted"
                                                            : d.pct >= 40
                                                                ? "bg-status-progress/14 text-status-progress"
                                                                : "bg-destructive/10 text-destructive"), children: [d.pct, "%"] })] }), _jsx(Progress, { value: d.pct, className: "mt-1.5 h-2" }), _jsxs("p", { className: "num mt-1 text-xs text-muted-foreground", children: [d.count, " employees \u00B7 ", inr(d.payout), " \u00B7 avg hike ", d.avgHike.toFixed(1), "%"] })] }, d.d))) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-base", children: "Rating Distribution" }) }), _jsxs(CardContent, { className: "space-y-5", children: [_jsx("div", { className: "flex h-3 overflow-hidden rounded-full", children: ratingMix.map((r) => (_jsx("span", { className: cn(ratingTone[r.r], "h-full"), style: { width: `${r.pct}%` } }, r.r))) }), ratingMix.map((r) => (_jsxs("div", { className: "flex items-center gap-3 text-sm", children: [_jsx("span", { className: cn("size-2.5 rounded-full", ratingTone[r.r]) }), _jsx("span", { className: "flex-1 truncate", children: r.r }), _jsx("span", { className: "num font-medium", children: r.count }), _jsxs("span", { className: "num w-10 text-right text-xs text-muted-foreground", children: [r.pct, "%"] })] }, r.r))), _jsxs("div", { className: "border-t border-border pt-4", children: [_jsx("p", { className: "text-xs font-medium tracking-wide text-muted-foreground uppercase", children: "Hike Bands" }), _jsx("div", { className: "mt-3 grid grid-cols-2 gap-2", children: hikeBands.map((b) => (_jsxs("div", { className: "rounded-md border border-border p-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: cn("size-2 rounded-full", b.color) }), _jsx("span", { className: "text-xs text-muted-foreground", children: b.label })] }), _jsx("p", { className: cn("num mt-1 text-lg font-semibold", b.text), children: b.count })] }, b.label))) })] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-base", children: "Manager Workload" }) }), _jsx(CardContent, { className: "space-y-3", children: managerStats.map((m) => (_jsxs("div", { className: "rounded-md border border-border p-3", children: [_jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "font-medium", children: m.m }), _jsxs("span", { className: cn("num rounded px-1.5 text-xs font-semibold", m.pending === 0
                                                            ? "bg-status-submitted/12 text-status-submitted"
                                                            : m.pending > 20
                                                                ? "bg-destructive/10 text-destructive"
                                                                : "bg-status-progress/14 text-status-progress"), children: [m.pending, " pending"] })] }), _jsx(Progress, { value: m.pct, className: "mt-2 h-1.5" }), _jsxs("p", { className: "num mt-1 text-xs text-muted-foreground", children: [m.count, " reportees \u00B7 ", m.pct, "% done"] })] }, m.m))) })] })] }), _jsxs("div", { className: "grid gap-4 lg:grid-cols-3", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-base", children: "Top Hikes" }) }), _jsx(CardContent, { className: "space-y-2", children: topHikes.map((r) => (_jsxs("div", { className: "flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-medium", children: r.name }), _jsxs("p", { className: "num truncate text-xs text-muted-foreground", children: [r.empId, " \u00B7 ", r.department] })] }), _jsxs("span", { className: cn("num rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", hikeTone(hikePct(r))), children: [hikePct(r).toFixed(1), "%"] })] }, r.id))) })] }), _jsxs(Card, { className: "lg:col-span-2", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-base", children: "Recent Activity & Audit Trail" }) }), _jsx(CardContent, { children: _jsx(AuditPanel, { entries: audit.slice(0, 60) }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "text-base", children: ["Employees (", filtered.length, ")"] }) }), _jsx(CardContent, { className: "max-h-[420px] overflow-auto p-0", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "sticky top-0 z-10 bg-grid-header", children: _jsx("tr", { className: "text-left text-xs tracking-wide text-muted-foreground uppercase", children: ["Emp ID", "Name", "Department", "Manager", "Rating", "Hike %", "Payout %", "Total Payout", "Status"].map((h) => (_jsx("th", { className: "border-b border-grid-line px-4 py-2 font-semibold", children: h }, h))) }) }), _jsx("tbody", { children: filtered.slice(0, 100).map((r) => (_jsxs("tr", { className: cn("border-l-4 transition-colors hover:bg-accent/40", rowTone(r)), children: [_jsx("td", { className: "num border-b border-grid-line px-4 py-2 text-xs text-muted-foreground", children: r.empId }), _jsx("td", { className: "border-b border-grid-line px-4 py-2 font-medium", children: r.name }), _jsx("td", { className: "border-b border-grid-line px-4 py-2", children: r.department }), _jsx("td", { className: "border-b border-grid-line px-4 py-2", children: r.manager }), _jsx("td", { className: "border-b border-grid-line px-4 py-2 text-xs", children: _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: cn("size-2 rounded-full", ratingTone[r.managerRating]) }), r.managerRating] }) }), _jsx("td", { className: "border-b border-grid-line px-4 py-2", children: _jsxs("span", { className: cn("num rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset", hikeTone(hikePct(r))), children: [hikePct(r).toFixed(1), "%"] }) }), _jsxs("td", { className: cn("num border-b border-grid-line px-4 py-2 font-medium", payoutPct(r) < 70 ? "text-destructive" : "text-status-submitted"), children: [payoutPct(r).toFixed(0), "%"] }), _jsx("td", { className: "num border-b border-grid-line px-4 py-2", children: inr(totalPayout(r)) }), _jsx("td", { className: "border-b border-grid-line px-4 py-2", children: _jsx(StatusBadge, { status: r.status }) })] }, r.id))) })] }) })] })] }) }));
}
