// Navigation primitives — context, guards, history helpers

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

// ── Navigation context — shell provides, views consume ──
//
// Dual-shape API:
//   const navigate = useNavigate()                  → callable: navigate('/path')
//   const { navigate, makeHref } = useNavigate()    → destructurable
// makeHref(path) returns the same URL navigate() pushes to history (for <a href>,
// so right-click "open in new tab" works).

export type NavigateFn = (path: string) => void;
export type MakeHrefFn = (path: string) => string;
export type NavigateApi = NavigateFn & { navigate: NavigateFn; makeHref: MakeHrefFn };

const NavigateCtxImpl = createContext<NavigateApi | null>(null);
export const NavigateProvider = NavigateCtxImpl.Provider;

export function useNavigate(): NavigateApi {
  const api = useContext(NavigateCtxImpl);
  if (!api) throw new Error('useNavigate: no NavigateProvider');
  return api;
}

// Build a NavigateApi from raw navigate + makeHref. The returned function is
// itself callable AND carries .navigate / .makeHref properties for destructuring.
export function makeNavigateApi(navigate: NavigateFn, makeHref: MakeHrefFn): NavigateApi {
  const api = navigate.bind(null) as NavigateApi;
  api.navigate = navigate;
  api.makeHref = makeHref;
  return api;
}

// ── beforeNavigate guard — one view at a time can block SPA navigation ──
// Uses window to share state across Vite module instances

declare global {
  interface Window { __beforeNavigateMsg?: string | null; }
}

export function checkBeforeNavigate(): boolean {
  if (!window.__beforeNavigateMsg) return true;
  return confirm(window.__beforeNavigateMsg);
}

export function useBeforeNavigate(message: string) {
  useEffect(() => {
    const prev = window.__beforeNavigateMsg;
    if (prev && prev !== message) {
      console.warn('[useBeforeNavigate] overwriting existing guard:', prev, '→', message);
    }
    window.__beforeNavigateMsg = message;
    return () => {
      if (window.__beforeNavigateMsg === message) window.__beforeNavigateMsg = null;
    };
  }, [message]);
}

// ── History helper — centralised pushState so callers don't touch window.history directly ──

export function pushHistory(url: string) {
  history.pushState(null, '', url);
}

// ── useLocation — subscribe a component to window.location via popstate ──

function subscribeLocation(callback: () => void) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

const getLocationHref = () => location.href;

export function useLocation(): Location {
  useSyncExternalStore(subscribeLocation, getLocationHref);
  return location;
}
