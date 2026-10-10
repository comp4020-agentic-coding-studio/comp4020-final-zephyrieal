import Phaser from "phaser";

// The only channel between React and Phaser --- no shared store needed.
// React's ShopPanel emits "select-furniture"; IndoorScene/OutdoorScene emit
// "attempt-placement"/"attempt-plant" (an intent only, never a commit);
// useSanctuary is the one listener that turns those intents into real
// fetch() calls and emits "*-updated"/"placement-result" back so the Scenes
// can redraw or show a rejection. Phaser scene code never calls fetch
// itself --- that's what keeps "client proposes, server decides" structural.
export const EventBus = new Phaser.Events.EventEmitter();
