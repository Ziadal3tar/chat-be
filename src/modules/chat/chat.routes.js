import { Router } from "express";
import * as chatController from "./chat.controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { createRateLimiter, clientKey } from "../../middleware/rateLimit.js";
import { uploadMessageFile } from "../../middleware/uploads.js";
import env from "../../config/env.js";

const router = Router();

const messageSendLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: env.messageRateLimit,
  keyGenerator: clientKey,
  message: "Too many messages. Please slow down and try again later.",
});

const chatReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: env.chatReadRateLimit,
  keyGenerator: clientKey,
  message: "Too many chat requests. Please try again shortly.",
});

router.post(
  "/send",
  authMiddleware,
  messageSendLimiter,
  uploadMessageFile.single("file"),
  chatController.initChat
);
router.post("/getChat", authMiddleware, chatReadLimiter, chatController.getChat);
router.post("/getMyChats", authMiddleware, chatReadLimiter, chatController.getMyChats);
router.post(
  "/markMessagesAsRead",
  authMiddleware,
  chatReadLimiter,
  chatController.markMessagesAsRead
);
router.get(
  "/markOneMessagesAsRead/:_id",
  authMiddleware,
  chatReadLimiter,
  chatController.markOneMessagesAsRead
);
router.patch(
  "/messages/:id",
  authMiddleware,
  messageSendLimiter,
  chatController.updateMessage
);
router.delete(
  "/messages/:id",
  authMiddleware,
  messageSendLimiter,
  chatController.deleteMessage
);


router.get("/search", authMiddleware, chatReadLimiter, chatController.searchMessages);
router.get("/pinned", authMiddleware, chatReadLimiter, chatController.getPinnedMessages);
router.patch("/messages/:id/reaction", authMiddleware, messageSendLimiter, chatController.toggleMessageReaction);
router.patch("/messages/:id/pin", authMiddleware, messageSendLimiter, chatController.toggleMessagePin);
router.patch("/chats/:id/pin", authMiddleware, messageSendLimiter, chatController.toggleChatPin);
router.patch("/chats/:id/mute", authMiddleware, messageSendLimiter, chatController.toggleChatMute);

router.get(
  "/stars",
  authMiddleware,
  chatReadLimiter,
  chatController.getStarredMessages
);

router.patch(
  "/messages/:id/star",
  authMiddleware,
  messageSendLimiter,
  chatController.starMessage
);

router.delete(
  "/messages/:id/star",
  authMiddleware,
  messageSendLimiter,
  chatController.unstarMessage
);

export default router;
