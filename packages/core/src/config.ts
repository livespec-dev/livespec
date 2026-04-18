import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_CONFIG_VERSION = 1;
export const DEFAULT_SPEC_FILE_GLOB = "**/specs/**/*.md";

const configSchema = z.object({
  version: z.number().int().positive(),
  specFileGlob: z.string().min(1).optional()
});

export interface LiveSpecConfig {
  version: number;
  specFileGlob: string;
}

export interface LoadLiveSpecConfigResult {
  config: LiveSpecConfig;
  configPath: string;
  loadedFromDisk: boolean;
  error?: string;
}

export const defaultLiveSpecConfig = (): LiveSpecConfig => ({
  version: DEFAULT_CONFIG_VERSION,
  specFileGlob: DEFAULT_SPEC_FILE_GLOB
});

export const resolveLiveSpecConfig = (input: unknown): LiveSpecConfig => {
  const parsed = configSchema.parse(input);

  return {
    version: parsed.version,
    specFileGlob: parsed.specFileGlob ?? DEFAULT_SPEC_FILE_GLOB
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
