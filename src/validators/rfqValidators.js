import Joi from "joi";

const attachmentSchema = Joi.object({
  name: Joi.string().allow("", null),
  url: Joi.string().uri().allow("", null),
  size: Joi.number().allow(null),
  mimeType: Joi.string().allow("", null),
}).unknown(false);

const rfqBaseSchema = Joi.object({
  title: Joi.string().max(180).allow("", null),
  supplierOrgId: Joi.string().allow("", null),
  siteId: Joi.string().allow("", null),
  productIds: Joi.array().items(Joi.string()).default([]),
  auditType: Joi.string().max(80).allow("", null),
  auditMode: Joi.string().max(80).allow("", null),
  standards: Joi.array().items(Joi.string().max(80)).default([]),
  scopeText: Joi.string().max(2000).allow("", null),
  deliverables: Joi.array().items(Joi.string().max(120)).default([]),
  preferredWindow: Joi.object({
    startDate: Joi.date().allow(null),
    endDate: Joi.date().allow(null),
  }).default({}),
  location: Joi.object({
    country: Joi.string().max(80).allow("", null),
    state: Joi.string().max(80).allow("", null),
    city: Joi.string().max(80).allow("", null),
    addressText: Joi.string().max(200).allow("", null),
  }).default({}),
  confidentiality: Joi.object({
    ndaRequired: Joi.boolean().default(false),
    level: Joi.string().valid("LOW", "MEDIUM", "HIGH", "STRICT").allow("", null),
  }).default({}),
  closingAt: Joi.date().allow(null),
  attachments: Joi.array().items(attachmentSchema).default([]),
}).unknown(false);

export const createRfqValidator = rfqBaseSchema;
export const updateRfqValidator = rfqBaseSchema;

export const inviteAuditorsValidator = Joi.object({
  auditorOrgIds: Joi.array().items(Joi.string()).min(1).required(),
}).unknown(false);

export const threadMessageValidator = Joi.object({
  visibility: Joi.string().valid("PUBLIC_TO_ALL_INVITED", "PRIVATE_TO_AUDITOR").default("PUBLIC_TO_ALL_INVITED"),
  privateAuditorOrgId: Joi.string().allow("", null),
  text: Joi.string().max(2000).required(),
  attachments: Joi.array().items(attachmentSchema).default([]),
}).unknown(false);

const lineItemSchema = Joi.object({
  label: Joi.string().max(120).required(),
  quantity: Joi.number().min(0).required(),
  unitPrice: Joi.number().min(0).required(),
  amount: Joi.number().min(0).allow(null),
}).unknown(false);

export const submitQuoteValidator = Joi.object({
  lineItems: Joi.array().items(lineItemSchema).min(1).required(),
  currency: Joi.string().max(8).required(),
  totals: Joi.object({
    tax: Joi.number().min(0).allow(null),
  }).default({}),
  proposedSchedule: Joi.object({
    auditDays: Joi.number().min(0).allow(null),
    reportDays: Joi.number().min(0).allow(null),
    earliestStartDate: Joi.date().allow(null),
    latestStartDate: Joi.date().allow(null),
  }).default({}),
  assumptionsText: Joi.string().max(2000).allow("", null),
  exclusionsText: Joi.string().max(2000).allow("", null),
  attachments: Joi.array().items(attachmentSchema).default([]),
}).unknown(false);

export const reviseQuoteValidator = submitQuoteValidator;

export const awardQuoteValidator = Joi.object({
  quoteId: Joi.string().required(),
}).unknown(false);
