import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLiveSpecConfig } from "@livespec/core";
import { findRepositoryRoot, matchesLiveSpecFile } from "../src/repository.js";

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
  it("uses the containing repository override to decide which markdown files auto-open in LiveSpec", async () => {
    const repoRoot = fixturePath("repo-a");
    const matchingFile = fixturePath("repo-a", "docs", "specs", "alpha", "spec.md");
    const nonMatchingFile = fixturePath("repo-a", "specs", "alpha", "ignored.md");
    const repositoryRoot = await findRepositoryRoot(matchingFile, undefined, pathExists);
    const config = (await loadLiveSpecConfig(repositoryRoot)).config;

    expect(repositoryRoot).toBe(repoRoot);
    expect(matchesLiveSpecFile(matchingFile, repositoryRoot, config)).toBe(true);
    expect(matchesLiveSpecFile(nonMatchingFile, repositoryRoot, config)).toBe(false);
  });

  it("falls back to the default spec-file glob when the repository has no override", async () => {
    const matchingFile = fixturePath("repo-b", "specs", "beta", "spec.md");
    const nonMatchingFile = fixturePath("repo-b", "docs", "readme.md");
    const repositoryRoot = await findRepositoryRoot(matchingFile, undefined, pathExists);
    const config = (await loadLiveSpecConfig(repositoryRoot)).config;

    expect(matchesLiveSpecFile(matchingFile, repositoryRoot, config)).toBe(true);
    expect(matchesLiveSpecFile(nonMatchingFile, repositoryRoot, config)).toBe(false);
  });
});
