import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  profileImage: {
    type: String,
    default:
      "https://res.cloudinary.com/dqaf8jxn5/image/upload/w_1000,c_fill,ar_1:1,g_auto,r_max,bo_5px_solid_red,b_rgb:262c35/v1695842249/usersImages/fayt4w1rmor7qjlw4aah.jpg",
  },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  chats: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chat" }],
  socketId: { type: String, default: "" },
  isOnline: { type: Boolean, default: false },

  // ✅ الطلبات المستلمة
  friendRequests: [
    {
      from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending",
      },
    },
  ],

  // ✅ الطلبات المرسلة
  friendRequestsSent: [
    {
      to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending",
      },
    },
  ],

  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });


userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, parseInt(process.env.SALTROUND) || 10);
  next();
});

const UserModel = mongoose.model('User', userSchema);
export default UserModel;

