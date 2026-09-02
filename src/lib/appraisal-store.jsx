import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
import { buildEmployees, COLUMNS, } from "./appraisal-data";
const CURRENT_USER = "Ashok Kumar (HR Ops)";
const AppraisalContext = createContext(null);
const labelOf = (key) => COLUMNS.find((c) => c.key === key)?.label ?? String(key);
let seq = 0;
const nextId = () => `a${Date.now()}-${seq++}`;
export function AppraisalProvider({ children }) {
    const [rows, setRows] = useState(() => {
        try {
            const saved = localStorage.getItem("employee-appraisal-rows");

            if (saved) {
                const parsed = JSON.parse(saved);

                // If the browser contains data from the previous
                // column structure, regenerate the demo rows so the
                // new appraisal columns are populated.
                if (
                    Array.isArray(parsed) &&
                    parsed.length > 0 &&
                    parsed[0].currentAnnualBasePay !== undefined
                ) {
                    return parsed;
                }
            }

            return buildEmployees(250);
        }
        catch {
            return buildEmployees(250);
        }
    });
    const [audit, setAudit] = useState(() => {
        try {
            const saved = localStorage.getItem("employee-appraisal-audit");
            return saved ? JSON.parse(saved) : [];
        }
        catch {
            return [];
        }
    });
    const [modified, setModified] = useState({});
    useEffect(() => {
        localStorage.setItem("employee-appraisal-rows", JSON.stringify(rows));
    }, [rows]);
    useEffect(() => {
        localStorage.setItem("employee-appraisal-audit", JSON.stringify(audit));
    }, [audit]);
    const applyEdits = useCallback((ids, key, compute, source, batchId) => {
        const entries = [];
        const touched = {};
        setRows((prev) => prev.map((row) => {
            if (!ids.includes(row.id))
                return row;
            const next = compute(row);
            const before = row[key];
            if (String(before) === String(next))
                return row;
            entries.push({
                id: nextId(),
                at: new Date().toISOString(),
                user: CURRENT_USER,
                empId: row.empId,
                employeeName: row.name,
                field: labelOf(key),
                from: String(before),
                to: String(next),
                source,
                ...(batchId ? { batchId } : {}),
            });
            touched[`${row.id}:${key}`] = true;
            return { ...row, [key]: next };
        }));
        if (entries.length) {
            setAudit((prev) => [...entries.reverse(), ...prev]);
            setModified((prev) => ({ ...prev, ...touched }));
        }
        return entries.length;
    }, []);
    const updateCell = useCallback((id, key, value, source = "Inline edit") => {
        applyEdits([id], key, () => value, source);
    }, [applyEdits]);
    const bulkUpdate = useCallback((ids, key, mode, value) => {
        const batchId = nextId();
        return applyEdits(ids, key, (row) => {
            if (mode === "set")
                return value;
            const current = Number(row[key]) || 0;
            const v = Number(value) || 0;
            return mode === "increaseAmount"
                ? Math.round(current + v)
                : Math.round(current * (1 + v / 100));
        }, "Bulk edit", batchId);
    }, [applyEdits]);
    const historyFor = useCallback((empId) => audit.filter((a) => a.empId === empId), [audit]);
    const value = useMemo(() => ({ rows, audit, modified, updateCell, bulkUpdate, historyFor }), [rows, audit, modified, updateCell, bulkUpdate, historyFor]);
    return _jsx(AppraisalContext.Provider, { value: value, children: children });
}
export function useAppraisal() {
    const ctx = useContext(AppraisalContext);
    if (!ctx)
        throw new Error("useAppraisal must be used inside AppraisalProvider");
    return ctx;
}
