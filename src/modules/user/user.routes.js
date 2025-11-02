import { Router } from "express";

import * as userController from './user.controller.js'
import multer from 'multer';
const upload = multer({ dest: 'uploads/' });

const router = Router()
router.get("/", (req, res) => {
    res.status(200).json({ message: 'user' })
})



router.post('/search', userController.searchUser);
router.post('/add-friend', userController.addFriend);
router.get('/getUserById/:id', userController.getUserById);
router.post('/update', upload.single('profileImage'), userController.updateProfile);

router.post("/getOnlineFriends", userController.getOnlineFriends);
export default router
