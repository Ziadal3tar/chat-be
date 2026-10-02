export const USER_ROOM = (userId) => `user:${userId}`;

export const emitToUser = (io, userId, event, payload = {}) => {
  if (!io || !userId) return;
  io.to(USER_ROOM(userId.toString())).emit(event, payload);
};

export const emitToUsers = (io, userIds = [], event, payload = {}) => {
  const uniqueIds = [...new Set(userIds.filter(Boolean).map((id) => id.toString()))];
  for (const userId of uniqueIds) {
    emitToUser(io, userId, event, payload);
  }
};
