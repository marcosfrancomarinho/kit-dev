import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';

const providers = new AppConfig();

/**
 * Register providers before creating the context.
 *
 * providers.useClass(Service); // concrete class
 * providers.useClass<Repository>(RepositoryMemory); // interface
 * providers.useClass(AbstractRepository, RepositoryMemory); // abstract class
 * providers.useValue(APP_NAME, 'Kit Dev'); // value
 * providers.useClass(ConfigService, [APP_NAME]); // explicit token
 * providers.useFactory(Database, (context) => new Database(context.get(DATABASE_URL))); // factory
 * providers.useExisting(PRIMARY_DATABASE, Database); // alias
 * providers.imports(databaseProviders); // another configuration
 *
 * Constructor dependencies are inferred. Pass tokens explicitly only for
 * primitive values. Providers are singleton by default. Resolve concrete
 * classes with `container.get(Service)`.
 */

export const container = createApplicationContext(providers);
