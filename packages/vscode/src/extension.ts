import { promises as fs } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { defaultLiveSpecConfig, loadLiveSpecConfig } from "@livespec/core";
import {
  COMMAND_IDS,
  LIVE_SPEC_TREE_VIEW_ID,
  LIVE_SPEC_VIEW_TYPE
} from "./constants.js";
import { LiveSpecPanelRegistry, type LiveSpecPanelContext } from "./documentSync.js";
import type { LiveSpecThemeKind, WebviewToHostMessage } from "./protocol.js";
import { findRepositoryRoot, isLiveSpecConfigPath } from "./repository.js";
import { type LiveSpecSpecEntry, LiveSpecSpecIndex } from "./specIndex.js";
import {
  type LiveSpecTreeFileNode,
  type LiveSpecTreeNode,
  LiveSpecTreeDataProvider
} from "./specTree.js";
import {
  buildLiveSpecWebviewHtml,
  getWebviewLocalResourceRoots
} from "./webviewHtml.js";

interface RepositoryContext {
  repositoryRoot: string;
  config: ReturnType<typeof defaultLiveSpecConfig>;
}

interface LiveSpecQuickPickItem extends vscode.QuickPickItem {
  entry: LiveSpecSpecEntry;
}

class LiveSpecEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extension: LiveSpecExtension) { }

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
  readonly specIndex = new LiveSpecSpecIndex();
  readonly treeProvider = new LiveSpecTreeDataProvider(this.specIndex);
  treeView: vscode.TreeView<LiveSpecTreeNode> | undefined;

  constructor(readonly context: vscode.ExtensionContext) { }

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
    this.treeView = vscode.window.createTreeView(LIVE_SPEC_TREE_VIEW_ID, {
      treeDataProvider: this.treeProvider,
      showCollapseAll: true
    });

    const markdownWatcher = this.registerMarkdownTreeRefreshWatcher("**/*.md");
    const configWatcher = this.registerConfigWatcher("**/.livespec/config.json");

    this.context.subscriptions.push(
      this.treeProvider,
      this.treeView,
      markdownWatcher,
      configWatcher,
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
      vscode.commands.registerCommand(COMMAND_IDS.openSpec, (target?: LiveSpecSpecEntry) => {
        return this.openSpec(target);
      }),
      vscode.commands.registerCommand(COMMAND_IDS.refreshSpecTree, () => {
        return this.refreshSpecTree();
      }),
      vscode.commands.registerCommand(COMMAND_IDS.revealActiveSpec, () => {
        return this.revealActiveSpec();
      }),
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
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.registry.scheduleDocumentSnapshot(event.document);

        if (isLiveSpecConfigPath(event.document.uri.fsPath)) {
          void this.handleConfigChange(event.document);
        }
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.registry.broadcastTheme(this.themeKind);
      })
    );

    await this.refreshSpecTree();
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

  private async handleConfigChange(document: vscode.TextDocument): Promise<void> {
    await this.handleConfigPathChange(document.uri.fsPath);
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

  private async handleConfigPathChange(configPath: string): Promise<void> {
    const repositoryRoot = path.dirname(path.dirname(configPath));
    const configResult = await loadLiveSpecConfig(repositoryRoot);

    this.registry.broadcastConfig(repositoryRoot, configResult.config);
    await this.refreshSpecTree();
  }

  private registerMarkdownTreeRefreshWatcher(globPattern: string): vscode.FileSystemWatcher {
    const watcher = vscode.workspace.createFileSystemWatcher(globPattern);
    const refreshTree = () => {
      void this.refreshSpecTree();
    };

    this.context.subscriptions.push(
      watcher.onDidCreate(refreshTree),
      watcher.onDidDelete(refreshTree)
    );

    return watcher;
  }

  private registerConfigWatcher(globPattern: string): vscode.FileSystemWatcher {
    const watcher = vscode.workspace.createFileSystemWatcher(globPattern);
    const syncConfig = async (uri: vscode.Uri) => {
      await this.handleConfigPathChange(uri.fsPath);
    };

    this.context.subscriptions.push(
      watcher.onDidCreate(syncConfig),
      watcher.onDidChange(syncConfig),
      watcher.onDidDelete(syncConfig)
    );

    return watcher;
  }

  private async refreshSpecTree(): Promise<void> {
    await this.treeProvider.refresh();
    this.updateTreeViewMessage();
  }

  private updateTreeViewMessage(): void {
    if (this.treeView === undefined) {
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

    if (workspaceFolders.length === 0) {
      this.treeView.message = "Open a workspace folder to browse LiveSpec specs.";
      return;
    }

    this.treeView.message = this.treeProvider.hasEntries()
      ? ""
      : "No LiveSpec specs found under the configured root spec directory.";
  }

  private async openSpec(target?: LiveSpecSpecEntry | LiveSpecTreeFileNode): Promise<void> {
    const entry = target === undefined ? await this.pickSpec() : this.resolveSpecTarget(target);

    if (entry === undefined) {
      return;
    }

    const options: {
      preview: boolean;
      viewColumn?: vscode.ViewColumn;
    } = {
      preview: true
    };

    if (vscode.window.activeTextEditor?.viewColumn !== undefined) {
      options.viewColumn = vscode.window.activeTextEditor.viewColumn;
    }

    await vscode.commands.executeCommand(
      "vscode.openWith",
      entry.uri,
      LIVE_SPEC_VIEW_TYPE,
      options
    );
  }

  private async pickSpec(): Promise<LiveSpecSpecEntry | undefined> {
    const snapshot = this.treeProvider.getSnapshot();

    if (snapshot.entries.length === 0) {
      return undefined;
    }

    const quickPickItems: LiveSpecQuickPickItem[] = snapshot.entries.map((entry) => ({
      label: entry.fileName,
      description: entry.relativePath,
      ...(snapshot.repositories.length > 1
        ? { detail: this.getRepositoryDetail(entry) }
        : {}),
      entry
    }));
    const selection = await vscode.window.showQuickPick(quickPickItems, {
      title: "LiveSpec: Open Spec",
      placeHolder: "Search specs by file name or path",
      matchOnDescription: true,
      matchOnDetail: true
    });

    return selection?.entry;
  }

  private resolveSpecTarget(target: LiveSpecSpecEntry | LiveSpecTreeFileNode): LiveSpecSpecEntry {
    return "entry" in target ? target.entry : target;
  }

  private getRepositoryDetail(entry: LiveSpecSpecEntry): string {
    return entry.repositoryName === entry.workspaceFolderName
      ? entry.repositoryName
      : `${entry.repositoryName} (${entry.workspaceFolderName})`;
  }

  private async revealActiveSpec(): Promise<void> {
    if (this.treeView === undefined) {
      return;
    }

    const activeUri =
      this.registry.getActivePanel()?.document.uri ??
      vscode.window.activeTextEditor?.document.uri;

    if (activeUri === undefined) {
      return;
    }

    let node = this.treeProvider.findNodeForUri(activeUri);

    if (node === undefined) {
      await this.refreshSpecTree();
      node = this.treeProvider.findNodeForUri(activeUri);
    }

    if (node !== undefined) {
      await this.treeView.reveal(node, {
        focus: true,
        select: true,
        expand: true
      });
    }
  }
}

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  const extension = new LiveSpecExtension(context);
  await extension.activate();
};

export const deactivate = (): void => { };
