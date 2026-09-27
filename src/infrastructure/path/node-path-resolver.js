const path = require('path');
const { PathResolver } = require('../../application/ports/path-resolver');

class NodePathResolver extends PathResolver {
  resolve(...parts) {
    return path.join(...parts);
  }
}

module.exports = { NodePathResolver };
