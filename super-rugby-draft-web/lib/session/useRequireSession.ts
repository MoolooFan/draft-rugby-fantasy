// lib/session/useRequireSession.ts
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useRequireSession() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/session/me", { cache: "no-store" });
        if (!cancelled && !res.ok) router.replace("/");
      } catch {
        if (!cancelled) router.replace("/");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);
}