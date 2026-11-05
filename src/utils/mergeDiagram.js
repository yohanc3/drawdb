const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const keyed = (items) => items.every((item) => object(item) && typeof item.id === "string");

// Rebase local edits onto a newer shared diagram without losing unrelated entities.
export function mergeDiagram(base, current, proposed) {
  if (same(base, proposed)) return current;
  if (same(base, current)) return proposed;

  if (Array.isArray(base) && Array.isArray(current) && Array.isArray(proposed) &&
      keyed(base) && keyed(current) && keyed(proposed)) {
    const before = new Map(base.map((item) => [item.id, item]));
    const after = new Map(proposed.map((item) => [item.id, item]));
    const existing = new Set(current.map((item) => item.id));
    const result = current.flatMap((item) => {
      if (before.has(item.id) && !after.has(item.id)) return [];
      if (!after.has(item.id)) return [item];
      return [mergeDiagram(before.get(item.id), item, after.get(item.id))];
    });
    for (const item of proposed) {
      if (!existing.has(item.id)) result.push(item);
    }
    return result;
  }

  if (object(base) && object(current) && object(proposed)) {
    const merged = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(proposed)])) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      const value = mergeDiagram(base[key], current[key], proposed[key]);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }

  return proposed;
}
