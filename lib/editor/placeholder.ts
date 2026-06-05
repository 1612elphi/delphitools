// Ghost placeholder shown when the document is a single empty block. Rendered as
// a CSS ::before on the empty block (see app/globals.css .dt-empty).
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export function placeholderPlugin(text: string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        const first = doc.firstChild;
        if (doc.childCount === 1 && first && first.isTextblock && first.content.size === 0) {
          return DecorationSet.create(doc, [
            Decoration.node(0, first.nodeSize, { class: "dt-empty", "data-placeholder": text }),
          ]);
        }
        return DecorationSet.empty;
      },
    },
  });
}
