import Joi from "joi";

export const supplierUserProfileValidator = Joi.object({
  title: Joi.string().required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  countryCode: Joi.string().required(),
  phone: Joi.number().required(),
  isProfileCompleted: Joi.boolean().optional().allow(null).allow(""), // optional; default handled by model
});
