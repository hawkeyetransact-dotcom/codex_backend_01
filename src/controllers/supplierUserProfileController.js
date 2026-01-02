import { SupplierUserProfile } from "../models/supplierUserProfileModel.js";

export const createSupplierUserProfile = async (req, res) => {
  try {
    // Check if a profile already exists for the supplier user
    const existingProfile = await SupplierUserProfile.findOne({
      user_id: req.user._id,
    });
    if (existingProfile) {
      return res.status(400).json({ error: "Profile already exists." });
    }
    const profile = new SupplierUserProfile({
      user_id: req.user._id,
      ...req.body,
    });
    await profile.save();
    res
      .status(201)
      .json({ message: "Supplier user profile created successfully", profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSupplierUserProfile = async (req, res) => {
  try {
    const profile = await SupplierUserProfile.findOne({
      user_id: req.user._id,
    });
    if (!profile) {
      return res.status(404).json({ error: "Profile not found." });
    }
    await SupplierUserProfile.updateOne({ user_id: req.user._id }, req.body, {
      new: true,
    });
    res
      .status(200)
      .json({ message: "Supplier user profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
