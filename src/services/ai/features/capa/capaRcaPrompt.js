/**
 * CAPA RCA prompt template (v1.0.0).
 *
 * Pinned: any change must bump the semver in capaRcaDrafter.PROMPT_VERSION
 * and go through change control. The promptHash in the audit trail lets
 * inspectors reconstruct which version produced which draft.
 */

const SYSTEM = `
You are a pharmaceutical Quality Assurance specialist drafting a Corrective
and Preventive Action (CAPA) Root Cause Analysis from a described deviation.
Follow FDA 21 CFR 211.100 / 211.192, ICH Q10 (§3.2.4), ICH Q9 risk principles,
and EU GMP Annex 15. Be rigorous. Never fabricate causes or actions.

PRINCIPLES:
- Use 5-why analysis. Each "why" must be supported by a SOURCE citation or
  the deviation narrative itself. Stop at the first systemic root cause.
- Use fishbone (6M: Man, Machine, Method, Material, Measurement, Mother nature)
  to surface contributing factors.
- Corrective actions fix THIS occurrence; Preventive actions stop recurrence
  elsewhere.
- Effectiveness check must be measurable (sample size, success criteria,
  review window).
- Severity: "minor" (documentation / local), "major" (process gap affecting
  quality), "critical" (patient safety / batch reject risk).
- Do NOT draft actions you cannot tie to a SOURCE or the narrative. If
  evidence is thin, return insufficient_evidence=true.

OUTPUT FORMAT (strict JSON, no prose before or after):
{
  "root_cause_analysis": {
    "five_why": [
      { "why": 1, "question": "...", "answer": "...", "citation": "SOURCE_1:..." },
      { "why": 2, "question": "...", "answer": "...", "citation": "SOURCE_3:..." },
      ...
    ],
    "fishbone": {
      "man": ["..."],
      "machine": ["..."],
      "method": ["..."],
      "material": ["..."],
      "measurement": ["..."],
      "environment": ["..."]
    },
    "narrative": "3-5 sentence summary suitable for the CAPA record."
  },
  "corrective_actions": [
    { "action": "...", "owner_role": "QA Specialist", "due_days": 14, "citation": "SOURCE_2:..." }
  ],
  "preventive_actions": [
    { "action": "...", "owner_role": "Head of QA", "due_days": 30, "citation": "SOURCE_4:..." }
  ],
  "effectiveness_check": {
    "method": "...",
    "success_criteria": "...",
    "review_days": 90,
    "citation": "SOURCE_5:..."
  },
  "severity": "minor | major | critical",
  "regulatory_clauses": ["21 CFR 211.100", "ICH Q10 §3.2.4"],
  "citations": ["SOURCE_1:para_3", "SOURCE_2:para_5", ...],
  "confidence": 0.0
}
`.trim();

/**
 * @param {object} args
 * @param {string} args.deviationNarrative
 * @param {Array<{categoryName, question, answer}>} [args.questionnaireContext]
 * @param {string} [args.batchInfo]
 * @param {string} [args.productInfo]
 */
export function buildCapaRcaPrompt({
  deviationNarrative,
  questionnaireContext = [],
  batchInfo,
  productInfo,
} = {}) {
  const contextBlocks = [];

  if (productInfo) {
    contextBlocks.push(`PRODUCT CONTEXT:\n${productInfo}`);
  }
  if (batchInfo) {
    contextBlocks.push(`BATCH CONTEXT:\n${batchInfo}`);
  }
  if (Array.isArray(questionnaireContext) && questionnaireContext.length) {
    contextBlocks.push(
      "RELATED QUESTIONNAIRE RESPONSES (from the investigation):\n" +
        questionnaireContext
          .slice(0, 8)
          .map(
            (q) =>
              `• [${q.categoryName || "uncategorised"}] ${q.question}\n    → ${q.answer || "(no response)"}`
          )
          .join("\n")
    );
  }

  contextBlocks.push(`DEVIATION NARRATIVE (what happened):\n${deviationNarrative}`);

  const userPrompt = [
    ...contextBlocks,
    "",
    "Draft a complete CAPA RCA using the SOURCES provided above. Each 5-why answer,",
    "corrective action, and preventive action must cite at least one SOURCE. If you",
    "cannot construct a grounded RCA, return insufficient_evidence=true.",
  ].join("\n\n");

  return { systemPrompt: SYSTEM, userPrompt };
}
