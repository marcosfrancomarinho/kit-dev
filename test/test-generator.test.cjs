const assert = require('node:assert/strict');
const {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const {
  generateTest,
} = require('../src/templates/files/test-generator.cjs');

test(
  'gera fixtures e assertions para entidade com valores primitivos',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-entity-test-generator-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(
      join(projectPath, 'src', 'domain', 'entities'),
      { recursive: true },
    );
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(
        projectPath,
        'src',
        'domain',
        'entities',
        'user.ts',
      ),
      `
export class User {
  constructor(
    private readonly name: string,
    private readonly age: number,
  ) {}

  getName(): string {
    return this.name
  }

  getAge(): number {
    return this.age
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/domain/entities/user.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(generated, /const name = "John Doe"/);
    assert.match(generated, /const age = 1/);
    assert.match(generated, /new User\(name, age\)/);
    assert.match(generated, /const result = sut\.getName\(\)/);
    assert.match(generated, /assert\.equal\(result, name\)/);
    assert.match(generated, /const result = sut\.getAge\(\)/);
    assert.match(generated, /assert\.equal\(result, age\)/);
    assert.doesNotMatch(generated, /const name = \{\}/);
    assert.doesNotMatch(generated, /const age = \{\}/);
  },
);

test(
  'gera DTO tipado e mocks compatíveis com o construtor',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-usecase-test-generator-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(
      join(projectPath, 'src', 'application'),
      { recursive: true },
    );
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(
        projectPath,
        'src',
        'application',
        'create-user.ts',
      ),
      `
interface CreateUserDTO {
  name: string
  email: string
}

interface UserRepository {
  findByName(name: string): Promise<{ id: string } | null>
  create(input: CreateUserDTO): Promise<void>
}

export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  async execute(dto: CreateUserDTO) {
    const found = await this.repository.findByName(dto.name)

    if (found) {
      throw new Error('User already exists')
    }

    await this.repository.create(dto)
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/application/create-user.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const dto = \{ name: "John Doe", email: "user@example\.com" \} satisfies Parameters<CreateUser\['execute'\]>\[0\]/,
    );
    assert.match(
      generated,
      /findByName: t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => null\)/,
    );
    assert.match(
      generated,
      /create: t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => undefined\)/,
    );
    assert.match(
      generated,
      /repository as unknown as ConstructorParameters<typeof CreateUser>\[0\]/,
    );
    assert.match(generated, /await sut\.execute\(dto\)/);
    assert.match(
      generated,
      /repository\.findByName\.mock\.callCount\(\), 1/,
    );
    assert.match(
      generated,
      /repository\.create\.mock\.callCount\(\), 1/,
    );
    assert.match(
      generated,
      /repository\.findByName\.mock\.calls\[0\]\.arguments, \[dto\.name\]/,
    );
    assert.match(
      generated,
      /repository\.create\.mock\.calls\[0\]\.arguments, \[dto\]/,
    );
  },
);
