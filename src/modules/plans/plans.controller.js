import { asyncHandler } from "../../services/asyncHandler.js";
import {
  createPlan,
  listPlans,
  cancelPlan,
  searchPlanFriends,
} from "./plans.service.js";

export const create = asyncHandler(async (req, res) => {
  const plan = await createPlan({
    ownerId: req.userId,
    payload: req.body,
  });

  return res.status(201).json({
    success: true,
    message: "Plan created successfully",
    plan,
  });
});

export const searchFriends = asyncHandler(async (req, res) => {
  const friends = await searchPlanFriends(req.userId, req.query?.search);

  return res.json({
    success: true,
    friends,
  });
});

export const list = asyncHandler(async (req, res) => {
  const plans = await listPlans(req.userId, req.query?.status);

  return res.json({
    success: true,
    plans,
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const plan = await cancelPlan(req.userId, req.params.id);

  return res.json({
    success: true,
    message: "Plan cancelled successfully",
    plan,
  });
});
