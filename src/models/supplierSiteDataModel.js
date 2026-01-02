import mongoose from "mongoose";

const supplierSiteSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    site_name: { type: String, required: true },
    address_line1: { type: String, required: true },
    address_line2: { type: String },
    address_line3: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String, required: true },
    zipcode: { type: String, required: true },
    contact_person_title: { type: String, required: true },
    contact_person_fname: { type: String, required: true },
    contact_person_lname: { type: String, required: true },
    contact_email: { type: String, required: true },
    contact_phone_countryCode: { type: String, required: true },
    contact_phone: { type: String, required: true },
    gmp_audited: { type: Boolean },
    plant_id: { type: String, required: true },
  },
  { timestamps: true }
);


supplierSiteSchema.index({ user_id: 1, plant_id: 1 }, { unique: true });

export const SupplierSite = mongoose.model("supplier-sites", supplierSiteSchema);
