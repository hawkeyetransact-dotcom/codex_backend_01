import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access Denied. No token provided." });
    }

    // Extract token after "Bearer "
    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from database
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ error: "Invalid Token. User not found." });
    }

    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};
