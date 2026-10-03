import "./src/config/env.js";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";

import env from "./src/config/env.js";
import * as indexRouter from "./src/modules/index.routes.js";
import connection from "./db/connection.js";
import { globalError } from "./src/services/asyncHandler.js";
import { initializeSocket } from "./src/socket/socket.server.js";
import { securityHeaders } from "./src/middleware/security.js";
import { createRateLimiter } from "./src/middleware/rateLimit.js";
import plansRouter from "./src/modules/plans/plans.routes.js";
import { startPlanScheduler } from "./src/modules/plans/plans.scheduler.js";
import storiesRouter from "./src/modules/stories/stories.routes.js";
import { startStoryScheduler } from "./src/modules/stories/stories.scheduler.js";

const app = express();
const server = http.createServer(app);

mongoose.set("bufferCommands", false);

const defaultCorsOrigins = [
  "http://localhost:4200",
  "https://ziadal3tar.github.io/chat-fe",
  "https://ziadal3tar.github.io",
];

const allowedOrigins = env.corsOrigins.length ? env.corsOrigins : defaultCorsOrigins;

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin is not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: env.jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.urlEncodedBodyLimit }));

app.get("/ping", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "pong",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.apiRateLimit,
  message: "Too many API requests. Please slow down and try again later.",
});
app.use("/api", apiRateLimiter);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
});

app.set("io", io);
initializeSocket(io);

app.use("/api/auth", indexRouter.authRouter);
app.use("/api/user", indexRouter.userRouter);
app.use("/api/chat", indexRouter.chatRouter);
app.use("/api/friends", indexRouter.friendsRouter);
app.use("/api/notifications", indexRouter.notificationsRouter);
app.use("/api/plans", plansRouter);
app.use("/api/stories", storiesRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(globalError);

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down...`);

  server.close(async (serverError) => {
    if (serverError) {
      console.error("HTTP shutdown error:", serverError);
      process.exit(1);
      return;
    }

    try {
      await mongoose.connection.close(false);
      console.log("MongoDB connection closed");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

connection()
  .then(() => {
    console.log("✅ MongoDB connected");
    startPlanScheduler(io);
    startStoryScheduler();
    server.listen(env.port, () => {
      console.log(`🚀 Server running on port ${env.port}`);
    });
  })
  .catch((error) => {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  });
