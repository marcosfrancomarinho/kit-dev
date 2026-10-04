const { access, readdir } = require('node:fs/promises');
const { constants } = require('node:fs');
const { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } = require('node:path');

const extensions = ['.ts', '.tsx', '.mts', '.cts'];

async function resolveSourceFile(projectRoot, target) {
  const src = join(projectRoot, 'src');
  const bases = [isAbsolute(target) ? target : resolve(projectRoot, target), isAbsolute(target) ? target : resolve(src, target)];
  for (const base of bases) {
    for (const candidate of [base, ...(!extname(base) ? extensions.map((ext) => base + ext) : [])]) {
      if (await exists(candidate)) { inside(src, candidate); return resolve(candidate); }
    }
  }
  const files = await collect(src);
  const name = basename(target, extname(target)).toLowerCase();
  const matches = files.filter((file) => basename(file, extname(file)).toLowerCase() === name);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error('More than one source file matches "' + target + '". Use a path.');
  throw new Error('Source file not found: ' + target);
}

async function collect(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && extensions.includes(extname(entry.name))) files.push(path);
  }
  return files;
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function testPath(projectRoot, sourcePath) {
  const src = join(projectRoot, 'src');
  inside(src, sourcePath);
  const rel = relative(src, sourcePath);
  return join(projectRoot, 'test', rel.slice(0, -extname(rel).length) + '.test.ts');
}

function importPath(destinationPath, sourcePath) {
  let path = relative(dirname(destinationPath), sourcePath).replace(/\\/g, '/').replace(/\.(?:tsx?|mts|cts)$/i, '.js');
  return path.startsWith('.') ? path : './' + path;
}

function inside(root, candidate) {
  const a = resolve(root), b = resolve(candidate);
  if (b !== a && !b.startsWith(a + sep)) throw new Error('Tests can only be generated from files inside src/.');
}

module.exports = { importPath, resolveSourceFile, testPath };
