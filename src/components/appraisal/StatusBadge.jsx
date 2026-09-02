import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
const map = {
    Pending: "bg-status-pending/12 text-status-pending ring-status-pending/25",
    "In Progress": "bg-status-progress/14 text-status-progress ring-status-progress/30",
    Completed: "bg-status-completed/12 text-status-completed ring-status-completed/25",
    Submitted: "bg-status-submitted/14 text-status-submitted ring-status-submitted/30",
};
export function StatusBadge({ status, className }) {
    return (_jsxs("span", { className: cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", map[status], className), children: [_jsx("span", { className: "size-1.5 rounded-full bg-current" }), status] }));
}
const ratingMap = {
    "Exceeds Expectation": "bg-status-submitted/14 text-status-submitted ring-status-submitted/30",
    "Meets Expectation": "bg-status-completed/12 text-status-completed ring-status-completed/25",
    "Sometimes Meets Expectation": "bg-status-progress/14 text-status-progress ring-status-progress/30",
};
export function RatingBadge({ rating }) {
    return (_jsx("span", { className: cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", ratingMap[rating]), children: rating }));
}
