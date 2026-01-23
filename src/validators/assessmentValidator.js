import Joi from "joi";

export const createAssessmentValidator = Joi.object({
  modules: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).required(),
  type: Joi.string().optional(),
  scope: Joi.object({
    siteId: Joi.string().optional().allow(null, ""),
    productId: Joi.string().optional().allow(null, ""),
    supplierId: Joi.string().optional().allow(null, ""),
    buyerId: Joi.string().optional().allow(null, ""),
    description: Joi.string().optional().allow("", null),
  }).optional(),
  assignedAuditors: Joi.array()
    .items(
      Joi.object({
        userId: Joi.string().required(),
        role: Joi.string().optional(),
      })
    )
    .optional(),
}).unknown(true);

export const updatePhaseValidator = Joi.object({
  phaseKey: Joi.string().required(),
  status: Joi.string().required(),
  force: Joi.boolean().optional(),
}).unknown(true);

export const updateMilestoneValidator = Joi.object({
  status: Joi.string().optional(),
  ownerUserId: Joi.string().optional(),
  dueDate: Joi.date().iso().optional(),
  notes: Joi.string().optional().allow("", null),
}).unknown(true);

export const createFullQuestionnaireValidator = Joi.object({
  templateId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
}).unknown(true);

export const respondQuestionnaireValidator = Joi.object({
  responses: Joi.array().items(Joi.object({
    questionId: Joi.string().required(),
    value: Joi.any(),
    responseDetails: Joi.any(),
    attachments: Joi.array().items(Joi.any()).optional(),
  })).required(),
  submit: Joi.boolean().optional(),
}).unknown(true);
