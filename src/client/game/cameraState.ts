export const cameraState = { x: 0, y: 0, zoom: 1, width: 960, height: 640 };
export function worldPosition(x: number, y: number) {
  return { left: `${(x - cameraState.x) * cameraState.zoom / cameraState.width * 100}%`, top: `${(y - cameraState.y) * cameraState.zoom / cameraState.height * 100}%` };
}
export function menuPosition(x: number, y: number) {
  const sx = (x - cameraState.x) * cameraState.zoom / cameraState.width * 100;
  const sy = (y - cameraState.y) * cameraState.zoom / cameraState.height * 100;
  return { left: `${Math.max(25, Math.min(75, sx))}%`, top: `${Math.max(60, Math.min(92, sy))}%` };
}
