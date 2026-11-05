export function cardinalityMinimum(value) {
  return value === 1 || value === "1" ? 1 : 0;
}

export function formatCardinalityRange(minimum, maximum) {
  return `[${cardinalityMinimum(minimum)}, ${maximum}]`;
}
