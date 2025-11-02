
import express from "express";

import * as chatController from './chat.controller.js'
const router = express.Router();

router.post("/initChat", chatController.initChat);
router.post("/getChat", chatController.getChat);
router.post("/getMyChats", chatController.getMyChats);
router.post("/markMessagesAsRead", chatController.markMessagesAsRead);
router.get("/markOneMessagesAsRead/:_id", chatController.markOneMessagesAsRead);
export default router;
