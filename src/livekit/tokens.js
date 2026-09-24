const { AccessToken } = require('livekit-server-sdk');
const config = require('../config');

/**
 * Create a LiveKit access token with grants derived from Meet permissions.
 * @param {string} identity
 * @param {string} name
 * @param {string} roomName
 * @param {object} [opts]
 * @param {boolean} [opts.canPublish] - mic/cam/screen
 * @param {boolean} [opts.canSubscribe]
 * @param {boolean} [opts.canPublishData] - chat / data channel
 * @param {string[]} [opts.canPublishSources] - optional source list when SDK supports it
 */
async function createLiveKitToken(identity, name, roomName, opts = {}) {
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

  const canPublish = opts.canPublish !== false;
  const canSubscribe = opts.canSubscribe !== false;
  const canPublishData = opts.canPublishData !== false;

  const grant = {
    roomJoin: true,
    room: String(roomName),
    canPublish,
    canSubscribe,
    canPublishData,
  };

  // Newer livekit-server-sdk supports canPublishSources; ignore if unsupported at runtime
  if (Array.isArray(opts.canPublishSources) && opts.canPublishSources.length) {
    grant.canPublishSources = opts.canPublishSources;
  }

  at.addGrant(grant);
  return await at.toJwt();
}

/**
 * Map Meet permission object → LiveKit grant flags.
 */
function grantsFromPermissions(perms = {}) {
  const canPublish =
    !!perms.microphone || !!perms.camera || !!perms.screenShare;
  const canPublishData = !!perms.chat || !!perms.reactions;
  const sources = [];
  if (perms.microphone) sources.push('microphone');
  if (perms.camera) sources.push('camera');
  if (perms.screenShare) sources.push('screen_share');
  return {
    canPublish,
    canSubscribe: true,
    canPublishData,
    canPublishSources: sources.length ? sources : undefined,
  };
}

function isLiveKitConfigured() {
  return !!(config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET);
}

module.exports = {
  createLiveKitToken,
  grantsFromPermissions,
  isLiveKitConfigured,
};
