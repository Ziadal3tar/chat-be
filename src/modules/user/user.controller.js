import { asyncHandler } from '../../services/asyncHandler.js'
import jwt from 'jsonwebtoken';
import User from '../../../models/User.model.js'
import cloudinary from '../../services/cloudinary.js';
import fs from 'fs';
export const searchUser = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const currentUser = await User.findById(decoded.id).select('blockedUsers');
    if (!currentUser) {
      return res.status(404).json({ message: 'Invalid user token' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Name is required' });
    }

    // 👇 البحث مع استبعاد البلوك
    const allUser = await User.find({
      userName: { $regex: name, $options: 'i' },
      _id: {
        $ne: currentUser._id,
        $nin: currentUser.blockedUsers, // استبعاد الناس اللي هو عامل لهم بلوك
      },
      blockedUsers: { $ne: currentUser._id }, // استبعاد اللي عاملين له بلوك
    }).select('-password');

    res.status(200).json({ allUser });
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

export const addFriend = asyncHandler(async (req, res) => {
  const { friendId } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id);

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const friendUser = await User.findById(friendId);
    if (!friendUser) {
      return res.status(404).json({ message: 'Friend not found' });
    }

    if (friendId === currentUser._id.toString()) {
      return res.status(400).json({ message: 'You cannot add yourself' });
    }

    if (currentUser.friends?.includes(friendId)) {
      return res.status(400).json({ message: 'Already friends' });
    }

    currentUser.friends.push(friendId);
    friendUser.friends.push(currentUser._id);

    await currentUser.save();
    await friendUser.save();

    res.status(200).json({
      message: 'Friend added successfully',
      currentUser: {
        id: currentUser._id,
        userName: currentUser.userName,
      },
      friend: {
        id: friendUser._id,
        userName: friendUser.userName,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

export const getUserById = async (req, res) => {
  try {
    const {id} = req.params
  
  
    const user = await User.findById(id).select("-password").populate("friends");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const getOnlineFriends = async (req, res) => {
  try {
    const { userId } = req.body;

    // جيب المستخدم وأصدقائه
    const user = await User.findById(userId).populate("friends", "userName profileImage isOnline");

    if (!user) return res.status(404).json({ message: "User not found" });

    // رجّع فقط الأصدقاء اللي أونلاين
    const onlineFriends = user.friends.filter((f) => f.isOnline === true);

    res.status(200).json({ success: true, onlineFriends });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



export const updateProfile = asyncHandler(async (req, res) => {
  const { userId, userName } = req.body;
  const file = req.file; // الصورة المرفوعة

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // ✅ لو فيه اسم جديد
  if (userName) {
    user.userName = userName;
  }

  // ✅ لو فيه صورة جديدة
  if (file) {
    const upload = await cloudinary.uploader.upload(file.path, {
      folder: 'usersImages',
      resource_type: 'image',
    });

    user.profileImage = upload.secure_url;

    // حذف الصورة من السيرفر بعد الرفع
    fs.unlinkSync(file.path);
  }

  await user.save();

  res.status(200).json({
    message: 'Profile updated successfully',
    user,
  });
});
