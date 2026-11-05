import { tableFieldHeight, tableHeaderHeight } from "../data/constants";
import {
  getCommentHeight,
  getFieldOffsetY,
  getRelationshipFields,
  getTableHeight,
  getTableWidth,
  getVisibleFieldEntries,
} from "./utils";

const TRACK_SPACING = 18;
const TABLE_CLEARANCE = 8;
const PORT_SPREAD = 12;

const between = (value, a, b) =>
  value > Math.min(a, b) && value < Math.max(a, b);
const overlap = (a, b, c, d) =>
  Math.max(
    0,
    Math.min(Math.max(a, b), Math.max(c, d)) -
      Math.max(Math.min(a, b), Math.min(c, d)),
  );

function fieldAnchor(table, fieldId, relatedKeys, showComments) {
  const entries = getVisibleFieldEntries(table, relatedKeys);
  const index = entries.findIndex(
    ({ field, originalIndex }) =>
      field.id === fieldId || originalIndex === fieldId,
  );
  if (index < 0) return null;
  const width = getTableWidth(table);
  return (
    table.y +
    tableHeaderHeight +
    getCommentHeight(table.comment, width, showComments) +
    getFieldOffsetY(
      entries.map(({ field }) => field),
      index,
      width,
      showComments,
    ) +
    tableFieldHeight / 2
  );
}

function rectFor(table, relatedKeys, showComments) {
  return {
    left: table.x,
    right: table.x + getTableWidth(table),
    top: table.y,
    bottom: table.y + getTableHeight(table, showComments, relatedKeys),
  };
}

function sidesFor(a, b) {
  if (a.right < b.left) return ["right", "left"];
  if (b.right < a.left) return ["left", "right"];
  const left = Math.abs(a.left - b.left);
  const right = Math.abs(a.right - b.right);
  return left <= right ? ["left", "left"] : ["right", "right"];
}

const portX = (rect, side) => (side === "left" ? rect.left : rect.right);
const direction = (side) => (side === "left" ? -1 : 1);

function segments(points) {
  const result = [];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (Math.abs(x1 - x2) + Math.abs(y1 - y2) > 0.01)
      result.push({ x1, y1, x2, y2, horizontal: Math.abs(y1 - y2) < 0.01 });
  }
  return result;
}

function throughTable(segment, rect) {
  if (segment.horizontal) {
    return between(
      segment.y1,
      rect.top - TABLE_CLEARANCE,
      rect.bottom + TABLE_CLEARANCE,
    )
      ? overlap(
          segment.x1,
          segment.x2,
          rect.left - TABLE_CLEARANCE,
          rect.right + TABLE_CLEARANCE,
        )
      : 0;
  }
  return between(
    segment.x1,
    rect.left - TABLE_CLEARANCE,
    rect.right + TABLE_CLEARANCE,
  )
    ? overlap(
        segment.y1,
        segment.y2,
        rect.top - TABLE_CLEARANCE,
        rect.bottom + TABLE_CLEARANCE,
      )
    : 0;
}

function lineConflict(a, b) {
  if (a.horizontal === b.horizontal) {
    const distance = a.horizontal
      ? Math.abs(a.y1 - b.y1)
      : Math.abs(a.x1 - b.x1);
    const shared = a.horizontal
      ? overlap(a.x1, a.x2, b.x1, b.x2)
      : overlap(a.y1, a.y2, b.y1, b.y2);
    if (shared <= 0 || distance >= TRACK_SPACING) return 0;
    return shared * (distance < 1 ? 28 : 6) + 120;
  }
  const horizontal = a.horizontal ? a : b;
  const vertical = a.horizontal ? b : a;
  return between(vertical.x1, horizontal.x1, horizontal.x2) &&
    between(horizontal.y1, vertical.y1, vertical.y2)
    ? 75
    : 0;
}

function scorePath(points, rectangles, occupied) {
  const pathSegments = segments(points);
  let score =
    pathSegments.reduce(
      (sum, s) => sum + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1),
      0,
    ) * 0.35;
  score += (pathSegments.length - 1) * 12;
  for (const segment of pathSegments) {
    for (const rect of rectangles) {
      const penetration = throughTable(segment, rect);
      if (penetration > 0) score += 100000 + penetration * 100;
    }
    for (const other of occupied) score += lineConflict(segment, other);
  }
  return score;
}

function uniqueNumbers(values) {
  return [
    ...new Set(
      values
        .filter(Number.isFinite)
        .map((value) => Math.round(value * 10) / 10),
    ),
  ];
}

function candidateTracks(seed, rects) {
  const {
    startX,
    endX,
    startY,
    endY,
    startSide,
    endSide,
    startEscapeX,
    endEscapeX,
    manualOffset,
  } = seed;
  const candidates = [];
  const dirA = direction(startSide);
  const dirB = direction(endSide);
  const baseX =
    startSide !== endSide
      ? (startEscapeX + endEscapeX) / 2
      : startSide === "right"
        ? Math.max(startEscapeX, endEscapeX) + TRACK_SPACING
        : Math.min(startEscapeX, endEscapeX) - TRACK_SPACING;
  const xLanes = uniqueNumbers([
    baseX + manualOffset,
    ...Array.from(
      { length: 25 },
      (_, i) => baseX + manualOffset + (i - 12) * TRACK_SPACING,
    ),
    ...rects.flatMap((rect) => [rect.left - 24, rect.right + 24]),
  ]).filter((x) => (x - startX) * dirA >= 50 && (x - endX) * dirB >= 50);
  for (const x of xLanes) {
    candidates.push({
      points: [
        [startX, startY],
        [x, startY],
        [x, endY],
        [endX, endY],
      ],
      preference:
        Math.abs(x - baseX - manualOffset) * (manualOffset ? 2 : 0.05),
      track: x,
    });
  }

  const yLanes = uniqueNumbers([
    (startY + endY) / 2,
    ...rects.flatMap((rect) => [rect.top - 24, rect.bottom + 24]),
    ...Array.from(
      { length: 17 },
      (_, i) => (startY + endY) / 2 + (i - 8) * TRACK_SPACING,
    ),
  ]);
  for (const lane of [0, 1, 2, 3])
    for (const y of yLanes) {
      const startClearance = Math.max(
        20,
        Math.abs(startEscapeX - startX) + lane * TRACK_SPACING + manualOffset,
      );
      const endClearance = Math.max(
        20,
        Math.abs(endEscapeX - endX) + lane * TRACK_SPACING + manualOffset,
      );
      const sx = startX + dirA * startClearance;
      const ex = endX + dirB * endClearance;
      candidates.push({
        points: [
          [startX, startY],
          [sx, startY],
          [sx, y],
          [ex, y],
          [ex, endY],
          [endX, endY],
        ],
        preference: Math.abs(y - (startY + endY) / 2) * 0.05 + lane * 5,
        track: y,
      });
    }
  return candidates;
}

function pathFromPoints(points) {
  return points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
}

/** Route all links together so table obstacles and already used tracks are visible. */
export function buildRelationshipRouting({
  relationships,
  tables,
  relatedFieldKeysByTable = new Map(),
  showComments = true,
}) {
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const rectById = new Map(
    tables.map((table) => [
      table.id,
      rectFor(table, relatedFieldKeysByTable.get(table.id), showComments),
    ]),
  );
  const seeds = relationships
    .map((relationship) => {
      const a = tableById.get(relationship.startTableId);
      const b = tableById.get(relationship.endTableId);
      if (!a || !b) return null;
      const pairs = getRelationshipFields(relationship);
      if (pairs.length !== 1) return null; // Composite keys keep their fork renderer.
      const startY = fieldAnchor(
        a,
        pairs[0].startFieldId,
        relatedFieldKeysByTable.get(a.id),
        showComments,
      );
      const endY = fieldAnchor(
        b,
        pairs[0].endFieldId,
        relatedFieldKeysByTable.get(b.id),
        showComments,
      );
      if (startY === null || endY === null) return null;
      const aRect = rectById.get(a.id);
      const bRect = rectById.get(b.id);
      const [startSide, endSide] = sidesFor(aRect, bRect);
      return {
        relationship,
        a,
        b,
        aRect,
        bRect,
        startY,
        endY,
        startSide,
        endSide,
        startFieldId: pairs[0].startFieldId,
        endFieldId: pairs[0].endFieldId,
      };
    })
    .filter(Boolean);

  // Each line still terminates on its exact field row. A small port spread
  // separates lines that share that row without moving them to another field.
  const portGroups = new Map();
  for (const seed of seeds)
    for (const end of ["start", "end"]) {
      const table = end === "start" ? seed.a : seed.b;
      const key = `${table.id}:${seed[`${end}FieldId`]}:${seed[`${end}Side`]}`;
      if (!portGroups.has(key)) portGroups.set(key, []);
      portGroups.get(key).push({ seed, end });
    }
  for (const group of portGroups.values()) {
    group.sort(
      (a, b) =>
        (a.end === "start" ? a.seed.endY : a.seed.startY) -
          (b.end === "start" ? b.seed.endY : b.seed.startY) ||
        String(a.seed.relationship.id).localeCompare(
          String(b.seed.relationship.id),
        ),
    );
    group.forEach(({ seed, end }, index) => {
      const offset =
        group.length === 1
          ? 0
          : (index - (group.length - 1) / 2) *
            Math.min(6, (PORT_SPREAD * 2) / (group.length - 1));
      seed[`${end}Y`] += offset;
      seed[`${end}EscapeDepth`] = 28 + index * 9;
      seed[`${end}PortIndex`] = index;
    });
  }

  const rects = [...rectById.values()];
  const occupied = [];
  const routes = new Map();
  const cardinalityLabels = new Set();
  // Short local links get the clearest tracks; long links route around them.
  seeds.sort(
    (a, b) =>
      Math.abs(a.aRect.left - a.bRect.left) +
        Math.abs(a.startY - a.endY) -
        Math.abs(b.aRect.left - b.bRect.left) -
        Math.abs(b.startY - b.endY) ||
      String(a.relationship.id).localeCompare(String(b.relationship.id)),
  );
  for (const seed of seeds) {
    const startX = portX(seed.aRect, seed.startSide);
    const endX = portX(seed.bRect, seed.endSide);
    const startEscapeX =
      startX + direction(seed.startSide) * seed.startEscapeDepth;
    const endEscapeX = endX + direction(seed.endSide) * seed.endEscapeDepth;
    const candidates = candidateTracks(
      {
        ...seed,
        startX,
        endX,
        startEscapeX,
        endEscapeX,
        manualOffset: Number(seed.relationship.routeOffset) || 0,
      },
      rects,
    );
    const best = candidates.reduce((winner, candidate) => {
      const score =
        scorePath(candidate.points, rects, occupied) + candidate.preference;
      return !winner || score < winner.score ? { ...candidate, score } : winner;
    }, null);
    if (!best) continue;
    const points = best.points;
    const route = {
      path: pathFromPoints(points),
      points,
      start: { x: points[0][0], y: points[0][1] },
      end: { x: points.at(-1)[0], y: points.at(-1)[1] },
      startCardinality: { x: points[1][0], y: points[1][1] },
      endCardinality: { x: points.at(-2)[0], y: points.at(-2)[1] },
      labelPoint: {
        x: points[Math.floor(points.length / 2)][0],
        y: points[Math.floor(points.length / 2)][1],
      },
    };
    const rel = seed.relationship;
    const many = rel.manyLabel || "n";
    const startMaximum =
      rel.cardinality === "one_to_many" || rel.cardinality === "one_to_one"
        ? "1"
        : many;
    const endMaximum = rel.cardinality === "one_to_many" ? many : "1";
    const startLabel = `${rel.startMinCardinality ?? 0}:${startMaximum}`;
    const endLabel = `${rel.endMinCardinality ?? 0}:${endMaximum}`;
    const startKey = `${seed.a.id}:${seed.startFieldId}:${seed.startSide}:${startLabel}`;
    const endKey = `${seed.b.id}:${seed.endFieldId}:${seed.endSide}:${endLabel}`;
    route.showStartCardinality = !cardinalityLabels.has(startKey);
    route.showEndCardinality = !cardinalityLabels.has(endKey);
    cardinalityLabels.add(startKey);
    cardinalityLabels.add(endKey);
    routes.set(seed.relationship.id, route);
    occupied.push(...segments(points));
  }
  return routes;
}
