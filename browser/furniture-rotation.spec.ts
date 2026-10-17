import { test, expect } from "@playwright/test";
import { inflateSync } from "node:zlib";
import { HOUSE_ORIGIN_X, HOUSE_ORIGIN_Y, GAME_WIDTH, GAME_HEIGHT } from "../src/client/game/layout.ts";
import { TILE_SIZE, footprintFor } from "../src/server/furniture.ts";

// Regression for "rotating furniture should swap in a different drawn sprite
// per side, not spin one square image" (src/server/furniture.ts's viewFor,
// wired into IndoorScene.ts's renderGhost/redrawFurniture). spec/ can't catch
// this --- it's HTTP+WS only, with no Phaser/DOM rendering (see
// spec/README.md) --- so this drives a real browser and screenshots the same
// tile at 0deg (front) and 180deg (back).
//
// The check is the *set of colors present*, not pixel positions: spinning
// one square image 180 degrees in place rearranges pixels but can never add
// or remove a color from the set that's present --- every color in the
// rotated image was already in the original. A genuinely different sprite
// (front has a door-hole color the back sprite never uses at all --- see
// src/client/assets/sprites/furniture-hideout-front.png vs
// furniture-hideout-back.png) can and does change that set. Confirmed by
// reverting the fix locally: the buggy single-sprite-rotation version shows
// zero colors unique to either screenshot; the real fix shows at least one.
//
// Assumes a relatively empty house (a fresh `pnpm dev` ./data/sanctuary.db,
// or at least this corner tile free) --- same caveat spec/README.md already
// notes for furniture tests against a long-lived local database.

const KIND = "hideout";
const TILE_X = 7;
const TILE_Y = 5; // away from the entrance gap, unlikely to already be occupied

function pieceCenter(tileX: number, tileY: number, widthTiles: number, heightTiles: number) {
  return {
    x: HOUSE_ORIGIN_X + tileX * TILE_SIZE + (widthTiles * TILE_SIZE) / 2,
    y: HOUSE_ORIGIN_Y + tileY * TILE_SIZE + (heightTiles * TILE_SIZE) / 2,
  };
}

// IndoorScene's previewTile is `floor((pointer - origin) / TILE_SIZE)` ---
// the top-left tile under the cursor, not the footprint's center --- so the
// pointer has to land anywhere within that one top-left tile's own pixel
// square, not at the multi-tile footprint's visual center.
function anyPointInTopLeftTile(tileX: number, tileY: number) {
  return {
    x: HOUSE_ORIGIN_X + tileX * TILE_SIZE + TILE_SIZE / 2,
    y: HOUSE_ORIGIN_Y + tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

// Mirrors IndoorScene.ts's renderMenu() layout math exactly, for the 5-icon
// (non confirm-store) menu: [rotate, move, save, store, cancel].
function rotateIconCenter(cx: number, cy: number, widthTiles: number, heightTiles: number) {
  const panelWidth = 88;
  const panelHeight = 26;
  const iconSize = 16;
  const gap = 2;
  const iconCount = 5;
  const totalIconsWidth = iconCount * iconSize + (iconCount - 1) * gap;

  const panelX = Math.min(Math.max(cx - panelWidth / 2, 0), GAME_WIDTH - panelWidth);
  const panelY = Math.min(
    Math.max(cy - (heightTiles * TILE_SIZE) / 2 - panelHeight - 6, 0),
    GAME_HEIGHT - panelHeight,
  );

  const firstIconX = panelX + (panelWidth - totalIconsWidth) / 2 + iconSize / 2;
  const iconY = panelY + panelHeight / 2;
  return { x: firstIconX, y: iconY }; // Rotate is icon index 0
}

// Minimal 8-bit, non-interlaced PNG decoder --- exactly what Playwright's
// own screenshot buffers are, so this avoids adding a PNG dependency just
// for one test's color-set comparison. Returns distinct RGB colors present,
// skipping fully-transparent pixels.
function colorSet(png: Buffer): Set<number> {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`only 8-bit PNGs are supported here, got bit depth ${bitDepth}`);

  const raw = inflateSync(Buffer.concat(idatChunks));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  const colors = new Set<number>();
  let rawOffset = 0;
  let prevRow = Buffer.alloc(stride);
  let outRow = Buffer.alloc(stride);

  while (rawOffset < raw.length) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const row = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? outRow[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let pred: number;
      if (filterType === 0) pred = 0;
      else if (filterType === 1) pred = a;
      else if (filterType === 2) pred = b;
      else if (filterType === 3) pred = Math.floor((a + b) / 2);
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else throw new Error(`unknown PNG filter type ${filterType}`);
      outRow[x] = (row[x] + pred) & 0xff;
    }
    for (let x = 0; x < stride; x += channels) {
      const alpha = channels === 4 ? outRow[x + 3] : 255;
      if (alpha === 0) continue;
      colors.add((outRow[x] << 16) | (outRow[x + 1] << 8) | outRow[x + 2]);
    }
    const swap = prevRow;
    prevRow = outRow;
    outRow = swap;
  }
  return colors;
}

test("rotating a placed hideout swaps in a genuinely different sprite per side", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1000);

  // Hideout costs 40; one feed earns 10.
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Feed Potato" }).click();
    await page.waitForTimeout(150);
  }

  await page.getByRole("button", { name: "Go inside" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Hideout/ }).click();
  await page.waitForTimeout(200);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not found");

  const { width, height } = footprintFor(KIND, 0);
  const center = pieceCenter(TILE_X, TILE_Y, width, height);

  const anchor = anyPointInTopLeftTile(TILE_X, TILE_Y);
  const clickX = box.x + anchor.x;
  const clickY = box.y + anchor.y;
  await page.mouse.move(clickX, clickY);
  await page.waitForTimeout(100);
  await page.mouse.click(clickX, clickY);
  await page.waitForTimeout(400);

  const rejection = page.getByRole("alert");
  if (await rejection.isVisible().catch(() => false)) {
    throw new Error(
      `placement rejected: "${await rejection.textContent()}" --- pick a different TILE_X/TILE_Y`,
    );
  }

  const pieceX = box.x + center.x;
  const pieceY = box.y + center.y;
  const clip = {
    x: pieceX - (width * TILE_SIZE) / 2,
    y: pieceY - (height * TILE_SIZE) / 2,
    width: width * TILE_SIZE,
    height: height * TILE_SIZE,
  };

  const front = await page.screenshot({ clip }); // 0deg

  const rotate = rotateIconCenter(center.x, center.y, width, height);
  const iconStep = 16 + 2;
  const saveX = box.x + rotate.x + 2 * iconStep; // Save is the 3rd of 5 icons (rotate, move, save, ...)
  const saveY = box.y + rotate.y;

  // Rotate twice and save each time: 0 -> 90 (right) -> 180 (back).
  for (let i = 0; i < 2; i++) {
    await page.mouse.click(pieceX, pieceY); // open the edit menu
    await page.waitForTimeout(300);
    await page.mouse.click(box.x + rotate.x, box.y + rotate.y); // Rotate
    await page.waitForTimeout(250);
    await page.mouse.click(saveX, saveY); // Save
    await page.waitForTimeout(400);
  }

  const back = await page.screenshot({ clip }); // 180deg

  expect(errors, "rotating threw a client-side error").toEqual([]);

  const frontColors = colorSet(front);
  const backColors = colorSet(back);
  const onlyInFront = [...frontColors].filter((c) => !backColors.has(c));
  const onlyInBack = [...backColors].filter((c) => !frontColors.has(c));

  expect(
    onlyInFront.length + onlyInBack.length,
    "front (0deg) and back (180deg) have exactly the same set of colors --- " +
      "rotation is spinning one sprite in place instead of swapping to a dedicated back view",
  ).toBeGreaterThan(0);
});
