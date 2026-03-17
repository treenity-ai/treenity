import 'reflect-metadata';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { enablePatches } from 'immer';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './load-client';
import { Toaster } from './components/ui/sonner';
import './root.css';

enablePatches();

const queryClient = new QueryClient();

// StrictMode off: FlowGram inversify container breaks on double-mount
// https://github.com/bytedance/flowgram.ai/issues/402
// TODO: re-enable once FlowGram fixes React 19 StrictMode support
// const Strict = import.meta.env.VITE_STRICT_MODE !== 'false'
//   ? StrictMode
//   : ({ children }: { children: ReactNode }) => children;
const Strict = ({ children }: { children: ReactNode }) => children;

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
createRoot(root).render(
  <Strict>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </Strict>,
);
