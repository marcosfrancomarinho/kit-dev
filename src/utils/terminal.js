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

function askQuestion(query) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(colors.cyan + query + colors.reset, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function showFinalInstructions(projectName, runCommand) {
  console.log(
    '\n' +
      colors.green +
      '✅ Project "' +
      projectName +
      '" created successfully!' +
      colors.reset +
      '\n\n📂 To get started:\n  ' +
      colors.bold +
      'cd ' +
      projectName +
      colors.reset +
      '\n\n🚀 Available commands:\n  ' +
      colors.yellow +
      runCommand +
      ' dev' +
      colors.reset +
      '       ' +
      colors.gray +
      '# Start development server' +
      colors.reset +
      '\n  ' +
      colors.yellow +
      runCommand +
      ' build' +
      colors.reset +
      '     ' +
      colors.gray +
      '# Build the project' +
      colors.reset +
      '\n  ' +
      colors.yellow +
      runCommand +
      ' start' +
      colors.reset +
      '     ' +
      colors.gray +
      '# Run bundled output' +
      colors.reset +
      '\n  ' +
      colors.yellow +
      runCommand +
      ' type' +
      colors.reset +
      '      ' +
      colors.gray +
      '# Check TypeScript types' +
      colors.reset +
      '\n',
  );
}

module.exports = {
  askQuestion,
  colors,
  showFinalInstructions,
};
