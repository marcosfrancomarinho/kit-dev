const INVALID_NAME_PATTERN = /[<>:"/\\|?*\x00-\x1F]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_PROJECT_NAME_LENGTH = 255;

function createProjectName(value) {
  const name = String(value ?? '').trim();

  if (
    !name ||
    name.length > MAX_PROJECT_NAME_LENGTH ||
    INVALID_NAME_PATTERN.test(name) ||
    RESERVED_WINDOWS_NAMES.test(name)
  ) {
    throw new Error('❌ Invalid project name.');
  }

  return name;
}

module.exports = { createProjectName };
