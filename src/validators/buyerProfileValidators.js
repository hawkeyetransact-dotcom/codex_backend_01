import Joi from "joi";

export const buyerProfileValidator = Joi.object({
  title: Joi.string().required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  countryCode: Joi.string().required(),
  phone: Joi.number().required(),
  gender: Joi.string().optional().allow(null).allow(""),
  companyName: Joi.string().required(),
  addressline1: Joi.string().required(),
  addressline2: Joi.string().optional().allow(null).allow(""),
  addressline3: Joi.string().optional().allow(null).allow(""),
  country: Joi.string().optional().allow(null).allow(""),
  state: Joi.string().optional().allow(null).allow(""),
  city: Joi.string().optional().allow(null).allow(""),
  zipcode: Joi.string().required(),
isProfileCompleted: Joi.boolean().optional().allow(null).allow(""),
});
