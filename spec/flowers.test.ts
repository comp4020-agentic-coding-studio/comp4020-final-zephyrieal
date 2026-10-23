import { expect, inject, it } from "vitest";
it("retires the test flower feature in favour of the public garden", async () => {
  const base = inject("baseUrl");
  const state = await fetch(new URL("/api/state", base)).then(r => r.json());
  expect(state).not.toHaveProperty("flowers");
  expect(state.farm.plots).toHaveLength(1);
  const retired = await fetch(new URL("/api/plant", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: 50, y: 50 }) });
  expect(retired.status).toBe(404);
});
