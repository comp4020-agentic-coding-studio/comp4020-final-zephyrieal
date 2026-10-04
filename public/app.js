// No framework, no build step: this is the proof-of-life slice, and a dozen
// lines of fetch calls are enough for it. A real-time, multi-visitor layer
// (WebSockets) is week 10's job --- see README and PROCESS.md.

const traceEl = document.getElementById("trace");
const nameEl = document.getElementById("pig-name");
const personalityEl = document.getElementById("pig-personality");
const feedButton = document.getElementById("feed-button");
const meadowEl = document.getElementById("meadow");
const flowerTraceEl = document.getElementById("flower-trace");

function renderGuineaPig(guineaPig) {
  nameEl.textContent = guineaPig.name;
  personalityEl.textContent = guineaPig.personality;

  if (guineaPig.feed_count === 0) {
    traceEl.textContent = "Nobody has fed Potato yet. Be the first.";
  } else {
    const lastFed = new Date(guineaPig.last_fed_at + "Z").toLocaleString();
    traceEl.textContent =
      `Potato has been fed ${guineaPig.feed_count} time` +
      `${guineaPig.feed_count === 1 ? "" : "s"} by visitors to this sanctuary. ` +
      `Last fed ${lastFed}.`;
  }
}

function renderFlowers(flowers) {
  meadowEl.querySelectorAll(".flower").forEach((el) => el.remove());

  for (const flower of flowers) {
    const span = document.createElement("span");
    span.className = "flower";
    span.textContent = "🌼";
    span.style.left = `${flower.x}%`;
    span.style.top = `${flower.y}%`;
    span.title = `planted ${new Date(flower.planted_at + "Z").toLocaleString()}`;
    meadowEl.appendChild(span);
  }

  flowerTraceEl.textContent =
    flowers.length === 0
      ? "No one has planted anything here yet. Click the meadow to plant a flower."
      : `${flowers.length} flower${flowers.length === 1 ? "" : "s"} planted by visitors so far.`;
}

function renderState({ guineaPig, flowers }) {
  renderGuineaPig(guineaPig);
  renderFlowers(flowers);
}

async function loadState() {
  const res = await fetch("/api/state");
  renderState(await res.json());
}

async function plant(x, y) {
  const res = await fetch("/api/plant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  });
  const { flowers } = await res.json();
  renderFlowers(flowers);
}

feedButton.addEventListener("click", async () => {
  feedButton.disabled = true;
  try {
    const res = await fetch("/api/feed", { method: "POST" });
    renderGuineaPig((await res.json()).guineaPig);
  } finally {
    feedButton.disabled = false;
  }
});

meadowEl.addEventListener("click", (event) => {
  const rect = meadowEl.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  plant(x, y);
});

// Keyboard equivalent for the click above --- there's no cursor position to
// read, so Enter/Space plants somewhere reasonable in the meadow instead of
// requiring a mouse (CLAUDE.md: "controls should be keyboard-operable where
// practical").
meadowEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    plant(20 + Math.random() * 60, 20 + Math.random() * 60);
  }
});

loadState();
