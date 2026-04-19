import { describe, expect, it, vi } from "vitest";
import { buildLiveSpecTreeModel, LiveSpecTreeDataProvider } from "../src/specTree.js";

vi.mock("vscode", () => ({
  EventEmitter: class {
    readonly event = vi.fn();
    readonly fire = vi.fn();
    dispose() { }
  },
  TreeItem: class {
    command?: unknown;
    contextValue?: string;
    description?: string;
    resourceUri?: unknown;

    constructor(
      public readonly label: string,
      public readonly collapsibleState: number
    ) { }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  }
}));

const createUri = (fsPath: string) => ({
  scheme: "file",
  fsPath,
  path: fsPath,
  toString: () => `file://${fsPath}`
});

describe("buildLiveSpecTreeModel", () => {
  it("builds folder and file nodes without a repository wrapper for a single repository", () => {
    const model = buildLiveSpecTreeModel({
      repositories: [
        {
          id: "/workspace",
          repositoryRoot: "/workspace",
          repositoryName: "workspace",
          workspaceFolderName: "workspace",
          specRootDir: "specs",
          entries: [
            {
              id: "alpha",
              uri: createUri("/workspace/specs/alpha/spec.md") as never,
              repositoryRoot: "/workspace",
              repositoryName: "workspace",
              workspaceFolderName: "workspace",
              specRootDir: "specs",
              relativePath: "alpha/spec.md",
              fileName: "spec.md",
              folderSegments: ["alpha"]
            }
          ]
        }
      ],
      entries: []
    });

    expect(model.rootNodes).toHaveLength(1);
    expect(model.rootNodes[0]).toMatchObject({
      kind: "folder",
      label: "alpha"
    });
    expect((model.rootNodes[0] as { children: Array<{ kind: string; label: string }> }).children).toEqual([
      expect.objectContaining({
        kind: "file",
        label: "spec.md"
      })
    ]);
  });

  it("adds repository wrapper nodes for multi-root workspaces", () => {
    const model = buildLiveSpecTreeModel({
      repositories: [
        {
          id: "/repo-a",
          repositoryRoot: "/repo-a",
          repositoryName: "repo-a",
          workspaceFolderName: "repo-a",
          specRootDir: "specs",
          entries: [
            {
              id: "repo-a::alpha",
              uri: createUri("/repo-a/specs/alpha/spec.md") as never,
              repositoryRoot: "/repo-a",
              repositoryName: "repo-a",
              workspaceFolderName: "repo-a",
              specRootDir: "specs",
              relativePath: "alpha/spec.md",
              fileName: "spec.md",
              folderSegments: ["alpha"]
            }
          ]
        },
        {
          id: "/repo-b",
          repositoryRoot: "/repo-b",
          repositoryName: "repo-b",
          workspaceFolderName: "repo-b",
          specRootDir: "specs",
          entries: [
            {
              id: "repo-b::beta",
              uri: createUri("/repo-b/specs/beta/spec.md") as never,
              repositoryRoot: "/repo-b",
              repositoryName: "repo-b",
              workspaceFolderName: "repo-b",
              specRootDir: "specs",
              relativePath: "beta/spec.md",
              fileName: "spec.md",
              folderSegments: ["beta"]
            }
          ]
        }
      ],
      entries: []
    });

    expect(model.rootNodes.map((node) => node.label)).toEqual(["repo-a", "repo-b"]);
    expect(model.rootNodes.every((node) => node.kind === "repository")).toBe(true);
  });

  it("omits duplicate file descriptions for spec leaf nodes", async () => {
    const entry = {
      id: "alpha",
      uri: createUri("/workspace/specs/alpha/spec.md") as never,
      repositoryRoot: "/workspace",
      repositoryName: "workspace",
      workspaceFolderName: "workspace",
      specRootDir: "specs",
      relativePath: "alpha/spec.md",
      fileName: "spec.md",
      folderSegments: ["alpha"]
    };
    const snapshot = {
      repositories: [
        {
          id: "/workspace",
          repositoryRoot: "/workspace",
          repositoryName: "workspace",
          workspaceFolderName: "workspace",
          specRootDir: "specs",
          entries: [entry]
        }
      ],
      entries: [entry]
    };
    const provider = new LiveSpecTreeDataProvider({
      getSnapshot: () => snapshot,
      refresh: vi.fn().mockResolvedValue(snapshot)
    } as never);

    await provider.refresh();

    const [folderNode] = provider.getChildren();
    const [fileNode] = provider.getChildren(folderNode);
    const item = provider.getTreeItem(fileNode);

    expect(item.description).toBeUndefined();
  });
});
