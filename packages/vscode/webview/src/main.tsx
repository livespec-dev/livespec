import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LiveSpecApp } from "./LiveSpecApp.js";
import { createWebviewBridge } from "./bridge.js";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("LiveSpec webview root element was not found.");
}

const fileName = document.body.dataset.fileName ?? "Untitled";
const themeKind =
  (document.body.dataset.themeKind as
    | "light"
    | "dark"
    | "high-contrast"
    | "high-contrast-light"
    | undefined) ?? "dark";

createRoot(rootElement).render(
  <StrictMode>
    <LiveSpecApp
      bridge={createWebviewBridge()}
      fileName={fileName}
      initialThemeKind={themeKind}
    />
  </StrictMode>
);
