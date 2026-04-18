export interface LiveSpecProgress {
  total: number;
  complete: number;
  remaining: number;
}

export interface LiveSpecSourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface LiveSpecTrackedItem {
  id: string;
  completed: boolean;
  labelText: string;
  line: number;
  runtimeKey: string;
  sourceRange: LiveSpecSourceRange;
}

export interface LiveSpecDocument {
  sourceUri: string;
  text: string;
  trackedItems: LiveSpecTrackedItem[];
  progress: LiveSpecProgress;
  isEmpty: boolean;
}

export interface LiveSpecParseSuccess {
  ok: true;
  document: LiveSpecDocument;
}

export interface LiveSpecParseFailure {
  ok: false;
  document: LiveSpecDocument;
  error: Error;
}

export type LiveSpecParseResult = LiveSpecParseSuccess | LiveSpecParseFailure;

export const emptyProgress = (): LiveSpecProgress => ({
  total: 0,
  complete: 0,
  remaining: 0
});
