import { CliApplication } from './presentation/cli/cli-application.js';
import { container } from './di/providers.js';

await container.get(CliApplication).run();
