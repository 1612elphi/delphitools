/**
 * The colour picker's SINK (M4) — what a picked colour actually paints.
 * One-way: colour-store changes flow OUT to
 *   (a) the pieces fill setting (the NEXT drawn shape/stroke), and
 *   (b) the ACTIVE layer's fill, when it is a shape or freehand stroke —
 *       Photoshop-style "select a shape, pick a colour, it recolours".
 * Nothing writes back into the colour store, so no loops. Picker drags are
 * bracketed as one doc gesture by usePointerArea (colour-picker-kit), so the
 * streamed fill edits ride the transient path and undo as ONE step; single
 * sets (hex commit, swatch click, eyedropper) are one update each.
 *
 * v1 scope calls (documented, not blocked): the sink targets FILL only (a
 * shape's vector stroke recolours via its Inspector row); a flat pick
 * REPLACES a gradient fill; text fills join in M2 TEXT.
 */

import { getColour, subscribeColour } from "./colour-store";
import { getActiveLayerId } from "./selection";
import { getSnapshot, isGestureActive } from "./doc-store";
import { findLayer } from "./layer-tree";
import { setFill } from "./layer-ops";
import { updateToolSettings } from "./tool-settings";

/** Start forwarding colour changes to the sinks. Returns the stop function. */
export function startColourSink(): () => void {
  return subscribeColour(() => {
    const hex = getColour().hex;
    updateToolSettings("pieces", { fill: hex });

    const id = getActiveLayerId();
    const doc = getSnapshot();
    const layer = doc && id ? findLayer(doc.layers, id) : null;
    if (!layer || (layer.kind !== "shape" && layer.kind !== "freehand")) return;
    if (layer.fill === hex) return;
    setFill(layer.id, hex, { transient: isGestureActive() });
  });
}
