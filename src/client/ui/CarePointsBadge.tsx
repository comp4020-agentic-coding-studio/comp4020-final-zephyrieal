// CLAUDE.md's Interface section bans raw stat displays in general, with one
// named exception: a visitor's own Care Points balance, since the shop can't
// work without showing it, and it's about the visitor, not the guinea pig.
export function CarePointsBadge({ value }: { value: number }) {
  return (
    <p className="care-points" aria-live="polite">
      🌱 {value} care point{value === 1 ? "" : "s"}
    </p>
  );
}
