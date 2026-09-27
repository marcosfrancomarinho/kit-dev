const definitionsByConfig = new WeakMap();

export class DependencyInjectionError extends Error {
  constructor(message, options) {
    super(message);
    this.name = 'DependencyInjectionError';

    if (options && 'cause' in options) {
      this.cause = options.cause;
    }
  }
}

export function createToken(description) {
  return Symbol(description);
}

export class AppConfig {
  constructor() {
    definitionsByConfig.set(this, new Map());
  }

  useFactory(token, factory, options = {}) {
    return addDefinition(this, token, {
      kind: 'factory',
      factory,
      scope: options.scope ?? 'singleton',
    });
  }

  useClass(
    tokenOrTarget,
    targetOrDependencies,
    dependenciesOrOptions,
    options = {},
  ) {
    const hasExplicitToken = typeof targetOrDependencies === 'function';

    if (!hasExplicitToken && typeof tokenOrTarget !== 'function') {
      throw new DependencyInjectionError(
        'useClass() must receive a class or a token followed by a class.',
      );
    }

    const token = tokenOrTarget;
    const target = hasExplicitToken ? targetOrDependencies : tokenOrTarget;
    const dependencies = hasExplicitToken
      ? isDependencyList(dependenciesOrOptions)
        ? dependenciesOrOptions
        : []
      : targetOrDependencies ?? [];
    const beanOptions = hasExplicitToken
      ? isDependencyList(dependenciesOrOptions)
        ? options
        : dependenciesOrOptions ?? options
      : isDependencyList(dependenciesOrOptions)
        ? {}
        : dependenciesOrOptions ?? {};

    return this.useFactory(
      token,
      (context) => {
        const resolvedDependencies = dependencies.map((dependency) =>
          context.get(dependency),
        );

        return new target(...resolvedDependencies);
      },
      beanOptions,
    );
  }

  useValue(token, value) {
    return addDefinition(this, token, {
      kind: 'value',
      value,
    });
  }

  useExisting(token, existingToken) {
    return addDefinition(this, token, {
      kind: 'alias',
      existingToken,
    });
  }

  imports(...configs) {
    for (const config of configs) {
      for (const [token, definition] of getDefinitions(config)) {
        addDefinition(this, token, definition);
      }
    }

    return this;
  }

  has(token) {
    return getDefinitions(this).has(token);
  }
}

export class ApplicationContext {
  definitions;
  instances = new Map();
  resolutionStack = [];

  constructor(config) {
    this.definitions = new Map(getDefinitions(config));
  }

  get(token) {
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }

    const cycleStart = this.resolutionStack.indexOf(token);

    if (cycleStart >= 0) {
      const cycle = [...this.resolutionStack.slice(cycleStart), token]
        .map(formatToken)
        .join(' -> ');

      throw new DependencyInjectionError(
        `Circular dependency detected: ${cycle}`,
      );
    }

    const definition = this.definitions.get(token);

    if (!definition) {
      throw new DependencyInjectionError(
        `No bean found for ${formatToken(token)}.`,
      );
    }

    this.resolutionStack.push(token);

    try {
      if (definition.kind === 'alias') {
        return this.get(definition.existingToken);
      }

      const instance =
        definition.kind === 'value'
          ? definition.value
          : this.executeFactory(token, definition.factory);

      if (definition.kind === 'value' || definition.scope === 'singleton') {
        this.instances.set(token, instance);
      }

      return instance;
    } finally {
      this.resolutionStack.pop();
    }
  }

  getOptional(token) {
    if (!this.definitions.has(token)) {
      return undefined;
    }

    return this.get(token);
  }

  has(token) {
    return this.definitions.has(token);
  }

  clearInstances() {
    this.instances.clear();
  }

  async close() {
    const disposed = new Set();
    const instances = [...this.instances.values()].reverse();

    for (const instance of instances) {
      if (
        instance === null ||
        (typeof instance !== 'object' && typeof instance !== 'function') ||
        disposed.has(instance)
      ) {
        continue;
      }

      disposed.add(instance);

      if (typeof instance.dispose === 'function') {
        await instance.dispose();
      } else if (typeof instance.close === 'function') {
        await instance.close();
      }
    }

    this.instances.clear();
  }

  executeFactory(token, factory) {
    try {
      return factory(this);
    } catch (error) {
      if (error instanceof DependencyInjectionError) {
        throw error;
      }

      throw new DependencyInjectionError(
        `Failed to create bean ${formatToken(token)}.`,
        { cause: error },
      );
    }
  }
}

export function createApplicationContext(config) {
  if (!(config instanceof AppConfig)) {
    throw new DependencyInjectionError(
      'createApplicationContext() must receive an AppConfig instance.',
    );
  }

  return new ApplicationContext(config);
}

function formatToken(token) {
  if (typeof token === 'string') {
    return `"${token}"`;
  }

  if (typeof token === 'symbol') {
    return token.description ? `Symbol(${token.description})` : token.toString();
  }

  return token.name || 'Anonymous class';
}

function getDefinitions(config) {
  const definitions = definitionsByConfig.get(config);

  if (!definitions) {
    throw new DependencyInjectionError('Invalid provider configuration.');
  }

  return definitions;
}

function addDefinition(config, token, definition) {
  const definitions = getDefinitions(config);

  if (definitions.has(token)) {
    throw new DependencyInjectionError(
      `A bean is already registered for ${formatToken(token)}.`,
    );
  }

  definitionsByConfig.get(config).set(token, definition);
  return config;
}

function isDependencyList(value) {
  return Array.isArray(value);
}
