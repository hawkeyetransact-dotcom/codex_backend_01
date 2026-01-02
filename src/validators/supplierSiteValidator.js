import Joi from "joi";

export const addSiteValidator = Joi.object({
  plant_id: Joi.string().required(),
  site_name: Joi.string().required(),
  address_line1: Joi.string().required(),
  address_line2: Joi.string().optional().allow(null).allow(""),
  address_line3: Joi.string().optional().allow(null).allow(""),
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  country: Joi.string().required(),
  zipcode: Joi.string().required(),
  contact_person_title: Joi.string().required(),
  contact_person_fname: Joi.string().required(),
  contact_person_lname: Joi.string().required(),
  contact_email: Joi.string().email().required(),
  contact_phone_countryCode: Joi.string().required(),
  contact_phone: Joi.string().required(),
  gmp_audited: Joi.boolean().optional(),
});
