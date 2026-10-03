const { access, mkdir, readdir, readFile, writeFile } = require('node:fs/promises');
const { constants, existsSync, readFileSync } = require('node:fs');
const { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } = require('node:path');

const extensions = ['.ts', '.tsx', '.mts', '.cts'];
const factories = new Set(['create', 'from', 'of', 'build', 'make']);
const maxGeneratedObjectDepth = 3;

async function generateTest(target, projectRoot = process.cwd()) {
  const sourcePath = await resolveSourceFile(projectRoot, target);
  const source = await readFile(sourcePath, 'utf8');
  const metadata = analyzeClass(source);
  if (!metadata) throw new Error('No class was found in ' + relative(projectRoot, sourcePath) + '.');
  if (metadata.abstract) throw new Error(metadata.className + ' is abstract. Test a concrete implementation instead.');

  const destinationPath = testPath(projectRoot, sourcePath);
  const content = render({
    ...metadata,
    source,
    sourcePath,
    projectRoot,
    destinationPath,
    extraImports: new Set(),
    sourceCache: new Map([[sourcePath, source]]),
    declarationCache: new Map(),
    importPath: importPath(destinationPath, sourcePath),
  });
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
      const args = methodArgs(method, target, meta);
      out.push(...args.lines);
      out.push(`    const result = ${method.async ? 'await ' : ''}${target}.${method.name}(${args.names.join(', ')});`);
      out.push('    void result;');
    }
    out.push('    // TODO: add the expected assertion.');
    out.push('  });');
  });
  if (meta.extraImports.size) {
    const insertAt = typeImports.length ? 4 : 3;
    out.splice(insertAt, 0, ...[...meta.extraImports].sort());
  }
  out.push('});', '');
  return out.join('\n');
}

function subject(meta) {
  const factory = meta.factory;
  const parameters = factory ? paramsOf(factory.parameters) : meta.constructorParameters;
  const lines = [], names = [];
  const setups = parameters.map((parameter) => {
    const fallbackType = factory
      ? `Parameters<typeof ${meta.className}.${factory.name}>[${parameter.index}]`
      : `ConstructorParameters<typeof ${meta.className}>[${parameter.index}]`;
    const typeName = simpleTypeName(parameter.type);
    const declaration = typeName
      ? resolveSimpleDeclaration(typeName, meta)
      : null;
    const concreteClass =
      declaration?.kind === 'class' && !declaration.abstract;
    const methods = concreteClass
      ? []
      : meta.dependencyMethods.get(parameter.name) || [];

    return { parameter, fallbackType, typeName, declaration, methods };
  });

  for (const setup of setups) {
    for (const method of setup.methods) {
      const returnType = methodReturnType(
        setup.parameter.type,
        method,
        meta,
      );
      lines.push(
        `    const ${mockName(setup.parameter.name, method)} = mock.fn(${mockImplementation(returnType)});`,
      );
    }
  }

  if (setups.some((setup) => setup.methods.length)) lines.push('');

  for (const setup of setups) {
    const parameter = setup.parameter;

    if (setup.methods.length) {
      const properties = setup.methods
        .map((method) => `${method}: ${mockName(parameter.name, method)}`)
        .join(', ');
      const type = mockTypeReference(
        parameter,
        setup.fallbackType,
        meta,
      );

      lines.push(
        `    const ${parameter.name} = { ${properties} } as unknown as ${type};`,
      );
    } else {
      lines.push(
        `    const ${parameter.name} = ${valueFor(parameter, setup.fallbackType, meta)};`,
      );
    }

    names.push(parameter.name);
  }

  if (parameters.length) lines.push('');
  lines.push(
    `    const sut = ${factory?.async ? 'await ' : ''}${factory ? `${meta.className}.${factory.name}` : `new ${meta.className}`}(${names.join(', ')});`,
    '',
  );

  return { lines, async: !!factory?.async };
}

function mockTypeReference(parameter, fallbackType, meta) {
  const typeName = simpleTypeName(parameter.type);
  if (!typeName) return fallbackType;

  if (meta.exportedTypes.has(typeName)) return typeName;

  const imported = importedType(meta.source, typeName);
  if (!imported || !imported.specifier.startsWith('.')) return fallbackType;

  const resolvedFile = resolveImportedSource(meta.sourcePath, imported.specifier);
  if (!resolvedFile) return fallbackType;

  const generatedPath = importPath(meta.destinationPath, resolvedFile);
  const importedName =
    imported.exportedName === typeName
      ? typeName
      : `${imported.exportedName} as ${typeName}`;

  meta.extraImports.add(
    imported.default
      ? `import type ${typeName} from '${generatedPath}';`
      : `import type { ${importedName} } from '${generatedPath}';`,
  );

  return typeName;
}

function mockName(parameterName, methodName) {
  return parameterName + methodName[0].toUpperCase() + methodName.slice(1) + 'Mock';
}

function methodArgs(method, target, meta) {
  const lines = [], names = [];
  paramsOf(method.parameters).forEach((p) => {
    let name = p.name;
    while (names.includes(name)) name += '2';
    lines.push(
      `    const ${name} = ${valueFor(
        p,
        `Parameters<typeof ${target}.${method.name}>[${p.index}]`,
        meta,
      )};`,
    );
    names.push(name);
  });
  if (names.length) lines.push('');
  return { lines, names };
}

function valueFor(parameter, typeRef, meta, depth = 0, resolving = new Set()) {
  if (parameter.optional) return 'undefined';

  const simple = primitiveValue(parameter.type);
  if (simple !== null) return simple;

  if (depth >= maxGeneratedObjectDepth) {
    return fallbackValue(typeRef, depth);
  }

  const inlineProperties = inlineObjectProperties(parameter.type);
  if (inlineProperties) {
    return objectValue(inlineProperties, meta, depth, resolving);
  }

  const typeName = simpleTypeName(parameter.type);
  if (!typeName || resolving.has(typeName)) {
    return fallbackValue(typeRef, depth);
  }

  const declaration = resolveSimpleDeclaration(typeName, meta);
  if (!declaration) return fallbackValue(typeRef, depth);

  const next = new Set(resolving);
  next.add(typeName);

  if (declaration.kind === 'class') {
    if (declaration.abstract || declaration.factory?.async) {
      return fallbackValue(typeRef, depth);
    }

    if (declaration.importLine) meta.extraImports.add(declaration.importLine);

    const parameters = declaration.factory
      ? paramsOf(declaration.factory.parameters)
      : declaration.constructorParameters;
    const values = parameters.map((child) => {
      const fallback = declaration.factory
        ? `Parameters<typeof ${declaration.name}.${declaration.factory.name}>[${child.index}]`
        : `ConstructorParameters<typeof ${declaration.name}>[${child.index}]`;

      return valueFor(child, fallback, declaration.meta, depth + 1, next);
    });
    const create = declaration.factory
      ? `${declaration.name}.${declaration.factory.name}`
      : `new ${declaration.name}`;

    return `${create}(${values.join(', ')})`;
  }

  if (declaration.kind === 'object') {
    return objectValue(
      declaration.properties,
      declaration.meta,
      depth,
      next,
    );
  }

  return fallbackValue(typeRef, depth);
}

function objectValue(properties, meta, depth, resolving) {
  const values = properties
    .filter((property) => !property.optional)
    .map(
      (property) =>
        `${property.name}: ${valueFor(
          property,
          property.type,
          meta,
          depth + 1,
          resolving,
        )}`,
    );

  return values.length ? `{ ${values.join(', ')} }` : '{}';
}

function inlineObjectProperties(typeText) {
  const type = String(typeText || '').trim();
  if (!type.startsWith('{') || !type.endsWith('}')) return null;
  return objectProperties(type.slice(1, -1));
}

function fallbackValue(typeRef, depth) {
  return depth > 0
    ? 'undefined as never'
    : `undefined as unknown as ${typeRef}`;
}

function primitiveValue(typeText) {
  const type = String(typeText || '').replace(/\s+/g, ' ').trim();
  if (type === 'string') return "'value'";
  if (type === 'number') return '1';
  if (type === 'boolean') return 'true';
  if (type === 'bigint') return '1n';
  if (type === 'Date') return 'new Date()';
  if (type === 'unknown' || type === 'any' || type === 'void') return 'undefined';
  if (/\bnull\b/.test(type)) return 'null';
  if (/\[\]$/.test(type) || /^(?:Readonly)?Array\s*</.test(type)) return '[]';
  return null;
}

function simpleTypeName(typeText) {
  const type = String(typeText || '').trim();
  return /^[A-Za-z_$][\w$]*$/.test(type) ? type : null;
}

function mockImplementation(returnType) {
  if (!returnType) return '() => undefined';
  const normalized = returnType.replace(/\s+/g, ' ').trim();
  const promise = normalized.match(/^Promise\s*<(.+)>$/);
  const inner = promise ? promise[1].trim() : normalized;
  const value = primitiveValue(inner) ?? 'undefined';
  return `${promise ? 'async ' : ''}() => ${value}`;
}

function methodReturnType(typeText, methodName, meta) {
  const typeName = simpleTypeName(typeText);
  if (!typeName) return null;
  const declaration = resolveSimpleDeclaration(typeName, meta);
  if (!declaration) return null;
  const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = declaration.body.match(
    new RegExp(`\\b${escaped}\\s*\\([^)]*\\)\\s*(?::\\s*([^;{\\n]+))?`),
  );
  return match?.[1]?.trim() || null;
}

function resolveSimpleDeclaration(typeName, meta) {
  const cacheKey = meta.sourcePath + '::' + typeName;
  if (meta.declarationCache.has(cacheKey)) {
    return meta.declarationCache.get(cacheKey);
  }

  let source = meta.source;
  let filePath = meta.sourcePath;
  let localName = typeName;
  let importLine = null;

  let declaration = declarationFromSource(source, localName, filePath, meta, importLine);
  if (declaration) {
    meta.declarationCache.set(cacheKey, declaration);
    return declaration;
  }

  const imported = importedType(source, typeName);
  if (!imported || !imported.specifier.startsWith('.')) {
    meta.declarationCache.set(cacheKey, null);
    return null;
  }

  const resolvedFile = resolveImportedSource(filePath, imported.specifier);
  if (!resolvedFile) {
    meta.declarationCache.set(cacheKey, null);
    return null;
  }

  if (!meta.sourceCache.has(resolvedFile)) {
    meta.sourceCache.set(resolvedFile, readFileSync(resolvedFile, 'utf8'));
  }

  source = meta.sourceCache.get(resolvedFile);
  filePath = resolvedFile;
  localName = imported.exportedName;
  const generatedPath = importPath(meta.destinationPath, filePath);
  const importedName =
    imported.exportedName === typeName
      ? typeName
      : `${imported.exportedName} as ${typeName}`;

  importLine = imported.default
    ? `import ${typeName} from '${generatedPath}';`
    : `import { ${importedName} } from '${generatedPath}';`;

  const childMeta = { ...meta, source, sourcePath: filePath };
  declaration = declarationFromSource(source, localName, filePath, childMeta, importLine);

  const resolvedDeclaration = declaration
    ? { ...declaration, name: typeName, meta: childMeta, importLine }
    : null;

  meta.declarationCache.set(cacheKey, resolvedDeclaration);
  return resolvedDeclaration;
}

function declarationFromSource(source, typeName, filePath, meta, importLine) {
  const classData = analyzeNamedClass(source, typeName);
  if (classData) return { ...classData, kind: 'class', name: typeName, filePath, meta, importLine };
  const objectData = analyzeObjectType(source, typeName);
  if (objectData) return { ...objectData, kind: 'object', name: typeName, filePath, meta, importLine: null };
  return null;
}

function analyzeNamedClass(source, typeName) {
  if (typeName === 'default') {
    const match = source.match(/\bexport\s+default\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
    if (!match) return null;
    typeName = match[1];
  }
  const escaped = typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(?:export\\s+(?:default\\s+)?)?(?:abstract\\s+)?class\\s+${escaped}\\b`);
  const match = pattern.exec(source);
  if (!match) return null;
  const open = source.indexOf('{', match.index + match[0].length);
  const close = open < 0 ? -1 : matching(source, open, '{', '}');
  if (close < 0) return null;
  const body = source.slice(open + 1, close);
  const abstract = /\babstract\s+class\b/.test(match[0]);
  const members = membersOf(body);
  const ctor = members.find((member) => member.name === 'constructor');
  const constructorParameters = paramsOf(ctor?.parameters || '');
  const privateCtor = !!ctor && (ctor.modifiers.has('private') || ctor.modifiers.has('protected'));
  const methods = members.filter((member) => member.name !== 'constructor');
  const factory = privateCtor
    ? methods.find((member) => member.modifiers.has('static') && factories.has(member.name))
    : null;
  if (privateCtor && !factory) return null;
  return { body, constructorParameters, factory, abstract };
}

function analyzeObjectType(source, typeName) {
  const escaped = typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const interfacePattern = new RegExp(
    `\\b(?:export\\s+)?interface\\s+${escaped}(?:\\s+extends[^\\{]+)?\\s*\\{`,
  );
  const aliasPattern = new RegExp(
    `\\b(?:export\\s+)?type\\s+${escaped}\\s*=\\s*\\{`,
  );
  const match = interfacePattern.exec(source) || aliasPattern.exec(source);
  if (!match) return null;

  const open = source.indexOf('{', match.index);
  const close = matching(source, open, '{', '}');
  if (close < 0) return null;

  const body = source.slice(open + 1, close);
  return { body, properties: objectProperties(body) };
}

function objectProperties(body) {
  const properties = [];

  for (const member of splitObjectMembers(body)) {
    const value = member.trim();
    if (!value) continue;

    const colon = topLevel(value, ':');
    if (colon < 0) continue;

    const left = value.slice(0, colon).trim();
    const type = value.slice(colon + 1).trim();
    const match = left.match(/^([A-Za-z_$][\w$]*)(\?)?$/);

    if (!match || !type || type.includes('=>')) continue;

    properties.push({
      name: match[1],
      type,
      optional: !!match[2],
      index: properties.length,
    });
  }

  return properties;
}

function splitObjectMembers(source) {
  const parts = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let angle = 0;

  for (let i = 0; i < source.length; i += 1) {
    const skipped = skip(source, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }

    const char = source[i];
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === '{') curly += 1;
    else if (char === '}') curly -= 1;
    else if (char === '<') angle += 1;
    else if (char === '>') angle -= 1;
    else if (
      (char === ';' || char === ',' || char === '\n') &&
      !round &&
      !square &&
      !curly &&
      !angle
    ) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
}

function importedType(source, localName) {
  const defaultPattern = /\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = defaultPattern.exec(source))) {
    if (match[1] === localName) {
      return { exportedName: 'default', specifier: match[2], default: true };
    }
  }

  const namedPattern = /\bimport\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

  while ((match = namedPattern.exec(source))) {
    for (const raw of match[1].split(',')) {
      const item = raw.trim().replace(/^type\s+/, '');
      const alias = item.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!alias) continue;

      const exportedName = alias[1];
      const importedName = alias[2] || exportedName;
      if (importedName === localName) {
        return { exportedName, specifier: match[2], default: false };
      }
    }
  }

  return null;
}

function resolveImportedSource(originPath, specifier) {
  const base = resolve(dirname(originPath), specifier).replace(/\.(?:mjs|cjs|js)$/i, '');
  const candidates = extensions.map((extension) => base + extension);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return null;
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
