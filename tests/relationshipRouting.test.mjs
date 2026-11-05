import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const model = JSON.parse(
  await readFile(new URL("./fixtures/bmart.json", import.meta.url)),
);
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { buildRelationshipRouting } = await vite.ssrLoadModule(
    "/src/utils/relationshipRouting.js",
  );
  const { autoArrange } = await vite.ssrLoadModule("/src/utils/autoArrange.js");
  const {
    getRelatedFieldKeysByTable,
    getVisibleFieldEntries,
    getFieldOffsetY,
    getTableWidth,
    getTableHeight,
  } = await vite.ssrLoadModule("/src/utils/utils.js");
  const { tableFieldHeight, tableHeaderHeight } = await vite.ssrLoadModule(
    "/src/data/constants.js",
  );
  const relatedFieldKeysByTable = getRelatedFieldKeysByTable(
    model.relationships,
  );
  const byId = new Map(model.tables.map((table) => [table.id, table]));
  const overlap = (a, b, c, d) =>
    Math.max(
      0,
      Math.min(Math.max(a, b), Math.max(c, d)) -
        Math.max(Math.min(a, b), Math.min(c, d)),
    );
  const segments = (route) =>
    route.points
      .slice(1)
      .map(([x2, y2], index) => {
        const [x1, y1] = route.points[index];
        return { x1, y1, x2, y2, horizontal: y1 === y2 };
      })
      .filter(
        (segment) => segment.x1 !== segment.x2 || segment.y1 !== segment.y2,
      );

  function checkRoutes(tables, description) {
    const routes = buildRelationshipRouting({
      relationships: model.relationships,
      tables,
      relatedFieldKeysByTable,
      showComments: false,
    });
    assert.equal(
      routes.size,
      model.relationships.length,
      `${description}: all relationships routed`,
    );
    const tableMap = new Map(tables.map((table) => [table.id, table]));
    const allSegments = [];
    for (const relationship of model.relationships) {
      const route = routes.get(relationship.id);
      const startTable = tableMap.get(relationship.startTableId);
      const endTable = tableMap.get(relationship.endTableId);
      const target = endTable.fields.find(
        (field) => field.id === relationship.endFieldId,
      );
      assert.ok(
        target?.primary || target?.unique,
        `${description}: ${endTable.name}.${target?.name} is a referenced key`,
      );
      for (const [table, fieldId, point] of [
        [startTable, relationship.startFieldId, route.start],
        [endTable, relationship.endFieldId, route.end],
      ]) {
        const entries = getVisibleFieldEntries(
          table,
          relatedFieldKeysByTable.get(table.id),
        );
        const index = entries.findIndex(({ field }) => field.id === fieldId);
        assert.ok(index >= 0, `${description}: ${table.name} field exists`);
        const rowY =
          table.y +
          tableHeaderHeight +
          getFieldOffsetY(
            entries.map(({ field }) => field),
            index,
            getTableWidth(table),
            false,
          ) +
          tableFieldHeight / 2;
        assert.ok(
          Math.abs(point.y - rowY) <= 12.1,
          `${description}: ${table.name}.${entries[index].field.name} meets its own row`,
        );
        assert.ok(
          Math.abs(point.x - table.x) < 0.1 ||
            Math.abs(point.x - table.x - getTableWidth(table)) < 0.1,
          `${description}: ${table.name}.${entries[index].field.name} meets the table border`,
        );
      }
      allSegments.push(
        ...segments(route).map((segment) => ({
          ...segment,
          id: relationship.id,
        })),
      );
    }
    for (const segment of allSegments) {
      for (const table of tables) {
        const left = table.x + 1;
        const right = table.x + getTableWidth(table) - 1;
        const top = table.y + 1;
        const bottom =
          table.y +
          getTableHeight(table, false, relatedFieldKeysByTable.get(table.id)) -
          1;
        const crossing = segment.horizontal
          ? segment.y1 > top &&
            segment.y1 < bottom &&
            overlap(segment.x1, segment.x2, left, right) > 1
          : segment.x1 > left &&
            segment.x1 < right &&
            overlap(segment.y1, segment.y2, top, bottom) > 1;
        assert.equal(
          crossing,
          false,
          `${description}: line ${segment.id} passes through ${table.name}`,
        );
      }
    }
    for (let i = 0; i < allSegments.length; i++)
      for (let j = i + 1; j < allSegments.length; j++) {
        const a = allSegments[i];
        const b = allSegments[j];
        if (a.id === b.id || a.horizontal !== b.horizontal) continue;
        const separation = a.horizontal
          ? Math.abs(a.y1 - b.y1)
          : Math.abs(a.x1 - b.x1);
        const shared = a.horizontal
          ? overlap(a.x1, a.x2, b.x1, b.x2)
          : overlap(a.y1, a.y2, b.y1, b.y2);
        assert.ok(
          separation >= 1 || shared <= 10,
          `${description}: lines ${a.id} and ${b.id} overlap by ${shared}px`,
        );
      }
    return routes;
  }

  checkRoutes(model.tables, "saved B-Mart layout");
  const positions = autoArrange(model.tables, model.relationships, {
    showComments: false,
  });
  const positionById = new Map(
    positions.map((position) => [position.id, position]),
  );
  const arranged = model.tables.map((table) => ({
    ...table,
    ...positionById.get(table.id),
  }));
  checkRoutes(arranged, "auto-arranged B-Mart layout");
  for (let i = 0; i < arranged.length; i++)
    for (let j = i + 1; j < arranged.length; j++) {
      const a = arranged[i];
      const b = arranged[j];
      assert.ok(
        overlap(a.x, a.x + getTableWidth(a), b.x, b.x + getTableWidth(b)) ===
          0 ||
          overlap(
            a.y,
            a.y + getTableHeight(a, false, relatedFieldKeysByTable.get(a.id)),
            b.y,
            b.y + getTableHeight(b, false, relatedFieldKeysByTable.get(b.id)),
          ) === 0,
        `auto-arrange: ${a.name} and ${b.name} do not collide`,
      );
    }
  const sample = model.relationships.find(
    (relationship) =>
      byId.get(relationship.startTableId)?.name === "store_hours",
  );
  const base = buildRelationshipRouting({
    relationships: [sample],
    tables: model.tables,
    relatedFieldKeysByTable,
    showComments: false,
  }).get(sample.id);
  const shifted = buildRelationshipRouting({
    relationships: [{ ...sample, routeOffset: 36 }],
    tables: model.tables,
    relatedFieldKeysByTable,
    showComments: false,
  }).get(sample.id);
  assert.notEqual(
    base.path,
    shifted.path,
    "track offset changes the rendered path",
  );
  console.log(
    `B-Mart routing passed: ${model.tables.length} tables, ${model.relationships.length} exact field links, no table or line overlap.`,
  );
} finally {
  await vite.close();
}
