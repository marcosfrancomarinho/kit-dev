import {
  AppConfig,
  createApplicationContext,
} from './container.js';

const providers = new AppConfig();

/**
 * Registre aqui as dependências da aplicação.
 *
 * 1. Ligue o token à sua implementação:
 *
 * providers.useClass(USER_REPOSITORY, InMemoryUserRepository);
 *
 * 2. Informe as dependências do construtor, na mesma ordem:
 *
 * providers.useClass(UserService, [USER_REPOSITORY]);
 *
 * 3. Recupere a classe onde precisar:
 *
 * container.get(UserService);
 *
 * Importe os tokens de `tokens.ts` e as classes antes de registrá-los.
 */

export const container = createApplicationContext(providers);
