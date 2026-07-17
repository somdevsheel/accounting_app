/* Generic "export whatever table is on screen" — works for every report/register
   without each screen needing its own export code. Reads the rendered DOM table(s)
   directly, so it always matches what's visible. No dependencies: CSV is plain
   text, and "Excel" is genuine SpreadsheetML XML (Microsoft's native Excel XML
   schema, supported since Excel 2003) — not an HTML table wearing a .xls
   extension, which modern Excel increasingly refuses to open or buries behind
   a scary format-mismatch warning. */

const Export = (() => {
  function cellText(cell) {
    return cell.textContent.replace(/\s+/g, " ").trim();
  }

  function nearestPrecedingHeading(table) {
    // Walk up from the table's wrapper, checking each level's preceding siblings
    // (and anything nested in them) for the closest heading above the table —
    // not just "any h3 in the same card", which breaks when a card holds more
    // than one table (e.g. Balance Sheet: Liabilities and Capital share a card).
    let node = table.closest(".table-wrap") || table;
    while (node && node.id !== "view-content") {
      let sib = node.previousElementSibling;
      while (sib) {
        if (/^H[1-4]$/.test(sib.tagName)) return sib.textContent.trim();
        const heading = sib.querySelector && sib.querySelector("h1,h2,h3,h4");
        if (heading) return heading.textContent.trim();
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  function findSections(root) {
    const tables = root.querySelectorAll("table");
    const sections = [];
    tables.forEach((table) => {
      if (table.closest("#modal-root")) return; // never export a background modal's table

      // Columns with a blank header are this app's consistent convention for an
      // "actions" column (Edit/Delete buttons) — drop those from the export so
      // button labels don't show up as data. Only applied to rows whose cell
      // count matches the header exactly, so a colspan'd "Total" footer row
      // (fewer cells than the header) is left untouched rather than misaligned.
      const headerCells = Array.from(table.querySelectorAll("thead tr")[0] ? table.querySelectorAll("thead tr")[0].children : []);
      const skipIndices = new Set(headerCells.map((c, i) => (cellText(c) === "" ? i : -1)).filter((i) => i >= 0));
      const toRow = (tr) => {
        const cells = Array.from(tr.children);
        const filtered = cells.length === headerCells.length ? cells.filter((_, i) => !skipIndices.has(i)) : cells;
        return filtered.map(cellText);
      };

      const title = nearestPrecedingHeading(table);
      const rows = [];
      table.querySelectorAll("thead tr").forEach((tr) => rows.push(toRow(tr)));
      table.querySelectorAll("tbody tr").forEach((tr) => rows.push(toRow(tr)));
      table.querySelectorAll("tfoot tr").forEach((tr) => rows.push(toRow(tr)));
      if (rows.length > 0) sections.push({ title, rows });
    });
    return sections;
  }

  function csvEscape(value) {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }

  function toCsv(sections) {
    const lines = [];
    sections.forEach((section, i) => {
      if (i > 0) lines.push("");
      if (section.title) lines.push(csvEscape(section.title));
      section.rows.forEach((row) => lines.push(row.map(csvEscape).join(",")));
    });
    return lines.join("\r\n");
  }

  function xmlEscape(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toSpreadsheetXml(sections, docTitle) {
    // A worksheet name has to be <=31 chars and can't contain : \ / ? * [ ]
    const sheetName = (docTitle || "Export").replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Export";
    const rowsXml = sections.map((section, i) => {
      const parts = [];
      if (i > 0) parts.push("<Row/>"); // blank spacer row between sections
      if (section.title) {
        parts.push(`<Row><Cell ss:StyleID="sTitle"><Data ss:Type="String">${xmlEscape(section.title)}</Data></Cell></Row>`);
      }
      section.rows.forEach((row) => {
        const cells = row.map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`).join("");
        parts.push(`<Row>${cells}</Row>`);
      });
      return parts.join("");
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="sTitle"><Font ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(sheetName)}">
  <Table>${rowsXml}</Table>
 </Worksheet>
</Workbook>`;
  }

  function download(filename, content, mimeType) {
    // Both Excel's SpreadsheetML parser and its CSV importer default to the
    // system's local codepage instead of UTF-8 when a file has no byte-order
    // mark — the XML's own <?xml ... encoding="UTF-8"?> declaration isn't
    // enough on its own. Without this, any non-ASCII character (currency
    // symbols, non-Latin narrations) comes out as mojibake (e.g. "₹" ->
    // "â‚¹"). Blob doesn't add one for a plain string, so it has to be
    // prepended explicitly.
    const blob = new Blob(["﻿", content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function run(format) {
    const root = document.getElementById("view-content");
    const sections = findSections(root);
    if (sections.length === 0) {
      toast("Nothing on this screen to export yet", true);
      return;
    }
    const title = (document.getElementById("view-title").textContent || "Export").trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const datePart = todayStr();
    if (format === "csv") {
      download(`${slug}-${datePart}.csv`, toCsv(sections), "text/csv;charset=utf-8;");
    } else {
      download(`${slug}-${datePart}.xls`, toSpreadsheetXml(sections, title), "application/vnd.ms-excel;charset=utf-8;");
    }
    toast(`Exported ${title} as ${format.toUpperCase()}`);
  }

  return { run };
})();
