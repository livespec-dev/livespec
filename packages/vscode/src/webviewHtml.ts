import crypto from "node:crypto";
import * as vscode from "vscode";
import type { LiveSpecThemeKind } from "./protocol.js";

const escapeAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const getWebviewLocalResourceRoots = (
  extensionUri: vscode.Uri
): vscode.Uri[] => [vscode.Uri.joinPath(extensionUri, "webview", "dist")];

export const buildLiveSpecWebviewHtml = ({
  webview,
  extensionUri,
  fileName,
  themeKind
}: {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  fileName: string;
  themeKind: LiveSpecThemeKind;
}): string => {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview", "dist", "assets", "webview.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview", "dist", "assets", "index.css")
  );

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src 'none';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>LiveSpec</title>
  </head>
  <body data-file-name="${escapeAttribute(fileName)}" data-theme-kind="${escapeAttribute(themeKind)}">
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
};
