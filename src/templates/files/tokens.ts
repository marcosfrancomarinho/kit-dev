import { createToken } from './container.js';

/**
 * Interfaces não existem em tempo de execução. Crie aqui um token
 * para cada interface que será injetada.
 *
 * Exemplo:
 *
 * import type { UserRepository } from '../domain/user-repository.js';
 *
 * export const USER_REPOSITORY = createToken<UserRepository>('USER_REPOSITORY');
 *
 * Em `providers.ts`, ligue o token à classe que implementa a interface.
 */
