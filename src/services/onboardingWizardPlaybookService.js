const normalizeRole = (value = "") => {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";
  const compact = raw.replace(/[\s_-]/g, "");
  if (compact === "supplieruser") return "supplieruser";
  if (compact === "tenantadmin") return "tenant_admin";
  if (compact === "superadmin") return "superadmin";
  return raw;
};

const PLAYBOOKS = {
  buyer: {
    key: "buyer-default",
    version: "v1",
    title: "Buyer Quick Start",
    subtitle: "Create and manage audits faster with this checklist.",
    steps: [
      {
        id: "buyer-create-request",
        title: "Create audit request",
        description: "Open Request New Audit and create your first audit request.",
        route: "/request-audit",
        optional: false,
      },
      {
        id: "buyer-marketplace-request",
        title: "Create via marketplace",
        description: "Use Supplier Marketplace action flow for site/product specific request creation.",
        route: "/supplier-marketplace",
        optional: false,
      },
      {
        id: "buyer-track-progress",
        title: "Track milestones",
        description: "Track progress and phase updates from Audit Summary and milestones.",
        route: "/audits",
        optional: false,
      },
      {
        id: "buyer-notifications",
        title: "Review notifications",
        description: "Open notifications to catch required approvals and pending tasks.",
        route: "/workspace/notifications",
        optional: true,
      },
    ],
  },
  supplier: {
    key: "supplier-default",
    version: "v1",
    title: "Supplier Quick Start",
    subtitle: "Complete profile and evidence readiness in a few steps.",
    steps: [
      {
        id: "supplier-complete-profile",
        title: "Complete onboarding profile",
        description: "Update profile details so buyer and auditor can review your setup.",
        route: "/onboard",
        optional: false,
      },
      {
        id: "supplier-upload-evidence",
        title: "Upload DigiLocker documents",
        description: "Upload evidence and SOPs required for questionnaire autofill and review.",
        route: "/digilocker",
        optional: false,
      },
      {
        id: "supplier-open-workspace",
        title: "Respond in audit workspace",
        description: "Open audit workspace and complete pending questionnaire responses.",
        route: "/work",
        optional: false,
      },
      {
        id: "supplier-risk-dashboard",
        title: "Review risk dashboard",
        description: "Check supplier risk insights and close open follow-ups.",
        route: "/supplier/risk",
        optional: true,
      },
    ],
  },
  supplieruser: {
    key: "supplier-user-default",
    version: "v1",
    title: "Supplier User Quick Start",
    subtitle: "Handle evidence and questionnaire actions assigned to you.",
    steps: [
      {
        id: "supplieruser-upload-evidence",
        title: "Upload evidence",
        description: "Use DigiLocker to upload role-assigned evidence files.",
        route: "/digilocker",
        optional: false,
      },
      {
        id: "supplieruser-workspace",
        title: "Complete assigned questionnaire items",
        description: "Open workspace and finish pending supplier responses.",
        route: "/work",
        optional: false,
      },
      {
        id: "supplieruser-notifications",
        title: "Monitor notifications",
        description: "Review reminders and pending action alerts.",
        route: "/workspace/notifications",
        optional: true,
      },
    ],
  },
  auditor: {
    key: "auditor-default",
    version: "v1",
    title: "Auditor Quick Start",
    subtitle: "Run execution review, compliance checks, and reporting flow.",
    steps: [
      {
        id: "auditor-open-test-artifacts",
        title: "Run Test Artifacts preview",
        description: "Use Test Artifacts to validate evidence tagging and questionnaire autofill.",
        route: "/test-artifacts",
        optional: false,
      },
      {
        id: "auditor-review-audit",
        title: "Review audit request",
        description: "Open audit details and review supplier submissions with comments.",
        route: "/audits",
        optional: false,
      },
      {
        id: "auditor-generate-report",
        title: "Generate report draft",
        description: "Trigger report generation and verify observations/CAPA mapping.",
        route: "/audits",
        optional: false,
      },
      {
        id: "auditor-calendar",
        title: "Check audit calendar",
        description: "Review upcoming milestones and schedule commitments.",
        route: "/calendar",
        optional: true,
      },
    ],
  },
  admin: {
    key: "admin-default",
    version: "v1",
    title: "Admin Quick Start",
    subtitle: "Configure standards, users, and AI quality controls.",
    steps: [
      {
        id: "admin-rag-vectors",
        title: "Configure RAG vectors",
        description: "Open RAG vectors and upload compliance guidelines for indexing.",
        route: "/admin/rag-vectors",
        optional: false,
      },
      {
        id: "admin-askhawk",
        title: "Review Ask Hawk quality",
        description: "Open Ask Hawk admin page and run quality/evaluation checks.",
        route: "/admin/askhawk",
        optional: false,
      },
      {
        id: "admin-user-controls",
        title: "Review users and roles",
        description: "Validate user access setup from admin user management.",
        route: "/admin/users",
        optional: true,
      },
    ],
  },
  tenant_admin: {
    key: "tenant-admin-default",
    version: "v1",
    title: "Tenant Admin Quick Start",
    subtitle: "Configure tenant controls and governance quickly.",
    steps: [
      {
        id: "tenantadmin-rag-vectors",
        title: "Configure RAG vectors",
        description: "Upload and refresh tenant compliance guideline vectors.",
        route: "/admin/rag-vectors",
        optional: false,
      },
      {
        id: "tenantadmin-users",
        title: "Manage tenant users",
        description: "Review tenant user access and role assignments.",
        route: "/admin/users",
        optional: false,
      },
      {
        id: "tenantadmin-milestones",
        title: "Review workflow milestones",
        description: "Check milestone descriptions and tenant phase setup.",
        route: "/admin/workflow-milestones",
        optional: true,
      },
    ],
  },
  superadmin: {
    key: "superadmin-default",
    version: "v1",
    title: "Platform Admin Quick Start",
    subtitle: "Monitor platform quality, tenants, and AI control points.",
    steps: [
      {
        id: "superadmin-tenants",
        title: "Review tenants",
        description: "Open platform tenant view and verify tenant health.",
        route: "/platform/tenants",
        optional: false,
      },
      {
        id: "superadmin-askhawk",
        title: "Review Ask Hawk quality",
        description: "Validate Ask Hawk quality and unanswered queues.",
        route: "/admin/askhawk",
        optional: false,
      },
      {
        id: "superadmin-audit-logs",
        title: "Review audit logs",
        description: "Check platform audit logs and governance trails.",
        route: "/platform/audit-logs",
        optional: true,
      },
    ],
  },
};

const dedupeList = (items = []) => [...new Set((Array.isArray(items) ? items : []).filter(Boolean))];

const getPlaybookForRole = (role = "") => {
  const normalized = normalizeRole(role);
  return PLAYBOOKS[normalized] || null;
};

const getRequiredStepIds = (playbook = null) =>
  (playbook?.steps || []).filter((step) => !step.optional).map((step) => step.id);

const getNextPendingStepId = ({ playbook = null, completedStepIds = [] } = {}) => {
  const completed = new Set(dedupeList(completedStepIds));
  const next = (playbook?.steps || []).find((step) => !completed.has(step.id));
  return next?.id || "";
};

const resolveContextStepId = ({ playbook = null, route = "", completedStepIds = [] } = {}) => {
  const normalizedRoute = String(route || "").trim().toLowerCase();
  if (!normalizedRoute) return "";
  const completed = new Set(dedupeList(completedStepIds));
  const match = (playbook?.steps || []).find((step) => {
    if (!step?.route) return false;
    const routePrefix = String(step.route).toLowerCase();
    if (!normalizedRoute.startsWith(routePrefix)) return false;
    return !completed.has(step.id);
  });
  return match?.id || "";
};

const mergeStepState = ({ playbook = null, completedStepIds = [], skippedStepIds = [], currentStepId = "" } = {}) => {
  const completed = new Set(dedupeList(completedStepIds));
  const skipped = new Set(dedupeList(skippedStepIds));
  return (playbook?.steps || []).map((step, index) => {
    const isCompleted = completed.has(step.id);
    const isSkipped = skipped.has(step.id);
    const status = isCompleted ? "COMPLETED" : isSkipped ? "SKIPPED" : "PENDING";
    return {
      ...step,
      order: index + 1,
      status,
      isCompleted,
      isSkipped,
      isCurrent: !isCompleted && !isSkipped && step.id === currentStepId,
    };
  });
};

const computeProgress = ({ playbook = null, completedStepIds = [] } = {}) => {
  const steps = playbook?.steps || [];
  if (!steps.length) {
    return { totalSteps: 0, completedSteps: 0, percent: 0 };
  }
  const completed = new Set(dedupeList(completedStepIds));
  const completedSteps = steps.filter((step) => completed.has(step.id)).length;
  const percent = Number(((completedSteps / steps.length) * 100).toFixed(1));
  return {
    totalSteps: steps.length,
    completedSteps,
    percent,
  };
};

const isPlaybookCompleted = ({ playbook = null, completedStepIds = [] } = {}) => {
  const required = getRequiredStepIds(playbook);
  if (!required.length) return false;
  const completed = new Set(dedupeList(completedStepIds));
  return required.every((id) => completed.has(id));
};

const toClientState = ({ state, playbook, contextRoute = "" }) => {
  const completedStepIds = dedupeList(state?.completedStepIds || []);
  const skippedStepIds = dedupeList(state?.skippedStepIds || []);
  const currentStepId =
    String(state?.currentStepId || "") || getNextPendingStepId({ playbook, completedStepIds });
  const steps = mergeStepState({
    playbook,
    completedStepIds,
    skippedStepIds,
    currentStepId,
  });
  const progress = computeProgress({ playbook, completedStepIds });
  return {
    key: playbook?.key || "role-default",
    version: playbook?.version || "v1",
    title: playbook?.title || "",
    subtitle: playbook?.subtitle || "",
    status: state?.status || "NOT_STARTED",
    currentStepId,
    contextStepId: resolveContextStepId({
      playbook,
      route: contextRoute,
      completedStepIds,
    }),
    nextStepId: getNextPendingStepId({ playbook, completedStepIds }),
    completedStepIds,
    skippedStepIds,
    progress,
    steps,
    lastSeenAt: state?.lastSeenAt || null,
    startedAt: state?.startedAt || null,
    completedAt: state?.completedAt || null,
    dismissedAt: state?.dismissedAt || null,
    updatedAt: state?.updatedAt || null,
  };
};

export const OnboardingWizardPlaybookService = {
  normalizeRole,
  getPlaybookForRole,
  getRequiredStepIds,
  getNextPendingStepId,
  resolveContextStepId,
  mergeStepState,
  computeProgress,
  isPlaybookCompleted,
  dedupeList,
  toClientState,
};

