export const LIVE_SPEC_VIEW_CONTAINER_ID = "livespec";
export const LIVE_SPEC_TREE_VIEW_ID = "livespec.specTree";
export const LIVE_SPEC_VIEW_TYPE = "livespec.preview";
export const DOCUMENT_UPDATE_DEBOUNCE_MS = 200;

export const COMMAND_IDS = {
  openSpec: "livespec.openSpec",
  refreshSpecTree: "livespec.refreshSpecTree",
  revealActiveSpec: "livespec.revealActiveSpec",
  copySelectedIds: "livespec.copySelectedIds",
  toggleIncompleteOnly: "livespec.toggleIncompleteOnly",
  editSource: "livespec.editSource",
  refresh: "livespec.refresh"
} as const;
