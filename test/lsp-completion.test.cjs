const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

function createReader(stream) {
  let buffer = Buffer.alloc(0);
  const waiters = [];

  function flush() {
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) throw new Error('Invalid header: ' + header);
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      buffer = buffer.subarray(bodyStart + length);
      const message = JSON.parse(body);
      const waiterIndex = waiters.findIndex((w) => w.predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = waiters.splice(waiterIndex, 1);
        waiter.resolve(message);
      }
    }
  }

  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });

  return {
    waitFor(predicate, timeout = 8000) {
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve };
        waiters.push(waiter);
        const timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error('Timed out waiting for LSP message'));
        }, timeout);
        waiter.resolve = (message) => {
          clearTimeout(timer);
          resolve(message);
        };
      });
    },
  };
}

function send(child, message) {
  const body = JSON.stringify(message);
  child.stdin.write(
    'Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body,
  );
}

test('TypeScript 7 native LSP returns member completions after capability registration', { timeout: 15000 }, async (context) => {
  const repoRoot = join(__dirname, '..');
  const workspace = await mkdtemp(join(tmpdir(), 'kit-dev-ts7-completion-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));

  await mkdir(join(workspace, 'src'), { recursive: true });
  const source = "const name = 'Marcos';\nname.\n";
  const file = join(workspace, 'src', 'main.ts');
  await writeFile(file, source, 'utf8');
  await writeFile(
    join(workspace, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
      include: ['src/**/*.ts'],
    }),
    'utf8',
  );

  const tsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  const child = spawn(process.execPath, [tsc, '--lsp', '--stdio'], {
    cwd: workspace,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  context.after(() => {
    if (!child.killed) child.kill();
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const reader = createReader(child.stdout);

  send(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      workspaceFolders: [
        { name: 'root', uri: pathToFileURL(workspace).href },
      ],
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: false,
              documentationFormat: [],
            },
            contextSupport: true,
          },
        },
        general: { positionEncodings: ['utf-32'] },
      },
    },
  });

  const init = await reader.waitFor((m) => m.id === 1);
  assert.ok(init.result, JSON.stringify(init));

  send(child, {
    jsonrpc: '2.0',
    method: 'initialized',
    params: {},
  });

  const registration = await reader.waitFor(
    (m) => m.method === 'client/registerCapability' && m.id != null,
  );
  send(child, {
    jsonrpc: '2.0',
    id: registration.id,
    result: null,
  });

  send(child, {
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        uri: pathToFileURL(file).href,
        languageId: 'typescript',
        version: 1,
        text: source,
      },
    },
  });

  send(child, {
    jsonrpc: '2.0',
    id: 2,
    method: 'textDocument/completion',
    params: {
      textDocument: { uri: pathToFileURL(file).href },
      position: { line: 1, character: 5 },
      context: { triggerKind: 1 },
    },
  });

  const completion = await reader.waitFor((m) => m.id === 2);
  assert.ok(
    completion.result,
    'Completion failed: ' + JSON.stringify(completion) + '\nstderr: ' + stderr,
  );

  const items = Array.isArray(completion.result)
    ? completion.result
    : completion.result.items || [];

  assert.ok(
    items.length > 0,
    'No completion items: ' + JSON.stringify(completion) + '\nstderr: ' + stderr,
  );

  const labels = items.slice(0, 20).map((item) => ({
    label: item.label,
    sortText: item.sortText,
    filterText: item.filterText,
    additionalTextEdits: item.additionalTextEdits,
    insertTextFormat: item.insertTextFormat,
  }));

  assert.ok(
    items.some((item) => item.label === 'charAt'),
    'Expected String member completion. First items: ' + JSON.stringify(labels),
  );

  send(child, {
    jsonrpc: '2.0',
    id: 3,
    method: 'shutdown',
    params: null,
  });
  const shutdown = await reader.waitFor((m) => m.id === 3);
  assert.equal(shutdown.error, undefined);

  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('TypeScript 7 LSP did not exit cleanly')),
      5000,
    );
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  send(child, {
    jsonrpc: '2.0',
    method: 'exit',
    params: null,
  });

  const exitCode = await exited;
  assert.equal(exitCode, 0);
});
