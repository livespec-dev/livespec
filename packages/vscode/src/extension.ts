import { promises as fs } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { defaultLiveSpecConfig, loadLiveSpecConfig } from "@livespec/core";
import { COMMAND_IDS, LIVE_SPEC_VIEW_TYPE } from "./constants.js";
import { LiveSpecPanelRegistry, type LiveSpecPanelContext } from "./documentSync.js";
import type { LiveSpecThemeKind, WebviewToHostMessage } from "./protocol.js";
import {
  findRepositoryRoot,
  isLiveSpecConfigPath,
  matchesLiveSpecFile
} from "./repository.js";
import {
  buildLiveSpecWebviewHtml,
  getWebviewLocalResourceRoots
} from "./webviewHtml.js";

interface RepositoryContext {
  repositoryRoot: string;
  config: ReturnType<typeof defaultLiveSpecConfig>;
}

class LiveSpecEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extension: LiveSpecExtension) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const repositoryContext =
      (await this.extension.resolveRepositoryContext(document.uri)) ?? {
        repositoryRoot: path.dirname(document.uri.fsPath),
        config: defaultLiveSpecConfig()
      };

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: getWebviewLocalResourceRoots(this.extension.context.extensionUri)
    };

    const panelContext = this.extension.registry.registerPanel({
      panel,
      document,
      repositoryRoot: repositoryContext.repositoryRoot,
      config: repositoryContext.config
    });

    panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
      void this.extension.handleWebviewMessage(panelContext, message);
    });

    panel.webview.html = buildLiveSpecWebviewHtml({
      webview: panel.webview,
      extensionUri: this.extension.context.extensionUri,
      fileName: panelContext.fileName,
      themeKind: this.extension.themeKind
    });
  }
}

export class LiveSpecExtension {
  readonly registry = new LiveSpecPanelRegistry();
  readonly provider = new LiveSpecEditorProvider(this);
  readonly autoOpenedUris = new Set<string>();
  readonly autoOpenInFlightUris = new Set<string>();

  constructor(readonly context: vscode.ExtensionContext) {}

  get themeKind(): LiveSpecThemeKind {
    switch (vscode.window.activeColorTheme.kind) {
      case vscode.ColorThemeKind.Light:
        return "light";
      case vscode.ColorThemeKind.HighContrast:
        return "high-contrast";
      case vscode.ColorThemeKind.HighContrastLight:
        return "high-contrast-light";
      case vscode.ColorThemeKind.Dark:
      default:
        return "dark";
    }
  }

  async activate(): Promise<void> {
    this.context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(
        LIVE_SPEC_VIEW_TYPE,
        this.provider,
        {
          webviewOptions: {
            retainContextWhenHidden: false
          },
          supportsMultipleEditorsPerDocument: true
        }
      ),
      vscode.commands.registerCommand(COMMAND_IDS.copySelectedIds, () => {
        this.registry.requestOnActivePanel({ type: "requestCopySelectedIds" });
      }),
      vscode.commands.registerCommand(COMMAND_IDS.toggleIncompleteOnly, () => {
        this.registry.requestOnActivePanel({ type: "toggleIncompleteOnly" });
      }),
      vscode.commands.registerCommand(COMMAND_IDS.editSource, () => {
        this.registry.requestOnActivePanel({ type: "requestEditSource" });
      }),
      vscode.commands.registerCommand(COMMAND_IDS.refresh, () => {
        const activePanel = this.registry.getActivePanel();

        if (activePanel !== undefined) {
          this.registry.broadcastConfig(activePanel.repositoryRoot, activePanel.config);
          this.registry.postDocumentSnapshot(activePanel.document);
        }
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        void this.maybeAutoOpen(document);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.registry.scheduleDocumentSnapshot(event.document);

        if (isLiveSpecConfigPath(event.document.uri.fsPath)) {
          void this.handleConfigChange(event.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.autoOpenedUris.delete(document.uri.toString());
      }),
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) {
          void this.maybeAutoOpen(editor.document);
        }
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.registry.broadcastTheme(this.themeKind);
      })
    );

    for (const editor of vscode.window.visibleTextEditors) {
      await this.maybeAutoOpen(editor.document);
    }
  }

  async handleWebviewMessage(
    panelContext: LiveSpecPanelContext,
    message: WebviewToHostMessage
  ): Promise<void> {
    switch (message.type) {
      case "ready": {
        this.registry.sendInitialState(panelContext, this.themeKind);
        return;
      }

      case "selectionChanged": {
        this.registry.updateSelection(panelContext.panel, message.ids);
        return;
      }

      case "copySelectedIds": {
        if (message.ids.length > 0) {
          await vscode.env.clipboard.writeText(message.ids.join("\n"));
        }

        return;
      }

      case "editSource": {
        await this.openSource(panelContext.document, message.line, panelContext.panel.viewColumn);
      }
    }
  }

  async resolveRepositoryContext(
    uri: vscode.Uri
  ): Promise<RepositoryContext | undefined> {
    if (uri.scheme !== "file") {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const repositoryRoot = await findRepositoryRoot(
      uri.fsPath,
      workspaceFolder?.uri.fsPath,
      async (candidate) => {
        try {
          await fs.access(candidate);
          return true;
        } catch {
          return false;
        }
      }
    );
    const configResult = await loadLiveSpecConfig(repositoryRoot);

    return {
      repositoryRoot,
      config: configResult.config
    };
  }

  private async closeTextTabsForUri(uri: vscode.Uri): Promise<void> {
    const uriKey = uri.toString();
    const tabsToClose = vscode.window.tabGroups.all.flatMap((group) =>
      group.tabs.filter(
        (tab) =>
          tab.input instanceof vscode.TabInputText &&
          tab.input.uri.toString() === uriKey
      )
    );

    if (tabsToClose.length > 0) {
      await vscode.window.tabGroups.close(tabsToClose, true);
    }
  }

  private async maybeAutoOpen(document: vscode.TextDocument): Promise<void> {
    const uriKey = document.uri.toString();

    if (
      document.uri.scheme !== "file" ||
      document.languageId !== "markdown" ||
      isLiveSpecConfigPath(document.uri.fsPath) ||
      this.registry.hasOpenPanel(document.uri) ||
      this.autoOpenedUris.has(uriKey) ||
      this.autoOpenInFlightUris.has(uriKey)
    ) {
      return;
    }

    const repositoryContext = await this.resolveRepositoryContext(document.uri);

    if (
      repositoryContext === undefined ||
      !matchesLiveSpecFile(
        document.uri.fsPath,
        repositoryContext.repositoryRoot,
        repositoryContext.config
      )
    ) {
      return;
    }

    this.autoOpenInFlightUris.add(uriKey);

    try {
      await vscode.commands.executeCommand("vscode.openWith", document.uri, LIVE_SPEC_VIEW_TYPE, {
        preview: false,
        viewColumn: vscode.window.activeTextEditor?.viewColumn
      });
      await this.closeTextTabsForUri(document.uri);
      this.autoOpenedUris.add(uriKey);
    } finally {
      this.autoOpenInFlightUris.delete(uriKey);
    }
  }

  private async handleConfigChange(document: vscode.TextDocument): Promise<void> {
    const repositoryRoot = path.dirname(path.dirname(document.uri.fsPath));
    const configResult = await loadLiveSpecConfig(repositoryRoot);

    this.registry.broadcastConfig(repositoryRoot, configResult.config);

    for (const editor of vscode.window.visibleTextEditors) {
      await this.maybeAutoOpen(editor.document);
    }
  }

  private async openSource(
    document: vscode.TextDocument,
    line: number,
    viewColumn: vscode.ViewColumn | undefined
  ): Promise<void> {
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
      ...(viewColumn === undefined ? {} : { viewColumn })
    });
    const targetLine = Math.max(0, line - 1);
    const position = new vscode.Position(targetLine, 0);
    const range = new vscode.Range(position, position);

    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  const extension = new LiveSpecExtension(context);
  await extension.activate();
};

export const deactivate = (): void => {};
