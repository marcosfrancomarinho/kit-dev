const { spawn } = require('child_process');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(options.errorMessage + ' Exit code: ' + code + '.'));
    });
  });
}

module.exports = { runCommand };
