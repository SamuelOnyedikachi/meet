/**
 * Feature flags — set via env FEATURE_<ID>=0 to disable.
 * Example: FEATURE_CHAT=0 FEATURE_SCHEDULE=0
 */
function envFlag(name, defaultOn = true) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultOn;
  return !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase());
}

const features = {
  chat: envFlag('FEATURE_CHAT', true),
  reactions: envFlag('FEATURE_REACTIONS', true),
  mute: envFlag('FEATURE_MUTE', true),
  deviceIcons: envFlag('FEATURE_DEVICE_ICONS', true),
  schedule: envFlag('FEATURE_SCHEDULE', true),
  content: envFlag('FEATURE_CONTENT', false), // UI removed; handlers optional
};

module.exports = { features };
