<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn"><strong>বাংলা</strong></a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

ডেভেলপমেন্ট, প্রোডাকশন বিল্ড, নেটিভ টেস্ট এবং ঐচ্ছিক ডিপেনডেন্সি ইনজেকশনসহ Node.js + TypeScript প্রজেক্ট তৈরি করুন। Kit Dev প্রজেক্ট তৈরি করে, ডিপেনডেন্সি ইনস্টল করে এবং কমান্ড কনফিগার করে। ডিপেনডেন্সি ইনজেকশন (DI) চালু করা বাধ্যতামূলক নয়।

## দ্রুত শুরু

নিচের যেকোনো একটি কমান্ড বেছে নিন:

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

প্রজেক্টের নাম লিখে চালান:

```bash
cd my-api
npm run dev
```

## অন্তর্ভুক্ত সুবিধা

TypeScript-এর `strict` মোড; esbuild; সফল পুনর্নির্মাণের পরে Node.js স্বয়ংক্রিয়ভাবে রিস্টার্ট; প্রোডাকশন বিল্ডে টাইপ পরীক্ষা; মিনিফিকেশন, আলাদা source map এবং bundle-এর সারসংক্ষেপ; npm, pnpm ও Yarn সমর্থন; নেটিভ টেস্ট এবং ডেকোরেটর ছাড়া ঐচ্ছিক DI।

## কমান্ড

| কমান্ড | কাজ |
|---|---|
| `npm run dev` | অ্যাপ চালায় এবং পরিবর্তন পর্যবেক্ষণ করে |
| `npm run type` | ক্রমাগত TypeScript-এর টাইপ পরীক্ষা করে |
| `npm test` | পরিবর্তন পর্যবেক্ষণ করে টেস্ট চালায়; লক্ষ্য দিলে টেস্ট তৈরি করে |
| `npm run build` | টাইপ পরীক্ষা করে প্রোডাকশন bundle তৈরি করে |
| `npm start` | dist-এর bundle চালায় |
| `npm run di` | ঐচ্ছিক DI কনফিগারেশন ইনস্টল করে |

pnpm ব্যবহার করলে `pnpm dev`, `pnpm build` ইত্যাদি এবং Yarn ব্যবহার করলে `yarn dev`, `yarn build` ইত্যাদি চালান। `npm run type` আলাদা টার্মিনালে চালানো যায়। এটি ঐচ্ছিক, কারণ `build` নিজেই টাইপ পরীক্ষা করে।

## টেস্ট এবং স্বয়ংক্রিয় তৈরি

`npm test` চালান। esbuild `.test.ts` ও `.spec.ts` ফাইল ট্রান্সপাইল করে, আর `node:test` সেগুলো চালিয়ে পরিবর্তন পর্যবেক্ষণ করে। প্রাথমিক টেস্ট থাকে `test/example.test.ts`-এ। Jest, Vitest, ts-node বা tsx ইনস্টল করা হয় না।

টেস্ট তৈরি করতে ক্লাসের ফাইলের পথ অথবা একটিমাত্র সোর্স ফাইলকে শনাক্ত করে এমন নাম দিন:

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

জেনারেটর TypeScript AST বিশ্লেষণ করে ক্লাস, কনস্ট্রাক্টরের ডিপেনডেন্সি, পাবলিক মেথড এবং `this.repository.save()`-এর মতো কল শনাক্ত করে। অনুমান করা সম্ভব হলে `t.mock.fn()` দিয়ে মক এবং কল যাচাইয়ের assertion তৈরি করে।

প্রতিটি ক্লাসের জন্য একটি `describe` এবং প্রতিটি মেথডের নামে একটি `it` তৈরি হয়। ব্যবসায়িক নিয়মের assertion অনুমান করা না গেলে মেথড চালানোর উপযোগী থাকে এবং যাচাই যোগ করার জন্য `// TODO` মন্তব্য থাকে। `it.todo` বা মন্তব্য করে নিষ্ক্রিয় করা টেস্ট বডি তৈরি হয় না। তৈরি হওয়া টেস্ট পর্যালোচনা করুন এবং ব্যবসায়িক নিয়মের যাচাই সম্পূর্ণ করুন।

## প্রোডাকশন বিল্ড

`npm run build` পর্যায়ক্রমে `tsc --noEmit`, esbuild bundling, মিনিফিকেশন এবং source map তৈরি করে। সারসংক্ষেপে আকার, ইনপুট ফাইলের সংখ্যা এবং মোট সময় দেখায়। `dependencies` ও `devDependencies`-এর প্যাকেজ bundle-এর বাইরে থাকে। ফলাফল চালাতে `npm start` ব্যবহার করুন।

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## ঐচ্ছিক ডিপেনডেন্সি ইনজেকশন

একবার `npm run di` চালান। এটি কনটেইনার তৈরি করে, ট্রান্সফর্মার চালু করে এবং `package.json` থেকে `di` স্ক্রিপ্ট সরিয়ে দেয়। এরপর DI স্বয়ংক্রিয়ভাবে `dev` ও `build`-এর সঙ্গে কাজ করে। ডেকোরেটর, `reflect-metadata` বা বাইরের DI লাইব্রেরি লাগে না।

`AppConfig` প্রোভাইডার নিবন্ধন করে; ট্রান্সফর্মার সম্ভব হলে কনস্ট্রাক্টরের ডিপেনডেন্সি অনুমান করে; `ApplicationContext` রানটাইমে ইনস্ট্যান্স তৈরি করে এবং সরবরাহ করে। কনফিগারেশন সাধারণত `src/di/providers.ts`-এ থাকে।

### ইন্টারফেসের উদাহরণ

**চুক্তি**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**বাস্তবায়ন**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**ইউজ কেস**

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

**নিবন্ধন**

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

**ব্যবহার**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

ট্রান্সফর্মার `UserRepository`-কে `UserRepositoryMemory`-এর সঙ্গে যুক্ত করে। রানটাইমে ইন্টারফেস থাকে না: `useClass<Interface>(Implementation)` দিয়ে চুক্তি নিবন্ধন করুন এবং `container.get()` দিয়ে নির্দিষ্ট ক্লাসের ইনস্ট্যান্স নিন।

### নিবন্ধন ও কনটেইনার

| API | আচরণ |
|---|---|
| `useClass()` | ক্লাস নিবন্ধন করে; চুক্তি ও abstract ক্লাসও সমর্থিত |
| `createToken<T>()` | symbol টোকন তৈরি করে; একই constant সংরক্ষণ করে পুনরায় ব্যবহার করুন |
| `useValue()` | বিদ্যমান মান বা ইনস্ট্যান্স নিবন্ধন করে |
| `useFactory()` | কনটেইনার গ্রহণকারী ফাংশনের মাধ্যমে ডিপেনডেন্সি তৈরি করে |
| `useExisting()` | নতুন ইনস্ট্যান্স না বানিয়ে টোকনকে অন্য প্রোভাইডারে পাঠায় |
| `imports()` | অন্য AppConfig-এর প্রোভাইডার কপি করে; ডুপ্লিকেট টোকন প্রত্যাখ্যান করে |
| `providers.has()` | কনটেইনার তৈরির আগে নিবন্ধন পরীক্ষা করে |
| `container.get()` | ডিপেনডেন্সি দেয়; নিবন্ধন না থাকলে ত্রুটি দেখায় |
| `container.getOptional()` | নিবন্ধন না থাকলে undefined দেয় |
| `container.has()` | কনটেইনারে টোকন আছে কি না পরীক্ষা করে |
| `container.clearInstances()` | নিবন্ধন না সরিয়ে বা আগের ইনস্ট্যান্স বন্ধ না করে ক্যাশ পরিষ্কার করে |
| `container.close()` | সংরক্ষিত singleton-এর dispose() বা close() চালিয়ে ক্যাশ পরিষ্কার করে |

### স্কোপ ও নিয়ম

ডিফল্ট স্কোপ `singleton`: প্রথমবার চাওয়ার সময় ইনস্ট্যান্স তৈরি হয় এবং পরে সেটিই পুনরায় ব্যবহৃত হয়। `transient` প্রতিবার নতুন ইনস্ট্যান্স তৈরি করে; `close()` সেগুলো পরিচালনা করে না।

`createApplicationContext()` কনফিগারেশন কপি করে, তাই তার আগে সব প্রোভাইডার নিবন্ধন ও ইমপোর্ট করুন। নিবন্ধনের মেথড চেইন করা যায়। চুক্তির জন্য `import type` ব্যবহার করুন। স্বয়ংক্রিয় টোকেনের জন্য নামযুক্ত non-generic ইন্টারফেস বা type alias দরকার। primitive মান, generic টাইপ, optional বা rest প্যারামিটার এবং অনুমান করা যায় না এমন টাইপের জন্য কনস্ট্রাক্টরের ক্রমে টোকন নিজে দিন।

অনুপস্থিত বা ডুপ্লিকেট টোকন, চক্রাকার ডিপেনডেন্সি এবং ইনস্ট্যান্স তৈরি ব্যর্থ হলে `DependencyInjectionError` হয়। ট্রান্সফর্মারের ত্রুটি `dev` বা `build` চলাকালে দেখা যায়।

## প্রজেক্টের কাঠামো

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

DI ইনস্টল করলে `kit-dev/di` এবং `src/di/providers.ts` যোগ হয়। `kit-dev` প্রজেক্ট কনফিগারেশনের অংশ এবং Git-এ কমিট করা যায়।

## প্রয়োজনীয়তা

Node.js 22 বা পরবর্তী সংস্করণ এবং npm, pnpm বা Yarn। গ্লোবাল ইনস্টলেশন লাগে না।

## বিস্তারিত তথ্য

প্রতিটি DI API-এর আরও উদাহরণের জন্য [ইংরেজিতে সম্পূর্ণ রেফারেন্স](./README.md) দেখুন।

## লাইসেন্স

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**কম কনফিগারেশন। বেশি কোড।**
