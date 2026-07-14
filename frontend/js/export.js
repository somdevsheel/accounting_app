/* Generic "export whatever table is on screen" — works for every report/register
   without each screen needing its own export code. Reads the rendered DOM table(s)
   directly, so it always matches what's visible. No dependencies: CSV is plain
   text, and the "Excel" format is the standard HTML-table-as-.xls trick that
   Excel, Numbers, and LibreOffice all open natively. */

const Export = (() => {
  function cellText(cell) {
    return cell.textContent.replace(/\s+/g, " ").trim();
  }

  function findSections(root) {
    const tables = root.querySelectorAll("table");
    const sections = [];
    tables.forEach((table) => {
      if (table.closest("#modal-root")) return; // never export a background modal's table
      let title = "";
      let prev = table.closest(".card") ? table.closest(".card").querySelector("h3") : table.previousElementSibling;
      if (prev && /^H[1-4]$/.test(prev.tagName)) title = prev.textContent.trim();
      const rows = [];
      table.querySelectorAll("thead tr").forEach((tr) => rows.push(Array.from(tr.children).map(cellText)));
      table.querySelectorAll("tbody tr").forEach((tr) => rows.push(Array.from(tr.children).map(cellText)));
      table.querySelectorAll("tfoot tr").forEach((tr) => rows.push(Array.from(tr.children).map(cellText)));
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
