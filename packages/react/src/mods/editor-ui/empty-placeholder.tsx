import { set } from '#hooks';
import type { NodeData } from '@treenity/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { TypePicker } from './type-picker';

export function EmptyNodePlaceholder({ value }: { value: NodeData }) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6">
      <div className="text-[13px] text-[--text-3]">Empty node</div>
      <button
        className="flex items-center gap-1.5 text-[12px] text-[--text-3] hover:text-[--accent] bg-[--surface-2] hover:bg-[--accent]/10 rounded-md px-3.5 py-1.5 transition-colors"
        onClick={() => setPicking(true)}
      >
        <Plus className="w-3.5 h-3.5" />
        Add Component
      </button>

      {picking && (
        <TypePicker
          title="Add Component"
          nameLabel="Component name"
          action="Add"
          autoName
          onCancel={() => setPicking(false)}
          onSelect={async (name, type) => {
            setPicking(false);
            await set({ ...value, [name]: { $type: type } });
          }}
        />
      )}
    </div>
  );
}
