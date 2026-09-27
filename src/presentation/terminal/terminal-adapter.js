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

class TerminalAdapter {
  ask(query) {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      readline.question(this.colorize(colors.cyan, query), (answer) => {
        readline.close();
        resolve(answer);
      });
    });
  }

  info(message) {
    console.log(this.colorize(colors.magenta, message));
  }

  success(message) {
    console.log(this.colorize(colors.green, message));
  }

  error(message) {
    console.error(this.colorize(colors.red, '❌ Error:') + ' ' + message);
  }

  showFinalInstructions(projectName, runCommand) {
    console.log(
      '\n' +
        this.colorize(colors.green, `✅ Project "${projectName}" created successfully!`) +
        '\n\n📂 To get started:\n  ' +
        this.colorize(colors.bold, `cd ${projectName}`) +
        '\n\n🚀 Available commands:\n  ' +
        this.formatCommand(runCommand, 'dev', 'Start development server') +
        '\n  ' +
        this.formatCommand(runCommand, 'test', 'Run tests in watch mode') +
        '\n  ' +
        this.formatCommand(runCommand, 'build', 'Build the project') +
        '\n  ' +
        this.formatCommand(runCommand, 'start', 'Run bundled output') +
        '\n  ' +
        this.formatCommand(runCommand, 'type', 'Check TypeScript types') +
        '\n  ' +
        this.formatCommand(runCommand, 'di', 'Add optional dependency injection') +
        '\n',
    );
  }

  colorize(color, message) {
    return color + message + colors.reset;
  }

  formatCommand(runCommand, command, description) {
    const spacing = ' '.repeat(Math.max(1, 10 - command.length));

    return (
      this.colorize(colors.yellow, `${runCommand} ${command}`) +
      spacing +
      this.colorize(colors.gray, `# ${description}`)
    );
  }
}

function createTerminalAdapter() {
  return new TerminalAdapter();
}

module.exports = {
  TerminalAdapter,
  colors,
  createTerminalAdapter,
};
