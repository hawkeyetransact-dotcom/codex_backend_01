import Joi from "joi";

export const supplierProductValidator = Joi.object({
  name: Joi.string().required(),
  casNumber: Joi.string().required(),
  description: Joi.string().optional().allow(null).allow(''),
  apiTechnology: Joi.string().required(),
  dosageForm: Joi.string().optional().allow(null).allow(''),
  image: Joi.string().optional().allow(null).allow(''),
  plant_id: Joi.string().required(),
});
