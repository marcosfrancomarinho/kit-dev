const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { generateTest } = require('../src/generators/automatic-test-generator');

test('gera teste a partir das dependências e chamadas da classe', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-test-generator-'));
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await mkdir(join(projectPath, 'src', 'application'), { recursive: true });
  await writeFile(
    join(projectPath, 'package.json'),
    JSON.stringify({ type: 'module' }),
    'utf-8',
  );
  await writeFile(
    join(projectPath, 'src', 'application', 'create-user.ts'),
    `
interface UserRepository {
  create(input: { name: string; email: string }): Promise<unknown>
}

interface EmailGateway {
  send(email: string): Promise<void>
}

export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
    private readonly emailGateway: EmailGateway,
  ) {}

  async execute(name: string, email: string) {
    const user = await this.repository.create({ name, email })
    await this.emailGateway.send(email)
    return user
  }
}
`,
    'utf-8',
  );

  const result = await generateTest(
    'src/application/create-user.ts',
    projectPath,
  );

  const generated = await readFile(result.destinationPath, 'utf-8');

  assert.match(generated, /test\('CreateUser\.execute'/);
  assert.match(generated, /create: t\.mock\.fn\(async/);
  assert.match(generated, /send: t\.mock\.fn\(async/);
  assert.match(generated, /new CreateUser\(repository, emailGateway\)/);
  assert.match(generated, /await sut\.execute\('name', 'email'\)/);
  assert.match(generated, /repository\.create\.mock\.callCount\(\), 1/);
  assert.match(generated, /emailGateway\.send\.mock\.callCount\(\), 1/);
});
