// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HostToWebviewMessage,
  PersistedWebviewState,
  WebviewToHostMessage
} from "../src/protocol.js";
import { LiveSpecApp } from "../webview/src/LiveSpecApp.js";
import type { WebviewBridge } from "../webview/src/bridge.js";

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

const SPEC_MARKDOWN = `# Example

- [ ] REQ-1 First tracked item
- [x] REQ-2 Completed tracked item
- [ ] REQ-3 Third tracked item
`;

const COMPLETE_ONLY_MARKDOWN = `# Complete

- [x] REQ-9 Finished item
`;

const getMessages = <TType extends WebviewToHostMessage["type"]>(
  bridge: FakeBridge,
  type: TType
): Array<Extract<WebviewToHostMessage, { type: TType }>> =>
  bridge.postedMessages.filter(
    (message): message is Extract<WebviewToHostMessage, { type: TType }> =>
      message.type === type
  );

const renderApp = (bridge: FakeBridge, fileName = "spec.md") => {
  render(<LiveSpecApp bridge={bridge} fileName={fileName} initialThemeKind="light" />);
};

const loadDocument = (bridge: FakeBridge, text = SPEC_MARKDOWN) => {
  act(() => {
    bridge.emit({
      type: "documentUpdated",
      text,
      version: 1
    });
  });
};

const findTrackedItem = (id: string) =>
  screen.findByRole("button", {
    name: new RegExp(id, "i")
  });

describe("LiveSpecApp", () => {
  beforeEach(() => {
    vi.useRealTimers();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("smoke-tests theme changes and pressed-state selection behavior for tracked items", async () => {
    const bridge = new FakeBridge();

    renderApp(bridge);

    await waitFor(() => {
      expect(bridge.postedMessages[0]).toEqual({ type: "ready" });
      expect(document.body.dataset.themeKind).toBe("light");
    });

    loadDocument(bridge);

    const trackedItem = await findTrackedItem("REQ-1");
    expect(trackedItem).toHaveAttribute("aria-pressed", "false");

    trackedItem.focus();
    fireEvent.keyDown(trackedItem, { key: " " });

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1"]
      });
    });
    expect(await findTrackedItem("REQ-1")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Edit Source" }));

    await waitFor(() => {
      expect(bridge.postedMessages).toContainEqual({
        type: "editSource",
        line: 3
      });
    });

    act(() => {
      bridge.emit({
        type: "themeChanged",
        themeKind: "dark"
      });
    });

    await waitFor(() => {
      expect(document.body.dataset.themeKind).toBe("dark");
    });

    act(() => {
      bridge.emit({
        type: "themeChanged",
        themeKind: "high-contrast"
      });
    });

    await waitFor(() => {
      expect(document.body.dataset.themeKind).toBe("high-contrast");
    });
  });

  it("copies selected IDs in selection order", async () => {
    const bridge = new FakeBridge();

    renderApp(bridge);
    loadDocument(bridge);

    fireEvent.click(await findTrackedItem("REQ-1"));

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1"]
      });
    });

    fireEvent.click(await findTrackedItem("REQ-3"), { ctrlKey: true });

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1", "REQ-3"]
      });
    });

    fireEvent.click(await findTrackedItem("REQ-2"), { ctrlKey: true });

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1", "REQ-3", "REQ-2"]
      });
    });

    act(() => {
      bridge.emit({ type: "requestCopySelectedIds" });
    });

    await waitFor(() => {
      expect(getMessages(bridge, "copySelectedIds")).toContainEqual({
        type: "copySelectedIds",
        ids: ["REQ-1", "REQ-3", "REQ-2"]
      });
    });
  });

  it("supports Ctrl+A selection and Escape clearing on visible tracked items", async () => {
    const bridge = new FakeBridge();

    renderApp(bridge);
    loadDocument(bridge);

    const firstItem = await findTrackedItem("REQ-1");
    firstItem.focus();

    fireEvent.keyDown(firstItem, { ctrlKey: true, key: "a" });

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1", "REQ-2", "REQ-3"]
      });
    });

    fireEvent.keyDown(await findTrackedItem("REQ-1"), { key: "Escape" });

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: []
      });
    });
  });

  it("keeps the shift-click anchor on the last explicitly selected item", async () => {
    const bridge = new FakeBridge();

    renderApp(bridge);
    loadDocument(bridge);

    fireEvent.click(await findTrackedItem("REQ-1"));

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1"]
      });
    });

    (await findTrackedItem("REQ-2")).focus();
    fireEvent.click(await findTrackedItem("REQ-3"), { shiftKey: true });

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1", "REQ-2", "REQ-3"]
      });
    });
  });

  it("removes hidden completed items from selection when incomplete-only is enabled", async () => {
    const bridge = new FakeBridge();

    renderApp(bridge);
    loadDocument(bridge);

    const firstItem = await findTrackedItem("REQ-1");
    firstItem.focus();
    fireEvent.keyDown(firstItem, { ctrlKey: true, key: "a" });

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1", "REQ-2", "REQ-3"]
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Incomplete Only" }));

    await waitFor(() => {
      expect(getMessages(bridge, "selectionChanged")).toContainEqual({
        type: "selectionChanged",
        ids: ["REQ-1", "REQ-3"]
      });
    });
  });

  it("does not copy IDs when nothing is selected", async () => {
    const bridge = new FakeBridge();

    renderApp(bridge);
    loadDocument(bridge);
    await findTrackedItem("REQ-1");

    act(() => {
      bridge.emit({ type: "requestCopySelectedIds" });
    });

    expect(getMessages(bridge, "copySelectedIds")).toEqual([]);
  });

  it("shows the filtered-empty state when incomplete-only hides every tracked item", async () => {
    const bridge = new FakeBridge();

    renderApp(bridge, "complete.md");
    loadDocument(bridge, COMPLETE_ONLY_MARKDOWN);

    fireEvent.click(screen.getByRole("button", { name: "Incomplete Only" }));

    expect(
      await screen.findByText("No incomplete items in view")
    ).toBeInTheDocument();
  });
});
