#!/usr/bin/env node
import { CliApplication } from './presentation/cli/cli-application.js';
import { container } from './di/providers.js';

void container.get(CliApplication).run();
