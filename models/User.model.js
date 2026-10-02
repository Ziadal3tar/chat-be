import mongoose from "mongoose";
import bcrypt from "bcrypt";
import env from "../src/config/env.js";

const requestSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    userNameNormalized: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    profileImage: {
      type: String,
      default:
        "https://res.cloudinary.com/dqaf8jxn5/image/upload/w_1000,c_fill,ar_1:1,g_auto,r_max,bo_5px_solid_red,b_rgb:262c35/v1695842249/usersImages/fayt4w1rmor7qjlw4aah.jpg",
    },
    profileImagePublicId: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    chats: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chat" }],
    socketId: { type: String, default: "" },
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },
    friendRequests: [requestSchema],
    friendRequestsSent: [
      new mongoose.Schema(
        {
          to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          status: {
            type: String,
            enum: ["pending", "accepted", "rejected"],
            default: "pending",
          },
        },
        { _id: false }
      ),
    ],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// userSchema.index({ userNameNormalized: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ "friendRequests.from": 1, "friendRequests.status": 1 });
userSchema.index({ "friendRequestsSent.to": 1, "friendRequestsSent.status": 1 });

userSchema.pre("validate", function (next) {
  if (this.isModified("userName")) {
    this.userNameNormalized = this.userName?.trim().toLowerCase();
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, env.saltRounds);
  next();
});

const UserModel = mongoose.model("User", userSchema);
export default UserModel;
