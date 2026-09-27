const { createProjectName } = require('../domain/project/project-name');

function validateProjectName(name) {
  createProjectName(name);
}

module.exports = { validateProjectName };
