import {
  AppConfig,
  createApplicationContext,
} from './container.js';

const providers = new AppConfig();

/**
 * Registre aqui as dependências da aplicação.
 *
 * 1. Associe a interface à implementação sem criar token manual:
 *
 * providers.useClass<UserRepository>(InMemoryUserRepository);
 *
 * 2. Registre as classes concretas normalmente:
 *
 * providers.useClass(UserService);
 *
 * O build identifica os tipos do construtor e injeta as dependências
 * automaticamente, sem decorators e sem reflect-metadata.
 *
 * 3. Recupere a classe raiz onde precisar:
 *
 * container.get(UserService);
 *
 * Use `import type` para importar interfaces e import normal para classes.
 */

export const container = createApplicationContext(providers);
