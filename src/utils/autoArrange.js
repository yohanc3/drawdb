import { graphlib, layout } from "@dagrejs/dagre";
import { tableWidth as defaultTableWidth } from "../data/constants";
import {
  getRelatedFieldKeysByTable,
  getTableHeight,
  getTableWidth,
} from "./utils";

const nodeSep = 150;
const rankSep = 260;
const isolatedGap = 60;
const targetRatio = 16 / 9;

export function autoArrange(tables, relationships, settings) {
  const movable = tables.filter((table) => !table.locked);
  const movableIds = new Set(movable.map((table) => table.id));

  const connectedIds = new Set();
  for (const r of relationships) {
    if (
      r.startTableId !== r.endTableId &&
      movableIds.has(r.startTableId) &&
      movableIds.has(r.endTableId)
    ) {
      connectedIds.add(r.startTableId);
      connectedIds.add(r.endTableId);
    }
  }

  const relatedFieldKeysByTable = getRelatedFieldKeysByTable(relationships);
  const sizeOf = (table) => ({
    width: getTableWidth(table),
    height: getTableHeight(
      table,
      settings.showComments,
      relatedFieldKeysByTable.get(table.id),
    ),
  });

  const connected = movable.filter((table) => connectedIds.has(table.id));
  const isolated = movable.filter((table) => !connectedIds.has(table.id));

  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: nodeSep, ranksep: rankSep });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const table of connected) {
    graph.setNode(String(table.id), sizeOf(table));
  }
  for (const r of relationships) {
    if (
      r.startTableId !== r.endTableId &&
      connectedIds.has(r.startTableId) &&
      connectedIds.has(r.endTableId)
    ) {
      graph.setEdge(String(r.startTableId), String(r.endTableId));
    }
  }

  layout(graph);

  const placed = connected.map((table) => {
    const node = graph.node(String(table.id));
    return {
      id: table.id,
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
    };
  });

  const extent = () => ({
    width: Math.max(0, ...placed.map((p) => p.x + p.width)),
    height: Math.max(0, ...placed.map((p) => p.y + p.height)),
  });
  const { width: maxX, height: maxY } = extent();

  const positions = placed.map(({ id, x, y }) => ({ id, x, y }));

  if (isolated.length > 0) {
    const isolatedArea = isolated.reduce((sum, table) => {
      const { width, height } = sizeOf(table);
      return sum + (width + isolatedGap) * (height + isolatedGap);
    }, 0);
    const rowWidth = Math.max(
      maxX,
      Math.sqrt(isolatedArea * targetRatio),
      4 * defaultTableWidth + 3 * isolatedGap,
    );
    let x = 0;
    let y = connected.length > 0 ? maxY + rankSep : 0;
    let rowHeight = 0;
    for (const table of isolated) {
      const { width, height } = sizeOf(table);
      if (x > 0 && x + width > rowWidth) {
        x = 0;
        y += rowHeight + isolatedGap;
        rowHeight = 0;
      }
      positions.push({ id: table.id, x, y });
      x += width + isolatedGap;
      rowHeight = Math.max(rowHeight, height);
    }
  }

  return positions;
}
