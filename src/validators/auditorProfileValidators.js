import Joi from "joi";

export const auditorProfileValidator = Joi.object({
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
  linkedinUrl: Joi.string().optional().allow(null).allow(""),
  resumeUrl: Joi.string().optional().allow(null).allow(""),
  workExperiences: Joi.array().items(
  Joi.object({
      companyName: Joi.string().required(),
      role: Joi.string().required(),
      experience: Joi.number().required(),
      managerTitle: Joi.string().optional(),
      managerFirstName: Joi.string().optional(),
      managerLastName: Joi.string().optional(),
      managerEmail: Joi.string().email().optional(),
      managerPhone: Joi.string().optional(),
      skills: Joi.array().items(Joi.string()).optional(),
    })
  ),

   certifications: Joi.array().items(
    Joi.object({
      certificationType: Joi.string().required(),
      issuingAuthority: Joi.string().required(),
      expiryDate: Joi.date().optional(),
      certificateUrl: Joi.string().required(),
    })
  ),

  identityDocuments: Joi.array().items(
    Joi.object({
      documentType: Joi.string().required(),
      documentUrl: Joi.string().required(),
    })
  ),

});
