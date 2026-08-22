/**
 * ATENÇÃO: não edite este arquivo.
 *
 * Este arquivo é compilado para `.kit-dev/container.js` durante a instalação.
 * A implementação gerada é interna ao Kit Dev.
 * Registre e configure as dependências em `src/di/providers.ts`.
 *
 * Contêiner de injeção de dependência sem decorators e sem pacotes externos.
 *
 * Recursos:
 * - configuração centralizada pelo AppConfig;
 * - beans singleton e transient;
 * - tokens automáticos para interfaces durante o build;
 * - classes, factories, valores e providers existentes;
 * - detecção de dependências circulares;
 * - descarte opcional de recursos.
 */

export type Constructor<T = unknown> = new (...args: any[]) => T;
export type AbstractConstructor<T = unknown> = abstract new (...args: any[]) => T;
export type DependencyToken<T = unknown> =
  | Constructor<T>
  | AbstractConstructor<T>
  | string
  | symbol;
export type Scope = "singleton" | "transient";

export interface BeanOptions {
  scope?: Scope;
}

export type BeanFactory<T> = (context: ApplicationContext) => T;

type BeanDefinition =
  | {
      kind: "factory";
      factory: BeanFactory<unknown>;
      scope: Scope;
    }
  | {
      kind: "value";
      value: unknown;
    }
  | {
      kind: "alias";
      existingToken: DependencyToken;
    };

const definitionsByConfig = new WeakMap<
  object,
  Map<DependencyToken, BeanDefinition>
>();

interface DisposableResource {
  dispose?: () => void | Promise<void>;
  close?: () => void | Promise<void>;
}

export class DependencyInjectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DependencyInjectionError";

    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

/** Cria um token que pode representar uma interface em tempo de execução. */
export function createToken<T = unknown>(description: string): DependencyToken<T> {
  return Symbol(description);
}

/**
 * Composition root da aplicação. Cada bean é declarado explicitamente,
 * seguindo a ideia de um AppConfig do Spring, mas sem decorators.
 */
export class AppConfig {
  constructor() {
    definitionsByConfig.set(this, new Map());
  }

  /** Registra uma factory. O escopo padrão é singleton. */
  useFactory<T>(
    token: DependencyToken<T>,
    factory: BeanFactory<T>,
    options: BeanOptions = {},
  ): this {
    return addDefinition(this, token, {
      kind: "factory",
      factory: factory as BeanFactory<unknown>,
      scope: options.scope ?? "singleton",
    });
  }

  /**
   * Registra uma classe usando a própria classe como token. O transformador
   * também permite `useClass<Interface>(Implementacao)` sem token manual.
   */
  useClass<T>(
    target: Constructor<T>,
    dependencies?: readonly DependencyToken[],
    options?: BeanOptions,
  ): this;

  /** Associa um token, como o de uma interface, a uma classe concreta. */
  useClass<T>(
    token: DependencyToken<T>,
    target: Constructor<T>,
    dependencies?: readonly DependencyToken[],
    options?: BeanOptions,
  ): this;

  useClass<T>(
    tokenOrTarget: DependencyToken<T>,
    targetOrDependencies?: Constructor<T> | readonly DependencyToken[],
    dependenciesOrOptions?: readonly DependencyToken[] | BeanOptions,
    options: BeanOptions = {},
  ): this {
    const hasExplicitToken = typeof targetOrDependencies === "function";

    if (!hasExplicitToken && typeof tokenOrTarget !== "function") {
      throw new DependencyInjectionError(
        "useClass() precisa receber uma classe ou um token seguido de uma classe.",
      );
    }

    const token = tokenOrTarget;
    const target = (
      hasExplicitToken ? targetOrDependencies : tokenOrTarget
    ) as Constructor<T>;
    const dependencies = hasExplicitToken
      ? isDependencyList(dependenciesOrOptions)
        ? dependenciesOrOptions
        : []
      : (targetOrDependencies ?? []) as readonly DependencyToken[];
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

  useValue<T>(token: DependencyToken<T>, value: T): this {
    return addDefinition(this, token, {
      kind: "value",
      value,
    });
  }

  useExisting<T>(
    token: DependencyToken<T>,
    existingToken: DependencyToken<T>,
  ): this {
    return addDefinition(this, token, {
      kind: "alias",
      existingToken,
    });
  }

  /** Importa beans de outras configurações menores. */
  imports(...configs: AppConfig[]): this {
    for (const config of configs) {
      for (const [token, definition] of getDefinitions(config)) {
        addDefinition(this, token, definition);
      }
    }

    return this;
  }

  has(token: DependencyToken): boolean {
    return getDefinitions(this).has(token);
  }
}

/** Contexto responsável por criar, armazenar e fornecer os beans. */
export class ApplicationContext {
  private readonly definitions: ReadonlyMap<DependencyToken, BeanDefinition>;
  private readonly instances = new Map<DependencyToken, unknown>();
  private readonly resolutionStack: DependencyToken[] = [];

  constructor(config: AppConfig) {
    this.definitions = new Map(getDefinitions(config));
  }

  get<T>(token: DependencyToken<T>): T {
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    const cycleStart = this.resolutionStack.indexOf(token);

    if (cycleStart >= 0) {
      const cycle = [...this.resolutionStack.slice(cycleStart), token]
        .map(formatToken)
        .join(" -> ");

      throw new DependencyInjectionError(
        `Dependência circular detectada: ${cycle}`,
      );
    }

    const definition = this.definitions.get(token);

    if (!definition) {
      throw new DependencyInjectionError(
        `Nenhum bean encontrado para ${formatToken(token)}.`,
      );
    }

    this.resolutionStack.push(token);

    try {
      if (definition.kind === "alias") {
        return this.get(definition.existingToken) as T;
      }

      const instance =
        definition.kind === "value"
          ? definition.value
          : this.executeFactory(token, definition.factory);

      if (definition.kind === "value" || definition.scope === "singleton") {
        this.instances.set(token, instance);
      }

      return instance as T;
    } finally {
      this.resolutionStack.pop();
    }
  }

  getOptional<T>(token: DependencyToken<T>): T | undefined {
    if (!this.definitions.has(token)) {
      return undefined;
    }

    return this.get(token);
  }

  has(token: DependencyToken): boolean {
    return this.definitions.has(token);
  }

  clearInstances(): void {
    this.instances.clear();
  }

  /**
   * Chama dispose() ou close() nos singletons que implementarem um desses
   * métodos. Cada instância é descartada apenas uma vez.
   */
  async close(): Promise<void> {
    const disposed = new Set<unknown>();
    const instances = [...this.instances.values()].reverse();

    for (const instance of instances) {
      if (
        instance === null ||
        (typeof instance !== "object" && typeof instance !== "function") ||
        disposed.has(instance)
      ) {
        continue;
      }

      disposed.add(instance);
      const resource = instance as DisposableResource;

      if (typeof resource.dispose === "function") {
        await resource.dispose();
      } else if (typeof resource.close === "function") {
        await resource.close();
      }
    }

    this.instances.clear();
  }

  private executeFactory(
    token: DependencyToken,
    factory: BeanFactory<unknown>,
  ): unknown {
    try {
      return factory(this);
    } catch (error) {
      if (error instanceof DependencyInjectionError) {
        throw error;
      }

      throw new DependencyInjectionError(
        `Erro ao criar o bean ${formatToken(token)}.`,
        { cause: error },
      );
    }
  }
}

export function createApplicationContext(config: AppConfig): ApplicationContext {
  if (!(config instanceof AppConfig)) {
    throw new DependencyInjectionError(
      "createApplicationContext() precisa receber uma instância de AppConfig.",
    );
  }

  return new ApplicationContext(config);
}

function formatToken(token: DependencyToken): string {
  if (typeof token === "string") {
    return `"${token}"`;
  }

  if (typeof token === "symbol") {
    return token.description ? `Symbol(${token.description})` : token.toString();
  }

  return token.name || "Classe anônima";
}

function getDefinitions(
  config: AppConfig,
): ReadonlyMap<DependencyToken, BeanDefinition> {
  const definitions = definitionsByConfig.get(config);

  if (!definitions) {
    throw new DependencyInjectionError(
      "Configuração de providers inválida.",
    );
  }

  return definitions;
}

function addDefinition(
  config: AppConfig,
  token: DependencyToken,
  definition: BeanDefinition,
): AppConfig {
  const definitions = getDefinitions(config);

  if (definitions.has(token)) {
    throw new DependencyInjectionError(
      `Já existe um bean registrado para ${formatToken(token)}.`,
    );
  }

  definitionsByConfig.get(config)!.set(token, definition);

  return config;
}

function isDependencyList(
  value: readonly DependencyToken[] | BeanOptions | undefined,
): value is readonly DependencyToken[] {
  return Array.isArray(value);
}
