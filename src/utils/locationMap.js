const TILE_SIZE = 256;

export function getLocationTileMap(lat, lng, zoom = 16) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const boundedLatitude = Math.max(-85.0511, Math.min(85.0511, latitude));
  const tilesAtZoom = 2 ** zoom;
  const xFloat = ((longitude + 180) / 360) * tilesAtZoom;
  const radians = (boundedLatitude * Math.PI) / 180;
  const yFloat = ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * tilesAtZoom;
  const centerX = Math.floor(xFloat);
  const centerY = Math.floor(yFloat);
  const tiles = [];

  for (let row = -1; row <= 1; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      const x = (centerX + column + tilesAtZoom) % tilesAtZoom;
      const y = Math.max(0, Math.min(tilesAtZoom - 1, centerY + row));
      tiles.push({
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        row: row + 2,
        column: column + 2
      });
    }
  }

  return {
    tiles,
    offsetX: TILE_SIZE + (xFloat - centerX) * TILE_SIZE,
    offsetY: TILE_SIZE + (yFloat - centerY) * TILE_SIZE
  };
}

export function renderLocationTileMap(lat, lng) {
  const map = getLocationTileMap(lat, lng);
  if (!map) return "";

  const tiles = map.tiles
    .map(
      (tile) =>
        `<img src="${tile.url}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="grid-column:${tile.column};grid-row:${tile.row}" />`
    )
    .join("");

  return `
    <span class="map-tile-layer" style="--map-offset-x:${map.offsetX.toFixed(2)}px;--map-offset-y:${map.offsetY.toFixed(2)}px">${tiles}</span>
    <small class="map-attribution">© OpenStreetMap</small>
  `;
}



