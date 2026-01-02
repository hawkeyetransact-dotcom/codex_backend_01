import express from "express";
import {
  register,
  login,
  supplierRegisterAndCreateProfile,
  verifyEmail,
  createSupplierUser,
  resendVerificationEmail,
  buyerRegisterAndCreateProfile,
  auditorRegisterAndCreateProfile
} from "../controllers/authController.js";
import { validate } from "../middlewares/validate.js";
import {
  registerValidator,
  loginValidator,
  supplierRegisterWithProfileValidator,
  createSupplierUserValidator,
  buyerRegisterWithProfileValidator,
  auditorRegisterWithProfileValidator
} from "../validators/authValidator.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";

const router = express.Router();

router.post("/register", validate(registerValidator), register);
router.post("/login", validate(loginValidator), login);
router.post("/resend-verification-email", resendVerificationEmail);
router.get("/verify-email", verifyEmail);

router.post(
  "/supplier-register-and-create-profile",
  validate(supplierRegisterWithProfileValidator),
  supplierRegisterAndCreateProfile
);

router.post(
  "/supplier-user",
  authenticate,
  permit("supplier"), // Only users with role 'supplier' can use this endpoint.
  validate(createSupplierUserValidator),
  createSupplierUser
);

router.post(
  "/buyer-register-and-create-profile",
  validate(buyerRegisterWithProfileValidator),
  buyerRegisterAndCreateProfile
);

router.post(
  "/auditor-register-and-create-profile",
  validate(auditorRegisterWithProfileValidator),
  auditorRegisterAndCreateProfile
);

export default router;