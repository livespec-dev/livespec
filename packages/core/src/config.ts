import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_CONFIG_VERSION = 1;
export const DEFAULT_SPEC_ROOT_DIR = "specs";

const configSchema = z.object({
  version: z.number().int().positive(),
  specRootDir: z.unknown().optional()
});

export interface LiveSpecConfig {
  version: number;
  specRootDir: string;
}

export interface LoadLiveSpecConfigResult {
  config: LiveSpecConfig;
  configPath: string;
  loadedFromDisk: boolean;
  error?: string;
}

export const defaultLiveSpecConfig = (): LiveSpecConfig => ({
  version: DEFAULT_CONFIG_VERSION,
  specRootDir: DEFAULT_SPEC_ROOT_DIR
});

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

export const normalizeSpecRootDir = (input: unknown): string => {
  if (typeof input !== "string") {
    return DEFAULT_SPEC_ROOT_DIR;
  }

  const trimmed = normalizePath(input.trim());

  if (trimmed.length === 0) {
    return DEFAULT_SPEC_ROOT_DIR;
  }

  const normalized = path.posix.normalize(trimmed);

  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return DEFAULT_SPEC_ROOT_DIR;
  }

  return normalized !== "." && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
};

export const resolveLiveSpecConfig = (input: unknown): LiveSpecConfig => {
  const parsed = configSchema.parse(input);

  return {
    version: parsed.version,
    specRootDir: normalizeSpecRootDir(parsed.specRootDir)
  };
};

export const parseLiveSpecConfigText = (text: string): LiveSpecConfig =>
  resolveLiveSpecConfig(JSON.parse(text));

export const getLiveSpecConfigPath = (repositoryRoot: string): string =>
  path.join(repositoryRoot, ".livespec", "config.json");

export const loadLiveSpecConfig = async (
  repositoryRoot: string
): Promise<LoadLiveSpecConfigResult> => {
  const configPath = getLiveSpecConfigPath(repositoryRoot);

  try {
    const configText = await fs.readFile(configPath, "utf8");

    return {
      config: parseLiveSpecConfigText(configText),
      configPath,
      loadedFromDisk: true
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        config: defaultLiveSpecConfig(),
        configPath,
        loadedFromDisk: false
      };
    }

    return {
      config: defaultLiveSpecConfig(),
      configPath,
      loadedFromDisk: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
