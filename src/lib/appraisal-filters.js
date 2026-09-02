import { COLUMNS } from "./appraisal-data";

export const NUMBER_OPS = [
    { value: "gt", label: "Greater than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lt", label: "Less than" },
    { value: "lte", label: "Less than or equal" },
    { value: "eq", label: "Equals" },
    { value: "between", label: "Between" },
];

export const TEXT_OPS = [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "startsWith", label: "Starts with" },
];

export const FIELDS = COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    kind:
        c.type === "currency" ||
        c.type === "number" ||
        c.type === "decimal" ||
        c.type === "percent"
            ? "number"
            : c.type === "enum"
                ? "enum"
                : "text",
    ...(c.options ? { options: c.options } : {}),
    get: (r) => (c.computed && c.fn ? c.fn(r) : r[c.key]),
}));

export const fieldByKey = (key) =>
    FIELDS.find((f) => f.key === key);

export function optionsFor(key, rows) {
    const f = fieldByKey(key);

    if (f?.options)
        return [...f.options];

    return Array.from(
        new Set(
            rows.map((r) => String(f?.get(r) ?? ""))
        )
    ).sort();
}

function matches(row, key, filter) {
    const field = fieldByKey(key);

    if (!field)
        return true;

    const raw = field.get(row);

    if (filter.kind === "enum") {
        return (
            filter.values.length === 0 ||
            filter.values.includes(String(raw))
        );
    }

    if (filter.kind === "text") {
        const v = filter.value.trim().toLowerCase();

        if (!v)
            return true;

        const s = String(raw).toLowerCase();

        if (filter.op === "equals")
            return s === v;

        if (filter.op === "startsWith")
            return s.startsWith(v);

        return s.includes(v);
    }

    const n = Number(raw);
    const a = Number(filter.value);
    const b = Number(filter.value2);

    if (filter.op === "between") {
        if (
            filter.value === "" ||
            filter.value2 === ""
        )
            return true;

        return (
            n >= Math.min(a, b) &&
            n <= Math.max(a, b)
        );
    }

    if (
        filter.value === "" ||
        Number.isNaN(a)
    )
        return true;

    switch (filter.op) {
        case "gt":
            return n > a;
        case "gte":
            return n >= a;
        case "lt":
            return n < a;
        case "lte":
            return n <= a;
        default:
            return Math.abs(n - a) < 0.0001;
    }
}

export function applyFilters(rows, filters, search) {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
        if (
            q &&
            !(
                `${row.empId} ${row.name} ${row.department} ${row.designation} ${row.manager} ${row.reportingManager} ${row.compManager}`
                    .toLowerCase()
                    .includes(q)
            )
        ) {
            return false;
        }

        return Object.entries(filters).every(
            ([key, f]) => matches(row, key, f)
        );
    });
}

export function describeFilter(key, f) {
    const label =
        fieldByKey(key)?.label ?? key;

    if (f.kind === "enum")
        return `${label}: ${f.values.join(", ")}`;

    if (f.kind === "text")
        return `${label} ${
            TEXT_OPS.find((o) => o.value === f.op)
                ?.label.toLowerCase()
        } "${f.value}"`;

    if (f.op === "between")
        return `${label} between ${f.value} and ${f.value2}`;

    return `${label} ${
        NUMBER_OPS.find((o) => o.value === f.op)
            ?.label.toLowerCase()
    } ${f.value}`;
}

export function isEmptyFilter(f) {
    if (f.kind === "enum")
        return f.values.length === 0;

    if (f.kind === "text")
        return f.value.trim() === "";

    return f.op === "between"
        ? f.value === "" || f.value2 === ""
        : f.value === "";
}
