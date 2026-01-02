import mongoose from "mongoose";

const SupplierUserProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    title: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    countryCode: { type: String, required: true },
    phone: { type: Number, required: true },
    isProfileCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const SupplierUserProfile = mongoose.model(
  "supplier-user-profiles",
  SupplierUserProfileSchema
);
