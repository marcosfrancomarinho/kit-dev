<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja"><strong>日本語</strong></a>
</p>

# 🚀 Kit Dev

開発環境、本番ビルド、ネイティブテスト、任意の依存性注入を備えた Node.js + TypeScript プロジェクトを作成できます。Kit Dev がプロジェクトを生成し、依存パッケージをインストールしてコマンドを設定します。依存性注入（DI）を有効にしなくても利用できます。

## クイックスタート

次のいずれかのコマンドを実行します。

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

プロジェクト名を入力し、次を実行します。

```bash
cd my-api
npm run dev
```

## 主な機能

TypeScript の `strict` モード、esbuild、再ビルド成功後の Node.js 自動再起動、本番ビルド時の型チェック、圧縮、外部ソースマップ、バンドルの概要表示、npm・pnpm・Yarn 対応、ネイティブテスト、デコレーターを使わない任意の DI。

## コマンド

| コマンド | 用途 |
|---|---|
| `npm run dev` | アプリを起動して変更を監視する |
| `npm run type` | TypeScript の型を継続的にチェックする |
| `npm test` | 監視モードでテストを実行する。対象を指定するとテストを生成する |
| `npm run build` | 型チェック後に本番バンドルを生成する |
| `npm start` | dist 内のバンドルを実行する |
| `npm run di` | 任意の DI 設定をインストールする |

pnpm では `pnpm dev`、`pnpm build` など、Yarn では `yarn dev`、`yarn build` などを使用します。`npm run type` は別のターミナルで実行できますが、必須ではありません。`build` に型チェックが含まれています。

## テストと自動生成

`npm test` を実行します。esbuild が `.test.ts` と `.spec.ts` をトランスパイルし、`node:test` が実行して変更を監視します。初期テストとして `test/example.test.ts` が用意されます。Jest、Vitest、ts-node、tsx はインストールされません。

テストを生成するには、クラスのファイルパスまたは一意に特定できるファイル名を指定します。

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

ジェネレーターは TypeScript AST を解析し、クラス、コンストラクターの依存関係、公開メソッド、`this.repository.save()` などの呼び出しを検出します。推論できる範囲で `t.mock.fn()` によるモックと呼び出しのアサーションを生成します。

クラスごとに単一の `describe`、各メソッドに対してメソッド名の `it` を生成します。業務ルールのアサーションを推論できない場合、メソッドは実行可能なまま、検証を追加するための `// TODO` コメントを残します。`it.todo` やコメントアウトされたテスト本体は生成しません。生成結果を確認し、業務ルールの検証を補ってください。

## 本番ビルド

`npm run build` は `tsc --noEmit`、esbuild によるバンドル、圧縮、ソースマップ生成を順に実行します。概要にはサイズ、入力ファイル数、合計時間が表示されます。`dependencies` と `devDependencies` のパッケージはバンドルに含めず、外部依存として扱います。実行には `npm start` を使用します。

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## 任意の依存性注入

`npm run di` を一度実行します。コンテナーを作成してトランスフォーマーを有効にし、`package.json` から `di` スクリプトを削除します。以降は `dev` と `build` で自動的に動作します。デコレーター、`reflect-metadata`、外部 DI ライブラリは不要です。

`AppConfig` がプロバイダーを登録し、トランスフォーマーが可能な範囲でコンストラクターの依存関係を推論し、`ApplicationContext` が実行時にインスタンスを作成・提供します。設定は通常 `src/di/providers.ts` に置きます。

### インターフェースを使った例

**契約**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**実装**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**ユースケース**

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

**登録**

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

**利用**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

トランスフォーマーが `UserRepository` を `UserRepositoryMemory` に関連付けます。インターフェースは実行時に存在しないため、`useClass<Interface>(Implementation)` で契約を登録し、`container.get()` で具象クラスを解決します。

### 登録とコンテナー API

| API | 動作 |
|---|---|
| `useClass()` | クラスを登録する。契約や抽象クラスにも対応 |
| `createToken<T>()` | symbol のトークンを作成する。同じ定数を保存して再利用する |
| `useValue()` | 既存の値またはインスタンスを登録する |
| `useFactory()` | コンテナーを受け取る関数で依存オブジェクトを生成する |
| `useExisting()` | 別のプロバイダーにトークンを転送し、新しいインスタンスは作らない |
| `imports()` | 他の AppConfig のプロバイダーをコピーする。重複トークンはエラー |
| `providers.has()` | コンテナー作成前に登録を確認する |
| `container.get()` | 依存関係を解決する。未登録ならエラー |
| `container.getOptional()` | 未登録なら undefined を返す |
| `container.has()` | コンテナーにトークンがあるか確認する |
| `container.clearInstances()` | 登録は残してキャッシュを消去する。以前のインスタンスは閉じない |
| `container.close()` | 保存されたシングルトンの dispose() または close() を呼び、キャッシュを消去する |

### スコープと注意点

既定は `singleton` です。最初の解決時にインスタンスを生成し、以降は再利用します。`transient` は解決のたびに新しいインスタンスを生成し、これらは `close()` の管理対象になりません。

`createApplicationContext()` は設定をコピーするため、先にすべての登録とインポートを終えてください。登録メソッドはチェーンできます。型としてのみ使用する契約には `import type` を使います。自動トークンには、名前がありジェネリックでないインターフェースまたは型エイリアスが必要です。プリミティブ値、ジェネリック型、省略可能引数、残余引数、推論できない型には、コンストラクターの引数順にトークンを手動指定します。

未登録・重複トークン、循環依存、生成失敗は `DependencyInjectionError` になります。トランスフォーマーのエラーは `dev` または `build` で表示されます。

## プロジェクト構成

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

DI をインストールすると `kit-dev/di` と `src/di/providers.ts` も追加されます。`kit-dev` はプロジェクト設定の一部なので、Git にコミットできます。

## 要件

Node.js 22 以降と npm、pnpm、または Yarn。グローバルインストールは不要です。

## 詳細リファレンス

各 DI API のその他の例は[英語の完全なリファレンス](./README.md)を参照してください。

## ライセンス

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**設定を減らして、コードを書こう。**
