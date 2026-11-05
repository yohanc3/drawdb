import { useMemo, useState } from "react";
import { useSelect, useDiagram } from "../../../hooks";
import { AutoComplete } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { ObjectType } from "../../../data/constants";
import { useTranslation } from "react-i18next";
import { relationshipReference } from "../../../utils/relationshipReference";

export default function SearchBar() {
  const { relationships, tables } = useDiagram();
  const [searchText, setSearchText] = useState("");
  const { setSelectedElement } = useSelect();
  const { t } = useTranslation();

  const tablesById = useMemo(
    () => new Map(tables.map((table) => [table.id, table])),
    [tables],
  );
  const names = useMemo(
    () =>
      relationships.map((relationship) => ({
        id: relationship.id,
        label:
          relationship.name?.trim() ||
          relationshipReference(relationship, tablesById),
      })),
    [relationships, tablesById],
  );
  const [filteredResult, setFilteredResult] = useState([]);

  const handleStringSearch = (value) => {
    setFilteredResult(
      names
        .filter(({ label }) =>
          label.toLowerCase().includes(value.toLowerCase()),
        )
        .map(({ label }) => label),
    );
  };

  return (
    <AutoComplete
      data={filteredResult}
      value={searchText}
      showClear
      prefix={<IconSearch />}
      placeholder={t("search")}
      emptyContent={<div className="p-3 popover-theme">{t("not_found")}</div>}
      onSearch={(v) => handleStringSearch(v)}
      onChange={(v) => setSearchText(v)}
      onSelect={(v) => {
        const found = names.find(({ label }) => label === v);
        if (!found) return;
        const { id } = found;
        setSelectedElement((prev) => ({
          ...prev,
          id: id,
          open: true,
          element: ObjectType.RELATIONSHIP,
        }));
        document
          .getElementById(`scroll_ref_${id}`)
          .scrollIntoView({ behavior: "smooth" });
      }}
      className="w-full"
    />
  );
}
