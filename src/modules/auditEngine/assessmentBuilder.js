import { MODULE_PACKS } from "./modulePacks.js";
import { AUDIT_PHASE_ORDER } from "./constants.js";

const addDays = (baseDate, days) => {
  if (!baseDate) return null;
  if (!days) return baseDate;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d;
};

const sortByOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

const mergePhaseTemplates = (templates) => {
  const map = new Map();
  templates.forEach((tpl) => {
    (tpl?.phases || []).forEach((phase) => {
      const existing = map.get(phase.key) || {
        key: phase.key,
        name: phase.name,
        order: phase.order ?? 0,
        milestones: [],
      };
      const nextMilestones = (phase.milestones || []).map((m) => ({
        ...m,
        module: tpl.module,
      }));
      existing.milestones.push(...nextMilestones);
      map.set(phase.key, existing);
    });
  });
  const phases = Array.from(map.values());
  phases.sort(sortByOrder);
  phases.forEach((p) => p.milestones.sort(sortByOrder));
  return phases;
};

const normalizeTemplates = (modules, templates = []) => {
  const templateMap = new Map(templates.map((t) => [t.module, t]));
  return modules.map((module) => {
    const fromDb = templateMap.get(module);
    if (fromDb) return fromDb;
    const pack = MODULE_PACKS[module];
    return pack ? { module, phases: pack.phases } : { module, phases: [] };
  });
};

export const buildAssessmentPhases = ({ modules, templates, baseDate }) => {
  const resolvedTemplates = normalizeTemplates(modules, templates);
  const merged = mergePhaseTemplates(resolvedTemplates);

  let cursor = baseDate ? new Date(baseDate) : new Date();
  const phases = merged.map((phase) => {
    const milestones = (phase.milestones || []).map((m) => {
      cursor = addDays(cursor, m.defaultDueInDays || 1);
      return {
        key: m.key,
        name: m.name,
        module: m.module,
        status: "NOT_STARTED",
        ownerRole: m.defaultOwnerRole,
        dueDate: cursor,
        dependencies: m.dependencies || [],
        order: m.order ?? 0,
      };
    });
    return {
      key: phase.key,
      name: phase.name,
      order: phase.order ?? 0,
      status: "NOT_STARTED",
      milestones,
    };
  });

  phases.sort((a, b) => {
    const orderA = a.order ?? AUDIT_PHASE_ORDER.indexOf(a.key);
    const orderB = b.order ?? AUDIT_PHASE_ORDER.indexOf(b.key);
    return orderA - orderB;
  });
  return phases;
};
