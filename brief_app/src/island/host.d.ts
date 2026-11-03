export interface IslandAssets { js: string; css?: string | null }
export type IslandResolver = (name: string) => IslandAssets | Promise<IslandAssets>;
export interface IslandHandle {
  update(props: Record<string, unknown>): void;
  unmount(): void;
  ready: Promise<IslandHandle>;
}
export function mountIsland(
  name: string,
  el: HTMLElement,
  options: { resolve: IslandResolver; host?: Record<string, unknown>; props?: Record<string, unknown> },
): IslandHandle;
export function unmountIsland(el: HTMLElement): void;
export function reloadChangedIslands(resolve?: IslandResolver): Promise<void>;
