const syntaxFactories = new Set(['create', 'from', 'of', 'build', 'make']);

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

module.exports = { matching, membersOf, objectProperties, paramsOf };
