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
 * providers.register(UserRepository, () => new UserRepository());
 *
 * providers.register(
 *   UserService,
 *   (container) => new UserService(container.get(UserRepository)),
 * );
 */

export const container = createApplicationContext(providers);
