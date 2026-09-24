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
  content: envFlag('FEATURE_CONTENT', false),
  moderation: envFlag('FEATURE_MODERATION', true),
  waitingRoom: envFlag('FEATURE_WAITING_ROOM', true),
  raisedHand: envFlag('FEATURE_RAISED_HAND', true),
  activity: envFlag('FEATURE_ACTIVITY', true),
  recording: envFlag('FEATURE_RECORDING', true),
  templates: envFlag('FEATURE_TEMPLATES', true),
  diagnostics: envFlag('FEATURE_DIAGNOSTICS', true),
};

module.exports = { features };
