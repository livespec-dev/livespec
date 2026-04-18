import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSpecPanelRegistry } from "../src/documentSync.js";

interface FakeDocument {
  uri: {
    toString(): string;
    path: string;
    fsPath: string;
  };
  version: number;
  getText(): string;
}

interface FakePanel {
  active: boolean;
  webview: {
    postMessage: ReturnType<typeof vi.fn>;
  };
  onDidDispose(listener: () => void): { dispose(): void };
  onDidChangeViewState(
    listener: (event: { webviewPanel: FakePanel }) => void
  ): { dispose(): void };
}

const createDocument = (
  uri: string,
  initialText: string,
  initialVersion = 1
): FakeDocument => {
  let text = initialText;
  let version = initialVersion;

  return {
    uri: {
      toString: () => uri,
      path: new URL(uri).pathname,
      fsPath: new URL(uri).pathname
    },
    get version() {
      return version;
    },
    set version(nextVersion: number) {
      version = nextVersion;
    },
    getText: () => text,
    setText(nextText: string) {
      text = nextText;
    }
  } as FakeDocument;
};

const createPanel = (): FakePanel => {
  const disposeListeners: Array<() => void> = [];
  const viewStateListeners: Array<(event: { webviewPanel: FakePanel }) => void> = [];
  const panel: FakePanel = {
    active: true,
    webview: {
      postMessage: vi.fn().mockResolvedValue(true)
    },
    onDidDispose(listener) {
      disposeListeners.push(listener);
      return {
        dispose() {}
      };
    },
    onDidChangeViewState(listener) {
      viewStateListeners.push(listener);
      return {
        dispose() {}
      };
    }
  };

  return panel;
};

describe("LiveSpecPanelRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces document updates and fans out the same snapshot to every open LiveSpec editor", async () => {
    const registry = new LiveSpecPanelRegistry();
    const document = createDocument("file:///workspace/specs/example.md", "alpha");
    const firstPanel = createPanel();
    const secondPanel = createPanel();

    registry.registerPanel({
      panel: firstPanel as never,
      document: document as never,
      repositoryRoot: "/workspace",
      config: {
        version: 1,
        specFileGlob: "**/specs/**/*.md"
      }
    });
    registry.registerPanel({
      panel: secondPanel as never,
      document: document as never,
      repositoryRoot: "/workspace",
      config: {
        version: 1,
        specFileGlob: "**/specs/**/*.md"
      }
    });

    (document as FakeDocument & { setText(nextText: string): void }).setText("beta");
    document.version = 2;
    registry.scheduleDocumentSnapshot(document as never);
    (document as FakeDocument & { setText(nextText: string): void }).setText("gamma");
    document.version = 3;
    registry.scheduleDocumentSnapshot(document as never);

    await vi.advanceTimersByTimeAsync(200);

    expect(firstPanel.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(secondPanel.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(firstPanel.webview.postMessage).toHaveBeenCalledWith({
      type: "documentUpdated",
      text: "gamma",
      version: 3
    });
    expect(secondPanel.webview.postMessage).toHaveBeenCalledWith({
      type: "documentUpdated",
      text: "gamma",
      version: 3
    });
  });
});
