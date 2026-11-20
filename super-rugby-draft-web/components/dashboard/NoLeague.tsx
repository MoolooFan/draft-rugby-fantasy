"use client";
// components/dashboard/NoLeague.tsx
// The Dashboard when you're not in a league yet: Join League / Create New League.
// Moved out of app/dashboard/page.tsx.
import React from "react";
import { useRouter } from "next/navigation";
import { cardStyle, primaryButton } from "./helpers";

export function NoLeague() {
  const router = useRouter();
  return (
      <div style={{ marginTop: 14 }}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700 }}>
            No League Joined
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <button style={primaryButton} onClick={() => router.push("/league")}>
  Join League
</button>
<button style={primaryButton} onClick={() => router.push("/league")}>
  Create New League
</button>

          </div>
        </div>
      </div>
  );
}
