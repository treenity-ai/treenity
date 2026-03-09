import { useSchema } from '#schema-loader';
import { type ComponentData, isRef, register, resolve } from '@treenity/core';
import { createElement } from 'react';
import { FieldLabel, RefEditor } from './FieldLabel';
import { renderField, StringArrayField } from './form-field';

function DefaultEditForm({ value, onChange }: { value: ComponentData; onChange?: (next: ComponentData) => void }) {
  const schema = useSchema(value.$type);
  if (schema === undefined) return null;

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!k.startsWith('$')) data[k] = v;
  }

  const setData = (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => {
    if (!onChange) return;
    const next = fn(data);
    onChange({ ...value, ...next } as ComponentData);
  };

  // Schema-driven form
  if (schema && Object.keys(schema.properties).length > 0) {
    return (
      <div className="py-0.5 pb-2.5">
        {Object.entries(schema.properties).map(([field, prop]) => {
          const p = prop as {
            type: string; title: string; format?: string; description?: string;
            readOnly?: boolean; enum?: string[]; items?: { type?: string; properties?: Record<string, unknown> };
            refType?: string;
          };
          return renderField(field, {
            type: p.format ?? p.type, label: p.title ?? field, placeholder: p.description,
            readOnly: p.readOnly || !onChange, enum: p.enum, items: p.items, refType: p.refType,
          }, data, setData);
        })}
      </div>
    );
  }

  // Fallback: raw field rendering
  if (Object.keys(data).length > 0) {
    return (
      <div className="py-0.5 pb-2.5">
        {Object.entries(data).map(([k, v]) => {
          const onCh = (next: unknown) => setData((prev) => ({ ...prev, [k]: next }));
          if (v && typeof v === 'object' && isRef(v)) {
            return (
              <div key={k} className="field">
                <FieldLabel label={k} value={v} onChange={onCh} />
                <RefEditor value={v as { $ref: string; $map?: string }} onChange={onCh} />
              </div>
            );
          }
          return (
            <div key={k} className={`field${Array.isArray(v) || (typeof v === 'object' && v !== null) ? ' stack' : ''}`}>
              <FieldLabel label={k} value={v} onChange={onCh} />
              {typeof v === 'boolean' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!data[k]} className="w-auto"
                    onChange={(e) => setData((prev) => ({ ...prev, [k]: e.target.checked }))} />
                  {data[k] ? 'true' : 'false'}
                </label>
              ) : typeof v === 'number' ? (
                <input type="number" value={String(data[k] ?? 0)}
                  onChange={(e) => setData((prev) => ({ ...prev, [k]: Number(e.target.value) }))} />
              ) : Array.isArray(v) ? (
                <StringArrayField value={data[k] as unknown[]}
                  onChange={(next) => setData((prev) => ({ ...prev, [k]: next }))} />
              ) : typeof v === 'object' ? (
                (() => {
                  const h = resolve('object', 'react:form');
                  return h
                    ? createElement(h as any, {
                        value: { $type: 'object', value: data[k] },
                        onChange: (next: { value: unknown }) => setData((prev) => ({ ...prev, [k]: next.value })),
                      })
                    : <pre className="text-[11px] font-mono text-foreground/60">{JSON.stringify(data[k], null, 2)}</pre>;
                })()
              ) : (
                <input value={String(data[k] ?? '')}
                  onChange={(e) => setData((prev) => ({ ...prev, [k]: e.target.value }))} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Empty
  return (
    <pre className="text-[11px] font-mono text-foreground/60 bg-muted/30 rounded p-2 whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

register('default', 'react:edit', DefaultEditForm as any);
