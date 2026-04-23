/**
 * Training Auto-Assign Agent — Wave 2.
 *
 * When an SOP rev publishes, this agent identifies who should be trained
 * and creates read-and-understood assignments.
 *
 * Logic:
 *   1. Resolve affected roles from the SOP's rolesAffected / departmentAffected field.
 *   2. List all ACTIVE tenant users whose role intersects.
 *   3. Create one TrainingRecord per user with dueDate = publishDate + gracePeriodDays.
 *   4. Skip users who already have an active assignment for this SOP rev.
 *   5. Optionally ask LLM to draft a short knowledge-check question from the SOP diff.
 *
 * Returns { ok, created, skipped, knowledgeCheck? }.
 */
import mongoose from "mongoose";
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";
import { recordAiDecision } from "../../audit/aiAuditTrail.js";

const PROMPT_VERSION = "training.auto_assign@1.0.0";
const DEFAULT_GRACE_DAYS = 14;

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

export async function autoAssignOnSopRevision({
  tenantId,
  sopId,
  sopNumber,
  sopTitle,
  sopVersion,
  affectedRoles = [],
  affectedDepartments = [],
  gracePeriodDays = DEFAULT_GRACE_DAYS,
  drafterUserId,
  generateKnowledgeCheck = true,
  sopDiffSummary,
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantId || !sopId) throw new Error("autoAssignOnSopRevision: tenantId + sopId required");

  const User = modelByName("users") || modelByName("User");
  const TrainingRecord = modelByName("training-records") || modelByName("TrainingRecord");

  if (!User || !TrainingRecord) {
    return { ok: false, reason: "models_not_available" };
  }

  // 1. Find candidate users.
  const userFilter = { tenant_id: tenantId, status: "ACTIVE" };
  const orClauses = [];
  if (affectedRoles.length) orClauses.push({ role: { $in: affectedRoles } });
  if (affectedDepartments.length) {
    orClauses.push({
      $or: [
        { department: { $in: affectedDepartments } },
        { "profile.department": { $in: affectedDepartments } },
      ],
    });
  }
  if (orClauses.length) userFilter.$or = orClauses;

  const candidates = await User.find(userFilter).select("_id email role").lean().catch(() => []);
  if (!candidates.length) {
    return { ok: true, created: 0, skipped: 0, note: "no_candidate_users" };
  }

  // 2. Filter out users who already have an active assignment for this rev.
  const existing = await TrainingRecord.find({
    tenantId,
    documentControlId: sopId,
    trainingCode: sopVersion ? `${sopNumber}@v${sopVersion}` : sopNumber,
    status: { $ne: "COMPLETED" },
  }).select("traineeId").lean().catch(() => []);
  const alreadyAssigned = new Set(existing.map((r) => String(r.traineeId)));

  // 3. Create assignments.
  const dueDate = new Date(Date.now() + gracePeriodDays * 86400000);
  const created = [];
  const skipped = [];
  for (const u of candidates) {
    if (alreadyAssigned.has(String(u._id))) {
      skipped.push({ userId: u._id, email: u.email, reason: "already_assigned" });
      continue;
    }
    try {
      const record = await TrainingRecord.create({
        tenantId,
        traineeId: u._id,
        trainingType: "READ_AND_UNDERSTOOD",
        trainingCode: sopVersion ? `${sopNumber}@v${sopVersion}` : sopNumber,
        trainingTitle: `${sopTitle} · rev ${sopVersion}`,
        documentControlId: sopId,
        assignedByUserId: drafterUserId,
        dueDate,
        status: "ASSIGNED",
      });
      created.push({ recordId: record._id, userId: u._id, email: u.email, role: u.role });
    } catch (err) {
      skipped.push({ userId: u._id, email: u.email, reason: err.message });
    }
  }

  // 4. Optional: LLM-drafted knowledge check from diff summary.
  let knowledgeCheck;
  if (generateKnowledgeCheck && sopDiffSummary) {
    const kcResult = await groundedGenerate({
      feature: "training.knowledge_check",
      systemPrompt:
        "You draft a short, fair, SOP-specific knowledge-check question for a read-and-understood attestation. Output JSON.",
      userPrompt: [
        `SOP: ${sopNumber} · ${sopTitle} · rev ${sopVersion}`,
        "",
        `DIFF SUMMARY (what changed from prior rev):\n${sopDiffSummary}`,
        "",
        "Produce ONE multiple-choice question that tests real understanding (not trivia). 4 options. Include the correct index.",
      ].join("\n"),
      retrievalSet: [
        { docId: `sop:${sopId}`, chunkId: "diff", text: sopDiffSummary, score: 1 },
      ],
      outputSchema: {
        requiredFields: ["question", "options", "correct_index", "rationale", "citations", "confidence"],
      },
      minConfidence: 0.4,
      requireCitations: false,
      tenantContext: { ...tenantContext, tenantId, linkedEntityType: "training_knowledge_check", linkedEntityId: sopId },
      llmConfig,
      promptVersion: `${PROMPT_VERSION}::kc`,
    });
    if (kcResult.ok) knowledgeCheck = kcResult.output;
  }

  // 5. Audit trail for the bulk assignment.
  await recordAiDecision({
    tenantId,
    actorId: drafterUserId,
    feature: "training.auto_assign",
    linkedEntityType: "document_control",
    linkedEntityId: sopId,
    output: { assignedCount: created.length, skippedCount: skipped.length },
    confidence: 1.0,
    grounded: true,
    provider: "rule",
    model: "role-based-auto-assign",
    modelVersion: "1.0.0",
    promptVersion: PROMPT_VERSION,
  }).catch(() => {});

  return {
    ok: true,
    created,
    skipped,
    createdCount: created.length,
    skippedCount: skipped.length,
    dueDate,
    knowledgeCheck,
  };
}

export const __private = { PROMPT_VERSION };
