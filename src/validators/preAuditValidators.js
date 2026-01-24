import Joi from "joi";

const participantSchema = Joi.object({
  userId: Joi.string().optional(),
  role: Joi.string().optional(),
  name: Joi.string().optional(),
  email: Joi.string().email().optional(),
});

const approvalSchema = Joi.object({
  role: Joi.string().optional(),
  userId: Joi.string().optional(),
  status: Joi.string().valid("PENDING", "APPROVED", "REJECTED").optional(),
  signedAt: Joi.date().optional(),
  note: Joi.string().allow("").optional(),
});

export const auditPlanValidator = Joi.object({
  phaseKey: Joi.string().optional(),
  scope: Joi.string().allow("").optional(),
  objectives: Joi.string().allow("").optional(),
  riskSummary: Joi.string().allow("").optional(),
  requiredDocuments: Joi.array().items(Joi.string()).optional(),
  participants: Joi.array().items(participantSchema).optional(),
  approvals: Joi.array().items(approvalSchema).optional(),
  status: Joi.string().valid("DRAFT", "SUBMITTED", "APPROVED").optional(),
  version: Joi.number().min(1).optional(),
});

const agendaBlockSchema = Joi.object({
  startAt: Joi.date().optional(),
  endAt: Joi.date().optional(),
  topic: Joi.string().allow("").optional(),
  ownerRole: Joi.string().optional(),
  ownerUserId: Joi.string().optional(),
  location: Joi.string().allow("").optional(),
  notes: Joi.string().allow("").optional(),
});

const attendeeSchema = Joi.object({
  userId: Joi.string().optional(),
  role: Joi.string().optional(),
  name: Joi.string().allow("").optional(),
  email: Joi.string().email().optional(),
});

export const agendaValidator = Joi.object({
  phaseKey: Joi.string().optional(),
  status: Joi.string().valid("DRAFT", "PROPOSED", "CONFIRMED").optional(),
  blocks: Joi.array().items(agendaBlockSchema).optional(),
  attendees: Joi.array().items(attendeeSchema).optional(),
  version: Joi.number().min(1).optional(),
});

const responseSchema = Joi.object({
  questionId: Joi.string().optional(),
  value: Joi.any().optional(),
});

export const preAuditQuestionnaireValidator = Joi.object({
  templateId: Joi.number().optional(),
  status: Joi.string().valid("DRAFT", "SENT", "IN_PROGRESS", "SUBMITTED", "REVIEWED").optional(),
  responses: Joi.array().items(responseSchema).optional(),
  sentAt: Joi.date().optional(),
  submittedAt: Joi.date().optional(),
  version: Joi.number().min(1).optional(),
});
