import jwt from "jsonwebtoken";
import UserModel from "../../models/User.model.js";
import env from "../config/env.js";
import { Session } from "../../models/Session.model.js";

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

    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ success: false, message: "Session has been revoked" });
    }

    const session = decoded.sessionId
      ? await Session.findOne({ user: user._id, tokenId: decoded.sessionId }).lean()
      : null;
    if (!session) {
      return res.status(401).json({ success: false, message: "Session is no longer active" });
    }

    await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });
    req.sessionId = decoded.sessionId;
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
