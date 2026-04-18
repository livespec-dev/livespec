import type {
  HostToWebviewMessage,
  PersistedWebviewState,
  WebviewToHostMessage
} from "../../src/protocol.js";

interface VsCodeApiLike {
  postMessage(message: WebviewToHostMessage): void;
  getState(): PersistedWebviewState | undefined;
  setState(state: PersistedWebviewState): void;
}

export interface WebviewBridge {
  postMessage(message: WebviewToHostMessage): void;
  getState(): PersistedWebviewState | undefined;
  setState(state: PersistedWebviewState): void;
  onMessage(listener: (message: HostToWebviewMessage) => void): () => void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApiLike;
}

export const createWebviewBridge = (): WebviewBridge => {
  const vscodeApi = acquireVsCodeApi();

  return {
    postMessage(message) {
      vscodeApi.postMessage(message);
    },
    getState() {
      return vscodeApi.getState();
    },
    setState(state) {
      vscodeApi.setState(state);
    },
    onMessage(listener) {
      const handleMessage = (event: MessageEvent<HostToWebviewMessage>) => {
        listener(event.data);
      };

      window.addEventListener("message", handleMessage);

      return () => {
        window.removeEventListener("message", handleMessage);
      };
    }
  };
};
