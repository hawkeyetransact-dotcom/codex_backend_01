import Joi from "joi";

const isoCountry = Joi.string().pattern(/^[A-Z]{2}$/);

export const catalogProductPayloadValidator = Joi.object({
  listingType: Joi.string()
    .valid("API", "FDF", "EXCIPIENT", "INTERMEDIATE", "PACKAGING_COMPONENT")
    .required(),
  canonicalName: Joi.string().min(2).max(200).required(),
  synonyms: Joi.array().items(Joi.string().max(120)).optional(),
  description: Joi.string().allow("").max(5000).optional(),
  identifiers: Joi.object({
    cas: Joi.string().pattern(/^\d{2,7}-\d{2}-\d$/).allow("").optional(),
    inn: Joi.string().max(200).allow("").optional(),
    unii: Joi.string().pattern(/^[A-Z0-9]{10}$/).allow("").optional(),
    gsrsId: Joi.string().max(64).allow("").optional(),
    productNdc: Joi.string().pattern(/^\d{4,5}-\d{3,4}-\d{1,2}$/).allow("").optional(),
    packageNdc: Joi.string().allow("").optional(),
  }).default({}),
  fdf: Joi.object({
    dosageForm: Joi.string().allow("").optional(),
    strength: Joi.object({
      value: Joi.number().positive().allow(null).optional(),
      unit: Joi.string().allow("").optional(),
    }).optional(),
    route: Joi.string().allow("").optional(),
  }).optional(),
  quality: Joi.object().optional(),
  stability: Joi.object().optional(),
  provenance: Joi.object({
    visibility: Joi.string().valid("public", "registered", "private").default("private"),
    sources: Joi.array()
      .items(
        Joi.object({
          source_name: Joi.string().required(),
          url: Joi.string().uri().allow("").optional(),
          fetched_at: Joi.date().iso().optional(),
          confidence: Joi.number().min(0).max(1).optional(),
        })
      )
      .optional(),
  }).optional(),
})
  .custom((value, helpers) => {
    if (value.listingType === "API" && !value.identifiers?.cas && !value.identifiers?.inn) {
      return helpers.error("any.custom", {
        message: "API listings require CAS or INN",
      });
    }
    if (
      value.listingType === "FDF" &&
      (!value.fdf?.dosageForm || !value.fdf?.strength?.value || !value.fdf?.strength?.unit)
    ) {
      return helpers.error("any.custom", {
        message: "FDF listings require dosage form and strength",
      });
    }
    return value;
  });

export const supplierClaimPayloadValidator = Joi.object({
  catalogProductId: Joi.string().required(),
  variantId: Joi.string().allow("", null).optional(),
  ownerOrgId: Joi.string().allow("", null).optional(),
  supplierName: Joi.string().allow("").optional(),
  supplierRole: Joi.array()
    .items(
      Joi.string().valid("manufacturer", "distributor", "trader", "cdmo", "packager", "lab")
    )
    .default([]),
  siteIds: Joi.array().items(Joi.string()).default([]),
  roles: Joi.array().items(Joi.string()).default([]),
  complianceClaims: Joi.array()
    .items(
      Joi.string().valid(
        "GMP",
        "cGMP",
        "USDMF",
        "JDMF",
        "KDMF",
        "CEP",
        "COA",
        "SDS",
        "ISO9001",
        "GDP",
        "AuditReport"
      )
    )
    .default([]),
  complianceDetails: Joi.object().optional(),
  evidenceDocIds: Joi.array().items(Joi.string()).default([]),
  evidenceDocTypes: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  offer: Joi.object({
    visibility: Joi.string().valid("private", "registered", "public").default("private"),
    offerStatus: Joi.string().valid("draft", "active", "paused", "expired").default("active"),
    quality: Joi.object({
      specReference: Joi.string()
        .valid("USP", "Ph.Eur.", "JP", "BP", "ChP", "In-house", "Other")
        .allow("")
        .optional(),
    }).optional(),
    packaging: Joi.object({
      packConfigurations: Joi.array()
        .items(
          Joi.object({
            packSize: Joi.number().positive().allow(null).optional(),
            packUnit: Joi.string().allow("").optional(),
            material: Joi.string().allow("").optional(),
            innerOuter: Joi.string().allow("").optional(),
            label: Joi.string().allow("").optional(),
          })
        )
        .default([]),
    }).optional(),
    supply: Joi.object({
      moq: Joi.object({
        value: Joi.number().positive().allow(null).optional(),
        unit: Joi.string().allow("").optional(),
        isNegotiable: Joi.boolean().default(false),
      }).optional(),
      leadTimeDays: Joi.object({
        min: Joi.number().min(0).max(3650).allow(null).optional(),
        max: Joi.number().min(0).max(3650).allow(null).optional(),
      }).optional(),
      price: Joi.object({
        currency: Joi.string().length(3).uppercase().allow("").optional(),
        amount: Joi.number().positive().allow(null).optional(),
        basis: Joi.string().allow("").optional(),
        isOnRequest: Joi.boolean().default(false),
      }).optional(),
    }).optional(),
    trade: Joi.object({
      countryOfOrigin: isoCountry.allow("").optional(),
      hsCode: Joi.string().pattern(/^\d{6}(\d{2,4})?$/).allow("").optional(),
    }).optional(),
  }).optional(),
});

export const bulkPreviewValidator = Joi.object({
  rows: Joi.array().items(Joi.object().unknown(true)).min(1).required(),
});
