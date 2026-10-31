import { CampfirePanel } from "./ui/CampfirePanel.tsx";
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
import { WelcomeScreen } from "./ui/WelcomeScreen.tsx";
import { PROJECTS } from "../server/construction.ts";

function traceText(guineaPig: ReturnType<typeof useSanctuary>["guineaPig"]) {
  if (!guineaPig) return "Loading the sanctuary's memory…";
  if (guineaPig.feed_count === 0) return "Nobody has fed Huahua yet. Be the first.";
  const lastFed = new Date(`${guineaPig.last_fed_at}Z`).toLocaleString();
  return (
    `Huahua has been fed ${guineaPig.feed_count} time` +
    `${guineaPig.feed_count === 1 ? "" : "s"} by visitors to this sanctuary. ` +
    `Last fed ${lastFed}.`
  );
}

const WELCOME_SKIPPED_KEY = "sanctuary-welcome-skipped";

export default function App() {
  const { guineaPig, carePoints, visitorName, chooseName, storedFurniture, construction, rejection } =
    useSanctuary();
  // Skipping is a per-browser UI convenience, not shared world state, so
  // localStorage is fine here; the name itself is saved on the server.
  const [welcomeSkipped, setWelcomeSkipped] = useState(() => {
    try { return localStorage.getItem(WELCOME_SKIPPED_KEY) === "1"; } catch { return false; }
  });
  const [renaming, setRenaming] = useState(false);
  const showWelcome = renaming || (visitorName === null && !welcomeSkipped);
  function closeWelcome() {
    if (renaming) { setRenaming(false); return; }
    try { localStorage.setItem(WELCOME_SKIPPED_KEY, "1"); } catch { /* still dismissed for this visit */ }
    setWelcomeSkipped(true);
  }
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 760px)").matches);
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
    const onOpen = (projectId: string) => { setOpenConstructionProjectId(projectId); setSidebarOpen(true); };

    const onClose = () => setOpenConstructionProjectId(null);
    EventBus.on("close-construction-panel", onClose);
    EventBus.on("open-construction-panel", onOpen);
    return () => {
      EventBus.off("room-changed", onRoom);

      EventBus.off("close-construction-panel", onClose);
      EventBus.off("open-construction-panel", onOpen);
    };
  }, []);

  return (
    <main className={`game-shell${sidebarOpen ? "" : " sidebar-collapsed"}`} aria-label="Guinea Pig Sanctuary game">
      <div className="game-viewport">
        <PhaserGame />
        <CampfirePanel />
        <button className="sidebar-toggle" type="button" aria-controls="game-sidebar"
          aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? "Hide sidebar ›" : "‹ Open sidebar"}
        </button>
        {showWelcome && <WelcomeScreen initialName={visitorName ?? ""} onSkip={closeWelcome}
          onSave={async (name) => { const failure = await chooseName(name); if (!failure) setRenaming(false); return failure; }} />}
      </div>
      <aside id="game-sidebar" className="game-sidebar" aria-label="Sanctuary sidebar" inert={!sidebarOpen}>
        <header className="sidebar-header">
          <span className="sidebar-kicker">A little world, together</span>
          <h1>Guinea Pig<br /><span>Sanctuary</span></h1>
          <p className="room-name">{view === "outdoor" ? "The meadow" : roomName(view)} <span>· shared world</span></p>
          <div className="toolbar">
            <CarePointsBadge value={carePoints} />
            <button type="button" className="change-name" onClick={() => setRenaming(true)}>
              {visitorName ? `${visitorName} · change` : "Choose a name"}
            </button>
          </div>
        </header>

        <div className="sidebar-scroll">
          {openConstructionProjectId && (
            <ConstructionPanel
              projectId={openConstructionProjectId}
              projectName={PROJECTS.find((p) => p.id === openConstructionProjectId)?.name ?? openConstructionProjectId}
              construction={construction[openConstructionProjectId] ?? null}
              onClose={() => setOpenConstructionProjectId(null)}
            />
          )}
          {view !== "outdoor" && (
            <section className="interior-furnishing" aria-label="Furnish this house">
              <div className="interior-furnishing-header"><strong>Furnish this house</strong></div>
              <ShopPanel carePoints={carePoints} />
              {storedFurniture.length > 0 && (
                <details className="interior-storage">
                  <summary>Shared storage ({storedFurniture.length})</summary>
                  <StoragePanel items={storedFurniture} />
                </details>
              )}
            </section>
          )}
          <section className="sanctuary-journal" aria-label="Sanctuary journal">
            <span className="sidebar-kicker">Around the sanctuary</span>
            <p className="guinea-pig"><strong>{guineaPig?.name ?? "Huahua"}</strong> is feeling {guineaPig?.personality ?? "curious"}.</p>
            <details><summary>Our shared memory</summary><p aria-live="polite">{traceText(guineaPig)}</p></details>
          </section>
          <details className="field-guide">
            <summary>Field guide & controls</summary>
            <p>A small, shared meadow for Huahua, Mochi, Biscuit and Clover. Changes to the sanctuary stay for the next visitor.</p>
            <p>Click the meadow, then use <strong>WASD or arrow keys</strong> to walk. Your character is labelled with your name (or “You”). Walk up to an animal or building and press <strong>E</strong>, or tap its nearby action. Finished buildings, including the shared shelter, are entered on foot; walk out through the doorway to leave.</p>
            <p>Click the shared garden to plant or harvest food. Everyone can help it grow.</p>
            <p>Walk beside a free campfire log and press E to sit. Press E again or walk to stand again.</p>
            <a href="/readme/" target="_blank" rel="noreferrer">About this sanctuary ↗</a>
          </details>
        </div>

        <footer className="sidebar-controls">
          {rejection && <p className="rejection" role="alert">{rejection}</p>}
          <PlayerControls />
        </footer>
      </aside>
    </main>
  );
}
