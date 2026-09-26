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
  <a href="./README.de.md" lang="de"><strong>Deutsch</strong></a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

Erstelle Node.js- und TypeScript-Projekte mit Entwicklungsmodus, Produktionsbuilds, nativen Tests und optionaler Dependency Injection. Kit Dev erzeugt das Projekt, installiert Abhängigkeiten und richtet die Befehle ein. Dependency Injection (DI) muss dafür nicht aktiviert werden.

## Schnellstart

Wähle einen dieser Befehle:

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

Gib den Projektnamen ein und führe anschließend Folgendes aus:

```bash
cd my-api
npm run dev
```

## Enthaltene Funktionen

TypeScript im `strict`-Modus; esbuild; automatischer Neustart von Node.js nach erfolgreichem Neubuild; Typprüfung beim Produktionsbuild; Minifizierung, Source Maps und Bundle-Zusammenfassung; Unterstützung für npm, pnpm und Yarn; native Tests und optionale DI ohne Dekoratoren.

## Befehle

| Befehl | Funktion |
|---|---|
| `npm run dev` | Startet die Anwendung und überwacht Änderungen |
| `npm run type` | Prüft Typen fortlaufend |
| `npm test` | Führt Tests im Watch-Modus aus; mit Ziel wird ein Test erzeugt |
| `npm run build` | Prüft Typen und erstellt das Produktionsbundle |
| `npm start` | Startet das Bundle aus dist |
| `npm run di` | Installiert die optionale DI-Konfiguration |

Mit pnpm verwendest du `pnpm dev`, `pnpm build` usw.; mit Yarn `yarn dev`, `yarn build` usw. `npm run type` kann in einem separaten Terminal laufen und ist optional: `build` prüft die Typen bereits.

## Tests und automatische Generierung

Führe `npm test` aus. esbuild transpiliert `.test.ts`- und `.spec.ts`-Dateien, anschließend führt `node:test` sie im Watch-Modus aus. `test/example.test.ts` ist enthalten. Jest, Vitest, ts-node und tsx werden nicht installiert.

Zum Generieren eines Tests gibst du den Pfad einer Klasse oder einen eindeutigen Dateinamen an:

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

Der Generator untersucht den TypeScript-AST und erkennt die Klasse, Konstruktorabhängigkeiten, öffentliche Methoden und Aufrufe wie `this.repository.save()`. Soweit ableitbar, erzeugt er Mocks mit `t.mock.fn()` und Assertions für die Aufrufe.

Generierte Tests verwenden ein einzelnes `describe` für die Klasse und ein nach der jeweiligen Methode benanntes `it`. Lassen sich fachliche Assertions nicht ableiten, bleibt die Methode ausführbar und erhält einen `// TODO`-Kommentar. Es entstehen weder `it.todo` noch auskommentierte Testkörper. Prüfe die Tests und ergänze die fachlichen Prüfungen.

## Produktionsbuild

`npm run build` führt `tsc --noEmit` aus, bündelt mit esbuild, minifiziert das Ergebnis und erzeugt eine Source Map. Die Zusammenfassung zeigt Größe, Anzahl der Eingabedateien und Gesamtdauer. Pakete in `dependencies` und `devDependencies` bleiben außerhalb des Bundles. Starte das Ergebnis mit `npm start`.

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## Optionale Dependency Injection

Führe `npm run di` einmal aus. Der Befehl erstellt den Container, aktiviert den Transformer und entfernt das Skript `di` aus `package.json`. Danach funktioniert DI automatisch mit `dev` und `build`, ohne Dekoratoren, `reflect-metadata` oder externe DI-Bibliotheken.

`AppConfig` registriert Provider; der Transformer leitet Konstruktorabhängigkeiten nach Möglichkeit ab; `ApplicationContext` erzeugt Instanzen und stellt sie bereit. Die Konfiguration liegt normalerweise in `src/di/providers.ts`.

### Beispiel mit Interface

**Vertrag**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**Implementierung**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**Anwendungsfall**

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

**Registrierung**

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

**Verwendung**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

Der Transformer verbindet `UserRepository` mit `UserRepositoryMemory`. Interfaces existieren zur Laufzeit nicht: Registriere den Vertrag mit `useClass<Interface>(Implementation)` und löse eine konkrete Klasse mit `container.get()` auf.

### Registrierung und Container

| API | Verhalten |
|---|---|
| `useClass()` | Registriert eine Klasse; unterstützt auch Verträge und abstrakte Klassen |
| `createToken<T>()` | Erzeugt ein Symbol als Token; dieselbe Konstante aufbewahren und wiederverwenden |
| `useValue()` | Registriert einen vorhandenen Wert oder eine Instanz |
| `useFactory()` | Erzeugt eine Abhängigkeit über eine Funktion, die den Container erhält |
| `useExisting()` | Leitet ein Token an einen anderen Provider weiter, ohne eine Instanz zu erzeugen |
| `imports()` | Kopiert Provider anderer AppConfig-Objekte; doppelte Tokens werden abgelehnt |
| `providers.has()` | Prüft eine Registrierung vor dem Erstellen des Containers |
| `container.get()` | Löst eine Abhängigkeit auf; Fehler bei fehlendem Token |
| `container.getOptional()` | Liefert undefined, wenn keine Registrierung besteht |
| `container.has()` | Prüft, ob das Token im Container vorhanden ist |
| `container.clearInstances()` | Leert den Cache, ohne Registrierungen zu entfernen oder bisherige Instanzen zu schließen |
| `container.close()` | Schließt gespeicherte Singletons mit dispose() oder close() und leert den Cache |

### Gültigkeitsbereiche und Regeln

Standard ist `singleton`: Die Instanz entsteht bei der ersten Auflösung und wird wiederverwendet. `transient` erzeugt bei jeder Auflösung eine neue Instanz; diese Instanzen werden nicht durch `close()` verwaltet.

Registriere und importiere alle Provider vor `createApplicationContext()`, da dabei die Konfiguration kopiert wird. Registrierungsmethoden lassen sich verketten. Verwende `import type` für Verträge. Automatische Tokens benötigen benannte, nicht generische Interfaces oder Typaliase. Für primitive Werte, generische Typen, optionale oder Restparameter und nicht ableitbare Typen müssen Tokens manuell in Konstruktorreihenfolge angegeben werden.

Fehlende oder doppelte Tokens, zirkuläre Abhängigkeiten und Erstellungsfehler führen zu `DependencyInjectionError`. Transformerfehler erscheinen während `dev` oder `build`.

## Projektstruktur

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

Die DI-Installation ergänzt `kit-dev/di` und `src/di/providers.ts`. Das Verzeichnis `kit-dev` gehört zur Projektkonfiguration und kann in Git aufgenommen werden.

## Voraussetzungen

Node.js 22 oder neuer und npm, pnpm oder Yarn. Keine globale Installation erforderlich.

## Ausführliche Referenz

Weitere Beispiele zu jeder DI-API findest du in der [vollständigen englischen Referenz](./README.md).

## Lizenz

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**Weniger Konfiguration. Mehr Code.**
