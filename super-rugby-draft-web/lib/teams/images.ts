// lib/teams/images.ts
// Team jerseys and logos (one list for every page). Each page still picks front/angle its own way.

export type JerseySet = { angle?: string; front?: string; single?: string };

export const JERSEYS: Record<string, JerseySet> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.webp", front: "/images/jerseys/BLUJerseyFront.webp" },
  BRU: { single: "/images/jerseys/BRUJersey.webp" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.webp", front: "/images/jerseys/CHIJerseyFront.webp" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.webp", front: "/images/jerseys/CRUJerseyFront.webp" },
  DRU: { single: "/images/jerseys/DRUJersey.webp" },
  FOR: { single: "/images/jerseys/FORJersey.webp" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.webp", front: "/images/jerseys/HIGJerseyFront.webp" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.webp", front: "/images/jerseys/HURJerseyFront.webp" },
  // Moana Pasifika (2026; "MOP" is the older code for the same team)
  MOA: { angle: "/images/jerseys/MOPJerseyAngle.webp", front: "/images/jerseys/MOPJerseyFront.webp" },
  MOP: { angle: "/images/jerseys/MOPJerseyAngle.webp", front: "/images/jerseys/MOPJerseyFront.webp" },
  RED: { single: "/images/jerseys/REDJersey.webp" },
  WAR: { single: "/images/jerseys/WARJersey.webp" },
};

export const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.webp";

export const TEAM_LOGOS: Record<string, string> = {
  BLU: "/images/logos/BLU.webp",
  BRU: "/images/logos/BRU.webp",
  CHI: "/images/logos/CHI.webp",
  CRU: "/images/logos/CRU.webp",
  DRU: "/images/logos/DRU.webp",
  FOR: "/images/logos/FOR.webp",
  HIG: "/images/logos/HIG.webp",
  HUR: "/images/logos/HUR.webp",
  MOA: "/images/logos/MOA.webp",
  RED: "/images/logos/RED.webp",
  WAR: "/images/logos/WAR.webp",
};

export const TEAM_LOGO_PLACEHOLDER = "/images/logo-placeholder.webp";
