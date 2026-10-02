import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { uploadStoryFile } from "../../middleware/uploads.js";
import * as storiesController from "./stories.controller.js";

const router = Router();
router.use(authMiddleware);
router.get("/", storiesController.list);
router.post("/", uploadStoryFile.single("file"), storiesController.create);
router.post("/:id/view", storiesController.view);
router.delete("/:id", storiesController.remove);

export default router;
