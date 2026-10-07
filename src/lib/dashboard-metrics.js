import {
  totalOfPB,
  hikeAmount as calcHikeAmount,
  hikePct as calcHikePct,
} from "@/lib/appraisal-data";

// Placeholder estimate (percentage of current base pay). Used for the
// org total only when Budget Master data is unavailable, and for the
// per-manager / per-designation splits, which Budget Master doesn't provide.
const PLACEHOLDER_BUDGET_PCT = 0.08;

export function groupBy(rows, keyFn) {
  const map = new Map();

  rows.forEach((r) => {
    const key = keyFn(r) || "—";

    if (!map.has(key)) map.set(key, []);

    map.get(key).push(r);
  });

  return map;
}

export function sum(rows, fn) {
  return rows.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
}

export function orgAllocated(rows) {
  return sum(rows, (r) => r.currentAnnualBasePay) * PLACEHOLDER_BUDGET_PCT;
}

// realAllocated: the Budget Master total (from the budget store). When it
// is missing, fall back to the placeholder estimate and flag it.
export function budgetTotals(rows, realAllocated) {
  const hike = sum(rows, calcHikeAmount);
  const pb = sum(rows, totalOfPB);
  const rb = sum(rows, (r) => r.newRB);
  const consumed = hike + pb + rb;
  const hasReal = Number(realAllocated) > 0;
  const allocated = hasReal ? Number(realAllocated) : orgAllocated(rows);

  return {
    hike,
    pb,
    rb,
    consumed,
    allocated,
    allocatedIsEstimate: !hasReal,
    utilisation: allocated ? (consumed / allocated) * 100 : 0,
  };
}

export function byManager(rows) {
  const groups = groupBy(rows, (r) => r.compManager || r.reportingManager);

  return Array.from(groups.entries()).map(([name, list]) => {
    const hike = sum(list, calcHikeAmount);
    const pb = sum(list, totalOfPB);
    const rb = sum(list, (r) => r.newRB);
    const consumed = hike + pb + rb;
    const allocated = orgAllocated(list);
    const targetPB = sum(list, (r) => r.targetPBAllocatedForMay);
    const avgHike = list.length ? sum(list, calcHikePct) / list.length : 0;

    return {
      name,
      headcount: list.length,
      hike,
      pb,
      rb,
      consumed,
      allocated,
      utilisation: allocated ? (consumed / allocated) * 100 : 0,
      targetPB,
      avgHike,
    };
  });
}

export function byDesignation(rows) {
  const groups = groupBy(rows, (r) => r.designation);

  return Array.from(groups.entries())
    .map(([name, list]) => {
      const hike = sum(list, calcHikeAmount);
      const pb = sum(list, totalOfPB);
      const rb = sum(list, (r) => r.newRB);
      const consumed = hike + pb + rb;
      const allocated = orgAllocated(list);
      const targetPB = sum(list, (r) => r.targetPBAllocatedForMay);
      const targetNext = sum(list, (r) => r.targetPBNextYear);
      const avgBase = list.length
        ? sum(list, (r) => r.currentAnnualBasePay) / list.length
        : 0;
      const avgHike = list.length ? sum(list, calcHikePct) / list.length : 0;
      const promotions = list.filter(
        (r) => r.eligibleForPromotion === "Yes",
      ).length;

      return {
        name,
        headcount: list.length,
        hike,
        pb,
        rb,
        consumed,
        allocated,
        targetPB,
        targetNext,
        avgBase,
        avgHike,
        promotions,
      };
    })
    .sort((a, b) => b.headcount - a.headcount);
}

export function ratingDistribution(rows) {
  const groups = groupBy(rows, (r) => r.managerRating);

  return Array.from(groups.entries()).map(([rating, list]) => ({
    rating,
    count: list.length,
    avgHike: list.length ? sum(list, calcHikePct) / list.length : 0,
  }));
}

export function payoutDistribution(rows) {
  const buckets = [
    { label: "< 80%", test: (p) => p < 80 },
    { label: "80–99%", test: (p) => p >= 80 && p < 100 },
    { label: "100–119%", test: (p) => p >= 100 && p < 120 },
    { label: "120%+", test: (p) => p >= 120 },
  ];

  // Employees without a PB target have no payout % — count them
  // separately instead of dropping them into "< 80%".
  const withTarget = rows.filter(
    (r) => (Number(r.targetPBAllocatedForMay) || 0) > 0,
  );

  const result = buckets.map((b) => ({
    label: b.label,
    count: withTarget.filter((r) => {
      const target = Number(r.targetPBAllocatedForMay) || 0;

      return b.test((totalOfPB(r) / target) * 100);
    }).length,
  }));

  const noTarget = rows.length - withTarget.length;

  if (noTarget > 0) {
    result.push({ label: "No target", count: noTarget });
  }

  return result;
}
