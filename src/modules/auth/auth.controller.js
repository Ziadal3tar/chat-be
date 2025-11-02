import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../../../models/User.model.js'
import { asyncHandler } from '../../services/asyncHandler.js'
import { Message } from '../../../models/Message.model.js'




export const register = asyncHandler(async (req, res) => {
  const { userName, email, phone, password } = req.body;

  // ✅ التحقق من وجود جميع الحقول
  if (!userName || !email || !phone || !password) {
    const missingField = !userName
      ? 'userName'
      : !email
        ? 'email'
        : !phone
          ? 'phone'
          : 'password';

    return res.status(400).json({
      status: 'error',
      message: `"${missingField}" is required`,
    });
  }

  // ✅ التحقق من أن البريد أو الهاتف غير مستخدم مسبقًا
  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });

  if (existingUser) {
    if (existingUser.email === email) {
      return res.status(409).json({ status: 'error', message: 'Email already registered' });
    }
    return res.status(409).json({ status: 'error', message: 'Phone already registered' });
  }

  // ✅ إنشاء المستخدم
  const newUser = new User({
    userName,
    email,
    phone,
    password,
  });
  await newUser.save();

  // ✅ إنشاء JWT Token
  const token = jwt.sign(
    { id: newUser._id, email: newUser.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // ✅ الرد على العميل
  return res.status(201).json({
    status: 'success',
    message: 'Registered successfully',
    token,
    user: {
      _id: newUser._id,
      userName: newUser.userName,
      email: newUser.email,
      phone: newUser.phone,
      profileImage: newUser.profileImage,
    },
  });
});






export const login = asyncHandler(async (req, res) => {
  const { emailOrPhone, password } = req.body;

  if (!emailOrPhone || !password) {
    return res.status(400).json({
      message: 'error',
      validationError: [[[{ message: !emailOrPhone ? '"emailOrPhone" is required' : '"password" is required' }]]],
    });
  }

  const user = await User.findOne({
    $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
  });

  if (!user) {
    return res.status(200).json({ emailErr: 'Email or phone not found' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(200).json({ passErr: 'Incorrect password' });
  }

  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(200).json({
    message: 'success',
    token,
  });
});



export const getUserData = asyncHandler(async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ استخدم lean علشان تقدر تعدل بحرية
    const user = await User.findById(decoded.id)
      .select('-password')
      .populate('friends', 'userName email profileImage')
      .populate({
        path: 'chats',
        populate: [
          {
            path: 'lastMessage',
            model: 'Message'
          },
          {
            path: 'participants',
            select: 'userName email profileImage',
          }
        ],
        options: { sort: { updatedAt: -1 } } // ✅ ترتيب الشاتات حسب آخر تحديث
      })
      .lean(); // 🟢 مهم جدًا

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ✅ أضف عداد الرسائل غير المقروءة لكل شات
    for (const chat of user.chats) {
      const unreadCount = await Message.countDocuments({
        chatId: chat._id,
        sendTo: decoded.id,
        isRead: false
      });
      chat.unreadCount = unreadCount;
    }

    res.status(200).json({
      message: 'success',
      user,
    });

  } catch (error) {
    console.error(error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});



export const allUsers = asyncHandler(async (req, res) => {

  const users = await User.find({});
  if (!users) return res.status(400).json({ message: 'Invalid credentials' });

  res.status(201).json({ message: 'All Users', users });


});

