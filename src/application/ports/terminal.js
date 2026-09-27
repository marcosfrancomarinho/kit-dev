class Terminal {
  ask() {
    throw new Error('Terminal.ask() must be implemented.');
  }

  info() {
    throw new Error('Terminal.info() must be implemented.');
  }

  success() {
    throw new Error('Terminal.success() must be implemented.');
  }

  error() {
    throw new Error('Terminal.error() must be implemented.');
  }

  showFinalInstructions() {
    throw new Error('Terminal.showFinalInstructions() must be implemented.');
  }
}

module.exports = { Terminal };
