import mongoose from "mongoose";

const BuyerProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
    },
    title: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    countryCode: { type: String, required: true },
    phone: { type: Number, required: true },
    gender: { type: String },
    companyName: { type: String, required: true },
    addressline1: { type: String, required: true },
    addressline2: { type: String },
    addressline3: { type: String },
    country: { type: String },
    state: { type: String },
    city: { type: String },
    zipcode: { type: String, required: true },
    isProfileCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const BuyerProfile = mongoose.model(
  "buyer-profiles",
  BuyerProfileSchema
);
