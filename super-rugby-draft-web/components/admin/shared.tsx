// components/admin/shared.tsx — styles and the request helper shared by the Admin page's tabs.
import type React from "react";
import { card as themeCard } from "@/lib/ui/theme";

export const cardStyle: React.CSSProperties = { ...themeCard };
export const whiteBox: React.CSSProperties = {
  borderRadius: 14,
  background: "rgba(255,255,255,0.92)",
  color: "#0f172a",
  padding: 10,
};
export const primaryButton: React.CSSProperties = {
  height: 38,
  width: "100%",
  borderRadius: 999,
  background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
  color: "white",
  fontSize: 13,
  fontWeight: 700,
  border: "2px solid rgba(255,255,255,0.85)",
  cursor: "pointer",
};
export const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 500,
  color: "#0f172a",
};
export const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 3 };
export const tabButton = (active: boolean): React.CSSProperties => ({
  flex: 1,
  height: 36,
  borderRadius: 999,
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  background: active ? "#0f172a" : "#eef2f6",
  color: active ? "white" : "#0f172a",
});

/** GET (or POST with a body) to an admin route; throws the route's error message. */
export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.error === "FORBIDDEN" ? "This page is for the site admin only." : j?.error ?? "Something went wrong");
  return j as T;
}
