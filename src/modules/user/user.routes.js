import { Router } from "express";

import * as userController from './user.controller.js'

const router = Router()
router.get("/", (req, res) => {
    res.status(200).json({ message: 'user' })
})



router.post('/search', userController.searchUser);
router.post('/add-friend', userController.addFriend);
router.get('/getUserById/:id', userController.getUserById);

router.post("/getOnlineFriends", userController.getOnlineFriends);
export default router
