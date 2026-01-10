const escapeHtml = (value) => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const renderParagraphs = (text) => {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) return "";
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
};

const renderEditable = (value, missing) => {
  if (!missing) return escapeHtml(value);
  return `<span class="editable" contenteditable="true">Click to edit</span>`;
};

const renderSegments = (segments = []) => {
  if (!segments.length) return "";
  return segments
    .map((seg) => {
      if (seg.highlight && seg.missing) {
        return `<span class="editable" contenteditable="true">Click to edit</span>`;
      }
      return escapeHtml(seg.text || "");
    })
    .join("");
};

const renderMeta = (fields = []) => {
  const rows = fields
    .map(
      (field) =>
        `<tr><td class="meta-label">${escapeHtml(field.label)}</td><td class="meta-value">${renderEditable(
          field.value,
          field.missing
        )}</td></tr>`
    )
    .join("");
  return `<table class="meta-table">${rows}</table>`;
};

const renderTable = (columns = [], rows = []) => {
  const head = `<tr>${columns
    .map((col) => `<th>${escapeHtml(col.label)}</th>`)
    .join("")}</tr>`;
  const body = rows
    .map((row) => {
      const cells = (row.cells || [])
        .map((cell) => `<td>${renderEditable(cell.value, cell.missing)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table class="data-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
};

const renderBullets = (items = []) => {
  const content = items.map((item) => `<li>${renderEditable(item.value, item.missing)}</li>`).join("");
  return `<ul>${content}</ul>`;
};

const renderObservations = (items = []) => {
  const head = `
    <tr>
      <th>#</th>
      <th>Severity</th>
      <th>Reference</th>
      <th>Description</th>
      <th>Evidence</th>
      <th>Recommendation/CAPA</th>
    </tr>`;
  const body = items
    .map(
      (obs) => `
      <tr>
        <td>${renderEditable(obs.no, !obs.no)}</td>
        <td>${renderEditable(obs.severity, !obs.severity)}</td>
        <td>${renderEditable(obs.reference, !obs.reference)}</td>
        <td>${renderEditable(obs.description, !obs.description)}</td>
        <td>${renderEditable(obs.evidence, !obs.evidence)}</td>
        <td>${renderEditable(obs.recommendation || obs.capaDueDate || "", !(obs.recommendation || obs.capaDueDate))}</td>
      </tr>`
    )
    .join("");
  return `<table class="data-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
};

export const renderReportHtml = (reportInstance) => {
  const blocks = reportInstance?.renderedBlocks || [];
  const content = blocks
    .map((block) => {
      if (block.type === "pageBreak") {
        return `<div class="page-break"></div>`;
      }
      if (block.type === "title") {
        if (block.segments?.length) {
          return `<section class="block title"><h1>${renderSegments(block.segments)}</h1></section>`;
        }
        return `<section class="block title"><h1>${escapeHtml(block.content || "")}</h1></section>`;
      }
      if (block.type === "richText") {
        if (block.segments?.length) {
          return `<section class="block"><h2>${escapeHtml(block.heading || "")}</h2><p>${renderSegments(
            block.segments
          )}</p></section>`;
        }
        return `<section class="block"><h2>${escapeHtml(block.heading || "")}</h2>${renderParagraphs(
          block.content || ""
        )}</section>`;
      }
      if (block.type === "meta") {
        return `<section class="block"><h2>${escapeHtml(block.heading || "")}</h2>${renderMeta(block.fields || [])}</section>`;
      }
      if (block.type === "table") {
        return `<section class="block"><h2>${escapeHtml(block.heading || "")}</h2>${renderTable(
          block.columns || [],
          block.rows || []
        )}</section>`;
      }
      if (block.type === "bullets") {
        return `<section class="block"><h2>${escapeHtml(block.heading || "")}</h2>${renderBullets(
          block.items || []
        )}</section>`;
      }
      if (block.type === "observations") {
        return `<section class="block"><h2>${escapeHtml(block.heading || "Observations")}</h2>${renderObservations(
          block.observations || []
        )}</section>`;
      }
      if (block.type === "signoff") {
        if (block.segments?.length) {
          return `<section class="block"><h2>${escapeHtml(block.heading || "")}</h2><p>${renderSegments(
            block.segments
          )}</p></section>`;
        }
        return `<section class="block"><h2>${escapeHtml(block.heading || "")}</h2>${renderParagraphs(
          block.content || ""
        )}</section>`;
      }
      return `<section class="block">${renderParagraphs(block.content || "")}</section>`;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Audit Report</title>
        <style>
          body { font-family: "Times New Roman", serif; color: #222; margin: 0; padding: 0; }
          .report { padding: 32px 36px; }
          h1 { font-size: 26px; text-align: center; margin: 0 0 18px; }
          h2 { font-size: 15px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
          p { margin: 0 0 8px; line-height: 1.45; font-size: 12.5px; }
          .block { margin-bottom: 12px; }
          .meta-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .meta-table td { padding: 4px 8px; border-bottom: 1px solid #e0e0e0; }
          .meta-label { color: #666; width: 35%; }
          .data-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
          .data-table th, .data-table td { border: 1px solid #d6d6d6; padding: 6px 8px; vertical-align: top; }
          .data-table th { background: #f5f5f5; text-align: left; }
          ul { padding-left: 18px; margin: 0; }
          li { margin-bottom: 6px; font-size: 12.5px; }
          .page-break { page-break-after: always; }
          .editable { background: #f2e6ff; padding: 2px 4px; border-radius: 3px; outline: 1px dashed #b28edc; display: inline-block; min-width: 120px; }
        </style>
      </head>
      <body>
        <div class="report">${content}</div>
      </body>
    </html>
  `;
};
