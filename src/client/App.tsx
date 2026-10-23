import { roomName, type Room } from "../shared/rooms.ts";
import { useEffect, useState } from "react";
import { PhaserGame } from "./game/PhaserGame.tsx";
import { PlayerControls } from "./ui/PlayerControls.tsx";
import { EventBus } from "./game/eventBus.ts";
import { CarePointsBadge } from "./ui/CarePointsBadge.tsx";
import { ShopPanel } from "./ui/ShopPanel.tsx";
import { StoragePanel } from "./ui/StoragePanel.tsx";
import { ConstructionPanel } from "./ui/ConstructionPanel.tsx";
import { useSanctuary } from "./state/useSanctuary.ts";
import { PROJECTS } from "../server/construction.ts";

function traceText(guineaPig: ReturnType<typeof useSanctuary>["guineaPig"]) {
  if (!guineaPig) return "Loading the sanctuary's memory…";
  if (guineaPig.feed_count === 0) return "Nobody has fed Potato yet. Be the first.";
  const lastFed = new Date(`${guineaPig.last_fed_at}Z`).toLocaleString();
  return (
    `Potato has been fed ${guineaPig.feed_count} time` +
    `${guineaPig.feed_count === 1 ? "" : "s"} by visitors to this sanctuary. ` +
    `Last fed ${lastFed}.`
  );
}

export default function App() {
  const { guineaPig, carePoints, storedFurniture, construction, rejection } =
    useSanctuary();
  const [view, setView] = useState<Room>("outdoor");
  const [openConstructionProjectId, setOpenConstructionProjectId] = useState<string | null>(null);

  // A construction site is a Phaser sprite living in OutdoorScene; this is
  // the first Phaser-to-React direction in this codebase (everywhere else,
  // like toggleView below, React drives Phaser) --- a site's own click
  // handler emits this, naming which project it is, once that site is
  // clicked. Only one panel is ever open at a time: clicking a different
  // site while one is open swaps which project's panel shows.
  useEffect(() => {
    const onRoom = (room: Room) => setView(room);
    EventBus.on("room-changed", onRoom);
    const onOpen = (projectId: string) => setOpenConstructionProjectId(projectId);
    const onClose = () => setOpenConstructionProjectId(null);
    EventBus.on("close-construction-panel", onClose);
    EventBus.on("open-construction-panel", onOpen);
    return () => {
      EventBus.off("room-changed", onRoom);
      EventBus.off("close-construction-panel", onClose);
      EventBus.off("open-construction-panel", onOpen);
    };
  }, []);

  function toggleView() {
    const next = view === "outdoor" ? "indoor" : "outdoor";
    EventBus.emit("attempt-room", next);
  }

  return (
    <main>
      <h1>Guinea Pig Sanctuary</h1>
      <p className="intro">
        A small, shared meadow and the house just behind it. Right now there's
        four guinea pigs here — <strong>Potato, Mochi, Biscuit and Clover</strong> — and whatever you leave
        behind, outside or in, stays for the next visitor.
      </p>

      <section className="meadow-wrap">
        <p className="guinea-pig">
          🐹 <span>{guineaPig?.name ?? "Potato"}</span> is in the sanctuary,
          looking <span>{guineaPig?.personality ?? "curious"}</span>.
        </p>
        <p aria-live="polite">{traceText(guineaPig)}</p>

        <div className="toolbar">
          <CarePointsBadge value={carePoints} />
          <button type="button" onClick={toggleView}>
            {view === "outdoor" ? "Go inside" : "Go back outside"}
          </button>

        </div>

        {view !== "outdoor" && <p className="room-name">{roomName(view)} · shared interior</p>}
        <PhaserGame>

        {openConstructionProjectId && (
          <ConstructionPanel
            projectId={openConstructionProjectId}
            projectName={PROJECTS.find((p) => p.id === openConstructionProjectId)?.name ?? openConstructionProjectId}
            construction={construction[openConstructionProjectId] ?? null}
            onClose={() => setOpenConstructionProjectId(null)}
          />
        )}

        {view !== "outdoor" && (
          <section className="interior-furnishing" aria-label="Furnish this house"
            onPointerDown={(event) => event.stopPropagation()}>
            <div className="interior-furnishing-header">
              <strong>Furnish this house</strong>
              <CarePointsBadge value={carePoints} />
            </div>
            <ShopPanel carePoints={carePoints} />
            {storedFurniture.length > 0 && (
              <details className="interior-storage">
                <summary>Shared storage ({storedFurniture.length})</summary>
                <StoragePanel items={storedFurniture} />
              </details>
            )}
          </section>
        )}
        </PhaserGame>
        <PlayerControls />



        {rejection && <p className="rejection" role="alert">{rejection}</p>}

        <p className="shop-hint">The shared garden grows food for Potato. Walk up to the public garden and choose what to plant. Anyone can plant or harvest.</p>

      </section>

      <p className="footer">
        <a href="/readme/">What "good" means for this place →</a>
      </p>
    </main>
  );
}
