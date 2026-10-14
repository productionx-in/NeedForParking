"use client";

import { useEffect } from "react";

/** Sets <html data-hydrated="true"> once React has attached, so tests (and debugging) can wait for interactivity. */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
