import * as vscode from "vscode";
import { COMMAND_IDS } from "./constants.js";
import {
  LiveSpecSpecIndex,
  type LiveSpecSpecEntry,
  type LiveSpecSpecIndexSnapshot,
  type LiveSpecSpecRepository
} from "./specIndex.js";

type LiveSpecTreeContainerNode =
  | LiveSpecTreeRepositoryNode
  | LiveSpecTreeFolderNode;

interface LiveSpecTreeNodeBase {
  id: string;
  label: string;
  parent?: LiveSpecTreeContainerNode;
}

export interface LiveSpecTreeRepositoryNode extends LiveSpecTreeNodeBase {
  kind: "repository";
  repository: LiveSpecSpecRepository;
  children: LiveSpecTreeNode[];
}

export interface LiveSpecTreeFolderNode extends LiveSpecTreeNodeBase {
  kind: "folder";
  children: LiveSpecTreeNode[];
}

export interface LiveSpecTreeFileNode extends LiveSpecTreeNodeBase {
  kind: "file";
  entry: LiveSpecSpecEntry;
}

export type LiveSpecTreeNode =
  | LiveSpecTreeRepositoryNode
  | LiveSpecTreeFolderNode
  | LiveSpecTreeFileNode;

interface LiveSpecTreeModel {
  rootNodes: LiveSpecTreeNode[];
  fileNodesByUri: Map<string, LiveSpecTreeFileNode>;
}

const compareByLabel = (left: LiveSpecTreeNode, right: LiveSpecTreeNode): number => {
  if (left.kind !== right.kind) {
    return left.kind === "file" ? 1 : -1;
  }

  return left.label.localeCompare(right.label, undefined, {
    sensitivity: "base"
  });
};

const sortTreeChildren = (nodes: LiveSpecTreeNode[]): void => {
  nodes.sort(compareByLabel);

  for (const node of nodes) {
    if (node.kind !== "file") {
      sortTreeChildren(node.children);
    }
  }
};

export const buildLiveSpecTreeModel = (
  snapshot: LiveSpecSpecIndexSnapshot
): LiveSpecTreeModel => {
  const rootNodes: LiveSpecTreeNode[] = [];
  const fileNodesByUri = new Map<string, LiveSpecTreeFileNode>();
  const useRepositoryRoots = snapshot.repositories.length > 1;

  for (const repository of snapshot.repositories) {
    const repositoryNode: LiveSpecTreeRepositoryNode | undefined = useRepositoryRoots
      ? {
        kind: "repository",
        id: repository.id,
        label: repository.repositoryName,
        repository,
        children: []
      }
      : undefined;
    const folderMap = new Map<string, LiveSpecTreeFolderNode>();
    const topLevelChildren = repositoryNode?.children ?? rootNodes;

    if (repositoryNode !== undefined) {
      rootNodes.push(repositoryNode);
    }

    for (const entry of repository.entries) {
      let parent: LiveSpecTreeContainerNode | undefined = repositoryNode;
      let children = topLevelChildren;
      let folderKey = "";

      for (const folderSegment of entry.folderSegments) {
        folderKey = folderKey.length === 0 ? folderSegment : `${folderKey}/${folderSegment}`;
        const existingFolder = folderMap.get(folderKey);

        if (existingFolder !== undefined) {
          parent = existingFolder;
          children = existingFolder.children;
          continue;
        }

        const nextFolder: LiveSpecTreeFolderNode = {
          kind: "folder",
          id: `${repository.id}::folder::${folderKey}`,
          label: folderSegment,
          ...(parent === undefined ? {} : { parent }),
          children: []
        };

        folderMap.set(folderKey, nextFolder);
        children.push(nextFolder);
        parent = nextFolder;
        children = nextFolder.children;
      }

      const fileNode: LiveSpecTreeFileNode = {
        kind: "file",
        id: entry.id,
        label: entry.fileName,
        ...(parent === undefined ? {} : { parent }),
        entry
      };

      children.push(fileNode);
      fileNodesByUri.set(entry.uri.toString(), fileNode);
    }
  }

  sortTreeChildren(rootNodes);

  return {
    rootNodes,
    fileNodesByUri
  };
};

export class LiveSpecTreeDataProvider implements vscode.TreeDataProvider<LiveSpecTreeNode> {
  private readonly didChangeTreeDataEmitter = new vscode.EventEmitter<
    LiveSpecTreeNode | undefined
  >();
  private treeModel: LiveSpecTreeModel = buildLiveSpecTreeModel({
    repositories: [],
    entries: []
  });

  readonly onDidChangeTreeData = this.didChangeTreeDataEmitter.event;

  constructor(private readonly specIndex: LiveSpecSpecIndex) { }

  getSnapshot(): LiveSpecSpecIndexSnapshot {
    return this.specIndex.getSnapshot();
  }

  async refresh(): Promise<void> {
    const snapshot = await this.specIndex.refresh();

    this.treeModel = buildLiveSpecTreeModel(snapshot);
    this.didChangeTreeDataEmitter.fire(undefined);
  }

  dispose(): void {
    this.didChangeTreeDataEmitter.dispose();
  }

  hasEntries(): boolean {
    return this.treeModel.rootNodes.length > 0;
  }

  findNodeForUri(uri: vscode.Uri): LiveSpecTreeFileNode | undefined {
    return this.treeModel.fileNodesByUri.get(uri.toString());
  }

  getTreeItem(element: LiveSpecTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case "repository": {
        const item = new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.Expanded
        );
        const description =
          element.repository.repositoryName === element.repository.workspaceFolderName
            ? undefined
            : element.repository.workspaceFolderName;

        if (description !== undefined) {
          item.description = description;
        }

        item.contextValue = "livespec.repository";

        return item;
      }

      case "folder": {
        const item = new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.Collapsed
        );

        item.contextValue = "livespec.folder";

        return item;
      }

      case "file": {
        const item = new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.None
        );

        item.contextValue = "livespec.spec";
        item.resourceUri = element.entry.uri;
        item.command = {
          command: COMMAND_IDS.openSpec,
          title: "Open Spec",
          arguments: [element.entry]
        };

        return item;
      }
    }
  }

  getChildren(element?: LiveSpecTreeNode): LiveSpecTreeNode[] {
    if (element === undefined) {
      return this.treeModel.rootNodes;
    }

    return element.kind === "file" ? [] : element.children;
  }

  getParent(element: LiveSpecTreeNode): LiveSpecTreeNode | undefined {
    return element.parent;
  }
}
