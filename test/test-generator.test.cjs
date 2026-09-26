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

    assert.match(generated, /const name = "Marcos"/);
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
      /const dto: Parameters<CreateUser\['execute'\]>\[0\] = \{ name: "Marcos", email: "user@example\.com" \}/,
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


test(
  'usa factory estática e preserva fixtures de Date boolean e null',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-static-factory-test-generator-'),
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
type UserProps = {
  name: string
  age: number
  email: string
  createdAt: Date
  isActive: boolean
  deletedAt: Date | null
}

export class User {
  private constructor(
    private readonly props: UserProps,
  ) {}

  static create(
    name: string,
    age: number,
    email: string,
    createdAt = new Date(),
    isActive = true,
    deletedAt: Date | null = null,
  ) {
    return new User({
      name,
      age,
      email,
      createdAt,
      isActive,
      deletedAt,
    })
  }

  getName(): string {
    return this.props.name
  }

  getCreatedAt(): Date {
    return this.props.createdAt
  }

  getIsActive(): boolean {
    return this.props.isActive
  }

  getDeletedAt(): Date | null {
    return this.props.deletedAt
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

    assert.match(generated, /const name = "Marcos"/);
    assert.match(generated, /const age = 1/);
    assert.match(
      generated,
      /const createdAt: Parameters<typeof User\.create>\[3\] = new Date\('2026-01-01T00:00:00\.000Z'\)/,
    );
    assert.match(generated, /const isActive = true/);
    assert.match(generated, /const deletedAt = null/);
    assert.match(
      generated,
      /const sut = User\.create\(name, age, email, createdAt, isActive, deletedAt\)/,
    );
    assert.doesNotMatch(generated, /new User\(/);
    assert.match(generated, /assert\.equal\(result, name\)/);
    assert.match(
      generated,
      /assert\.equal\(result, createdAt\)/,
    );
    assert.match(
      generated,
      /assert\.equal\(result, isActive\)/,
    );
    assert.match(
      generated,
      /assert\.equal\(result, deletedAt\)/,
    );
  },
);

test(
  'gera fixtures para tipos comuns e compostos sem usar undefined indevidamente',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-type-matrix-test-generator-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'fixture-catalog.ts'),
      `
export class FixtureCatalog {
  constructor(
    readonly name: string,
    readonly count: number,
    readonly active: boolean,
    readonly total: bigint,
    readonly createdAt: Date,
    readonly nullable: null,
    readonly missing: undefined,
    readonly marker: symbol,
    readonly tags: string[],
    readonly pair: [string, number],
    readonly metadata: Record<string, string>,
    readonly pattern: RegExp,
    readonly endpoint: URL,
    readonly lookup: Map<string, number>,
    readonly values: Set<string>,
    readonly callback: (value: string) => number,
    readonly pending: Promise<string>,
    readonly status: 'active' | 'inactive',
    readonly maybeName: string | null,
    readonly optionalDate?: Date,
    readonly optionalFlag?: boolean,
  ) {}
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/fixture-catalog.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(generated, /const name = "Marcos"/);
    assert.match(generated, /const count = 1/);
    assert.match(generated, /const active = true/);
    assert.match(generated, /const total = 1n/);
    assert.match(
      generated,
      /const createdAt: ConstructorParameters<typeof FixtureCatalog>\[4\] = new Date\('2026-01-01T00:00:00\.000Z'\)/,
    );
    assert.match(generated, /const nullable = null/);
    assert.match(generated, /const missing = undefined/);
    assert.match(
      generated,
      /const marker: ConstructorParameters<typeof FixtureCatalog>\[7\] = Symbol\('test'\)/,
    );
    assert.match(
      generated,
      /const tags: ConstructorParameters<typeof FixtureCatalog>\[8\] = \["tag"\]/,
    );
    assert.match(
      generated,
      /const pair: ConstructorParameters<typeof FixtureCatalog>\[9\] = \["pair1", 1\]/,
    );
    assert.match(
      generated,
      /const metadata: ConstructorParameters<typeof FixtureCatalog>\[10\] = \{ key: "value" \}/,
    );
    assert.match(
      generated,
      /const pattern: ConstructorParameters<typeof FixtureCatalog>\[11\] = \/test\//,
    );
    assert.match(
      generated,
      /const endpoint: ConstructorParameters<typeof FixtureCatalog>\[12\] = new URL\('https:\/\/example\.com'\)/,
    );
    assert.match(
      generated,
      /const lookup: ConstructorParameters<typeof FixtureCatalog>\[13\] = new Map\(\[\["key", 1\]\]\)/,
    );
    assert.match(
      generated,
      /const values: ConstructorParameters<typeof FixtureCatalog>\[14\] = new Set\(\["value"\]\)/,
    );
    assert.match(
      generated,
      /const callback: ConstructorParameters<typeof FixtureCatalog>\[15\] = \(\.\.\._args: unknown\[\]\) => 1/,
    );
    assert.match(
      generated,
      /const pending: ConstructorParameters<typeof FixtureCatalog>\[16\] = Promise\.resolve\("pending"\)/,
    );
    assert.match(generated, /const status = "active"/);
    assert.match(generated, /const maybeName = "Marcos"/);
    assert.match(
      generated,
      /const optionalDate: ConstructorParameters<typeof FixtureCatalog>\[19\] = new Date\('2026-01-01T00:00:00\.000Z'\)/,
    );
    assert.match(generated, /const optionalFlag = true/);
  },
);

test(
  'suporta factory estática assíncrona',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-async-factory-test-generator-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'token.ts'),
      `
export class Token {
  private constructor(
    private readonly value: string,
  ) {}

  static async create(value: string): Promise<Token> {
    return new Token(value)
  }

  getValue(): string {
    return this.value
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/token.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /test\('Token\.getValue', async \(\) => \{/,
    );
    assert.match(
      generated,
      /const sut = await Token\.create\(value\)/,
    );
    assert.match(
      generated,
      /assert\.equal\(result, value\)/,
    );
  },
);

test(
  'recusa classe com construtor privado sem factory pública',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-private-constructor-test-generator-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'secret.ts'),
      `
export class Secret {
  private constructor(
    private readonly value: string,
  ) {}

  getValue(): string {
    return this.value
  }
}
`,
      'utf-8',
    );

    await assert.rejects(
      generateTest('src/secret.ts', projectPath),
      /non-public constructor and no supported public static factory/,
    );
  },
);


test(
  'tipa Date arrays e objetos pela factory estática sem ConstructorParameters',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-typed-object-fixtures-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'user.ts'),
      `
type Parent = {
  name: string
  bornAt: Date
  active: boolean
  meta: {
    city: string
  }
}

type Profile = {
  address: {
    city: string
  }
  tags: string[]
}

type UserProps = {
  name: string
  age: number
  email: string
  createdAt: Date
  isActive: boolean
  parents: Parent[]
  profile: Profile
}

export class User {
  private constructor(
    private readonly props: UserProps,
  ) {}

  static create(
    name: string,
    age: number,
    email: string,
    createdAt: Date,
    isActive: boolean,
    parents: Parent[],
    profile: Profile,
  ) {
    return new User({
      name,
      age,
      email,
      createdAt,
      isActive,
      parents,
      profile,
    })
  }

  getAge(): number {
    return this.props.age
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/user.ts', projectPath);
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const createdAt: Parameters<typeof User\.create>\[3\] = new Date\('2026-01-01T00:00:00\.000Z'\)/,
    );
    assert.match(
      generated,
      /const parents: Parameters<typeof User\.create>\[5\] = \[\{ name: "Marcos", bornAt: new Date\('2026-01-01T00:00:00\.000Z'\), active: true, meta: \{ city: "city" \} \}\]/,
    );
    assert.match(
      generated,
      /const profile: Parameters<typeof User\.create>\[6\] = \{ address: \{ city: "city" \}, tags: \["tag"\] \}/,
    );
    assert.match(
      generated,
      /const sut = User\.create\(name, age, email, createdAt, isActive, parents, profile\)/,
    );
    assert.doesNotMatch(
      generated,
      /ConstructorParameters<typeof User>/,
    );
    assert.doesNotMatch(generated, /const parents = \[\]/);
    assert.doesNotMatch(generated, /new User\(/);
  },
);


test(
  'gera Value Objects por factory inclusive dentro de arrays e objetos',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-ddd-value-object-fixtures-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(join(projectPath, 'src', 'domain'), {
      recursive: true,
    });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'email.ts'),
      `
export class Email {
  private constructor(
    private readonly value: string,
  ) {}

  static create(value: string): Email {
    return new Email(value)
  }

  toString(): string {
    return this.value
  }
}
`,
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'phone.ts'),
      `
export class Phone {
  private constructor(
    private readonly value: string,
  ) {}

  static create(value: string): Phone {
    return new Phone(value)
  }

  toString(): string {
    return this.value
  }
}
`,
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'user.ts'),
      `
import { Email } from './email.js'
import { Phone } from './phone.js'

type Contact = {
  phone: Phone
  primary: boolean
}

type UserProps = {
  name: string
  email: Email
  phones: Phone[]
  contacts: Contact[]
}

export class User {
  private constructor(
    private readonly props: UserProps,
  ) {}

  static create(props: UserProps): User {
    return new User(props)
  }

  getName(): string {
    return this.props.name
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/domain/user.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /import \{ Email \} from '..\/..\/src\/domain\/email\.js'/,
    );
    assert.match(
      generated,
      /import \{ Phone \} from '..\/..\/src\/domain\/phone\.js'/,
    );
    assert.match(
      generated,
      /email: Email\.create\("user@example\.com"\)/,
    );
    assert.match(
      generated,
      /phones: \[Phone\.create\("\+5599999999999"\)\]/,
    );
    assert.match(
      generated,
      /contacts: \[\{ phone: Phone\.create\("\+5599999999999"\), primary: true \}\]/,
    );
    assert.doesNotMatch(
      generated,
      /email: \{\} as never/,
    );
    assert.doesNotMatch(
      generated,
      /phones: \[\]/,
    );
  },
);

test(
  'instancia Command e Query simples sem acoplar ports e repositories concretos',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-cqrs-clean-fixtures-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(join(projectPath, 'src', 'application'), {
      recursive: true,
    });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'application', 'create-user-command.ts'),
      `
export class CreateUserCommand {
  constructor(
    readonly name: string,
    readonly email: string,
  ) {}
}
`,
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'application', 'handler.ts'),
      `
import { CreateUserCommand } from './create-user-command.js'

export interface UserRepository {
  save(command: CreateUserCommand): Promise<void>
}

export class CreateUserHandler {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  async execute(command: CreateUserCommand): Promise<void> {
    await this.repository.save(command)
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/application/handler.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /import \{ CreateUserCommand \} from '..\/..\/src\/application\/create-user-command\.js'/,
    );
    assert.match(
      generated,
      /const command: Parameters<CreateUserHandler\['execute'\]>\[0\] = new CreateUserCommand\("Marcos", "user@example\.com"\)/,
    );
    assert.match(
      generated,
      /repository as unknown as ConstructorParameters<typeof CreateUserHandler>\[0\]/,
    );
    assert.match(
      generated,
      /repository\.save\.mock\.callCount\(\), 1/,
    );
  },
);

test(
  'limita recursão de tipos de domínio autorreferentes',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-recursive-domain-fixtures-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'category.ts'),
      `
type CategoryProps = {
  name: string
  parent?: Category
}

export class Category {
  private constructor(
    private readonly props: CategoryProps,
  ) {}

  static create(props: CategoryProps): Category {
    return new Category(props)
  }

  getName(): string {
    return this.props.name
  }
}
`,
      'utf-8',
    );

    const startedAt = Date.now();
    const result = await generateTest(
      'src/category.ts',
      projectPath,
    );
    const elapsed = Date.now() - startedAt;
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.ok(elapsed < 5000);
    assert.match(generated, /Category\.create/);
    assert.ok(generated.length < 12000);
  },
);
