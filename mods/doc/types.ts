import { registerType } from '@treenity/core/comp';

/** Rich document — Tiptap JSON with embedded Treenity components */
class DocPage {
  /** @title Title */
  title = 'Untitled';
  /** @title Content */
  content = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Press Edit to start editing.' }] },
    ],
  };
}
registerType('doc.page', DocPage);
