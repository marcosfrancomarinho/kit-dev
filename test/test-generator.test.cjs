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

// Design-pattern regression matrix.
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      /const repositoryFindByNameMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return null \}\)/,
    );
    assert.match(
      generated,
      /const repositoryCreateMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return undefined \}\)/,
    );
    assert.match(generated, /findByName: repositoryFindByNameMock/);
    assert.match(generated, /create: repositoryCreateMock/);
    assert.match(
      generated,
      /const repository: ConstructorParameters<typeof CreateUser>\[0\] = \{/,
    );
    assert.match(
      generated,
      /const repositoryFindByNameMock = t\.mock\.fn\(async/,
    );
    assert.match(generated, /await sut\.execute\(dto\)/);
    assert.match(
      generated,
      /repositoryFindByNameMock\.mock\.callCount\(\), 1/,
    );
    assert.match(
      generated,
      /repositoryCreateMock\.mock\.callCount\(\), 1/,
    );
    assert.match(
      generated,
      /repositoryFindByNameMock\.mock\.calls\[0\]\.arguments, \[dto\.name\]/,
    );
    assert.match(
      generated,
      /repositoryCreateMock\.mock\.calls\[0\]\.arguments, \[dto\]/,
    );
  },
);


test(
  'gera mock assíncrono com retorno explícito para objeto literal',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-object-return-test-generator-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
        'find-products.ts',
      ),
      `
interface ProductRepository {
  findAll(): Promise<{
    items: Array<{ id: string; name: string }>
    quantity: number
    page: number
  }>
}

export class FindProducts {
  constructor(
    private readonly repository: ProductRepository,
  ) {}

  async execute() {
    return this.repository.findAll()
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/application/find-products.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const repositoryFindAllMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return \{ items:/,
    );
    assert.doesNotMatch(
      generated,
      /async \(\.\.\._args: unknown\[\]\) => \{\s*items:/,
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      /const createdAt: Parameters<typeof User\['create'\]>\[3\] = new Date\('2026-01-01T00:00:00\.000Z'\)/,
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      /it\("getValue", async \(\) => \{/,
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      /const createdAt: Parameters<typeof User\['create'\]>\[3\] = new Date\('2026-01-01T00:00:00\.000Z'\)/,
    );
    assert.match(
      generated,
      /const parents: Parameters<typeof User\['create'\]>\[5\] = \[\{ name: "Marcos", bornAt: new Date\('2026-01-01T00:00:00\.000Z'\), active: true, meta: \{ city: "city" \} \}\]/,
    );
    assert.match(
      generated,
      /const profile: Parameters<typeof User\['create'\]>\[6\] = \{ address: \{ city: "city" \}, tags: \["tag"\] \}/,
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      /const repository: ConstructorParameters<typeof CreateUserHandler>\[0\] = \{/,
    );
    assert.match(
      generated,
      /repositorySaveMock\.mock\.callCount\(\), 1/,
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
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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


test(
  'instancia Value Object concreto com construtor público mesmo com métodos',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-public-vo-fixture-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    );

    await mkdir(join(projectPath, 'src', 'domain', 'value-objects'), {
      recursive: true,
    });
    await mkdir(join(projectPath, 'src', 'domain', 'entities'), {
      recursive: true,
    });
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
        'value-objects',
        'name.ts',
      ),
      `
export class Name {
  constructor(
    private readonly value: string,
  ) {}

  getValue(): string {
    return this.value
  }
}
`,
      'utf-8',
    );

    await writeFile(
      join(
        projectPath,
        'src',
        'domain',
        'entities',
        'product.ts',
      ),
      `
import { Name } from '../value-objects/name.js'

export class Product {
  constructor(
    private readonly name: Name,
  ) {}

  getName(): Name {
    return this.name
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/domain/entities/product.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /import \{ Name \} from '..\/..\/..\/src\/domain\/value-objects\/name\.js'/,
    );
    assert.match(
      generated,
      /const name: ConstructorParameters<typeof Product>\[0\] = new Name\("Marcos"\)/,
    );
    assert.match(
      generated,
      /const sut = new Product\(name\)/,
    );
    assert.doesNotMatch(
      generated,
      /const name = \{\}/,
    );
  },
);

test(
  'mantém classes de infraestrutura como dependências em vez de instanciá-las',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-architectural-dependency-fixture-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    );

    await mkdir(join(projectPath, 'src', 'application'), {
      recursive: true,
    });
    await mkdir(join(projectPath, 'src', 'infrastructure'), {
      recursive: true,
    });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(
        projectPath,
        'src',
        'infrastructure',
        'user-repository.ts',
      ),
      `
export class UserRepository {
  async save(name: string): Promise<void> {}
}
`,
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'application', 'use-case.ts'),
      `
import { UserRepository } from '../infrastructure/user-repository.js'

export class UseCase {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  async execute(name: string): Promise<void> {
    await this.repository.save(name)
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/application/use-case.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const repository: ConstructorParameters<typeof UseCase>\[0\] = \{/,
    );
    assert.doesNotMatch(
      generated,
      /new UserRepository\(/,
    );
  },
);


test(
  'usa factory estática em português para Value Object aninhado',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-nested-portuguese-factory-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    );

    await mkdir(join(projectPath, 'src', 'domain', 'value-objects'), {
      recursive: true,
    });
    await mkdir(join(projectPath, 'src', 'domain', 'entities'), {
      recursive: true,
    });
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
        'value-objects',
        'name.ts',
      ),
      `
export class Name {
  private constructor(
    private readonly value: string,
  ) {}

  static criar(value: string): Name {
    return new Name(value)
  }

  getValue(): string {
    return this.value
  }
}
`,
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
import { Name } from '../value-objects/name.js'

export class User {
  private constructor(
    private readonly name: Name,
    private readonly age: number,
  ) {}

  static criar(name: Name, age: number): User {
    return new User(name, age)
  }

  getName(): string {
    return this.name.getValue()
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

    assert.match(
      generated,
      /import \{ Name \} from '..\/..\/..\/src\/domain\/value-objects\/name\.js'/,
    );
    assert.match(
      generated,
      /const name: Parameters<typeof User\['criar'\]>\[0\] = Name\.criar\("Marcos"\)/,
    );
    assert.match(
      generated,
      /const sut = User\.criar\(name, age\)/,
    );
    assert.doesNotMatch(
      generated,
      /getValue: t\.mock\.fn/,
    );
    assert.doesNotMatch(
      generated,
      /name as unknown as Parameters<typeof User\['criar'\]>\[0\]/,
    );
  },
);


test(
  'sobrescreve teste existente ao gerar novamente',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-overwrite-test-generator-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    const sourcePath = join(projectPath, 'src', 'person.ts');

    await writeFile(
      sourcePath,
      `
export class Person {
  constructor(
    private readonly name: string,
  ) {}

  getName(): string {
    return this.name
  }
}
`,
      'utf-8',
    );

    const first = await generateTest('src/person.ts', projectPath);
    const firstGenerated = await readFile(
      first.destinationPath,
      'utf-8',
    );

    assert.match(firstGenerated, /const name = "Marcos"/);

    await writeFile(
      sourcePath,
      `
export class Person {
  constructor(
    private readonly name: string,
    private readonly age: number,
  ) {}

  getAge(): number {
    return this.age
  }
}
`,
      'utf-8',
    );

    const second = await generateTest('src/person.ts', projectPath);
    const secondGenerated = await readFile(
      second.destinationPath,
      'utf-8',
    );

    assert.equal(first.destinationPath, second.destinationPath);
    assert.match(secondGenerated, /const age = 1/);
    assert.match(secondGenerated, /it\("getAge"/);
    assert.doesNotMatch(secondGenerated, /Person\.getName/);
  },
);


test(
  'trata interface de dados como objeto tipado e interface de comportamento como mock',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-interface-kind-fixtures-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    );

    await mkdir(join(projectPath, 'src', 'domain'), {
      recursive: true,
    });
    await mkdir(join(projectPath, 'src', 'application'), {
      recursive: true,
    });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'user.ts'),
      `
export interface UserProps {
  name: string
  age: number
  active: boolean
}

export interface UserRepository {
  save(props: UserProps): Promise<void>
}

export class UserService {
  constructor(
    private readonly props: UserProps,
    private readonly repository: UserRepository,
  ) {}

  async execute(): Promise<void> {
    await this.repository.save(this.props)
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
      /const props: ConstructorParameters<typeof UserService>\[0\] = \{ name: "Marcos", age: 1, active: true \}/,
    );
    assert.match(
      generated,
      /const repositorySaveMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return undefined \}\)/,
    );
    assert.match(
      generated,
      /const repository: ConstructorParameters<typeof UserService>\[1\] = \{/,
    );
    assert.match(generated, /save: repositorySaveMock/);
    assert.doesNotMatch(
      generated,
      /props as unknown as ConstructorParameters<typeof UserService>\[0\]/,
    );
  },
);

test(
  'trata interface com callback como dependência comportamental',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-callback-port-fixture-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'runner.ts'),
      `
export interface TaskPort {
  run: (name: string) => Promise<void>
}

export class Runner {
  constructor(
    private readonly port: TaskPort,
  ) {}

  async execute(name: string): Promise<void> {
    await this.port.run(name)
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/runner.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const portRunMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return undefined \}\)/,
    );
    assert.match(
      generated,
      /const port: ConstructorParameters<typeof Runner>\[0\] = \{/,
    );
    assert.match(generated, /run: portRunMock/);
  },
);


test(
  'distingue interface de dados de interface comportamental',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-interface-classification-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      join(projectPath, 'src', 'application', 'use-case.ts'),
      `
interface CreateUserInput {
  name: string
  email: string
  active: boolean
}

interface UserRepository {
  save(input: CreateUserInput): Promise<void>
}

export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  async execute(input: CreateUserInput): Promise<void> {
    await this.repository.save(input)
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/application/use-case.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const input: Parameters<CreateUser\['execute'\]>\[0\] = \{ name: "Marcos", email: "user@example\.com", active: true \}/,
    );
    assert.match(
      generated,
      /const repositorySaveMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return undefined \}\)/,
    );
    assert.match(
      generated,
      /const repository: ConstructorParameters<typeof CreateUser>\[0\] = \{/,
    );
    assert.match(generated, /save: repositorySaveMock/);
    assert.doesNotMatch(
      generated,
      /input as unknown as/,
    );
  },
);

test(
  'mantém classe concreta de domínio sem fixture inferível como valor tipado e não mock',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-domain-fallback-value-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      join(projectPath, 'src', 'domain', 'secret.ts'),
      `
export class Secret {
  private constructor(
    private readonly value: string,
  ) {}

  reveal(): string {
    return this.value
  }
}
`,
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'entity.ts'),
      `
import { Secret } from './secret.js'

export class Entity {
  constructor(
    private readonly secret: Secret,
  ) {}

  getSecret(): Secret {
    return this.secret
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/domain/entity.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const secret: ConstructorParameters<typeof Entity>\[0\] = \{\} as ConstructorParameters<typeof Entity>\[0\] \/\* TODO: provide secret \*\//,
    );
    assert.doesNotMatch(
      generated,
      /reveal: t\.mock\.fn/,
    );
  },
);


test(
  'reconhece estruturalmente padrões Observer Strategy Specification Decorator Adapter e Factory',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-design-patterns-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    );

    await mkdir(join(projectPath, 'src', 'patterns'), {
      recursive: true,
    });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'patterns', 'observer.ts'),
      `
interface Observer {
  update(message: string): void
}

export class Subject {
  constructor(
    private readonly observers: Observer[],
  ) {}

  notify(message: string): void {
    for (const observer of this.observers) {
      observer.update(message)
    }
  }
}
`,
      'utf-8',
    );

    const observerResult = await generateTest(
      'src/patterns/observer.ts',
      projectPath,
    );
    const observerTest = await readFile(
      observerResult.destinationPath,
      'utf-8',
    );

    assert.match(
      observerTest,
      /const observer = \{/,
    );
    assert.match(
      observerTest,
      /update: t\.mock\.fn\(\(\.\.\._args: unknown\[\]\) => \{ return undefined \}\)/,
    );
    assert.match(
      observerTest,
      /const observers: ConstructorParameters<typeof Subject>\[0\] = \[observer\]/,
    );
    assert.match(
      observerTest,
      /assert\.equal\(observer\.update\.mock\.callCount\(\), 1\)/,
    );
    assert.match(
      observerTest,
      /observer\.update\.mock\.calls\[0\]\.arguments, \["message"\]/,
    );

    await writeFile(
      join(projectPath, 'src', 'patterns', 'strategy.ts'),
      `
interface PriceStrategy {
  calculate(value: number): number
}

export class Checkout {
  constructor(
    private readonly strategy: PriceStrategy,
  ) {}

  total(value: number): number {
    return this.strategy.calculate(value)
  }
}
`,
      'utf-8',
    );

    const strategyResult = await generateTest(
      'src/patterns/strategy.ts',
      projectPath,
    );
    const strategyTest = await readFile(
      strategyResult.destinationPath,
      'utf-8',
    );

    assert.match(
      strategyTest,
      /const strategyCalculateMock = t\.mock\.fn\(\(\.\.\._args: unknown\[\]\) => \{ return 1 \}\)/,
    );
    assert.match(strategyTest, /calculate: strategyCalculateMock/);
    assert.match(
      strategyTest,
      /strategyCalculateMock\.mock\.callCount\(\), 1/,
    );
    assert.match(
      strategyTest,
      /strategyCalculateMock\.mock\.calls\[0\]\.arguments, \[1\]/,
    );

    await writeFile(
      join(projectPath, 'src', 'patterns', 'specification.ts'),
      `
interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean
}

export class ProductFilter {
  constructor(
    private readonly specification: Specification<string>,
  ) {}

  accepts(name: string): boolean {
    return this.specification.isSatisfiedBy(name)
  }
}
`,
      'utf-8',
    );

    const specificationResult = await generateTest(
      'src/patterns/specification.ts',
      projectPath,
    );
    const specificationTest = await readFile(
      specificationResult.destinationPath,
      'utf-8',
    );

    assert.match(
      specificationTest,
      /const specificationIsSatisfiedByMock = t\.mock\.fn\(\(\.\.\._args: unknown\[\]\) => \{ return true \}\)/,
    );
    assert.match(
      specificationTest,
      /isSatisfiedBy: specificationIsSatisfiedByMock/,
    );
    assert.match(
      specificationTest,
      /specificationIsSatisfiedByMock\.mock\.callCount\(\), 1/,
    );

    await writeFile(
      join(projectPath, 'src', 'patterns', 'decorator.ts'),
      `
interface Service {
  execute(name: string): Promise<void>
}

export class LoggingDecorator {
  constructor(
    private readonly inner: Service,
  ) {}

  async execute(name: string): Promise<void> {
    await this.inner.execute(name)
  }
}
`,
      'utf-8',
    );

    const decoratorResult = await generateTest(
      'src/patterns/decorator.ts',
      projectPath,
    );
    const decoratorTest = await readFile(
      decoratorResult.destinationPath,
      'utf-8',
    );

    assert.match(
      decoratorTest,
      /const innerExecuteMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return undefined \}\)/,
    );
    assert.match(decoratorTest, /execute: innerExecuteMock/);
    assert.match(
      decoratorTest,
      /innerExecuteMock\.mock\.callCount\(\), 1/,
    );

    await writeFile(
      join(projectPath, 'src', 'patterns', 'adapter.ts'),
      `
interface PaymentPort {
  charge(amount: number): Promise<boolean>
}

export class PaymentAdapter {
  constructor(
    private readonly port: PaymentPort,
  ) {}

  async pay(amount: number): Promise<boolean> {
    return this.port.charge(amount)
  }
}
`,
      'utf-8',
    );

    const adapterResult = await generateTest(
      'src/patterns/adapter.ts',
      projectPath,
    );
    const adapterTest = await readFile(
      adapterResult.destinationPath,
      'utf-8',
    );

    assert.match(
      adapterTest,
      /const portChargeMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return true \}\)/,
    );
    assert.match(adapterTest, /charge: portChargeMock/);
    assert.match(
      adapterTest,
      /portChargeMock\.mock\.callCount\(\), 1/,
    );

    await writeFile(
      join(projectPath, 'src', 'patterns', 'factory.ts'),
      `
export class Identifier {
  private constructor(
    private readonly value: string,
  ) {}

  static from(value: string): Identifier {
    return new Identifier(value)
  }

  getValue(): string {
    return this.value
  }
}
`,
      'utf-8',
    );

    const factoryResult = await generateTest(
      'src/patterns/factory.ts',
      projectPath,
    );
    const factoryTest = await readFile(
      factoryResult.destinationPath,
      'utf-8',
    );

    assert.match(
      factoryTest,
      /const sut = Identifier\.from\(value\)/,
    );
    assert.doesNotMatch(factoryTest, /new Identifier\(/);
  },
);


test(
  'cobre enum branded types herança de ports coleções comportamentais e invariantes simples',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-advanced-domain-matrix-'),
    );
    context.after(() =>
      rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
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
      join(projectPath, 'src', 'domain', 'types.ts'),
      `
export enum Status {
  Active = 'active',
  Inactive = 'inactive',
}

export type UserId = string & {
  readonly __brand: 'UserId'
}
`,
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'entity.ts'),
      `
import { Status, type UserId } from './types.js'

export class Entity {
  constructor(
    private readonly id: UserId,
    private readonly status: Status,
  ) {}

  getStatus(): Status {
    return this.status
  }
}
`,
      'utf-8',
    );

    const entityResult = await generateTest(
      'src/domain/entity.ts',
      projectPath,
    );
    const entityTest = await readFile(
      entityResult.destinationPath,
      'utf-8',
    );

    assert.match(
      entityTest,
      /import \{ Status \} from '..\/..\/src\/domain\/types\.js'/,
    );
    assert.match(
      entityTest,
      /const id = "test-id" as never/,
    );
    assert.match(
      entityTest,
      /const status: ConstructorParameters<typeof Entity>\[1\] = Status\.Active/,
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'ports.ts'),
      `
interface BasePort {
  send(message: string): Promise<void>
}

interface NotificationPort extends BasePort {}

export class NotificationService {
  constructor(
    private readonly port: NotificationPort,
  ) {}

  async execute(message: string): Promise<void> {
    await this.port.send(message)
  }
}
`,
      'utf-8',
    );

    const inheritedResult = await generateTest(
      'src/domain/ports.ts',
      projectPath,
    );
    const inheritedTest = await readFile(
      inheritedResult.destinationPath,
      'utf-8',
    );

    assert.match(
      inheritedTest,
      /const portSendMock = t\.mock\.fn\(async \(\.\.\._args: unknown\[\]\) => \{ return undefined \}\)/,
    );
    assert.match(inheritedTest, /send: portSendMock/);

    await writeFile(
      join(projectPath, 'src', 'domain', 'collections.ts'),
      `
interface Observer {
  update(message: string): void
}

export class Broadcaster {
  constructor(
    private readonly setObservers: Set<Observer>,
    private readonly mapObservers: Map<string, Observer>,
  ) {}

  notifySet(message: string): void {
    for (const observer of this.setObservers) {
      observer.update(message)
    }
  }

  notifyMap(message: string): void {
    for (const observer of this.mapObservers.values()) {
      observer.update(message)
    }
  }
}
`,
      'utf-8',
    );

    const collectionResult = await generateTest(
      'src/domain/collections.ts',
      projectPath,
    );
    const collectionTest = await readFile(
      collectionResult.destinationPath,
      'utf-8',
    );

    assert.match(
      collectionTest,
      /const setObservers: ConstructorParameters<typeof Broadcaster>\[0\] = new Set\(\[observer\]\)/,
    );
    assert.match(
      collectionTest,
      /const mapObservers: ConstructorParameters<typeof Broadcaster>\[1\] = new Map\(\[\["key", observer\]\]\)/,
    );
    assert.match(
      collectionTest,
      /observer\.update\.mock\.callCount\(\), 1/,
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'age.ts'),
      `
export class Age {
  private constructor(
    private readonly value: number,
  ) {}

  static create(value: number): Age {
    if (value < 0) {
      throw new Error('invalid age')
    }

    return new Age(value)
  }

  getValue(): number {
    return this.value
  }
}
`,
      'utf-8',
    );

    const invariantResult = await generateTest(
      'src/domain/age.ts',
      projectPath,
    );
    const invariantTest = await readFile(
      invariantResult.destinationPath,
      'utf-8',
    );

    assert.match(
      invariantTest,
      /it\("create rejects invalid value", \(\) => \{/,
    );
    assert.match(
      invariantTest,
      /assert\.throws\(\(\) => Age\.create\(-1\)\)/,
    );
  },
);


test('gera um describe por classe e executa métodos sem assertions com comentário TODO', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-describe-'));
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  await mkdir(join(projectPath, 'src'));
  await writeFile(join(projectPath, 'src', 'example.ts'), `
export class Example {
  constructor(private readonly value: number) {}
  getValue(): number { return this.value; }
  unresolved(): void { console.log('unresolved method executed'); }
}
`);
  const result = await generateTest('src/example.ts', projectPath);
  const content = await readFile(result.destinationPath, 'utf-8');
  assert.match(content, /describe\("Example",/);
  assert.equal((content.match(/describe\(/g) || []).length, 1);
  assert.match(content, /it\("getValue",/);
  assert.match(content, /it\("unresolved",/);
  assert.doesNotMatch(content, /it\.todo/);
  assert.match(content, /\/\/ TODO: add assertions for the business behavior\./);
  assert.match(content, /^    sut\.unresolved\(\)/m);
  assert.doesNotMatch(content, /^\s*\/\/\s*(?:it\(|const |sut\.)/m);
  assert.doesNotMatch(content, /^\s*test\(/m);
  const output = join(projectPath, 'generated.test.cjs');
  await require('esbuild').build({
    entryPoints: [result.destinationPath], outfile: output,
    bundle: true, platform: 'node', format: 'cjs',
  });
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const execution = require('node:child_process').spawnSync(
    process.execPath, ['--test', '--test-reporter=tap', output], { encoding: 'utf-8', env },
  );
  assert.equal(execution.status, 0, execution.stdout + execution.stderr);
  assert.match(execution.stdout, /unresolved method executed/);
  assert.match(execution.stdout, /# pass 2/);
  assert.match(execution.stdout, /# todo 0/);
});


test(
  'gera fixture para construtor com object binding pattern',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-object-binding-pattern-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src', 'domain', 'entities'), {
      recursive: true,
    });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'entities', 'veiculo.ts'),
      `
export interface Input {
  marca: string
  ano: number
}

export class Veiculo {
  private marca: string
  private ano: number

  constructor({ marca, ano }: Input) {
    this.ano = ano
    this.marca = marca
  }

  getMarca(): string {
    return this.marca
  }

  getAno(): number {
    return this.ano
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/domain/entities/veiculo.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const input: ConstructorParameters<typeof Veiculo>\[0\] = \{ marca: "marca", ano: 1 \}/,
    );
    assert.match(generated, /const sut = new Veiculo\(input\)/);
    assert.doesNotMatch(generated, /new Veiculo\(\)/);
    assert.match(
      generated,
      /assert\.equal\(result, input\.marca\)/,
    );
    assert.match(
      generated,
      /assert\.equal\(result, input\.ano\)/,
    );
  },
);

test(
  'gera fixture para construtor com array binding pattern',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-array-binding-pattern-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'range.ts'),
      `
export class Range {
  private start: number
  private end: number

  constructor([start, end]: [number, number]) {
    this.start = start
    this.end = end
  }

  getStart(): number {
    return this.start
  }

  getEnd(): number {
    return this.end
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/range.ts', projectPath);
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(
      generated,
      /const input: ConstructorParameters<typeof Range>\[0\] = \[1, 1\]/,
    );
    assert.match(generated, /const sut = new Range\(input\)/);
    assert.match(
      generated,
      /assert\.equal\(result, input\[0\]\)/,
    );
    assert.match(
      generated,
      /assert\.equal\(result, input\[1\]\)/,
    );
  },
);


test(
  'inicializa propriedades publicas sem construtor antes de testar getters',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-public-properties-getters-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src', 'domain', 'entities'), {
      recursive: true,
    });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'domain', 'entities', 'veiculo.ts'),
      `
export interface Input {
  marca: string
  ano: number
}

export class Veiculo {
  public marca!: string
  public ano!: number

  public getMarca(): string {
    return this.marca
  }

  public getAno(): number {
    return this.ano
  }
}
`,
      'utf-8',
    );

    const result = await generateTest(
      'src/domain/entities/veiculo.ts',
      projectPath,
    );
    const generated = await readFile(
      result.destinationPath,
      'utf-8',
    );

    assert.match(generated, /const sut = new Veiculo\(\)/);
    assert.match(generated, /sut\.marca = "marca"/);
    assert.match(generated, /sut\.ano = 1/);
    assert.match(
      generated,
      /assert\.equal\(result, "marca"\)/,
    );
    assert.match(
      generated,
      /assert\.equal\(result, 1\)/,
    );
    assert.doesNotMatch(
      generated,
      /TODO: add assertions for the business behavior/,
    );
  },
);


test(
  'gera testes para getter setter e metodo static sem tratar factory como metodo comum',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-accessors-static-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'account.ts'),
      `
export class Account {
  private _name = 'Marcos'

  get name(): string {
    return this._name
  }

  set name(value: string) {
    if (value === '') {
      throw new Error('invalid name')
    }

    this._name = value
  }

  static normalize(value: string): string {
    return value
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/account.ts', projectPath);
    const generated = await readFile(result.destinationPath, 'utf-8');

    assert.match(generated, /it\("get name",/);
    assert.match(generated, /const result = sut\.name/);
    assert.match(generated, /it\("set name",/);
    assert.match(generated, /sut\.name = "value"/);
    assert.match(
      generated,
      /it\("name rejects invalid value",/,
    );
    assert.match(
      generated,
      /assert\.throws\(\(\) => \{/,
    );
    assert.match(generated, /sut\.name = ""/);
    assert.match(generated, /it\("normalize",/);
    assert.match(
      generated,
      /Account\.normalize\("value"\)/,
    );
    assert.match(
      generated,
      /it\("normalize", \(\) => \{\s*Account\.normalize\("value"\)/,
    );

    const output = join(projectPath, 'generated-accessors.test.cjs');
    await require('esbuild').build({
      entryPoints: [result.destinationPath],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'cjs',
    });
    const execution = require('node:child_process').spawnSync(
      process.execPath,
      ['--test', output],
      { encoding: 'utf-8' },
    );
    assert.equal(
      execution.status,
      0,
      execution.stdout + execution.stderr,
    );
  },
);

test(
  'gera assert throws para guarda simples em metodo de instancia',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-method-guard-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'wallet.ts'),
      `
export class Wallet {
  withdraw(amount: number): void {
    if (amount < 0) {
      throw new Error('invalid amount')
    }
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/wallet.ts', projectPath);
    const generated = await readFile(result.destinationPath, 'utf-8');

    assert.match(
      generated,
      /it\("withdraw rejects invalid amount",/,
    );
    assert.match(
      generated,
      /assert\.throws\(\(\) => sut\.withdraw\(-1\)\)/,
    );
  },
);


test(
  'cobre heranca de construtor metodos herdados override overload e destructuring aninhado',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-inheritance-overloads-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'base.ts'),
      `
export class Base {
  constructor(private readonly id: string) {}

  getId(): string {
    return this.id
  }

  describe(value: string): string
  describe(value: number): string
  describe(value: string | number): string {
    return String(value)
  }
}
`,
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'entity.ts'),
      `
import { Base } from './base.js'

interface Input {
  user: {
    address: {
      city: string
    }
  }
}

export class Entity extends Base {
  private city: string

  constructor(id: string, { user: { address: { city } } }: Input) {
    super(id)
    this.city = city
  }

  override getId(): string {
    return super.getId()
  }

  getCity(): string {
    return this.city
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/entity.ts', projectPath);
    const generated = await readFile(result.destinationPath, 'utf-8');

    assert.match(generated, /const id = "test-id"/);
    assert.match(
      generated,
      /const input2: ConstructorParameters<typeof Entity>\[1\]/,
    );
    assert.match(generated, /new Entity\(id, input2\)/);
    assert.match(
      generated,
      /assert\.equal\(result, input2\.user\.address\.city\)/,
    );

    const output = join(projectPath, 'generated-inheritance.test.cjs');
    await require('esbuild').build({
      entryPoints: [result.destinationPath],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'cjs',
    });
    const execution = require('node:child_process').spawnSync(
      process.execPath,
      ['--test', output],
      { encoding: 'utf-8' },
    );
    assert.equal(
      execution.status,
      0,
      execution.stdout + execution.stderr,
    );
  },
);

test(
  'gera fixtures para utility types record partial pick omit e literal unions',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-utility-types-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'utility.ts'),
      `
interface User {
  name: string
  age: number
  email: string
}

export class UtilityExample {
  execute(
    partial: Partial<User>,
    picked: Pick<User, 'name'>,
    omitted: Omit<User, 'email'>,
    record: Record<string, number>,
    role: 'admin' | 'user',
  ): void {
    void partial
    void picked
    void omitted
    void record
    void role
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/utility.ts', projectPath);
    const generated = await readFile(result.destinationPath, 'utf-8');

    assert.match(generated, /sut\.execute\(/);

    const output = join(projectPath, 'generated-utility.test.cjs');
    await require('esbuild').build({
      entryPoints: [result.destinationPath],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'cjs',
    });
    const execution = require('node:child_process').spawnSync(
      process.execPath,
      ['--test', output],
      { encoding: 'utf-8' },
    );
    assert.equal(
      execution.status,
      0,
      execution.stdout + execution.stderr,
    );
  },
);


test(
  'gera guardas de construtor e recusa classe abstrata com mensagem clara',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-constructor-guard-abstract-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );

    await writeFile(
      join(projectPath, 'src', 'age.ts'),
      `
export class Age {
  constructor(private readonly value: number) {
    if (value < 0) {
      throw new Error('invalid age')
    }
  }

  getValue(): number {
    return this.value
  }
}
`,
      'utf-8',
    );

    const ageResult = await generateTest('src/age.ts', projectPath);
    const ageGenerated = await readFile(
      ageResult.destinationPath,
      'utf-8',
    );

    assert.match(
      ageGenerated,
      /it\("constructor rejects invalid value",/,
    );
    assert.match(
      ageGenerated,
      /assert\.throws\(\(\) => new Age\(-1\)\)/,
    );

    await writeFile(
      join(projectPath, 'src', 'base.ts'),
      `
export abstract class Base {
  abstract execute(): void
}
`,
      'utf-8',
    );

    await assert.rejects(
      () => generateTest('src/base.ts', projectPath),
      /is abstract and cannot be instantiated as a test subject/,
    );
  },
);

test(
  'infere getter baseado em private field inicializado sem acessar campo privado no teste',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-private-field-getter-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
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
  #value = 'token'

  get value(): string {
    return this.#value
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/token.ts', projectPath);
    const generated = await readFile(result.destinationPath, 'utf-8');

    assert.match(generated, /const result = sut\.value/);
    assert.match(generated, /assert\.equal\(result, "token"\)/);
    assert.doesNotMatch(generated, /sut\.#value/);
  },
);


test(
  'infere retorno direto de parametro e mutacao publica sem inventar regra de negocio',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-safe-return-state-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'profile.ts'),
      `
export class Profile {
  public name = 'before'

  identity(value: string): string {
    return value
  }

  rename(name: string): void {
    this.name = name
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/profile.ts', projectPath);
    const generated = await readFile(result.destinationPath, 'utf-8');

    assert.match(
      generated,
      /const result = sut\.identity\("value"\)/,
    );
    assert.match(
      generated,
      /assert\.equal\(result, "value"\)/,
    );
    assert.match(generated, /sut\.rename\("Marcos"\)/);
    assert.match(
      generated,
      /assert\.equal\(sut\.name, "Marcos"\)/,
    );
  },
);

test(
  'nao exige chamada de dependencia dentro de branch condicional',
  async (context) => {
    const projectPath = await mkdtemp(
      join(tmpdir(), 'kit-dev-conditional-call-'),
    );
    context.after(() =>
      rm(projectPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );

    await mkdir(join(projectPath, 'src'), { recursive: true });
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    );
    await writeFile(
      join(projectPath, 'src', 'service.ts'),
      `
interface Repository {
  save(): void
}

export class Service {
  constructor(private readonly repository: Repository) {}

  execute(enabled: boolean): void {
    if (!enabled) {
      this.repository.save()
    }
  }
}
`,
      'utf-8',
    );

    const result = await generateTest('src/service.ts', projectPath);
    const generated = await readFile(result.destinationPath, 'utf-8');

    assert.match(
      generated,
      /TODO: conditional call repository\.save depends on runtime branch/,
    );
    assert.doesNotMatch(
      generated,
      /repositorySaveMock\.mock\.callCount\(\), 1/,
    );

    const output = join(projectPath, 'generated-conditional.test.cjs');
    await require('esbuild').build({
      entryPoints: [result.destinationPath],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'cjs',
    });
    const execution = require('node:child_process').spawnSync(
      process.execPath,
      ['--test', output],
      { encoding: 'utf-8' },
    );
    assert.equal(
      execution.status,
      0,
      execution.stdout + execution.stderr,
    );
  },
);
