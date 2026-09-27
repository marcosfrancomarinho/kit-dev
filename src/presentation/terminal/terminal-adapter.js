const { createInterface } = require('readline');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function colorize(color, message) {
  return color + message + colors.reset;
}

function createTerminalAdapter() {
  return {
    ask(query) {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise((resolve) => {
        readline.question(colorize(colors.cyan, query), (answer) => {
          readline.close();
          resolve(answer);
        });
      });
    },

    info(message) {
      console.log(colorize(colors.magenta, message));
    },

    success(message) {
      console.log(colorize(colors.green, message));
    },

    error(message) {
      console.error(colorize(colors.red, '❌ Error:') + ' ' + message);
    },

    showFinalInstructions(projectName, runCommand) {
      console.log(
        '\n' +
          colorize(colors.green, `✅ Project "${projectName}" created successfully!`) +
          '\n\n📂 To get started:\n  ' +
          colorize(colors.bold, `cd ${projectName}`) +
          '\n\n🚀 Available commands:\n  ' +
          formatCommand(runCommand, 'dev', 'Start development server') +
          '\n  ' +
          formatCommand(runCommand, 'test', 'Run tests in watch mode') +
          '\n  ' +
          formatCommand(runCommand, 'build', 'Build the project') +
          '\n  ' +
          formatCommand(runCommand, 'start', 'Run bundled output') +
          '\n  ' +
          formatCommand(runCommand, 'type', 'Check TypeScript types') +
          '\n  ' +
          formatCommand(runCommand, 'di', 'Add optional dependency injection') +
          '\n',
      );
    },
  };
}

function formatCommand(runCommand, command, description) {
  const spacing = ' '.repeat(Math.max(1, 10 - command.length));

  return (
    colorize(colors.yellow, `${runCommand} ${command}`) +
    spacing +
    colorize(colors.gray, `# ${description}`)
  );
}

module.exports = {
  colors,
  createTerminalAdapter,
};
