export const uiPreferenceStorageKeys = {
    masterListSort: "mymag.masterListSort",
    saveDelayMs: "mymag.saveDelayMs",
    legacyIssueSaveDelayMs: "mymag.miSaveDelayMs",
    undoStackLimit: "mymag.undoStackLimit",
    issueCopyLimit: "mymag.issueCopyLimit"
} as const;

export const defaultUiPreferences = {
    autocompleteMaxSuggestions: 5,
    authorAliasInlineMaxSuggestions: 5,
    historyMaxItems: 20,
    masterListMaxItems: 200,
    masterListLoadMoreItems: 50,
    mobilePreviewContentMaxItems: 5,
    popupSelectionMaxSuggestions: 20,
    inlineSelectionMaxSuggestions: 5,
    popupDefaultWidth: 280,
    roleNamePopoverWidth: 520,
    roleNamePopoverAboveThreshold: 260,
    authorAliasPopupEstimatedHeight: 560,
    selectionPopupEstimatedHeight: 520,
    saveNoticeVisibleMs: 2000,
    saveNoticeFadeMs: 260,
    undoStackLimit: 3,
    minUndoStackLimit: 1,
    maxUndoStackLimit: 20,
    issueCopyLimit: 10,
    minIssueCopyLimit: 1,
    maxIssueCopyLimit: 50,
    maxDebugSaveDelayMs: 5000,
    routeApplyReleaseDelayMs: 0,
    dateYearMaxDigits: 4,
    dateMonthDayMaxDigits: 2
} as const;
