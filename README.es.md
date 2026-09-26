<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es"><strong>Español</strong></a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

Crea proyectos Node.js + TypeScript con desarrollo, compilación para producción, pruebas nativas e inyección de dependencias opcional. Kit Dev genera el proyecto, instala las dependencias y configura los comandos. Puedes usarlo sin activar la inyección de dependencias (DI).

## Inicio rápido

Elige uno de estos comandos:

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

Introduce el nombre del proyecto y ejecuta:

```bash
cd my-api
npm run dev
```

## Funciones incluidas

TypeScript en modo `strict`; esbuild; reinicio automático de Node.js tras una recompilación correcta; comprobación de tipos durante la compilación; minificación, mapas de código fuente y resumen del bundle; compatibilidad con npm, pnpm y Yarn; pruebas nativas y DI opcional sin decoradores.

## Comandos

| Comando | Función |
|---|---|
| `npm run dev` | Ejecuta la aplicación y observa los cambios |
| `npm run type` | Comprueba los tipos continuamente |
| `npm test` | Ejecuta las pruebas en modo observación; con un destino, genera una prueba |
| `npm run build` | Comprueba los tipos y genera el bundle de producción |
| `npm start` | Ejecuta el bundle de dist |
| `npm run di` | Instala la configuración opcional de DI |

Con pnpm utiliza `pnpm dev`, `pnpm build`, etc.; con Yarn, `yarn dev`, `yarn build`, etc. `npm run type` puede ejecutarse en otra terminal y es opcional: `build` ya comprueba los tipos.

## Pruebas y generación automática

Ejecuta `npm test`. esbuild transpila los archivos `.test.ts` y `.spec.ts`, y `node:test` los ejecuta en modo observación. Se incluye `test/example.test.ts`. No se instalan Jest, Vitest, ts-node ni tsx.

Para generar una prueba, indica la ruta de una clase o un nombre de archivo único:

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

El generador analiza el AST de TypeScript para identificar la clase, sus dependencias, métodos públicos y llamadas como `this.repository.save()`. Crea mocks con `t.mock.fn()` y verificaciones de llamadas cuando puede inferirlas.


## Compilación para producción

`npm run build` ejecuta `tsc --noEmit`, genera el bundle con esbuild, lo minifica y crea un mapa de código fuente. El resumen muestra el tamaño, los archivos de entrada y el tiempo total. Las dependencias de `dependencies` y `devDependencies` quedan fuera del bundle. Ejecuta el resultado con `npm start`.

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## Inyección de dependencias opcional

Ejecuta `npm run di` una sola vez. El comando crea el contenedor, activa el transformador y elimina el script `di` de `package.json`. Después funciona automáticamente con `dev` y `build`, sin decoradores, `reflect-metadata` ni bibliotecas externas de DI.

`AppConfig` registra los proveedores; el transformador infiere las dependencias del constructor cuando es posible; `ApplicationContext` crea y proporciona las instancias. La configuración suele estar en `src/di/providers.ts`.

### Ejemplo con una interfaz

**Contrato**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**Implementación**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**Caso de uso**

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

**Registro**

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

**Uso**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

El transformador vincula `UserRepository` con `UserRepositoryMemory`. Las interfaces no existen en tiempo de ejecución: registra el contrato con `useClass<Interface>(Implementation)` y resuelve una clase concreta con `container.get()`.

### Registro y contenedor

| API | Comportamiento |
|---|---|
| `useClass()` | Registra una clase; también admite contratos y clases abstractas |
| `createToken<T>()` | Crea un token symbol; conserva y reutiliza la misma constante |
| `useValue()` | Registra un valor o una instancia existente |
| `useFactory()` | Crea una dependencia con una función que recibe el contenedor |
| `useExisting()` | Redirige un token a otro proveedor, sin crear otra instancia |
| `imports()` | Copia los proveedores de otros AppConfig; rechaza tokens duplicados |
| `providers.has()` | Comprueba un registro antes de crear el contenedor |
| `container.get()` | Resuelve una dependencia; falla si no existe |
| `container.getOptional()` | Devuelve undefined si no está registrada |
| `container.has()` | Comprueba si el token está en el contenedor |
| `container.clearInstances()` | Vacía la caché sin eliminar registros ni cerrar instancias anteriores |
| `container.close()` | Cierra los singletons almacenados mediante dispose() o close() y vacía la caché |

### Ámbitos y reglas

El ámbito predeterminado es `singleton`: la instancia se crea al resolverla por primera vez y se reutiliza. `transient` crea una instancia en cada resolución; estas instancias no son gestionadas por `close()`.

Registra e importa todos los proveedores antes de llamar a `createApplicationContext()`, que copia la configuración. Los métodos de registro permiten encadenamiento. Usa `import type` para contratos. Los tokens automáticos requieren interfaces o alias de tipo con nombre y no genéricos. Para valores primitivos, tipos genéricos, parámetros opcionales o rest y tipos no inferibles, proporciona los tokens manualmente en el orden del constructor.

Los tokens ausentes o duplicados, las dependencias circulares y los errores de creación producen `DependencyInjectionError`. Los errores del transformador aparecen durante `dev` o `build`.

## Estructura del proyecto

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

Al instalar DI también se añaden `kit-dev/di` y `src/di/providers.ts`. El directorio `kit-dev` forma parte del proyecto y puede incluirse en Git.

## Requisitos

Node.js 22 o superior y npm, pnpm o Yarn. No requiere instalación global.

## Referencia ampliada

Consulta la [referencia completa en inglés](./README.md) para ver más ejemplos de cada API de DI.

## Licencia

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**Menos configuración. Más código.**
