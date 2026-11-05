import { pngExportPixelRatio } from "../data/constants";

const maxExportPixels = 48_000_000;
const maxExportDimension = 12_000;

export function filterCanvasExportNode(node) {
  return node.getAttribute?.("data-export-exclude") !== "true";
}

export function getRasterExportPixelRatio(canvas, zoom) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return pngExportPixelRatio;

  const desiredRatio = Math.max(
    pngExportPixelRatio,
    Math.min(8, 2 / Math.max(zoom, 0.1)),
  );
  const sizeLimit = Math.min(
    maxExportDimension / width,
    maxExportDimension / height,
    Math.sqrt(maxExportPixels / (width * height)),
  );

  return Math.max(pngExportPixelRatio, Math.min(desiredRatio, sizeLimit));
}
