import Phaser from "phaser";

// Phaser rasterises each Text once at its font size, then the camera zooms it
// (~1.5-2.5x) with the game-wide `pixelArt` nearest-neighbour filter, so 9px
// labels came out blocky next to the browser-drawn DOM bubbles. Rendering text
// at a higher resolution and filtering it smoothly keeps sprites pixel-art
// while labels stay legible.
const RESOLUTION = Math.min(6, Math.ceil(3 * (window.devicePixelRatio || 1)));

export function crispText(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  // Every redraw (setText, setResolution…) re-uploads the canvas with the
  // renderer's default NEAREST filter, so the smooth filter is reapplied after
  // each one rather than set once.
  const redraw = text.updateText.bind(text);
  text.updateText = () => {
    redraw();
    text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return text;
  };
  text.setResolution(RESOLUTION);
  return text;
}
