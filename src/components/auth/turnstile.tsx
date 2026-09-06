"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing when no site key is configured, so an unconfigured
 * environment shows a normal form rather than an empty gap where a challenge
 * should be. The parent treats the token as optional for the same reason.
 *
 * Loading and rendering happen in one effect with no intermediate state: a
 * `ready` flag set from inside the effect is a synchronous setState, which
 * causes a cascading render on every mount.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callback = useRef(onToken);

  // Kept current in an effect rather than during render: writing to a ref while
  // rendering is not safe under concurrent rendering.
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const draw = () => {
      if (cancelled || !holder.current || widgetId.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(holder.current, {
        sitekey: siteKey,
        callback: (token: string) => callback.current(token),
        "error-callback": () => callback.current(""),
        "expired-callback": () => callback.current(""),
        theme: "light",
      });
    };

    if (window.turnstile) {
      draw();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", draw);
      } else {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", draw);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={holder} className="flex justify-center" />;
}
