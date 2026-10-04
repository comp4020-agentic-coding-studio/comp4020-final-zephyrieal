// No framework, no build step: this is the proof-of-life slice, and a dozen
// lines of fetch calls are enough for it. A real-time, multi-visitor layer
// (WebSockets) is week 10's job --- see README and PROCESS.md.

const traceEl = document.getElementById("trace");
const nameEl = document.getElementById("pig-name");
const personalityEl = document.getElementById("pig-personality");
const feedButton = document.getElementById("feed-button");

function renderState({ guineaPig, recentVisits }) {
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

  void recentVisits;
}

async function loadState() {
  const res = await fetch("/api/state");
  renderState(await res.json());
}

feedButton.addEventListener("click", async () => {
  feedButton.disabled = true;
  try {
    const res = await fetch("/api/feed", { method: "POST" });
    renderState(await res.json());
  } finally {
    feedButton.disabled = false;
  }
});

loadState();
