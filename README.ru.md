<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru"><strong>Русский</strong></a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

Создавайте проекты Node.js + TypeScript с режимом разработки, производственной сборкой, встроенными тестами и необязательным внедрением зависимостей. Kit Dev создаёт проект, устанавливает зависимости и настраивает команды. Внедрение зависимостей (DI) включать необязательно.

## Быстрый старт

Выберите одну из команд:

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

Введите имя проекта, затем выполните:

```bash
cd my-api
npm run dev
```

## Возможности

TypeScript в режиме `strict`; esbuild; автоматический перезапуск Node.js после успешной пересборки; проверка типов при производственной сборке; минификация, отдельная карта исходного кода и сводка сборки; поддержка npm, pnpm и Yarn; встроенные тесты и необязательный DI без декораторов.

## Команды

| Команда | Назначение |
|---|---|
| `npm run dev` | Запускает приложение и отслеживает изменения |
| `npm run type` | Непрерывно проверяет типы TypeScript |
| `npm test` | Запускает тесты с отслеживанием изменений; при указании цели создаёт тест |
| `npm run build` | Проверяет типы и создаёт производственную сборку |
| `npm start` | Запускает сборку из dist |
| `npm run di` | Устанавливает необязательную конфигурацию DI |

Для pnpm используйте `pnpm dev`, `pnpm build` и т. д.; для Yarn — `yarn dev`, `yarn build` и т. д. `npm run type` можно запустить в другом терминале. Это необязательно: `build` уже проверяет типы.

## Тесты и автоматическая генерация

Выполните `npm test`. esbuild транспилирует файлы `.test.ts` и `.spec.ts`, затем `node:test` выполняет их и отслеживает изменения. Проект содержит `test/example.test.ts`. Jest, Vitest, ts-node и tsx не устанавливаются.

Чтобы создать тест, укажите путь к файлу класса или уникальное имя исходного файла:

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

Генератор анализирует AST TypeScript: определяет класс, зависимости конструктора, публичные методы и вызовы наподобие `this.repository.save()`. Если это можно вывести из структуры, он создаёт моки через `t.mock.fn()` и проверки вызовов.

Для класса создаётся один `describe`, а для каждого метода — `it` с его именем. Если проверки бизнес-логики вывести нельзя, метод остаётся исполняемым с комментарием `// TODO` для добавления проверок. `it.todo` и закомментированные тела тестов не создаются. Проверьте результат и дополните проверки бизнес-правил.

## Производственная сборка

`npm run build` последовательно запускает `tsc --noEmit`, сборку esbuild, минификацию и создание карты исходного кода. Сводка показывает размер, количество входных файлов и общее время. Пакеты из `dependencies` и `devDependencies` остаются внешними и не включаются в bundle. Запустите результат через `npm start`.

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## Необязательное внедрение зависимостей

Один раз выполните `npm run di`. Команда создаёт контейнер, включает трансформер и удаляет скрипт `di` из `package.json`. Далее DI автоматически работает с `dev` и `build`, без декораторов, `reflect-metadata` и сторонних DI-библиотек.

`AppConfig` регистрирует провайдеры; трансформер по возможности выводит зависимости конструктора из типов; `ApplicationContext` создаёт и предоставляет экземпляры во время выполнения. Конфигурация обычно находится в `src/di/providers.ts`.

### Пример с интерфейсом

**Контракт**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**Реализация**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**Сценарий использования**

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

**Регистрация**

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

**Использование**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

Трансформер связывает `UserRepository` с `UserRepositoryMemory`. Интерфейсов нет во время выполнения: регистрируйте контракт через `useClass<Interface>(Implementation)`, а конкретный класс получайте через `container.get()`.

### Регистрация и контейнер

| API | Поведение |
|---|---|
| `useClass()` | Регистрирует класс; также поддерживает контракты и абстрактные классы |
| `createToken<T>()` | Создаёт токен symbol; сохраните и повторно используйте ту же константу |
| `useValue()` | Регистрирует существующее значение или экземпляр |
| `useFactory()` | Создаёт зависимость через функцию, получающую контейнер |
| `useExisting()` | Перенаправляет токен к другому провайдеру без создания экземпляра |
| `imports()` | Копирует провайдеры других AppConfig; повторные токены запрещены |
| `providers.has()` | Проверяет регистрацию до создания контейнера |
| `container.get()` | Возвращает зависимость; при отсутствии регистрации выдаёт ошибку |
| `container.getOptional()` | Возвращает undefined, если регистрации нет |
| `container.has()` | Проверяет наличие токена в контейнере |
| `container.clearInstances()` | Очищает кэш, сохраняя регистрации и не закрывая прежние экземпляры |
| `container.close()` | Вызывает dispose() или close() у сохранённых singleton-экземпляров и очищает кэш |

### Области действия и правила

По умолчанию используется `singleton`: экземпляр создаётся при первом запросе и затем используется повторно. `transient` создаёт новый экземпляр при каждом запросе; `close()` не управляет такими экземплярами.

Зарегистрируйте и импортируйте все провайдеры до вызова `createApplicationContext()`, который копирует конфигурацию. Методы регистрации можно объединять в цепочки. Для контрактов используйте `import type`. Автоматические токены требуют именованных интерфейсов или псевдонимов типов без обобщений. Для примитивов, обобщённых типов, необязательных и остаточных параметров, а также невыводимых типов указывайте токены вручную в порядке параметров конструктора.

Отсутствующие или повторные токены, циклические зависимости и ошибки создания приводят к `DependencyInjectionError`. Ошибки трансформера выводятся при `dev` или `build`.

## Структура проекта

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

Установка DI добавляет `kit-dev/di` и `src/di/providers.ts`. Каталог `kit-dev` входит в конфигурацию проекта и может храниться в Git.

## Требования

Node.js 22 или новее и npm, pnpm либо Yarn. Глобальная установка не требуется.

## Подробный справочник

Дополнительные примеры для каждого DI API приведены в [полном справочнике на английском](./README.md).

## Лицензия

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**Меньше настройки. Больше кода.**
