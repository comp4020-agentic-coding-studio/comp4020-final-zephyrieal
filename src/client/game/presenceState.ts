import { EventBus } from "./eventBus.ts";
import type { Player, PresenceMessage } from "../../shared/presence.ts";
export const presenceState = { selfId: "", players: [] as Player[], connected: false };
export function applyPresence(message: PresenceMessage) {
  if (message.type === "presence-welcome") {
    presenceState.selfId = message.selfId;
    presenceState.connected = true;
  }
  presenceState.players = message.players;
  EventBus.emit("presence-updated");
}
export function clearPresence() {
  presenceState.selfId = "";
  presenceState.players = [];
  presenceState.connected = false;
  EventBus.emit("presence-updated");
}
