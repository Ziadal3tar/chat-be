import { asyncHandler } from "../../services/asyncHandler.js";
import { AppError } from "../../services/AppError.js";
import { emitToUsers } from "../../services/socket.events.js";
import { createNotification } from "../notifications/notifications.service.js";
import {
  createRelationshipPayload,
  getId,
  getPendingRequest,
  hasId,
  isBlockedEitherDirection,
  removeRelationshipArtifacts,
  removeRequest,
  validateObjectId,
  validatePair,
  withUserPairTransaction,
} from "../../services/relationship.service.js";
import User from "../../../models/User.model.js";

const emitFriendEvent = (req, event, userIds, payload = {}) => {
  emitToUsers(req.app.get("io"), userIds, event, payload);
};

const notify = async (req, options) => {
  try {
    return await createNotification({ io: req.app.get("io"), ...options });
  } catch (error) {
    console.error("Notification creation error:", error);
    return null;
  }
};

export const getRelationship = asyncHandler(async (req, res) => {
  validatePair(req.userId, req.params?.userId);

  const [currentUser, targetUser] = await Promise.all([
    User.findById(req.userId).select(
      "friends friendRequests friendRequestsSent blockedUsers",
    ),
    User.findById(req.params.userId).select(
      "friends friendRequests friendRequestsSent blockedUsers",
    ),
  ]);

  if (!currentUser || !targetUser) throw new AppError("User not found", 404);

  return res.json({
    success: true,
    relationship: createRelationshipPayload(currentUser, targetUser),
  });
});

export const sendFriendRequest = asyncHandler(async (req, res) => {
  const fromId = req.userId;
  const toId = req.body?.toId || req.body?.friendId;
  validatePair(fromId, toId, "Recipient");

  const result = await withUserPairTransaction(
    fromId,
    toId,
    async ({ currentUser, targetUser }) => {
      if (isBlockedEitherDirection(currentUser, targetUser)) {
        throw new AppError(
          "Friend request is not allowed between these users",
          403,
        );
      }
      if (hasId(currentUser.friends, targetUser._id)) {
        throw new AppError("Already friends", 409);
      }
      if (
        getPendingRequest(currentUser.friendRequestsSent, "to", targetUser._id)
      ) {
        throw new AppError("Friend request already sent", 409);
      }
      if (
        getPendingRequest(currentUser.friendRequests, "from", targetUser._id)
      ) {
        throw new AppError("This user already sent you a friend request", 409);
      }

      currentUser.friendRequestsSent.push({
        to: targetUser._id,
        status: "pending",
      });
      targetUser.friendRequests.push({
        from: currentUser._id,
        status: "pending",
      });

      await Promise.all([currentUser.save(), targetUser.save()]);

      return { currentUser, targetUser };
    },
  );

  const { currentUser, targetUser } = result;

  emitFriendEvent(req, "friendRequestReceived", [targetUser._id], {
    fromId: currentUser._id,
    userName: currentUser.userName,
    profileImage: currentUser.profileImage,
  });

  await notify(req, {
    recipient: targetUser._id,
    actor: currentUser._id,
    type: "friend_request",
    title: "New friend request",
    message: `${currentUser.userName} sent you a friend request.`,
    data: { userId: currentUser._id },
  });

  return res.status(201).json({
    success: true,
    message: "Friend request sent",
    relationship: createRelationshipPayload(currentUser, targetUser),
  });
});

export const acceptFriendRequest = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const fromId = req.body?.fromId;
  validatePair(userId, fromId, "Sender");

  const { currentUser, targetUser } = await withUserPairTransaction(
    userId,
    fromId,
    async ({ currentUser, targetUser }) => {
      if (isBlockedEitherDirection(currentUser, targetUser)) {
        throw new AppError(
          "Friend request cannot be accepted while a block exists",
          403,
        );
      }

      const incoming = getPendingRequest(
        currentUser.friendRequests,
        "from",
        targetUser._id,
      );
      const outgoing = getPendingRequest(
        targetUser.friendRequestsSent,
        "to",
        currentUser._id,
      );

      if (!incoming || !outgoing) {
        throw new AppError("Pending friend request not found", 404);
      }

      removeRelationshipArtifacts(currentUser, targetUser);
      currentUser.friends.addToSet(targetUser._id);
      targetUser.friends.addToSet(currentUser._id);

      await Promise.all([currentUser.save(), targetUser.save()]);
      return { currentUser, targetUser };
    },
  );

  emitFriendEvent(req, "friendRequestAccepted", [targetUser._id], {
    fromId: currentUser._id,
    toId: targetUser._id,
  });
  emitFriendEvent(req, "friendAdded", [currentUser._id, targetUser._id], {
    userId: currentUser._id,
    friendId: targetUser._id,
  });

  await notify(req, {
    recipient: targetUser._id,
    actor: currentUser._id,
    type: "friend_request_accepted",
    title: "Friend request accepted",
    message: `${currentUser.userName} accepted your friend request.`,
    data: { userId: currentUser._id },
  });

  return res.json({
    success: true,
    message: "Friend request accepted",
    relationship: createRelationshipPayload(currentUser, targetUser),
  });
});

export const rejectFriendRequest = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const fromId = req.body?.fromId;
  validatePair(userId, fromId, "Sender");

  const { currentUser, targetUser } = await withUserPairTransaction(
    userId,
    fromId,
    async ({ currentUser, targetUser }) => {
      const incoming = getPendingRequest(
        currentUser.friendRequests,
        "from",
        targetUser._id,
      );
      const outgoing = getPendingRequest(
        targetUser.friendRequestsSent,
        "to",
        currentUser._id,
      );

      if (!incoming || !outgoing)
        throw new AppError("Pending friend request not found", 404);

      removeRelationshipArtifacts(currentUser, targetUser);
      await Promise.all([currentUser.save(), targetUser.save()]);
      return { currentUser, targetUser };
    },
  );

  emitFriendEvent(req, "friendRequestRejected", [targetUser._id], {
    fromId: currentUser._id,
    userName: currentUser.userName,
  });

  await notify(req, {
    recipient: targetUser._id,
    actor: currentUser._id,
    type: "friend_request_rejected",
    title: "Friend request declined",
    message: `${currentUser.userName} declined your friend request.`,
    data: { userId: currentUser._id },
  });

  return res.json({ success: true, message: "Friend request rejected" });
});

export const getFriendRequests = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select("friendRequests")
    .populate(
      "friendRequests.from",
      "userName email profileImage isOnline lastSeenAt",
    )
    .lean();

  if (!user) throw new AppError("User not found", 404);

  const friendRequests = (user.friendRequests || []).filter(
    (request) => request.status === "pending" && request.from,
  );

  return res.json({
    success: true,
    count: friendRequests.length,
    friendRequests,
  });
});

export const getFriends = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select("friends")
    .populate(
      "friends",
      "userName email profileImage isOnline lastSeenAt createdAt",
    )
    .lean();

  if (!user) throw new AppError("User not found", 404);
  return res.json({
    success: true,
    count: user.friends?.length || 0,
    friends: user.friends || [],
  });
});

export const cancelFriendRequest = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const friendId = req.body?.friendId || req.body?.toId;
  validatePair(userId, friendId, "Recipient");

  const { currentUser, targetUser } = await withUserPairTransaction(
    userId,
    friendId,
    async ({ currentUser, targetUser }) => {
      if (
        !getPendingRequest(currentUser.friendRequestsSent, "to", targetUser._id)
      ) {
        throw new AppError("Pending friend request not found", 404);
      }

      removeRelationshipArtifacts(currentUser, targetUser);
      await Promise.all([currentUser.save(), targetUser.save()]);
      return { currentUser, targetUser };
    },
  );

  emitFriendEvent(req, "friendRequestCancelled", [targetUser._id], {
    fromId: currentUser._id,
  });

  await notify(req, {
    recipient: targetUser._id,
    actor: currentUser._id,
    type: "friend_request_cancelled",
    title: "Friend request cancelled",
    message: `${currentUser.userName} cancelled the friend request.`,
    data: { userId: currentUser._id },
  });

  return res.json({
    success: true,
    message: "Friend request cancelled successfully",
  });
});

export const unfriendUser = asyncHandler(async (req, res) => {  
  const userId = req.userId;
  const friendId = req.body?.friendId;
  validatePair(userId, friendId);

  const { currentUser, targetUser } = await withUserPairTransaction(
    userId,
    friendId,
    async ({ currentUser, targetUser }) => {
      if (!hasId(currentUser.friends, targetUser._id)) {
        throw new AppError("Users are not friends", 409);
      }

      currentUser.friends.pull(targetUser._id);
      targetUser.friends.pull(currentUser._id);
      removeRelationshipArtifacts(currentUser, targetUser);
      await Promise.all([currentUser.save(), targetUser.save()]);
      return { currentUser, targetUser };
    },
  );

  emitFriendEvent(req, "friendRemoved", [currentUser._id, targetUser._id], {
    userId: currentUser._id,
    friendId: targetUser._id,
  });

  await notify(req, {
    recipient: targetUser._id,
    actor: currentUser._id,
    type: "friend_removed",
    title: "Friend removed",
    message: `${currentUser.userName} removed you from their friends.`,
    data: { userId: currentUser._id },
  });

  return res.json({ success: true, message: "Friend removed successfully" });
});

export const blockUser = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const targetId = req.body?.friendId;
  validatePair(userId, targetId, "User");

  const { currentUser, targetUser } = await withUserPairTransaction(
    userId,
    targetId,
    async ({ currentUser, targetUser }) => {
      if (hasId(currentUser.blockedUsers, targetUser._id)) {
        throw new AppError("User already blocked", 409);
      }

      currentUser.blockedUsers.addToSet(targetUser._id);
      currentUser.friends.pull(targetUser._id);
      targetUser.friends.pull(currentUser._id);
      removeRelationshipArtifacts(currentUser, targetUser);

      await Promise.all([currentUser.save(), targetUser.save()]);
      return { currentUser, targetUser };
    },
  );

  emitFriendEvent(req, "userBlocked", [targetUser._id], {
    userId: currentUser._id,
  });
  emitFriendEvent(req, "friendRemoved", [currentUser._id, targetUser._id], {
    userId: currentUser._id,
    friendId: targetUser._id,
  });

  return res.json({ success: true, message: "User blocked successfully" });
});

export const unblockUser = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const targetId = req.body?.friendId || req.body?.userId;
  validatePair(userId, targetId, "User");

  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  if (!hasId(user.blockedUsers, targetId)) {
    throw new AppError("User is not blocked", 404);
  }

  user.blockedUsers.pull(targetId);
  await user.save();

  emitFriendEvent(req, "userUnblocked", [targetId], { userId: user._id });
  return res.json({ success: true, message: "User unblocked successfully" });
});

export const getBlockedUsers = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select("blockedUsers")
    .populate("blockedUsers", "userName email profileImage isOnline lastSeenAt")
    .lean();

  if (!user) throw new AppError("User not found", 404);
  return res.json({
    success: true,
    count: user.blockedUsers?.length || 0,
    blockedUsers: user.blockedUsers || [],
  });
});
