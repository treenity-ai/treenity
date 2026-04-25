import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LoginScreen, LoginModal } from './Login';
import { RoutedPage } from './RoutedPage';
import { ViewPage } from './ViewPage';
import { Editor } from './Editor';
import { checkBeforeNavigate, NavigateProvider, pushHistory } from '#navigate';
import { AUTH_EXPIRED_EVENT, clearToken, getToken, setToken, trpc } from '#tree/trpc';
import * as cache from '#tree/cache';

type Mode = 'editor' | 'view' | 'routed';

function detectMode(pathname: string): Mode {
  if (pathname.startsWith('/t')) return 'editor';
  if (pathname.startsWith('/v/') || pathname === '/v') return 'view';
  return 'routed';
}

function detectViewPath(pathname: string): string {
  if (pathname.startsWith('/v')) return pathname.slice(2) || '/';
  if (!pathname.startsWith('/t')) return pathname || '/';
  return '/';
}

// Hydrate cache from IDB before first render — RoutedPage/ViewPage also rely on this.
cache.hydrate();

/**
 * Top-level router.
 *
 * - `/`, `/foo/...`    → RoutedPage (public — anonymous visitors render via `public` role)
 * - `/v/<path>`         → ViewPage (direct node render, requires auth)
 * - `/t/<path>`         → Editor (tree inspector, requires auth)
 *
 * Auth model:
 * - No token → authed=null. Server treats missing session as claims=['public']. RoutedPage
 *   works; editor/view show LoginScreen.
 * - With token → trpc.me resolves userId; used by Editor/ViewPage.
 * - VITE_DEV_LOGIN (dev builds only) → auto-login as admin.
 */
export function Router() {
  const [authed, setAuthed] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const initAuth = useCallback(async () => {
    const token = getToken();
    if (!token) {
      if (import.meta.env.VITE_DEV_LOGIN) {
        try {
          const { token: devToken, userId } = await trpc.devLogin.mutate();
          setToken(devToken);
          setAuthed(userId);
          setAuthChecked(true);
        } catch {
          toast.error('Server unavailable, retrying…');
          retryTimer.current = setTimeout(initAuth, 3000);
        }
        return;
      }
      // No token, no dev login → anonymous. Server assigns 'public' claims on every request.
      setAuthed(null);
      setAuthChecked(true);
      return;
    }
    try {
      const res = await trpc.me.query();
      setAuthed(res?.userId ?? null);
      if (!res) clearToken();
      setAuthChecked(true);
    } catch (e: any) {
      const isAuthError = e?.data?.code === 'UNAUTHORIZED' || e?.data?.httpStatus === 401;
      if (isAuthError) {
        clearToken();
        setAuthChecked(true);
      } else {
        toast.error('Server unavailable, retrying…');
        retryTimer.current = setTimeout(initAuth, 3000);
      }
    }
  }, []);

  useEffect(() => {
    initAuth();
    return () => clearTimeout(retryTimer.current);
  }, [initAuth]);

  // Session expired mid-use → drop token, prompt login.
  useEffect(() => {
    const handler = () => {
      if (showLoginModal) return;
      clearToken();
      setAuthed(null);
      setShowLoginModal(true);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [showLoginModal]);

  const [mode, setMode] = useState<Mode>(() => detectMode(location.pathname));
  const [viewPath, setViewPath] = useState<string>(() => detectViewPath(location.pathname));

  useEffect(() => {
    const onPop = () => {
      if (!checkBeforeNavigate()) {
        pushHistory(location.href);
        return;
      }
      setMode(detectMode(location.pathname));
      setViewPath(detectViewPath(location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Navigate for routed/view subtrees. Editor provides its own NavigateProvider internally.
  const navigate = useCallback((path: string) => {
    if (!checkBeforeNavigate()) return;
    if (mode === 'view') {
      setViewPath(path);
      pushHistory('/v' + path);
      return;
    }
    if (mode === 'routed') {
      setViewPath(path);
      pushHistory(path);
      return;
    }
    // mode === 'editor' — Editor handles its own navigation; fall back to /t/.
    pushHistory(`/t${path === '/' ? '' : path}`);
    setMode('editor');
    setViewPath(path);
  }, [mode]);

  const handleLogout = useCallback(() => {
    clearToken();
    setAuthed(null);
    setShowLoginModal(true);
  }, []);

  if (!authChecked) return null;

  // Public routed pages render for anonymous visitors — no login gate.
  if (mode === 'routed') {
    return (
      <NavigateProvider value={navigate}>
        <RoutedPage path={viewPath} />
      </NavigateProvider>
    );
  }

  // Protected modes require a real session.
  if (!authed) return <LoginScreen onLogin={setAuthed} />;

  if (mode === 'view') {
    const ctx = new URLSearchParams(location.search).get('ctx') || 'react';
    return (
      <NavigateProvider value={navigate}>
        <ViewPage path={viewPath} ctx={ctx} />
      </NavigateProvider>
    );
  }

  // mode === 'editor'
  const isAnon = authed.startsWith('anon:');
  return (
    <>
      <Editor authed={authed} onLogout={handleLogout} />
      {showLoginModal && (
        <LoginModal
          onLogin={(uid) => { setAuthed(uid); setShowLoginModal(false); }}
          onClose={isAnon ? undefined : () => setShowLoginModal(false)}
        />
      )}
    </>
  );
}
