const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  addSemicolons,
  indentSource,
  useSingleQuotes,
} = require('../src/templates/files/formatter.cjs');

describe('source formatter', () => {
  it('indents nested JavaScript and TypeScript blocks', () => {
    const source = [
      'function run(){',
      'if(true){',
      "console.log('ok')",
      '}',
      '}',
      '',
    ].join('\n');

    assert.equal(
      indentSource(source),
      [
        'function run(){',
        '  if(true){',
        "    console.log('ok')",
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('ignores braces inside regular expressions', () => {
    const source = [
      'function match(){',
      'const pattern = /a{2,3}/',
      'if(pattern.test("aaa")){',
      'return true',
      '}',
      '}',
      '',
    ].join('\n');

    assert.equal(
      indentSource(source),
      [
        'function match(){',
        '  const pattern = /a{2,3}/',
        '  if(pattern.test("aaa")){',
        '    return true',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('preserves multiline template string contents', () => {
    const source = [
      'function html(){',
      'const value = `<div>',
      '    keep this spacing',
      '</div>`',
      'return value',
      '}',
      '',
    ].join('\n');

    const result = indentSource(source);

    assert.match(result, /    keep this spacing/);
    assert.match(result, /  return value/);
  });

  it('adds semicolons to statements without changing blocks', () => {
    const source = [
      "const name = 'Marcos'",
      'function run() {',
      'console.log(name)',
      'return name',
      '}',
      '',
    ].join('\n');

    const result = addSemicolons(source, 'example.ts');

    assert.match(result, /const name = 'Marcos';/);
    assert.match(result, /console\.log\(name\);/);
    assert.match(result, /return name;/);
    assert.doesNotMatch(result, /function run\(\) \{;/);
  });

  it('converts double-quoted strings to single quotes safely', () => {
    const source = [
      'const first = "hello"',
      'const second = "Marcos\'s code"',
      'const third = "say \\"hello\\""',
      '',
    ].join('\n');

    const result = useSingleQuotes(source, 'example.ts');

    assert.match(result, /const first = 'hello'/);
    assert.match(result, /const second = 'Marcos\\'s code'/);
    assert.match(result, /const third = 'say "hello"'/);
  });

  it('does not change template literals, regex or JSX attributes', () => {
    const source = [
      'const template = `hello "world"`',
      'const regex = /"hello"/',
      'const view = <div title="hello">ok</div>',
      '',
    ].join('\n');

    const result = useSingleQuotes(source, 'example.tsx');

    assert.match(result, /`hello "world"`/);
    assert.match(result, /\/"hello"\//);
    assert.match(result, /title="hello"/);
  });
});
