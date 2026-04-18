import type { LiveSpecConfig } from "@livespec/core";

export type LiveSpecThemeKind =
  | "light"
  | "dark"
  | "high-contrast"
  | "high-contrast-light";

export interface PersistedScrollAnchor {
  runtimeKey?: string;
  line?: number;
}

export interface PersistedWebviewState {
  selectedIds: string[];
  incompleteOnly: boolean;
  scrollAnchor?: PersistedScrollAnchor;
}

export type HostToWebviewMessage =
  | {
      type: "documentUpdated";
      text: string;
      version: number;
    }
  | {
      type: "themeChanged";
      themeKind: LiveSpecThemeKind;
    }
  | {
      type: "configChanged";
      config: LiveSpecConfig;
    }
  | {
      type: "toggleIncompleteOnly";
    }
  | {
      type: "requestCopySelectedIds";
    }
  | {
      type: "requestEditSource";
    };

export type WebviewToHostMessage =
  | {
      type: "copySelectedIds";
      ids: string[];
    }
  | {
      type: "editSource";
      line: number;
    }
  | {
      type: "selectionChanged";
      ids: string[];
    }
  | {
      type: "ready";
    };
