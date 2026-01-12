import Joi from "joi";

export const publicSignalsValidator = Joi.object({
  fda483CountRecent24m: Joi.number().min(0),
  warningLetterRecent24m: Joi.boolean(),
  importAlertActive: Joi.boolean(),
  inspectionsOpenCount: Joi.number().min(0),
  recalls: Joi.array().items(
    Joi.object({
      class: Joi.string().valid("I", "II", "III").required(),
      date: Joi.date().required(),
      product: Joi.string().allow(""),
      note: Joi.string().allow(""),
    })
  ),
  sources: Joi.array().items(
    Joi.object({
      sourceType: Joi.string().valid("manual", "import").required(),
      reference: Joi.string().allow(""),
      capturedAt: Joi.date(),
    })
  ),
  regionFlags: Joi.array().items(Joi.string()),
}).unknown(false);

export const riskMetricsValidator = Joi.object({
  questionnaireOnTimeRate: Joi.number().min(0).max(1),
  avgResponseHoursToFollowups: Joi.number().min(0),
  capaOverdueCount: Joi.number().min(0),
  capaReopenRate: Joi.number().min(0).max(1),
  evidenceQualityScore: Joi.number().min(0).max(100),
  docCompletenessScore: Joi.number().min(0).max(100),
  computedFrom: Joi.string().valid("manual", "derived"),
}).unknown(false);

export const buyerRiskProfileValidator = Joi.object({
  name: Joi.string().required(),
  weights: Joi.object({
    regulatory: Joi.number(),
    inspections: Joi.number(),
    recalls: Joi.number(),
    responsiveness: Joi.number(),
    capa: Joi.number(),
    transparency: Joi.number(),
    evidenceTrust: Joi.number(),
    networkExposure: Joi.number(),
    trend: Joi.number(),
  }),
  productCriticalityRules: Joi.array().items(
    Joi.object({
      productType: Joi.string().required(),
      multiplier: Joi.number().required(),
    })
  ),
  markets: Joi.array().items(Joi.string()),
  isDefault: Joi.boolean(),
  version: Joi.string(),
}).unknown(false);

export const networkLinksValidator = Joi.object({
  links: Joi.array()
    .items(
      Joi.object({
        fromSupplierId: Joi.string().required(),
        toSupplierId: Joi.string().required(),
        linkType: Joi.string()
          .valid("PARENT", "SUBSIDIARY", "CMO_SHARED", "RAW_MATERIAL_SHARED", "SITE_GROUP", "OTHER")
          .required(),
        strength: Joi.number().min(0).max(1),
        evidenceRef: Joi.string().allow(""),
      })
    )
    .min(1)
    .required(),
}).unknown(false);

export const evidenceFindingValidator = Joi.object({
  supplierId: Joi.string().required(),
  documentId: Joi.alternatives(Joi.string(), Joi.number(), Joi.object()),
  findingType: Joi.string()
    .valid("DUPLICATE_HASH", "METADATA_ANOMALY", "CONTRADICTION", "BOILERPLATE_SUSPECT", "MANUAL_FLAG")
    .required(),
  severity: Joi.string().valid("LOW", "MEDIUM", "HIGH").required(),
  note: Joi.string().allow(""),
}).unknown(false);
