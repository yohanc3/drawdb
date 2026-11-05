import { pngExportPixelRatio } from "../data/constants";

const maxExportPixels = 48_000_000;
const maxExportDimension = 12_000;
const exportMargin = 8;

export function filterCanvasExportNode(node) {
  return node.getAttribute?.("data-export-exclude") !== "true";
}

export function getRasterExportPixelRatio({ width, height }) {
  if (!width || !height) return pngExportPixelRatio;

  const sizeLimit = Math.min(
    maxExportDimension / width,
    maxExportDimension / height,
    Math.sqrt(maxExportPixels / (width * height)),
  );

  return Math.min(pngExportPixelRatio, sizeLimit);
}

export function createCanvasExport(canvas, raster = true) {
  const diagram = canvas.querySelector("#diagram");
  const viewBox = diagram.viewBox.baseVal;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const element of diagram.children) {
    if (
      element.tagName.toLowerCase() === "defs" ||
      element.hasAttribute("data-export-background") ||
      !filterCanvasExportNode(element) ||
      typeof element.getBBox !== "function"
    ) {
      continue;
    }

    const boundsElements = element.querySelectorAll("[data-export-bounds]");
    for (const part of boundsElements.length ? boundsElements : [element]) {
      const box = part.getBBox();
      if (!box.width && !box.height) continue;
      const inset = Number(part.getAttribute("data-export-inset")) || 0;
      left = Math.min(left, box.x + inset);
      top = Math.min(top, box.y + inset);
      right = Math.max(right, box.x + box.width - inset);
      bottom = Math.max(bottom, box.y + box.height - inset);
    }
  }

  if (!Number.isFinite(left)) {
    left = viewBox.x;
    top = viewBox.y;
    right = left + viewBox.width;
    bottom = top + viewBox.height;
  }

  const pixelRatio = raster
    ? getRasterExportPixelRatio({ width: right - left, height: bottom - top })
    : 1;
  const margin = exportMargin / pixelRatio;
  const x = left - margin;
  const y = top - margin;
  const width = right - left + margin * 2;
  const height = bottom - top + margin * 2;
  const node = diagram.cloneNode(true);
  node.removeAttribute("id");
  node.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  node.setAttribute("width", width);
  node.setAttribute("height", height);
  node.style.position = "static";
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  node.style.maxWidth = "none";
  node.style.maxHeight = "none";

  node
    .querySelectorAll('[data-export-exclude="true"]')
    .forEach((child) => child.remove());
  node.querySelectorAll("[data-export-background]").forEach((background) => {
    background.setAttribute("x", x);
    background.setAttribute("y", y);
    background.setAttribute("width", width);
    background.setAttribute("height", height);
  });

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-100000px;top:0;pointer-events:none;overflow:visible";
  container.appendChild(node);
  document.body.appendChild(container);

  return {
    node,
    width,
    height,
    pixelRatio,
    backgroundColor: getComputedStyle(canvas.firstElementChild).backgroundColor,
    cleanup: () => container.remove(),
  };
}
