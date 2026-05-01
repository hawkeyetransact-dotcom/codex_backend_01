/**
 * Document Control Classifier — prompt builder.
 *
 * Reads the first ~5 pages of an uploaded controlled document and proposes:
 *   - title
 *   - documentType (enum match — SOP, POLICY, SPECIFICATION, etc.)
 *   - scope (one-line)
 *   - description (paragraph)
 *   - keywords[]
 *   - complianceStandards[] (ICH_Q7, ISO_9001, EU_GMP_Ch_4, …)
 *   - suggestedReviewerRole
 *   - confidence (0–1)
 *   - citations[] (page + offset back into the source text)
 *
 * Per the PDA Letter pattern: AI is restricted to summarisation +
 * classification + tagging from the supplied text. Every output field must
 * carry at least one citation marker [P<page>] (or [F1] for "filename").
 */
const DOCUMENT_TYPES = [
  "SOP",
  "POLICY",
  "WORK_INSTRUCTION",
  "FORM",
  "SPECIFICATION",
  "PROTOCOL",
  "REPORT_TEMPLATE",
  "GUIDELINE",
  "REGULATORY_SUBMISSION",
  "CUSTOM",
];

const REVIEWER_ROLES = [
  "QA Manager",
  "Department Head",
  "Quality Director",
  "Regulatory Affairs",
  "Production Manager",
];

const COMPLIANCE_STANDARDS = [
  "ICH_Q7",
  "ICH_Q9",
  "ICH_Q10",
  "ISO_9001_7.5",
  "EU_GMP_Ch_4",
  "21_CFR_211_180",
  "21_CFR_820_40",
  "WHO_TRS_986",
  "PIC_S_PE_009",
  "USP_GENERAL_CHAPTERS",
  "ANNEX_11_EU_GMP",
];

export function buildDocumentClassifierPrompt({ fileName, extractedText, tenantTaxonomy }) {
  // Trim the text to a sensible budget — first ~6000 chars (≈ 5 pages of plain
  // English). Most controlled documents declare their type / scope on page 1
  // anyway. Keeping prompts cheap matters for bulk uploads.
  const text = String(extractedText || "").slice(0, 6000);
  const tail = extractedText && extractedText.length > 6000 ? "\n[…truncated for prompt…]" : "";

  const systemPrompt = `You are a pharma cGMP document-control classifier. You read uploaded SOPs,
policies, specifications, etc. and propose structured metadata so a Quality
Coordinator can rapidly intake a bulk document drop.

NON-NEGOTIABLE RULES:
1. Every factual claim MUST carry a citation marker like [P1] or [F1]:
   - [P<n>] = page n of the supplied text
   - [F1]   = the file name (when the title is derived from the filename)
2. documentType MUST be one of: ${DOCUMENT_TYPES.join(" | ")}.
3. suggestedReviewerRole MUST be one of: ${REVIEWER_ROLES.join(" | ")}.
4. complianceStandards entries MUST be drawn from this controlled list:
   ${COMPLIANCE_STANDARDS.join(", ")}.
5. confidence reflects how clearly the document declares its purpose.
   Lower confidence (<0.6) when the file is a fragment, OCR-noisy, or
   ambiguous (e.g. "Procedure" with no header).
6. Output JSON only — no prose outside the JSON block.

REQUIRED OUTPUT FIELDS:
- title              short, controllable title (≤ 80 chars)
- documentType       one of the enum above
- scope              one-sentence scope (≤ 200 chars)
- description        2–3 sentence summary
- keywords           5–12 keywords from the text (lower-case)
- complianceStandards 0–6 standards from the controlled list
- suggestedReviewerRole one of the role enum above
- confidence         0–1
- citations          [{ id: "P1"|"F1", excerpt: "≤140 chars from source" }]`;

  const taxonomyHint = tenantTaxonomy?.length
    ? `\n\nTenant's existing categories (prefer reusing where applicable): ${tenantTaxonomy.join(", ")}`
    : "";

  const userPrompt = `Classify the uploaded document.

FILE NAME: ${fileName}${taxonomyHint}

DOCUMENT TEXT (first ~5 pages):
${text}${tail}

Return JSON only.`;

  return { systemPrompt, userPrompt };
}

export const __enums = { DOCUMENT_TYPES, REVIEWER_ROLES, COMPLIANCE_STANDARDS };
