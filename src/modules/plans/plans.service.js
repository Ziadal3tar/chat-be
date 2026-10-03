import mongoose from "mongoose";
import UserModel from "../../../models/User.model.js";
import { Plan } from "../../../models/Plan.model.js";
import { AppError } from "../../services/AppError.js";
import {
  createMessage,
  ensureNotBlocked,
  getOrCreatePrivateChat,
  emitToChatParticipants,
  isValidObjectId,
  projectMessageForViewer,
} from "../chat/chat.service.js";
import { createNotification } from "../notifications/notifications.service.js";
import { emitToUsers, emitToUser } from "../../services/socket.events.js";

export const PLAN_ACTIONS = new Set([
  "send_reminder",
  "reply_reminder",
  "scheduled_message",
]);

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolveTargetUser = async (ownerId, targetInput, recipientId) => {
  const owner = await UserModel.findById(ownerId).select(
    "friends blockedUsers userName"
  );

  if (!owner) throw new AppError("User not found", 404);

  let target = null;

  if (recipientId && isValidObjectId(recipientId)) {
    target = await UserModel.findById(recipientId).select(
      "userName email phone profileImage isOnline friends blockedUsers"
    );
  } else if (typeof targetInput === "string" && targetInput.trim()) {
    const escaped = escapeRegex(targetInput.trim());

    target = await UserModel.findOne({
      _id: { $in: owner.friends || [] },
      $or: [
        { userName: { $regex: `^${escaped}$`, $options: "i" } },
        { email: { $regex: `^${escaped}$`, $options: "i" } },
        { phone: { $regex: `^${escaped}$` } },
      ],
    }).select("userName email phone profileImage isOnline friends blockedUsers");
  }

  if (!target) {
    throw new AppError("Target friend was not found", 404);
  }

  const isFriend = owner.friends?.some(
    (id) => id.toString() === target._id.toString()
  );

  if (!isFriend) {
    throw new AppError("You can only plan actions for friends", 403);
  }

  const { blocked } = await ensureNotBlocked(ownerId, target._id);
  if (blocked) throw new AppError("This conversation is unavailable", 403);

  return { owner, target };
};


export const searchPlanFriends = async (ownerId, search = "") => {
  const owner = await UserModel.findById(ownerId).select("friends");

  if (!owner) {
    throw new AppError("User not found", 404);
  }

  const value = typeof search === "string" ? search.trim() : "";
  if (!value) {
    return [];
  }

  const escaped = escapeRegex(value);

  return UserModel.find({
    _id: { $in: owner.friends || [] },
    $or: [
      { userName: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
      { phone: { $regex: escaped } },
    ],
  })
    .select("userName email phone profileImage isOnline")
    .sort({ userName: 1 })
    .limit(10)
    .lean();
};

export const createPlan = async ({ ownerId, payload }) => {
  const action = payload?.action;
  const content =
    typeof payload?.content === "string" ? payload.content.trim() : "";
  const targetInput =
    typeof payload?.target === "string" ? payload.target.trim() : "";
  const recipientId = payload?.recipientId || null;
  const scheduledAt = new Date(payload?.scheduledAt);

  if (!PLAN_ACTIONS.has(action)) {
    throw new AppError("Invalid plan action", 400);
  }

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new AppError("A valid scheduledAt is required", 400);
  }

  if (scheduledAt.getTime() <= Date.now()) {
    throw new AppError("scheduledAt must be in the future", 400);
  }

  if (content.length > 5000) {
    throw new AppError("Message content cannot exceed 5000 characters", 400);
  }

  if (action === "scheduled_message" && !content) {
    throw new AppError("Scheduled messages require message content", 400);
  }

  const { target } = await resolveTargetUser(ownerId, targetInput, recipientId);

  let chatId = null;
  if (action !== "send_reminder") {
    const chat = await getOrCreatePrivateChat(ownerId, target._id);
    chatId = chat._id;
  }

  return Plan.create({
    owner: ownerId,
    target: target._id,
    action,
    content,
    scheduledAt,
    chatId,
  });
};

export const listPlans = async (ownerId, status) => {
  const filter = { owner: ownerId };
  if (status) filter.status = status;

  return Plan.find(filter)
    .populate("target", "userName email profileImage isOnline")
    .sort({ scheduledAt: 1, createdAt: -1 })
    .lean();
};

export const cancelPlan = async (ownerId, planId) => {
  if (!isValidObjectId(planId)) {
    throw new AppError("Invalid plan id", 400);
  }

  const plan = await Plan.findOne({ _id: planId, owner: ownerId });
  if (!plan) throw new AppError("Plan not found", 404);

  if (!["pending"].includes(plan.status)) {
    throw new AppError("Only pending plans can be cancelled", 409);
  }

  plan.status = "cancelled";
  await plan.save();

  return plan;
};

export const markPlanCancelledIfInvalid = async (plan, message) => {
  plan.status = "failed";
  plan.errorMessage = message;
  plan.processingAt = null;
  await plan.save();
};

export const executePlan = async (plan, io) => {
  const owner = await UserModel.findById(plan.owner).select(
    "userName friends blockedUsers"
  );
  const target = await UserModel.findById(plan.target).select(
    "userName email profileImage isOnline friends blockedUsers"
  );

  if (!owner || !target) {
    throw new Error("Plan participants no longer exist");
  }

  const friendshipExists = owner.friends?.some(
    (id) => id.toString() === target._id.toString()
  );

  if (!friendshipExists) {
    throw new Error("The target user is no longer a friend");
  }

  const { blocked } = await ensureNotBlocked(owner._id, target._id);
  if (blocked) throw new Error("Messaging between these users is unavailable");

  if (plan.action === "scheduled_message") {
    const chat = await getOrCreatePrivateChat(owner._id, target._id);

    const populatedMessage = await createMessage({
      chat,
      senderId: owner._id,
      recipientId: target._id,
      content: plan.content,
      file: null,
    });

    const messageForRecipient = projectMessageForViewer(
      populatedMessage,
      target._id
    );

    // The scheduled sender is already represented by the completed plan.
    // Realtime delivery is only needed for the recipient.
    emitToUser(io, target._id, "receiveMessage", {
      chatId: chat._id,
      message: messageForRecipient,
      source: "scheduled_plan",
      planId: plan._id,
    });

    await createNotification({
      io,
      recipient: target._id,
      actor: owner._id,
      type: "scheduled_message",
      title: "Scheduled message",
      message: `${owner.userName} sent you a scheduled message.`,
      data: {
        planId: plan._id,
        chatId: chat._id,
        messageId: populatedMessage._id,
      },
    });

    await createNotification({
      io,
      recipient: owner._id,
      actor: owner._id,
      type: "scheduled_message_sent",
      title: "Scheduled message sent",
      message: `Your scheduled message was sent to ${target.userName}.`,
      data: {
        planId: plan._id,
        chatId: chat._id,
        messageId: populatedMessage._id,
        targetUserId: target._id,
      },
    });

    emitToUser(io, owner._id, "planCompleted", {
      planId: plan._id,
      action: plan.action,
      targetUserId: target._id,
      targetUserName: target.userName,
      chatId: chat._id,
      messageId: populatedMessage._id,
    });

    plan.chatId = chat._id;
    plan.status = "completed";
    plan.executedAt = new Date();
    plan.processingAt = null;
    await plan.save();

    return { type: "scheduled_message", message: populatedMessage };
  }

  const isReply = plan.action === "reply_reminder";
  const title = isReply ? "Time to reply" : "Time to send a message";
  const text = isReply
    ? `You planned to reply to ${target.userName}.`
    : `You planned to send a message to ${target.userName}.`;

  await createNotification({
    io,
    recipient: owner._id,
    actor: owner._id,
    type: "plan_reminder",
    title,
    message: plan.content ? `${text} ${plan.content}` : text,
    data: {
      planId: plan._id,
      targetUserId: target._id,
      chatId: plan.chatId,
    },
  });

  emitToUsers(io, [owner._id], "planDue", {
    planId: plan._id,
    action: plan.action,
    targetUserId: target._id,
    targetUserName: target.userName,
    scheduledAt: plan.scheduledAt,
  });

  plan.status = "completed";
  plan.executedAt = new Date();
  plan.processingAt = null;
  await plan.save();

  return { type: "reminder" };
};
