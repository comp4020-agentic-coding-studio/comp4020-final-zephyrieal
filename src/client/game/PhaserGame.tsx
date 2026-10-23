import type { Room } from "../../shared/rooms.ts";
import { useEffect, useRef, type ReactNode } from "react";
import Phaser from "phaser";
import { createGameConfig } from "./config.ts";
import { WorldInteractions } from "../ui/WorldInteractions.tsx";
import { EventBus } from "./eventBus.ts";

// One Phaser.Game instance, two Scenes (outdoor meadow, indoor house) ---
// never two mounts. Switching is driven here, at the Game level, rather than
// from inside a Scene: a stopped-but-not-destroyed Scene can still be
// restarted by key at any time via the SceneManager.
export function PhaserGame({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const game = new Phaser.Game(createGameConfig(containerRef.current));

    const onSwitch = (target: Room) => {
      game.registry.set("requestedRoom", target);
      if (!game.scene.isActive("OutdoorScene") && !game.scene.isActive("IndoorScene")) return;
      if (target !== "outdoor") {
        game.scene.stop("OutdoorScene");
        game.scene.start("IndoorScene");
      } else {
        game.scene.stop("IndoorScene");
        game.scene.start("OutdoorScene");
      }
    };
    EventBus.on("switch-scene", onSwitch);

    return () => {
      EventBus.off("switch-scene", onSwitch);
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="game-container" tabIndex={0}
    role="group" aria-label="Sanctuary. Use arrow keys or W A S D to walk."
    onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}><WorldInteractions />{children}</div>;
}
