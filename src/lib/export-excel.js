import { COLUMNS, formatValue } from "./appraisal-data";

export function exportToExcel(
    rows,
    filename = "appraisal-fy2025-26.csv"
) {
    // COLUMNS is already in the exact on-screen order.
    const headers = COLUMNS.map((c) => c.label);

    const escape = (v) =>
        `"${String(v ?? "").replace(/"/g, '""')}"`;

    const valueForColumn = (row, col) => {
        if (col.computed && col.fn) {
            return formatValue(row, col);
        }

        return row[col.key] ?? "";
    };

    const lines = [
        headers.map(escape).join(","),
        ...rows.map((r) =>
            COLUMNS
                .map((c) =>
                    escape(valueForColumn(r, c))
                )
                .join(",")
        ),
    ];

    const blob = new Blob(
        ["\uFEFF" + lines.join("\n")],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}
