import mongoose from "mongoose";
import User from "../../../models/User.model.js";
import { asyncHandler } from "../../services/asyncHandler.js";
import { AppError } from "../../services/AppError.js";
import { sendFriendRequest } from "../friends/friends.controller.js";
import {
  createRelationshipPayload,
  getId,
  hasId,
} from "../../services/relationship.service.js";
import {
  deleteCloudinaryAsset,
  uploadProfileImage,
} from "../../services/media.service.js";

const safeUserSelect = "userName email phone profileImage profileImagePublicId bio isOnline createdAt lastSeenAt friends";

export const searchUser = asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) throw new AppError("Name is required", 400);

  const currentUser = await User.findById(req.userId)
    .select("friends blockedUsers friendRequests friendRequestsSent")
    .lean();
  if (!currentUser) throw new AppError("User not found", 404);

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const users = await User.find({
    userName: { $regex: escapedName, $options: "i" },
    _id: { $ne: currentUser._id, $nin: currentUser.blockedUsers || [] },
    blockedUsers: { $ne: currentUser._id },
  })
    .select("userName email profileImage isOnline blockedUsers")
    .limit(20)
    .lean();

  const allUser = users.map((user) => {
    const relationship = createRelationshipPayload(
      currentUser,
      user
    );

    return {
      _id: user._id,
      userName: user.userName,
      email: user.email,
      profileImage: user.profileImage,
      bio: user.bio || "",
      isOnline: user.isOnline,
      relationship: relationship.status,
      canMessage: relationship.canMessage,
    };
  });

  return res.status(200).json({ success: true, allUser });
});

export const addFriend = sendFriendRequest;

export const getUserById = asyncHandler(async (req, res) => {
  const id = req.params?.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid user id", 400);
  }

  const [user, currentUser] = await Promise.all([
    User.findById(id)
      .select("userName email profileImage bio isOnline createdAt lastSeenAt friends blockedUsers")
      .lean(),
    User.findById(req.userId)
      .select("friends friendRequests friendRequestsSent blockedUsers")
      .lean(),
  ]);

  if (!user || !currentUser) throw new AppError("User not found", 404);

  const relationship = createRelationshipPayload(currentUser, user);
  if (relationship.blockedByMe || relationship.blockedMe) {
    throw new AppError("User profile is unavailable", 403);
  }

  const currentFriendIds = new Set((currentUser.friends || []).map((friendId) => friendId.toString()));
  const mutualFriendsCount = (user.friends || []).reduce(
    (count, friendId) => count + (currentFriendIds.has(friendId.toString()) ? 1 : 0),
    0
  );

  return res.status(200).json({
    success: true,
    user: {
      _id: user._id,
      userName: user.userName,
      email: user.email,
      profileImage: user.profileImage,
      bio: user.bio || "",
      isOnline: user.isOnline,
      lastSeenAt: user.lastSeenAt,
      createdAt: user.createdAt,
      friendsCount: user.friends?.length || 0,
      mutualFriendsCount,
      relationship: relationship.status,
      canMessage: relationship.canMessage,
    },
  });
});

export const getOnlineFriends = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select("friends blockedUsers")
    .lean();
  if (!user) throw new AppError("User not found", 404);

  const blockedIds = new Set((user.blockedUsers || []).map((id) => getId(id)));
  const friends = user.friends || [];

  const onlineFriends = await User.find({
    _id: { $in: friends, $nin: user.blockedUsers || [], $ne: req.userId },
    blockedUsers: { $ne: req.userId },
    isOnline: true,
  })
    .select("userName profileImage isOnline lastSeenAt")
    .lean();

  return res.status(200).json({
    success: true,
    onlineFriends: onlineFriends.filter((friend) => !blockedIds.has(getId(friend._id))),
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const userName = typeof req.body?.userName === "string" ? req.body.userName.trim() : "";
  const bio = typeof req.body?.bio === "string" ? req.body.bio.trim() : null;
  const file = req.file;

  if (userName && (userName.length < 2 || userName.length > 50)) {
    throw new AppError("Username must be between 2 and 50 characters", 400);
  }
  if (!userName && bio === null && !file) throw new AppError("No profile changes were provided", 400);
  if (bio !== null && bio.length > 500) throw new AppError("Bio cannot exceed 500 characters", 400);

  const user = await User.findById(req.userId);
  if (!user) throw new AppError("User not found", 404);

  const oldPublicId = user.profileImagePublicId;
  let newUpload = null;

  if (userName) user.userName = userName;
  if (bio !== null) user.bio = bio;

  if (file) {
    newUpload = await uploadProfileImage(file);
    user.profileImage = newUpload.url;
    user.profileImagePublicId = newUpload.publicId;
  }

  await user.save();

  if (newUpload && oldPublicId && oldPublicId !== newUpload.publicId) {
    deleteCloudinaryAsset(oldPublicId, "image").catch((error) =>
      console.error("Old profile image cleanup failed:", error)
    );
  }

  const safeUser = await User.findById(user._id).select(safeUserSelect).lean();
  return res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: safeUser,
  });
});
