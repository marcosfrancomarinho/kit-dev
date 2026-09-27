const { createInterface } = require('readline');
const { Terminal } = require('../../application/ports/terminal');

class TerminalPalette {
  constructor() {
    this.reset = '\x1b[0m';
    this.bold = '\x1b[1m';
    this.cyan = '\x1b[36m';
    this.green = '\x1b[32m';
    this.yellow = '\x1b[33m';
    this.red = '\x1b[31m';
    this.magenta = '\x1b[35m';
    this.gray = '\x1b[90m';
  }

  paint(color, message) {
    return color + message + this.reset;
  }
}

class TerminalAdapter extends Terminal {
  constructor(palette = new TerminalPalette()) {
    super();
    this.palette = palette;
  }

  ask(query) {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      readline.question(this.palette.paint(this.palette.cyan, query), (answer) => {
        readline.close();
        resolve(answer);
      });
    });
  }

  info(message) {
    console.log(this.palette.paint(this.palette.magenta, message));
  }

  success(message) {
    console.log(this.palette.paint(this.palette.green, message));
  }

  error(message) {
    console.error(
      this.palette.paint(this.palette.red, '❌ Error:') + ' ' + message,
    );
  }

  showFinalInstructions(projectName, runCommand) {
    console.log(
      '\n' +
        this.palette.paint(
          this.palette.green,
          `✅ Project "${projectName}" created successfully!`,
        ) +
        '\n\n📂 To get started:\n  ' +
        this.palette.paint(this.palette.bold, `cd ${projectName}`) +
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

  formatCommand(runCommand, command, description) {
    const spacing = ' '.repeat(Math.max(1, 10 - command.length));

    return (
      this.palette.paint(this.palette.yellow, `${runCommand} ${command}`) +
      spacing +
      this.palette.paint(this.palette.gray, `# ${description}`)
    );
  }
}

module.exports = {
  TerminalAdapter,
  TerminalPalette,
};
