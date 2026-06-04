// Footnote NodeView — an inline atom whose block body is edited in a nested
// ProseMirror sub-editor that opens as a tooltip when the footnote is selected.
// Adapted from the canonical example at prosemirror.net/examples/footnote:
//  - the inner view shares the OUTER history (no inner history plugin), so undo
//    is one timeline; adds baseKeymap so Enter/Backspace work in the body, and
//    Escape returns focus to the main editor.
import { baseKeymap } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import type { Node as PMNode } from "prosemirror-model";
import { EditorState, type Transaction } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import { EditorView, type NodeView } from "prosemirror-view";

export class FootnoteView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;
  private outerView: EditorView;
  private getPos: () => number | undefined;
  private innerView: EditorView | null = null;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.outerView = view;
    this.getPos = getPos;
    this.dom = document.createElement("footnote");
  }

  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode");
    if (!this.innerView) this.open();
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode");
    if (this.innerView) this.close();
  }

  private open() {
    const tooltip = this.dom.appendChild(document.createElement("div"));
    tooltip.className = "footnote-tooltip";
    this.innerView = new EditorView(tooltip, {
      state: EditorState.create({
        doc: this.node,
        plugins: [
          keymap({
            "Mod-z": () => undo(this.outerView.state, this.outerView.dispatch),
            "Mod-y": () => redo(this.outerView.state, this.outerView.dispatch),
            "Shift-Mod-z": () => redo(this.outerView.state, this.outerView.dispatch),
            Escape: () => {
              this.outerView.focus();
              return true;
            },
          }),
          keymap(baseKeymap),
        ],
      }),
      dispatchTransaction: this.dispatchInner.bind(this),
      handleDOMEvents: {
        mousedown: () => {
          // The whole footnote is node-selected when the outer editor is
          // focused; re-focus the inner view so typing lands inside it.
          if (this.outerView.hasFocus()) this.innerView?.focus();
          return false;
        },
      },
    });
  }

  private close() {
    this.innerView?.destroy();
    this.innerView = null;
    this.dom.textContent = "";
  }

  private dispatchInner(tr: Transaction) {
    if (!this.innerView) return;
    const { state, transactions } = this.innerView.state.applyTransaction(tr);
    this.innerView.updateState(state);

    if (!tr.getMeta("fromOutside")) {
      const pos = this.getPos();
      if (pos == null) return;
      const outerTr = this.outerView.state.tr;
      const offsetMap = StepMap.offset(pos + 1);
      for (const transaction of transactions) {
        for (const step of transaction.steps) {
          const mapped = step.map(offsetMap);
          if (mapped) outerTr.step(mapped);
        }
      }
      if (outerTr.docChanged) this.outerView.dispatch(outerTr);
    }
  }

  update(node: PMNode): boolean {
    if (!node.sameMarkup(this.node)) return false;
    this.node = node;
    if (this.innerView) {
      const state = this.innerView.state;
      const start = node.content.findDiffStart(state.doc.content);
      if (start != null) {
        const diff = node.content.findDiffEnd(state.doc.content);
        if (diff) {
          let { a: endA, b: endB } = diff;
          const overlap = start - Math.min(endA, endB);
          if (overlap > 0) {
            endA += overlap;
            endB += overlap;
          }
          this.innerView.dispatch(
            state.tr.replace(start, endB, node.slice(start, endA)).setMeta("fromOutside", true),
          );
        }
      }
    }
    return true;
  }

  destroy() {
    if (this.innerView) this.close();
  }

  stopEvent(event: Event): boolean {
    return this.innerView != null && this.innerView.dom.contains(event.target as globalThis.Node);
  }

  ignoreMutation() {
    return true;
  }
}
