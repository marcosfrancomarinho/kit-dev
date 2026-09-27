const {
  createCommandRunner,
} = require('../infrastructure/process/command-runner');

function runCommand(command, args, options) {
  return createCommandRunner().run(command, args, options);
}

module.exports = { runCommand };
