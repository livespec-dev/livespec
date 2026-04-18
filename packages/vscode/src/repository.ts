import path from "node:path";
import { minimatch } from "minimatch";
import type { LiveSpecConfig } from "@livespec/core";

const normalizePath = (value: string): string => value.split(path.sep).join("/");

export const isLiveSpecConfigPath = (filePath: string): boolean =>
  normalizePath(filePath).endsWith("/.livespec/config.json");

export const findRepositoryRoot = async (
  filePath: string,
  workspaceRoot: string | undefined,
  pathExists: (candidate: string) => Promise<boolean>
): Promise<string> => {
  const resolvedFilePath = path.resolve(filePath);
  const rootBoundary = workspaceRoot
    ? path.resolve(workspaceRoot)
    : path.parse(resolvedFilePath).root;
  let currentDirectory = path.dirname(resolvedFilePath);

  while (true) {
    if (
      (await pathExists(path.join(currentDirectory, ".livespec", "config.json"))) ||
      (await pathExists(path.join(currentDirectory, ".git")))
    ) {
      return currentDirectory;
    }

    if (
      currentDirectory === rootBoundary ||
      currentDirectory === path.dirname(currentDirectory)
    ) {
      return workspaceRoot ? path.resolve(workspaceRoot) : path.dirname(resolvedFilePath);
    }

    currentDirectory = path.dirname(currentDirectory);
  }
};

export const matchesLiveSpecFile = (
  filePath: string,
  repositoryRoot: string,
  config: LiveSpecConfig
): boolean => {
  const relativePath = normalizePath(path.relative(repositoryRoot, filePath));

  if (
    relativePath.length === 0 ||
    relativePath.startsWith("../") ||
    relativePath === ".."
  ) {
    return false;
  }

  return minimatch(relativePath, config.specFileGlob, {
    nocase: false,
    windowsPathsNoEscape: true
  });
};
