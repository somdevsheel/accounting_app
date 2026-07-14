/* Generic "export whatever table is on screen" — works for every report/register
   without each screen needing its own export code. Reads the rendered DOM table(s)
   directly, so it always matches what's visible. No dependencies: CSV is plain
   text, and the "Excel" format is the standard HTML-table-as-.xls trick that
   Excel, Numbers, and LibreOffice all open natively. */

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

  function toXlsHtml(sections, docTitle) {
    const tables = sections.map((section) => {
      const rowsHtml = section.rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      const titleHtml = section.title ? `<tr><td style="font-weight:bold;">${escapeHtml(section.title)}</td></tr>` : "";
      return `<table border="1">${titleHtml}${rowsHtml}</table><br/>`;
    }).join("");
    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<html xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${escapeHtml(docTitle)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body>${tables}</body></html>`;
  }

  function download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
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
      download(`${slug}-${datePart}.xls`, toXlsHtml(sections, title), "application/vnd.ms-excel;charset=utf-8;");
    }
    toast(`Exported ${title} as ${format.toUpperCase()}`);
  }

  return { run };
})();
