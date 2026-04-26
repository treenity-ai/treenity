// Navigation primitives — context, guards, history helpers

import { createContext, useContext, useEffect, useState } from 'react';

// ── Navigation context — shell provides, views consume ──

export type NavigateFn = (path: string) => void;
const NavigateCtx = createContext<NavigateFn | null>(null);
export const NavigateProvider = NavigateCtx.Provider;

export function useNavigate(): NavigateFn {
  const nav = useContext(NavigateCtx);
  if (!nav) throw new Error('useNavigate: no NavigateProvider');
  return nav;
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

// ── useLocation — track window.location through popstate, gated by checkBeforeNavigate ──

export type Location = { pathname: string; search: string };

export function useLocation(): Location {
  const [loc, setLoc] = useState<Location>(() => ({
    pathname: location.pathname,
    search: location.search,
  }));

  useEffect(() => {
    const onPop = () => {
      if (!checkBeforeNavigate()) {
        pushHistory(location.href);
        return;
      }
      setLoc({ pathname: location.pathname, search: location.search });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return loc;
}
