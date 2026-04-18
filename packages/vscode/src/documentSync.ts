import type * as vscode from "vscode";
import type { LiveSpecConfig } from "@livespec/core";
import { DOCUMENT_UPDATE_DEBOUNCE_MS } from "./constants.js";
import type { HostToWebviewMessage, LiveSpecThemeKind } from "./protocol.js";

export interface LiveSpecPanelContext {
  panel: vscode.WebviewPanel;
  document: vscode.TextDocument;
  repositoryRoot: string;
  config: LiveSpecConfig;
  fileName: string;
  selectedIds: string[];
}

type TimerHandle = ReturnType<typeof setTimeout>;

export class LiveSpecPanelRegistry {
  private readonly panelsByDocumentUri = new Map<string, Set<LiveSpecPanelContext>>();
  private readonly contextsByPanel = new Map<vscode.WebviewPanel, LiveSpecPanelContext>();
  private readonly pendingDocumentUpdates = new Map<string, TimerHandle>();
  private activePanelContext: LiveSpecPanelContext | undefined;

  registerPanel(input: Omit<LiveSpecPanelContext, "fileName" | "selectedIds">): LiveSpecPanelContext {
    const context: LiveSpecPanelContext = {
      ...input,
      fileName: input.document.uri.path.split("/").pop() ?? input.document.uri.fsPath,
      selectedIds: []
    };
    const uriKey = input.document.uri.toString();
    const existingContexts = this.panelsByDocumentUri.get(uriKey) ?? new Set();
    existingContexts.add(context);
    this.panelsByDocumentUri.set(uriKey, existingContexts);
    this.contextsByPanel.set(input.panel, context);

    if (input.panel.active) {
      this.activePanelContext = context;
    }

    input.panel.onDidDispose(() => {
      this.unregisterPanel(input.panel);
    });

    input.panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.activePanelContext = context;
      }
    });

    return context;
  }

  unregisterPanel(panel: vscode.WebviewPanel): void {
    const context = this.contextsByPanel.get(panel);

    if (context === undefined) {
      return;
    }

    const uriKey = context.document.uri.toString();
    const existingContexts = this.panelsByDocumentUri.get(uriKey);

    existingContexts?.delete(context);

    if (existingContexts !== undefined && existingContexts.size === 0) {
      this.panelsByDocumentUri.delete(uriKey);
      this.clearPendingDocumentUpdate(uriKey);
    }

    this.contextsByPanel.delete(panel);

    if (this.activePanelContext === context) {
      this.activePanelContext = [...this.contextsByPanel.values()][0];
    }
  }

  hasOpenPanel(documentUri: vscode.Uri): boolean {
    return (this.panelsByDocumentUri.get(documentUri.toString())?.size ?? 0) > 0;
  }

  getActivePanel(): LiveSpecPanelContext | undefined {
    return this.activePanelContext;
  }

  updateSelection(panel: vscode.WebviewPanel, ids: string[]): void {
    const context = this.contextsByPanel.get(panel);

    if (context !== undefined) {
      context.selectedIds = [...ids];
    }
  }

  postMessage(panel: vscode.WebviewPanel, message: HostToWebviewMessage): void {
    void panel.webview.postMessage(message);
  }

  sendInitialState(
    context: LiveSpecPanelContext,
    themeKind: LiveSpecThemeKind
  ): void {
    this.postMessage(context.panel, {
      type: "configChanged",
      config: context.config
    });
    this.postMessage(context.panel, {
      type: "themeChanged",
      themeKind
    });
    this.postDocumentSnapshot(context.document);
  }

  postDocumentSnapshot(document: vscode.TextDocument): void {
    const contexts = this.panelsByDocumentUri.get(document.uri.toString());

    if (contexts === undefined || contexts.size === 0) {
      return;
    }

    const message: HostToWebviewMessage = {
      type: "documentUpdated",
      text: document.getText(),
      version: document.version
    };

    for (const context of contexts) {
      this.postMessage(context.panel, message);
    }
  }

  scheduleDocumentSnapshot(document: vscode.TextDocument): void {
    const uriKey = document.uri.toString();

    if (!this.hasOpenPanel(document.uri)) {
      return;
    }

    this.clearPendingDocumentUpdate(uriKey);
    this.pendingDocumentUpdates.set(
      uriKey,
      setTimeout(() => {
        this.pendingDocumentUpdates.delete(uriKey);
        this.postDocumentSnapshot(document);
      }, DOCUMENT_UPDATE_DEBOUNCE_MS)
    );
  }

  broadcastTheme(themeKind: LiveSpecThemeKind): void {
    for (const context of this.contextsByPanel.values()) {
      this.postMessage(context.panel, {
        type: "themeChanged",
        themeKind
      });
    }
  }

  broadcastConfig(repositoryRoot: string, config: LiveSpecConfig): void {
    for (const context of this.contextsByPanel.values()) {
      if (context.repositoryRoot !== repositoryRoot) {
        continue;
      }

      context.config = config;
      this.postMessage(context.panel, {
        type: "configChanged",
        config
      });
    }
  }

  requestOnActivePanel(
    message: Extract<
      HostToWebviewMessage,
      { type: "requestCopySelectedIds" | "requestEditSource" | "toggleIncompleteOnly" }
    >
  ): void {
    if (this.activePanelContext !== undefined) {
      this.postMessage(this.activePanelContext.panel, message);
    }
  }

  private clearPendingDocumentUpdate(uriKey: string): void {
    const timer = this.pendingDocumentUpdates.get(uriKey);

    if (timer !== undefined) {
      clearTimeout(timer);
      this.pendingDocumentUpdates.delete(uriKey);
    }
  }
}
