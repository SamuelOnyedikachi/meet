const { registerPlugin, loadAll } = require('./registry');
const chat = require('./chat');
const reactions = require('./reactions');
const mute = require('./mute');
const deviceIcons = require('./deviceIcons');
const content = require('./content');

function registerBuiltinPlugins() {
  registerPlugin(chat);
  registerPlugin(reactions);
  registerPlugin(mute);
  registerPlugin(deviceIcons);
  registerPlugin(content);
}

module.exports = {
  registerBuiltinPlugins,
  loadAll,
  registerPlugin,
};
