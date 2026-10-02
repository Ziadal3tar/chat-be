import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import * as plansController from "./plans.controller.js";

const router = Router();

router.use(authMiddleware);

router.post("/", plansController.create);
router.get("/friends", plansController.searchFriends);
router.get("/", plansController.list);
router.delete("/:id", plansController.cancel);

export default router;
