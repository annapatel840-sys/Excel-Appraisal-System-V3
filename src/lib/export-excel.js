import { COLUMNS } from "./appraisal-data";

/* ============================================================
   EXCEL FORMULA HELPERS
   ============================================================ */

// Column letter for a 0-based index: 0 -> A, 25 -> Z, 26 -> AA.
const columnLetter = (index) => {
  let letter = "";
  let n = index + 1;

  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }

  return letter;
};

// Derived from COLUMNS order so formulas stay correct if columns move.
const EXCEL_COLUMN_BY_KEY = Object.fromEntries(
  COLUMNS.map((column, index) => [column.key, columnLetter(index)]),
);

/* ============================================================
   GET EXCEL COLUMN
   ============================================================ */

const excelColumn = (key) => EXCEL_COLUMN_BY_KEY[key] ?? null;

/* ============================================================
   FORMULA BUILDER
   ============================================================ */

const formulaFor = (rowNumber, col) => {
  const cell = (key) => {
    const column = excelColumn(key);

    if (!column) {
      return "0";
    }

    return `${column}${rowNumber}`;
  };

  switch (col.key) {
    /* ========================================================
       TOTAL PB
       allocatedPBAmount + newPBToBeOffered
       ======================================================== */

    case "totalOfPB":
      return `=${cell("allocatedPBAmount")}+${cell("newPBToBeOffered")}`;

    /* ========================================================
       TOTAL BONUS
       totalOfPB + newRB
       ======================================================== */

    case "totalBonus":
      return `=${cell("totalOfPB")}+${cell("newRB")}`;

    /* ========================================================
       NEW BASE SALARY
       currentAnnualBasePay + hikeAmount
       ======================================================== */

    case "newBaseSalary":
      return `=${cell("currentAnnualBasePay")}+${cell("hikeAmount")}`;

    /* ========================================================
       TOTAL CTC WITH REWARDS
       newBaseSalary + totalBonus
       ======================================================== */

    case "totalCTCWithRewards":
      return `=${cell("newBaseSalary")}+${cell("totalBonus")}`;

    /* ========================================================
       TOTAL BONUS HIKE AMOUNT
       totalBonus - rbToBePaid - pbToBePaid
       ======================================================== */

    case "totalBonusHikeAmount":
      return `=${cell("totalBonus")}-${cell(
        "rbToBePaid",
      )}-${cell("pbToBePaid")}`;

    /* ========================================================
       TOTAL BONUS HIKE %
       totalBonusHikeAmount /
       (rbToBePaid + pbToBePaid) * 100
       ======================================================== */

    case "totalBonusHikePct":
      return `=IFERROR(${cell(
        "totalBonusHikeAmount",
      )}/(${cell("rbToBePaid")}+${cell("pbToBePaid")})*100,0)`;

    /* ========================================================
       TOTAL REWARDS HIKE AMOUNT
       hikeAmount + totalBonusHikeAmount
       ======================================================== */

    case "totalRewardsHikeAmount":
      return `=${cell("hikeAmount")}+${cell("totalBonusHikeAmount")}`;

    /* ========================================================
       TOTAL REWARDS HIKE %
       totalRewardsHikeAmount /
       currentAnnualBasePay * 100
       ======================================================== */

    case "totalRewardsHikePct":
      return `=IFERROR(${cell(
        "totalRewardsHikeAmount",
      )}/${cell("currentAnnualBasePay")}*100,0)`;

    default:
      return null;
  }
};

/* ============================================================
   RAW VALUE FOR EXCEL
   ============================================================ */

const rawValueForColumn = (row, col) => {
  const value = row[col.key];

  if (value === null || value === undefined) {
    return "";
  }

  /*
   * Keep numeric fields as numbers.
   * Do NOT export display strings such as:
   *
   * ₹500000
   * 12.5%
   *
   * Excel formulas need actual numeric values.
   */

  if (
    col.type === "currency" ||
    col.type === "number" ||
    col.type === "decimal" ||
    col.type === "percent"
  ) {
    if (value === "") {
      return "";
    }

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : "";
  }

  return value;
};

/* ============================================================
   COLOUR CODING
   Calculated (formula) cells and editable input cells get their
   own fill so it is clear what to fill in and what is automatic.
   ============================================================ */

const COLORS = {
  headerFill: "FF173B63",
  headerFont: "FFFFFFFF",
  calculatedHeaderFill: "FF2F5597",
  editableHeaderFill: "FFBF8F00",
  calculatedFill: "FFDDEBF7",
  calculatedFont: "FF1F3864",
  editableFill: "FFFFF2CC",
  border: "FFD9DEE7",
};

const solidFill = (argb) => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

const thinBorder = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

// Values are stored as numbers (7.5 means 7.5%), not Excel fractions.
const NUMBER_FORMATS = {
  currency: '"₹"#,##0',
  percent: '0.00"%"',
  decimal: "0.00",
  number: "0",
};

const columnKind = (column) => {
  if (column.computed) return "calculated";
  if (column.editable) return "editable";
  return "readonly";
};

/* ============================================================
   EXPORT TO EXCEL
   ============================================================ */

// options.isHidden(key): columns the user may not see are left out of the
// file. Formulas use fixed column letters, so when any column is left out the
// calculated columns are written as values instead.
export async function exportToExcel(
  rows,
  filename = "appraisal-fy2025-26.xlsx",
  { isHidden } = {},
) {
  const exportColumns =
    typeof isHidden === "function"
      ? COLUMNS.filter((column) => !isHidden(column.key))
      : COLUMNS;
  const useFormulas = exportColumns.length === COLUMNS.length;
  // Loaded on demand so the export library does not slow page load.
  const { default: ExcelJS } = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Appraisal", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });

  worksheet.columns = exportColumns.map((column) => {
    const labelLength = String(column.label ?? "").length;

    return {
      key: column.key,
      width: Math.max(12, Math.min(28, labelLength + 3)),
    };
  });

  /* ==========================================================
     HEADER
     Labels stay identical to the grid so the file re-imports.
     ========================================================== */

  const headerRow = worksheet.addRow(exportColumns.map((column) => column.label));

  headerRow.height = 32;

  headerRow.eachCell((cell, columnNumber) => {
    const kind = columnKind(exportColumns[columnNumber - 1]);

    cell.fill = solidFill(
      kind === "calculated"
        ? COLORS.calculatedHeaderFill
        : kind === "editable"
          ? COLORS.editableHeaderFill
          : COLORS.headerFill,
    );
    cell.font = { bold: true, color: { argb: COLORS.headerFont } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thinBorder;

    if (kind === "calculated") {
      cell.note = "Calculated by formula";
    } else if (kind === "editable") {
      cell.note = "Editable input";
    }
  });

  /* ==========================================================
     ROWS
     Row 1 is the header, so data starts at Excel row 2.
     ========================================================== */

  rows.forEach((row, index) => {
    const excelRowNumber = index + 2;

    const values = exportColumns.map((column) => {
      const formula = column.computed && useFormulas
        ? formulaFor(excelRowNumber, column)
        : null;

      if (column.computed && !useFormulas) {
        const result = column.fn ? Number(column.fn(row)) : undefined;

        return Number.isFinite(result) ? result : null;
      }

      if (formula) {
        // Cached result keeps values visible in viewers that do not
        // recalculate (previews, mobile); Excel recalculates anyway.
        const result = column.fn ? Number(column.fn(row)) : undefined;

        return {
          formula: formula.substring(1),
          result: Number.isFinite(result) ? result : undefined,
        };
      }

      const value = rawValueForColumn(row, column);

      return value === "" ? null : value;
    });

    const excelRow = worksheet.addRow(values);

    excelRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const column = exportColumns[columnNumber - 1];

      if (!column) {
        return;
      }

      const kind = columnKind(column);

      if (kind === "calculated") {
        cell.fill = solidFill(COLORS.calculatedFill);
        cell.font = { italic: true, color: { argb: COLORS.calculatedFont } };
      } else if (kind === "editable") {
        cell.fill = solidFill(COLORS.editableFill);
      }

      if (NUMBER_FORMATS[column.type]) {
        cell.numFmt = NUMBER_FORMATS[column.type];
      }

      cell.border = thinBorder;
    });
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: exportColumns.length },
  };

  /* ==========================================================
     LEGEND
     ========================================================== */

  const legend = workbook.addWorksheet("Legend");

  legend.columns = [{ width: 18 }, { width: 60 }];

  legend.addRow(["Colour", "Meaning"]).eachCell((cell) => {
    cell.font = { bold: true };
  });

  [
    [
      COLORS.calculatedFill,
      "Calculated — Excel formula; updates when its inputs change. Do not type over it.",
    ],
    [COLORS.editableFill, "Editable input — values managers fill in."],
    [null, "No colour — reference data from the employee record."],
  ].forEach(([argb, meaning]) => {
    const legendRow = legend.addRow(["", meaning]);

    if (argb) {
      legendRow.getCell(1).fill = solidFill(argb);
    }

    legendRow.getCell(1).border = thinBorder;
  });

  /* ==========================================================
     DOWNLOAD XLSX
     ========================================================== */

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke after the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
