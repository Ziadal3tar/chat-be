import { Router } from "express";
import * as notificationsController from "./notifications.controller.js";
import { authMiddleware } from "../../middleware/auth.js";

const router = Router();

router.use(authMiddleware);

router.get("/", notificationsController.getNotifications);
router.get("/unread-count", notificationsController.getUnreadCount);
router.patch("/:notificationId/read", notificationsController.markAsRead);
router.patch("/read-all", notificationsController.markAllAsRead);
router.delete("/:notificationId", notificationsController.deleteNotification);

export default router;
