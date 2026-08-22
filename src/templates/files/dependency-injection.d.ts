export type Constructor<T = unknown> = new (...args: any[]) => T;
export type AbstractConstructor<T = unknown> = abstract new (
  ...args: any[]
) => T;
export type DependencyToken<T = unknown> =
  | Constructor<T>
  | AbstractConstructor<T>
  | string
  | symbol;
export type Scope = 'singleton' | 'transient';

export interface BeanOptions {
  scope?: Scope;
}

export type BeanFactory<T> = (context: ApplicationContext) => T;

type BeanDefinition =
  | {
      kind: 'factory';
      factory: BeanFactory<unknown>;
      scope: Scope;
    }
  | {
      kind: 'value';
      value: unknown;
    }
  | {
      kind: 'alias';
      existingToken: DependencyToken;
    };

export declare class DependencyInjectionError extends Error {
  constructor(message: string, options?: { cause?: unknown });
}

export declare function createToken<T = unknown>(
  description: string,
): DependencyToken<T>;

export declare class AppConfig {
  register<T>(token: DependencyToken<T>, factory: BeanFactory<T>): this;
  bean<T>(
    token: DependencyToken<T>,
    factory: BeanFactory<T>,
    options?: BeanOptions,
  ): this;
  singleton<T>(token: DependencyToken<T>, factory: BeanFactory<T>): this;
  transient<T>(token: DependencyToken<T>, factory: BeanFactory<T>): this;
  useClass<T>(
    target: Constructor<T>,
    dependencies?: readonly DependencyToken[],
    options?: BeanOptions,
  ): this;
  useClass<T>(
    token: DependencyToken<T>,
    target: Constructor<T>,
    dependencies?: readonly DependencyToken[],
    options?: BeanOptions,
  ): this;
  value<T>(token: DependencyToken<T>, value: T): this;
  alias<T>(
    token: DependencyToken<T>,
    existingToken: DependencyToken<T>,
  ): this;
  imports(...configs: AppConfig[]): this;
  has(token: DependencyToken): boolean;
  getDefinitions(): ReadonlyMap<DependencyToken, BeanDefinition>;
}

export declare class ApplicationContext {
  private constructor();
  static run(config: AppConfig): ApplicationContext;
  getBean<T>(token: DependencyToken<T>): T;
  get<T>(token: DependencyToken<T>): T;
  getOptional<T>(token: DependencyToken<T>): T | undefined;
  hasBean(token: DependencyToken): boolean;
  clearInstances(): void;
  close(): Promise<void>;
}

export declare function createApplicationContext(
  config: AppConfig,
): ApplicationContext;
