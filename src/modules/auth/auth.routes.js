import { Router } from "express";

import * as authController from './auth.controller.js'

const router = Router()
router.get("/", (req, res) => {
    res.status(200).json({ message: 'auth' })
})
router.post('/signIn', authController.login);
router.post('/register', authController.register);
router.get('/me', authController.getUserData); // ✅ Get user data by token

export default router
