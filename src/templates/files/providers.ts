import {
  AppConfig,
  createApplicationContext,
} from './container.js';

const providers = new AppConfig();

/*
 * Registre todos os providers da aplicação neste arquivo.
 *
 * Exemplo:
 *
 * providers.useClass(USER_REPOSITORY, InMemoryUserRepository);
 *
 * providers.useClass(
 *   UserService,
 *   [USER_REPOSITORY],
 * );
 */

export const container = createApplicationContext(providers);
