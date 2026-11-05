import { getRelationshipFields } from "./utils";

export function relationshipReference(relationship, tablesById) {
  return getRelationshipFields(relationship)
    .map(({ startFieldId, endFieldId }) => {
      const startTable = tablesById.get(relationship.startTableId);
      const endTable = tablesById.get(relationship.endTableId);
      const startField = startTable?.fields.find(
        (field) => field.id === startFieldId,
      );
      const endField = endTable?.fields.find(
        (field) => field.id === endFieldId,
      );
      return `${startTable?.name ?? "unknown"}.${startField?.name ?? "unknown"} → ${endTable?.name ?? "unknown"}.${endField?.name ?? "unknown"}`;
    })
    .join("; ");
}
