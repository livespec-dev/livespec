import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_SPEC_VIEW_TYPE } from "../src/constants.js";
import { LiveSpecExtension } from "../src/extension.js";

const vscodeMock = vi.hoisted(() => {
  const executeCommand = vi.fn();
  const showTextDocument = vi.fn();
  const writeText = vi.fn();
  const closeTabs = vi.fn();
  const tabGroups = {
    all: [] as Array<{ tabs: Array<{ input: unknown }> }>,
    close: closeTabs
  };

  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number
    ) {}
  }

  class Range {
    constructor(
      public readonly start: Position,
      public readonly end: Position
    ) {}
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

  class TabInputText {
    constructor(public readonly uri: { toString(): string }) {}
  }

  return {
    closeTabs,
    executeCommand,
    showTextDocument,
    tabGroups,
    writeText,
    Position,
    Range,
    Selection,
    TabInputText
  };
});

vi.mock("vscode", () => ({
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4
  },
  Position: vscodeMock.Position,
  Range: vscodeMock.Range,
  Selection: vscodeMock.Selection,
  TabInputText: vscodeMock.TabInputText,
  TextEditorRevealType: {
    InCenterIfOutsideViewport: 1
  },
  commands: {
    executeCommand: vscodeMock.executeCommand,
    registerCommand: vi.fn()
  },
  env: {
    clipboard: {
      writeText: vscodeMock.writeText
    }
  },
  window: {
    activeColorTheme: {
      kind: 2
    },
    activeTextEditor: {
      viewColumn: 2
    },
    tabGroups: vscodeMock.tabGroups,
    showTextDocument: vscodeMock.showTextDocument,
    visibleTextEditors: [],
    registerCustomEditorProvider: vi.fn(),
    onDidChangeVisibleTextEditors: vi.fn(),
    onDidChangeActiveColorTheme: vi.fn()
  },
  workspace: {
    getWorkspaceFolder: vi.fn(),
    onDidOpenTextDocument: vi.fn(),
    onDidChangeTextDocument: vi.fn(),
    onDidCloseTextDocument: vi.fn()
  },
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3
  }
}));

interface FakeDocument {
  uri: {
    scheme: string;
    fsPath: string;
    toString(): string;
  };
  languageId: string;
}

interface FakeTab {
  input: unknown;
}

const createDocument = (
  overrides: Partial<FakeDocument> = {}
): FakeDocument => {
  const scheme = overrides.uri?.scheme ?? "file";
  const fsPath = overrides.uri?.fsPath ?? "/workspace/specs/example.md";

  return {
    uri: {
      scheme,
      fsPath,
      toString: () => `${scheme}://${fsPath}`
    },
    languageId: overrides.languageId ?? "markdown"
  };
};

const createTextTab = (document: FakeDocument): FakeTab => ({
  input: new vscodeMock.TabInputText(document.uri)
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
    vscodeMock.closeTabs.mockReset();
    vscodeMock.executeCommand.mockReset();
    vscodeMock.showTextDocument.mockReset();
    vscodeMock.writeText.mockReset();
    vscodeMock.tabGroups.all = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-opens matching markdown files once and skips repeat attempts for the same URI", async () => {
    const extension = createExtension();
    const document = createDocument();
    const textTab = createTextTab(document);

    vscodeMock.tabGroups.all = [{ tabs: [textTab] }];

    vi.spyOn(extension.registry, "hasOpenPanel").mockReturnValue(false);
    vi.spyOn(extension, "resolveRepositoryContext").mockResolvedValue({
      repositoryRoot: "/workspace",
      config: {
        version: 1,
        specFileGlob: "**/specs/**/*.md"
      }
    });

    await (
      extension as unknown as { maybeAutoOpen(document: FakeDocument): Promise<void> }
    ).maybeAutoOpen(document);

    expect(vscodeMock.executeCommand).toHaveBeenCalledWith(
      "vscode.openWith",
      document.uri,
      LIVE_SPEC_VIEW_TYPE,
      {
        preview: false,
        viewColumn: 2
      }
    );
    expect(vscodeMock.closeTabs).toHaveBeenCalledWith([textTab], true);

    await (
      extension as unknown as { maybeAutoOpen(document: FakeDocument): Promise<void> }
    ).maybeAutoOpen(document);

    expect(vscodeMock.executeCommand).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "documents outside the file scheme",
      document: createDocument({
        uri: {
          scheme: "untitled",
          fsPath: "/workspace/specs/example.md",
          toString: () => "untitled:///workspace/specs/example.md"
        }
      }),
      expectRepositoryLookup: false
    },
    {
      name: "the checked-in LiveSpec config file",
      document: createDocument({
        uri: {
          scheme: "file",
          fsPath: "/workspace/.livespec/config.json",
          toString: () => "file:///workspace/.livespec/config.json"
        }
      }),
      expectRepositoryLookup: false
    },
    {
      name: "non-matching markdown files",
      document: createDocument({
        uri: {
          scheme: "file",
          fsPath: "/workspace/docs/readme.md",
          toString: () => "file:///workspace/docs/readme.md"
        }
      }),
      expectRepositoryLookup: true
    }
  ])("skips auto-open for $name", async ({ document, expectRepositoryLookup }) => {
    const extension = createExtension();
    const resolveRepositoryContext = vi
      .spyOn(extension, "resolveRepositoryContext")
      .mockResolvedValue({
        repositoryRoot: "/workspace",
        config: {
          version: 1,
          specFileGlob: "**/specs/**/*.md"
        }
      });

    vi.spyOn(extension.registry, "hasOpenPanel").mockReturnValue(false);

    await (
      extension as unknown as { maybeAutoOpen(document: FakeDocument): Promise<void> }
    ).maybeAutoOpen(document);

    if (expectRepositoryLookup) {
      expect(resolveRepositoryContext).toHaveBeenCalledTimes(1);
    } else {
      expect(resolveRepositoryContext).not.toHaveBeenCalled();
    }

    expect(vscodeMock.executeCommand).not.toHaveBeenCalled();
  });

  it("skips auto-open when the document already has an open LiveSpec panel", async () => {
    const extension = createExtension();

    vi.spyOn(extension.registry, "hasOpenPanel").mockReturnValue(true);
    const resolveRepositoryContext = vi.spyOn(extension, "resolveRepositoryContext");

    await (
      extension as unknown as { maybeAutoOpen(document: FakeDocument): Promise<void> }
    ).maybeAutoOpen(createDocument());

    expect(resolveRepositoryContext).not.toHaveBeenCalled();
    expect(vscodeMock.executeCommand).not.toHaveBeenCalled();
    expect(vscodeMock.closeTabs).not.toHaveBeenCalled();
  });

  it("opens the source document at the requested one-based line and preserves the view column", async () => {
    const extension = createExtension();
    const firstEditor = {
      selection: undefined as unknown,
      revealRange: vi.fn()
    };
    const secondEditor = {
      selection: undefined as unknown,
      revealRange: vi.fn()
    };
    const document = createDocument();

    vscodeMock.showTextDocument
      .mockResolvedValueOnce(firstEditor)
      .mockResolvedValueOnce(secondEditor);

    await (
      extension as unknown as {
        openSource(
          document: FakeDocument,
          line: number,
          viewColumn: number | undefined
        ): Promise<void>;
      }
    ).openSource(document, 1, 3);

    expect(vscodeMock.showTextDocument).toHaveBeenNthCalledWith(1, document, {
      preview: false,
      preserveFocus: false,
      viewColumn: 3
    });
    expect((firstEditor.selection as { anchor: { line: number } }).anchor.line).toBe(0);
    expect(firstEditor.revealRange).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.objectContaining({ line: 0 })
      }),
      1
    );

    await (
      extension as unknown as {
        openSource(
          document: FakeDocument,
          line: number,
          viewColumn: number | undefined
        ): Promise<void>;
      }
    ).openSource(document, 5, undefined);

    expect(vscodeMock.showTextDocument).toHaveBeenNthCalledWith(2, document, {
      preview: false,
      preserveFocus: false
    });
    expect((secondEditor.selection as { anchor: { line: number } }).anchor.line).toBe(4);
    expect(secondEditor.revealRange).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.objectContaining({ line: 4 })
      }),
      1
    );
  });
});
