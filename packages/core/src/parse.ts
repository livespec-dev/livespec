import { toString } from "mdast-util-to-string";
import * as remarkGfmModule from "remark-gfm";
import * as remarkParseModule from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Content, ListItem, Root } from "mdast";
import {
  emptyProgress,
  type LiveSpecDocument,
  type LiveSpecParseResult,
  type LiveSpecTrackedItem
} from "./model.js";

const TRACKED_ITEM_ID_REGEX = /^(?=[A-Z0-9-]*\d)[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*(?=$|[^\w])/;
type RemarkParsePlugin = typeof import("remark-parse").default;
type RemarkGfmPlugin = typeof import("remark-gfm").default;

const resolvePluginModule = <T>(value: unknown): T => {
  let current: unknown = value;

  while (typeof current === "object" && current !== null && "default" in current) {
    current = current.default;
  }

  return current as T;
};

const remarkParse = resolvePluginModule<RemarkParsePlugin>(remarkParseModule);
const remarkGfm = resolvePluginModule<RemarkGfmPlugin>(remarkGfmModule);

const processor = unified().use(remarkParse).use(remarkGfm);

interface LeadingToken {
  text: string;
  blockedByInlineCode: boolean;
}

const getMeaningfulLeadingToken = (nodes: Content[]): LeadingToken | null => {
  for (const node of nodes) {
    if ("children" in node && Array.isArray(node.children)) {
      const nested = getMeaningfulLeadingToken(node.children as Content[]);

      if (nested !== null) {
        return nested;
      }

      continue;
    }

    switch (node.type) {
      case "text": {
        const trimmedValue = node.value.replace(/^\s+/, "");

        if (trimmedValue.length > 0) {
          return {
            text: trimmedValue,
            blockedByInlineCode: false
          };
        }

        break;
      }

      case "inlineCode": {
        const trimmedValue = node.value.trimStart();

        if (trimmedValue.length > 0) {
          return {
            text: trimmedValue,
            blockedByInlineCode: true
          };
        }

        break;
      }

      default: {
        const plainText = toString(node).replace(/^\s+/, "");

        if (plainText.length > 0) {
          return {
            text: plainText,
            blockedByInlineCode: false
          };
        }
      }
    }
  }

  return null;
};

const extractTrackedItemId = (listItem: ListItem): string | null => {
  const firstParagraph = listItem.children.find((child) => child.type === "paragraph");

  if (firstParagraph === undefined) {
    return null;
  }

  const leadingToken = getMeaningfulLeadingToken(firstParagraph.children);

  if (leadingToken === null || leadingToken.blockedByInlineCode) {
    return null;
  }

  const match = TRACKED_ITEM_ID_REGEX.exec(leadingToken.text);

  return match?.[0] ?? null;
};

const buildRuntimeKey = (
  sourceUri: string,
  itemId: string,
  listItem: ListItem
): string => {
  const position = listItem.position;
  const startLine = position?.start.line ?? 0;
  const startColumn = position?.start.column ?? 0;
  const endLine = position?.end.line ?? startLine;
  const endColumn = position?.end.column ?? startColumn;

  return `${sourceUri}:${startLine}:${startColumn}:${endLine}:${endColumn}:${itemId}`;
};

export const parseMarkdownToAst = (text: string): Root =>
  processor.runSync(processor.parse(text)) as Root;

export const extractTrackedItems = (
  root: Root,
  sourceUri: string
): LiveSpecTrackedItem[] => {
  const trackedItems: LiveSpecTrackedItem[] = [];

  visit(root, "listItem", (node) => {
    if (typeof node.checked !== "boolean") {
      return;
    }

    const id = extractTrackedItemId(node);

    if (id === null) {
      return;
    }

    const position = node.position;

    trackedItems.push({
      id,
      completed: node.checked,
      labelText: toString(node).trim(),
      line: position?.start.line ?? 1,
      runtimeKey: buildRuntimeKey(sourceUri, id, node),
      sourceRange: {
        startLine: position?.start.line ?? 1,
        startColumn: position?.start.column ?? 1,
        endLine: position?.end.line ?? position?.start.line ?? 1,
        endColumn: position?.end.column ?? position?.start.column ?? 1
      }
    });
  });

  return trackedItems;
};

const buildDocument = (
  sourceUri: string,
  text: string,
  trackedItems: LiveSpecTrackedItem[]
): LiveSpecDocument => {
  const complete = trackedItems.filter((item) => item.completed).length;
  const total = trackedItems.length;

  return {
    sourceUri,
    text,
    trackedItems,
    progress: {
      total,
      complete,
      remaining: total - complete
    },
    isEmpty: text.trim().length === 0
  };
};

export const parseLiveSpecDocument = (
  sourceUri: string,
  text: string,
  options?: {
    parseMarkdownToAst?: typeof parseMarkdownToAst;
  }
): LiveSpecParseResult => {
  try {
    const root = (options?.parseMarkdownToAst ?? parseMarkdownToAst)(text);
    const trackedItems = extractTrackedItems(root, sourceUri);

    return {
      ok: true,
      document: buildDocument(sourceUri, text, trackedItems)
    };
  } catch (error) {
    return {
      ok: false,
      document: {
        sourceUri,
        text,
        trackedItems: [],
        progress: emptyProgress(),
        isEmpty: text.trim().length === 0
      },
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
};

export { TRACKED_ITEM_ID_REGEX };
