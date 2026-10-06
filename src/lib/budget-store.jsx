import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

const BudgetContext = createContext(null);

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(row) {
  const base = number(row.budget_amount);
  const additional = number(row.additional_budget);
  const updated = base + additional;
  const utilized = number(row.budget_utilized);
  return {
    ...row,
    id: String(row.id || ""),
    appraisal_cycle_id: String(row.appraisal_cycle_id || ""),
    tech_ed_id: String(row.tech_ed_id || ""),
    budget_percentage: number(row.budget_percentage),
    budget_amount: base,
    additional_budget: additional,
    budget_utilized: utilized,
    budget_remaining: updated - utilized,
    status: String(row.status || ""),
    updated_budget: updated,
    utilization_percentage: updated > 0 ? (utilized / updated) * 100 : 0,
  };
}

// Lowercase and collapse whitespace so "EMP001 -  Jane  Doe" == "emp001 - jane doe".
function normalizeOwner(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Exact ownership match on the Tech-ED value, which is either a plain id/name/email
// or "EMPxxxx - Name". Empty owners or identities never match.
function ownerMatches(owner, identities) {
  const normalized = normalizeOwner(owner);
  if (!normalized) return false;
  const parts = normalized.match(/^(\S+)\s*-\s*(.+)$/);
  const candidates = parts ? [normalized, parts[1], parts[2]] : [normalized];
  return identities.some((identity) => identity && candidates.includes(identity));
}

const EMPLOYEE_PAGE_LIMIT = 100; // employeesapi caps limit at 100

async function fetchAllEligibleEmployees() {
  const employees = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL(catalystFunctionUrl("employeesapi"));
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(EMPLOYEE_PAGE_LIMIT));
    url.searchParams.set("status", "active");
    url.searchParams.set("eligible", "eligible");
    const response = await catalystFetch(url.toString());
    let json = {};
    try { json = await response.json(); } catch (_) { json = {}; }
    if (!response.ok || json && json.success === false) {
      throw new Error(json && json.message || `Failed to load employees for budget counts (${response.status}).`);
    }
    employees.push(...(Array.isArray(json && json.data) ? json.data : []));
    totalPages = Math.max(1, Number(json && json.pagination && json.pagination.totalPages || 1));
    page += 1;
  } while (page <= totalPages);
  return employees;
}

export function BudgetProvider({ children }) {
  const authenticatedUser = useCatalystUser();
  const currentUser = useMemo(
    () => ({
      name: authenticatedUser && authenticatedUser.name || authenticatedUser && authenticatedUser.email || "Unknown user",
      email: authenticatedUser && authenticatedUser.email || "",
      role: authenticatedUser && authenticatedUser.role || "",
    }),
    [authenticatedUser],
  );

  const roleText = String(currentUser.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHR = roleText === "hr" || roleText === "humanresources" || roleText === "hroperation";
  const [budgetRows, setBudgetRows] = useState([]);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [budgetResponse, employeeResult] = await Promise.all([
        catalystFetch(catalystFunctionUrl("budgetmasterapi")),
        fetchAllEligibleEmployees().then(
          (employees) => ({ employees }),
          (employeeError) => ({ employees: [], employeeError }),
        ),
      ]);

      let budgetJson = {};
      try { budgetJson = await budgetResponse.json(); } catch (_) { budgetJson = {}; }
      if (!budgetResponse.ok) {
        const statusText = budgetResponse.status === 404
          ? "Budget Master API is not deployed in the current Catalyst environment."
          : (budgetJson && budgetJson.message || `Failed to load Budget Master (${budgetResponse.status}).`);
        throw new Error(statusText);
      }

      setBudgetRows((Array.isArray(budgetJson && budgetJson.data) ? budgetJson.data : []).map(normalizeRow));
      setEmployeeRows(employeeResult.employees);
      if (employeeResult.employeeError) {
        console.error("Failed to load employees for budget counts:", employeeResult.employeeError);
        setError(employeeResult.employeeError.message || "Failed to load employee counts.");
      }
    } catch (e) {
      console.error("Failed to load Budget Master:", e);
      setBudgetRows([]);
      setEmployeeRows([]);
      setError(e && e.message || "Failed to load Budget Master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => budgetRows.filter((row) => !row.status || row.status.toLowerCase() === "active"),
    [budgetRows],
  );

  const employeeCounts = useMemo(() => {
    const getOwner = (employee) =>
      normalizeOwner(
        employee.appraiser_tech_ed ||
        employee.tech_ed_id ||
        employee.tech_ed ||
        employee.appraiserTechEd ||
        employee.appraiser ||
        "",
      );

    return rows.reduce((map, row) => {
      const owner = normalizeOwner(row.tech_ed_id);
      const matched = owner ? employeeRows.filter((employee) => getOwner(employee) === owner) : [];
      map[row.tech_ed_id] = matched.length;
      return map;
    }, {});
  }, [rows, employeeRows]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          base: sum.base + row.budget_amount,
          additional: sum.additional + row.additional_budget,
          updated: sum.updated + row.updated_budget,
          utilized: sum.utilized + row.budget_utilized,
          remaining: sum.remaining + row.budget_remaining,
        }),
        { base: 0, additional: 0, updated: 0, utilized: 0, remaining: 0 },
      ),
    [rows],
  );

  const hierarchy = useMemo(() => {
    const next = {};
    rows.forEach((row) => {
      const owner = String(row.tech_ed_id || "").trim();
      if (owner) next[owner] = { level: 1, parent: null };
    });
    return next;
  }, [rows]);

  const allocationSnapshot = useMemo(() => ({ date: "", teams: {} }), []);
  const eligibilityEvents = useMemo(() => [], []);
  const gridSupervisorChanges = useMemo(() => [], []);

  const updateBudget = useCallback(async (id, changes) => {
    const response = await catalystFetch(catalystFunctionUrl("budgetmasterapi"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result && result.message || "Budget update failed.");
    await load();
    return result;
  }, [load]);

  return (
    <BudgetContext.Provider
      value={{
        currentUser,
        isHR,
        budgetRows: rows,
        employeeCounts,
        totals,
        loading,
        error,
        reload: load,
        updateBudget,
        hierarchy,
        eligibilityEvents,
        gridSupervisorChanges,
        allocationSnapshot,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudget must be used within BudgetProvider");
  return ctx;
}
