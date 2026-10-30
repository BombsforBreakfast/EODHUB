export type JobMapSize = { width: number; height: number };
export type JobMapCamera = { zoom: number; x: number; y: number };
export type JobMapPoint = { x: number; y: number };
export const INITIAL_JOB_MAP_CAMERA: JobMapCamera = { zoom: 1, x: 0, y: 0 };
export const MAX_JOB_MAP_ZOOM = 8;

export function jobMapTransform(size: JobMapSize, camera: JobMapCamera) {
  const scale = Math.min(size.width / 960, size.height / 600) * camera.zoom;
  return { scale, x: size.width / 2 + camera.x - 480 * scale, y: size.height / 2 + camera.y - 300 * scale };
}

export function clampJobMapCamera(camera: JobMapCamera, size: JobMapSize): JobMapCamera {
  const zoom = Math.max(1, Math.min(MAX_JOB_MAP_ZOOM, camera.zoom));
  const scale = Math.min(size.width / 960, size.height / 600) * zoom;
  const maxX = Math.max(0, (960 * scale - size.width) / 2), maxY = Math.max(0, (600 * scale - size.height) / 2);
  return { zoom, x: Math.max(-maxX, Math.min(maxX, camera.x)), y: Math.max(-maxY, Math.min(maxY, camera.y)) };
}

/** Preserve the point beneath the cursor/pinch midpoint as zoom changes. */
export function zoomJobMapCamera(camera: JobMapCamera, zoom: number, size: JobMapSize, anchor: JobMapPoint = { x: size.width / 2, y: size.height / 2 }): JobMapCamera {
  const next = Math.max(1, Math.min(MAX_JOB_MAP_ZOOM, zoom)), ratio = next / camera.zoom;
  return clampJobMapCamera({ zoom: next, x: anchor.x - size.width / 2 - (anchor.x - size.width / 2 - camera.x) * ratio, y: anchor.y - size.height / 2 - (anchor.y - size.height / 2 - camera.y) * ratio }, size);
}

export function pinchJobMapCamera(camera: JobMapCamera, start: [JobMapPoint, JobMapPoint], current: [JobMapPoint, JobMapPoint], size: JobMapSize): JobMapCamera {
  const distance = (points: [JobMapPoint, JobMapPoint]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const middle = (points: [JobMapPoint, JobMapPoint]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const before = middle(start), after = middle(current);
  const zoom = Math.max(1, Math.min(MAX_JOB_MAP_ZOOM, camera.zoom * distance(current) / Math.max(1, distance(start))));
  const ratio = zoom / camera.zoom;
  return clampJobMapCamera({ zoom, x: after.x - size.width / 2 - (before.x - size.width / 2 - camera.x) * ratio, y: after.y - size.height / 2 - (before.y - size.height / 2 - camera.y) * ratio }, size);
}

/** Bounds come from the already projected Census polygon vertices (M/L paths). */
export function jobMapShapeBounds(paths: string[]): [number, number, number, number] {
  const vertices = paths.flatMap(path => [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]));
  return [Math.min(...vertices.map(point => point[0])), Math.min(...vertices.map(point => point[1])), Math.max(...vertices.map(point => point[0])), Math.max(...vertices.map(point => point[1]))];
}

export function focusJobMapBounds(bounds: [number, number, number, number], size: JobMapSize): JobMapCamera {
  const base = Math.min(size.width / 960, size.height / 600);
  const zoom = Math.max(1, Math.min(MAX_JOB_MAP_ZOOM, (size.width - 48) / ((bounds[2] - bounds[0]) * base), (size.height - 48) / ((bounds[3] - bounds[1]) * base)));
  return clampJobMapCamera({ zoom, x: (480 - (bounds[0] + bounds[2]) / 2) * base * zoom, y: (300 - (bounds[1] + bounds[3]) / 2) * base * zoom }, size);
}

export type JobMapLabelPoint = JobMapPoint & { code: string; count: number };
export type JobMapLabel = JobMapLabelPoint & { anchorX: number; anchorY: number; width: number; height: number };

/** Every visible populated state gets a count. Move crowded badges with leader
 * lines instead of dropping East Coast states or reducing the text size. */
export function layoutJobMapLabels(points: JobMapLabelPoint[], size: JobMapSize): JobMapLabel[] {
  const labels: JobMapLabel[] = [];
  const visible = [...points].filter(point => point.count > 0 && point.x >= 0 && point.y >= 0 && point.x <= size.width && point.y <= size.height).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  for (const point of visible) {
    const width = Math.max(40, 22 + String(point.count).length * 8), height = 26;
    const fits = (candidate: JobMapPoint) => candidate.x >= width / 2 + 2 && candidate.x <= size.width - width / 2 - 2 && candidate.y >= height / 2 + 2 && candidate.y <= size.height - height / 2 - 2 && !(candidate.x + width / 2 > size.width - 64 && candidate.y + height / 2 > size.height - 146) && labels.every(other => Math.abs(candidate.x - other.x) >= (width + other.width) / 2 + 2 || Math.abs(candidate.y - other.y) >= (height + other.height) / 2 + 2);
    let position: JobMapPoint | undefined = fits(point) ? point : undefined;
    for (let radius = 20; radius <= Math.max(size.width, size.height) && !position; radius += 20) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const candidate = { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
        if (fits(candidate)) { position = candidate; break; }
      }
    }
    if (!position) {
      for (let y = height / 2 + 2; y <= size.height - height / 2 - 2 && !position; y += height + 2) {
        for (let x = width / 2 + 2; x <= size.width - width / 2 - 2; x += width + 2) if (fits({ x, y })) { position = { x, y }; break; }
      }
    }
    if (!position) {
      // Repack globally when greedy placement leaves scattered unusable gaps.
      const cellWidth = Math.max(...visible.map(item => Math.max(40, 22 + String(item.count).length * 8)));
      const slots: JobMapPoint[] = [];
      for (let y = height / 2 + 2; y <= size.height - height / 2 - 2; y += height + 2) {
        for (let x = cellWidth / 2 + 2; x <= size.width - cellWidth / 2 - 2; x += cellWidth + 2) if (!(x + cellWidth / 2 > size.width - 64 && y + height / 2 > size.height - 146)) slots.push({ x, y });
      }
      if (slots.length >= visible.length) return visible.map(item => {
        slots.sort((a, b) => Math.hypot(a.x - item.x, a.y - item.y) - Math.hypot(b.x - item.x, b.y - item.y));
        return { ...item, ...slots.shift()!, anchorX: item.x, anchorY: item.y, width: cellWidth, height };
      });
    }
    // Keep the count even in exceptionally dense inventories; zoom spreads them.
    position ??= { x: Math.max(width / 2, Math.min(size.width - width / 2, point.x)), y: Math.max(height / 2, Math.min(size.height - height / 2, point.y)) };
    labels.push({ ...point, ...position, anchorX: point.x, anchorY: point.y, width, height });
  }
  return labels;
}
