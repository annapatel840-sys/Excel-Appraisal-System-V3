// Pure helpers for the Budget Allocation / Team Changes feature.
// Ported from the standalone "Detail Screen & Budget" HTML prototype so the
// same math is used by DetailScreenPage, TeamChangesPage and
// BudgetAllocationPage.

export const DEFAULT_LEVELS = ["Tech ED", "Comp Manager"];

// Who sits at which level, and who allots budget to whom.
// Swap this for real org-chart data (e.g. from Employee Master) once available.
export const DEFAULT_HIERARCHY = {
  "Vikram Rao": { level: 1, parent: null },
  "Anita Sharma": { level: 2, parent: "Vikram Rao" },
  "Raj Mehta": { level: 2, parent: "Vikram Rao" },
  "Meera Nair": { level: 1, parent: null },
  "Suresh Iyer": { level: 2, parent: "Meera Nair" },
};

export const DEFAULT_ALLOCATION = {
  date: "2026-09-01",
  by: "HR Admin",
  orgPct: 8,
  pct: {
    "Vikram Rao": 8,
    "Meera Nair": 7.5,
    "Anita Sharma": 7.5,
    "Raj Mehta": 6.5,
    "Suresh Iyer": 7,
  },
};

export const DEFAULT_BUDGET_CONFIG = {
  baseColumns: ["currentAnnualBasePay", "allocatedPBAmount"],
  baseLocked: true,
  utilisedColumns: [{ key: "hikeAmount", label: "Hike Amount" }],
};

export const BUDGET_COLUMNS = [
  { key: "currentAnnualBasePay", label: "Current Annual Base Pay" },
  { key: "allocatedPBAmount", label: "Allocated PB Amount" },
  { key: "targetPBAllocatedForMay", label: "Target PB Allocated for May" },
  { key: "hikeAmount", label: "Hike Amount" },
  { key: "totalOfPB", label: "Total of PB" },
  { key: "newPB", label: "New PB to be Offered" },
  { key: "newRB", label: "New RB" },
  { key: "targetPBNextYear", label: "Target PB for Next Year" },
  { key: "joiningBonus", label: "Joining Bonus" },
];

// ---------------------------------------------------------------------
// STATIC SAMPLE DATA
// ---------------------------------------------------------------------
// Team Changes and Budget Allocation need a "team" (people + budget-base
// columns) and a history of who joined/left each manager. There's no real
// feed for that yet, so this sample set — matching DEFAULT_HIERARCHY's
// manager names — powers those two screens for now.
//
// TO GO LIVE LATER: replace SAMPLE_ROWS with real employee rows (each row
// needs empId, name, compManager, and the budget-base / utilised columns),
// and replace SAMPLE_ELIGIBILITY_EVENTS / SAMPLE_GRID_SUPERVISOR_CHANGES /
// SAMPLE_ALLOCATION_SNAPSHOT with the real eligibility-list and
// appraisal-grid manager-change history. Nothing else needs to change —
// budget-store.jsx just needs those swapped values passed in.
export const SAMPLE_ROWS = [
  {
    empId: "EMP00125",
    name: "Rohan Kapoor",
    compManager: "Anita Sharma",
    currentAnnualBasePay: 2500000,
    allocatedPBAmount: 300000,
    hikeAmount: 250000,
    targetPBAllocatedForMay: 500000,
    newPB: 450000,
    newRB: 250000,
    targetPBNextYear: 550000,
  },
  {
    empId: "EMP200",
    name: "Aarav Iyer",
    compManager: "Anita Sharma",
    currentAnnualBasePay: 800000,
    allocatedPBAmount: 86400,
    hikeAmount: 48000,
    targetPBAllocatedForMay: 144000,
    newPB: 93600,
    newRB: 64000,
    targetPBNextYear: 158400,
  },
  {
    empId: "EMP205",
    name: "Sai Gupta",
    compManager: "Anita Sharma",
    currentAnnualBasePay: 1550000,
    allocatedPBAmount: 167400,
    hikeAmount: 170500,
    targetPBAllocatedForMay: 279000,
    newPB: 181350,
    newRB: 124000,
    targetPBNextYear: 306900,
  },
  {
    empId: "EMP210",
    name: "Ananya Bhatt",
    compManager: "Anita Sharma",
    currentAnnualBasePay: 2300000,
    allocatedPBAmount: 248400,
    hikeAmount: 138000,
    targetPBAllocatedForMay: 414000,
    newPB: 269100,
    newRB: 184000,
    targetPBNextYear: 455400,
  },
  {
    empId: "EMP220",
    name: "Rahul Iyer",
    compManager: "Anita Sharma",
    currentAnnualBasePay: 3800000,
    allocatedPBAmount: 410400,
    hikeAmount: 228000,
    targetPBAllocatedForMay: 684000,
    newPB: 444600,
    newRB: 304000,
    targetPBNextYear: 752400,
  },
  {
    empId: "EMP225",
    name: "Varun Gupta",
    compManager: "Anita Sharma",
    currentAnnualBasePay: 800000,
    allocatedPBAmount: 86400,
    hikeAmount: 88000,
    targetPBAllocatedForMay: 144000,
    newPB: 93600,
    newRB: 64000,
    targetPBNextYear: 158400,
  },
  {
    empId: "EMP201",
    name: "Vivaan Mehta",
    compManager: "Raj Mehta",
    currentAnnualBasePay: 950000,
    allocatedPBAmount: 102600,
    hikeAmount: 66500,
    targetPBAllocatedForMay: 171000,
    newPB: 111150,
    newRB: 76000,
    targetPBNextYear: 188100,
  },
  {
    empId: "EMP206",
    name: "Reyansh Reddy",
    compManager: "Raj Mehta",
    currentAnnualBasePay: 1700000,
    allocatedPBAmount: 183600,
    hikeAmount: 204000,
    targetPBAllocatedForMay: 306000,
    newPB: 198900,
    newRB: 136000,
    targetPBNextYear: 336600,
  },
  {
    empId: "EMP202",
    name: "Aditya Singh",
    compManager: "Suresh Iyer",
    currentAnnualBasePay: 1100000,
    allocatedPBAmount: 118800,
    hikeAmount: 88000,
    targetPBAllocatedForMay: 198000,
    newPB: 128700,
    newRB: 88000,
    targetPBNextYear: 217800,
  },
  {
    empId: "EMP207",
    name: "Ayaan Menon",
    compManager: "Suresh Iyer",
    currentAnnualBasePay: 1850000,
    allocatedPBAmount: 199800,
    hikeAmount: 240500,
    targetPBAllocatedForMay: 333000,
    newPB: 216450,
    newRB: 148000,
    targetPBNextYear: 366300,
  },
];

export const SAMPLE_ALLOCATION_SNAPSHOT = {
  date: "01-Sep-26",
  teams: {
    "Anita Sharma": [
      "EMP00125",
      "EMP200",
      "EMP205",
      "EMP210",
      "EMP215",
      "EMP290",
      "EMP202",
    ],
    "Raj Mehta": ["EMP201", "EMP206", "EMP211", "EMP220"],
    "Suresh Iyer": ["EMP207"],
  },
};

// People who were on a team at allocation time but have since left — kept
// here (rather than in SAMPLE_ROWS) because a leaver's budget-base numbers
// still need to count in the "at allocation" snapshot.
export const SAMPLE_LEAVERS = {
  EMP290: {
    empId: "EMP290",
    name: "Kiran Das",
    currentAnnualBasePay: 1200000,
    allocatedPBAmount: 130000,
  },
  EMP211: {
    empId: "EMP211",
    name: "Diya Sharma",
    currentAnnualBasePay: 2450000,
    allocatedPBAmount: 264600,
  },
  EMP215: {
    empId: "EMP215",
    name: "Myra Patel",
    currentAnnualBasePay: 3050000,
    allocatedPBAmount: 329400,
  },
};

// Source 1 — eligibility list: people added to / removed from the list.
export const SAMPLE_ELIGIBILITY_EVENTS = [
  {
    empId: "EMP290",
    name: "Kiran Das",
    manager: "Anita Sharma",
    type: "left",
    date: "2026-09-12",
  },
  {
    empId: "EMP225",
    name: "Varun Gupta",
    manager: "Anita Sharma",
    type: "added",
    date: "2026-09-15",
  },
  {
    empId: "EMP215",
    name: "Myra Patel",
    manager: "Anita Sharma",
    type: "left",
    date: "2026-09-22",
  },
  {
    empId: "EMP211",
    name: "Diya Sharma",
    manager: "Raj Mehta",
    type: "left",
    date: "2026-09-21",
  },
];

// Source 2 — appraisal grid: supervisor changes.
export const SAMPLE_GRID_SUPERVISOR_CHANGES = [
  {
    empId: "EMP220",
    name: "Rahul Iyer",
    from: "Raj Mehta",
    to: "Anita Sharma",
    date: "2026-09-18",
  },
  {
    empId: "EMP202",
    name: "Aditya Singh",
    from: "Anita Sharma",
    to: "Suresh Iyer",
    date: "2026-09-20",
  },
];

export const TYPE_LABEL = {
  left: "Resigned",
  added: "Added",
  in: "Transferred in",
  out: "Transferred out",
};

export function fmtLakh(n) {
  return "₹ " + ((Number(n) || 0) / 1e5).toFixed(2) + " L";
}

export function fmtInr(n) {
  return "₹ " + Math.round(Number(n) || 0).toLocaleString("en-IN");
}

export function colLabel(key) {
  const c = BUDGET_COLUMNS.find((x) => x.key === key);
  return c ? c.label : key;
}

export function dateText(iso) {
  const p = String(iso).split("-");
  const M = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return p.length === 3 ? `${p[2]}-${M[Number(p[1]) - 1]}` : iso;
}

export function levelName(levels, n) {
  return levels[(n || 1) - 1] || `Level ${n}`;
}

function colValueOf(emp, key) {
  if (key === "totalOfPB") {
    return (Number(emp.allocatedPBAmount) || 0) + (Number(emp.newPB) || 0);
  }
  return Number(emp[key]) || 0;
}

export function empBase(emp, baseColumns) {
  if (!emp) return 0;
  return baseColumns.reduce((s, k) => s + colValueOf(emp, k), 0);
}

export function utilisedOf(list, utilisedColumns) {
  return list.reduce(
    (sum, e) =>
      sum + utilisedColumns.reduce((t, c) => t + colValueOf(e, c.key), 0),
    0,
  );
}

export function childrenOf(hierarchy, name) {
  return Object.keys(hierarchy).filter((k) => hierarchy[k].parent === name);
}

export function rootsOf(hierarchy) {
  return Object.keys(hierarchy).filter((k) => !hierarchy[k].parent);
}

export function subtreeOf(hierarchy, name) {
  let out = [name];
  childrenOf(hierarchy, name).forEach((c) => {
    out = out.concat(subtreeOf(hierarchy, c));
  });
  return out;
}

export function currentTeamOf(
  rows,
  hierarchy,
  name,
  scopeField = "compManager",
) {
  const team = subtreeOf(hierarchy, name);
  return rows.filter((r) => team.indexOf(r[scopeField]) > -1);
}

function snapshotTeamOf(hierarchy, name, allocationSnapshot, empById) {
  let ids = [];
  subtreeOf(hierarchy, name).forEach((m) => {
    ids = ids.concat(
      (allocationSnapshot &&
        allocationSnapshot.teams &&
        allocationSnapshot.teams[m]) ||
        [],
    );
  });
  return ids.map(empById).filter(Boolean);
}

/**
 * Compute a full budget node (self + rollup to reports) for one owner.
 */
export function computeNode({
  name,
  rows,
  hierarchy,
  allocation,
  budgetConfig,
  allocationSnapshot,
  empById,
  scopeField = "compManager",
}) {
  const h = hierarchy[name];
  if (!h) return null;

  const team0 = snapshotTeamOf(hierarchy, name, allocationSnapshot, empById);
  const team1 = currentTeamOf(rows, hierarchy, name, scopeField);
  const kids = childrenOf(hierarchy, name);

  const base0 = team0.reduce(
    (s, e) => s + empBase(e, budgetConfig.baseColumns),
    0,
  );
  const base1 = team1.reduce(
    (s, e) => s + empBase(e, budgetConfig.baseColumns),
    0,
  );

  const pct = allocation.pct[name] ?? 0;
  const pct0 = (allocation.originalPct && allocation.originalPct[name]) ?? pct;

  const node = {
    name,
    level: h.level,
    parent: h.parent,
    pct,
    pct0,
    team0: team0.length,
    team: team1.length,
    base0,
    base: base1,
    utilised: utilisedOf(team1, budgetConfig.utilisedColumns),
    kids,
  };

  node.original = (node.base0 * node.pct0) / 100;
  node.updated = (node.base * node.pct) / 100;

  node.allotted = kids.reduce((s, k) => {
    const childNode = computeNode({
      name: k,
      rows,
      hierarchy,
      allocation,
      budgetConfig,
      allocationSnapshot,
      empById,
      scopeField,
    });
    return s + (childNode ? childNode.updated : 0);
  }, 0);
  node.buffer = node.updated - node.allotted;

  return node;
}

export function budgetForUser({
  isHR,
  userName,
  rows,
  hierarchy,
  allocation,
  budgetConfig,
  allocationSnapshot,
  empById,
  scopeField,
}) {
  if (isHR) {
    let initial = 0;
    let updated = 0;
    rootsOf(hierarchy).forEach((r) => {
      const nd = computeNode({
        name: r,
        rows,
        hierarchy,
        allocation,
        budgetConfig,
        allocationSnapshot,
        empById,
        scopeField,
      });
      if (nd) {
        initial += nd.original;
        updated += nd.updated;
      }
    });
    return { initial, updated, version: Math.round(updated) };
  }
  if (!hierarchy[userName]) return { initial: 0, updated: 0, version: 0 };
  const nd = computeNode({
    name: userName,
    rows,
    hierarchy,
    allocation,
    budgetConfig,
    allocationSnapshot,
    empById,
    scopeField,
  });
  return {
    initial: nd.original,
    updated: nd.updated,
    version: Math.round(nd.updated),
  };
}

/**
 * One combined change log from the eligibility list and appraisal-grid
 * supervisor changes, newest first, one entry per person per manager.
 */
export function buildChangeLog(eligibilityEvents, gridSupervisorChanges) {
  let log = [];

  (eligibilityEvents || []).forEach((ev) => {
    log.push({
      date: ev.date,
      empId: ev.empId,
      name: ev.name,
      type: ev.type,
      manager: ev.manager,
      from: ev.type === "left" ? ev.manager : "—",
      to: ev.type === "added" ? ev.manager : "—",
      source: "Eligibility list",
    });
  });

  (gridSupervisorChanges || []).forEach((ev) => {
    log.push({
      date: ev.date,
      empId: ev.empId,
      name: ev.name,
      type: "in",
      manager: ev.to,
      from: ev.from,
      to: ev.to,
      source: "Appraisal grid",
    });
    log.push({
      date: ev.date,
      empId: ev.empId,
      name: ev.name,
      type: "out",
      manager: ev.from,
      from: ev.from,
      to: ev.to,
      source: "Appraisal grid",
    });
  });

  log.sort((a, b) => b.date.localeCompare(a.date));

  const seen = new Set();
  return log.filter((x) => {
    const k = x.empId + "|" + x.manager;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
