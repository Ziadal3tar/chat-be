
import { asyncHandler } from '../../services/asyncHandler.js'
import User from '../../../models/User.model.js'
import jwt from 'jsonwebtoken';

export const sendFriendRequest = asyncHandler(async (req, res) => {
  const { fromId, toId } = req.body;

  if (fromId === toId) {
    return res.status(400).json({ message: "Can't add yourself" });
  }

  const fromUser = await User.findById(fromId);
  const toUser = await User.findById(toId);

  if (!fromUser || !toUser)
    return res.status(404).json({ message: "User not found" });

  // تحقق هل الطلب موجود أصلاً
  const alreadySent = fromUser.friendRequestsSent.some(
    (r) => r.to.toString() === toId && r.status === "pending"
  );
  if (alreadySent)
    return res.status(400).json({ message: "Request already sent" });

  fromUser.friendRequestsSent.push({ to: toId });
  toUser.friendRequests.push({ from: fromId });

  await fromUser.save();
  await toUser.save();

  // 🔔 إشعار Realtime للطرف الآخر
  const io = req.app.get("io");
  if (toUser.socketId){
    io.to(toUser.socketId).emit("friendRequestReceived", {
      fromId,
      userName: fromUser.userName,
      profileImage: fromUser.profileImage,
    });
  }
  res.status(200).json({ success: true, message: "Friend request sent" });
});


/**
 * ✅ قبول طلب صداقة
 */
export const acceptFriendRequest = asyncHandler(async (req, res) => {
  const { userId, fromId } = req.body;

  const user = await User.findById(userId);
  const sender = await User.findById(fromId);

  if (!user || !sender)
    return res.status(404).json({ message: "User not found" });

  // عدل حالة الطلب في الطرفين
  const request = user.friendRequests.find(
    (r) => r.from.toString() === fromId && r.status === "pending"
  );
  const sentReq = sender.friendRequestsSent.find(
    (r) => r.to.toString() === userId && r.status === "pending"
  );

  if (!request || !sentReq)
    return res.status(400).json({ message: "Request not found" });

  request.status = "accepted";
  sentReq.status = "accepted";

  user.friends.push(fromId);
  sender.friends.push(userId);

  await user.save();
  await sender.save();

  const io = req.app.get("io");
  if (sender.socketId)
    io.to(sender.socketId).emit("friendRequestAccepted", {
      fromId: userId,
      userName: user.userName,
      profileImage: user.profileImage,
    });

  res.json({ success: true, message: "Friend request accepted" });
});


/**
 * ❌ رفض طلب صداقة
 */
export const rejectFriendRequest = asyncHandler(async (req, res) => {
  const { userId, fromId } = req.body;

  const user = await User.findById(userId);
  const sender = await User.findById(fromId);

  if (!user || !sender)
    return res.status(404).json({ message: "User not found" });

  const request = user.friendRequests.find(
    (r) => r.from.toString() === fromId && r.status === "pending"
  );
  const sentReq = sender.friendRequestsSent.find(
    (r) => r.to.toString() === userId && r.status === "pending"
  );

  if (!request || !sentReq)
    return res.status(400).json({ message: "Request not found" });

  request.status = "rejected";
  sentReq.status = "rejected";

  await user.save();
  await sender.save();

  const io = req.app.get("io");
  if (sender.socketId)
    io.to(sender.socketId).emit("friendRequestRejected", {
      fromId: userId,
      userName: user.userName,
    });

  res.json({ success: true, message: "Friend request rejected" });
});



export const getFriendRequests = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    const user = await User.findById(decoded.id)
      .populate({
        path: "friendRequests.from",
        select: "userName email profileImage",
      })
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 📨 استخراج الطلبات المعلّقة فقط
    const pendingRequests = user.friendRequests.filter(
      (req) => req.status === "pending"
    );

    res.status(200).json({
      success: true,
      count: pendingRequests.length,
      friendRequests: pendingRequests,
    });
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    res.status(500).json({ message: "Server error" });
  }
});
export const cancelFriendRequest = asyncHandler(async (req, res) => {
  const { userId, friendId } = req.body;

  const user = await User.findById(userId);
  const friend = await User.findById(friendId);

  if (!user || !friend)
    return res.status(404).json({ message: "User not found" });

  // إزالة الطلب من المرسل

  user.friendRequestsSent = user.friendRequestsSent.filter(
    (r) => r.to.toString() !== friendId
  );

  // إزالة الطلب من المستقبل
  friend.friendRequests = friend.friendRequests.filter(
    (r) => r.from.toString() !== userId
  );

  await user.save();
  await friend.save();
const io = req.app.get("io");
  if (friend.socketId)
    io.to(friend.socketId).emit("friendRequestRejected", {
      fromId: userId,
      userName: user.userName,
    });
  res.status(200).json({ message: "Friend request cancelled successfully" });
});
export const blockUser = asyncHandler(async (req, res) => {
  const { userId, friendId } = req.body;

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  // لو مش موجود بالفعل في البلوك
  if (!user.blockedUsers.includes(friendId)) {
    user.blockedUsers.push(friendId);
  }

  // حذف الصداقة بين الطرفين إن وجدت
  user.friends = user.friends.filter((f) => f.toString() !== friendId);
  const friend = await User.findById(friendId);
  if (friend) {
    friend.friends = friend.friends.filter((f) => f.toString() !== userId);
    await friend.save();
  }

  await user.save();
 const io = req.app.get("io");
  if (friend.socketId){
    io.to(friend.socketId).emit("blockUser");}
  res.status(200).json({ message: "User blocked successfully" });
});
export const unblockUser = asyncHandler(async (req, res) => {
  const { userId, friendId } = req.body;
const friend = await User.findById(friendId);
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  // إزالة المستخدم من قائمة البلوك
  user.blockedUsers = user.blockedUsers.filter(
    (blockedId) => blockedId.toString() !== friendId
  );

  await user.save();
  if (friend.socketId){
    io.to(friend.socketId).emit("unBlockUser");}
  res.status(200).json({ message: "User unblocked successfully" });
});
