import {
  AppConfig,
  createApplicationContext,
} from '../../.kit-dev/container.js';

const providers = new AppConfig();

/**
 * COMPOSIÇÃO DAS DEPENDÊNCIAS
 *
 * Importe interfaces com `import type` e classes com import normal:
 *
 * import type { UserRepository } from '../domain/user-repository.js';
 * import { UserRepositoryMemory } from '../infra/user-repository-memory.js';
 * import { CreateUser } from '../application/create-user.js';
 *
 * 1. Interface -> implementação
 *
 * O argumento genérico representa a interface. O Kit Dev cria o token interno
 * automaticamente, portanto você não precisa declarar Symbol nem string:
 *
 * providers.useClass<UserRepository>(UserRepositoryMemory);
 *
 * 2. Classes concretas
 *
 * Registre cada classe que será criada pelo container usando a própria classe
 * como token:
 *
 * providers.useClass(EmailService);
 * providers.useClass(CreateUser);
 *
 * As dependências são declaradas normalmente no construtor:
 *
 * class CreateUser {
 *   constructor(
 *     private readonly repository: UserRepository,
 *     private readonly emailService: EmailService,
 *   ) {}
 * }
 *
 * O transformer identifica esses tipos e injeta as instâncias. Não é necessário
 * passar `[UserRepository, EmailService]`.
 *
 * 3. Strings, números e outros valores primitivos
 *
 * Valores primitivos precisam de um token e de uma lista explícita:
 *
 * const APP_NAME = 'APP_NAME';
 * providers.useValue(APP_NAME, 'Kit Dev');
 * providers.useClass(ConfigService, [APP_NAME]);
 *
 * 4. Factories e providers existentes
 *
 * providers.useFactory(Database, (context) => {
 *   const url = context.get(DATABASE_URL);
 *   return new Database(url);
 * });
 *
 * providers.useExisting(PRIMARY_DATABASE, Database);
 *
 * O escopo padrão é singleton. Para uma factory transient:
 *
 * providers.useFactory(RequestContext, () => new RequestContext(), {
 *   scope: 'transient',
 * });
 *
 * 5. Resolução
 *
 * Em `src/main.ts`, recupere uma classe concreta:
 *
 * const createUser = container.get(CreateUser);
 * await createUser.execute('Marcos');
 *
 * Não use `container.get(UserRepository)`: interfaces existem somente durante
 * a análise TypeScript. O escopo padrão de todos os providers é singleton.
 *
 * IMPORTANTE: mantenha todos os registros acima da criação do contexto abaixo.
 */

export const container = createApplicationContext(providers);
