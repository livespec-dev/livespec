import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SPEC_FILE_GLOB,
  defaultLiveSpecConfig,
  loadLiveSpecConfig,
  parseLiveSpecConfigText,
  resolveLiveSpecConfig
} from "../src/index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("LiveSpec config loading", () => {
  it("falls back to defaults when the config file is missing", async () => {
    const repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "livespec-config-missing-")
    );
    tempDirectories.push(repositoryRoot);

    const result = await loadLiveSpecConfig(repositoryRoot);

    expect(result.loadedFromDisk).toBe(false);
    expect(result.config).toEqual(defaultLiveSpecConfig());
  });

  it("accepts a valid config with a repository-specific glob", async () => {
    const repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "livespec-config-valid-")
    );
    tempDirectories.push(repositoryRoot);
    await fs.mkdir(path.join(repositoryRoot, ".livespec"));
    await fs.writeFile(
      path.join(repositoryRoot, ".livespec", "config.json"),
      JSON.stringify({ version: 1, specFileGlob: "docs/specs/*.md" }, null, 2),
      "utf8"
    );

    const result = await loadLiveSpecConfig(repositoryRoot);

    expect(result.loadedFromDisk).toBe(true);
    expect(result.config).toEqual({
      version: 1,
      specFileGlob: "docs/specs/*.md"
    });
  });

  it("falls back safely when the config is malformed", async () => {
    const repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "livespec-config-invalid-")
    );
    tempDirectories.push(repositoryRoot);
    await fs.mkdir(path.join(repositoryRoot, ".livespec"));
    await fs.writeFile(
      path.join(repositoryRoot, ".livespec", "config.json"),
      "{ invalid json",
      "utf8"
    );

    const result = await loadLiveSpecConfig(repositoryRoot);

    expect(result.loadedFromDisk).toBe(false);
    expect(result.config.specFileGlob).toBe(DEFAULT_SPEC_FILE_GLOB);
    expect(result.error).toBeTruthy();
  });

  it("requires a top-level version field when parsing config text", () => {
    expect(() => parseLiveSpecConfigText(JSON.stringify({}))).toThrow();
  });

  it("fills in the default spec-file glob when the override is omitted", () => {
    expect(resolveLiveSpecConfig({ version: 1 })).toEqual({
      version: 1,
      specFileGlob: DEFAULT_SPEC_FILE_GLOB
    });
  });
});
