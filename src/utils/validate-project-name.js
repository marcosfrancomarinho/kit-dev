function validateProjectName(name) {
  const invalidPattern = /[<>:"/\\|?*\x00-\x1F]/g;
  const isReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

  if (!name || invalidPattern.test(name) || isReserved.test(name) || name.length > 255) {
    throw new Error('❌ Invalid project name.');
  }
}

module.exports = { validateProjectName };
