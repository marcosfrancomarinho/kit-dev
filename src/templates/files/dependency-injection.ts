/**
 * ATENÇÃO: não edite este arquivo.
 *
 * Este arquivo contém a implementação interna do contêiner.
 * Registre e configure as dependências em `src/di/providers.ts`.
 *
 * Contêiner de injeção de dependência sem decorators e sem pacotes externos.
 *
 * Recursos:
 * - configuração centralizada pelo AppConfig;
 * - beans singleton e transient;
 * - tokens automáticos para interfaces durante o build;
 * - factories, classes, valores e aliases;
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
  private readonly definitions = new Map<DependencyToken, BeanDefinition>();

  /** Registra um provider singleton. */
  register<T>(token: DependencyToken<T>, factory: BeanFactory<T>): this {
    return this.bean(token, factory);
  }

  /** Registra uma factory. O escopo padrão é singleton. */
  bean<T>(
    token: DependencyToken<T>,
    factory: BeanFactory<T>,
    options: BeanOptions = {},
  ): this {
    return this.addDefinition(token, {
      kind: "factory",
      factory: factory as BeanFactory<unknown>,
      scope: options.scope ?? "singleton",
    });
  }

  singleton<T>(token: DependencyToken<T>, factory: BeanFactory<T>): this {
    return this.bean(token, factory, { scope: "singleton" });
  }

  transient<T>(token: DependencyToken<T>, factory: BeanFactory<T>): this {
    return this.bean(token, factory, { scope: "transient" });
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

    return this.bean(
      token,
      (context) => {
        const resolvedDependencies = dependencies.map((dependency) =>
          context.getBean(dependency),
        );

        return new target(...resolvedDependencies);
      },
      beanOptions,
    );
  }

  value<T>(token: DependencyToken<T>, value: T): this {
    return this.addDefinition(token, {
      kind: "value",
      value,
    });
  }

  alias<T>(
    token: DependencyToken<T>,
    existingToken: DependencyToken<T>,
  ): this {
    return this.addDefinition(token, {
      kind: "alias",
      existingToken,
    });
  }

  /** Importa beans de outras configurações menores. */
  imports(...configs: AppConfig[]): this {
    for (const config of configs) {
      for (const [token, definition] of config.getDefinitions()) {
        this.addDefinition(token, definition);
      }
    }

    return this;
  }

  has(token: DependencyToken): boolean {
    return this.definitions.has(token);
  }

  getDefinitions(): ReadonlyMap<DependencyToken, BeanDefinition> {
    return new Map(this.definitions);
  }

  private addDefinition(
    token: DependencyToken,
    definition: BeanDefinition,
  ): this {
    if (this.definitions.has(token)) {
      throw new DependencyInjectionError(
        `Já existe um bean registrado para ${formatToken(token)}.`,
      );
    }

    this.definitions.set(token, definition);

    return this;
  }
}

/** Contexto responsável por criar, armazenar e fornecer os beans. */
export class ApplicationContext {
  private readonly definitions: ReadonlyMap<DependencyToken, BeanDefinition>;
  private readonly instances = new Map<DependencyToken, unknown>();
  private readonly resolutionStack: DependencyToken[] = [];

  private constructor(config: AppConfig) {
    this.definitions = config.getDefinitions();
  }

  static run(config: AppConfig): ApplicationContext {
    if (!(config instanceof AppConfig)) {
      throw new DependencyInjectionError(
        "ApplicationContext.run() precisa receber uma instância de AppConfig.",
      );
    }

    return new ApplicationContext(config);
  }

  getBean<T>(token: DependencyToken<T>): T {
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
        return this.getBean(definition.existingToken) as T;
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

  get<T>(token: DependencyToken<T>): T {
    return this.getBean(token);
  }

  getOptional<T>(token: DependencyToken<T>): T | undefined {
    if (!this.definitions.has(token)) {
      return undefined;
    }

    return this.getBean(token);
  }

  hasBean(token: DependencyToken): boolean {
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
  return ApplicationContext.run(config);
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

function isDependencyList(
  value: readonly DependencyToken[] | BeanOptions | undefined,
): value is readonly DependencyToken[] {
  return Array.isArray(value);
}
