export interface PathResolver {
  resolve(...parts: string[]): string;
}
