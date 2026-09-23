/**
 * Feature: chat (Phase 1 — file boundary)
 * Runtime still driven from core/app.js until Phase 2 plugin register().
 * Message types: chat, chat-history
 */
(function (global) {
  global.MeetFeatures = global.MeetFeatures || {};
  global.MeetFeatures.chat = {
    id: 'chat',
    messageTypes: ['chat', 'chat-history'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
