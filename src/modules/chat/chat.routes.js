
import express from "express";
import multer from 'multer';
import * as chatController from './chat.controller.js'
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/send", upload.single('file'), chatController.initChat);
router.post("/getChat", chatController.getChat);
router.post("/getMyChats", chatController.getMyChats);
router.post("/markMessagesAsRead", chatController.markMessagesAsRead);
router.get("/markOneMessagesAsRead/:_id", chatController.markOneMessagesAsRead);
export default router;
