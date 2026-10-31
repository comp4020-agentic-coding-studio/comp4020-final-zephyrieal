import { crispText } from "./crispText.ts";
import { CAMPFIRE } from "../../shared/campfire.ts";
import { onSceneExit } from "./onSceneExit.ts";
import Phaser from "phaser";
import { EventBus } from "./eventBus.ts";
import { presenceState } from "./presenceState.ts";
import type { Room } from "../../shared/presence.ts";

// Recreated for each scene entry; every DOM/event listener is removed on shutdown.
export function addPlayers(scene: Phaser.Scene, room: Room, controlsBlocked = () => false) {
  const avatars = new Map<string, { root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; gesture: Phaser.GameObjects.Text; facing: string; targetX: number; targetY: number }>();
  const keys = new Set<string>();
  let touch = { dx: 0, dy: 0 };
  let lastSent = -Infinity;
  let lastDirection = "";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const container = scene.game.canvas.parentElement!;
  const directions: Record<string, [number, number]> = {
    arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
    arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
  };
  function send(dx: number, dy: number) {
    EventBus.emit("visitor-input", { type: "visitor-input", room, dx, dy });
  }
  const reset = () => { keys.clear(); touch = { dx: 0, dy: 0 }; send(0, 0); };
  const keydown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!directions[key] || document.activeElement !== container || controlsBlocked()) return;
    event.preventDefault();
    keys.add(key);
  };
  const keyup = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); };
  const onTouch = (direction: { dx: number; dy: number }) => { touch = direction; };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", reset);
  container.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", reset);
  EventBus.on("visitor-touch", onTouch);
  send(0, 0);

  const update = (time: number, delta: number) => {
    let dx = touch.dx, dy = touch.dy;
    for (const key of keys) { dx += directions[key][0]; dy += directions[key][1]; }
    dx = Math.sign(dx); dy = Math.sign(dy);
    if (controlsBlocked() || document.hidden) { dx = 0; dy = 0; keys.clear(); }
    const direction = `${dx},${dy}`;
    if (presenceState.connected && (time - lastSent >= 100 || direction !== lastDirection)) {
      send(dx, dy);
      lastSent = time;
      lastDirection = direction;
    }
    const visible = presenceState.players.filter(player => player.room === room);
    for (const [id, avatar] of avatars) {
      if (!visible.some(player => player.id === id)) { avatar.root.destroy(); avatars.delete(id); }
    }
    for (const player of visible) {
      let avatar = avatars.get(player.id);
      if (!avatar) {
        const self = player.id === presenceState.selfId;
        const root = scene.add.container(player.x, player.y).setName(`visitor:${player.id}`).setDepth(10);
        const shadow = scene.add.ellipse(0, 1, 29, 9, 0x253a28, 0.18);
        const marker = scene.add.ellipse(0, 2, 32, 12).setStrokeStyle(2, player.color);
        const body = scene.add.image(0, 0, "visitor-gardener", "front").setOrigin(0.5, 1);
        body.setDisplaySize(body.frame.width / body.frame.height * 54, 54);
        const label = crispText(scene.add.text(0, -64, "", {
          fontFamily: "monospace", fontSize: "10px", color: "#253a28", backgroundColor: "#fffaf0",
          padding: { x: 4, y: 2 },
        })).setOrigin(0.5, 1);
        const gesture = crispText(scene.add.text(0, -84, "", {
          fontFamily: "sans-serif", fontSize: "12px", color: "#253a28", backgroundColor: "#fffaf0",
          padding: { x: 5, y: 3 },
        })).setOrigin(0.5, 1);
        root.add([shadow, marker, body, label, gesture]);
        if (self) root.add(scene.add.ellipse(0, 2, 26, 12).setStrokeStyle(1, 0xffffff));
        avatar = { root, body, label, gesture, facing: "front", targetX: player.x, targetY: player.y }; avatars.set(player.id, avatar);
      }
      // Exponential interpolation avoids snapping between 20Hz server snapshots.
      const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 100) / 45);
      avatar.root.x += (player.x - avatar.root.x) * blend;
      avatar.root.y += (player.y - avatar.root.y) * blend;
      // Sort feet against trunk bases so canopies cover visitors behind trees.
      if(room==="outdoor") avatar.root.setDepth(10+avatar.root.y/1000);
      const nearbyEarlier = visible.slice(0, visible.indexOf(player)).filter(other =>
        Math.abs(other.x - player.x) < 75 && Math.abs(other.y - player.y) < 20).length;
      avatar.label.y = -64 - nearbyEarlier * 16;
      // Names can change mid-visit (the welcome screen or "Change name"), so
      // the label is refreshed every frame rather than fixed at creation.
      const self = player.id === presenceState.selfId;
      const labelText = player.name ? (self ? `${player.name} (you)` : player.name) : (self ? "You" : `Visitor ${player.id.slice(0, 4)}`);
      if (avatar.label.text !== labelText) avatar.label.setText(labelText);
      // Sitting is shown by the seated sprite itself, so it gets no caption.
      const gestureText = player.gesture === "wave" ? "Waving hello" : player.gesture === "help" ? "Help here!" : "";
      if (avatar.gesture.text !== gestureText) avatar.gesture.setText(gestureText);
      avatar.gesture.setVisible(Boolean(gestureText));
      avatar.gesture.y = avatar.label.y - 20;
      const movedX = player.x - avatar.targetX;
      const movedY = player.y - avatar.targetY;
      if (player.moving && (Math.abs(movedX) > 0.01 || Math.abs(movedY) > 0.01)) {
        avatar.facing = Math.abs(movedY) > Math.abs(movedX)
          ? (movedY < 0 ? "back" : "front") : (movedX < 0 ? "left" : "right");
      }
      const seated = player.gesture === "sit";
      const facing = seated && player.seatId
        ? (player.seatId === "north" ? "front" : player.y > CAMPFIRE.y + 30 ? "back" : player.x < CAMPFIRE.x ? "right" : "left")
        : avatar.facing;
      const texture = seated ? "visitor-seated" : "visitor-gardener";
      if (avatar.body.texture.key !== texture || avatar.body.frame.name !== facing) {
        avatar.body.setTexture(texture, facing);
        // Keep the head/body at the standing pixel scale: the lower silhouette
        // comes from bent legs in the artwork, never shrinking the whole person.
        if (seated) {
          const standing = scene.textures.get("visitor-gardener").get(facing);
          const width = standing.width / standing.height * 54;
          avatar.body.setDisplaySize(width, avatar.body.frame.height / avatar.body.frame.width * width);
        } else avatar.body.setDisplaySize(avatar.body.frame.width / avatar.body.frame.height * 54, 54);
      }
      avatar.targetX = player.x;
      avatar.targetY = player.y;
      avatar.body.y = !seated && !reducedMotion && player.moving ? Math.sin(time / 75) * 1.5 : 0;
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  onSceneExit(scene, () => {
    reset();
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", reset);
    container.removeEventListener("blur", reset);
    document.removeEventListener("visibilitychange", reset);
    EventBus.off("visitor-touch", onTouch);
    avatars.clear();
  });
}
