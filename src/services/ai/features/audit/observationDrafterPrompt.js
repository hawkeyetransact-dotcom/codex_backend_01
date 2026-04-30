/**
 * Audit Observation Drafter — prompt builder.
 *
 * Drafts a pharma cGMP audit observation grounded in:
 *   - linked questionnaire responses (the EVIDENCE)
 *   - cited regulatory standards (ICH Q7, 21 CFR 211, EU GMP, etc.)
 *   - tenant's prior accepted observations (retrievalSet)
 *
 * Per PDA Letter "Harnessing AI to Strengthen Audit Readiness" — every claim
 * must carry a citation. The prompt forces [<id>] markers after every fact.
 */
export function buildObservationPrompt({
  findingTitle,
  findingDetail,
  questionnaireContext = [], // [{ id: "Q1", question, answer, note, category }]
  standards = [],            // [{ id: "S1", standard: "ICH Q7" }]
  formalityTier = "BASE",
  riskBandAtCreate = "MEDIUM",
}) {
  const evidenceBlock = questionnaireContext.length
    ? questionnaireContext
        .map((q) => `[${q.id}] (${q.category || "uncategorised"}) Q: ${q.question}\n  Answer: ${q.answer || "—"}\n  Note: ${q.note || "—"}`)
        .join("\n")
    : "(no questionnaire evidence linked)";

  const standardsBlock = standards.length
    ? standards.map((s) => `[${s.id}] ${s.standard}`).join("\n")
    : "(no standards cited)";

  const systemPrompt = `You are a senior pharma cGMP auditor drafting an audit observation. You operate under strict ICH Q9(R1) + 21 CFR Part 11 rules.

NON-NEGOTIABLE RULES:
1. Every factual claim MUST carry a citation marker like [Q1] or [S1] referring to the supplied EVIDENCE or STANDARDS blocks. No claim without a citation.
2. Do NOT invent evidence. If the auditor's notes are vague, say so explicitly in the observation text and lower confidence accordingly.
3. Classify the observation as OAI (Official Action Indicated), VAI (Voluntary Action Indicated), or NAI (No Action Indicated) based on regulatory severity.
4. Severity must be CRITICAL, MAJOR, or MINOR.
5. Recommended CAPA must be specific (action verb + owner role + timeline) and aligned with severity.
6. Output JSON only — no prose outside the JSON block.

OUTPUT SCHEMA (required fields):
- title:           short title for the observation
- observation:     paragraph form, every fact-carrying sentence ending with [Qx] or [Sx]
- classification:  "OAI" | "VAI" | "NAI"
- severity:        "CRITICAL" | "MAJOR" | "MINOR"
- recommendedCapa: { action: "...", ownerRole: "supplier QA" | "auditor" | "buyer QA", dueDays: <int>, effectivenessCheck: "..." }
- regulatoryClauses: ["21 CFR 211.100", "ICH Q7 §6.5", ...]   (only those actually cited)
- citations:       [{ id: "Q1" | "S1", source: "...", excerpt: "..." }]
- confidence:      0.0–1.0  (lower if evidence is thin or conflicting)`;

  const userPrompt = `Draft the audit observation.

CONTEXT:
- Audit formality tier: ${formalityTier}
- Risk band at create: ${riskBandAtCreate}
- Auditor's finding title: ${findingTitle}
- Auditor's free-text notes: ${findingDetail || "(none)"}

EVIDENCE (cite as [Qx]):
${evidenceBlock}

STANDARDS AVAILABLE TO CITE (cite as [Sx]):
${standardsBlock}

Return JSON only.`;

  return { systemPrompt, userPrompt };
}
