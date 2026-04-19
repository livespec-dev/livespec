import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND_IDS,
  LIVE_SPEC_TREE_VIEW_ID,
  LIVE_SPEC_VIEW_TYPE
} from "../src/constants.js";
import type { LiveSpecSpecEntry } from "../src/specIndex.js";
import type { LiveSpecTreeFileNode } from "../src/specTree.js";
import { LiveSpecExtension } from "../src/extension.js";

const vscodeMock = vi.hoisted(() => {
  const createDisposable = () => ({
    dispose() { }
  });
  const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const changeTextDocumentHandlers: Array<(event: unknown) => unknown> = [];
  const openTextDocumentHandlers: Array<(document: unknown) => unknown> = [];
  const closeTextDocumentHandlers: Array<(document: unknown) => unknown> = [];
  const visibleTextEditorsHandlers: Array<(editors: unknown[]) => unknown> = [];
  const activeColorThemeHandlers: Array<() => unknown> = [];
  const watcherRegistrations: Array<{
    pattern: string;
    watcher: {
      onDidCreate: ReturnType<typeof vi.fn>;
      onDidChange: ReturnType<typeof vi.fn>;
      onDidDelete: ReturnType<typeof vi.fn>;
      dispose(): void;
    };
    createHandlers: Array<(uri: unknown) => unknown>;
    changeHandlers: Array<(uri: unknown) => unknown>;
    deleteHandlers: Array<(uri: unknown) => unknown>;
  }> = [];
  const executeCommand = vi.fn();
  const showTextDocument = vi.fn();
  const showQuickPick = vi.fn();
  const registerCommand = vi.fn((command: string, callback: (...args: unknown[]) => unknown) => {
    commandHandlers.set(command, callback);
    return createDisposable();
  });
  const registerCustomEditorProvider = vi.fn(() => createDisposable());
  const onDidChangeTextDocument = vi.fn((handler: (event: unknown) => unknown) => {
    changeTextDocumentHandlers.push(handler);
    return createDisposable();
  });
  const onDidOpenTextDocument = vi.fn((handler: (document: unknown) => unknown) => {
    openTextDocumentHandlers.push(handler);
    return createDisposable();
  });
  const onDidCloseTextDocument = vi.fn((handler: (document: unknown) => unknown) => {
    closeTextDocumentHandlers.push(handler);
    return createDisposable();
  });
  const onDidChangeVisibleTextEditors = vi.fn((handler: (editors: unknown[]) => unknown) => {
    visibleTextEditorsHandlers.push(handler);
    return createDisposable();
  });
  const onDidChangeActiveColorTheme = vi.fn((handler: () => unknown) => {
    activeColorThemeHandlers.push(handler);
    return createDisposable();
  });
  const getWorkspaceFolder = vi.fn();
  const findFiles = vi.fn().mockResolvedValue([]);
  const createFileSystemWatcher = vi.fn((pattern: string) => {
    const createHandlers: Array<(uri: unknown) => unknown> = [];
    const changeHandlers: Array<(uri: unknown) => unknown> = [];
    const deleteHandlers: Array<(uri: unknown) => unknown> = [];
    const watcher = {
      onDidCreate: vi.fn((handler: (uri: unknown) => unknown) => {
        createHandlers.push(handler);
        return createDisposable();
      }),
      onDidChange: vi.fn((handler: (uri: unknown) => unknown) => {
        changeHandlers.push(handler);
        return createDisposable();
      }),
      onDidDelete: vi.fn((handler: (uri: unknown) => unknown) => {
        deleteHandlers.push(handler);
        return createDisposable();
      }),
      dispose() { }
    };

    watcherRegistrations.push({
      pattern,
      watcher,
      createHandlers,
      changeHandlers,
      deleteHandlers
    });

    return watcher;
  });
  const createTreeView = vi.fn(() => ({
    message: undefined as string | undefined,
    reveal: vi.fn().mockResolvedValue(undefined),
    dispose() { }
  }));

  class EventEmitter<T> {
    readonly event = vi.fn();
    readonly fire = vi.fn<(value: T | undefined) => void>();
    dispose() { }
  }

  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number
    ) { }
  }

  class Range {
    constructor(
      public readonly start: Position,
      public readonly end: Position
    ) { }
  }

  class Selection {
    readonly start: Position;
    readonly end: Position;

    constructor(
      public readonly anchor: Position,
      public readonly active: Position
    ) {
      this.start = anchor;
      this.end = active;
    }
  }

  class TreeItem {
    command?: unknown;
    contextValue?: string;
    description?: string;
    resourceUri?: unknown;

    constructor(
      public readonly label: string,
      public readonly collapsibleState: number
    ) { }
  }

  const clearCommands = () => {
    commandHandlers.clear();
    registerCommand.mockClear();
  };

  const clearEventRegistrations = () => {
    changeTextDocumentHandlers.length = 0;
    openTextDocumentHandlers.length = 0;
    closeTextDocumentHandlers.length = 0;
    visibleTextEditorsHandlers.length = 0;
    activeColorThemeHandlers.length = 0;
    onDidChangeTextDocument.mockClear();
    onDidOpenTextDocument.mockClear();
    onDidCloseTextDocument.mockClear();
    onDidChangeVisibleTextEditors.mockClear();
    onDidChangeActiveColorTheme.mockClear();
  };

  const clearWatchers = () => {
    watcherRegistrations.length = 0;
    createFileSystemWatcher.mockClear();
  };

  const getWatcher = (pattern: string) =>
    watcherRegistrations.find((registration) => registration.pattern === pattern);

  const fireWatcher = async (
    pattern: string,
    eventName: "create" | "change" | "delete",
    uri: unknown
  ) => {
    const registration = getWatcher(pattern);

    if (registration === undefined) {
      throw new Error(`No watcher registered for ${pattern}`);
    }

    const handlers =
      eventName === "create"
        ? registration.createHandlers
        : eventName === "change"
          ? registration.changeHandlers
          : registration.deleteHandlers;

    for (const handler of handlers) {
      await handler(uri);
    }
  };

  const fireOpenTextDocument = async (document: unknown) => {
    for (const handler of openTextDocumentHandlers) {
      await handler(document);
    }
  };

  const executeRegisteredCommand = async (command: string, ...args: unknown[]) => {
    const handler = commandHandlers.get(command);

    if (handler === undefined) {
      throw new Error(`No command registered for ${command}`);
    }

    return handler(...args);
  };

  return {
    clearCommands,
    clearEventRegistrations,
    clearWatchers,
    createFileSystemWatcher,
    createTreeView,
    EventEmitter,
    executeCommand,
    executeRegisteredCommand,
    fireOpenTextDocument,
    fireWatcher,
    findFiles,
    getWorkspaceFolder,
    getWatcher,
    onDidChangeActiveColorTheme,
    onDidChangeTextDocument,
    onDidChangeVisibleTextEditors,
    onDidCloseTextDocument,
    onDidOpenTextDocument,
    Position,
    Range,
    registerCommand,
    registerCustomEditorProvider,
    Selection,
    showQuickPick,
    showTextDocument,
    TreeItem,
    workspaceFolders: [] as Array<{ name: string; uri: { fsPath: string } }>
  };
});

vi.mock("vscode", () => ({
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4
  },
  commands: {
    executeCommand: vscodeMock.executeCommand,
    registerCommand: vscodeMock.registerCommand
  },
  EventEmitter: vscodeMock.EventEmitter,
  Position: vscodeMock.Position,
  Range: vscodeMock.Range,
  Selection: vscodeMock.Selection,
  TextEditorRevealType: {
    InCenterIfOutsideViewport: 1
  },
  TreeItem: vscodeMock.TreeItem,
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  window: {
    activeColorTheme: {
      kind: 2
    },
    activeTextEditor: {
      viewColumn: 2
    },
    createTreeView: vscodeMock.createTreeView,
    onDidChangeActiveColorTheme: vscodeMock.onDidChangeActiveColorTheme,
    onDidChangeVisibleTextEditors: vscodeMock.onDidChangeVisibleTextEditors,
    registerCustomEditorProvider: vscodeMock.registerCustomEditorProvider,
    showQuickPick: vscodeMock.showQuickPick,
    showTextDocument: vscodeMock.showTextDocument,
    visibleTextEditors: []
  },
  workspace: {
    createFileSystemWatcher: vscodeMock.createFileSystemWatcher,
    findFiles: vscodeMock.findFiles,
    getWorkspaceFolder: vscodeMock.getWorkspaceFolder,
    onDidChangeTextDocument: vscodeMock.onDidChangeTextDocument,
    onDidCloseTextDocument: vscodeMock.onDidCloseTextDocument,
    onDidOpenTextDocument: vscodeMock.onDidOpenTextDocument,
    workspaceFolders: vscodeMock.workspaceFolders
  }
}));

const createUri = (fsPath: string) => ({
  scheme: "file",
  fsPath,
  path: fsPath,
  toString: () => `file://${fsPath}`
});

const createSpecEntry = (
  fsPath: string,
  relativePath: string
): LiveSpecSpecEntry => ({
  id: `${fsPath}::${relativePath}`,
  uri: createUri(fsPath) as never,
  repositoryRoot: "/workspace",
  repositoryName: "workspace",
  workspaceFolderName: "workspace",
  specRootDir: "specs",
  relativePath,
  fileName: relativePath.split("/").pop() ?? relativePath,
  folderSegments: relativePath.split("/").slice(0, -1)
});

const createExtension = () =>
  new LiveSpecExtension({
    subscriptions: [],
    extensionUri: {
      scheme: "file",
      path: "/extension"
    }
  } as never);

describe("LiveSpecExtension", () => {
  beforeEach(() => {
    vscodeMock.clearCommands();
    vscodeMock.clearEventRegistrations();
    vscodeMock.clearWatchers();
    vscodeMock.createTreeView.mockClear();
    vscodeMock.executeCommand.mockReset();
    vscodeMock.findFiles.mockReset();
    vscodeMock.findFiles.mockResolvedValue([]);
    vscodeMock.getWorkspaceFolder.mockReset();
    vscodeMock.registerCustomEditorProvider.mockClear();
    vscodeMock.showQuickPick.mockReset();
    vscodeMock.showTextDocument.mockReset();
    vscodeMock.workspaceFolders.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a provided spec entry in the LiveSpec custom editor", async () => {
    const extension = createExtension();
    const entry = createSpecEntry("/workspace/specs/alpha/spec.md", "alpha/spec.md");

    await (
      extension as unknown as {
        openSpec(target: LiveSpecSpecEntry): Promise<void>;
      }
    ).openSpec(entry);

    expect(vscodeMock.executeCommand).toHaveBeenCalledWith(
      "vscode.openWith",
      entry.uri,
      LIVE_SPEC_VIEW_TYPE,
      {
        preview: true,
        viewColumn: 2
      }
    );
  });

  it("uses a Quick Pick launcher to select and open a spec", async () => {
    const extension = createExtension();
    const firstEntry = createSpecEntry("/workspace/specs/alpha/spec.md", "alpha/spec.md");
    const secondEntry = createSpecEntry("/workspace/specs/beta/spec.md", "beta/spec.md");

    vi.spyOn(extension.treeProvider, "getSnapshot").mockReturnValue({
      repositories: [
        {
          id: "/workspace",
          repositoryRoot: "/workspace",
          repositoryName: "workspace",
          workspaceFolderName: "workspace",
          specRootDir: "specs",
          entries: [firstEntry, secondEntry]
        }
      ],
      entries: [firstEntry, secondEntry]
    });
    vscodeMock.showQuickPick.mockImplementation(async (items) => items[1]);

    await (
      extension as unknown as {
        openSpec(): Promise<void>;
      }
    ).openSpec();

    expect(vscodeMock.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: "spec.md",
          description: "alpha/spec.md",
          entry: firstEntry
        }),
        expect.objectContaining({
          label: "spec.md",
          description: "beta/spec.md",
          entry: secondEntry
        })
      ],
      expect.objectContaining({
        title: "LiveSpec: Open Spec",
        matchOnDescription: true,
        matchOnDetail: true
      })
    );
    expect(vscodeMock.executeCommand).toHaveBeenCalledWith(
      "vscode.openWith",
      secondEntry.uri,
      LIVE_SPEC_VIEW_TYPE,
      {
        preview: true,
        viewColumn: 2
      }
    );
  });

  it("uses human-readable repository labels in multi-repository Quick Pick details", async () => {
    const extension = createExtension();
    const firstEntry: LiveSpecSpecEntry = {
      ...createSpecEntry("/workspace-a/specs/alpha/spec.md", "alpha/spec.md"),
      repositoryRoot: "/workspace-a/packages/repo-a",
      repositoryName: "repo-a",
      workspaceFolderName: "workspace-a"
    };
    const secondEntry: LiveSpecSpecEntry = {
      ...createSpecEntry("/workspace-b/specs/beta/spec.md", "beta/spec.md"),
      repositoryRoot: "/workspace-b",
      repositoryName: "workspace-b",
      workspaceFolderName: "workspace-b"
    };

    vi.spyOn(extension.treeProvider, "getSnapshot").mockReturnValue({
      repositories: [
        {
          id: firstEntry.repositoryRoot,
          repositoryRoot: firstEntry.repositoryRoot,
          repositoryName: firstEntry.repositoryName,
          workspaceFolderName: firstEntry.workspaceFolderName,
          specRootDir: "specs",
          entries: [firstEntry]
        },
        {
          id: secondEntry.repositoryRoot,
          repositoryRoot: secondEntry.repositoryRoot,
          repositoryName: secondEntry.repositoryName,
          workspaceFolderName: secondEntry.workspaceFolderName,
          specRootDir: "specs",
          entries: [secondEntry]
        }
      ],
      entries: [firstEntry, secondEntry]
    });
    vscodeMock.showQuickPick.mockImplementation(async (items) => items[0]);

    await (
      extension as unknown as {
        openSpec(): Promise<void>;
      }
    ).openSpec();

    expect(vscodeMock.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          detail: "repo-a (workspace-a)"
        }),
        expect.objectContaining({
          detail: "workspace-b"
        })
      ],
      expect.anything()
    );
  });

  it("reveals the active spec in the tree view", async () => {
    const extension = createExtension();
    const entry = createSpecEntry("/workspace/specs/alpha/spec.md", "alpha/spec.md");
    const treeView = {
      message: undefined as string | undefined,
      reveal: vi.fn().mockResolvedValue(undefined),
      dispose() { }
    };
    const fileNode: LiveSpecTreeFileNode = {
      kind: "file",
      id: entry.id,
      label: entry.fileName,
      entry
    };

    extension.treeView = treeView as never;
    vi.spyOn(extension.registry, "getActivePanel").mockReturnValue({
      document: {
        uri: entry.uri
      }
    } as never);
    vi.spyOn(extension.treeProvider, "findNodeForUri").mockReturnValue(fileNode);

    await (
      extension as unknown as {
        revealActiveSpec(): Promise<void>;
      }
    ).revealActiveSpec();

    expect(treeView.reveal).toHaveBeenCalledWith(fileNode, {
      focus: true,
      select: true,
      expand: true
    });
  });

  it("activates the tree view, shows an empty-workspace message, and does not register auto-open listeners", async () => {
    const extension = createExtension();
    const treeView = {
      message: undefined as string | undefined,
      reveal: vi.fn().mockResolvedValue(undefined),
      dispose() { }
    };

    vscodeMock.createTreeView.mockReturnValue(treeView);

    await extension.activate();

    expect(vscodeMock.createTreeView).toHaveBeenCalledWith(LIVE_SPEC_TREE_VIEW_ID, {
      treeDataProvider: extension.treeProvider,
      showCollapseAll: true
    });
    expect(treeView.message).toBe("Open a workspace folder to browse LiveSpec specs.");
    expect(extension.context.subscriptions).toContain(extension.treeProvider);
    expect(vscodeMock.onDidOpenTextDocument).not.toHaveBeenCalled();
    expect(vscodeMock.onDidChangeVisibleTextEditors).not.toHaveBeenCalled();
  });

  it("rebroadcasts config updates when the config watcher fires", async () => {
    const extension = createExtension();
    const treeView = {
      message: undefined as string | undefined,
      reveal: vi.fn().mockResolvedValue(undefined),
      dispose() { }
    };
    const refreshSpy = vi.spyOn(extension.treeProvider, "refresh").mockResolvedValue(undefined);
    const broadcastConfigSpy = vi.spyOn(extension.registry, "broadcastConfig");

    vscodeMock.createTreeView.mockReturnValue(treeView);
    vscodeMock.workspaceFolders.push({
      name: "workspace",
      uri: {
        fsPath: "/workspace"
      }
    });

    await extension.activate();

    refreshSpy.mockClear();
    broadcastConfigSpy.mockClear();

    await vscodeMock.fireWatcher(
      "**/.livespec/config.json",
      "delete",
      createUri("/workspace/.livespec/config.json")
    );

    expect(broadcastConfigSpy).toHaveBeenCalledWith(
      "/workspace",
      expect.objectContaining({
        specRootDir: "specs"
      })
    );
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("registers markdown watchers without content-change refreshes", async () => {
    const extension = createExtension();

    await extension.activate();

    const markdownWatcher = vscodeMock.getWatcher("**/*.md");
    const configWatcher = vscodeMock.getWatcher("**/.livespec/config.json");

    expect(markdownWatcher?.watcher.onDidCreate).toHaveBeenCalledTimes(1);
    expect(markdownWatcher?.watcher.onDidChange).not.toHaveBeenCalled();
    expect(markdownWatcher?.watcher.onDidDelete).toHaveBeenCalledTimes(1);
    expect(configWatcher?.watcher.onDidCreate).toHaveBeenCalledTimes(1);
    expect(configWatcher?.watcher.onDidChange).toHaveBeenCalledTimes(1);
    expect(configWatcher?.watcher.onDidDelete).toHaveBeenCalledTimes(1);
  });

  it("does not reopen specs when a normal document-open event fires", async () => {
    const extension = createExtension();

    await extension.activate();

    vscodeMock.executeCommand.mockClear();

    await vscodeMock.fireOpenTextDocument({
      uri: createUri("/workspace/specs/alpha/spec.md"),
      languageId: "markdown"
    });

    expect(vscodeMock.executeCommand).not.toHaveBeenCalled();
  });

  it("refreshes the tree and updates the empty-state message from the refresh command", async () => {
    const extension = createExtension();
    const treeView = {
      message: undefined as string | undefined,
      reveal: vi.fn().mockResolvedValue(undefined),
      dispose() { }
    };
    const refreshSpy = vi.spyOn(extension.treeProvider, "refresh").mockResolvedValue(undefined);

    vi.spyOn(extension.treeProvider, "hasEntries").mockReturnValue(false);
    vscodeMock.createTreeView.mockReturnValue(treeView);
    vscodeMock.workspaceFolders.push({
      name: "workspace",
      uri: {
        fsPath: "/workspace"
      }
    });

    await extension.activate();

    refreshSpy.mockClear();
    treeView.message = undefined;

    await vscodeMock.executeRegisteredCommand(COMMAND_IDS.refreshSpecTree);

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(treeView.message).toBe(
      "No LiveSpec specs found under the configured root spec directory."
    );
  });
});
