// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HostToWebviewMessage,
  PersistedWebviewState,
  WebviewToHostMessage
} from "../src/protocol.js";
import type { WebviewBridge } from "../webview/src/bridge.js";

const browserMock = vi.hoisted(() => ({
  parseLiveSpecDocument: vi.fn()
}));

vi.mock("@livespec/core/browser", async () => {
  const actual =
    await vi.importActual<typeof import("@livespec/core/browser")>(
      "@livespec/core/browser"
    );

  return {
    ...actual,
    parseLiveSpecDocument: browserMock.parseLiveSpecDocument
  };
});

class FakeBridge implements WebviewBridge {
  postedMessages: WebviewToHostMessage[] = [];
  state: PersistedWebviewState | undefined;
  listeners = new Set<(message: HostToWebviewMessage) => void>();

  postMessage(message: WebviewToHostMessage): void {
    this.postedMessages.push(message);
  }

  getState(): PersistedWebviewState | undefined {
    return this.state;
  }

  setState(state: PersistedWebviewState): void {
    this.state = state;
  }

  onMessage(listener: (message: HostToWebviewMessage) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(message: HostToWebviewMessage): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}

describe("LiveSpecApp degraded state", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    browserMock.parseLiveSpecDocument.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the degraded parsing state and routes Edit Source to the top of the file", async () => {
    browserMock.parseLiveSpecDocument.mockReturnValue({
      ok: false,
      document: {
        sourceUri: "file:///specs/broken.md",
        text: "# Broken",
        trackedItems: [],
        progress: {
          total: 0,
          complete: 0,
          remaining: 0
        },
        isEmpty: false
      },
      error: new Error("parse failed")
    });

    const { LiveSpecApp } = await import("../webview/src/LiveSpecApp.js");
    const bridge = new FakeBridge();

    render(
      <LiveSpecApp bridge={bridge} fileName="broken.md" initialThemeKind="light" />
    );

    act(() => {
      bridge.emit({
        type: "documentUpdated",
        text: "# Broken",
        version: 1
      });
    });

    expect(
      await screen.findByText("Unable to render this document")
    ).toBeInTheDocument();
    expect(screen.getByText("parse failed")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit Source" })[1]!);

    expect(bridge.postedMessages).toContainEqual({
      type: "editSource",
      line: 1
    });
  });
});
