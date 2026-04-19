import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SPEC_ROOT_DIR,
  defaultLiveSpecConfig,
  loadLiveSpecConfig,
  normalizeSpecRootDir,
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

  it("accepts a valid config with a repository-specific root directory", async () => {
    const repositoryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "livespec-config-valid-")
    );
    tempDirectories.push(repositoryRoot);
    await fs.mkdir(path.join(repositoryRoot, ".livespec"));
    await fs.writeFile(
      path.join(repositoryRoot, ".livespec", "config.json"),
      JSON.stringify({ version: 1, specRootDir: "docs/specs" }, null, 2),
      "utf8"
    );

    const result = await loadLiveSpecConfig(repositoryRoot);

    expect(result.loadedFromDisk).toBe(true);
    expect(result.config).toEqual({
      version: 1,
      specRootDir: "docs/specs"
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
    expect(result.config.specRootDir).toBe(DEFAULT_SPEC_ROOT_DIR);
    expect(result.error).toBeTruthy();
  });

  it("falls back to the default root directory when specRootDir is invalid", () => {
    expect(resolveLiveSpecConfig({ version: 1, specRootDir: "../specs" })).toEqual({
      version: 1,
      specRootDir: DEFAULT_SPEC_ROOT_DIR
    });
  });

  it.each([
    "/abs/path",
    "..",
    "../foo",
    "",
    "   ",
    42,
    false,
    null,
    {}
  ])("normalizes unsupported specRootDir value %j to the default root", (input) => {
    expect(normalizeSpecRootDir(input)).toBe(DEFAULT_SPEC_ROOT_DIR);
  });

  it("requires a top-level version field when parsing config text", () => {
    expect(() => parseLiveSpecConfigText(JSON.stringify({}))).toThrow();
  });

  it("fills in the default root spec directory when the override is omitted", () => {
    expect(resolveLiveSpecConfig({ version: 1 })).toEqual({
      version: 1,
      specRootDir: DEFAULT_SPEC_ROOT_DIR
    });
  });

  it("normalizes supported specRootDir values", () => {
    expect(normalizeSpecRootDir("docs\\specs\\")).toBe("docs/specs");
    expect(normalizeSpecRootDir("./specs")).toBe("specs");
    expect(normalizeSpecRootDir(".")).toBe(".");
  });
});
