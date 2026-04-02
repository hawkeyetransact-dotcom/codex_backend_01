import Joi from "joi";
import { supplierProfileValidator } from "./supplierProfileValidators.js";
import { buyerProfileValidator } from "./buyerProfileValidators.js";
import { auditorProfileValidator } from "./auditorProfileValidators.js";

const emailField = Joi.string().email({ tlds: { allow: false } }).required();

export const registerValidator = Joi.object({
  email: emailField,
  password: Joi.string().min(6).required(),
  role: Joi.string()
    .valid("buyer", "supplier", "auditor", "admin", "supplierUser")
    .required(),
});

export const loginValidator = Joi.object({
  email: emailField,
  password: Joi.string().required(),
});

const registerValidatorWithoutRole = Joi.object({
  email: emailField,
  password: Joi.string().min(6).required(),
});

export const supplierRegisterWithProfileValidator =
  registerValidatorWithoutRole.concat(supplierProfileValidator);

export const createSupplierUserValidator = Joi.object({
  email: emailField,
  password: Joi.string().min(6).required(),
});

export const buyerRegisterWithProfileValidator =
  registerValidatorWithoutRole.concat(buyerProfileValidator);


export const auditorRegisterWithProfileValidator =
  registerValidatorWithoutRole.concat(auditorProfileValidator);

export const forgotPasswordValidator = Joi.object({
  email: emailField,
});

export const resetPasswordValidator = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).required(),
});

export const changePasswordValidator = Joi.object({
  oldPassword: Joi.string().required(),
  password: Joi.string().min(6).required(),
});
