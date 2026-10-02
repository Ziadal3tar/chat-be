import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../../../models/User.model.js";
import { Chat } from "../../../models/chat.model.js";
import { Message } from "../../../models/Message.model.js";
import { asyncHandler } from "../../services/asyncHandler.js";
import { AppError } from "../../services/AppError.js";
import env from "../../config/env.js";

const buildToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

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
  const token = buildToken(newUser);

  return res.status(201).json({
    status: "success",
    message: "Registered successfully",
    token,
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

  const token = buildToken(user);
  return res.status(200).json({ message: "success", token });
});

export const getUserData = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select("userName email phone profileImage profileImagePublicId friends blockedUsers createdAt lastSeenAt isOnline bio")
    .populate("friends", "userName email profileImage isOnline lastSeenAt")
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
        { path: "sendTo", select: "userName profileImage isOnline" },
      ],
    })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean();

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

  user.chats = chats.map((chat) => ({
    ...chat,
    unreadCount: unreadMap.get(chat._id.toString()) || 0,
  }));

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
