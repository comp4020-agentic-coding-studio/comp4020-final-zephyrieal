import { useEffect, useState } from "react";
import { PhaserGame } from "./game/PhaserGame.tsx";
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
  const { guineaPig, carePoints, flowers, storedFurniture, construction, rejection, feed } =
    useSanctuary();
  const [view, setView] = useState<"outdoor" | "indoor">("outdoor");
  const [feeding, setFeeding] = useState(false);
  const [openConstructionProjectId, setOpenConstructionProjectId] = useState<string | null>(null);

  // A construction site is a Phaser sprite living in OutdoorScene; this is
  // the first Phaser-to-React direction in this codebase (everywhere else,
  // like toggleView below, React drives Phaser) --- a site's own click
  // handler emits this, naming which project it is, once that site is
  // clicked. Only one panel is ever open at a time: clicking a different
  // site while one is open swaps which project's panel shows.
  useEffect(() => {
    const onOpen = (projectId: string) => setOpenConstructionProjectId(projectId);
    EventBus.on("open-construction-panel", onOpen);
    return () => {
      EventBus.off("open-construction-panel", onOpen);
    };
  }, []);

  function toggleView() {
    const next = view === "outdoor" ? "indoor" : "outdoor";
    setView(next);
    EventBus.emit("switch-scene", next);
  }

  return (
    <main>
      <h1>Guinea Pig Sanctuary</h1>
      <p className="intro">
        A small, shared meadow and the house just behind it. Right now there's
        one guinea pig here — <strong>Potato</strong> — and whatever you leave
        behind, outside or in, stays for the next visitor.
      </p>

      <section className="meadow-wrap">
        <p className="guinea-pig">
          🐹 <span>{guineaPig?.name ?? "Potato"}</span> is in the sanctuary,
          looking <span>{guineaPig?.personality ?? "curious"}</span>.
        </p>
        <p aria-live="polite">{traceText(guineaPig)}</p>

        <div className="toolbar">
          <button
            type="button"
            disabled={feeding}
            onClick={async () => {
              setFeeding(true);
              try {
                await feed();
              } finally {
                setFeeding(false);
              }
            }}
          >
            Feed Potato
          </button>
          <CarePointsBadge value={carePoints} />
          <button type="button" onClick={toggleView}>
            {view === "outdoor" ? "Go inside" : "Go back outside"}
          </button>
          {view === "outdoor" && (
            <button type="button" onClick={() => EventBus.emit("plant-random")}>
              Plant a flower
            </button>
          )}
        </div>

        <PhaserGame />

        {openConstructionProjectId && (
          <ConstructionPanel
            projectId={openConstructionProjectId}
            projectName={PROJECTS.find((p) => p.id === openConstructionProjectId)?.name ?? openConstructionProjectId}
            construction={construction[openConstructionProjectId] ?? null}
            onClose={() => setOpenConstructionProjectId(null)}
          />
        )}

        {view === "indoor" && (
          <>
            <ShopPanel carePoints={carePoints} />
            <StoragePanel items={storedFurniture} />
          </>
        )}

        {rejection && <p className="rejection" role="alert">{rejection}</p>}

        <p aria-live="polite">
          {flowers.length === 0
            ? "No one has planted anything here yet. Click the meadow to plant a flower."
            : `${flowers.length} flower${flowers.length === 1 ? "" : "s"} planted by visitors so far.`}
        </p>
      </section>

      <p className="footer">
        <a href="/readme/">What "good" means for this place →</a>
      </p>
    </main>
  );
}
