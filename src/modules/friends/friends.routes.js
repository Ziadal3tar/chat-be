import { Router } from "express";
import * as friendsController from "./friends.controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { createRateLimiter, clientKey } from "../../middleware/rateLimit.js";
import env from "../../config/env.js";

const router = Router();

const friendActionLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: Math.max(10, Number(env.friendActionRateLimit || 30)),
  keyGenerator: clientKey,
  message: "Too many friend actions. Please try again shortly.",
});

router.get("/", authMiddleware, (_req, res) => {
  res.status(200).json({ message: "friends" });
});
router.get("/relationship/:userId", authMiddleware, friendsController.getRelationship);
router.get("/requests", authMiddleware, friendsController.getFriendRequests);
router.get("/getFriendRequests", authMiddleware, friendsController.getFriendRequests);
router.get("/list", authMiddleware, friendsController.getFriends);
router.get("/blocked", authMiddleware, friendsController.getBlockedUsers);

router.post("/send", authMiddleware, friendActionLimiter, friendsController.sendFriendRequest);
router.post("/accept", authMiddleware, friendActionLimiter, friendsController.acceptFriendRequest);
router.post("/reject", authMiddleware, friendActionLimiter, friendsController.rejectFriendRequest);
router.post("/cancel", authMiddleware, friendActionLimiter, friendsController.cancelFriendRequest);
router.post("/unfriend", authMiddleware, friendActionLimiter, friendsController.unfriendUser);
router.post("/block", authMiddleware, friendActionLimiter, friendsController.blockUser);
router.post("/unblock", authMiddleware, friendActionLimiter, friendsController.unblockUser);

export default router;
