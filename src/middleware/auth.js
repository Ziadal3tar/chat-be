import jwt from "jsonwebtoken";
import UserModel from "../../models/User.model.js";
import env from "../config/env.js";

export const authMiddleware = async (req, res, next) => {
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required",
      });
    }

    const token = authHeader.slice(7).trim();
    const decoded = jwt.verify(token, env.jwtSecret);
    

    if (!decoded?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    const user = await UserModel.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User associated with token no longer exists",
      });
    }

    req.user = user;
    req.userId = user._id.toString();

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        error?.name === "TokenExpiredError"
          ? "Authentication token has expired"
          : "Token is invalid",
    });
  }
};
