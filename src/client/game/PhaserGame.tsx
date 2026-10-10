import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { createGameConfig } from "./config.ts";
import { EventBus } from "./eventBus.ts";

// One Phaser.Game instance, two Scenes (outdoor meadow, indoor house) ---
// never two mounts. Switching is driven here, at the Game level, rather than
// from inside a Scene: a stopped-but-not-destroyed Scene can still be
// restarted by key at any time via the SceneManager.
export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const game = new Phaser.Game(createGameConfig(containerRef.current));

    const onSwitch = (target: "indoor" | "outdoor") => {
      if (target === "indoor") {
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

  return <div ref={containerRef} className="game-container" />;
}
