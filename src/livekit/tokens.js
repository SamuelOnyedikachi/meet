const { AccessToken } = require('livekit-server-sdk');
const config = require('../config');

async function createLiveKitToken(identity, name, roomName) {
  if (!config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) {
    throw new Error(
      'LiveKit is not configured on the server (missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET)'
    );
  }
  const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: String(identity),
    name: String(name || identity),
    ttl: '6h',
  });
  at.addGrant({
    roomJoin: true,
    room: String(roomName),
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return await at.toJwt();
}

function isLiveKitConfigured() {
  return !!(config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET);
}

module.exports = {
  createLiveKitToken,
  isLiveKitConfigured,
};
