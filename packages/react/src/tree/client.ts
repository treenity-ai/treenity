/// <reference types="vite/client" />
// The browser peer node — memory is root, server is mounted.

import { createClientTree } from './client-tree';
import { trpc } from './trpc';

export const { tree } = createClientTree(trpc);

if (import.meta.env?.DEV) (globalThis as any).__tree = tree;
