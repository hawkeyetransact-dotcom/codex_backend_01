import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { SupplierUserProfile } from "../models/supplierUserProfileModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { User } from "../models/userModel.js";

export const createProfile = async (req, res) => {
  try {
    const existingProfile = await SupplierProfile.findOne({
      user_id: req.user._id,
    });
    if (existingProfile)
      return res
        .status(400)
        .json({ error: "Profile already exists.", profile: existingProfile });

    const profile = new SupplierProfile({ user_id: req.user._id, ...req.body });
    await profile.save();

    res.status(201).json({ message: "Profile created successfully", profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const profile = await SupplierProfile.findOne({ user_id: req.user._id });

    if (!profile) return res.status(404).json({ error: "Profile not found." });

    const payload = { ...req.body };
    if (req.user?.role === "supplier") {
      payload.firstName = profile.firstName;
      payload.lastName = profile.lastName;
      payload.countryCode = profile.countryCode;
      payload.phone = profile.phone;
    }

    await SupplierProfile.updateOne({ user_id: req.user._id }, payload, {
      new: true,
    });

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    let profileData;
    const userRole = req.user.role;
    const userInfo = await User.findOne({ _id: req.user._id });
    switch (userRole) {
      case "supplier":
        profileData = await SupplierProfile.findOne({
          user_id: req.user._id,
        }).lean();
        break;
      case "auditor":
        profileData = await AuditorProfile.findOne({
          user_id: req.user._id,
        }).lean();
        break;
      case "buyer":
        profileData = await BuyerProfile.findOne({
          user_id: req.user._id,
        }).lean();
        break;
      case "supplierUser":
        profileData = await SupplierUserProfile.findOne({
          user_id: req.user._id,
        });
        break;
      default:
        profileData = null;
    }

    if (!profileData && !userInfo)
      return res.status(404).json({ error: "Profile not found." });

    res.status(200).json({ profile: profileData, user: userInfo });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

export const getSupplierUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const query = {
      role: "supplierUser",
      invitedBy: req.user._id, // Ensure that the invitedBy field is set when a supplier creates a supplier user
    };

    const users = await User.find(query)
      .select("-password -__v")
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const count = await User.countDocuments(query);

    res.status(200).json({
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalRecords: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
