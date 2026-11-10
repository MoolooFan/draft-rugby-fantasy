// lib/hooks/useStableComponent.ts
// Many pages define their pieces (rows, tabs, headers, pop-ups) inside the page so they can use
// the page's data directly. Normally React treats such a piece as a brand-new component on every
// redraw and rebuilds it from scratch (slow clicks, lists jumping, typing lost in pop-ups).
// This keeps one component for the life of the page that always draws with the latest version
// of the function, so React just updates what changed.
"use client";
import { useRef, useState, type ReactNode } from "react";

export function useStableComponent<P>(render: (props: P) => ReactNode): (props: P) => ReactNode {
  const latest = useRef(render);
  // Updated while drawing (not in an effect) on purpose: the piece draws straight after the
  // page in the same pass and must see this render's data.
  // eslint-disable-next-line react-hooks/refs
  latest.current = render;
  const [Stable] = useState(() => {
    const C = (props: P) => latest.current(props);
    (C as { displayName?: string }).displayName = render.name.replace(/__render$/, "") || "Stable";
    return C;
  });
  return Stable;
}
