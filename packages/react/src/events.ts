// Server event subscription — module-level, not tied to any React component.
// Listens to trpc.events SSE and updates the cache.

import type { NodeData } from '@treenity/core';
import { applyPatch, type Operation } from 'fast-json-patch';
import * as cache from './cache';
import { trpc } from './trpc';

type LoadChildren = (path: string) => Promise<void>;

interface EventsConfig {
  loadChildren: LoadChildren;
  getExpanded: () => Set<string>;
  getSelected: () => string | null;
}

let unsub: (() => void) | null = null;

export function startEvents(config: EventsConfig) {
  stopEvents();

  const { loadChildren, getExpanded, getSelected } = config;

  const sub = trpc.events.subscribe(undefined as void, {
    onData(event) {
      if (event.type === 'reconnect') {
        if (!event.preserved) {
          cache.signalReconnect();
          for (const path of getExpanded()) loadChildren(path);
          const sel = getSelected();
          if (sel) {
            trpc.get.query({ path: sel, watch: true }).then(n => {
              if (n) cache.put(n as NodeData);
            });
          }
        }
        return;
      }

      if (event.type === 'set') {
        cache.put({ $path: event.path, ...event.node } as NodeData);
        if (event.addVps) event.addVps.forEach((vp: string) => cache.addToParent(event.path, vp));
        if (event.rmVps) event.rmVps.forEach((vp: string) => cache.removeFromParent(event.path, vp));
      } else if (event.type === 'patch') {
        const existing = cache.get(event.path);
        if (existing && event.patches) {
          try {
            applyPatch(existing, event.patches as Operation[]);
            cache.put(existing);
          } catch (e) {
            console.error('Failed to apply patches, fetching full node:', e);
            trpc.get.query({ path: event.path }).then((n) => {
              if (n) cache.put(n as NodeData);
            });
          }
        } else {
          trpc.get.query({ path: event.path }).then((n) => {
            if (n) cache.put(n as NodeData);
          });
        }
        if (event.addVps) event.addVps.forEach((vp: string) => cache.addToParent(event.path, vp));
        if (event.rmVps) event.rmVps.forEach((vp: string) => cache.removeFromParent(event.path, vp));
      } else if (event.type === 'remove') {
        if (event.rmVps && event.rmVps.length > 0) {
          event.rmVps.forEach((vp: string) => cache.removeFromParent(event.path, vp));
        } else {
          cache.remove(event.path);
        }
      }
    },
  });

  unsub = () => sub.unsubscribe();
}

export function stopEvents() {
  if (unsub) {
    unsub();
    unsub = null;
  }
}
