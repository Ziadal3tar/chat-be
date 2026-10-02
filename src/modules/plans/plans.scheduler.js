import { Plan } from "../../../models/Plan.model.js";
import { executePlan } from "./plans.service.js";

let schedulerTimer = null;
let schedulerRunning = false;

const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

export const processDuePlans = async (io) => {
  if (schedulerRunning) return;
  schedulerRunning = true;

  try {
    await Plan.updateMany(
      {
        status: "processing",
        processingAt: {
          $lt: new Date(Date.now() - RECOVERY_WINDOW_MS),
        },
      },
      {
        $set: {
          status: "pending",
          processingAt: null,
        },
      }
    );

    while (true) {
      const plan = await Plan.findOneAndUpdate(
        {
          status: "pending",
          scheduledAt: { $lte: new Date() },
        },
        {
          $set: {
            status: "processing",
            processingAt: new Date(),
          },
        },
        {
          new: true,
          sort: { scheduledAt: 1, createdAt: 1 },
        }
      );

      if (!plan) break;

      try {
        await executePlan(plan, io);
      } catch (error) {
        plan.status = "failed";
        plan.errorMessage =
          error?.message || "The scheduled plan could not be executed.";
        plan.processingAt = null;
        await plan.save();

        console.error("Plan execution failed:", error);
      }
    }
  } finally {
    schedulerRunning = false;
  }
};

export const startPlanScheduler = (io, intervalMs = 15_000) => {
  if (schedulerTimer) return schedulerTimer;

  void processDuePlans(io);

  schedulerTimer = setInterval(() => {
    void processDuePlans(io);
  }, intervalMs);

  schedulerTimer.unref?.();

  return schedulerTimer;
};
