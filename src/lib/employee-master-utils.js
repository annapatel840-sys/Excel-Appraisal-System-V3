import { FIELD_DEFS, parseDateValue } from "./employee-master-data";

/* ============================================================
   DATE / EXPERIENCE
============================================================ */

export function calcOrgExperience(dojStr, refDate) {
  if (!dojStr) return "";

  const doj = parseDateValue(dojStr);

  if (!doj) {
    return "";
  }

  const ref = refDate || new Date();

  if (doj > ref) {
    return "0 yrs 0 mo";
  }

  let months =
    (ref.getFullYear() - doj.getFullYear()) * 12 +
    (ref.getMonth() - doj.getMonth());

  if (ref.getDate() < doj.getDate()) {
    months--;
  }

  months = Math.max(0, months);

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  return `${years} yrs ${remainingMonths} mo`;
}

export function fmtDoj(dojStr) {
  if (!dojStr) return "";

  const date = parseDateValue(dojStr);

  if (!date) {
    return dojStr;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ============================================================
   CSV PARSER
============================================================ */

export function parseCsv(text) {
  if (!text) return [];

  /*
   * Remove UTF-8 BOM if present.
   *
   * Excel-generated CSV files can start with:
   * \uFEFFEmployee ID
   *
   * Without removing it, the first header can become:
   * "\uFEFFEmployee ID"
   */
  const cleanText = String(text).replace(/^\uFEFF/, "");

  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const next = cleanText[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(cell.trim());
      cell = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());

    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

/* ============================================================
   CSV ROWS -> OBJECTS
============================================================ */

export function csvRowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) =>
    String(header ?? "")
      .replace(/^\uFEFF/, "")
      .trim(),
  );

  return rows
    .slice(1)
    .map((row) => {
      const obj = {};

      headers.forEach((header, index) => {
        if (!header) return;

        obj[header] = String(row[index] ?? "").trim();
      });

      return obj;
    })
    .filter((obj) =>
      Object.values(obj).some((value) => String(value).trim() !== ""),
    );
}

/* ============================================================
   HEADER NORMALIZATION
============================================================ */

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
}

/* ============================================================
   FIND FIELD FOR UPLOAD HEADER
============================================================ */

export function findFieldForHeader(header) {
  const normalized = normalizeHeader(header);

  if (!normalized) {
    return null;
  }

  /*
   * First use FIELD_DEFS.
   *
   * This keeps all existing field mappings working.
   */
  for (const field of FIELD_DEFS) {
    const candidates = [field.label, field.key, ...(field.uploadHeaders || [])];

    for (const candidate of candidates) {
      if (normalizeHeader(candidate) === normalized) {
        return field;
      }
    }
  }

  /*
   * Extra aliases for common Employee Master files.
   *
   * These do NOT change existing fields.
   */
  const aliases = {
    empid: "empId",
    employeeid: "empId",

    employeename: "name",

    department: "organization",
    orgtn: "organization",

    dateofjoining: "doj",

    totalexperience: "totalExp",
    totalexperienceason1stjan: "totalExp",

    reportingmanager: "reportingManager",

    compmanager: "compManager",

    supermanager: "superManager",
    supermanagernamename: "superManager",

    appraiser: "appraiser",
    appraisersupermanager: "appraiser",

    manageremail: "managerMail",
    manageremailid: "managerMail",
    managermail: "managerMail",

    supermanageremail: "superManagerMail",
    supermanageremailid: "superManagerMail",
    supermanagermail: "superManagerMail",

    employeestatus: "status",
    activestatus: "status",
    activeinactive: "status",
  };

  const aliasKey = aliases[normalized];

  if (aliasKey) {
    /*
     * Return the actual FIELD_DEFS field object.
     */
    const field = FIELD_DEFS.find((item) => item.key === aliasKey);

    if (field) {
      return field;
    }
  }

  return null;
}

/* ============================================================
   ELIGIBILITY VALUE NORMALIZATION
============================================================ */

export function normalizeEligibleValue(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (["yes", "eligible", "y", "true", "1", "active"].includes(normalized)) {
    return "Yes";
  }

  if (
    [
      "no",
      "not eligible",
      "noteligible",
      "n",
      "false",
      "0",
      "inactive",
      "not-eligible",
    ].includes(normalized)
  ) {
    return "No";
  }

  return "";
}

/* ============================================================
   TEXT SEARCH
============================================================ */

export function matchesSearch(employee, search) {
  const term = String(search || "")
    .trim()
    .toLowerCase();

  if (!term) {
    return true;
  }

  return [employee?.name, employee?.empId, employee?.organization].some(
    (value) =>
      String(value || "")
        .toLowerCase()
        .includes(term),
  );
}

/* ============================================================
   SAFE VALUE
============================================================ */

export function safeValue(value) {
  return value == null ? "" : String(value);
}
