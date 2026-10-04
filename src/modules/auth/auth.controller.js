import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../../../models/User.model.js";
import { Chat } from "../../../models/chat.model.js";
import { Message } from "../../../models/Message.model.js";
import { asyncHandler } from "../../services/asyncHandler.js";
import { AppError } from "../../services/AppError.js";
import env from "../../config/env.js";
import crypto from "crypto";
import { Session } from "../../../models/Session.model.js";

const buildToken = (user, sessionId) =>
  jwt.sign(
    { id: user._id, email: user.email, sessionId, tokenVersion: user.tokenVersion || 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

const createSessionToken = async (user, req) => {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + parseDuration(env.jwtExpiresIn));
  await Session.create({
    user: user._id,
    tokenId: sessionId,
    userAgent: String(req.get("user-agent") || "").slice(0, 500),
    ipAddress: String(req.ip || req.socket?.remoteAddress || "").slice(0, 100),
    expiresAt,
  });
  return { token: buildToken(user, sessionId), sessionId };
};

const parseDuration = (value) => {
  const match = String(value || "7d").match(/^(\d+)([smhd])$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * multiplier;
};

export const register = asyncHandler(async (req, res) => {
  const userName = typeof req.body?.userName === "string" ? req.body.userName.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!userName || !email || !phone || !password) {
    throw new AppError("userName, email, phone and password are required", 400);
  }

  if (userName.length < 2 || userName.length > 50) {
    throw new AppError("Username must be between 2 and 50 characters", 400);
  }

  if (password.length < 6) {
    throw new AppError("Password must be at least 6 characters", 400);
  }

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] }).select("_id email phone");
  if (existingUser) {
    throw new AppError(
      existingUser.email === email ? "Email already registered" : "Phone already registered",
      409
    );
  }

  const newUser = await User.create({ userName, email, phone, password });
  const { token, sessionId } = await createSessionToken(newUser, req);

  return res.status(201).json({
    status: "success",
    message: "Registered successfully",
    token,
    sessionId,
    user: {
      _id: newUser._id,
      userName: newUser.userName,
      email: newUser.email,
      phone: newUser.phone,
      profileImage: newUser.profileImage,
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const emailOrPhone =
    typeof req.body?.emailOrPhone === "string" ? req.body.emailOrPhone.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!emailOrPhone || !password) {
    throw new AppError("Email/phone and password are required", 400);
  }

  const user = await User.findOne({
    $or: [
      { email: emailOrPhone.toLowerCase() },
      { phone: emailOrPhone },
    ],
  }).select("+password");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError("Invalid credentials", 401);
  }

  const { token, sessionId } = await createSessionToken(user, req);
  return res.status(200).json({ message: "success", token, sessionId });
});

export const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 6) throw new AppError("New password must be at least 6 characters", 400);

  const user = await User.findById(req.userId).select("+password");
  if (!user) throw new AppError("User not found", 404);
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    throw new AppError("Current password is incorrect", 401);
  }

  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await Session.deleteMany({ user: user._id });

  return res.json({ success: true, message: "Password changed. Please sign in again." });
});

export const updateEmail = asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AppError("A valid email is required", 400);
  const exists = await User.findOne({ email, _id: { $ne: req.userId } }).select("_id").lean();
  if (exists) throw new AppError("Email already registered", 409);
  const user = await User.findByIdAndUpdate(req.userId, { $set: { email } }, { new: true, runValidators: true }).select("userName email phone profileImage bio friends chatPreferences privacyPreferences notificationPreferences").lean();
  return res.json({ success: true, message: "Email updated successfully", user });
});

export const sessions = asyncHandler(async (req, res) => {
  const rows = await Session.find({ user: req.userId }).select("_id userAgent ipAddress createdAt lastSeenAt expiresAt tokenId").sort({ lastSeenAt: -1 }).lean();
  return res.json({ success: true, sessions: rows.map((row) => ({ _id: row._id, userAgent: row.userAgent, ipAddress: row.ipAddress, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt, expiresAt: row.expiresAt, current: row.tokenId === req.sessionId })) });
});

export const revokeSession = asyncHandler(async (req, res) => {
  await Session.deleteOne({ _id: req.params.id, user: req.userId });
  return res.json({ success: true });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
  await Session.deleteMany({ user: req.userId });
  return res.json({ success: true, message: "All sessions have been signed out." });
});

export const getUserData = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select("userName email phone profileImage profileImagePublicId friends blockedUsers createdAt lastSeenAt isOnline bio chatPreferences privacyPreferences notificationPreferences")
    .populate("friends", "userName email profileImage isOnline lastSeenAt privacyPreferences")
    .populate("blockedUsers", "userName email profileImage isOnline lastSeenAt")
    .lean();

  if (!user) throw new AppError("User not found", 404);

  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  const chats = await Chat.find({ participants: userObjectId })
    .populate("participants", "userName email profileImage isOnline lastSeenAt")
    .populate({
      path: "lastMessage",
      populate: [
        { path: "sendBy", select: "userName profileImage isOnline" },
        { path: "sendTo", select: "userName profileImage isOnline privacyPreferences" },
      ],
    })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean();

  user.friends = (user.friends || []).map((friend) => {
    const privacy = friend.privacyPreferences || {};
    const canSeeOnline = privacy.onlineStatusVisibility !== "nobody";
    const canSeeLastSeen = privacy.lastSeenVisibility === "everyone" || privacy.lastSeenVisibility === "friends";
    return {
      ...friend,
      isOnline: canSeeOnline ? !!friend.isOnline : false,
      lastSeenAt: canSeeLastSeen ? friend.lastSeenAt : null,
      privacyPreferences: undefined,
    };
  });

  const chatIds = chats.map((chat) => chat._id);
  const unreadCounts = chatIds.length
    ? await Message.aggregate([
        {
          $match: {
            chatId: { $in: chatIds },
            sendTo: userObjectId,
            isRead: false,
            isDeleted: false,
          },
        },
        { $group: { _id: "$chatId", count: { $sum: 1 } } },
      ])
    : [];

  const unreadMap = new Map(
    unreadCounts.map((item) => [item._id.toString(), item.count])
  );

  user.chats = chats.map((chat) => {
    const lastMessage = chat.lastMessage
      ? { ...chat.lastMessage }
      : null;
    const lastMessageSenderId = lastMessage?.sendBy?._id?.toString?.() || lastMessage?.sendBy?.toString?.();
    if (lastMessage && lastMessageSenderId === req.userId.toString() && lastMessage.sendTo?.privacyPreferences?.readReceipts === false) {
      lastMessage.isRead = false;
    }
    if (lastMessage?.sendTo && typeof lastMessage.sendTo === "object") {
      delete lastMessage.sendTo.privacyPreferences;
    }

    return {
      ...chat,
      lastMessage,
      unreadCount: unreadMap.get(chat._id.toString()) || 0,
      isPinned: (chat.pinnedBy || []).some((id) => id.toString() === req.userId.toString()),
      isMuted: (chat.mutedBy || []).some((id) => id.toString() === req.userId.toString()),
      pinnedBy: undefined,
      mutedBy: undefined,
    };
  });

  return res.status(200).json({ message: "success", user });
});

export const allUsers = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find({ _id: { $ne: req.userId } })
      .select("userName email profileImage isOnline createdAt lastSeenAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments({ _id: { $ne: req.userId } }),
  ]);

  return res.status(200).json({
    message: "All Users",
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});
