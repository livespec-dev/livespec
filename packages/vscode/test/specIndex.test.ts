import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadLiveSpecConfig } from "@livespec/core";
import { findRepositoryRoot } from "../src/repository.js";
import { LiveSpecSpecIndex } from "../src/specIndex.js";

vi.mock("vscode", () => ({
  workspace: {
    findFiles: vi.fn(),
    getWorkspaceFolder: vi.fn()
  }
}));

const fixturePath = (...segments: string[]): string =>
  path.join(import.meta.dirname, "fixtures", ...segments);

const createUri = (fsPath: string) => ({
  scheme: "file",
  fsPath,
  path: fsPath,
  toString: () => `file://${fsPath}`
});

const pathExists = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

describe("LiveSpecSpecIndex", () => {
  it("discovers specs using the effective root spec directory for each repository", async () => {
    const repoA = fixturePath("repo-a");
    const repoB = fixturePath("repo-b");
    const repoAEntry = createUri(fixturePath("repo-a", "docs", "specs", "alpha", "spec.md"));
    const repoAIgnored = createUri(fixturePath("repo-a", "specs", "alpha", "ignored.md"));
    const repoBEntry = createUri(fixturePath("repo-b", "specs", "beta", "spec.md"));
    const repoBIgnored = createUri(fixturePath("repo-b", "docs", "readme.md"));

    const index = new LiveSpecSpecIndex({
      findMarkdownFiles: async () => [repoAEntry as never, repoAIgnored as never, repoBEntry as never, repoBIgnored as never],
      getWorkspaceFolder: (uri) => {
        if (uri.fsPath.startsWith(repoA)) {
          return {
            name: "repo-a",
            uri: createUri(repoA) as never
          };
        }

        if (uri.fsPath.startsWith(repoB)) {
          return {
            name: "repo-b",
            uri: createUri(repoB) as never
          };
        }

        return undefined;
      },
      loadConfig: loadLiveSpecConfig,
      findRepositoryRoot,
      pathExists
    });

    const snapshot = await index.refresh();

    expect(snapshot.entries.map((entry) => entry.relativePath)).toEqual([
      "alpha/spec.md",
      "beta/spec.md"
    ]);
    expect(snapshot.entries.map((entry) => entry.specRootDir)).toEqual([
      "docs/specs",
      "specs"
    ]);
    expect(snapshot.repositories.map((repository) => repository.repositoryName)).toEqual([
      "repo-a",
      "repo-b"
    ]);
  });

  it("memoizes repository root lookups across sibling markdown files", async () => {
    const repositoryRoot = "/workspace";
    const workspaceFolder = {
      name: "workspace",
      uri: createUri(repositoryRoot) as never
    };
    const findRepositoryRootMock = vi.fn(async () => repositoryRoot);
    const loadConfigMock = vi.fn(async () => ({
      config: {
        version: 1,
        specRootDir: "specs"
      },
      configPath: `${repositoryRoot}/.livespec/config.json`,
      loadedFromDisk: false
    }));
    const index = new LiveSpecSpecIndex({
      findMarkdownFiles: async () => [
        createUri("/workspace/specs/alpha/spec.md") as never,
        createUri("/workspace/specs/beta/spec.md") as never,
        createUri("/workspace/specs/beta/nested/spec.md") as never
      ],
      getWorkspaceFolder: () => workspaceFolder,
      loadConfig: loadConfigMock,
      findRepositoryRoot: findRepositoryRootMock,
      pathExists: vi.fn(async () => true)
    });

    await index.refresh();

    expect(findRepositoryRootMock).toHaveBeenCalledTimes(1);
    expect(loadConfigMock).toHaveBeenCalledTimes(1);
  });
});
