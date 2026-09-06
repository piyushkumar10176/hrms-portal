"use client";

import { useSyncExternalStore } from "react";

/**
 * A ticking clock, shared by every component that subscribes.
 *
 * A clock is external mutable state, so useSyncExternalStore is the right
 * primitive. The previous pattern paired a `mounted` flag with a setState
 * inside an effect, which React flags because a synchronous setState in an
 * effect causes a cascading render on every mount.
 *
 * Returns null during server rendering and the first hydration pass, so callers
 * render a stable placeholder and avoid a hydration mismatch on the time.
 */

let currentMs = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (timer === null) {
    timer = setInterval(() => {
      currentMs = Date.now();
      for (const listener of listeners) listener();
    }, 1000);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): number | null => currentMs;
const getServerSnapshot = (): number | null => null;

export function useClock(): Date | null {
  const ms = useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot);
  return ms === null ? null : new Date(ms);
}
