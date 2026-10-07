import { useMemo, useState } from "react";
import { WalletCards, RefreshCw } from "lucide-react";
 
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
 
const money = (value) =>
  "₹ " + ((Number(value) || 0) / 100000).toFixed(2) + " L";
 
const pct = (value) => (Number(value) || 0).toFixed(1) + "%";
 
const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
 
function ownerName(value) {
  const text = String(value || "").trim();
  const match = text.match(/^\S+\s*-\s*(.+)$/);
  return match ? match[1].trim() : text;
}
 
function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
 
const CSS = `
.bd-root {
  max-width: 1320px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: "IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif;
  font-size: 12.5px;
  color: #0f1f33;
  font-variant-numeric: tabular-nums;
}
.bd-root * { box-sizing: border-box; }
.bd-root .muted { color: #64748b; }
.bd-root .muted-small { color: #64748b; font-size: 11px; }
.bd-root .card {
  background: #fff;
  border: 1px solid #d3dbe6;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(18,48,79,.06);
  overflow: hidden;
}
.bd-root .top {
  background: #fff;
  border: 1px solid #d3dbe6;
  border-left: 4px solid #14a3a3;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(18,48,79,.06);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 9px 14px;
  color: #334155;
}
.bd-root .top b { color: #12304f; }
.bd-root .sep {
  width: 1px;
  align-self: stretch;
  background: #d7dce3;
}
.bd-root .title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #12304f;
  font-weight: 700;
  font-size: 14px;
}
.bd-root .title-icon {
  width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: #e9f4f4;
  color: #0b6a66;
}
.bd-root .pane-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #12304f;
  color: #fff;
  border: 0;
  padding: 10px 16px;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.bd-root .pane-head .cnt {
  font-weight: 400;
  color: #d6e4f5;
  margin-left: 8px;
}
.bd-root .summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.bd-root .summary > div {
  padding: 12px 16px;
  border-right: 1px solid #d7dce3;
  border-top: 3px solid transparent;
}
.bd-root .summary > div:nth-child(2) { border-top-color: #14a3a3; }
.bd-root .summary > div:last-child { border-right: 0; }
.bd-root .label {
  font-size: 11px;
  color: #5b6b80;
  font-weight: 500;
}
.bd-root .value {
  margin-top: 2px;
  color: #12304f;
  font-size: 18px;
  font-weight: 600;
}
.bd-root .sub {
  margin-top: 2px;
  font-size: 11px;
}
.bd-root .scroll { overflow-x: auto; }
.bd-root table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  font-size: 12px;
}
.bd-root th {
  background: #e8eef5;
  color: #12304f;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid #9fb3cf;
  white-space: nowrap;
}
.bd-root td {
  padding: 8px 10px;
  border-bottom: 1px solid #e1e5eb;
  vertical-align: middle;
}
.bd-root th.num,
.bd-root td.num { text-align: right; }
.bd-root tr.tech { background: #f8fbfb; }
.bd-root tr.tech td:first-child { box-shadow: inset 4px 0 0 #14a3a3; }
.bd-root .owner {
  color: #12304f;
  font-weight: 700;
}
.bd-root .status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  background: #e8f5ed;
  color: #166534;
  font-size: 10.5px;
  font-weight: 700;
}
.bd-root .readonly {
  display: inline-flex;
  align-items: center;
  border: 1px solid #d5dde7;
  border-radius: 4px;
  padding: 3px 7px;
  background: #f8fafc;
  color: #64748b;
  font-size: 10.5px;
  font-weight: 600;
}
.bd-root .refresh {
  margin-left: auto;
  border: 1px solid #c5d0dd;
  background: #fff;
  color: #12304f;
  border-radius: 4px;
  padding: 5px 9px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.bd-root .refresh:disabled { opacity: .55; cursor: default; }
.bd-root .empty,
.bd-root .error {
  padding: 22px 16px;
  color: #64748b;
}
.bd-root .error { color: #9a3412; background: #fff7ed; }
.bd-root .detail {
  background: #f7f9fc;
  border-top: 1px solid #d7dce3;
  padding: 10px 14px;
}
.bd-root .detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}
.bd-root .detail-item {
  border: 1px solid #e1e6ed;
  background: #fff;
  border-radius: 6px;
  padding: 8px 10px;
}
`;
 
export function BudgetDistributionPage() {
  const user = useCatalystUser();
  const {
    budgetRows,
    employeeCounts,
    totals,
    loading,
    error,
    reload,
    isHR,
  } = useBudget();
 
  const [open, setOpen] = useState({});
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [tableOpen, setTableOpen] = useState(true);
 
  const rows = useMemo(
    () =>
      [...budgetRows].sort((a, b) =>
        ownerName(a.tech_ed_id).localeCompare(ownerName(b.tech_ed_id)),
      ),
    [budgetRows],
  );
 
  const totalPercentage = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.budget_percentage || 0), 0),
    [rows],
  );
 
  const role = normalize(user?.role);
  const canView = isHR || role === "hr" || role === "human resources" || role.includes("teched");
 
  if (!canView) return null;
 
  return (
    <div className="bd-root">
      <style>{CSS}</style>
 
      <div className="top">
        <span className="title">
          <span className="title-icon">
            <WalletCards size={14} />
          </span>
          Budget Distribution
        </span>
        <span className="sep" />
        <span>
          Appraisal cycle <b>Apr-26</b>
        </span>
        <span className="sep" />
        <span>
          <b>{rows.length}</b> Tech-Ed allocation{rows.length === 1 ? "" : "s"}
        </span>
        <span className="readonly">Read only · HR</span>
        <button
          type="button"
          className="refresh"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
 
      <section className="card">
        <button
          type="button"
          className="pane-head"
          onClick={() => setSummaryOpen((current) => !current)}
          aria-expanded={summaryOpen}
        >
          <span>Distribution Summary</span>
          <span className="muted-small" style={{ color: "#d6e4f5" }}>
            All Tech-Ed budgets
            <span style={{ marginLeft: 10 }}>{summaryOpen ? "▾" : "▸"}</span>
          </span>
        </button>
 
        {summaryOpen && (
          <div className="summary">
            <div>
              <div className="label">Tech-Ed count</div>
              <div className="value">{rows.length}</div>
              <div className="sub muted">Active budget records</div>
            </div>
            <div>
              <div className="label">Total original budget</div>
              <div className="value">{money(totals.base)}</div>
              <div className="sub muted">Before additional budget</div>
            </div>
            <div>
              <div className="label">Additional budget</div>
              <div className="value">{money(totals.additional)}</div>
              <div className="sub muted">Added to original</div>
            </div>
            <div>
              <div className="label">Total updated budget</div>
              <div className="value">{money(totals.updated)}</div>
              <div className="sub muted">Current allocation</div>
            </div>
            <div>
              <div className="label">Total utilised</div>
              <div className="value">{money(totals.utilized)}</div>
              <div className="sub muted">
                {totals.updated
                  ? ((totals.utilized / totals.updated) * 100).toFixed(0) + "% utilised"
                  : "—"}
              </div>
            </div>
            <div>
              <div className="label">Total remaining</div>
              <div className="value">{money(totals.remaining)}</div>
              <div className="sub muted">Updated budget − utilised</div>
            </div>
          </div>
        )}
      </section>
 
      <section className="card">
        <button
          type="button"
          className="pane-head"
          onClick={() => setTableOpen((current) => !current)}
          aria-expanded={tableOpen}
        >
          <span>
            Tech-Ed Budget Distribution
            <span className="cnt">{rows.length} records</span>
          </span>
          <span className="muted-small" style={{ color: "#d6e4f5" }}>
            Total %: {pct(totalPercentage)}
            <span style={{ marginLeft: 10 }}>{tableOpen ? "▾" : "▸"}</span>
          </span>
        </button>
 
        {tableOpen &&
          (loading ? (
            <div className="empty">Loading Tech-Ed budget distribution…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : rows.length === 0 ? (
            <div className="empty">No active Tech-Ed budget records found.</div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Tech-Ed</th>
                    <th className="num">Budget %</th>
                    <th className="num">Original Budget</th>
                    <th className="num">Additional Budget</th>
                    <th className="num">Updated Budget</th>
                    <th className="num">Utilised</th>
                    <th className="num">Remaining</th>
                    <th className="num">Utilisation %</th>
                    <th>Team Count</th>
                    <th>Status</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const owner = ownerName(row.tech_ed_id);
                    const key = row.id || row.tech_ed_id;
                    const expanded = Boolean(open[key]);
 
                    return (
                      <tr key={key} className="tech">
                        <td>
                          <b>Tech-Ed</b>
                        </td>
                        <td>
                          <div className="owner">{owner || row.tech_ed_id || "—"}</div>
                          {owner && owner !== row.tech_ed_id ? (
                            <div className="muted-small">{row.tech_ed_id}</div>
                          ) : null}
                        </td>
                        <td className="num">{pct(row.budget_percentage)}</td>
                        <td className="num">{money(row.budget_amount)}</td>
                        <td className="num">{money(row.additional_budget)}</td>
                        <td className="num">{money(row.updated_budget)}</td>
                        <td className="num">{money(row.budget_utilized)}</td>
                        <td className="num">{money(row.budget_remaining)}</td>
                        <td className="num">{pct(row.utilization_percentage)}</td>
                        <td>{employeeCounts[row.tech_ed_id] ?? "—"}</td>
                        <td>
                          <span className="status">
                            {row.status || "Active"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="readonly"
                            onClick={() =>
                              setOpen((current) => ({
                                ...current,
                                [key]: !expanded,
                              }))
                            }
                            aria-expanded={expanded}
                          >
                            {expanded ? "Hide details" : "View details"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
 
              {rows.map((row) => {
                const key = row.id || row.tech_ed_id;
                if (!open[key]) return null;
                const owner = ownerName(row.tech_ed_id);
                return (
                  <div className="detail" key={"detail-" + key}>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <div className="label">Tech-Ed</div>
                        <b>{owner || row.tech_ed_id || "—"}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Budget percentage</div>
                        <b>{pct(row.budget_percentage)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Updated budget</div>
                        <b>{money(row.updated_budget)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Utilised</div>
                        <b>{money(row.budget_utilized)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Remaining</div>
                        <b>{money(row.budget_remaining)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Last updated</div>
                        <b>{dateText(row.updated_at || row.modified_at)}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </section>
    </div>
  );
}