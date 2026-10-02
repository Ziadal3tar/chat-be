import { Router } from "express";
import * as authController from "./auth.controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { createRateLimiter, clientKey } from "../../middleware/rateLimit.js";
import env from "../../config/env.js";

const router = Router();

const authAttemptLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.authRateLimit,
  keyGenerator: clientKey,
  message: "Too many authentication attempts. Please try again later.",
});

router.get("/", (_req, res) => res.status(200).json({ message: "auth" }));
router.post("/signIn", authAttemptLimiter, authController.login);
router.post("/register", authAttemptLimiter, authController.register);
router.get("/me", authMiddleware, authController.getUserData);

export default router;
