// ============================================================
// APPRAISAL DATA
// ============================================================

// Dropdown options
export const MANAGER_RATINGS = [
  "Exceeds Expectation",
  "Meets Expectation",
  "Sometimes Meets Expectation",
];

export const STATUSES = ["Pending", "In Progress", "Completed", "Submitted"];

export const INSTALLMENT_OPTIONS = ["1", "2", "4"];

export const PROMOTION_OPTIONS = ["Yes", "No"];

export const NEW_TITLES = [
  "Associate",
  "Senior Associate",
  "Senior Analyst",
  "Team Lead",
  "Manager",
  "Senior Manager",
  "Program Executive",
  "Specialist",
];

export const DEPARTMENTS = [
  "Sales",
  "HR",
  "Marketing",
  "Operations",
  "Engineering",
  "Finance",
];

export const MANAGERS = [
  "Priya Nair",
  "Vikram Iyer",
  "Neha Gupta",
  "Arjun Mehta",
  "Sunita Rao",
];

const DESIGNATIONS = [
  "Program Executive",
  "Senior Analyst",
  "Team Lead",
  "Manager",
  "Associate",
  "Specialist",
];

const FIRST = [
  "Rahul",
  "Anita",
  "Sahil",
  "Meera",
  "Karan",
  "Divya",
  "Rohit",
  "Sneha",
  "Amit",
  "Pooja",
  "Vivek",
  "Isha",
  "Nikhil",
  "Tara",
  "Manoj",
  "Farah",
  "Dev",
  "Ritu",
  "Aakash",
  "Leena",
];

const LAST = [
  "Sharma",
  "Roy",
  "Khan",
  "Pillai",
  "Verma",
  "Menon",
  "Das",
  "Kulkarni",
  "Bose",
  "Chopra",
  "Nanda",
  "Sen",
];

// ============================================================
// CALCULATIONS
//
//   Total of PB            = Allocated PB + New PB
//   Total Bonus            = Total of PB + New RB          (joining bonus is one-time, not here)
//   New Base Salary        = Current Base + Hike Amount    (next year's base, also Total CTC)
//   Total Rewards          = New Base Salary + Total Bonus (column "Total Rewards")
//   Current Rewards        = RB to be paid + PB to be paid (what is being paid now)
//   Total Bonus Hike       = Total Bonus - Current Rewards
//   Total Rewards Hike     = Hike Amount + Total Bonus Hike
//   Total Rewards Hike %   = Total Rewards Hike / (Current Base + Current Rewards)
// ============================================================

export const totalOfPB = (r) =>
  Number(r.allocatedPBAmount || 0) + Number(r.newPBToBeOffered || 0);

export const totalBonus = (r) => totalOfPB(r) + Number(r.newRB || 0);

export const hikeAmount = (r) => {
  if (r.hikeAmount !== undefined && r.hikeAmount !== null) {
    return Number(r.hikeAmount) || 0;
  }

  return Math.round(
    Number(r.currentAnnualBasePay || 0) * Number(r.hikeRate || 0),
  );
};

export const hikePct = (r) => {
  if (r.hikePct !== undefined && r.hikePct !== null) {
    return Number(r.hikePct) || 0;
  }

  const basePay = Number(r.currentAnnualBasePay || 0);

  return basePay ? (hikeAmount(r) / basePay) * 100 : 0;
};

export const newBaseSalary = (r) =>
  Number(r.currentAnnualBasePay || 0) + hikeAmount(r);

export const totalCTCWithRewards = (r) => newBaseSalary(r) + totalBonus(r);

export const currentRewards = (r) =>
  Number(r.rbToBePaid || 0) + Number(r.pbToBePaid || 0);

export const totalBonusHikeAmount = (r) => totalBonus(r) - currentRewards(r);

export const totalBonusHikePct = (r) => {
  const current = currentRewards(r);

  return current ? (totalBonusHikeAmount(r) / current) * 100 : 0;
};

export const totalRewardsHikeAmount = (r) =>
  hikeAmount(r) + totalBonusHikeAmount(r);

// FIX: the percentage is measured against the CURRENT total rewards
// (base pay + rewards being paid now), not against base pay alone.
export const totalRewardsHikePct = (r) => {
  const current = Number(r.currentAnnualBasePay || 0) + currentRewards(r);

  return current ? (totalRewardsHikeAmount(r) / current) * 100 : 0;
};

export const payoutPct = (r) => {
  const target = Number(r.targetPBAllocatedForMay || 0);

  return target ? (totalOfPB(r) / target) * 100 : 0;
};

export const revisedCTC = (r) =>
  Number(r.currentAnnualBasePay || 0) + hikeAmount(r);

export const totalPayout = (r) => totalBonus(r);

// ============================================================
// COLUMNS
// ============================================================
//
// ONLY THESE FIELDS ARE EDITABLE:
//
// 1. allocatedPBAmount
// 2. pbInstallment
// 3. newPBToBeOffered
// 4. newPBInstallment
// 5. newRB
// 6. hikeAmount
// 7. hikePct
// 8. targetPBNextYear
// 9. eligibleForPromotion
// 10. newTitle (only when Eligible for Promotion = Yes)
// 11. atRisk
//
// Everything else is READ-ONLY.
// ============================================================

export const COLUMNS = [
  {
    key: "empId",
    label: "EMP ID",
    type: "text",
    editable: false,
    width: 100,
  },
  {
    key: "name",
    label: "EMP Name",
    type: "text",
    editable: false,
    width: 100,
  },
  {
    key: "designation",
    label: "Designation",
    type: "text",
    editable: false,
    width: 170,
  },
  {
    key: "reportingManager",
    label: "Reporting Manager",
    type: "text",
    editable: false,
    width: 170,
  },
  {
    key: "compManager",
    label: "Comp. Manager",
    type: "text",
    editable: false,
    width: 150,
  },
  {
    key: "appraiserTechED",
    label: "Appraiser Tech/ED",
    type: "text",
    editable: false,
    width: 160,
  },
  {
    key: "wissenExperience",
    label: "Organization Experience",
    type: "decimal",
    editable: false,
    width: 150,
  },
  {
    key: "totalExperience",
    label: "Total Experience",
    type: "decimal",
    editable: false,
    width: 140,
  },
  {
    key: "lastAppraisalDate",
    label: "Last Appraisal Date",
    type: "date",
    editable: false,
    width: 160,
  },
  {
    key: "managerRating",
    label: "Manager Rating",
    type: "enum",
    editable: false,
    options: MANAGER_RATINGS,
    width: 210,
  },
  {
    key: "interviewCount",
    label: "Interview Count",
    type: "number",
    editable: false,
    width: 140,
  },
  {
    key: "rrPercent",
    label: "RR %",
    type: "percent",
    editable: false,
    width: 100,
  },
  {
    key: "grossMargin",
    label: "Gross Margin",
    type: "decimal",
    editable: false,
    width: 130,
  },
  {
    key: "rbToBePaid",
    label: "RB to be Paid",
    type: "currency",
    editable: false,
    width: 140,
  },
  {
    key: "monthRB",
    label: "Month RB",
    type: "text",
    editable: false,
    width: 120,
  },
  {
    key: "pbToBePaid",
    label: "PB to be Paid",
    type: "currency",
    editable: false,
    width: 140,
  },
  {
    key: "monthPB",
    label: "Month PB",
    type: "text",
    editable: false,
    width: 120,
  },
  {
    key: "currentAnnualBasePay",
    label: "Current Annual Base Pay",
    type: "currency",
    editable: false,
    width: 180,
  },
  {
    key: "targetPBAllocatedForMay",
    label: "Target PB Allocated for May",
    type: "currency",
    editable: false,
    width: 190,
  },

  // ==========================================================
  // EDITABLE
  // ==========================================================

  {
    key: "allocatedPBAmount",
    label: "Allocated PB Amount",
    type: "currency",
    editable: true,
    width: 170,
  },
  {
    key: "pbInstallment",
    label: "PB Installment",
    type: "enum",
    editable: true,
    options: INSTALLMENT_OPTIONS,
    width: 110,
  },
  {
    key: "newPBToBeOffered",
    label: "New PB to be Offered",
    type: "currency",
    editable: true,
    width: 170,
  },
  {
    key: "newPBInstallment",
    label: "New PB Installment",
    type: "enum",
    editable: true,
    options: INSTALLMENT_OPTIONS,
    width: 110,
  },

  // ==========================================================
  // COMPUTED
  // ==========================================================

  {
    key: "totalOfPB",
    label: "Total of PB",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalOfPB,
    width: 140,
  },

  // ==========================================================
  // EDITABLE
  // ==========================================================

  {
    key: "newRB",
    label: "New RB",
    type: "currency",
    editable: true,
    width: 120,
  },

  // ==========================================================
  // COMPUTED
  // ==========================================================

  {
    key: "totalBonus",
    label: "Total Bonus",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalBonus,
    width: 190,
  },

  // ==========================================================
  // EDITABLE
  // ==========================================================

  {
    key: "hikeAmount",
    label: "Hike Amount",
    type: "currency",
    editable: true,
    width: 140,
  },
  {
    key: "hikePct",
    label: "Hike %",
    type: "percent",
    editable: true,
    width: 100,
  },

  // ==========================================================
  // COMPUTED
  // ==========================================================

  {
    key: "totalCTCWithRewards",
    label: "Total Rewards",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalCTCWithRewards,
    width: 190,
  },
  {
    key: "totalBonusHikeAmount",
    label: "Total Bonus Hike Amount",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalBonusHikeAmount,
    width: 190,
  },
  {
    key: "totalBonusHikePct",
    label: "Total Bonus Hike %",
    type: "percent",
    editable: false,
    computed: true,
    fn: totalBonusHikePct,
    width: 160,
  },
  {
    key: "totalRewardsHikeAmount",
    label: "Total Rewards Hike Amount",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalRewardsHikeAmount,
    width: 200,
  },
  {
    key: "totalRewardsHikePct",
    label: "Total Rewards Hike %",
    type: "percent",
    editable: false,
    computed: true,
    fn: totalRewardsHikePct,
    width: 170,
  },
  {
    key: "newBaseSalary",
    label: "New Base Salary",
    type: "currency",
    editable: false,
    computed: true,
    fn: newBaseSalary,
    width: 160,
  },

  // ==========================================================
  // EDITABLE
  // ==========================================================

  {
    key: "targetPBNextYear",
    label: "Target PB Next Year",
    type: "currency",
    editable: true,
    width: 180,
  },
  {
    key: "eligibleForPromotion",
    label: "Eligible for Promotion",
    type: "enum",
    editable: true,
    options: PROMOTION_OPTIONS,
    width: 170,
  },
  {
    key: "newTitle",
    label: "New Title",
    type: "enum",
    editable: true,
    options: NEW_TITLES,
    width: 170,
  },
  {
    key: "atRisk",
    label: "At Risk",
    type: "textarea",
    editable: true,
    width: 220,
  },
];

// ============================================================
// COMPUTED / EDITABLE COLUMN HELPERS
// ============================================================

export const COMPUTED_COLUMNS = COLUMNS.filter((c) => c.computed).map((c) => ({
  key: c.key,
  label: c.label,
  fn: c.fn,
  kind: c.type === "currency" ? "currency" : "percent",
  width: c.width,
}));

export const EDITABLE_KEYS = COLUMNS.filter((c) => c.editable).map(
  (c) => c.key,
);

// ============================================================
// DEMO DATA GENERATOR
// ============================================================

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;

    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEmployees(count = 250) {
  const rand = mulberry(42);

  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const rows = [];

  for (let i = 0; i < count; i++) {
    const currentAnnualBasePay =
      Math.round((600000 + rand() * 2400000) / 10000) * 10000;

    const targetPBAllocatedForMay =
      Math.round((currentAnnualBasePay * (0.06 + rand() * 0.1)) / 1000) * 1000;

    const rating = pick(MANAGER_RATINGS);

    const hikeRate =
      rating === "Exceeds Expectation"
        ? 0.12 + rand() * 0.04
        : rating === "Meets Expectation"
          ? 0.08 + rand() * 0.04
          : 0.04 + rand() * 0.04;

    const initialHikeAmount = Math.round(currentAnnualBasePay * hikeRate);

    const initialHikePct = Number(
      ((initialHikeAmount / currentAnnualBasePay) * 100).toFixed(1),
    );

    const allocatedPBAmount =
      Math.round((targetPBAllocatedForMay * (0.45 + rand() * 0.35)) / 1000) *
      1000;

    const newPBToBeOffered =
      Math.round((targetPBAllocatedForMay * (0.1 + rand() * 0.2)) / 1000) *
      1000;

    const rbToBePaid =
      rand() > 0.65
        ? Math.round((currentAnnualBasePay * 0.01 * rand()) / 1000) * 1000
        : 0;

    const newRB =
      rand() > 0.55
        ? Math.round((currentAnnualBasePay * 0.005 * rand()) / 1000) * 1000
        : 0;

    const status = pick(STATUSES);

    const performanceBonus = totalOfPB({
      allocatedPBAmount,
      newPBToBeOffered,
    });

    rows.push({
      id: `emp-${i + 1}`,

      empId: `E${String(i + 1).padStart(3, "0")}`,

      name: `${pick(FIRST)} ${pick(LAST)}`,

      designation: pick(DESIGNATIONS),

      reportingManager: pick(MANAGERS),

      compManager: pick(MANAGERS),

      appraiserTechED: pick(["Yes", "No", "Tech", "ED"]),

      wissenExperience: Number((0.5 + rand() * 7).toFixed(1)),

      totalExperience: Number((1 + rand() * 10).toFixed(1)),

      lastAppraisalDate: `${2025 + (rand() > 0.5 ? 0 : -1)}-${String(
        1 + Math.floor(rand() * 12),
      ).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(
        2,
        "0",
      )}`,

      managerRating: rating,

      interviewCount: Math.floor(rand() * 16),

      rrPercent: Number((40 + rand() * 60).toFixed(1)),

      grossMargin: Number((10 + rand() * 35).toFixed(2)),

      rbToBePaid,

      monthRB: rbToBePaid ? pick(["May", "June", "July", "August"]) : "",

      pbToBePaid:
        Math.round((targetPBAllocatedForMay * (0.35 + rand() * 0.3)) / 1000) *
        1000,

      monthPB: pick(["May", "June", "July", "August"]),

      currentAnnualBasePay,

      targetPBAllocatedForMay,

      allocatedPBAmount,

      pbInstallment: pick(INSTALLMENT_OPTIONS),

      newPBToBeOffered,

      newPBInstallment: pick(INSTALLMENT_OPTIONS),

      newRB,

      targetPBNextYear:
        Math.round((targetPBAllocatedForMay * (1.0 + rand() * 0.2)) / 1000) *
        1000,

      eligibleForPromotion: rand() > 0.7 ? "Yes" : "No",

      newTitle: pick(NEW_TITLES),

      atRisk:
        rand() > 0.82 ? "Needs close review before final submission." : "",

      hikeRate,

      hikeAmount: initialHikeAmount,

      hikePct: initialHikePct,

      department: pick(DEPARTMENTS),

      manager: pick(MANAGERS),

      status,

      currentCTC: currentAnnualBasePay,

      targetPerformanceBonus: targetPBAllocatedForMay,

      performanceBonus,

      retentionBonus: newRB,

      comments: "",
    });
  }

  return rows;
}

// ============================================================
// FORMATTING
// ============================================================

export const inr = (n) =>
  "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

export const pct = (n) => `${Number(n || 0).toFixed(1)}%`;

export function formatValue(row, col) {
  const value = col.computed && col.fn ? col.fn(row) : row[col.key];

  if (col.type === "currency") {
    return inr(value);
  }

  if (col.type === "percent") {
    return pct(value);
  }

  if (col.type === "decimal") {
    return Number(value || 0).toFixed(2);
  }

  return String(value ?? "");
}
