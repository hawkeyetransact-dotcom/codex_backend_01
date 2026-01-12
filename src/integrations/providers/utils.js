const getPathSegments = (path) => String(path || "").split(".").filter(Boolean);

export const getValueByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  return getPathSegments(path).reduce((acc, key) => {
    if (acc && typeof acc === "object" && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, obj);
};

export const applyTransforms = (canonical, transforms = []) => {
  if (!Array.isArray(transforms)) return canonical;
  transforms.forEach((transform) => {
    if (!transform || !transform.field) return;
    const field = transform.field;
    const value = canonical[field];
    switch (transform.type) {
      case "trim":
        canonical[field] = typeof value === "string" ? value.trim() : value;
        break;
      case "uppercase":
        canonical[field] = typeof value === "string" ? value.toUpperCase() : value;
        break;
      case "lowercase":
        canonical[field] = typeof value === "string" ? value.toLowerCase() : value;
        break;
      case "number":
        canonical[field] = value === null || value === undefined ? value : Number(value);
        break;
      case "boolean":
        canonical[field] = value === "true" || value === true || value === 1;
        break;
      case "enumMap":
        if (transform.map && value !== undefined) {
          canonical[field] = transform.map[value] ?? value;
        }
        break;
      case "date":
        canonical[field] = value ? new Date(value) : value;
        break;
      default:
        break;
    }
  });
  return canonical;
};

const normalizeDateField = (value) => {
  if (!value) return value;
  if (value instanceof Date) return value;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? value : dt;
};

export const normalizeWithMapping = (rawEvent, mappingConfig) => {
  const payload = rawEvent?.payload ?? rawEvent?.data ?? rawEvent ?? {};
  const mapping = mappingConfig?.sourceToCanonicalMap || {};
  const canonical = {};

  Object.entries(mapping).forEach(([sourceField, canonicalField]) => {
    const value = getValueByPath(payload, sourceField);
    if (value !== undefined && canonicalField) {
      canonical[canonicalField] = value;
    }
  });

  if (!canonical.eventId) canonical.eventId = payload.eventId || payload.id || rawEvent?.sourceEventId;
  if (!canonical.status) canonical.status = payload.status;
  if (!canonical.severity) canonical.severity = payload.severity;
  if (!canonical.openedDate) canonical.openedDate = payload.openedDate || payload.opened_date;
  if (!canonical.dueDate) canonical.dueDate = payload.dueDate || payload.due_date;
  if (!canonical.closedDate) canonical.closedDate = payload.closedDate || payload.closed_date;

  applyTransforms(canonical, mappingConfig?.transforms);

  canonical.openedDate = normalizeDateField(canonical.openedDate);
  canonical.dueDate = normalizeDateField(canonical.dueDate);
  canonical.closedDate = normalizeDateField(canonical.closedDate);

  if (Array.isArray(mappingConfig?.fieldMasking)) {
    mappingConfig.fieldMasking.forEach((field) => {
      delete canonical[field];
    });
  }

  return { canonical, payload };
};
