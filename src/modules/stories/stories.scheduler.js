import { purgeExpiredStories } from "./stories.service.js";

let timer = null;

export const startStoryScheduler = (intervalMs = 60 * 60 * 1000) => {
  if (timer) return timer;
  void purgeExpiredStories();
  timer = setInterval(() => void purgeExpiredStories(), intervalMs);
  timer.unref?.();
  return timer;
};
