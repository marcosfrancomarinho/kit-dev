<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN"><strong>简体中文</strong></a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

创建 Node.js + TypeScript 项目，开箱即用地支持开发、生产构建、原生测试和可选的依赖注入。Kit Dev 会生成项目、安装依赖并配置命令。无需启用依赖注入（DI）即可使用。

## 快速开始

选择以下任意一个命令：

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

输入项目名称，然后运行：

```bash
cd my-api
npm run dev
```

## 内置功能

TypeScript `strict` 模式；esbuild；重新构建成功后自动重启 Node.js；生产构建时进行类型检查；代码压缩、独立 source map 和构建摘要；支持 npm、pnpm 和 Yarn；原生测试以及不使用装饰器的可选 DI。

## 命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动应用并监听文件变化 |
| `npm run type` | 持续检查 TypeScript 类型 |
| `npm test` | 以监听模式运行测试；指定目标时生成测试 |
| `npm run build` | 检查类型并生成生产 bundle |
| `npm start` | 运行 dist 中的 bundle |
| `npm run di` | 安装可选的 DI 配置 |

使用 pnpm 时运行 `pnpm dev`、`pnpm build` 等；使用 Yarn 时运行 `yarn dev`、`yarn build` 等。可以在另一个终端运行 `npm run type`，但这不是必需的：`build` 已包含类型检查。

## 测试与自动生成

运行 `npm test`。esbuild 转译 `.test.ts` 和 `.spec.ts` 文件，随后由 `node:test` 执行，并持续监听变化。项目包含初始测试 `test/example.test.ts`，不会安装 Jest、Vitest、ts-node 或 tsx。

要生成测试，请提供类文件的路径或唯一的源文件名：

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

生成器分析 TypeScript AST，识别类、构造函数依赖、公共方法以及 `this.repository.save()` 等调用。在能够推断的情况下，它使用 `t.mock.fn()` 创建 mock 和调用断言。

生成的测试为每个类使用一个 `describe`，并为每个方法生成以方法名命名的 `it`。无法推断业务断言时，方法仍可执行，并保留 `// TODO` 注释供补充验证。不会生成 `it.todo` 或被注释掉的测试体。请检查生成结果并完善业务规则的断言。

## 生产构建

`npm run build` 依次执行 `tsc --noEmit`、esbuild 打包、压缩和 source map 生成。摘要显示 bundle 大小、输入文件数量和总耗时。`dependencies` 与 `devDependencies` 中的包保持外部依赖，不打入 bundle。使用 `npm start` 运行构建结果。

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## 可选的依赖注入

只需执行一次 `npm run di`。该命令创建容器、启用转换器，并从 `package.json` 删除 `di` 脚本。此后 DI 自动用于 `dev` 和 `build`，无需装饰器、`reflect-metadata` 或第三方 DI 库。

`AppConfig` 注册提供者；转换器尽可能从类型推断构造函数依赖；`ApplicationContext` 在运行时创建并提供实例。配置通常位于 `src/di/providers.ts`。

### 接口示例

**契约**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**实现**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**用例**

```ts
// src/application/use-cases/create-user.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string): Promise<void> {
    return this.repository.save(name);
  }
}
```

**注册**

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

**使用**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

转换器将 `UserRepository` 映射到 `UserRepositoryMemory`。接口在运行时不存在：使用 `useClass<Interface>(Implementation)` 注册契约，通常通过 `container.get()` 解析具体类。

### 注册与容器 API

| API | 行为 |
|---|---|
| `useClass()` | 注册类，也支持契约和抽象类 |
| `createToken<T>()` | 创建 symbol 令牌；保存并复用同一个常量 |
| `useValue()` | 注册已有值或实例 |
| `useFactory()` | 通过接收容器参数的函数创建依赖 |
| `useExisting()` | 将令牌重定向到其他提供者，不创建新实例 |
| `imports()` | 复制其他 AppConfig 的提供者；拒绝重复令牌 |
| `providers.has()` | 在创建容器前检查注册情况 |
| `container.get()` | 解析依赖；未注册时抛出错误 |
| `container.getOptional()` | 未注册时返回 undefined |
| `container.has()` | 检查容器中是否存在令牌 |
| `container.clearInstances()` | 清空实例缓存，但不删除注册或关闭旧实例 |
| `container.close()` | 调用缓存单例的 dispose() 或 close()，然后清空缓存 |

### 作用域与规则

默认作用域为 `singleton`：首次解析时创建实例，随后复用。`transient` 在每次解析时创建新实例；这些实例不受 `close()` 管理。

请在调用 `createApplicationContext()` 前完成所有注册和导入，因为该调用会复制配置。注册方法支持链式调用。仅用作类型的契约应使用 `import type`。自动令牌要求接口或类型别名有名称且不带泛型。对于基本类型、泛型、可选参数、剩余参数或无法推断的类型，请按构造函数参数顺序手动提供令牌。

未注册或重复的令牌、循环依赖以及实例创建失败会产生 `DependencyInjectionError`。转换器错误会在 `dev` 或 `build` 时报告。

## 项目结构

```text
my-api/
├── kit-dev/
│   ├── build/
│   │   ├── dev.cjs
│   │   └── esbuild.config.cjs
│   └── test/
│       ├── test.cjs
│       └── generator.cjs
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
├── package.json
└── tsconfig.json
```

安装 DI 后还会添加 `kit-dev/di` 和 `src/di/providers.ts`。`kit-dev` 目录属于项目配置，可以提交到 Git。

## 环境要求

Node.js 22 或更高版本，以及 npm、pnpm 或 Yarn。无需全局安装 Kit Dev。

## 详细参考

各 DI API 的更多示例，请参阅[完整英文参考文档](./README.md)。

## 许可证

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**更少配置，更多代码。**
