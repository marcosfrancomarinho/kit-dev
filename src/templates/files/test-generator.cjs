const { access, mkdir, readdir, readFile, writeFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } = require('node:path');

const extensions = ['.ts', '.tsx', '.mts', '.cts'];
const factories = new Set(['create', 'from', 'of', 'build', 'make']);

async function generateTest(target, projectRoot = process.cwd()) {
  const sourcePath = await resolveSourceFile(projectRoot, target);
  const source = await readFile(sourcePath, 'utf8');
  const metadata = analyzeClass(source);
  if (!metadata) throw new Error('No class was found in ' + relative(projectRoot, sourcePath) + '.');
  if (metadata.abstract) throw new Error(metadata.className + ' is abstract. Test a concrete implementation instead.');

  const destinationPath = testPath(projectRoot, sourcePath);
  const content = render({ ...metadata, importPath: importPath(destinationPath, sourcePath) });
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, content, 'utf8');
  return { sourcePath, destinationPath, metadata };
}

function analyzeClass(source) {
  const pattern = /\b(export\s+(?:default\s+)?)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g;
  let first, chosen, match;
  while ((match = pattern.exec(source))) {
    const item = { index: match.index, end: pattern.lastIndex, exported: !!match[1], abstract: !!match[2], className: match[3] };
    first ||= item;
    if (item.exported) { chosen = item; break; }
  }
  chosen ||= first;
  if (!chosen) return null;

  const open = source.indexOf('{', chosen.end);
  if (open < 0) return null;
  const close = matching(source, open, '{', '}');
  if (close < 0) return null;
  const body = source.slice(open + 1, close);
  const exportedTypes = exportedTypeNames(source);
  const members = membersOf(body);
  const ctor = members.find((m) => m.name === 'constructor');
  const constructorParameters = paramsOf(ctor?.parameters || '');
  const constructorPrivate = !!ctor && (ctor.modifiers.has('private') || ctor.modifiers.has('protected'));
  const dependencyMethods = new Map(constructorParameters.map((p) => [p.name, callsOf(body, p.name)]));
  const methods = members.filter((m) => m.name !== 'constructor' && !m.modifiers.has('private') && !m.modifiers.has('protected'));
  const factory = constructorPrivate
    ? methods.find((m) => m.modifiers.has('static') && factories.has(m.name))
    : null;
  if (constructorPrivate && !factory) throw new Error(chosen.className + ' has a non-public constructor and no create/from/of/build/make factory.');

  return {
    className: chosen.className,
    exportedTypes,
    abstract: chosen.abstract,
    constructorParameters,
    dependencyMethods,
    factory,
    methods: methods.filter((m) => m !== factory),
  };
}


function exportedTypeNames(source) {
  const names = new Set();
  const pattern = /\bexport\s+(?:default\s+)?(?:(?:abstract\s+)?class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  let match;
  while ((match = pattern.exec(source))) names.add(match[1]);
  return names;
}

function directTypeName(parameter, meta) {
  const type = parameter.type.trim();
  return /^[A-Za-z_$][\w$]*$/.test(type) &&
    type !== meta.className &&
    meta.exportedTypes.has(type)
    ? type
    : null;
}

function directTypeImports(meta) {
  const parameters = meta.factory
    ? paramsOf(meta.factory.parameters)
    : meta.constructorParameters;
  return [...new Set(
    parameters
      .map((parameter) => directTypeName(parameter, meta))
      .filter(Boolean),
  )].sort();
}

function membersOf(body) {
  const result = [];
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const skipped = skip(body, i);
    if (skipped !== i) { i = skipped - 1; continue; }
    if (body[i] === '{') { depth += 1; continue; }
    if (body[i] === '}') { depth = Math.max(0, depth - 1); continue; }
    if (depth || !/[A-Za-z_$]/.test(body[i])) continue;

    const found = body.slice(i).match(/^((?:(?:public|private|protected|static|async|override|readonly|declare|abstract)\s+)*)((?:constructor)|(?:[A-Za-z_$][\w$]*))\s*(?:<[^>{};()]*>)?\s*\(/);
    if (!found) continue;
    const modifiers = new Set(found[1].trim().split(/\s+/).filter(Boolean));
    const open = i + found[0].lastIndexOf('(');
    const close = matching(body, open, '(', ')');
    if (close < 0) continue;
    result.push({ name: found[2], modifiers, async: modifiers.has('async'), parameters: body.slice(open + 1, close) });
    const brace = body.indexOf('{', close);
    const semi = body.indexOf(';', close);
    if (brace >= 0 && (semi < 0 || brace < semi)) {
      const end = matching(body, brace, '{', '}');
      if (end >= 0) i = end;
    } else if (semi >= 0) i = semi;
  }
  return result;
}

function paramsOf(text) {
  return split(text).map((part, index) => {
    let value = part.trim().replace(/^(?:(?:public|private|protected|readonly|override)\s+)+/, '');
    if (!value) return null;
    const equal = topLevel(value, '=');
    const defaulted = equal >= 0;
    if (defaulted) value = value.slice(0, equal).trim();
    const colon = topLevel(value, ':');
    const left = (colon < 0 ? value : value.slice(0, colon)).trim();
    const type = (colon < 0 ? 'unknown' : value.slice(colon + 1)).trim();
    const match = left.match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)(\?)?$/);
    return { name: match?.[1] || 'arg' + (index + 1), type, optional: !!match?.[2] || defaulted, index };
  }).filter(Boolean);
}

function render(meta) {
  const typeImports = directTypeImports(meta);
  const out = [
    "import { describe, it, mock } from 'node:test';",
    '',
    `import { ${meta.className} } from '${meta.importPath}';`,
  ];
  if (typeImports.length) {
    out.push(`import type { ${typeImports.join(', ')} } from '${meta.importPath}';`);
  }
  out.push(
    '',
    `describe('${meta.className}', () => {`,
  );
  const methods = meta.methods.length ? meta.methods : [{ name: 'create', modifiers: new Set(), async: false, parameters: '', synthetic: true }];

  methods.forEach((method, index) => {
    if (index) out.push('');
    const isStatic = method.modifiers.has('static');
    const setup = isStatic ? { lines: [], async: false } : subject(meta);
    out.push(`  it('should ${words(method.name)}', ${method.async || setup.async ? 'async ' : ''}() => {`);
    out.push(...setup.lines);
    if (method.synthetic) {
      out.push('    void sut;');
    } else {
      const target = isStatic ? meta.className : 'sut';
      const args = methodArgs(method, target);
      out.push(...args.lines);
      out.push(`    const result = ${method.async ? 'await ' : ''}${target}.${method.name}(${args.names.join(', ')});`);
      out.push('    void result;');
    }
    out.push('    // TODO: add the expected assertion.');
    out.push('  });');
  });
  out.push('});', '');
  return out.join('\n');
}

function subject(meta) {
  const factory = meta.factory;
  const parameters = factory ? paramsOf(factory.parameters) : meta.constructorParameters;
  const lines = [], names = [];
  const setups = parameters.map((p) => {
    const fallbackType = factory ? `Parameters<typeof ${meta.className}.${factory.name}>[${p.index}]` : `ConstructorParameters<typeof ${meta.className}>[${p.index}]`;
    const type = directTypeName(p, meta) || fallbackType;
    const methods = meta.dependencyMethods.get(p.name) || [];
    return { parameter: p, type, methods };
  });

  for (const setup of setups) {
    for (const method of setup.methods) {
      lines.push(`    const ${mockName(setup.parameter.name, method)} = mock.fn(() => undefined);`);
    }
  }

  if (setups.some((setup) => setup.methods.length)) lines.push('');

  for (const setup of setups) {
    const p = setup.parameter;
    if (setup.methods.length) {
      const properties = setup.methods
        .map((method) => `${method}: ${mockName(p.name, method)}`)
        .join(', ');
      lines.push(`    const ${p.name} = { ${properties} } as unknown as ${setup.type};`);
    } else {
      lines.push(`    const ${p.name} = ${valueFor(p, setup.type)};`);
    }
    names.push(p.name);
  }

  if (parameters.length) lines.push('');
  lines.push(`    const sut = ${factory?.async ? 'await ' : ''}${factory ? `${meta.className}.${factory.name}` : `new ${meta.className}`}(${names.join(', ')});`, '');
  return { lines, async: !!factory?.async };
}

function mockName(parameterName, methodName) {
  return parameterName + methodName[0].toUpperCase() + methodName.slice(1) + 'Mock';
}

function methodArgs(method, target) {
  const lines = [], names = [];
  paramsOf(method.parameters).forEach((p) => {
    let name = p.name;
    while (names.includes(name)) name += '2';
    lines.push(`    const ${name} = ${valueFor(p, `Parameters<typeof ${target}.${method.name}>[${p.index}]`)};`);
    names.push(name);
  });
  if (names.length) lines.push('');
  return { lines, names };
}

function valueFor(p, typeRef, methods = []) {
  if (p.optional) return 'undefined';
  const type = p.type.replace(/\s+/g, ' ').trim();
  if (type === 'string') return "'value'";
  if (type === 'number') return '1';
  if (type === 'boolean') return 'true';
  if (type === 'bigint') return '1n';
  if (type === 'Date') return 'new Date()';
  if (type === 'unknown' || type === 'any') return 'undefined';
  if (/\bnull\b/.test(type)) return 'null';
  if (/\[\]$/.test(type) || /^(?:Readonly)?Array\s*</.test(type)) return '[]';
  return `undefined as unknown as ${typeRef}`;
}

function callsOf(body, name) {
  const result = new Set();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('\\bthis\\.' + escaped + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
  let match;
  while ((match = pattern.exec(body))) result.add(match[1]);
  return [...result].sort();
}

function words(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
}

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

function split(source) {
  const parts = [];
  let start = 0, round = 0, square = 0, curly = 0, angle = 0;
  for (let i = 0; i < source.length; i += 1) {
    const s = skip(source, i); if (s !== i) { i = s - 1; continue; }
    const c = source[i];
    if (c === '(') round++; else if (c === ')') round--;
    else if (c === '[') square++; else if (c === ']') square--;
    else if (c === '{') curly++; else if (c === '}') curly--;
    else if (c === '<') angle++; else if (c === '>') angle--;
    else if (c === ',' && !round && !square && !curly && !angle) { parts.push(source.slice(start, i)); start = i + 1; }
  }
  parts.push(source.slice(start));
  return parts;
}

function topLevel(source, wanted) {
  let round = 0, square = 0, curly = 0, angle = 0;
  for (let i = 0; i < source.length; i += 1) {
    const s = skip(source, i); if (s !== i) { i = s - 1; continue; }
    const c = source[i];
    if (c === '(') round++; else if (c === ')') round--;
    else if (c === '[') square++; else if (c === ']') square--;
    else if (c === '{') curly++; else if (c === '}') curly--;
    else if (c === '<') angle++; else if (c === '>') angle--;
    else if (c === wanted && !round && !square && !curly && !angle) return i;
  }
  return -1;
}

function matching(source, start, open, close) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const s = skip(source, i); if (s !== i) { i = s - 1; continue; }
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) return i;
  }
  return -1;
}

function skip(source, index) {
  const c = source[index], n = source[index + 1];
  if (c === '/' && n === '/') { const end = source.indexOf('\n', index + 2); return end < 0 ? source.length : end + 1; }
  if (c === '/' && n === '*') { const end = source.indexOf('*/', index + 2); return end < 0 ? source.length : end + 2; }
  if (c !== "'" && c !== '"' && c !== '`') return index;
  let escaped = false;
  for (let i = index + 1; i < source.length; i += 1) {
    if (escaped) { escaped = false; continue; }
    if (source[i] === '\\') { escaped = true; continue; }
    if (source[i] === c) return i + 1;
  }
  return source.length;
}

module.exports = { generateTest };
