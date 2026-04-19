import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, KeyboardEvent, MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  parseLiveSpecDocument,
  type LiveSpecDocument,
  type LiveSpecTrackedItem
} from "@livespec/core/browser";
import type {
  HostToWebviewMessage,
  LiveSpecThemeKind,
  PersistedScrollAnchor,
  PersistedWebviewState
} from "../../src/protocol.js";
import type { WebviewBridge } from "./bridge.js";

const DEFAULT_STATE: PersistedWebviewState = {
  selectedIds: [],
  incompleteOnly: false
};

const arraysEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const resolveSelectionKeys = (
  items: LiveSpecTrackedItem[],
  selectedIds: string[]
): string[] => {
  const remainingItems = [...items];
  const resolvedKeys: string[] = [];

  for (const id of selectedIds) {
    const index = remainingItems.findIndex((item) => item.id === id);

    if (index >= 0) {
      const [item] = remainingItems.splice(index, 1);

      if (item !== undefined) {
        resolvedKeys.push(item.runtimeKey);
      }
    }
  }

  return resolvedKeys;
};

const resolveNearestAnchor = (
  items: LiveSpecTrackedItem[],
  anchor: PersistedScrollAnchor | undefined
): LiveSpecTrackedItem | undefined => {
  if (anchor === undefined || items.length === 0) {
    return undefined;
  }

  if (anchor.runtimeKey !== undefined) {
    const directMatch = items.find((item) => item.runtimeKey === anchor.runtimeKey);

    if (directMatch !== undefined) {
      return directMatch;
    }
  }

  if (anchor.line !== undefined) {
    const anchorLine = anchor.line;

    return items.reduce((nearest, item) => {
      if (nearest === undefined) {
        return item;
      }

      const currentDistance = Math.abs(item.line - anchorLine);
      const nearestDistance = Math.abs(nearest.line - anchorLine);

      return currentDistance < nearestDistance ? item : nearest;
    }, items[0]);
  }

  return undefined;
};

const buildSelectedIdsInSelectionOrder = (
  visibleItems: LiveSpecTrackedItem[],
  selectedKeys: string[]
): string[] => {
  const visibleItemsByKey = new Map(
    visibleItems.map((item) => [item.runtimeKey, item] as const)
  );

  return selectedKeys.flatMap((selectedKey) => {
    const item = visibleItemsByKey.get(selectedKey);

    return item === undefined ? [] : [item.id];
  });
};

export interface LiveSpecAppProps {
  bridge: WebviewBridge;
  fileName: string;
  initialThemeKind: LiveSpecThemeKind;
}

export const LiveSpecApp = ({
  bridge,
  fileName,
  initialThemeKind
}: LiveSpecAppProps) => {
  const initialState = bridge.getState() ?? DEFAULT_STATE;
  const [themeKind, setThemeKind] = useState(initialThemeKind);
  const [documentState, setDocumentState] = useState<{
    version: number;
    parsed: ReturnType<typeof parseLiveSpecDocument>;
  } | null>(null);
  const [incompleteOnly, setIncompleteOnly] = useState(initialState.incompleteOnly);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialState.selectedIds);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectionAnchorKey, setSelectionAnchorKey] = useState<string | null>(null);
  const [scrollAnchor, setScrollAnchor] = useState<PersistedScrollAnchor | undefined>(
    initialState.scrollAnchor
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const restoreKeyRef = useRef<string | null>(null);
  const documentStateRef = useRef<typeof documentState>(documentState);
  const incompleteOnlyRef = useRef(incompleteOnly);
  const selectedKeysRef = useRef(selectedKeys);

  useEffect(() => {
    documentStateRef.current = documentState;
  }, [documentState]);

  useEffect(() => {
    incompleteOnlyRef.current = incompleteOnly;
  }, [incompleteOnly]);

  useEffect(() => {
    selectedKeysRef.current = selectedKeys;
  }, [selectedKeys]);

  useEffect(() => {
    document.body.dataset.themeKind = themeKind;
  }, [themeKind]);

  useEffect(() => {
    bridge.postMessage({ type: "ready" });

    return bridge.onMessage((message: HostToWebviewMessage) => {
      switch (message.type) {
        case "documentUpdated": {
          setDocumentState({
            version: message.version,
            parsed: parseLiveSpecDocument(fileName, message.text)
          });
          return;
        }

        case "themeChanged": {
          setThemeKind(message.themeKind);
          return;
        }

        case "configChanged": {
          return;
        }

        case "toggleIncompleteOnly": {
          setIncompleteOnly((currentValue) => !currentValue);
          return;
        }

        case "requestCopySelectedIds": {
          const visibleItems =
            documentStateRef.current?.parsed.ok === true
              ? documentStateRef.current.parsed.document.trackedItems.filter(
                  (item) => !incompleteOnlyRef.current || !item.completed
                )
              : [];
          const ids = buildSelectedIdsInSelectionOrder(
            visibleItems,
            selectedKeysRef.current
          );

          if (ids.length > 0) {
            bridge.postMessage({ type: "copySelectedIds", ids });
          }

          return;
        }

        case "requestEditSource": {
          const visibleItems =
            documentStateRef.current?.parsed.ok === true
              ? documentStateRef.current.parsed.document.trackedItems.filter(
                  (item) => !incompleteOnlyRef.current || !item.completed
                )
              : [];
          const selectedItem = visibleItems.find((item) =>
            selectedKeysRef.current.includes(item.runtimeKey)
          );

          bridge.postMessage({
            type: "editSource",
            line: selectedItem?.line ?? visibleItems[0]?.line ?? 1
          });
        }
      }
    });
  }, [bridge, fileName]);

  const parsedDocument = documentState?.parsed.ok
    ? documentState.parsed.document
    : documentState?.parsed.document;
  const parseError = documentState?.parsed.ok === false ? documentState.parsed.error : null;
  const trackedItems = parsedDocument?.trackedItems ?? [];
  const visibleTrackedItems = trackedItems.filter(
    (item) => !incompleteOnly || !item.completed
  );

  useEffect(() => {
    const nextSelectedKeys = resolveSelectionKeys(visibleTrackedItems, selectedIds);
    const nextSelectedIds = buildSelectedIdsInSelectionOrder(
      visibleTrackedItems,
      nextSelectedKeys
    );

    setSelectedKeys((currentKeys) =>
      arraysEqual(currentKeys, nextSelectedKeys) ? currentKeys : nextSelectedKeys
    );

    if (!arraysEqual(selectedIds, nextSelectedIds)) {
      setSelectedIds(nextSelectedIds);
      bridge.postMessage({ type: "selectionChanged", ids: nextSelectedIds });
    }

    if (
      selectionAnchorKey !== null &&
      !visibleTrackedItems.some((item) => item.runtimeKey === selectionAnchorKey)
    ) {
      setSelectionAnchorKey(visibleTrackedItems[0]?.runtimeKey ?? null);
    }
  }, [bridge, selectedIds, selectionAnchorKey, visibleTrackedItems]);

  useEffect(() => {
    bridge.setState({
      selectedIds,
      incompleteOnly,
      ...(scrollAnchor === undefined ? {} : { scrollAnchor })
    });
  }, [bridge, incompleteOnly, scrollAnchor, selectedIds]);

  useLayoutEffect(() => {
    if (documentState === null || visibleTrackedItems.length === 0 || scrollAnchor === undefined) {
      return;
    }

    const restoreCandidate = resolveNearestAnchor(visibleTrackedItems, scrollAnchor);

    if (restoreCandidate === undefined) {
      return;
    }

    const restoreKey = `${documentState.version}:${restoreCandidate.runtimeKey}:${restoreCandidate.line}`;

    if (restoreKeyRef.current === restoreKey) {
      return;
    }

    const handle = requestAnimationFrame(() => {
      itemRefs.current.get(restoreCandidate.runtimeKey)?.scrollIntoView({
        block: "start"
      });
      restoreKeyRef.current = restoreKey;
    });

    return () => {
      cancelAnimationFrame(handle);
    };
  }, [documentState, scrollAnchor, visibleTrackedItems]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (container === null) {
      return;
    }

    const updateScrollAnchor = () => {
      const containerRect = container.getBoundingClientRect();
      const firstVisibleItem =
        visibleTrackedItems.find((item) => {
          const element = itemRefs.current.get(item.runtimeKey);

          if (element === undefined) {
            return false;
          }

          const elementRect = element.getBoundingClientRect();

          return elementRect.bottom > containerRect.top + 4;
        }) ?? visibleTrackedItems[visibleTrackedItems.length - 1];

      if (firstVisibleItem !== undefined) {
        setScrollAnchor((currentAnchor) => {
          if (
            currentAnchor?.runtimeKey === firstVisibleItem.runtimeKey &&
            currentAnchor.line === firstVisibleItem.line
          ) {
            return currentAnchor;
          }

          return {
            runtimeKey: firstVisibleItem.runtimeKey,
            line: firstVisibleItem.line
          };
        });
      }
    };

    updateScrollAnchor();
    container.addEventListener("scroll", updateScrollAnchor, { passive: true });

    return () => {
      container.removeEventListener("scroll", updateScrollAnchor);
    };
  }, [visibleTrackedItems]);

  const updateSelection = (nextKeys: string[], nextAnchorKey: string | null) => {
    const orderedIds = buildSelectedIdsInSelectionOrder(visibleTrackedItems, nextKeys);

    setSelectedKeys(nextKeys);
    setSelectedIds(orderedIds);
    setSelectionAnchorKey(nextAnchorKey);
    bridge.postMessage({ type: "selectionChanged", ids: orderedIds });
  };

  const handleTrackedItemSelection = (
    item: LiveSpecTrackedItem,
    options: {
      toggle: boolean;
      range: boolean;
    }
  ) => {
    const visibleKeys = visibleTrackedItems.map((visibleItem) => visibleItem.runtimeKey);
    const itemIndex = visibleKeys.indexOf(item.runtimeKey);

    if (itemIndex < 0) {
      return;
    }

    if (options.range && selectionAnchorKey !== null) {
      const anchorIndex = visibleKeys.indexOf(selectionAnchorKey);
      const safeAnchorIndex = anchorIndex >= 0 ? anchorIndex : itemIndex;
      const startIndex = Math.min(safeAnchorIndex, itemIndex);
      const endIndex = Math.max(safeAnchorIndex, itemIndex);
      const rangeKeys = visibleKeys.slice(startIndex, endIndex + 1);

      updateSelection(
        safeAnchorIndex <= itemIndex ? rangeKeys : [...rangeKeys].reverse(),
        selectionAnchorKey
      );
      return;
    }

    if (options.toggle) {
      const nextKeys = selectedKeys.includes(item.runtimeKey)
        ? selectedKeys.filter((key) => key !== item.runtimeKey)
        : [...selectedKeys, item.runtimeKey];

      updateSelection(nextKeys, item.runtimeKey);
      return;
    }

    updateSelection([item.runtimeKey], item.runtimeKey);
  };

  const handleTrackedItemKeyDown = (
    item: LiveSpecTrackedItem,
    event: KeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key === " ") {
      event.preventDefault();
      handleTrackedItemSelection(item, {
        toggle: true,
        range: false
      });
      return;
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "a"
    ) {
      event.preventDefault();
      updateSelection(
        visibleTrackedItems.map((visibleItem) => visibleItem.runtimeKey),
        visibleTrackedItems[0]?.runtimeKey ?? null
      );
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      updateSelection([], null);
    }
  };

  const handleCopySelectedIds = () => {
    const ids = buildSelectedIdsInSelectionOrder(visibleTrackedItems, selectedKeys);

    if (ids.length > 0) {
      bridge.postMessage({ type: "copySelectedIds", ids });
    }
  };

  const handleEditSource = (line?: number) => {
    const selectedItem = visibleTrackedItems.find((item) =>
      selectedKeys.includes(item.runtimeKey)
    );

    bridge.postMessage({
      type: "editSource",
      line: line ?? selectedItem?.line ?? visibleTrackedItems[0]?.line ?? 1
    });
  };

  const renderTrackedMarkdown = (document: LiveSpecDocument) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        li: ({ node, children, className, ...props }) => {
          const line = node?.position?.start?.line;
          const item = document.trackedItems.find(
            (trackedItem) => trackedItem.sourceRange.startLine === line
          );

          if (item === undefined) {
            return (
              <li className={className} {...props}>
                {children}
              </li>
            );
          }

          if (incompleteOnly && item.completed) {
            return null;
          }

          const isSelected = selectedKeys.includes(item.runtimeKey);

          return (
            <li className={`${className ?? ""} livespec-tracked-list-item`} {...props}>
              <div
                ref={(element) => {
                  if (element === null) {
                    itemRefs.current.delete(item.runtimeKey);
                  } else {
                    itemRefs.current.set(item.runtimeKey, element);
                  }
                }}
                className={`livespec-tracked-item${isSelected ? " is-selected" : ""}${
                  item.completed ? " is-complete" : ""
                }`}
                data-runtime-key={item.runtimeKey}
                data-source-line={item.line}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                onClick={(event: MouseEvent<HTMLDivElement>) => {
                  handleTrackedItemSelection(item, {
                    toggle: event.metaKey || event.ctrlKey,
                    range: event.shiftKey
                  });
                }}
                onKeyDown={(event) => {
                  handleTrackedItemKeyDown(item, event);
                }}
              >
                {/* Body first so text flows naturally */}
                <div className="livespec-tracked-item-body">{children}</div>
                {/* Meta (ID + line) sits at the right; fades in on hover/select via CSS */}
                <div className="livespec-tracked-item-meta">
                  <span className="livespec-tracked-item-id">{item.id}</span>
                  <span className="livespec-tracked-item-line">:{item.line}</span>
                </div>
              </div>
            </li>
          );
        },
        input: ({ checked, ...props }: ComponentPropsWithoutRef<"input">) => (
          <input
            {...props}
            checked={checked}
            disabled
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
        )
      }}
    >
      {document.text}
    </ReactMarkdown>
  );

  const progressSummary =
    parsedDocument === undefined
      ? "Waiting for document"
      : `${parsedDocument.progress.complete}/${parsedDocument.progress.total} complete`;
  const filteredEmpty =
    !parsedDocument?.isEmpty &&
    trackedItems.length > 0 &&
    incompleteOnly &&
    visibleTrackedItems.length === 0;

  return (
    <div className="livespec-shell">
      <header className="livespec-toolbar">
        <div className="livespec-toolbar-title">
          {/* Small LiveSpec indicator — no "LIVESPEC" eyebrow label needed */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-label="LiveSpec"
            className="livespec-toolbar-icon"
          >
            <circle cx="8" cy="8" r="3" />
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <h1>{fileName}</h1>
        </div>
        <div className="livespec-toolbar-actions">
          <span className="livespec-progress-pill">{progressSummary}</span>
          <div className="livespec-toolbar-divider" role="separator" />
          <button
            type="button"
            className={`livespec-toolbar-button${incompleteOnly ? " livespec-toolbar-button-active" : ""}`}
            aria-pressed={incompleteOnly}
            title={incompleteOnly ? "Show all items" : "Show incomplete items only"}
            onClick={() => {
              setIncompleteOnly((currentValue) => !currentValue);
            }}
          >
            {incompleteOnly ? "Show All" : "Incomplete Only"}
          </button>
          <button
            type="button"
            className="livespec-toolbar-button"
            onClick={handleCopySelectedIds}
            disabled={selectedKeys.length === 0}
            title="Copy selected IDs to clipboard"
          >
            Copy IDs
          </button>
          <button
            type="button"
            className="livespec-toolbar-button livespec-toolbar-button-primary"
            onClick={() => {
              handleEditSource();
            }}
          >
            Edit Source
          </button>
        </div>
      </header>
      <main className="livespec-content" ref={scrollContainerRef}>
        <section className="livespec-panel">
          {documentState === null ? (
            <div className="livespec-state-card">
              <h2>Preparing preview</h2>
              <p>LiveSpec is waiting for the extension host to send the current document.</p>
            </div>
          ) : parseError !== null ? (
            <div className="livespec-state-card livespec-state-card-danger">
              <h2>Unable to render this document</h2>
              <p>{parseError.message}</p>
              <button
                type="button"
                className="livespec-toolbar-button livespec-toolbar-button-primary"
                onClick={() => {
                  handleEditSource(1);
                }}
              >
                Edit Source
              </button>
            </div>
          ) : parsedDocument?.isEmpty ? (
            <div className="livespec-state-card">
              <h2>Empty document</h2>
              <p>Add markdown content to start using the LiveSpec preview.</p>
            </div>
          ) : (
            <>
              {filteredEmpty ? (
                <div className="livespec-state-card">
                  <h2>No incomplete items in view</h2>
                  <p>All tracked items are complete. Turn off the filter to inspect the full document.</p>
                </div>
              ) : null}
              <div className="livespec-document">{parsedDocument ? renderTrackedMarkdown(parsedDocument) : null}</div>
            </>
          )}
        </section>
      </main>
    </div>
  );
};
