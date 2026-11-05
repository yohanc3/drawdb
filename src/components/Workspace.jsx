import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  createContext,
  useContext,
} from "react";
import { v4 as uuidv4 } from "uuid";
import ControlPanel from "./EditorHeader/ControlPanel";
import ExtensionsContext, { Slot } from "../context/ExtensionsContext";
import Canvas from "./EditorCanvas/Canvas";
import { CanvasContextProvider } from "../context/CanvasContext";
import SidePanel from "./EditorSidePanel/SidePanel";
import { DB, State } from "../data/constants";
import { db } from "../data/db";
import {
  useLayout,
  useSettings,
  useTransform,
  useDiagram,
  useUndoRedo,
  useAreas,
  useNotes,
  useTypes,
  useSaveState,
  useEnums,
  useViews,
  useNavigateWithParams,
  useCollab,
} from "../hooks";
import FloatingControls from "./FloatingControls";
import StartModal from "./StartModal";
import { Button, Modal } from "@douyinfe/semi-ui";
import { IconAlertTriangle } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { databases } from "../data/databases";
import { isRtl } from "../i18n/utils/rtl";
import { useMatch, useParams, useSearchParams } from "react-router-dom";
import { get, SHARE_FILENAME } from "../api/gists";
import { mergeCustomTypes } from "../utils/customTypes";
import {
  readDismissedBanners,
  addDismissedBanner,
} from "../utils/dismissedBanners";
import { mergeDiagram } from "../utils/mergeDiagram";
import { cloudSave as saveSharedDiagram } from "../api/cloud";

export const IdContext = createContext({
  gistId: "",
  setGistId: () => {},
  version: "",
  setVersion: () => {},
});

const SIDEPANEL_MIN_WIDTH = 374;

function diagramContent(diagram) {
  return {
    database: diagram.database || DB.GENERIC,
    name: diagram.name || "Untitled diagram",
    gistId: diagram.gistId || "",
    tables: diagram.tables || [],
    references: diagram.references || [],
    notes: diagram.notes || [],
    areas: diagram.areas || [],
    views: diagram.views || [],
    sqlHeader: diagram.sqlHeader || "",
    pan: diagram.pan || { x: 0, y: 0 },
    zoom: diagram.zoom ?? 1,
    enums: diagram.enums || [],
    types: diagram.types || [],
  };
}

const contentFingerprint = (diagram) => JSON.stringify(diagramContent(diagram));

export default function WorkSpace({ forcedDiagramId } = {}) {
  const [gistId, setGistId] = useState("");
  const [version, setVersion] = useState("");
  const [loadedFromGistId, setLoadedFromGistId] = useState("");
  const [title, setTitle] = useState("Untitled Diagram");
  const [resize, setResize] = useState(false);
  const [toolbarContainer, setToolbarContainer] = useState(null);
  const [width, setWidth] = useState(SIDEPANEL_MIN_WIDTH);
  const [lastSaved, setLastSaved] = useState("");
  const [showSelectDbModal, setShowSelectDbModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedDb, setSelectedDb] = useState("");
  const [startWith, setStartWith] = useState(null);

  const [diagramSource, setDiagramSource] = useState(null);
  const [canManageDiagram, setCanManageDiagram] = useState(true);
  const [dismissedBanners, setDismissedBanners] =
    useState(readDismissedBanners);
  const pendingNewIdRef = useRef(null);
  const loadedIdRef = useRef(null);
  const lastLoadKeyRef = useRef("");
  const remoteApplyRef = useRef(false);
  const lastRevisionRef = useRef(0);
  const lastContentRef = useRef(null);
  const lastServerDataRef = useRef(null);
  const latestContentRef = useRef(null);
  const { setRoom, snapshot, people, connected } = useCollab();
  const { layout, setLayout } = useLayout();
  const { settings } = useSettings();
  const { types, setTypes } = useTypes();
  const { areas, setAreas } = useAreas();
  const { notes, setNotes } = useNotes();
  const { saveState, setSaveState } = useSaveState();
  const { transform, setTransform } = useTransform();
  const { enums, setEnums } = useEnums();
  const { views, setViews } = useViews();
  const {
    tables,
    relationships,
    setTables,
    setRelationships,
    database,
    setDatabase,
    sqlHeader,
    setSqlHeader,
  } = useDiagram();
  const { undoStack, redoStack, setUndoStack, setRedoStack } = useUndoRedo();
  const { t, i18n } = useTranslation();
  let [searchParams, setSearchParams] = useSearchParams();
  const { id: routeDiagramId } = useParams();
  const loadedDiagramId = forcedDiagramId ?? routeDiagramId;
  const editorDiagramMatch = useMatch("/editor/diagrams/:id");
  const isDiagram = Boolean(forcedDiagramId || editorDiagramMatch);
  const isTemplate = Boolean(useMatch("/editor/templates/:id"));

  const navigate = useNavigateWithParams();
  const extensionValues = useContext(ExtensionsContext);
  const extensions = useMemo(() => extensionValues ?? {}, [extensionValues]);
  const sharedLink = Boolean(searchParams.get("share"));
  const cloudSave = extensions.cloudSave || (sharedLink ? saveSharedDiagram : null);
  const cloudOnly = typeof cloudSave === "function";
  const cloudUserId = extensions.cloudCurrentUserId || "anonymous";
  const cloudLoad = extensions.cloudLoad;

  const handleResize = (e) => {
    if (!resize) return;
    const w = isRtl(i18n.language) ? window.innerWidth - e.clientX : e.clientX;
    if (w > SIDEPANEL_MIN_WIDTH) setWidth(w);
  };

  const buildCloudPayload = useCallback(
    (targetId) => ({
      diagramId: targetId,
      database,
      name: title,
      gistId: gistId ?? "",
      lastModified: new Date(),
      expectedRevision: lastRevisionRef.current,
      tables,
      references: relationships,
      notes,
      areas,
      views,
      sqlHeader,
      pan: diagramSource === "cloud" ? (lastServerDataRef.current?.pan ?? transform.pan) : transform.pan,
      zoom: diagramSource === "cloud" ? (lastServerDataRef.current?.zoom ?? transform.zoom) : transform.zoom,
      ...(databases[database].hasEnums && { enums }),
      ...(databases[database].hasTypes && { types }),
    }),
    [
      database,
      title,
      gistId,
      tables,
      relationships,
      notes,
      areas,
      views,
      sqlHeader,
      transform,
      enums,
      types,
      diagramSource,
    ],
  );

  latestContentRef.current = diagramContent(buildCloudPayload(loadedDiagramId));

  const applyRemoteContent = useCallback((incoming, revision, baseOverride = null) => {
    const remote = diagramContent(incoming);
    const local = latestContentRef.current;
    const base = baseOverride || lastServerDataRef.current;
    const merged = base ? mergeDiagram(base, remote, local) : remote;
    const pending = contentFingerprint(merged) !== contentFingerprint(remote);
    lastRevisionRef.current = revision;
    lastServerDataRef.current = remote;
    lastContentRef.current = contentFingerprint(remote);
    if (contentFingerprint(local) !== contentFingerprint(merged)) {
      remoteApplyRef.current = true;
      setDatabase(merged.database);
      setGistId(merged.gistId);
      setTitle(merged.name);
      setTables(merged.tables);
      setRelationships(merged.references);
      setAreas(merged.areas);
      setNotes(merged.notes);
      setTypes(merged.types);
      setEnums(merged.enums);
      setViews(merged.views);
      setSqlHeader(merged.sqlHeader);
      setTimeout(() => {
        remoteApplyRef.current = false;
        setSaveState(pending ? State.SAVING : State.SAVED);
      }, 0);
    } else {
      setSaveState(pending ? State.SAVING : State.SAVED);
    }
  }, [setDatabase, setTables, setRelationships, setAreas, setNotes, setTypes, setEnums, setViews, setSqlHeader, setSaveState]);

  const save = useCallback(async () => {
    if (searchParams.has("shareId")) {
      searchParams.delete("shareId");
      setSearchParams(searchParams, { replace: true });
    }

    if (cloudOnly) {
      const isNew =
        diagramSource === "local" || !loadedDiagramId || loadedDiagramId === "blank" || isTemplate;
      const targetId = isNew
        ? (pendingNewIdRef.current ??= uuidv4())
        : loadedDiagramId;
      const payload = buildCloudPayload(targetId);
      const fingerprint = contentFingerprint(payload);
      if (!isNew && fingerprint === lastContentRef.current) {
        setSaveState(State.SAVED);
        return;
      }
      try {
        const result = await cloudSave(payload, { isNew, collaborator: !canManageDiagram });
        if (isNew) {
          lastRevisionRef.current = result.revision || 1;
          lastServerDataRef.current = diagramContent(payload);
          lastContentRef.current = fingerprint;
          if (diagramSource === "local" && loadedDiagramId) {
            await db.diagrams.where("diagramId").equals(loadedDiagramId).delete();
          }
          pendingNewIdRef.current = null;
          setDiagramSource("cloud");
          navigate(`/editor/diagrams/${targetId}`, { replace: true, clearSearch: true });
          setSaveState(State.SAVED);
        } else if (result.data) {
          applyRemoteContent(result.data, result.revision, diagramContent(payload));
        } else {
          lastRevisionRef.current = result.revision || lastRevisionRef.current;
          lastServerDataRef.current = diagramContent(payload);
          lastContentRef.current = fingerprint;
          setSaveState(State.SAVED);
        }
        setLastSaved(new Date().toLocaleString());
      } catch (err) {
        console.warn("cloud autosave failed:", err);
        if (err?.status === 409) {
          setSaveState(State.ERROR);
          return;
        }
        if (err?.response?.status === 402) {
          setSaveState(State.NONE);
          navigate("/checkout?tier=solo_pro");
          return;
        }
        setSaveState(State.ERROR);
      }
      return;
    }

    if (isTemplate || (!loadedDiagramId && !isTemplate && !isDiagram)) {
      const diagramId = uuidv4();
      await db.diagrams
        .add({
          diagramId,
          database: database,
          name: title,
          gistId: gistId ?? "",
          lastModified: new Date(),
          tables: tables,
          references: relationships,
          notes: notes,
          areas: areas,
          views: views,
          sqlHeader: sqlHeader,
          pan: transform.pan,
          zoom: transform.zoom,
          loadedFromGistId: loadedFromGistId,
          ...(databases[database].hasEnums && { enums: enums }),
          ...(databases[database].hasTypes && { types: types }),
        })
        .then(() => {
          navigate(`/editor/diagrams/${diagramId}`, { replace: true });
          setSaveState(State.SAVED);
          setLastSaved(new Date().toLocaleString());
        });
    } else {
      await db.diagrams
        .where("diagramId")
        .equals(loadedDiagramId)
        .modify({
          database: database,
          name: title,
          lastModified: new Date(),
          tables: tables,
          references: relationships,
          notes: notes,
          areas: areas,
          views: views,
          sqlHeader: sqlHeader,
          gistId: gistId ?? "",
          pan: transform.pan,
          zoom: transform.zoom,
          loadedFromGistId: loadedFromGistId,
          ...(databases[database].hasEnums && { enums: enums }),
          ...(databases[database].hasTypes && { types: types }),
        })
        .then(() => {
          setSaveState(State.SAVED);
          setLastSaved(new Date().toLocaleString());
        });
    }
  }, [
    cloudOnly,
    cloudSave,
    canManageDiagram,
    diagramSource,
    buildCloudPayload,
    applyRemoteContent,
    searchParams,
    setSearchParams,
    tables,
    relationships,
    notes,
    areas,
    views,
    sqlHeader,
    types,
    title,
    transform,
    setSaveState,
    setLastSaved,
    database,
    enums,
    gistId,
    loadedFromGistId,
    isDiagram,
    isTemplate,
    loadedDiagramId,
    navigate,
  ]);

  const moveToCloud = useCallback(async () => {
    if (typeof extensions.cloudSave !== "function" || !loadedDiagramId) return;
    setSaveState(State.SAVING);
    const cloudId = uuidv4();
    try {
      await extensions.cloudSave(buildCloudPayload(cloudId), { isNew: true });
      await db.diagrams.where("diagramId").equals(loadedDiagramId).delete();
      setSaveState(State.SAVED);
      setLastSaved(new Date().toLocaleString());
      navigate(`/editor/diagrams/${cloudId}`, { replace: true });
    } catch (err) {
      console.warn("move to cloud failed:", err);
      setSaveState(State.ERROR);
    }
  }, [
    extensions,
    loadedDiagramId,
    buildCloudPayload,
    setSaveState,
    setLastSaved,
    navigate,
  ]);

  const dismissMoveToCloud = () => {
    if (!loadedDiagramId) return;
    setDismissedBanners((prev) =>
      addDismissedBanner(prev, `move:${loadedDiagramId}`),
    );
  };

  const load = useCallback(async () => {
    const previousLoadedId = loadedIdRef.current;
    loadedIdRef.current = loadedDiagramId ?? null;

    const fetchDiagram = async (id) => {
      const share = searchParams.get("share");
      if (share && typeof cloudLoad === "function") {
        const shared = await cloudLoad(id, { share });
        if (shared) return { diagram: shared, source: "cloud" };
      }
      const localDiagram = await db.diagrams
        .where("diagramId")
        .equals(id)
        .first();
      if (localDiagram) return { diagram: localDiagram, source: "local" };

      if (typeof cloudLoad === "function") {
        const cloudDiagram = await cloudLoad(id);
        if (cloudDiagram) return { diagram: cloudDiagram, source: "cloud" };
      }
      return { diagram: null, source: null };
    };

    const applyDiagramState = (diagram) => {
      remoteApplyRef.current = true;
      lastRevisionRef.current = diagram.revision || 0;
      lastContentRef.current = contentFingerprint(diagram);
      lastServerDataRef.current = diagram.revision ? diagramContent(diagram) : null;
      setDatabase(diagram.database || DB.GENERIC);
      setGistId(diagram.gistId);
      setLoadedFromGistId(diagram.loadedFromGistId);
      setTitle(diagram.name);
      setTables(diagram.tables);
      setRelationships(diagram.references);
      setAreas(diagram.areas);
      setNotes(diagram.notes);
      setTransform({ pan: diagram.pan, zoom: diagram.zoom });
      setTypes(diagram.types ?? []);
      setEnums(diagram.enums ?? []);
      setViews(diagram.views ?? []);
      setSqlHeader(diagram.sqlHeader ?? "");
      setTimeout(() => { remoteApplyRef.current = false; }, 0);
    };

    const resetEditorState = () => {
      lastContentRef.current = null;
      lastServerDataRef.current = null;
      lastRevisionRef.current = 0;
      setCanManageDiagram(true);
      setTables([]);
      setRelationships([]);
      setAreas([]);
      setNotes([]);
      setTypes([]);
      setEnums([]);
      setViews([]);
      setSqlHeader("");
      setUndoStack([]);
      setRedoStack([]);
      setTransform({ zoom: 1, pan: { x: 0, y: 0 } });
      setTitle("Untitled diagram");
      setGistId("");
      setLoadedFromGistId("");
      setLayout((prev) => ({ ...prev, readOnly: false }));
      setDiagramSource(null);
    };

    const loadLatestDiagram = async () => {
      let diagram;
      try {
        diagram = await db.diagrams.orderBy("lastModified").last();
      } catch (error) {
        console.log(error);
        return;
      }
      if (!diagram) {
        return;
      }
      setDiagramSource("local");
      applyDiagramState(diagram);
      navigate(`/editor/diagrams/${diagram.diagramId}`, { replace: true });
    };

    const loadDiagram = async (id) => {
      const { diagram, source } = await fetchDiagram(id);
      if (!diagram) return;

      setDiagramSource(source);
      if (source === "local") {
        setCanManageDiagram(true);
        setLayout((prev) => ({ ...prev, readOnly: false }));
      } else if (typeof diagram.canEdit === "boolean") {
        setCanManageDiagram(Boolean(diagram.canWrite));
        setLayout((prev) => ({ ...prev, readOnly: !diagram.canEdit }));
      }
      applyDiagramState(diagram);
      setUndoStack([]);
      setRedoStack([]);
    };

    const loadTemplate = async (id) => {
      const template = await db.templates
        .where("templateId")
        .equals(id)
        .first();
      if (!template) {
        if (previousLoadedId !== loadedIdRef.current) resetEditorState();
        if (selectedDb === "") setShowSelectDbModal(true);
        return;
      }
      setDiagramSource(null);
      setDatabase(template.database || DB.GENERIC);
      setTitle(template.title);
      setTables(template.tables);
      setRelationships(template.relationships);
      setAreas(template.subjectAreas);
      setNotes(template.notes);
      setTransform({ zoom: 1, pan: { x: 0, y: 0 } });
      setUndoStack([]);
      setRedoStack([]);
      setTypes(template.types ?? []);
      setEnums(template.enums ?? []);
      setViews(template.views ?? []);
      setSqlHeader(template.sqlHeader ?? "");
    };

    const loadFromGist = async (shareId, diagramId = null) => {
      try {
        const { data } = await get(shareId);
        const parsed = JSON.parse(data.files[SHARE_FILENAME].content);
        setDiagramSource(null);
        setUndoStack([]);
        setRedoStack([]);
        setGistId(shareId);
        setLoadedFromGistId(shareId);
        setDatabase(parsed.database);
        setTitle(parsed.title);
        setTables(parsed.tables);
        setRelationships(parsed.relationships);
        setNotes(parsed.notes);
        setAreas(parsed.subjectAreas);
        setTransform(parsed.transform);
        setTypes(parsed.types ?? []);
        setEnums(parsed.enums ?? []);
        setViews(parsed.views ?? []);
        setSqlHeader(parsed.sqlHeader ?? "");
        if (parsed.customTypes) mergeCustomTypes(parsed.customTypes);
        if (diagramId) {
          navigate(`/editor/diagrams/${diagramId}`, { replace: true });
        }
      } catch (e) {
        console.log(e);
        setSaveState(State.FAILED_TO_LOAD);
      }
    };

    const shareId = searchParams.get("shareId");
    if (shareId) {
      const existingDiagram = await db.diagrams.get({
        loadedFromGistId: shareId,
      });
      await loadFromGist(shareId, existingDiagram?.diagramId || null);
      return;
    }

    if (!loadedDiagramId) {
      if (cloudOnly) {
        if (previousLoadedId != null) resetEditorState();
        return;
      }
      await loadLatestDiagram();
      return;
    }

    if (isDiagram && loadedDiagramId) {
      await loadDiagram(loadedDiagramId);
      return;
    }

    if (isTemplate && loadedDiagramId) {
      await loadTemplate(loadedDiagramId);
      return;
    }
  }, [
    cloudLoad,
    setTransform,
    setRedoStack,
    setUndoStack,
    setRelationships,
    setTables,
    setAreas,
    setNotes,
    setTypes,
    setDatabase,
    setEnums,
    setViews,
    setSqlHeader,
    selectedDb,
    setSaveState,
    setLayout,
    searchParams,
    navigate,
    isDiagram,
    isTemplate,
    loadedDiagramId,
    cloudOnly,
  ]);

  useEffect(() => {
    if (diagramSource === "cloud" && loadedDiagramId) {
      setRoom({ id: loadedDiagramId, share: searchParams.get("share") || "", identity: cloudUserId });
    } else {
      setRoom(null);
    }
  }, [diagramSource, loadedDiagramId, searchParams, cloudUserId, setRoom]);

  useEffect(() => {
    if (!snapshot || snapshot.id !== loadedDiagramId || diagramSource !== "cloud") return;
    if ((snapshot.revision || 0) < lastRevisionRef.current) return;
    if ((snapshot.revision || 0) === lastRevisionRef.current &&
        contentFingerprint(snapshot.data) === contentFingerprint(lastServerDataRef.current || {})) return;
    applyRemoteContent(snapshot.data, snapshot.revision || 0);
  }, [snapshot, loadedDiagramId, diagramSource, applyRemoteContent]);

  const returnToCurrentDiagram = async () => {
    await load();
    setLayout((prev) => ({ ...prev, readOnly: false }));
    setVersion(null);
  };

  useEffect(() => {
    if (remoteApplyRef.current) return;
    if (
      tables?.length === 0 &&
      areas?.length === 0 &&
      notes?.length === 0 &&
      views?.length === 0 &&
      types?.length === 0 &&
      enums?.length === 0 &&
      undoStack.length === 0 &&
      redoStack.length === 0
    )
      return;

    if (settings.autosave) {
      setSaveState(State.SAVING);
    }
  }, [
    undoStack,
    redoStack,
    settings.autosave,
    tables,
    areas,
    notes,
    views,
    types,
    enums,
    relationships,
    database,
    title,
    gistId,
    sqlHeader,
    setSaveState,
  ]);

  useEffect(() => {
    if (!settings.autosave || tables.length === 0) return;

    const timer = setTimeout(() => setSaveState(State.SAVING), 500);
    return () => clearTimeout(timer);
  }, [transform.zoom, settings.autosave, tables.length, setSaveState]);

  useEffect(() => {
    if (remoteApplyRef.current) return;
    if (layout.readOnly) return;

    if (saveState !== State.SAVING) return;

    const timer = setTimeout(save, 200);
    return () => clearTimeout(timer);
  }, [saveState, layout, save]);

  useEffect(() => {
    document.title = "Editor | drawDB";
    const key = `${window.location.pathname}${window.location.search}|${cloudOnly}|${cloudUserId}`;
    if (lastLoadKeyRef.current === key) return;
    lastLoadKeyRef.current = key;
    load();
  }, [load, cloudOnly, cloudUserId]);

  return (
    <div className="h-full flex flex-col overflow-hidden theme">
      <IdContext.Provider value={{ gistId, setGistId, version, setVersion }}>
        <ControlPanel
          title={title}
          setTitle={setTitle}
          lastSaved={lastSaved}
          setLastSaved={setLastSaved}
          toolbarContainer={toolbarContainer}
          startWith={startWith}
          setStartWith={setStartWith}
          onBackToStart={() => setShowSelectDbModal(true)}
          diagramSource={diagramSource}
          canManageDiagram={canManageDiagram}
          people={people}
          connected={connected}
        />
      </IdContext.Provider>
      <div
        className="flex h-full overflow-y-auto"
        onPointerUp={(e) => e.isPrimary && setResize(false)}
        onPointerLeave={(e) => e.isPrimary && setResize(false)}
        onPointerMove={(e) => e.isPrimary && handleResize(e)}
        onPointerDown={(e) => {
          // Required for onPointerLeave to trigger when a touch pointer leaves
          // https://stackoverflow.com/a/70976017/1137077
          e.target.releasePointerCapture(e.pointerId);
        }}
        style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
      >
        {layout.sidebar && (
          <SidePanel resize={resize} setResize={setResize} width={width} />
        )}
        <div className="relative flex-1 min-w-0 h-full overflow-hidden">
          <CanvasContextProvider className="h-full w-full">
            <Canvas saveState={saveState} setSaveState={setSaveState} />
          </CanvasContextProvider>
          <Slot name="canvas-overlay" />
          {layout.toolbar && (
            <div
              ref={setToolbarContainer}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
            />
          )}
          {version && (
            <div className="absolute right-8 top-2 space-x-2">
              <Button
                icon={<i className="fa-solid fa-rotate-right mt-0.5"></i>}
                onClick={() => setShowRestoreModal(true)}
              >
                {t("restore_version")}
              </Button>
              <Button
                type="tertiary"
                onClick={returnToCurrentDiagram}
                icon={<i className="bi bi-arrow-return-right mt-1"></i>}
              >
                {t("return_to_current")}
              </Button>
            </div>
          )}
          {(cloudOnly || typeof extensions.moveToCloudUpgrade === "function") &&
            diagramSource === "local" &&
            !version &&
            !dismissedBanners.has(`move:${loadedDiagramId}`) && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
                <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-blue-300 bg-blue-50 px-5 py-1.5 shadow-md dark:border-sky-900/50 dark:bg-sky-900/30">
                  <i className="bi bi-hdd" />
                  <span className="text-sm">{t("move_to_cloud_prompt")}</span>
                  <Button
                    size="small"
                    theme="solid"
                    onClick={
                      cloudOnly ? moveToCloud : extensions.moveToCloudUpgrade
                    }
                  >
                    {t("move")}
                  </Button>
                  <Button
                    size="small"
                    theme="borderless"
                    type="tertiary"
                    aria-label={t("dismiss")}
                    icon={<i className="bi bi-x-lg" />}
                    onClick={dismissMoveToCloud}
                  />
                </div>
              </div>
            )}
          {!(layout.sidebar || layout.toolbar || layout.header) && (
            <div className="fixed right-5 bottom-4">
              <FloatingControls />
            </div>
          )}
        </div>
        <Slot name="right-panel" />
      </div>
      <StartModal
        visible={showSelectDbModal}
        onStart={(database, option) => {
          setSelectedDb(database);
          setDatabase(database);
          setShowSelectDbModal(false);
          if (option.modal) setStartWith(option);
        }}
        onTemplate={(templateId) => {
          setShowSelectDbModal(false);
          navigate(`/editor/templates/${templateId}`, { replace: true });
        }}
      />
      <Modal
        visible={showRestoreModal}
        centered
        closable
        onCancel={() => setShowRestoreModal(false)}
        title={
          <span className="flex items-center gap-2">
            <IconAlertTriangle className="text-amber-400" size="extra-large" />{" "}
            {t("restore_version")}
          </span>
        }
        okText={t("continue")}
        cancelText={t("cancel")}
        onOk={() => {
          setLayout((prev) => ({ ...prev, readOnly: false }));
          setShowRestoreModal(false);
          setVersion(null);
        }}
      >
        {t("restore_warning")}
      </Modal>
    </div>
  );
}
