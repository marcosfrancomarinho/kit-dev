import "reflect-metadata";

/**
 * Contêiner de injeção de dependência em um único arquivo.
 *
 * Recursos:
 * - injeção automática pelo tipo do parâmetro;
 * - tokens para interfaces;
 * - escopos singleton e transient;
 * - providers de classe, valor, fábrica e alias;
 * - detecção de dependências circulares;
 * - descarte opcional de singletons.
 */

export type Constructor<T = unknown> = new (...args: any[]) => T;
export type DependencyToken<T = unknown> = Constructor<T> | string | symbol;
export type Scope = "singleton" | "transient";

export interface InjectableOptions {
  scope?: Scope;
  /**
   * Dependências explícitas do construtor. Use esta opção com tsx/esbuild,
   * pois essas ferramentas não emitem design:paramtypes.
   */
  dependencies?: readonly DependencyToken[];
}

export interface ClassProvider<T> {
  useClass: Constructor<T>;
  scope?: Scope;
}

export interface ValueProvider<T> {
  useValue: T;
}

export interface FactoryProvider<T> {
  useFactory: (container: Container) => T;
  scope?: Scope;
}

export interface ExistingProvider<T> {
  useExisting: DependencyToken<T>;
}

export type Provider<T> =
  | Constructor<T>
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ExistingProvider<T>;

type StoredProvider =
  | {
      kind: "class";
      useClass: Constructor;
      scope: Scope;
    }
  | {
      kind: "value";
      useValue: unknown;
    }
  | {
      kind: "factory";
      useFactory: (container: Container) => unknown;
      scope: Scope;
    }
  | {
      kind: "existing";
      useExisting: DependencyToken;
    };

interface DisposableResource {
  dispose?: () => void | Promise<void>;
  close?: () => void | Promise<void>;
}

const INJECTABLE_METADATA = Symbol("di:injectable");
const INJECT_TOKENS_METADATA = Symbol("di:inject-tokens");
const CLASS_DEPENDENCIES_METADATA = Symbol("di:class-dependencies");
const SCOPE_METADATA = Symbol("di:scope");

const INVALID_AUTOMATIC_TYPES = new Set<unknown>([
  Object,
  String,
  Number,
  Boolean,
  Array,
  Function,
]);

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
 * Marca uma classe para resolução automática.
 * O escopo padrão é singleton.
 */
export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(INJECTABLE_METADATA, true, target);
    Reflect.defineMetadata(SCOPE_METADATA, options.scope ?? "singleton", target);

    if (options.dependencies) {
      Reflect.defineMetadata(
        CLASS_DEPENDENCIES_METADATA,
        [...options.dependencies],
        target,
      );
    }
  };
}

/** Atalho para uma classe singleton. */
export function Singleton(): ClassDecorator {
  return Injectable({ scope: "singleton" });
}

/** Atalho para criar uma instância nova a cada resolução. */
export function Transient(): ClassDecorator {
  return Injectable({ scope: "transient" });
}

/**
 * Informa manualmente o token de um parâmetro do construtor.
 * Necessário principalmente quando o parâmetro é uma interface.
 */
export function Inject(token: DependencyToken): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey !== undefined) {
      throw new DependencyInjectionError(
        "@Inject só pode ser usado em parâmetros do construtor.",
      );
    }

    const current =
      (Reflect.getOwnMetadata(INJECT_TOKENS_METADATA, target) as
        | Map<number, DependencyToken>
        | undefined) ?? new Map<number, DependencyToken>();

    current.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_TOKENS_METADATA, current, target);
  };
}

export class Container {
  private readonly providers = new Map<DependencyToken, StoredProvider>();
  private readonly instances = new Map<DependencyToken, unknown>();
  private readonly resolutionStack: DependencyToken[] = [];

  constructor() {
    this.registerValue(Container, this);
  }

  register<T>(token: DependencyToken<T>, provider: Provider<T>): this {
    const normalized = this.normalizeProvider(provider);

    this.providers.set(token, normalized);
    this.instances.delete(token);

    return this;
  }

  registerClass<T>(
    token: DependencyToken<T>,
    useClass: Constructor<T>,
    scope?: Scope,
  ): this {
    return this.register(token, { useClass, scope });
  }

  registerValue<T>(token: DependencyToken<T>, useValue: T): this {
    return this.register(token, { useValue });
  }

  registerFactory<T>(
    token: DependencyToken<T>,
    useFactory: (container: Container) => T,
    scope: Scope = "singleton",
  ): this {
    return this.register(token, { useFactory, scope });
  }

  registerAlias<T>(
    token: DependencyToken<T>,
    useExisting: DependencyToken<T>,
  ): this {
    return this.register(token, { useExisting });
  }

  resolve<T>(token: DependencyToken<T>): T {
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

    this.resolutionStack.push(token);

    try {
      const provider = this.providers.get(token);

      if (provider) {
        return this.resolveProvider<T>(token, provider);
      }

      if (isConstructor(token) && isInjectable(token)) {
        const scope = getClassScope(token);
        const instance = this.instantiate(token);

        if (scope === "singleton") {
          this.instances.set(token, instance);
        }

        return instance;
      }

      throw new DependencyInjectionError(
        `Nenhum provider encontrado para ${formatToken(token)}. ` +
          "Registre o token no container ou use @Injectable() na classe.",
      );
    } finally {
      this.resolutionStack.pop();
    }
  }

  resolveOptional<T>(token: DependencyToken<T>): T | undefined {
    const canResolve =
      this.providers.has(token) || (isConstructor(token) && isInjectable(token));

    if (!canResolve) {
      return undefined;
    }

    return this.resolve(token);
  }

  isRegistered(token: DependencyToken): boolean {
    return this.providers.has(token);
  }

  unregister(token: DependencyToken): boolean {
    this.instances.delete(token);
    return this.providers.delete(token);
  }

  clearInstances(): void {
    this.instances.clear();
  }

  reset(): void {
    this.providers.clear();
    this.instances.clear();
    this.resolutionStack.length = 0;
    this.registerValue(Container, this);
  }

  /**
   * Chama dispose() ou close() nos singletons que implementarem um desses
   * métodos. Cada instância é descartada apenas uma vez.
   */
  async dispose(): Promise<void> {
    const disposed = new Set<unknown>();
    const instances = [...this.instances.values()].reverse();

    for (const instance of instances) {
      if (
        instance === this ||
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

  private resolveProvider<T>(
    token: DependencyToken<T>,
    provider: StoredProvider,
  ): T {
    if (provider.kind === "value") {
      return provider.useValue as T;
    }

    if (provider.kind === "existing") {
      return this.resolve(provider.useExisting) as T;
    }

    const instance =
      provider.kind === "class"
        ? this.instantiate(provider.useClass)
        : this.executeFactory(token, provider.useFactory);

    if (provider.scope === "singleton") {
      this.instances.set(token, instance);
    }

    return instance as T;
  }

  private instantiate<T>(target: Constructor<T>): T {
    const designTypes =
      (Reflect.getMetadata("design:paramtypes", target) as
        | DependencyToken[]
        | undefined) ?? [];

    const declaredDependencies = Reflect.getOwnMetadata(
      CLASS_DEPENDENCIES_METADATA,
      target,
    ) as DependencyToken[] | undefined;

    const injectedTokens =
      (Reflect.getOwnMetadata(INJECT_TOKENS_METADATA, target) as
        | Map<number, DependencyToken>
        | undefined) ?? new Map<number, DependencyToken>();

    const highestInjectedIndex =
      injectedTokens.size > 0 ? Math.max(...injectedTokens.keys()) + 1 : 0;

    const parameterCount = Math.max(
      target.length,
      designTypes.length,
      declaredDependencies?.length ?? 0,
      highestInjectedIndex,
    );

    const dependencies = Array.from({ length: parameterCount }, (_, index) => {
      const hasParameterToken = injectedTokens.has(index);
      const hasClassToken =
        declaredDependencies !== undefined && index < declaredDependencies.length;
      const hasExplicitToken = hasParameterToken || hasClassToken;

      const dependencyToken = hasParameterToken
        ? injectedTokens.get(index)
        : hasClassToken
          ? declaredDependencies[index]
          : designTypes[index];

      if (dependencyToken === undefined) {
        throw new DependencyInjectionError(
          `Não foi possível descobrir o parâmetro ${index} de ${formatToken(target)}. ` +
            "Use @Inject(token) nesse parâmetro.",
        );
      }

      if (!hasExplicitToken && INVALID_AUTOMATIC_TYPES.has(dependencyToken)) {
        throw new DependencyInjectionError(
          `O parâmetro ${index} de ${formatToken(target)} não possui um tipo resolvível. ` +
            "Interfaces e tipos primitivos precisam de @Inject(token).",
        );
      }

      return this.resolve(dependencyToken);
    });

    try {
      return new target(...dependencies);
    } catch (error) {
      if (error instanceof DependencyInjectionError) {
        throw error;
      }

      throw new DependencyInjectionError(
        `Erro ao criar ${formatToken(target)}.`,
        { cause: error },
      );
    }
  }

  private executeFactory(
    token: DependencyToken,
    factory: (container: Container) => unknown,
  ): unknown {
    try {
      return factory(this);
    } catch (error) {
      if (error instanceof DependencyInjectionError) {
        throw error;
      }

      throw new DependencyInjectionError(
        `Erro ao executar a factory de ${formatToken(token)}.`,
        { cause: error },
      );
    }
  }

  private normalizeProvider<T>(provider: Provider<T>): StoredProvider {
    if (isConstructor(provider)) {
      return {
        kind: "class",
        useClass: provider,
        scope: getClassScope(provider),
      };
    }

    if ("useClass" in provider) {
      return {
        kind: "class",
        useClass: provider.useClass,
        scope: provider.scope ?? getClassScope(provider.useClass),
      };
    }

    if ("useFactory" in provider) {
      return {
        kind: "factory",
        useFactory: provider.useFactory,
        scope: provider.scope ?? "singleton",
      };
    }

    if ("useExisting" in provider) {
      return {
        kind: "existing",
        useExisting: provider.useExisting,
      };
    }

    return {
      kind: "value",
      useValue: provider.useValue,
    };
  }
}

function isConstructor<T>(value: unknown): value is Constructor<T> {
  return typeof value === "function";
}

function isInjectable(target: Constructor): boolean {
  return Reflect.getMetadata(INJECTABLE_METADATA, target) === true;
}

function getClassScope(target: Constructor): Scope {
  return (
    (Reflect.getMetadata(SCOPE_METADATA, target) as Scope | undefined) ??
    "singleton"
  );
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

export const container = new Container();
