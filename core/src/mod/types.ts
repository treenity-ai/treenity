// Treenity Module System — type definitions

import type { Tree } from '#tree';

export interface TreenityMod {
  name: string;
  dependencies?: string[];
  server?: () => Promise<unknown>;
  client?: () => Promise<unknown>;
  seed?: (tree: Tree) => Promise<void>;
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
}

// package.json "treenity" field shape (npm discovery)
export interface ModManifest {
  name: string;
  version: string;
  types?: string[];
  dependencies?: string[];
  server?: string;
  client?: string;
  seed?: string;
  packagePath?: string;
}

export type ModState = 'discovered' | 'loading' | 'loaded' | 'failed' | 'disabled';

export interface LoadedMod {
  manifest?: ModManifest;
  mod?: TreenityMod;
  name: string;
  state: ModState;
  error?: Error;
  loadedAt?: number;
  loadDurationMs?: number;
}

export function defineMod(mod: TreenityMod): TreenityMod {
  return mod;
}
