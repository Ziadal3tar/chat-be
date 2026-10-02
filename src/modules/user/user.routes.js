import { Router } from "express";
import * as userController from "./user.controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { createRateLimiter, clientKey } from "../../middleware/rateLimit.js";
import { uploadProfileImage } from "../../middleware/uploads.js";
import env from "../../config/env.js";

const router = Router();

const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: env.searchRateLimit,
  keyGenerator: clientKey,
  message: "Too many searches. Please wait before searching again.",
});

router.get("/", authMiddleware, (_req, res) => res.status(200).json({ message: "user" }));
// router.get("/all", authMiddleware, searchLimiter, userController.allUsers);
router.post("/search", authMiddleware, searchLimiter, userController.searchUser);
router.post("/add-friend", authMiddleware, userController.addFriend);
router.get("/getUserById/:id", authMiddleware, userController.getUserById);
router.post(
  "/update",
  authMiddleware,
  uploadProfileImage.single("profileImage"),
  userController.updateProfile
);
router.post("/getOnlineFriends", authMiddleware, userController.getOnlineFriends);

export default router;
