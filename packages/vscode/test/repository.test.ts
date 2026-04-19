import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLiveSpecConfig } from "@livespec/core";
import {
  findRepositoryRoot,
  getRelativeSpecPath,
  matchesLiveSpecFile
} from "../src/repository.js";

const fixturePath = (...segments: string[]): string =>
  path.join(import.meta.dirname, "fixtures", ...segments);

const pathExists = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

describe("repository-aware matching", () => {
  it("uses the containing repository override to decide which markdown files belong to the spec root", async () => {
    const repoRoot = fixturePath("repo-a");
    const matchingFile = fixturePath("repo-a", "docs", "specs", "alpha", "spec.md");
    const nonMatchingFile = fixturePath("repo-a", "specs", "alpha", "ignored.md");
    const repositoryRoot = await findRepositoryRoot(matchingFile, repoRoot, pathExists);
    const config = (await loadLiveSpecConfig(repositoryRoot)).config;

    expect(repositoryRoot).toBe(repoRoot);
    expect(matchesLiveSpecFile(matchingFile, repositoryRoot, config)).toBe(true);
    expect(matchesLiveSpecFile(nonMatchingFile, repositoryRoot, config)).toBe(false);
    expect(getRelativeSpecPath(matchingFile, repositoryRoot, config)).toBe("alpha/spec.md");
  });

  it("falls back to the default spec root directory when the repository has no override", async () => {
    const repoRoot = fixturePath("repo-b");
    const matchingFile = fixturePath("repo-b", "specs", "beta", "spec.md");
    const nonMatchingFile = fixturePath("repo-b", "docs", "readme.md");
    const repositoryRoot = await findRepositoryRoot(matchingFile, repoRoot, pathExists);
    const config = (await loadLiveSpecConfig(repositoryRoot)).config;

    expect(matchesLiveSpecFile(matchingFile, repositoryRoot, config)).toBe(true);
    expect(matchesLiveSpecFile(nonMatchingFile, repositoryRoot, config)).toBe(false);
    expect(getRelativeSpecPath(matchingFile, repositoryRoot, config)).toBe("beta/spec.md");
  });

  it("treats repo-root markdown as spec files when specRootDir is '.'", () => {
    const repositoryRoot = "/workspace";
    const config = {
      version: 1,
      specRootDir: "."
    };

    expect(matchesLiveSpecFile("/workspace/spec.md", repositoryRoot, config)).toBe(true);
    expect(getRelativeSpecPath("/workspace/spec.md", repositoryRoot, config)).toBe(
      "spec.md"
    );
  });
});
