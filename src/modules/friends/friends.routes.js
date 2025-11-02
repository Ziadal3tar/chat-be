import { Router } from "express";

import * as friendsController from './friends.controller.js'

const router = Router()
router.get("/", (req, res) => {
    res.status(200).json({ message: 'friends' })
})






router.post('/send', friendsController.sendFriendRequest);
router.post('/accept', friendsController.acceptFriendRequest);
router.post('/reject', friendsController.rejectFriendRequest);
router.get('/getFriendRequests', friendsController.getFriendRequests);
router.post("/cancel", friendsController.cancelFriendRequest);
router.post("/block", friendsController.blockUser);
router.post("/unblock", friendsController.unblockUser);

export default router;