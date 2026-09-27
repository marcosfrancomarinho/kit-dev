class PackageInstaller {
  async install() {
    throw new Error('PackageInstaller.install() must be implemented.');
  }

  getRunCommand() {
    throw new Error('PackageInstaller.getRunCommand() must be implemented.');
  }
}

module.exports = { PackageInstaller };
