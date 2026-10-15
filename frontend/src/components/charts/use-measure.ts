"use client";

import { useEffect, useState } from "react";

/** Track an element's rendered width, so SVG charts can be responsive without
 *  distorting their stroke widths the way preserveAspectRatio would.
 *
 *  `ref` is a callback ref, so the observer follows the element even when a
 *  chart swaps its empty state for the plot. Updates are coalesced into one per
 *  animation frame: a drag-resize fires the observer many times a frame, and
 *  setting state inside the observer callback itself is what triggers
 *  "ResizeObserver loop" errors. The observer's first callback supplies the
 *  initial width, so there is no forced layout read. */
export function useMeasure<T extends HTMLElement>() {
  const [element, ref] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current)),
      );
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [element]);

  return { ref, width };
}
