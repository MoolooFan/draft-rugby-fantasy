// components/ChatIcon.tsx — a speech bubble (the menu's message button).
import React from "react";

export function ChatIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H10l-4.2 3.4c-.33.27-.8.03-.8-.39V16h-.5C3.67 16 3 15.33 3 14.5"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="10" r="1.2" fill={color} />
      <circle cx="12" cy="10" r="1.2" fill={color} />
      <circle cx="15.5" cy="10" r="1.2" fill={color} />
    </svg>
  );
}
