import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

import {
  hikeAmount,
  hikePct,
  totalBonus,
  totalOfPB,
  pct,
} from "@/lib/appraisal-data";

// ============================================================
// API
// ============================================================

const APPRAISAL_HISTORY_API_URL = catalystFunctionUrl("appraisalhistoryapi");
// ============================================================
// HELPERS
// ============================================================

function valueOrDash(value) {
  return value === undefined || value === null || value === ""
    ? "—"
    : String(value);
}

function currency(value) {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  return Math.round(Number(value) || 0).toLocaleString("en-IN");
}

function percentageChange(current, previous) {
  const c = Number(current);
  const p = Number(previous);

  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) {
    return "—";
  }

  const change = ((c - p) / p) * 100;

  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function formatValue(value, type = "text") {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  if (type === "currency") {
    return currency(value);
  }

  if (type === "percent") {
    return pct(value);
  }

  return valueOrDash(value);
}

// ============================================================
// COMPACT INFO CELL
// ============================================================

function InfoCell({ label, value }) {
  return (
    <div
      className="
        min-w-0
        rounded
        border
        border-[#d9e0e8]
        bg-[#f8fafc]
        px-1.5
        py-1
      "
    >
      <div
        className="
          truncate
          text-[7px]
          font-medium
          uppercase
          tracking-wide
          text-[#64748b]
        "
      >
        {label}
      </div>

      <div
        className="
          mt-0.5
          truncate
          text-[9px]
          font-semibold
          leading-tight
          text-[#334155]
        "
      >
        {valueOrDash(value)}
      </div>
    </div>
  );
}

// ============================================================
// COMPARISON ROW
// ============================================================

function ComparisonRow({
  label,
  current,
  previous,
  type = "currency",
  bold = false,
}) {
  let change = "—";

  if (
    current !== undefined &&
    current !== null &&
    current !== "" &&
    previous !== undefined &&
    previous !== null &&
    previous !== ""
  ) {
    if (type === "currency" || type === "percent") {
      change = percentageChange(current, previous);
    } else {
      change =
        String(current) === String(previous)
          ? "—"
          : `${valueOrDash(previous)} → ${valueOrDash(current)}`;
    }
  }

  const isPositive = typeof change === "string" && change.startsWith("+");

  const isNegative = typeof change === "string" && change.startsWith("-");

  return (
    <div
      className="
        grid
        grid-cols-[1.6fr_1fr_1fr_0.8fr]
        items-center
        border-b
        border-[#d9e0e8]
        last:border-b-0
      "
    >
      {/* FIELD */}

      <div
        className={`
          min-w-0
          truncate
          px-2
          py-1
          text-[#334155]
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-medium"}
        `}
      >
        {label}
      </div>

      {/* THIS YEAR */}

      <div
        className={`
          bg-[#fff7c7]
          px-2
          py-1
          text-right
          tabular-nums
          text-[#173b63]
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-semibold"}
        `}
      >
        {formatValue(current, type)}
      </div>

      {/* PREVIOUS YEAR */}

      <div
        className={`
          px-2
          py-1
          text-right
          tabular-nums
          text-[#64748b]
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-semibold"}
        `}
      >
        {formatValue(previous, type)}
      </div>

      {/* CHANGE */}

      <div
        className={`
          px-2
          py-1
          text-right
          tabular-nums
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-bold"}
          ${
            isPositive
              ? "text-[#16803c]"
              : isNegative
                ? "text-[#dc2626]"
                : "text-[#64748b]"
          }
        `}
      >
        {change}
      </div>
    </div>
  );
}

// ============================================================
// EMPLOYEE DRAWER
// ============================================================

export function EmployeeDrawer({ employee, onOpenChange }) {
  const [previous, setPrevious] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // ==========================================================
  // FETCH PREVIOUS APPRAISAL
  // ==========================================================

  useEffect(() => {
    if (!employee?.empId) {
      setPrevious(null);
      setHistoryError("");
      return;
    }

    let cancelled = false;

    async function loadPreviousAppraisal() {
      setHistoryLoading(true);
      setHistoryError("");
      setPrevious(null);

      try {
        const url =
          `${APPRAISAL_HISTORY_API_URL}?emp_id=` +
          encodeURIComponent(employee.empId);

        const response = await catalystFetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch appraisal history (${response.status})`,
          );
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(
            result.message || "Failed to fetch appraisal history.",
          );
        }

        if (cancelled) return;

        /*
         * API returns latest year first:
         *
         * 2025-26
         * 2024-25
         * 2023-24
         *
         * Employee Drawer needs ONLY the latest previous year.
         */

        const latestPreviousYear =
          Array.isArray(result.data) && result.data.length > 0
            ? result.data[0]
            : null;

        setPrevious(latestPreviousYear);
      } catch (error) {
        if (cancelled) return;

        console.error("Employee appraisal history error:", error);

        setPrevious(null);
        setHistoryError(error.message || "Unable to load previous appraisal.");
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadPreviousAppraisal();

    return () => {
      cancelled = true;
    };
  }, [employee?.empId]);

  if (!employee) return null;

  // ==========================================================
  // CURRENT YEAR
  // ==========================================================

  const currentBasePay = Number(employee.currentAnnualBasePay || 0);

  const currentAllocatedPB = employee.allocatedPBAmount;

  const currentPerformanceBonus = employee.newPBToBeOffered;

  const currentRetentionBonus = employee.newRB;

  const currentTotalPB = totalOfPB(employee);

  const currentTotalBonus = totalBonus(employee);

  const currentHikeAmount = hikeAmount(employee);

  const currentHikePct = hikePct(employee);

  /*
   * TARGET PERFORMANCE BONUS
   *
   * This comes from the current employee record:
   * targetPBNextYear
   *
   * Do NOT use employee.targetPerformanceBonus.
   */
  const currentTargetPerformanceBonus = employee.targetPBNextYear;

  /*
   * NEW CTC shown in the comparison section.
   *
   * Existing calculation is preserved.
   */
  const currentNewBasePay = currentBasePay + Number(currentHikeAmount || 0);

  const currentNewCTC = currentNewBasePay + Number(currentTotalBonus || 0);

  // ==========================================================
  // PREVIOUS YEAR
  // ==========================================================

  /*
   * Catalyst field names from Previous_Appraisal:
   *
   * base_pay
   * allocated_pb
   * performance_bonus
   * retention_bonus
   * total_pb
   * total_bonus
   * hike_amount
   * hike_pct
   * new_ctc
   */

  const previousBasePay = previous?.base_pay ?? null;

  const previousAllocatedPB = previous?.allocated_pb ?? null;

  const previousPerformanceBonus = previous?.performance_bonus ?? null;

  const previousRetentionBonus = previous?.retention_bonus ?? null;

  const previousTotalPB = previous?.total_pb ?? null;

  const previousTotalBonus = previous?.total_bonus ?? null;

  const previousHikeAmount = previous?.hike_amount ?? null;

  const previousHikePct = previous?.hike_pct ?? null;

  const previousNewCTC = previous?.new_ctc ?? null;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      className="
        w-full
        overflow-hidden
        rounded-md
        border
        border-[#cbd5e1]
        bg-white
        shadow-[0_4px_14px_rgba(15,23,42,.08)]
      "
    >
      {/* ======================================================
          HEADER
      ======================================================= */}

      <div
        className="
          flex
          h-9
          items-center
          justify-between
          border-b
          border-[#cbd5e1]
          bg-[#173b63]
          px-2.5
        "
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {/* NAME */}

          <h3 className="truncate text-[11px] font-semibold text-white">
            {employee.name}
          </h3>

          {/* EMPLOYEE ID */}

          <span
            className="
              shrink-0
              rounded
              border
              border-white/20
              bg-white/10
              px-1.5
              py-0.5
              font-mono
              text-[8px]
              text-white/85
            "
          >
            {employee.empId}
          </span>

          {/* DESIGNATION */}

          <span
            className="
              hidden
              truncate
              text-[8px]
              text-white/65
              sm:inline
            "
          >
            {valueOrDash(employee.designation)}
          </span>
        </div>

        {/* CLOSE */}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="
            size-5
            shrink-0
            text-white
            hover:bg-white/10
            hover:text-white
          "
          onClick={() => onOpenChange(false)}
        >
          <X className="size-3" />
        </Button>
      </div>

      {/* ======================================================
          MAIN CONTENT
      ======================================================= */}

      <div
        className="
          grid
          grid-cols-1
          gap-2
          bg-white
          p-2
          lg:grid-cols-[1fr_1.45fr]
        "
      >
        {/* ====================================================
            LEFT SIDE
        ===================================================== */}

        <div
          className="
            grid
            content-start
            grid-cols-2
            gap-1
            sm:grid-cols-3
            lg:grid-cols-3
          "
        >
          <InfoCell
            label="Reporting Manager"
            value={employee.reportingManager}
          />

          <InfoCell label="Comp. Manager" value={employee.compManager} />

          <InfoCell
            label="Appraiser Tech/ED"
            value={employee.appraiserTechED}
          />

          <InfoCell
            label="Organization Exp."
            value={
              employee.wissenExperience !== undefined
                ? `${employee.wissenExperience} yrs`
                : null
            }
          />

          <InfoCell
            label="Total Exp."
            value={
              employee.totalExperience !== undefined
                ? `${employee.totalExperience} yrs`
                : null
            }
          />

          <InfoCell label="Last Appraisal" value={employee.lastAppraisalDate} />

          <InfoCell label="Manager Rating" value={employee.managerRating} />

          <InfoCell label="Interviews" value={employee.interviewCount} />

          <InfoCell
            label="RR %"
            value={
              employee.rrPercent !== undefined ? pct(employee.rrPercent) : null
            }
          />

          <InfoCell label="Gross Margin" value={employee.grossMargin} />

          <InfoCell label="Status" value={employee.status} />

          <InfoCell
            label="RB to be Paid"
            value={currency(employee.rbToBePaid)}
          />

          <InfoCell label="Month RB" value={employee.monthRB} />

          <InfoCell
            label="PB to be Paid"
            value={currency(employee.pbToBePaid)}
          />

          <InfoCell label="Month PB" value={employee.monthPB} />

          {/* ==================================================
              FIXED CURRENT CTC
              ================================================== */}

          <InfoCell
            label="Current CTC"
            value={currency(employee.currentAnnualBasePay)}
          />

          {/* ==================================================
              FIXED TARGET PERFORMANCE BONUS
              ================================================== */}

          <InfoCell
            label="Target Performance Bonus"
            value={currency(currentTargetPerformanceBonus)}
          />
        </div>

        {/* ====================================================
            RIGHT SIDE
        ===================================================== */}

        <div className="min-w-0 overflow-x-auto">
          <div
            className="
              min-w-[500px]
              overflow-hidden
              rounded
              border
              border-[#d9e0e8]
            "
          >
            {/* COMPARISON HEADER */}

            <div
              className="
                grid
                grid-cols-[1.6fr_1fr_1fr_0.8fr]
                border-b
                border-[#cbd5e1]
                bg-[#e8eef5]
              "
            >
              <div
                className="
                  px-2
                  py-1
                  text-left
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-[#334155]
                "
              >
                Field
              </div>

              <div
                className="
                  px-2
                  py-1
                  text-right
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-[#334155]
                "
              >
                This Year
              </div>

              <div
                className="
                  px-2
                  py-1
                  text-right
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-[#334155]
                "
              >
                Previous Year
              </div>

              <div
                className="
                  px-2
                  py-1
                  text-right
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-[#334155]
                "
              >
                Change
              </div>
            </div>

            {/* LOADING */}

            {historyLoading && (
              <div
                className="
                  px-3
                  py-2
                  text-center
                  text-[8px]
                  font-medium
                  text-[#64748b]
                "
              >
                Loading previous appraisal...
              </div>
            )}

            {/* ERROR */}

            {!historyLoading && historyError && (
              <div
                className="
                  px-3
                  py-2
                  text-center
                  text-[8px]
                  font-medium
                  text-red-600
                "
              >
                {historyError}
              </div>
            )}

            {/* NO PREVIOUS RECORD */}

            {!historyLoading && !historyError && !previous && (
              <div
                className="
                    px-3
                    py-2
                    text-center
                    text-[8px]
                    font-medium
                    text-[#64748b]
                  "
              >
                No previous appraisal found.
              </div>
            )}

            {/* COMPARISON DATA */}

            {!historyLoading && previous && (
              <>
                {/* ANNUAL BASE PAY */}

                <ComparisonRow
                  label="Annual Base Pay"
                  current={currentBasePay}
                  previous={previousBasePay}
                  type="currency"
                />

                {/* ALLOCATED PB */}

                <ComparisonRow
                  label="Allocated PB"
                  current={currentAllocatedPB}
                  previous={previousAllocatedPB}
                  type="currency"
                />

                {/* PERFORMANCE BONUS */}

                <ComparisonRow
                  label="Performance Bonus"
                  current={currentPerformanceBonus}
                  previous={previousPerformanceBonus}
                  type="currency"
                />

                {/* RETENTION BONUS */}

                <ComparisonRow
                  label="Retention Bonus"
                  current={currentRetentionBonus}
                  previous={previousRetentionBonus}
                  type="currency"
                />

                {/* TOTAL PB */}

                <ComparisonRow
                  label="Total PB"
                  current={currentTotalPB}
                  previous={previousTotalPB}
                  type="currency"
                />

                {/* TOTAL BONUS */}

                <ComparisonRow
                  label="Total Bonus"
                  current={currentTotalBonus}
                  previous={previousTotalBonus}
                  type="currency"
                />

                {/* HIKE AMOUNT */}

                <ComparisonRow
                  label="Hike Amount"
                  current={currentHikeAmount}
                  previous={previousHikeAmount}
                  type="currency"
                />

                {/* HIKE % */}

                <ComparisonRow
                  label="Hike %"
                  current={currentHikePct}
                  previous={previousHikePct}
                  type="percent"
                />

                {/* NEW CTC */}

                <ComparisonRow
                  label="New CTC"
                  current={currentNewCTC}
                  previous={previousNewCTC}
                  type="currency"
                  bold
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
