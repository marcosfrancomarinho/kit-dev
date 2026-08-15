import {
  AppConfig,
  createApplicationContext,
} from './container.js';

const providers = new AppConfig();

/**
 * Registre todos os providers da aplicação neste arquivo.
 *
 * Exemplo:
 *
 * UserController
 *      └── UserService
 *              └── UserRepository
 *
 * 1. Importe as dependências:
 *
 * import { createToken } from './container.js';
 * import type { UserRepository } from
 *   '../domain/user-repository.js';
 * import { InMemoryUserRepository } from
 *   '../infrastructure/in-memory-user-repository.js';
 * import { UserService } from
 *   '../services/user-service.js';
 * import { UserController } from
 *   '../controllers/user-controller.js';
 *
 * 2. Crie um token para a interface:
 *
 * const USER_REPOSITORY =
 *   createToken<UserRepository>('USER_REPOSITORY');
 *
 * 3. Relacione a interface com sua implementação:
 *
 * providers.useClass(
 *   USER_REPOSITORY,
 *   InMemoryUserRepository,
 * );
 *
 * 4. Registre o serviço e informe suas dependências:
 *
 * providers.useClass(
 *   UserService,
 *   [USER_REPOSITORY],
 * );
 *
 * 5. Registre o controller, que depende do serviço:
 *
 * providers.useClass(
 *   UserController,
 *   [UserService],
 * );
 *
 * 6. Recupere o controller no ponto de entrada:
 *
 * const controller = container.get(UserController);
 *
 * O contêiner criará automaticamente:
 *
 * UserController → UserService → InMemoryUserRepository
 */

export const container = createApplicationContext(providers);
