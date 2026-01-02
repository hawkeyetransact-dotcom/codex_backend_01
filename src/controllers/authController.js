import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";
import { sendMail } from "../helpers/mailHelper.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";

export const register = async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      role,
    });
    await user.save();

    // Generate email verification token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d", // token expires in 1 day
    });

    // Build verification link
    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/api/auth/verify-email?token=${token}`;

    // Send verification email
    sendMail(
      email,
      "Email Verification",
      `Please verify your email by clicking on the following link: ${verificationLink}`
    );

    res.status(201).json({
      message: "User registered successfully. Verification email sent.",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const verifyEmail = async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ error: "Token is missing" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Update user's isEmailVerified flag
    await User.findByIdAndUpdate(userId, { isEmailVerified: true });

    // Redirect to the frontend URL after verification
    return res.redirect(`${process.env.FE_BASE_URL}/auth/verified-email`);
  } catch (error) {
    res.status(400).json({ error: "Invalid or expired token" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    // Include password for comparison (since it's select: false by default)
    const user = await User.findOne({ email }).select("+password");

    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({
        error:
          "Email is not verified. Please verify your email before logging in.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        email: user.email,
        invitedBy: user.invitedBy,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );
    res.status(200).json({ token, role: user.role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const supplierRegisterAndCreateProfile = async (req, res) => {
  const {
    email,
    password,
    // Profile fields
    title,
    firstName,
    lastName,
    countryCode,
    phone,
    gender,
    companyName,
    addressline1,
    addressline2,
    addressline3,
    country,
    state,
    city,
    zipcode,
  } = req.body;

  try {
    // Check if email exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Hash password and create user with role "supplier"
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      role: "supplier",
    });
    await user.save();

    // Create supplier profile (linked to the newly created user)
    const profile = new SupplierProfile({
      user_id: user._id,
      title,
      firstName,
      lastName,
      countryCode,
      phone,
      gender,
      companyName,
      addressline1,
      addressline2,
      addressline3,
      country,
      state,
      city,
      zipcode,
    });
    await profile.save();

    // Generate email verification token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d", // token expires in 1 day
    });

    // Build verification link
    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/api/auth/verify-email?token=${token}`;

    // Send verification email
    sendMail(
      email,
      "Email Verification",
      `Please verify your email by clicking on the following link: ${verificationLink}`
    );

    res.status(201).json({
      message: "Supplier registered successfully. Verification email sent.",
      user,
      profile,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createSupplierUser = async (req, res) => {
  try {
    // The supplier's ID will be used for invitedBy
    const supplierId = req.user._id;
    const { email, password } = req.body;

    // Check if a user with the given email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with that email already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new supplierUser. Note that isEmailVerified is set to true.
    const newUser = new User({
      email,
      password: hashedPassword,
      role: "supplierUser",
      isEmailVerified: true,
      invitedBy: supplierId,
    });

    await newUser.save();

    // Send email with credentials to the new supplier user.
    // (For security, this approach is acceptable only for transactional/temporary passwords.)
    const mailText = `Welcome!

Your supplier user account has been created.
Email: ${email}
Password: ${password}

You can now log in using these credentials.`;
    await sendMail(email, "Your Supplier User Account", mailText);

    return res
      .status(201)
      .json({ message: "Supplier user created successfully", user: newUser });
  } catch (error) {
    console.error("Error creating supplier user:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "Email not found" });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    // Generate email verification token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Build verification link
    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/api/auth/verify-email?token=${token}`;

    // Send verification email
    sendMail(
      email,
      "Email Verification",
      `Please verify your email by clicking the following link: ${verificationLink}`
    );

    res.status(200).json({ message: "Verification email resent successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const buyerRegisterAndCreateProfile = async (req, res) => {
  const {
    email,
    password,
    // Buyer profile fields
    title,
    firstName,
    lastName,
    countryCode,
    phone,
    gender,
    companyName,
    addressline1,
    addressline2,
    addressline3,
    country,
    state,
    city,
    zipcode,
  } = req.body;

  try {
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Hash the password and create user with role "buyer"
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      role: "buyer",
    });
    await user.save();

    // Create buyer profile
    const profile = new BuyerProfile({
      user_id: user._id,
      title,
      firstName,
      lastName,
      countryCode,
      phone,
      gender,
      companyName,
      addressline1,
      addressline2,
      addressline3,
      country,
      state,
      city,
      zipcode,
    });
    await profile.save();

    // Generate email verification token (optional for buyers if needed)
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/api/auth/verify-email?token=${token}`;
    sendMail(
      email,
      "Email Verification",
      `Please verify your email by clicking on the following link: ${verificationLink}`
    );

    res.status(201).json({
      message: "Buyer registered successfully. Verification email sent.",
      user,
      profile,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export const auditorRegisterAndCreateProfile = async (req, res) => {
  const {
    email,
    password,
    // Profile fields
    title,
    firstName,
    lastName,
    countryCode,
    phone,
    gender,
    companyName,
    addressline1,
    addressline2,
    addressline3,
    country,
    state,
    city,
    zipcode,
    linkedinUrl
  } = req.body;

  try {
    // Check if email exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Hash password and create user with role "supplier"
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      role: "auditor",
    });
    await user.save();

    // Create auditor profile (linked to the newly created user)
    const profile = new AuditorProfile({
      user_id: user._id,
      title,
      firstName,
      lastName,
      countryCode,
      phone,
      gender,
      companyName,
      addressline1,
      addressline2,
      addressline3,
      country,
      state,
      city,
      zipcode,
      linkedinUrl
    });
    await profile.save();

    // Generate email verification token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d", // token expires in 1 day
    });

    // Build verification link
    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/api/auth/verify-email?token=${token}`;

    // Send verification email
    sendMail(
      email,
      "Email Verification",
      `Please verify your email by clicking on the following link: ${verificationLink}`
    );

    res.status(201).json({
      message: "Auditor registered successfully. Verification email sent.",
      user,
      profile,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};