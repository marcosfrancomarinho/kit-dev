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

export declare class DependencyInjectionError extends Error {
  constructor(message: string, options?: { cause?: unknown });
}

export declare function createToken<T = unknown>(
  description: string,
): DependencyToken<T>;

export declare class AppConfig {
  useFactory<T>(
    token: DependencyToken<T>,
    factory: BeanFactory<T>,
    options?: BeanOptions,
  ): this;
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
  useValue<T>(token: DependencyToken<T>, value: T): this;
  useExisting<T>(
    token: DependencyToken<T>,
    existingToken: DependencyToken<T>,
  ): this;
  imports(...configs: AppConfig[]): this;
  has(token: DependencyToken): boolean;
}

export declare class ApplicationContext {
  private constructor();
  get<T>(token: DependencyToken<T>): T;
  getOptional<T>(token: DependencyToken<T>): T | undefined;
  has(token: DependencyToken): boolean;
  clearInstances(): void;
  close(): Promise<void>;
}

export declare function createApplicationContext(
  config: AppConfig,
): ApplicationContext;
