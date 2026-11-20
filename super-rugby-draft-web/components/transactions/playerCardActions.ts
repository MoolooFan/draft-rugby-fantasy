// components/transactions/playerCardActions.ts
// The buttons on a player's card from the Transactions page: Add / Remove from Watchlist, then
// Submit Claim / Sign Player (or Locked) for a free player, or Propose Trade for another team's
// player. None for your own players. Moved out of app/transactions/page.tsx.
import type { Player } from "./helpers";

type CardAction = { label: string; variant: "primary" | "secondary"; onClick: () => void };

export function playerCardActions({
  modalPlayer,
  ownerByPlayerId,
  yourDraftTeamId,
  lockedUnownedSet,
  watchlist,
  toggleWatchlist,
  windowMode,
  openDropModal,
  setModalPlayer,
  activeLeagueId,
  returnTo,
  push,
}: {
  modalPlayer: Player | null;
  ownerByPlayerId: Map<string, string>;
  yourDraftTeamId: string | null;
  lockedUnownedSet: Set<string>;
  watchlist: Record<string, boolean>;
  toggleWatchlist: (playerId: string) => void;
  windowMode: "WAIVERS" | "FREE_AGENCY";
  openDropModal: (p: Player) => void;
  setModalPlayer: (p: Player | null) => void;
  activeLeagueId: string | null;
  returnTo: string;
  push: (url: string) => void;
}): CardAction[] {
  if (!modalPlayer) return [];

  const playerId = modalPlayer.id;

  const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;
  const isOwned = !!ownerTeamId;
  const isOwnedByYou = isOwned && ownerTeamId === yourDraftTeamId;

  // Locked means: unowned BUT temporarily locked
  const isLocked = lockedUnownedSet.has(playerId);

  const isOnWatchlist = !!(watchlist as any)[playerId];

  // If owned by you: no buttons
  if (isOwnedByYou) return [];

  // Watchlist button (always shown unless owned-by-you)
  const watchlistAction = {
  label: isOnWatchlist ? "Remove from Watchlist" : "Add to Watchlist",
  variant: "secondary" as const,
  onClick: () => toggleWatchlist(playerId),
};

  // Unowned: Claim/Sign/Locked
  if (!isOwned) {
    // FREE_AGENCY locked -> Locked button does nothing
    if (windowMode === "FREE_AGENCY" && isLocked) {
      return [
        watchlistAction,
        {
          label: "Locked",
          variant: "secondary" as const,
          onClick: () => {}, // no-op
        },
      ];
    }

    // Otherwise allow opening the add/drop modal
    const label = windowMode === "WAIVERS" ? "Submit Claim" : "Sign Player";

    return [
      watchlistAction,
      {
        label,
        variant: "primary" as const,
onClick: () => {
  const addP = modalPlayer; // capture before closing
  if (!addP) return;

  // close player card first
  setModalPlayer(null);

  // open add/drop modal next tick
  window.setTimeout(() => {
    openDropModal(addP);
  }, 0);
},

      },
    ];
  }

  // Owned by another leaguemate: Propose trade (we'll wire to a real page soon)
  return [
    watchlistAction,
    {
  label: "Propose Trade",
  variant: "primary" as const,
  onClick: () => {
    const playerId = modalPlayer.id;
    const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;

    if (!activeLeagueId || !yourDraftTeamId || !ownerTeamId) return;

    // Close the player card before navigating
    setModalPlayer(null);

const url =
  `/trade/propose` +
  `?partnerTeamId=${encodeURIComponent(ownerTeamId)}` +
  `&prefillRequestPlayerId=${encodeURIComponent(playerId)}` +
  `&returnTo=${encodeURIComponent(returnTo)}`;

    // Navigate on next tick so the modal unmount doesn't fight routing
    window.setTimeout(() => push(url), 0);
  },
},

  ];
}
