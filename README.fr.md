<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr"><strong>Français</strong></a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

Créez des projets Node.js + TypeScript avec développement, compilation de production, tests natifs et injection de dépendances facultative. Kit Dev génère le projet, installe les dépendances et configure les commandes. Vous pouvez l’utiliser sans activer l’injection de dépendances (DI).

## Démarrage rapide

Choisissez une commande :

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

Saisissez le nom du projet, puis exécutez :

```bash
cd my-api
npm run dev
```

## Fonctionnalités incluses

TypeScript en mode `strict` ; esbuild ; redémarrage automatique de Node.js après une recompilation réussie ; vérification des types à la compilation ; minification, source maps et résumé du bundle ; prise en charge de npm, pnpm et Yarn ; tests natifs et DI facultative sans décorateurs.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance l’application et surveille les modifications |
| `npm run type` | Vérifie les types en continu |
| `npm test` | Exécute les tests en mode surveillance ; avec une cible, génère un test |
| `npm run build` | Vérifie les types et génère le bundle de production |
| `npm start` | Exécute le bundle dans dist |
| `npm run di` | Installe la configuration facultative de DI |

Avec pnpm, utilisez `pnpm dev`, `pnpm build`, etc. ; avec Yarn, `yarn dev`, `yarn build`, etc. `npm run type` peut s’exécuter dans un autre terminal et reste facultatif : `build` vérifie déjà les types.

## Tests et génération automatique

Exécutez `npm test`. esbuild transpile les fichiers `.test.ts` et `.spec.ts`, puis `node:test` les exécute en mode surveillance. Un fichier `test/example.test.ts` est fourni. Jest, Vitest, ts-node et tsx ne sont pas installés.

Pour générer un test, indiquez le chemin d’une classe ou un nom de fichier unique :

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

Le générateur analyse l’AST TypeScript pour identifier la classe, les dépendances du constructeur, les méthodes publiques et les appels tels que `this.repository.save()`. Il crée des mocks avec `t.mock.fn()` et des assertions sur les appels lorsqu’il peut les déduire.


## Compilation de production

`npm run build` exécute `tsc --noEmit`, crée le bundle avec esbuild, le minifie et génère une source map. Le résumé indique la taille, le nombre de fichiers d’entrée et la durée totale. Les paquets de `dependencies` et `devDependencies` restent externes au bundle. Lancez le résultat avec `npm start`.

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## Injection de dépendances facultative

Exécutez `npm run di` une seule fois. La commande crée le conteneur, active le transformateur et retire le script `di` de `package.json`. La DI fonctionne ensuite automatiquement avec `dev` et `build`, sans décorateurs, `reflect-metadata` ni bibliothèque externe de DI.

`AppConfig` enregistre les fournisseurs ; le transformateur déduit les dépendances du constructeur lorsque c’est possible ; `ApplicationContext` crée et fournit les instances. La configuration se trouve généralement dans `src/di/providers.ts`.

### Exemple avec une interface

**Contrat**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**Implémentation**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**Cas d’utilisation**

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

**Enregistrement**

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

**Utilisation**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

Le transformateur associe `UserRepository` à `UserRepositoryMemory`. Les interfaces n’existent pas à l’exécution : enregistrez le contrat avec `useClass<Interface>(Implementation)` et résolvez une classe concrète avec `container.get()`.

### Enregistrement et conteneur

| API | Comportement |
|---|---|
| `useClass()` | Enregistre une classe ; accepte aussi des contrats et des classes abstraites |
| `createToken<T>()` | Crée un token symbol ; conservez et réutilisez la même constante |
| `useValue()` | Enregistre une valeur ou une instance existante |
| `useFactory()` | Crée une dépendance via une fonction recevant le conteneur |
| `useExisting()` | Redirige un token vers un autre fournisseur sans créer d’instance |
| `imports()` | Copie les fournisseurs d’autres AppConfig et refuse les tokens dupliqués |
| `providers.has()` | Vérifie un enregistrement avant la création du conteneur |
| `container.get()` | Résout une dépendance ; échoue si elle n’existe pas |
| `container.getOptional()` | Renvoie undefined si la dépendance n’est pas enregistrée |
| `container.has()` | Vérifie la présence du token dans le conteneur |
| `container.clearInstances()` | Vide le cache sans supprimer les fournisseurs ni fermer les anciennes instances |
| `container.close()` | Ferme les singletons conservés via dispose() ou close(), puis vide le cache |

### Portées et règles

La portée par défaut est `singleton` : l’instance est créée à la première résolution, puis réutilisée. `transient` crée une instance à chaque résolution ; ces instances ne sont pas gérées par `close()`.

Enregistrez et importez tous les fournisseurs avant `createApplicationContext()`, qui copie la configuration. Les méthodes d’enregistrement peuvent être chaînées. Utilisez `import type` pour les contrats. Les tokens automatiques nécessitent une interface ou un alias de type nommé et non générique. Pour les primitives, types génériques, paramètres facultatifs ou rest et types non déductibles, fournissez les tokens manuellement dans l’ordre du constructeur.

Les tokens absents ou dupliqués, dépendances circulaires et erreurs de création produisent `DependencyInjectionError`. Les erreurs du transformateur apparaissent pendant `dev` ou `build`.

## Structure du projet

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

L’installation de la DI ajoute aussi `kit-dev/di` et `src/di/providers.ts`. Le dossier `kit-dev` fait partie du projet et peut être suivi par Git.

## Prérequis

Node.js 22 ou ultérieur et npm, pnpm ou Yarn. Aucune installation globale nécessaire.

## Référence détaillée

Consultez la [référence complète en anglais](./README.md) pour davantage d’exemples de chaque API de DI.

## Licence

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**Moins de configuration. Plus de code.**
