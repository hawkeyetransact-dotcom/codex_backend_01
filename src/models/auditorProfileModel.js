import mongoose from "mongoose";

const workExperienceSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  role: { type: String, required: true },
  experience: { type: Number, required: true },  
  managerTitle: { type: String },
  managerFirstName: { type: String },
  managerLastname: { type: String },                 
  managerEmail: { type: String, match: /.+\@.+\..+/ },
  managerPhone: { type: String, match: /^[0-9]{10}$/ },
  skills: { type: [String], default: [] }  
});

const certificationSchema = new mongoose.Schema({
  certificationType: { type: String, required: true },  
  issuingAuthority: { type: String, required: true },   
  expiryDate: { type: Date },                           
  certificateUrl: { type: String, required: true },
});

const identityDocumentSchema = new mongoose.Schema({
  documentType: { type: String, required: true },  
  documentUrl: { type: String, required: true }
});

const AuditorProfileSchema = new mongoose.Schema(
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
    // G3: Distinguish in-house auditors from external 3rd-party auditors so the
    // buyer's auditor dropdown can scope correctly + COI checks can apply
    // organisation-level rules.
    auditorAffiliation: {
      type: String,
      enum: ["internal", "external"],
      default: "external",
      index: true,
    },
    // For internal auditors: the buyer org they belong to (so we can filter them
    // for THAT buyer only). For external: the audit firm they represent.
    auditorOrgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organizations",
      default: null,
      index: true,
    },
    linkedinUrl: { type: String},
    resumeUrl: { type: String},
    workExperiences: [workExperienceSchema],
    certifications: [certificationSchema],
    identityDocuments: [identityDocumentSchema],
  },
  { timestamps: true }
);

export const AuditorProfile = mongoose.model(
  "auditor-profiles",
  AuditorProfileSchema
);
