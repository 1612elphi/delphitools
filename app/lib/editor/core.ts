// Everything the text-editor component needs at runtime, behind one dynamic
// import so the whole ProseMirror stack stays out of the tool's initial chunk.
export { EditorState, TextSelection } from 'prosemirror-state';
export { EditorView } from 'prosemirror-view';
export { setBlockType, toggleMark } from 'prosemirror-commands';
export { fixTables } from 'prosemirror-tables';
export { Slice } from 'prosemirror-model';
export { schema } from './schema';
export { parseMarkdown, serializeDoc } from './markdown';
export { buildPlugins } from './plugins';
export { buildNodeViews } from './node-views';
export { focusKey } from './focus-plugin';
export { blockChoices } from './block-types';
export { clearStoredSettings } from './settings';
export { copyRichText, exportHtml, exportMarkdown, exportPdf } from './export';
