// Inspector — view + edit panel for selected node (Unity-style inspector)
// Shell only: header, rendered view, delegates editing to NodeEditor

import './Inspector.css';
import { ErrorBoundary } from '#app/ErrorBoundary';
import { PathBreadcrumb } from '#components/PathBreadcrumb';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { ScrollArea } from '#components/ui/scroll-area';
import { Render, RenderContext } from '#context';
import { usePath } from '#hooks';
import { getViewContexts, pickDefaultContext } from '#mods/editor-ui/node-utils';
import { useAutoSave } from '#tree/auto-save';
import { Bug, ExternalLink, Pencil, Settings } from 'lucide-react';
import { useState } from 'react';
import { NodeEditor } from './NodeEditor';

type Props = {
  path: string | null;
  currentUserId?: string;
  onDelete: (path: string) => void;
  onAddComponent: (path: string) => void;
  onSelect: (path: string) => void;
  onSetRoot?: (path: string) => void;
  toast: (msg: string) => void;
};

export function Inspector({ path, currentUserId, onDelete, onAddComponent, onSelect, onSetRoot, toast }: Props) {
  const { data: node } = usePath(path);
  const save = useAutoSave(path ?? '');
  const [propsOpen, setPropsOpen] = useState(false);
  const [context, setContext] = useState('react:layout');

  // Reset context when path changes
  const [prevPath, setPrevPath] = useState(path);
  if (path !== prevPath) {
    setPrevPath(path);
    if (node) setContext(pickDefaultContext(node.$type));
  }

  if (!node) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/50">
          <div className="text-[32px] opacity-30">&#9741;</div>
          <p className="text-[12px]">Select a node to inspect</p>
        </div>
      </div>
    );
  }

  const nodeName = node.$path === '/' ? '/' : node.$path.slice(node.$path.lastIndexOf('/') + 1);
  const viewContexts = getViewContexts(node.$type, node);

  return (
    <div className="editor">
      {/* Header */}
      <div className="px-4 pt-3 pb-2.5 border-b border-border shrink-0">
        <PathBreadcrumb path={node.$path} onSelect={onSelect} />
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{nodeName}</h2>
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.06em] rounded-full border-primary/25 bg-primary/10 text-primary">{node.$type}</Badge>

          <DropdownMenu>
            <DropdownMenuTrigger className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-1.5 py-0.5 rounded">
              <Bug size={12} className="inline" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Render context</DropdownMenuLabel>
              {viewContexts.map((c) => (
                <DropdownMenuItem
                  key={c}
                  onClick={() => setContext(c)}
                  className={context === c ? 'bg-accent text-accent-foreground font-medium' : ''}
                >
                  {c.replace('react:', '')}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {onSetRoot && (
                <DropdownMenuItem onClick={() => onSetRoot(node.$path)}>
                  Set as root
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <a
            href={`/v${node.$path}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-[11px] text-foreground underline decoration-dashed decoration-primary/50 underline-offset-[3px] transition-colors hover:text-primary hover:decoration-primary"
          >
            <ExternalLink size={12} className="shrink-0" />
            View
          </a>

          <span className="flex-1" />

          <Button
            variant={context === 'react:edit' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-[11px]"
            onClick={() => setContext(context === 'react:edit' ? pickDefaultContext(node.$type) : 'react:edit')}
          >
            <Pencil className="shrink-0 size-3" />
            {context === 'react:edit' ? 'Editing' : 'Edit mode'}
          </Button>

          <Button variant={propsOpen ? 'default' : 'outline'} size="sm" className="h-6 text-[11px]" onClick={() => setPropsOpen(!propsOpen)}>
            <Settings className="shrink-0 size-3" />
            Props
          </Button>
        </div>
      </div>

      {/* Rendered view */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <ErrorBoundary key={node.$path}>
            <RenderContext name={context}>
              <div className="node-view">
                <Render value={node} onChange={save.onChange} />
              </div>
            </RenderContext>
          </ErrorBoundary>
        </div>
      </ScrollArea>

      {/* Slide-out edit panel */}
      <NodeEditor
        node={node}
        save={save}
        open={propsOpen}
        onClose={() => setPropsOpen(false)}
        onDelete={() => onDelete(node.$path)}
        currentUserId={currentUserId}
        toast={toast}
        onAddComponent={onAddComponent}
      />
    </div>
  );
}
