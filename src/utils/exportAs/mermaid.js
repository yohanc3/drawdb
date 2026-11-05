import { Cardinality } from "../../data/constants";
import { dbToTypes } from "../../data/datatypes";
import i18n from "../../i18n/i18n";
import { cardinalityMinimum } from "../cardinalityRange";

export function jsonToMermaid(obj) {
  function getMermaidRelationship(relationship) {
    let startMany = false;
    let endMany = false;
    switch (relationship.cardinality) {
      case i18n.t(Cardinality.ONE_TO_ONE):
      case Cardinality.ONE_TO_ONE:
        break;
      case i18n.t(Cardinality.MANY_TO_ONE):
      case Cardinality.MANY_TO_ONE:
        startMany = true;
        break;
      case i18n.t(Cardinality.ONE_TO_MANY):
      case Cardinality.ONE_TO_MANY:
        endMany = true;
        break;
      default:
        return "--";
    }
    const startMin = cardinalityMinimum(relationship.startMinCardinality);
    const endMin = cardinalityMinimum(relationship.endMinCardinality);
    const start = startMany ? (startMin ? "}|" : "}o") : (startMin ? "||" : "|o");
    const end = endMany ? (endMin ? "|{" : "o{") : (endMin ? "||" : "o|");
    return `${start}--${end}`;
  }

  const mermaidEntities = obj.tables
    .map((table) => {
      const fields = table.fields
        .map((field) => {
          const fieldType =
            field.type +
            ((dbToTypes[obj.database][field.type].isSized ||
              dbToTypes[obj.database][field.type].hasPrecision) &&
            field.size &&
            field.size !== ""
              ? "(" + field.size + ")"
              : "");
          return `\t\t${fieldType} ${field.name}`;
        })
        .join("\n");
      return `\t${table.name} {\n${fields}\n\t}`;
    })
    .join("\n\n");

  const mermaidRelationships = obj.relationships?.length
    ? obj.relationships
        .map((r) => {
          const startTable = obj.tables.find(
            (t) => t.id === r.startTableId,
          ).name;
          const endTable = obj.tables.find((t) => t.id === r.endTableId).name;
          return `\t${startTable} ${getMermaidRelationship(r)} ${endTable} : references`;
        })
        .join("\n")
    : "";

  return `erDiagram\n${mermaidRelationships ? `${mermaidRelationships}\n\n` : ""}${mermaidEntities}`;
}
