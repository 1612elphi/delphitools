// NodeViews for the editor. So far: an interactive task-list checkbox on
// list_item. (The footnote sub-editor view will join this later.)
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { FootnoteView } from "./footnote-view";

class ListItemView implements NodeView {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  private node: PMNode;
  private checked: boolean | null;
  private box: HTMLElement | null = null;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.checked = node.attrs.checked as boolean | null;
    this.dom = document.createElement("li");

    if (this.checked === null) {
      // Plain list item — content goes straight in the <li>, like the default.
      this.contentDOM = this.dom;
      return;
    }

    this.dom.className = "task-list-item";
    const box = document.createElement("span");
    box.className = "task-checkbox";
    box.contentEditable = "false";
    box.textContent = this.checked ? "☑" : "☐";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault(); // don't move the selection
      const pos = getPos();
      if (pos == null) return;
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, checked: !this.checked }),
      );
    });
    this.dom.appendChild(box);
    this.box = box;

    const content = document.createElement("div");
    content.className = "task-content";
    this.dom.appendChild(content);
    this.contentDOM = content;
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    // Switching plain <-> task changes the DOM structure: recreate.
    if ((node.attrs.checked === null) !== (this.checked === null)) return false;
    if (node.attrs.checked !== this.checked) {
      this.checked = node.attrs.checked as boolean | null;
      if (this.box) this.box.textContent = this.checked ? "☑" : "☐";
    }
    this.node = node;
    return true;
  }

  stopEvent(e: Event): boolean {
    return this.box != null && e.target === this.box;
  }
}

export function buildNodeViews() {
  return {
    list_item: (node: PMNode, view: EditorView, getPos: () => number | undefined) =>
      new ListItemView(node, view, getPos),
    footnote: (node: PMNode, view: EditorView, getPos: () => number | undefined) =>
      new FootnoteView(node, view, getPos),
  };
}

