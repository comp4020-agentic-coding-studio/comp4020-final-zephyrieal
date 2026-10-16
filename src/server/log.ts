// One JSON line per visitor action, to stdout --- what `mise exec -- flyctl
// logs -a <repo>` tails live at the crit, and what Fly retains afterward so
// the trail outlives the session (crit 10's "fly by instruments": narrate
// who did what from the logs alone, never by clicking through the UI).
export function logAction(
  visitorId: string,
  action: string,
  details: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), visitor: visitorId, action, ...details }));
}
