import Joi from "joi";

export const createAuditRequestValidator = Joi.object({
  supplier_id: Joi.string().required(),
  auditor_id: Joi.string().optional().allow("", null),
  supplier_product_id: Joi.string().required(),
  complianceDate: Joi.date().iso().optional(),
  auditETA: Joi.date().iso().optional(),
  site_id:Joi.string().required(),
  intimationTemplateId: Joi.number().optional(),
}).or("complianceDate", "auditETA");

export const updateAuditRequestValidator = Joi.object({
  complianceDate: Joi.date().iso().optional(),
  requestReviewInProgress: Joi.string().optional(),
  nextAuditOn: Joi.string().optional(),
  trackStatus: Joi.string().optional(),
  highStatus: Joi.number().optional(),
  isTemplateUsed: Joi.boolean().optional()
}).unknown(true); // 👈 allow additional fields


export const inviteAuditorValidator = Joi.object({
  email: Joi.string().email().required(),
  firstName: Joi.string().min(1).required(),
  lastName: Joi.string().min(1).required(),
  countryCode: Joi.string().optional().allow("", null),
  phone: Joi.string().optional().allow("", null),
});
