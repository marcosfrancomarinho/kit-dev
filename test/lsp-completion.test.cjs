const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');

function createReader(stream, onMessage = () => {}) {
  let buffer = Buffer.alloc(0);
  const waiters = [];
  const pendingMessages = [];

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
      onMessage(message);
      const waiterIndex = waiters.findIndex((w) => w.predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = waiters.splice(waiterIndex, 1);
        waiter.resolve(message);
      } else {
        pendingMessages.push(message);
      }
    }
  }

  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });

  return {
    waitFor(predicate, timeout = 60000) {
      const pendingIndex = pendingMessages.findIndex(predicate);
      if (pendingIndex >= 0) {
        const [message] = pendingMessages.splice(pendingIndex, 1);
        return Promise.resolve(message);
      }

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

test('TypeScript 7 native LSP returns member completions after capability registration', { timeout: 90000 }, async (context) => {
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

  const reader = createReader(child.stdout, (message) => {
    if (message.id == null || typeof message.method !== 'string') {
      return;
    }

    let result = null;

    if (message.method === 'workspace/configuration') {
      result = Array.isArray(message.params?.items)
        ? message.params.items.map(() => null)
        : [];
    }

    if (message.method === 'workspace/workspaceFolders') {
      result = [
        {
          name: 'root',
          uri: pathToFileURL(workspace).href,
        },
      ];
    }

    send(child, {
      jsonrpc: '2.0',
      id: message.id,
      result,
    });
  });

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

  // Give the language server a brief moment to register the opened document.
  // Real editor usage naturally has this gap before the user requests completion.
  await delay(250);

  let completion = null;
  let items = [];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const id = 2 + attempt;
    const completionResponse = reader.waitFor((m) => m.id === id, 15000);

    send(child, {
      jsonrpc: '2.0',
      id,
      method: 'textDocument/completion',
      params: {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line: 1, character: 5 },
        context: { triggerKind: 1 },
      },
    });

    completion = await completionResponse;

    if (completion.result) {
      items = Array.isArray(completion.result)
        ? completion.result
        : completion.result.items || [];
    }

    if (items.length > 0) break;
    await delay(500);
  }

  assert.ok(
    completion?.result,
    'Completion failed: ' + JSON.stringify(completion) + '\nstderr: ' + stderr,
  );

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

  const shutdownResponse = reader.waitFor((m) => m.id === 100);

  send(child, {
    jsonrpc: '2.0',
    id: 100,
    method: 'shutdown',
  });
  const shutdown = await shutdownResponse;
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
  });

  const exitCode = await exited;
  assert.equal(typeof exitCode, 'number');
});
