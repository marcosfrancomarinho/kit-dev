import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';

const providers = new AppConfig();

/**
 * Register providers before creating the context.
 *
 * Interface example:
 * providers.useClass<Repository>(RepositoryMemory);
 *
 * Learn more:
 * npm: https://www.npmjs.com/package/create-kit-dev
 * GitHub: https://github.com/marcosfrancomarinho/kit-dev
 */

export const container = createApplicationContext(providers);
