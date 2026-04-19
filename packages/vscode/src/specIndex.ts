import { access } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import {
  loadLiveSpecConfig,
  type LiveSpecConfig,
  type LoadLiveSpecConfigResult
} from "@livespec/core";
import { findRepositoryRoot, getRelativeSpecPath } from "./repository.js";

export interface LiveSpecSpecEntry {
  id: string;
  uri: vscode.Uri;
  repositoryRoot: string;
  repositoryName: string;
  workspaceFolderName: string;
  specRootDir: string;
  relativePath: string;
  fileName: string;
  folderSegments: string[];
}

export interface LiveSpecSpecRepository {
  id: string;
  repositoryRoot: string;
  repositoryName: string;
  workspaceFolderName: string;
  specRootDir: string;
  entries: LiveSpecSpecEntry[];
}

export interface LiveSpecSpecIndexSnapshot {
  repositories: LiveSpecSpecRepository[];
  entries: LiveSpecSpecEntry[];
}

interface WorkspaceFolderLike {
  name: string;
  uri: vscode.Uri;
}

interface LiveSpecSpecIndexDependencies {
  findMarkdownFiles(): Promise<readonly vscode.Uri[]>;
  getWorkspaceFolder(uri: vscode.Uri): WorkspaceFolderLike | undefined;
  loadConfig(repositoryRoot: string): Promise<LoadLiveSpecConfigResult>;
  findRepositoryRoot(
    filePath: string,
    workspaceRoot: string | undefined,
    pathExists: (candidate: string) => Promise<boolean>
  ): Promise<string>;
  pathExists(candidate: string): Promise<boolean>;
}

const compareByText = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

const defaultDependencies: LiveSpecSpecIndexDependencies = {
  findMarkdownFiles: () => Promise.resolve(vscode.workspace.findFiles("**/*.md")),
  getWorkspaceFolder: (uri) => vscode.workspace.getWorkspaceFolder(uri),
  loadConfig: loadLiveSpecConfig,
  findRepositoryRoot,
  pathExists: async (candidate) => {
    try {
      await access(candidate);
      return true;
    } catch {
      return false;
    }
  }
};

const createEmptySnapshot = (): LiveSpecSpecIndexSnapshot => ({
  repositories: [],
  entries: []
});

const resolveRepositoryName = (
  repositoryRoot: string,
  workspaceFolder: WorkspaceFolderLike
): string =>
  path.resolve(repositoryRoot) === path.resolve(workspaceFolder.uri.fsPath)
    ? workspaceFolder.name
    : path.basename(repositoryRoot);

export class LiveSpecSpecIndex {
  private snapshot = createEmptySnapshot();

  constructor(
    private readonly dependencies: LiveSpecSpecIndexDependencies = defaultDependencies
  ) { }

  getSnapshot(): LiveSpecSpecIndexSnapshot {
    return this.snapshot;
  }

  async refresh(): Promise<LiveSpecSpecIndexSnapshot> {
    const markdownFiles = await this.dependencies.findMarkdownFiles();
    const configCache = new Map<string, Promise<LiveSpecConfig>>();
    const repositoryRootCache = new Map<string, Promise<string>>();
    const repositoryMap = new Map<string, LiveSpecSpecRepository>();
    const entryMap = new Map<string, LiveSpecSpecEntry>();

    const getConfig = async (repositoryRoot: string): Promise<LiveSpecConfig> => {
      const existing = configCache.get(repositoryRoot);

      if (existing !== undefined) {
        return existing;
      }

      const loadingConfig = this.dependencies
        .loadConfig(repositoryRoot)
        .then((result) => result.config);

      configCache.set(repositoryRoot, loadingConfig);

      return loadingConfig;
    };

    const getRepositoryRoot = async (
      uri: vscode.Uri,
      workspaceFolder: WorkspaceFolderLike
    ): Promise<string> => {
      const workspaceRoot = path.resolve(workspaceFolder.uri.fsPath);
      let currentDirectory = path.dirname(path.resolve(uri.fsPath));
      const visitedDirectories: string[] = [];

      while (true) {
        const cachedRepositoryRoot = repositoryRootCache.get(currentDirectory);

        if (cachedRepositoryRoot !== undefined) {
          for (const visitedDirectory of visitedDirectories) {
            repositoryRootCache.set(visitedDirectory, cachedRepositoryRoot);
          }

          return cachedRepositoryRoot;
        }

        visitedDirectories.push(currentDirectory);

        if (
          currentDirectory === workspaceRoot ||
          currentDirectory === path.dirname(currentDirectory)
        ) {
          break;
        }

        currentDirectory = path.dirname(currentDirectory);
      }

      const loadingRepositoryRoot = this.dependencies.findRepositoryRoot(
        uri.fsPath,
        workspaceFolder.uri.fsPath,
        this.dependencies.pathExists
      );

      for (const visitedDirectory of visitedDirectories) {
        repositoryRootCache.set(visitedDirectory, loadingRepositoryRoot);
      }

      const repositoryRoot = await loadingRepositoryRoot;
      repositoryRootCache.set(repositoryRoot, Promise.resolve(repositoryRoot));

      return repositoryRoot;
    };

    for (const uri of markdownFiles) {
      if (uri.scheme !== "file") {
        continue;
      }

      const workspaceFolder = this.dependencies.getWorkspaceFolder(uri);

      if (workspaceFolder === undefined) {
        continue;
      }

      const repositoryRoot = await getRepositoryRoot(uri, workspaceFolder);
      const config = await getConfig(repositoryRoot);
      const relativePath = getRelativeSpecPath(uri.fsPath, repositoryRoot, config);

      if (relativePath === undefined) {
        continue;
      }

      const normalizedRelativePath = relativePath.split(path.sep).join("/");
      const entryId = `${repositoryRoot}::${normalizedRelativePath}`;
      const fileName = path.posix.basename(normalizedRelativePath);
      const folderSegments = normalizedRelativePath.split("/").slice(0, -1);
      const repositoryName = resolveRepositoryName(repositoryRoot, workspaceFolder);
      const entry: LiveSpecSpecEntry = {
        id: entryId,
        uri,
        repositoryRoot,
        repositoryName,
        workspaceFolderName: workspaceFolder.name,
        specRootDir: config.specRootDir,
        relativePath: normalizedRelativePath,
        fileName,
        folderSegments
      };

      entryMap.set(entryId, entry);

      const repository =
        repositoryMap.get(repositoryRoot) ??
        (() => {
          const nextRepository: LiveSpecSpecRepository = {
            id: repositoryRoot,
            repositoryRoot,
            repositoryName,
            workspaceFolderName: workspaceFolder.name,
            specRootDir: config.specRootDir,
            entries: []
          };
          repositoryMap.set(repositoryRoot, nextRepository);

          return nextRepository;
        })();

      repository.entries.push(entry);
    }

    const entries = [...entryMap.values()].sort(
      (left, right) =>
        compareByText(left.fileName, right.fileName) ||
        compareByText(left.relativePath, right.relativePath) ||
        compareByText(left.repositoryRoot, right.repositoryRoot)
    );
    const repositories = [...repositoryMap.values()]
      .map((repository) => ({
        ...repository,
        entries: [...repository.entries].sort(
          (left, right) => compareByText(left.relativePath, right.relativePath)
        )
      }))
      .sort(
        (left, right) =>
          compareByText(left.repositoryName, right.repositoryName) ||
          compareByText(left.repositoryRoot, right.repositoryRoot)
      );

    this.snapshot = {
      repositories,
      entries
    };

    return this.snapshot;
  }
}
