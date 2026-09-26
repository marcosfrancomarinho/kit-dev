const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');

const {
  analyzeClass,
  createTestContent,
} = require('../src/generators/test-generator');

test('analisa dependências e métodos usados pela classe', () => {
  const source = `
interface UserRepository {
  create(input: { name: string }): Promise<unknown>;
}

interface EmailGateway {
  send(name: string): Promise<void>;
}

export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
    private readonly emailGateway: EmailGateway,
  ) {}

  async execute(name: string) {
    const user = await this.repository.create({ name });
    await this.emailGateway.send(name);
    return user;
  }
}
`;

  const sourceFile = ts.createSourceFile(
    'create-user.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const metadata = analyzeClass(ts, sourceFile);

  assert.equal(metadata.className, 'CreateUser');
  assert.deepEqual(
    metadata.dependencies.map(({ name, methods }) => ({ name, methods })),
    [
      { name: 'repository', methods: ['create'] },
      { name: 'emailGateway', methods: ['send'] },
    ],
  );
  assert.deepEqual(metadata.methods, [
    {
      name: 'execute',
      async: true,
      parameters: [{ value: "'test'" }],
    },
  ]);
});

test('gera teste com mocks nativos do node:test', () => {
  const content = createTestContent(
    {
      className: 'CreateUser',
      dependencies: [
        {
          name: 'repository',
          type: 'UserRepository',
          methods: ['create'],
        },
      ],
      methods: [
        {
          name: 'execute',
          async: true,
          parameters: [{ value: "'test'" }],
        },
      ],
    },
    '../../src/create-user.js',
  );

  assert.match(content, /from 'node:test'/);
  assert.match(content, /from 'node:assert\/strict'/);
  assert.match(content, /create: t\.mock\.fn/);
  assert.match(content, /await sut\.execute\('test'\)/);
  assert.match(content, /TODO: add assertions for the business behavior/);
});
