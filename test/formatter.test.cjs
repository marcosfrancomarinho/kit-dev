const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { indentSource } = require('../src/templates/files/formatter.cjs');

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

    const result = indentSource(source);

    assert.equal(
      result,
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
});
