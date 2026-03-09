// MindMap View — Miro-style horizontal tree with organic curves
// Activated by adding mindmap.map component to any node

import { register } from '@treenity/core';
import type { View } from '@treenity/react/context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MindMapTree } from './radial-tree';
import { MindMapSidebar } from './sidebar';
import type { MindMapConfig } from './types';
import { type TreeItem, useTreeData } from './use-tree-data';
import './mindmap.css';

const DEFAULT_DIMS = { w: 800, h: 600 };

const PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16',
];

function buildBranchColors(tree: TreeItem | null): Map<string, string> {
  const colors = new Map<string, string>();
  if (!tree) return colors;

  colors.set(tree.path, 'var(--text)');
  tree.children.forEach((child, i) => {
    assignColor(child, PALETTE[i % PALETTE.length], colors);
  });

  return colors;
}

function assignColor(item: TreeItem, color: string, map: Map<string, string>) {
  map.set(item.path, color);
  for (const child of item.children) assignColor(child, color, map);
}

function findComp(node: Record<string, unknown>, type: string): Record<string, unknown> | null {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (typeof v === 'object' && v !== null && (v as Record<string, unknown>).$type === type) {
      return v as Record<string, unknown>;
    }
  }
  return null;
}

const MindMapView: View<MindMapConfig> = ({ value, ctx }) => {
  const config = findComp(value as Record<string, unknown>, 'mindmap.map');
  const rootPath = ((config?.root as string) || ctx!.path) as string;
  const maxChildren = (config?.maxChildren as number) ?? 50;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootPath]));
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState(DEFAULT_DIMS);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const tree = useTreeData(rootPath, expanded, maxChildren);
  const branchColors = useMemo(() => buildBranchColors(tree), [tree]);

  const handleSelect = useCallback((path: string) => {
    setSelectedPath(prev => prev === path ? null : path);
  }, []);

  const handleToggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        for (const p of next) {
          if (p === path || p.startsWith(path + '/')) next.delete(p);
        }
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleCloseSidebar = useCallback(() => setSelectedPath(null), []);

  const handleNavigate = useCallback((path: string) => {
    window.history.pushState(null, '', '/t' + path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Enter' && selectedPath) {
        e.preventDefault();
        handleToggle(selectedPath);
      }
      if (e.key === 'Backspace' && selectedPath) {
        e.preventDefault();
        if (expanded.has(selectedPath)) {
          handleToggle(selectedPath);
        } else {
          const parentIdx = selectedPath.lastIndexOf('/');
          const parent = parentIdx <= 0 ? '/' : selectedPath.slice(0, parentIdx);
          setSelectedPath(parent);
        }
      }
      if (e.key === 'Escape') {
        setSelectedPath(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedPath, expanded, handleToggle]);

  if (!tree) {
    return (
      <div className="mm-container" ref={containerRef}>
        <div className="flex items-center justify-center flex-1 text-[var(--text-3)] text-sm">
          Loading tree...
        </div>
      </div>
    );
  }

  return (
    <div className="mm-container" ref={containerRef}>
      <MindMapTree
        data={tree}
        selectedPath={selectedPath}
        onSelect={handleSelect}
        onToggle={handleToggle}
        branchColors={branchColors}
        width={selectedPath ? dims.w - 280 : dims.w}
        height={dims.h}
      />

      {selectedPath && (
        <MindMapSidebar
          path={selectedPath}
          onClose={handleCloseSidebar}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
};

register('mindmap.map', 'react', MindMapView);
