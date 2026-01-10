import moment from "moment";

const PLACEHOLDER_REGEX = /{{\s*([^}]+)\s*}}/g;

const formatDate = (value) => {
  if (!value) return "";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return moment(dt).format("LL");
};

const formatValue = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return formatDate(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    if (value.name) return String(value.name);
    if (value.label) return String(value.label);
    return JSON.stringify(value);
  }
  return String(value);
};

const isMissing = (value) => {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const resolvePath = (data, rawPath) => {
  if (!rawPath) return undefined;
  const path = String(rawPath).replace(/\[\]$/, "");
  const parts = path.split(".").filter(Boolean);
  let current = data;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
};

const resolveArrayPath = (data, rawPath) => {
  const value = resolvePath(data, rawPath);
  return Array.isArray(value) ? value : [];
};

const mergeStringWithHighlights = (template = "", data, blockId) => {
  let lastIndex = 0;
  const segments = [];
  const highlights = [];

  const content = String(template);
  for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ text: content.slice(lastIndex, start), highlight: false });
    }
    const placeholder = (match[1] || "").trim();
    const value = resolvePath(data, placeholder);
    const missing = isMissing(value);
    const resolved = missing ? "_____" : formatValue(value);
    segments.push({
      text: resolved,
      highlight: true,
      missing,
      placeholder,
    });
    highlights.push({ blockId, placeholder, value: resolved, missing });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), highlight: false });
  }

  return {
    text: segments.map((s) => s.text).join(""),
    segments,
    highlights,
  };
};

export const mergeReportTemplate = (template, data) => {
  const renderedBlocks = [];
  const highlights = [];

  (template?.blocks || []).forEach((block) => {
    const base = {
      id: block.id,
      type: block.type,
      heading: block.heading || "",
      modified: false,
    };

    if (block.type === "title" || block.type === "richText" || block.type === "signoff") {
      const { text, segments, highlights: blockHighlights } = mergeStringWithHighlights(
        block.content || block.heading || "",
        data,
        block.id
      );
      renderedBlocks.push({
        ...base,
        content: text,
        originalContent: block.content || "",
        segments,
      });
      highlights.push(...blockHighlights);
      return;
    }

    if (block.type === "meta") {
      const fields = (block.fields || []).map((field) => {
        const value = resolvePath(data, field.placeholderPath);
        const missing = isMissing(value);
        const resolved = missing ? "_____" : formatValue(value);
        highlights.push({
          blockId: block.id,
          placeholder: field.placeholderPath,
          value: resolved,
          missing,
        });
        return {
          label: field.label,
          placeholderPath: field.placeholderPath,
          value: resolved,
          missing,
        };
      });
      renderedBlocks.push({ ...base, fields });
      return;
    }

    if (block.type === "table") {
      const rows = resolveArrayPath(data, block.rowsPath || block.listPlaceholderPath);
      const mappedRows = rows.map((row) => ({
        cells: (block.columns || []).map((col) => {
          const value = resolvePath(row, col.placeholderPath);
          const missing = isMissing(value);
          const resolved = missing ? "_____" : formatValue(value);
          highlights.push({
            blockId: block.id,
            placeholder: col.placeholderPath,
            value: resolved,
            missing,
          });
          return {
            label: col.label,
            placeholderPath: col.placeholderPath,
            value: resolved,
            missing,
          };
        }),
      }));
      renderedBlocks.push({ ...base, rows: mappedRows, columns: block.columns || [] });
      return;
    }

    if (block.type === "bullets") {
      const items = resolveArrayPath(data, block.listPlaceholderPath);
      const mappedItems = items.length
        ? items.map((item) => ({
            value: formatValue(item),
            missing: isMissing(item),
          }))
        : [{ value: "_____", missing: true }];
      mappedItems.forEach((item) => {
        highlights.push({
          blockId: block.id,
          placeholder: block.listPlaceholderPath || "list",
          value: item.value,
          missing: item.missing,
        });
      });
      renderedBlocks.push({ ...base, items: mappedItems });
      return;
    }

    if (block.type === "observations") {
      const mapping = block.observationMapping || {};
      const listPath = mapping.listPath || block.listPlaceholderPath || "observations";
      const rows = resolveArrayPath(data, listPath);
      const fields = mapping.fields || {};
      const mappedRows = rows.map((row, index) => {
        const resolveField = (path, fallback) => {
          if (!path) return fallback;
          const val = resolvePath(row, path);
          return val === undefined ? fallback : val;
        };
        const obs = {
          no: resolveField(fields.no, row.no ?? index + 1),
          severity: resolveField(fields.severity, row.severity),
          reference: resolveField(fields.reference, row.reference),
          description: resolveField(fields.description, row.description),
          evidence: resolveField(fields.evidence, row.evidence),
          recommendation: resolveField(fields.recommendation, row.recommendation),
          capaDueDate: resolveField(fields.capaDueDate, row.capaDueDate),
        };
        Object.entries(obs).forEach(([key, value]) => {
          const missing = isMissing(value);
          const resolved = missing ? "_____" : formatValue(value);
          highlights.push({
            blockId: block.id,
            placeholder: `${listPath}.${key}`,
            value: resolved,
            missing,
          });
        });
        return {
          ...obs,
        };
      });
      renderedBlocks.push({ ...base, observations: mappedRows });
      return;
    }

    if (block.type === "pageBreak") {
      renderedBlocks.push({ ...base });
      return;
    }

    renderedBlocks.push({ ...base });
  });

  return { renderedBlocks, highlights };
};

export const __testUtils = {
  resolvePath,
  resolveArrayPath,
  formatValue,
  isMissing,
  mergeStringWithHighlights,
};
