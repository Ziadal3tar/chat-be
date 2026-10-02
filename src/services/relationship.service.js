import mongoose from "mongoose";
import User from "../../models/User.model.js";
import { AppError } from "./AppError.js";
import { withTransaction } from "./transaction.js";

export const getId = (value) => value?.toString?.() || "";

export const hasId = (list = [], id) =>
  list.some((item) => getId(item) === getId(id));

export const getPendingRequest = (list = [], field, id) =>
  list.find(
    (request) =>
      getId(request?.[field]) === getId(id) && request?.status === "pending"
  );

export const removeRequest = (list = [], field, id) =>
  list.filter((request) => getId(request?.[field]) !== getId(id));

export const validateObjectId = (value, label = "User") => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`${label} id is invalid`, 400);
  }
};

export const validatePair = (userId, targetId, label = "User") => {
  validateObjectId(targetId, label);

  if (getId(userId) === getId(targetId)) {
    throw new AppError("You cannot perform this action on yourself", 400);
  }
}

export const isBlockedEitherDirection = (user, target) =>
  hasId(user?.blockedUsers, target?._id) ||
  hasId(target?.blockedUsers, user?._id);

export const createRelationshipPayload = (currentUser, targetUser) => {
  const currentId = getId(currentUser._id);
  const targetId = getId(targetUser._id);

  const isFriend = hasId(currentUser.friends, targetId);
  const outgoingPending = Boolean(
    getPendingRequest(currentUser.friendRequestsSent, "to", targetId)
  );
  const incomingPending = Boolean(
    getPendingRequest(currentUser.friendRequests, "from", targetId)
  );
  const blockedByMe = hasId(currentUser.blockedUsers, targetId);
  const blockedMe = hasId(targetUser.blockedUsers, currentId);

  let status = "none";
  if (blockedByMe) status = "blocked_by_me";
  else if (blockedMe) status = "blocked_me";
  else if (isFriend) status = "friends";
  else if (outgoingPending) status = "pending_sent";
  else if (incomingPending) status = "pending_received";

  return {
    status,
    isFriend,
    outgoingPending,
    incomingPending,
    blockedByMe,
    blockedMe,
    canMessage: isFriend && !blockedByMe && !blockedMe,
  };
};

export const loadUserPair = async (userId, targetId, session = null) => {
  const query = User.find({ _id: { $in: [userId, targetId] } });
  if (session) query.session(session);
  const users = await query;
  return {
    currentUser: users.find((user) => getId(user._id) === getId(userId)) || null,
    targetUser: users.find((user) => getId(user._id) === getId(targetId)) || null,
  };
};

export const withUserPairTransaction = async (userId, targetId, callback) =>
  withTransaction(async (session) => {
    const { currentUser, targetUser } = await loadUserPair(userId, targetId, session);

    if (!currentUser || !targetUser) {
      throw new AppError("User not found", 404);
    }

    return callback({ session, currentUser, targetUser });
  });

export const removeRelationshipArtifacts = (currentUser, targetUser) => {
  currentUser.friendRequestsSent = removeRequest(
    currentUser.friendRequestsSent,
    "to",
    targetUser._id
  );
  currentUser.friendRequests = removeRequest(
    currentUser.friendRequests,
    "from",
    targetUser._id
  );

  targetUser.friendRequestsSent = removeRequest(
    targetUser.friendRequestsSent,
    "to",
    currentUser._id
  );
  targetUser.friendRequests = removeRequest(
    targetUser.friendRequests,
    "from",
    currentUser._id
  );
};
