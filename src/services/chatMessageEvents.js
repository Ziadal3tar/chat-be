/**
 * Shared chat socket event names used by both the HTTP controller and Socket.IO layer.
 */
export const CHAT_SOCKET_EVENTS = Object.freeze({
  MESSAGE_RECEIVED: "receiveMessage",
  MESSAGE_UPDATED: "messageUpdated",
  MESSAGE_DELETED: "messageDeleted",
  MESSAGES_READ: "messagesRead",
  PRESENCE_CHANGED: "presenceChanged",
});
