/**
 * formalityResolver.js
 *
 * G11: Resolve ICH Q9(R1) formality tier from supplier risk band.
 *
 * The "formality spectrum" requires that audit depth be commensurate with
 * the risk + complexity of the supplier. We map the SupplierRiskSnapshot's
 * riskBand to a default formality tier, which then drives:
 *   - which AuditQuestions get inExecutionScope=true by default
 *   - which template variant is selected for PAQ + execution
 *
 * The tier is editable by the auditor — they can downgrade or upgrade with
 * a documented justification. This helper just gives the default.
 */

const RISK_BAND_TO_FORMALITY = {
  LOW: "LIGHT",
  MEDIUM: "STANDARD",
  HIGH: "DEEP",
  CRITICAL: "DEEP",
};

const FORMALITY_TO_QUESTION_TIERS = {
  LIGHT: ["BASE_LIGHT"],         // smallest set; for low-risk surveillance audits
  STANDARD: ["BASE", "BASE_LIGHT"], // default GMP audit
  DEEP: ["BASE", "BASE_LIGHT", "HIGH_RISK"], // critical / for-cause / first qualification
};

/** Default formality tier for a given risk band. */
export const formalityForRiskBand = (riskBand) =>
  RISK_BAND_TO_FORMALITY[String(riskBand || "").toUpperCase()] || "STANDARD";

/** Question tiers (AuditQuestion.formalityTier values) included by a given formality. */
export const tiersIncludedByFormality = (formality) =>
  FORMALITY_TO_QUESTION_TIERS[String(formality || "STANDARD").toUpperCase()] ||
  FORMALITY_TO_QUESTION_TIERS.STANDARD;

/** Auditor needs a documented justification when downgrading risk-implied tier. */
export const isDowngrade = (impliedTier, chosenTier) => {
  const order = { LIGHT: 0, STANDARD: 1, DEEP: 2 };
  return (order[chosenTier] ?? 1) < (order[impliedTier] ?? 1);
};

export default {
  formalityForRiskBand,
  tiersIncludedByFormality,
  isDowngrade,
};
