"use client";

import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertTriangle, Book, BookOpen, Building2, ChartBarDecreasing, CircleChevronDown, CircleChevronLeft, CircleChevronRight, CircleChevronUp, ChevronDown, CircleHelp, CircleMinus, CirclePlus, CircleX, CircleUserRound, ClipboardCheck, Construction, Copy, GitCommitVertical, GripVertical, Eye, Ellipsis, ArrowDownToLine, ArrowUpToLine, House, Layers, LockKeyhole, Monitor, NotepadText, Package2, Plus, RotateCcw, Search, Settings, ShieldCheck, SquareLibrary, Tablet, Trash2, UserCog, UserRoundPlus, UsersRound, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, DragEvent, FocusEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, UIEvent as ReactUIEvent } from "react";
import { createPortal } from "react-dom";
import { KgtInputSet, MdInputSet, NameSuggestionList, SelectableTextInput, SimpleTable, TagInput, TitleReadingInput, YmdInputSet } from "./components/form-controls";
import { AccountMenu } from "./components/account-menu";
import { AlertDialogHost } from "./components/alert-dialog";
import { DropdownMenu, type DropdownMenuItem } from "./components/dropdown-menu";
import { DatabaseUnavailablePage, UnexpectedErrorPage } from "./components/error-display";
import { FileDropOverlay } from "./components/file-drop-overlay";
import { BooksUnderConstructionView, MissingMagazinePanel, MobileReadOnlyView } from "./components/view-panels";
import { WorkHistoryDialog, type WorkHistoryDialogEntry } from "./components/work-history-dialog";
import { showAlertDialog, showConfirmDialog } from "./lib/alert-dialog";
import type { ApplicationBadgeSummary, ApplicationSummaryResponse } from "./lib/application-requests";
import { parseAppRoute, type ParsedRoute, type RouteContext } from "./lib/app-route";
import { buildErrorRoutePath, isDatabaseUnavailableApiError, resolveApiErrorRouteKind, type AppErrorRouteKind } from "./lib/database-error";
import { authorCsvDownloadFields, authorCsvTemplateFields, authorCsvTemplateSampleRows, type AuthorCsvDownloadFieldId } from "./lib/author-field-dictionaries";
import { magazineMasterCsvDownloadFields, magazineMasterCsvTemplateFields, magazineMasterCsvTemplateSampleRows, type MagazineMasterCsvDownloadFieldId } from "./lib/public-field-dictionaries";
import { publisherCsvDownloadFields, publisherCsvTemplateFields, publisherCsvTemplateSampleRows, type PublisherCsvDownloadFieldId } from "./lib/publisher-field-dictionaries";
import { calculateStoryReadingSimilarity, normalizeStoryReadingCore, STORY_READING_CANDIDATE_MIN_THRESHOLD, STORY_READING_EXACT_MATCH_THRESHOLD, STORY_READING_NEAR_MATCH_THRESHOLD } from "./lib/story-reading-similarity";
import { buildIssueBreadcrumbLabel, buildIssueDigestParts, buildIssueDigestTitle, buildIssueDisplayLabel, calculateClickPopoverPosition, confirmDeleteRow, ensureRoleNameRows, formatRoleNameRows, getAutocompleteMatches, isContentRowEmpty, isDayInRange, isDecimalNumericText, isHiraganaReading, isIntegerNumericText, isMonthInRange, isQuotedRoleNameValue, isSignedDecimalNumericText, isStoryRowEmpty, issueIntegerFieldKeys, issueNumericFields, issueSignedDecimalFieldKeys, normalizeAutocompleteText, normalizeNumericText, parseIssueDate, parseRoleNameText, predictReading, renumberRows, showDateRangeValidationAlert, showIntegerValidationAlert, showNumericValidationAlert, showReadingValidationAlert, showSignedDecimalValidationAlert, splitTagText, stripRoleNameQuotes } from "./lib/page-utils";
import { bindingOptions, contentTypeOptions, initialContentRows, initialIssueForm, initialStoryRows, issueRatingOptions, issueSizeOptions, mediaFormatOptions, publicationFrequencyOptions, relatedPublisherRoleOptions, storyTypeOptions } from "./lib/sample-data";
import { defaultUiPreferences, uiPreferenceStorageKeys } from "./lib/ui-preferences";
import type { AuthorAliasEntry, AuthorMasterRecord, AutocompleteOption, AuthorPublisherKind, ContentRow, ExistingIssue, IssueForm, ListSelectionEntry, MagazineHistoryItem, MagazineMasterRecord, MasterEditorKind, PublisherMasterRecord, RelatedMagazineEntry, RelatedPublisherEntry, RelatedUrlEntry, RoleNameRow, RowKind, SocialLinkEntry, StoryRow, ViewKey } from "./lib/types";

type NavItem = {
    key: ViewKey;
    label: string;
    icon: any;
    theme?: string;
    isUnderConstruction?: boolean;
};
type MasterHistorySelection = {
    kind: MasterEditorKind;
    id: string;
};
type WorkHistoryTargetType = "author" | "publisher" | "magazine_title" | "magazine_issue";
type WorkHistoryRecord = {
    id: string;
    context: string;
    targetType: WorkHistoryTargetType;
    targetId: string;
    targetLabel: string;
    parentType: string;
    parentId: string;
    parentLabel: string;
    lastAction: string;
    workCount: number;
    metadata: Record<string, unknown>;
    lastWorkedAt: string;
};
type WorkHistoryResponse = {
    entries?: WorkHistoryRecord[];
    error?: string;
};
type WorkHistoryUpsertBody = {
    context: string;
    targetType: WorkHistoryTargetType;
    targetId: string;
    targetLabel: string;
    parentType?: string;
    parentId?: string;
    parentLabel?: string;
    lastAction: string;
    metadata?: Record<string, unknown>;
};
type MasterListSortKey = "reading" | "publisher" | "updated" | "issueCount";
type SortDirection = "asc" | "desc";
type MasterListSortValue = `${MasterListSortKey}:${SortDirection}`;
type IssueListSortValue = "published:asc" | "published:desc" | "updated:desc" | "created:desc" | "name:desc" | "name:asc";

const defaultMasterListSorts: Record<MasterEditorKind, MasterListSortValue> = {
    authors: "reading:asc",
    publishers: "reading:asc",
    magazines: "reading:asc"
};

const commonMasterListSortOptions: Array<{ value: MasterListSortValue; label: string }> = [
    { value: "reading:asc", label: "読み順 昇順" },
    { value: "reading:desc", label: "読み順 降順" },
    { value: "updated:desc", label: "修正順 降順" },
    { value: "updated:asc", label: "修正順 昇順" }
];

const magazineListSortOptions: Array<{ value: MasterListSortValue; label: string }> = [
    ...commonMasterListSortOptions.slice(0, 2),
    { value: "publisher:asc", label: "出版社順 昇順" },
    { value: "publisher:desc", label: "出版社順 降順" },
    ...commonMasterListSortOptions.slice(2),
    { value: "issueCount:desc", label: "登録数順 降順" },
    { value: "issueCount:asc", label: "登録数順 昇順" }
];

const issueListSortOptions: Array<{ value: IssueListSortValue; label: string }> = [
    { value: "published:asc", label: "発売日（発行日）が古い順" },
    { value: "published:desc", label: "発売日（発行日）が新しい順" },
    { value: "updated:desc", label: "更新が新しい順" },
    { value: "created:desc", label: "登録日順" },
    { value: "name:desc", label: "名前順 降順" },
    { value: "name:asc", label: "名前順 昇順" }
];

const issueUndoFieldSelectors: Partial<Record<keyof IssueForm, string>> = {
    issueTitle: 'input[placeholder="雑誌個別の表記名"]',
    titleReading: 'input[placeholder="雑誌個別の読み"]',
    publicationFrequency: 'input[placeholder="週刊"]',
    mediaFormat: 'input[placeholder="紙"]',
    publishersJson: '.issue-standard-field input[placeholder="出版社を入力"]',
    relatedMagazinesJson: '.issue-standard-field input[placeholder="関連誌を入力"]',
    volumeIssueNote: 'input[placeholder="巻号に関する補足"]',
    magazineCode: 'input[placeholder="例: 29933-07"]',
    price: 'input[placeholder="例: 290"]',
    numberOfPages: 'input[placeholder="例: 480"]',
    category: '.issue-category-field .tag-input input',
    tag: '.issue-tag-field .tag-input input',
    note: 'textarea[placeholder="雑誌個別情報に関する備考"]'
};

const issueDetailUndoFields = new Set<keyof IssueForm>([
    "publishersJson",
    "relatedMagazinesJson",
    "volumeIssueNote",
    "magazineCode",
    "binding",
    "size",
    "price",
    "numberOfPages",
    "rating",
    "category",
    "tag",
    "note"
]);

const getMasterListSortOptions = (kind: MasterEditorKind)=>{
    return kind === "magazines" ? magazineListSortOptions : commonMasterListSortOptions;
};

const readStoredMasterListSorts = (): Record<MasterEditorKind, MasterListSortValue>=>{
    if (typeof window === "undefined") return defaultMasterListSorts;
    try {
        const stored = JSON.parse(window.localStorage.getItem(uiPreferenceStorageKeys.masterListSort) ?? "{}") as Partial<Record<MasterEditorKind, MasterListSortValue>>;
        return {
            ...defaultMasterListSorts,
            ...stored
        };
    } catch {
        return defaultMasterListSorts;
    }
};

const parseMagazinePublisherSortText = (value: string)=>{
    try {
        const rows = JSON.parse(value || "[]") as Array<Record<string, unknown>>;
        return rows
            .map((row)=>String(row.reading ?? row.name ?? row.publisher_id ?? "").trim())
            .filter(Boolean)
            .join(" ");
    } catch {
        return value;
    }
};

const compareText = (left: string, right: string)=>left.localeCompare(right, "ja", {
    numeric: true,
    sensitivity: "base"
});
let contentRowClientKeySeed = 1;
const createContentRowClientKey = ()=>`content-row-${contentRowClientKeySeed++}`;
const ensureContentRowClientKeys = (rows: ContentRow[]): ContentRow[]=>rows.map((row)=>row.clientKey ? row : {
        ...row,
        clientKey: createContentRowClientKey()
    });
const stripContentRowClientKeys = (rows: ContentRow[]): ContentRow[]=>rows.map(({ clientKey: _clientKey, ...row })=>row);
const areIssueFormsEqual = (left: IssueForm, right: IssueForm)=>JSON.stringify(left) === JSON.stringify(right);
const areStoryRowsEqual = (left: StoryRow[], right: StoryRow[])=>JSON.stringify(left) === JSON.stringify(right);
const areContentRowsEqual = (left: ContentRow[], right: ContentRow[])=>JSON.stringify(stripContentRowClientKeys(left)) === JSON.stringify(stripContentRowClientKeys(right));
const buildAuthorAutocompleteOptions = (records: AuthorMasterRecord[]): AutocompleteOption[]=>records.map((author)=>({
        id: author.id,
        internalKey: author.internalId,
        name: author.name,
        reading: author.reading,
        aliases: [
            author.id
        ]
    })).sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja"));
const getListSelectionMatchRank = (option: AutocompleteOption, query: string, exactOnly = false)=>{
    const normalizedName = normalizeAutocompleteText(option.name);
    const normalizedReading = normalizeAutocompleteText(option.reading ?? "");
    const normalizedAliases = (option.aliases ?? []).map(normalizeAutocompleteText).filter(Boolean);
    const searchableTexts = [
        normalizedName,
        normalizedReading,
        ...normalizedAliases
    ].filter(Boolean);
    if (searchableTexts.some((text)=>text === query)) return 0;
    if (exactOnly) return null;
    if (normalizedReading.startsWith(query)) return 1;
    if (normalizedName.startsWith(query)) return 2;
    if (normalizedAliases.some((alias)=>alias.startsWith(query))) return 3;
    if (searchableTexts.some((text)=>text.includes(query))) return 4;
    return null;
};
const getRankedListSelectionMatches = (value: string, options: AutocompleteOption[], selectedKeys: Set<string>, limit: number)=>{
    const exactOnly = isQuotedRoleNameValue(value);
    const query = normalizeAutocompleteText(stripRoleNameQuotes(value));
    if (!query) return [];
    return options.map((option)=>({
            option,
            rank: getListSelectionMatchRank(option, query, exactOnly)
        })).filter((match): match is { option: AutocompleteOption; rank: number }=>{
        if (match.rank == null) return false;
        return !selectedKeys.has(match.option.id ?? match.option.name);
    }).sort((left, right)=>left.rank - right.rank || (left.option.reading ?? left.option.name).localeCompare(right.option.reading ?? right.option.name, "ja") || left.option.name.localeCompare(right.option.name, "ja")).slice(0, limit).map((match)=>match.option);
};
type SaveStatus = "idle" | "saving" | "saved" | "error";
const formatWorkHistoryTimestamp = (value: string)=>{
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "";
    return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(timestamp));
};
const buildWorkHistoryLabel = (entry: WorkHistoryRecord)=>{
    const kindLabel = entry.targetType === "author"
        ? "著者"
        : entry.targetType === "publisher"
            ? "出版社"
            : entry.targetType === "magazine_title"
                ? "雑誌マスター"
                : "雑誌個別";
    return `${kindLabel}（${entry.targetId}） ${entry.targetLabel}`;
};
type HeaderSaveNotice = {
    status: SaveStatus;
    message: string;
    isVisible: boolean;
    isHiding: boolean;
};
type UndoAction = {
    kind: "issue" | "story" | "content";
    issueId: string;
    field: string;
    beforeValue: unknown;
    afterValue: unknown;
    label: string;
    rowIndex?: number;
    timestamp: number;
};
type UndoMetadata = {
    field?: string;
    beforeValue?: unknown;
    afterValue?: unknown;
    rowIndex?: number;
};
type MagazineTitlesResponse = {
    records?: MagazineMasterRecord[];
    error?: string;
};
type MagazineTitlePatchResponse = {
    record?: MagazineMasterRecord;
    duplicates?: MagazineMasterRecord[];
    dependencies?: DeleteDependencyItem[];
    error?: string;
};
type MagazineCsvUploadPreviewRow = {
    rowNumber: number;
    action: "create" | "update";
    sourceId: string;
    targetId: string;
    title: string;
    status: "ready" | "error";
    messages: string[];
};
type MagazineCsvUploadResponse = {
    fileName?: string;
    headers?: string[];
    rows?: MagazineCsvUploadPreviewRow[];
    totalRows?: number;
    createCount?: number;
    updateCount?: number;
    errorCount?: number;
    canCommit?: boolean;
    affectedMagazineIds?: string[];
    importedCount?: number;
    error?: string;
};
type MagazineCsvUploadUndoResponse = {
    available?: boolean;
    actionId?: string;
    label?: string;
    fileName?: string;
    importedCount?: number;
    createCount?: number;
    updateCount?: number;
    error?: string;
};
type AuthorsResponse = {
    records?: AuthorMasterRecord[];
    error?: string;
};
type AuthorPatchResponse = {
    record?: AuthorMasterRecord;
    duplicates?: AuthorMasterRecord[];
    error?: string;
};
type PublishersResponse = {
    records?: PublisherMasterRecord[];
    error?: string;
};
type UserUndoResponse = {
    currentUser?: {
        userId: string;
        displayName: string;
        role: string;
    };
    limit?: number;
    actions?: UndoAction[];
    error?: string;
};
type ApplyUndoResponse = {
    issueId?: string;
    label?: string;
    error?: string;
};
export type AuthenticatedUser = {
    userId: string;
    loginName: string;
    displayName: string;
    role: "super_admin" | "expert" | "viewer";
};
type AuthSessionResponse = {
    authenticated?: boolean;
    user?: AuthenticatedUser;
    error?: string;
};
type UsersResponse = {
    records?: Array<{
        userId: string;
        loginName: string;
        displayName: string;
        role: "super_admin" | "expert" | "viewer";
        status: string;
        lastLoginAt: string;
        undoStackLimit: number;
        workHistoryMaxItems: number;
    }>;
    error?: string;
};
type PublisherPatchResponse = {
    record?: PublisherMasterRecord;
    duplicates?: PublisherMasterRecord[];
    error?: string;
};
type PublisherDeleteResponse = {
    deletedPublisherId?: string;
    dependencies?: DeleteDependencyItem[];
    error?: string;
};
type DeleteDependencyItem = {
    label: string;
    count: number;
};
type AuthorDeleteResponse = {
    deletedAuthorId?: string;
    dependencies?: DeleteDependencyItem[];
    error?: string;
};
type MasterDuplicateDialogState = {
    kind: "authors" | "publishers" | "magazines";
    name: string;
    reading: string;
    records: Array<AuthorMasterRecord | PublisherMasterRecord | MagazineMasterRecord>;
};
type DeleteBlockedDialogState = {
    kind: "authors" | "publishers" | "magazines";
    name: string;
    id: string;
    dependencies: DeleteDependencyItem[];
};
type DeleteConfirmDialogState = {
    kind: "authors" | "publishers" | "magazines";
    name: string;
    id: string;
};
type MagazineCsvDownloadDialogState = {
    selectedColumnIds: MagazineMasterCsvDownloadFieldId[];
    mode: "display" | "raw";
};
type MagazineCsvHelpDialogState = {
    kind: "magazines";
};
type MagazineCsvUploadDialogState = {
    fileName: string;
    csvText: string;
    isSubmitting: boolean;
    preview: MagazineCsvUploadResponse;
    submitError?: string;
};
type MagazineCsvUploadUndoState = {
    actionId: string;
    label: string;
    fileName: string;
    importedCount: number;
    createCount: number;
    updateCount: number;
};
type AuthorCsvUploadPreviewRow = {
    rowNumber: number;
    action: "create" | "update";
    sourceId: string;
    targetId: string;
    title: string;
    status: "ready" | "error";
    messages: string[];
};
type AuthorCsvUploadResponse = {
    fileName?: string;
    headers?: string[];
    rows?: AuthorCsvUploadPreviewRow[];
    totalRows?: number;
    createCount?: number;
    updateCount?: number;
    errorCount?: number;
    canCommit?: boolean;
    affectedAuthorIds?: string[];
    importedCount?: number;
    error?: string;
};
type AuthorCsvUploadUndoResponse = {
    available?: boolean;
    actionId?: string;
    label?: string;
    fileName?: string;
    importedCount?: number;
    createCount?: number;
    updateCount?: number;
    error?: string;
};
type AuthorCsvDownloadDialogState = {
    selectedColumnIds: AuthorCsvDownloadFieldId[];
    mode: "display" | "raw";
};
type AuthorCsvHelpDialogState = {
    kind: "authors";
};
type AuthorCsvUploadDialogState = {
    fileName: string;
    csvText: string;
    isSubmitting: boolean;
    preview: AuthorCsvUploadResponse;
    submitError?: string;
};
type AuthorCsvUploadUndoState = {
    actionId: string;
    label: string;
    fileName: string;
    importedCount: number;
    createCount: number;
    updateCount: number;
};
type PublisherCsvUploadPreviewRow = {
    rowNumber: number;
    action: "create" | "update";
    sourceId: string;
    targetId: string;
    title: string;
    status: "ready" | "error";
    messages: string[];
};
type PublisherCsvUploadResponse = {
    fileName?: string;
    headers?: string[];
    rows?: PublisherCsvUploadPreviewRow[];
    totalRows?: number;
    createCount?: number;
    updateCount?: number;
    errorCount?: number;
    canCommit?: boolean;
    affectedPublisherIds?: string[];
    importedCount?: number;
    error?: string;
};
type PublisherCsvUploadUndoResponse = {
    available?: boolean;
    actionId?: string;
    label?: string;
    fileName?: string;
    importedCount?: number;
    createCount?: number;
    updateCount?: number;
    error?: string;
};
type PublisherCsvDownloadDialogState = {
    selectedColumnIds: PublisherCsvDownloadFieldId[];
    mode: "display" | "raw";
};
type PublisherCsvHelpDialogState = {
    kind: "publishers";
};
type PublisherCsvUploadDialogState = {
    fileName: string;
    csvText: string;
    isSubmitting: boolean;
    preview: PublisherCsvUploadResponse;
    submitError?: string;
};
type PublisherCsvUploadUndoState = {
    actionId: string;
    label: string;
    fileName: string;
    importedCount: number;
    createCount: number;
    updateCount: number;
};
type IssueDeleteDialogState = {
    issue: ExistingIssue;
    storyCount: number;
    contentCount: number;
};
type IssueCopyFieldId =
    | "publicationFrequency"
    | "mediaFormat"
    | "publishers"
    | "relatedMagazines"
    | "displayRelease"
    | "volumeIssue"
    | "supplementalVolumeIssue"
    | "totalIssueNumber"
    | "subtitle"
    | "subtitleReading"
    | "publicationDate"
    | "releaseDate"
    | "isSpecialIssue"
    | "publisherPerson"
    | "editorPerson"
    | "magazineCode"
    | "binding"
    | "size"
    | "price"
    | "numberOfPages"
    | "rating"
    | "category"
    | "tag"
    | "note";
type IssueCopyIncrementFieldId = "displayRelease" | "volumeIssue" | "totalIssueNumber";
type IssueCopyDialogState = {
    mode: "edit" | "confirm";
    isSubmitting: boolean;
    issueLabel: string;
    magazineTitle: string;
    countText: string;
    maxCopyCount: number;
    selectedFieldIds: IssueCopyFieldId[];
    incrementFieldIds: IssueCopyIncrementFieldId[];
    sourceForm: IssueForm;
    previewLabels: string[];
};
type MagazineIssueCount = {
    magazineId: string;
    count: number;
};
type MagazineIssuesResponse = {
    counts?: MagazineIssueCount[];
    issues?: ExistingIssue[];
    error?: string;
};
type MagazineIssuePatchResponse = {
    issue?: ExistingIssue;
    error?: string;
};
type MagazineIssueDeleteResponse = {
    deletedIssueId?: string;
    deletedStoryIds?: string[];
    deletedStoryCount?: number;
    updatedStoryCount?: number;
    deletedContentCount?: number;
    error?: string;
};
type StoryPatchResponse = {
    story?: StoryRow;
    error?: string;
};
type StoryDeleteResponse = {
    deletedStoryId?: string;
    error?: string;
};
type SimilarStoryCandidate = {
    storyId: string;
    title: string;
    titleReading: string;
    titleReadingCore: string;
    seriesTitle: string;
    seriesReading: string;
    episodeLabel: string;
    issueLabel: string;
    issueTitle: string;
    magazineTitle: string;
    contributorsLabel: string;
    score: number;
    coreScore: number;
    fullScore: number;
    sameCore: boolean;
};
type StorySimilarityDialogState = {
    mode: "insert_blocked" | "insert_confirm" | "browse";
    rowIndex: number;
    row: StoryRow;
    candidates: SimilarStoryCandidate[];
    exactMatches: SimilarStoryCandidate[];
    nearMatches: SimilarStoryCandidate[];
    key?: keyof StoryRow;
    value?: StoryRow[keyof StoryRow];
    previousValue?: StoryRow[keyof StoryRow];
    skipUndo?: boolean;
};
type IssueCopyFieldOption = {
    id: IssueCopyFieldId;
    label: string;
    description: string;
    incrementLabel?: string;
};
function SaveStatusBadge({ notice }: {
    notice: HeaderSaveNotice;
}) {
    if (!notice.isVisible) return null;
    return <span className={`save-status-badge ${notice.status}${notice.isHiding ? " hiding" : ""}`}>
        {notice.message}
    </span>;
}
function FooterNoticeBadge({ notice }: {
    notice: HeaderSaveNotice;
}) {
    const fallbackMessage = "通知待機中";
    const fallbackStatus = notice.status === "error" ? "error" : "idle";
    const badgeStatus = notice.isVisible ? notice.status : fallbackStatus;
    const badgeMessage = notice.isVisible ? notice.message : fallbackMessage;
    return <span className={`footer-notice-badge save-status-badge ${badgeStatus}${notice.isVisible && notice.isHiding ? " hiding" : ""}`}>
        {badgeMessage}
    </span>;
}
function LoginScreen({ loginName, password, errorMessage, isLoading, onLoginNameChange, onPasswordChange, onSubmit }: {
    loginName: string;
    password: string;
    errorMessage: string;
    isLoading: boolean;
    onLoginNameChange: (value: string)=>void;
    onPasswordChange: (value: string)=>void;
    onSubmit: ()=>void;
}) {
    return <main className="login-dialog-layer login-screen-shell">
        <section className="login-dialog" aria-label="ログイン">
            <div className="login-title">
                <span className="brand-icon">M</span>
                <div>
                    <h2>MyMag ログイン</h2>
                    <p>ログアウト中は、この画面のみを表示します。</p>
                </div>
            </div>
            <label>
                アカウント名
                <input value={loginName} onChange={(event)=>onLoginNameChange(event.target.value)} autoComplete="username"/>
            </label>
            <label>
                パスワード
                <input value={password} type="password" onChange={(event)=>onPasswordChange(event.target.value)} autoComplete="current-password" onKeyDown={(event)=>{
                    if (event.key === "Enter") {
                        event.preventDefault();
                        onSubmit();
                    }
                }}/>
            </label>
            {errorMessage && <p className="login-error-message">{errorMessage}</p>}
            <button className="primary-button wide" type="button" disabled={isLoading} onClick={onSubmit}>
                {isLoading ? "確認中..." : "ログインして続行"}
            </button>
            <p className="login-note">テストユーザーのパスワードは、現時点では全員 guest です。</p>
        </section>
    </main>;
}
const getIssueSaveDebugDelayMs = ()=>{
    if (typeof window === "undefined") return 0;
    const delay = Number(window.localStorage.getItem(uiPreferenceStorageKeys.saveDelayMs) ?? window.localStorage.getItem(uiPreferenceStorageKeys.legacyIssueSaveDelayMs) ?? "0");
    if (!Number.isFinite(delay) || delay <= 0) return 0;
    return Math.min(Math.round(delay), defaultUiPreferences.maxDebugSaveDelayMs);
};
const getStoredUndoStackLimit = ()=>{
    if (typeof window === "undefined") return defaultUiPreferences.undoStackLimit;
    const rawValue = Number(window.localStorage.getItem(uiPreferenceStorageKeys.undoStackLimit) ?? `${defaultUiPreferences.undoStackLimit}`);
    if (!Number.isFinite(rawValue)) return defaultUiPreferences.undoStackLimit;
    return Math.min(defaultUiPreferences.maxUndoStackLimit, Math.max(defaultUiPreferences.minUndoStackLimit, Math.round(rawValue)));
};
const getStoredIssueCopyLimit = ()=>{
    if (typeof window === "undefined") return defaultUiPreferences.issueCopyLimit;
    const rawValue = Number(window.localStorage.getItem(uiPreferenceStorageKeys.issueCopyLimit) ?? `${defaultUiPreferences.issueCopyLimit}`);
    if (!Number.isFinite(rawValue)) return defaultUiPreferences.issueCopyLimit;
    return Math.min(defaultUiPreferences.maxIssueCopyLimit, Math.max(defaultUiPreferences.minIssueCopyLimit, Math.round(rawValue)));
};
const areUndoValuesEqual = (left: unknown, right: unknown)=>{
    if (typeof left === "string" && typeof right === "string") return left === right;
    if (typeof left === "number" && typeof right === "number") return left === right;
    if (typeof left === "boolean" && typeof right === "boolean") return left === right;
    return JSON.stringify(left) === JSON.stringify(right);
};
const getMagazinePublisherName = (record: MagazineMasterRecord)=>{
    try {
        const rows = JSON.parse(record.publishers) as Array<{ name?: unknown }>;
        const firstName = rows.find((row)=>typeof row.name === "string" && row.name.trim())?.name;
        return typeof firstName === "string" ? firstName : "";
    } catch {
        return "";
    }
};
const defaultMagazineCsvDownloadColumnIds = magazineMasterCsvDownloadFields.map((column)=>column.id);
const escapeCsvValue = (value: string)=>{
    const normalizedValue = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!/[",\n]/.test(normalizedValue)) return normalizedValue;
    return `"${normalizedValue.replace(/"/g, '""')}"`;
};
const formatCsvTimestampPart = (value: number)=>String(value).padStart(2, "0");
const maxCsvUploadFileSizeBytes = 4 * 1024 * 1024;
const maxCsvUploadFileSizeLabel = "4MB";
const ensureCsvUploadFileSize = (file: File)=>{
    if (file.size <= maxCsvUploadFileSizeBytes) return null;
    return `4MBを超えるためアップロードできません。${maxCsvUploadFileSizeLabel}以下のCSVを選択してください。`;
};
const buildMagazineCsvFileName = ()=>{
    const now = new Date();
    return `magazine_masters_${now.getFullYear()}${formatCsvTimestampPart(now.getMonth() + 1)}${formatCsvTimestampPart(now.getDate())}_${formatCsvTimestampPart(now.getHours())}${formatCsvTimestampPart(now.getMinutes())}${formatCsvTimestampPart(now.getSeconds())}.csv`;
};
const buildMagazineCsvTemplateFileName = ()=>{
    const now = new Date();
    return `magazine_masters_template_${now.getFullYear()}${formatCsvTimestampPart(now.getMonth() + 1)}${formatCsvTimestampPart(now.getDate())}_${formatCsvTimestampPart(now.getHours())}${formatCsvTimestampPart(now.getMinutes())}${formatCsvTimestampPart(now.getSeconds())}.csv`;
};
const buildAuthorCsvFileName = ()=>{
    const now = new Date();
    return `author_masters_${now.getFullYear()}${formatCsvTimestampPart(now.getMonth() + 1)}${formatCsvTimestampPart(now.getDate())}_${formatCsvTimestampPart(now.getHours())}${formatCsvTimestampPart(now.getMinutes())}${formatCsvTimestampPart(now.getSeconds())}.csv`;
};
const buildAuthorCsvTemplateFileName = ()=>{
    const now = new Date();
    return `author_masters_template_${now.getFullYear()}${formatCsvTimestampPart(now.getMonth() + 1)}${formatCsvTimestampPart(now.getDate())}_${formatCsvTimestampPart(now.getHours())}${formatCsvTimestampPart(now.getMinutes())}${formatCsvTimestampPart(now.getSeconds())}.csv`;
};
const buildPublisherCsvFileName = ()=>{
    const now = new Date();
    return `publisher_masters_${now.getFullYear()}${formatCsvTimestampPart(now.getMonth() + 1)}${formatCsvTimestampPart(now.getDate())}_${formatCsvTimestampPart(now.getHours())}${formatCsvTimestampPart(now.getMinutes())}${formatCsvTimestampPart(now.getSeconds())}.csv`;
};
const buildPublisherCsvTemplateFileName = ()=>{
    const now = new Date();
    return `publisher_masters_template_${now.getFullYear()}${formatCsvTimestampPart(now.getMonth() + 1)}${formatCsvTimestampPart(now.getDate())}_${formatCsvTimestampPart(now.getHours())}${formatCsvTimestampPart(now.getMinutes())}${formatCsvTimestampPart(now.getSeconds())}.csv`;
};
const createMagazineHistoryItem = (record: MagazineMasterRecord): MagazineHistoryItem=>({
        id: record.id,
        title: record.name,
        publisher: getMagazinePublisherName(record) || "出版社不明",
        lastEdited: "今開いた雑誌",
        note: "雑誌マスターから移動"
    });
const createMagazineHistoryItemFromIssue = (params: {
    magazineId: string;
    title: string;
    publisher?: string;
    lastEdited?: string;
    note?: string;
}): MagazineHistoryItem=>({
        id: params.magazineId,
        title: params.title,
        publisher: params.publisher || "出版社不明",
        lastEdited: params.lastEdited || "",
        note: params.note || ""
    });
const mergeMagazineHistoryItem = (current: MagazineHistoryItem | null, next: MagazineHistoryItem): MagazineHistoryItem=>{
    if (!current || current.id !== next.id) return next;
    return {
        ...current,
        ...next,
        publisher: next.publisher || current.publisher,
        lastEdited: next.lastEdited || current.lastEdited,
        note: next.note || current.note
    };
};
const resolveMagazineDisplayTitle = (params: {
    magazineId?: string;
    selectedTitle?: string;
    formTitle?: string;
    issueMagazineTitle?: string;
    issueTitle?: string;
})=>{
    return params.issueMagazineTitle?.trim()
        || params.formTitle?.trim()
        || params.selectedTitle?.trim()
        || params.issueTitle?.trim()
        || params.magazineId?.trim()
        || "";
};
const mergeIssueDraftCollections = <T,>(currentValue: T[] | undefined, incomingValue: T[] | undefined)=>{
    return incomingValue ?? currentValue;
};
const resolveIssueRows = (issue: ExistingIssue)=>{
    return {
        storyRows: issue.stories && issue.stories.length > 0 ? issue.stories : emptyStoryRows(),
        contentRows: issue.contents && issue.contents.length > 0 ? ensureContentRowClientKeys(issue.contents) : emptyContentRows()
    };
};
const createEmptyIssueForm = (magazineName: string): IssueForm=>{
    const emptyForm = Object.fromEntries(Object.entries(initialIssueForm).map(([key, value])=>[
            key,
            typeof value === "boolean" ? false : ""
        ])) as IssueForm;
    return {
        ...emptyForm,
        magazineTitle: magazineName,
        status: "draft"
    };
};
const createDraftIssue = (record: MagazineMasterRecord): ExistingIssue=>({
        id: `NEW-${record.id}`,
        magazineId: record.id,
        date: "",
        label: "新規",
        title: record.name,
        digest: "新規作成",
        status: "draft"
    });
const isUnsavedNewIssue = (issue: Pick<ExistingIssue, "id">)=>issue.id.startsWith("NEW-");
const emptySelectedIssue: ExistingIssue = {
    id: "",
    magazineId: "",
    date: "",
    label: "",
    title: "",
    digest: "",
    status: "draft"
};
const authRoleLabels: Record<AuthenticatedUser["role"], string> = {
    super_admin: "超管理人",
    expert: "編集者",
    viewer: "回覧のみ"
};
const formatAuthRoleLabel = (role: AuthenticatedUser["role"] | string)=>{
    if (role === "super_admin" || role === "expert" || role === "viewer") {
        return authRoleLabels[role];
    }
    return role || "-";
};
const sanitizeLoginErrorMessage = (message: string)=>{
    if (!message.trim()) return "ログインに失敗しました。";
    if (message.includes("login_password")) {
        return "ログイン設定がまだDBへ反映されていません。管理用データの更新後に再度お試しください。";
    }
    if (message.includes("アカウント名またはパスワードが正しくありません")) {
        return "アカウント名またはパスワードが正しくありません。";
    }
    return message;
};
const issueCopyFieldOptions: IssueCopyFieldOption[] = [
    {
        id: "publicationFrequency",
        label: "刊行",
        description: "週刊・月刊などの刊行情報をコピーします。"
    },
    {
        id: "mediaFormat",
        label: "媒体",
        description: "紙・電子などの媒体情報をコピーします。"
    },
    {
        id: "publishers",
        label: "出版社",
        description: "出版社の選択内容をコピーします。"
    },
    {
        id: "relatedMagazines",
        label: "関連誌",
        description: "関連誌の入力内容をコピーします。"
    },
    {
        id: "displayRelease",
        label: "発売表示",
        description: "発売表示の年月日と表示合併をまとめてコピーします。",
        incrementLabel: "月を +1 しますか？（12月は年を繰り上げ）"
    },
    {
        id: "volumeIssue",
        label: "巻号",
        description: "巻数・号数表示・巻号メモをまとめてコピーします。",
        incrementLabel: "通巻を +1 しますか？"
    },
    {
        id: "supplementalVolumeIssue",
        label: "補助表記巻号",
        description: "補助表示の巻号表記をコピーします。"
    },
    {
        id: "totalIssueNumber",
        label: "号数",
        description: "通巻号数をコピーします。",
        incrementLabel: "号数を +1 しますか？"
    },
    {
        id: "subtitle",
        label: "サブタイトル",
        description: "サブタイトル表記をコピーします。"
    },
    {
        id: "subtitleReading",
        label: "サブタイトル読み",
        description: "サブタイトルの読みをコピーします。"
    },
    {
        id: "publicationDate",
        label: "発行日",
        description: "発行年月日と合併表示をまとめてコピーします。"
    },
    {
        id: "releaseDate",
        label: "発売日",
        description: "発売年月日をコピーします。"
    },
    {
        id: "isSpecialIssue",
        label: "増刊",
        description: "増刊チェックの状態をコピーします。"
    },
    {
        id: "publisherPerson",
        label: "発行人",
        description: "発行人の記入内容をコピーします。"
    },
    {
        id: "editorPerson",
        label: "編集人",
        description: "編集人の記入内容をコピーします。"
    },
    {
        id: "magazineCode",
        label: "雑誌コード",
        description: "雑誌コードをコピーします。"
    },
    {
        id: "binding",
        label: "製本",
        description: "製本情報をコピーします。"
    },
    {
        id: "size",
        label: "サイズ",
        description: "サイズ情報をコピーします。"
    },
    {
        id: "price",
        label: "価格",
        description: "価格情報をコピーします。"
    },
    {
        id: "numberOfPages",
        label: "ページ数",
        description: "ページ数をコピーします。"
    },
    {
        id: "rating",
        label: "レイティング",
        description: "レイティングをコピーします。"
    },
    {
        id: "category",
        label: "分類",
        description: "分類の設定内容をコピーします。"
    },
    {
        id: "tag",
        label: "タグ",
        description: "タグをコピーします。"
    },
    {
        id: "note",
        label: "備考",
        description: "備考をコピーします。"
    }
];
const defaultIssueCopyFieldIds = issueCopyFieldOptions.map((field)=>field.id);
const parseIssueCopyCount = (value: string, maxCount: number)=>{
    const count = Number.parseInt(value, 10);
    if (!Number.isFinite(count) || count < 1) return 0;
    return Math.min(count, maxCount);
};
const incrementIntegerText = (value: string, step: number)=>{
    const normalized = normalizeNumericText(value);
    if (!/^\d+$/.test(normalized)) return value;
    return `${Number.parseInt(normalized, 10) + step}`;
};
const incrementDecimalText = (value: string, step: number)=>{
    const normalized = normalizeNumericText(value);
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return value;
    const nextValue = Number.parseFloat(normalized) + step;
    return Number.isInteger(nextValue) ? `${nextValue}` : `${nextValue}`;
};
const incrementMonthWithYearCarry = (yearText: string, monthText: string, step: number)=>{
    const normalizedYear = normalizeNumericText(yearText);
    const normalizedMonth = normalizeNumericText(monthText);
    if (!/^\d+$/.test(normalizedMonth)) {
        return {
            year: yearText,
            month: monthText
        };
    }
    const monthValue = Number.parseInt(normalizedMonth, 10);
    if (monthValue < 1 || monthValue > 12) {
        return {
            year: yearText,
            month: monthText
        };
    }
    const baseYear = /^\d+$/.test(normalizedYear) ? Number.parseInt(normalizedYear, 10) : NaN;
    const monthIndex = monthValue - 1 + step;
    const yearCarry = Math.floor(monthIndex / 12);
    const nextMonth = monthIndex % 12 + 1;
    return {
        year: Number.isFinite(baseYear) ? `${baseYear + yearCarry}` : yearText,
        month: `${nextMonth}`
    };
};
const buildIssueCopyPreviewForms = (dialog: IssueCopyDialogState)=>{
    const count = parseIssueCopyCount(dialog.countText, dialog.maxCopyCount);
    if (count < 1) return [];
    return Array.from({
        length: count
    }, (_, index)=>{
        const step = index + 1;
        const nextForm = createEmptyIssueForm(dialog.sourceForm.magazineTitle);
        nextForm.issueTitle = dialog.sourceForm.issueTitle;
        nextForm.titleReading = dialog.sourceForm.titleReading;
        nextForm.magazineTitle = dialog.sourceForm.magazineTitle;
        nextForm.status = "draft";
        if (dialog.selectedFieldIds.includes("publicationFrequency")) nextForm.publicationFrequency = dialog.sourceForm.publicationFrequency;
        if (dialog.selectedFieldIds.includes("mediaFormat")) nextForm.mediaFormat = dialog.sourceForm.mediaFormat;
        if (dialog.selectedFieldIds.includes("publishers")) nextForm.publishersJson = dialog.sourceForm.publishersJson;
        if (dialog.selectedFieldIds.includes("relatedMagazines")) nextForm.relatedMagazinesJson = dialog.sourceForm.relatedMagazinesJson;
        if (dialog.selectedFieldIds.includes("displayRelease")) {
            nextForm.displayReleaseYear = dialog.sourceForm.displayReleaseYear;
            nextForm.displayReleaseMonth = dialog.sourceForm.displayReleaseMonth;
            nextForm.displayReleaseDay = dialog.sourceForm.displayReleaseDay;
            nextForm.displayReleaseCombinedMonth = dialog.sourceForm.displayReleaseCombinedMonth;
            nextForm.displayReleaseCombinedDay = dialog.sourceForm.displayReleaseCombinedDay;
            if (dialog.incrementFieldIds.includes("displayRelease")) {
                const incremented = incrementMonthWithYearCarry(dialog.sourceForm.displayReleaseYear, dialog.sourceForm.displayReleaseMonth, step);
                nextForm.displayReleaseYear = incremented.year;
                nextForm.displayReleaseMonth = incremented.month;
                nextForm.displayReleaseCombinedMonth = incrementIntegerText(dialog.sourceForm.displayReleaseCombinedMonth, step);
            }
        }
        if (dialog.selectedFieldIds.includes("volumeIssue")) {
            nextForm.volumeNumber = dialog.sourceForm.volumeNumber;
            nextForm.issueNumber = dialog.sourceForm.issueNumber;
            nextForm.totalIssueNumber = dialog.sourceForm.totalIssueNumber;
            nextForm.volumeIssueNote = dialog.sourceForm.volumeIssueNote;
            if (dialog.incrementFieldIds.includes("volumeIssue")) {
                nextForm.totalIssueNumber = incrementIntegerText(dialog.sourceForm.totalIssueNumber, step);
            }
        }
        if (dialog.selectedFieldIds.includes("supplementalVolumeIssue")) {
            nextForm.volumeNumberDisplayed = dialog.sourceForm.volumeNumberDisplayed;
            nextForm.issueNumberCombined = dialog.sourceForm.issueNumberCombined;
        }
        if (dialog.selectedFieldIds.includes("totalIssueNumber")) {
            nextForm.volumeNumberDisplayed = dialog.sourceForm.volumeNumberDisplayed;
            if (dialog.incrementFieldIds.includes("totalIssueNumber")) {
                nextForm.volumeNumberDisplayed = incrementDecimalText(dialog.sourceForm.volumeNumberDisplayed, step);
            }
        }
        if (dialog.selectedFieldIds.includes("subtitle")) nextForm.subtitle = dialog.sourceForm.subtitle;
        if (dialog.selectedFieldIds.includes("subtitleReading")) nextForm.subtitleReading = dialog.sourceForm.subtitleReading;
        if (dialog.selectedFieldIds.includes("publicationDate")) {
            nextForm.publicationYear = dialog.sourceForm.publicationYear;
            nextForm.publicationMonth = dialog.sourceForm.publicationMonth;
            nextForm.publicationDay = dialog.sourceForm.publicationDay;
            nextForm.publicationCombinedMonth = dialog.sourceForm.publicationCombinedMonth;
            nextForm.publicationCombinedDay = dialog.sourceForm.publicationCombinedDay;
        }
        if (dialog.selectedFieldIds.includes("releaseDate")) {
            nextForm.releaseYear = dialog.sourceForm.releaseYear;
            nextForm.releaseMonth = dialog.sourceForm.releaseMonth;
            nextForm.releaseDay = dialog.sourceForm.releaseDay;
        }
        if (dialog.selectedFieldIds.includes("isSpecialIssue")) nextForm.isSpecialIssue = dialog.sourceForm.isSpecialIssue;
        if (dialog.selectedFieldIds.includes("publisherPerson")) nextForm.publisherPerson = dialog.sourceForm.publisherPerson;
        if (dialog.selectedFieldIds.includes("editorPerson")) nextForm.editorPerson = dialog.sourceForm.editorPerson;
        if (dialog.selectedFieldIds.includes("magazineCode")) nextForm.magazineCode = dialog.sourceForm.magazineCode;
        if (dialog.selectedFieldIds.includes("binding")) nextForm.binding = dialog.sourceForm.binding;
        if (dialog.selectedFieldIds.includes("size")) nextForm.size = dialog.sourceForm.size;
        if (dialog.selectedFieldIds.includes("price")) nextForm.price = dialog.sourceForm.price;
        if (dialog.selectedFieldIds.includes("numberOfPages")) nextForm.numberOfPages = dialog.sourceForm.numberOfPages;
        if (dialog.selectedFieldIds.includes("rating")) nextForm.rating = dialog.sourceForm.rating;
        if (dialog.selectedFieldIds.includes("category")) nextForm.category = dialog.sourceForm.category;
        if (dialog.selectedFieldIds.includes("tag")) nextForm.tag = dialog.sourceForm.tag;
        if (dialog.selectedFieldIds.includes("note")) nextForm.note = dialog.sourceForm.note;
        return nextForm;
    });
};
const issueCopyFieldKeyGroups: Record<IssueCopyFieldId, Array<keyof IssueForm>> = {
    publicationFrequency: [
        "publicationFrequency"
    ],
    mediaFormat: [
        "mediaFormat"
    ],
    publishers: [
        "publishersJson"
    ],
    relatedMagazines: [
        "relatedMagazinesJson"
    ],
    displayRelease: [
        "displayReleaseYear",
        "displayReleaseMonth",
        "displayReleaseDay",
        "displayReleaseCombinedMonth",
        "displayReleaseCombinedDay"
    ],
    volumeIssue: [
        "volumeNumber",
        "issueNumber",
        "totalIssueNumber",
        "volumeIssueNote"
    ],
    supplementalVolumeIssue: [
        "volumeNumberDisplayed",
        "issueNumberCombined"
    ],
    totalIssueNumber: [
        "volumeNumberDisplayed"
    ],
    subtitle: [
        "subtitle"
    ],
    subtitleReading: [
        "subtitleReading"
    ],
    publicationDate: [
        "publicationYear",
        "publicationMonth",
        "publicationDay",
        "publicationCombinedMonth",
        "publicationCombinedDay"
    ],
    releaseDate: [
        "releaseYear",
        "releaseMonth",
        "releaseDay"
    ],
    isSpecialIssue: [
        "isSpecialIssue"
    ],
    publisherPerson: [
        "publisherPerson"
    ],
    editorPerson: [
        "editorPerson"
    ],
    magazineCode: [
        "magazineCode"
    ],
    binding: [
        "binding"
    ],
    size: [
        "size"
    ],
    price: [
        "price"
    ],
    numberOfPages: [
        "numberOfPages"
    ],
    rating: [
        "rating"
    ],
    category: [
        "category"
    ],
    tag: [
        "tag"
    ],
    note: [
        "note"
    ]
};
const isIssueCopyValueMeaningful = (key: keyof IssueForm, value: IssueForm[keyof IssueForm])=>{
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        if (key === "publishersJson" || key === "relatedMagazinesJson") {
            const text = value.trim();
            return text !== "" && text !== "[]";
        }
        return value.trim() !== "";
    }
    return false;
};
const collectIssueCopyPatchEntries = (selectedFieldIds: IssueCopyFieldId[], form: IssueForm)=>{
    const entries: Array<{ key: keyof IssueForm; value: IssueForm[keyof IssueForm] }> = [];
    selectedFieldIds.forEach((fieldId)=>{
        const fieldKeys = issueCopyFieldKeyGroups[fieldId] ?? [];
        fieldKeys.forEach((key)=>{
            const value = form[key];
            if (!isIssueCopyValueMeaningful(key, value)) return;
            entries.push({
                key,
                value
            });
        });
    });
    return entries;
};
const emptyStoryRows = ()=>initialStoryRows.map((row)=>({
        ...row,
        storyId: undefined
    }));
const emptyContentRows = ()=>initialContentRows.map((row)=>({
        ...row,
        clientKey: createContentRowClientKey()
    }));
const primaryNavItems: NavItem[] = [
    {
        key: "books",
        label: "単行本",
        icon: Book,
        theme: "books",
        isUnderConstruction: true
    },
    {
        key: "authors",
        label: "著者",
        icon: UsersRound,
        theme: "authors"
    },
    {
        key: "publishers",
        label: "出版社",
        icon: Building2,
        theme: "publishers"
    },
    {
        key: "magazines",
        label: "雑誌",
        icon: SquareLibrary,
        theme: "magazines"
    }
];
const footerNavItems: NavItem[] = [
    {
        key: "approvals",
        label: "承認待ち",
        icon: ClipboardCheck
    },
    {
        key: "users",
        label: "ユーザー管理",
        icon: UserCog
    }
];
const viewLabels: Record<ViewKey, string> = {
    view: "Viewモード",
    mi: "雑誌個別",
    magazines: "雑誌マスター",
    books: "単行本",
    authors: "著者",
    publishers: "出版社",
    approvals: "承認待ち",
    users: "ユーザー管理"
};
const viewThemes: Record<ViewKey, string> = {
    view: "magazines",
    mi: "magazines",
    magazines: "magazines",
    books: "books",
    authors: "authors",
    publishers: "publishers",
    approvals: "magazines",
    users: "magazines"
};
const masterKindPathSegments: Record<MasterEditorKind, string> = {
    authors: "authors",
    publishers: "publishers",
    magazines: "magazines"
};
const appendRouteContext = (path: string, context?: RouteContext)=>{
    const params = new URLSearchParams();
    if (context?.from) params.set("from", context.from);
    if (context?.issue) params.set("issue", context.issue);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
};
const buildMasterRoutePath = (kind: MasterEditorKind, id?: string, context?: RouteContext)=>{
    const segment = masterKindPathSegments[kind];
    const path = id ? `/masters/${segment}/${encodeURIComponent(id)}` : `/masters/${segment}`;
    return appendRouteContext(path, context);
};
const buildIssueRoutePath = (magazineId: string, issueId?: string, context?: RouteContext)=>{
    const issueSegment = issueId ? `/${encodeURIComponent(issueId)}` : "";
    return appendRouteContext(`/magazines/${encodeURIComponent(magazineId)}/issues${issueSegment}`, context);
};
const buildViewRoutePath = (view: ViewKey)=>{
    if (view === "view") {
        return "/";
    }
    if (view === "authors" || view === "publishers" || view === "magazines") {
        return buildMasterRoutePath(view);
    }
    return `/${view}`;
};
const phoneViewportMediaQuery = "(max-width: 640px)";
const isPhoneViewport = ()=>{
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(phoneViewportMediaQuery).matches;
};
const getDefaultModeView = (phone = false): ViewKey=>phone ? "view" : "magazines";
const setRowDragPreview = (event: DragEvent<HTMLElement>, rowKind: RowKind, rowIndex: number)=>{
    const rowElement = event.currentTarget.closest(".content-editor-row");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-mymag-row", `${rowKind}:${rowIndex}`);
    event.dataTransfer.setData("text/plain", `${rowKind}:${rowIndex}`);
    if (rowElement instanceof HTMLElement) {
        rowElement.classList.add("is-dragging");
        event.dataTransfer.setDragImage(rowElement, 18, 18);
    }
};
const clearRowDragPreview = (event: DragEvent<HTMLElement>)=>{
    event.currentTarget.closest(".content-editor-row")?.classList.remove("is-dragging");
};
const getDraggedRowIndex = (event: DragEvent<HTMLElement>, rowKind: RowKind)=>{
    const data = event.dataTransfer.getData("application/x-mymag-row") || event.dataTransfer.getData("text/plain");
    const [kind, indexText] = data.split(":");
    const rowIndex = Number(indexText);
    if (kind !== rowKind || !Number.isInteger(rowIndex)) return null;
    return rowIndex;
};
const shouldToggleRowDetailsOnDoubleClick = (target: EventTarget | null)=>{
    if (!(target instanceof HTMLElement)) return false;
    return !target.closest("input, textarea, select, button, a, [role='button'], [contenteditable='true']");
};
const repositionNextDevBadge = ()=>{
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const accountButton = document.querySelector(".account-menu-wrap .account-pill");
    const portalHost = document.querySelector("nextjs-portal");
    if (!(accountButton instanceof HTMLElement) || !(portalHost instanceof HTMLElement) || !portalHost.shadowRoot) return;
    const indicator = portalHost.shadowRoot.querySelector("#devtools-indicator");
    if (!(indicator instanceof HTMLElement)) return;
    const rect = accountButton.getBoundingClientRect();
    const top = Math.round(rect.bottom + 20);
    const right = Math.max(16, Math.round(window.innerWidth - rect.right));
    indicator.style.top = `${top}px`;
    indicator.style.right = `${right}px`;
    indicator.style.bottom = "auto";
    indicator.style.left = "auto";
    indicator.style.boxShadow = "none";
};
export default function Home({ initialCurrentUser = null, initialRoute = null }: {
    initialCurrentUser?: AuthenticatedUser | null;
    initialRoute?: ParsedRoute | null;
}) {
    const [view, setView] = useState<ViewKey>(initialRoute?.view ?? getDefaultModeView());
    const [activeErrorRoute, setActiveErrorRoute] = useState<AppErrorRouteKind | null>(initialRoute?.errorKind ?? null);
    const [isPhoneMode, setIsPhoneMode] = useState(false);
    const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(initialCurrentUser);
    const [applicationBadgeSummary, setApplicationBadgeSummary] = useState<ApplicationBadgeSummary>({
        masters: {},
        issues: {}
    });
    const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
    const [loginNameInput, setLoginNameInput] = useState("admin");
    const [loginPasswordInput, setLoginPasswordInput] = useState("guest");
    const [loginErrorMessage, setLoginErrorMessage] = useState("");
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isIssueListOpen, setIsIssueListOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [workHistoryEntries, setWorkHistoryEntries] = useState<WorkHistoryRecord[]>([]);
    const [workHistoryError, setWorkHistoryError] = useState("");
    const [isWorkHistoryLoading, setIsWorkHistoryLoading] = useState(false);
    const [masterEditorHasUnsavedChanges, setMasterEditorHasUnsavedChanges] = useState(false);
    const [masterHistorySelection, setMasterHistorySelection] = useState<MasterHistorySelection | null>(null);
    const [selectedMasterHistoryIds, setSelectedMasterHistoryIds] = useState<Record<MasterEditorKind, string>>({
        authors: "",
        publishers: "",
        magazines: ""
    });
    const [isReadingCompletionEnabled, setIsReadingCompletionEnabled] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<ExistingIssue>(emptySelectedIssue);
    const [selectedMagazine, setSelectedMagazine] = useState<MagazineHistoryItem | null>(null);
    const [issueForm, setIssueForm] = useState<IssueForm>(initialIssueForm);
    const [storyRows, setStoryRows] = useState<StoryRow[]>(initialStoryRows);
    const [contentRows, setContentRows] = useState<ContentRow[]>(emptyContentRows());
    const [issuesByMagazineId, setIssuesByMagazineId] = useState<Record<string, ExistingIssue[]>>({});
    const [magazineIssueCounts, setMagazineIssueCounts] = useState<Record<string, number>>({});
    const [magazineIssueLoadError, setMagazineIssueLoadError] = useState("");
    const [miAuthorDirectoryOptions, setMiAuthorDirectoryOptions] = useState<AutocompleteOption[]>([]);
    const [miPublisherDirectoryOptions, setMiPublisherDirectoryOptions] = useState<AutocompleteOption[]>([]);
    const [miMagazineDirectoryOptions, setMiMagazineDirectoryOptions] = useState<AutocompleteOption[]>([]);
    const [issueSaveStatus, setIssueSaveStatus] = useState<SaveStatus>("idle");
    const [issueSaveMessage, setIssueSaveMessage] = useState("リアルタイム保存 待機中");
    const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
    const [storySimilarityDialog, setStorySimilarityDialog] = useState<StorySimilarityDialogState | null>(null);
    const [issueDeleteDialog, setIssueDeleteDialog] = useState<IssueDeleteDialogState | null>(null);
    const [issueCopyDialog, setIssueCopyDialog] = useState<IssueCopyDialogState | null>(null);
    const [undoStackLimit, setUndoStackLimit] = useState<number>(defaultUiPreferences.undoStackLimit);
    const [issueCopyLimit, setIssueCopyLimit] = useState<number>(defaultUiPreferences.issueCopyLimit);
    const [storyRowOpenStates, setStoryRowOpenStates] = useState<boolean[]>(()=>storyRows.map(()=>false));
    const [contentRowOpenStates, setContentRowOpenStates] = useState<boolean[]>(()=>contentRows.map(()=>false));
    const isPhoneModeRef = useRef(false);
    const isSelectedIssueReadOnly = selectedIssue.status === "submitted" || selectedIssue.status === "on_hold";
    const syncSelectedMagazine = useCallback((magazine: MagazineHistoryItem)=>{
        setSelectedMagazine((current)=>mergeMagazineHistoryItem(current, magazine));
    }, []);
    const activeMagazine = useMemo<MagazineHistoryItem | null>(()=>{
        const magazineId = selectedMagazine?.id || selectedIssue.magazineId || "";
        if (!magazineId) return null;
        const derivedTitle = resolveMagazineDisplayTitle({
            magazineId,
            selectedTitle: selectedMagazine?.title,
            formTitle: issueForm.magazineTitle,
            issueMagazineTitle: selectedIssue.magazineTitle,
            issueTitle: selectedIssue.title
        });
        return {
            id: magazineId,
            title: derivedTitle,
            publisher: selectedMagazine?.publisher || selectedIssue.publisherName || "出版社不明",
            lastEdited: selectedMagazine?.lastEdited || "",
            note: selectedMagazine?.note || ""
        };
    }, [
        issueForm.magazineTitle,
        selectedIssue.magazineId,
        selectedIssue.magazineTitle,
        selectedIssue.publisherName,
        selectedIssue.title,
        selectedMagazine
    ]);
    const [routeContext, setRouteContext] = useState<RouteContext>(initialRoute?.context ?? {});
    const [isRouteReady, setIsRouteReady] = useState(false);
    const [headerSaveNotice, setHeaderSaveNotice] = useState<HeaderSaveNotice>({
        status: "idle",
        message: "",
        isVisible: false,
        isHiding: false
    });
    const headerSaveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isApplyingRouteRef = useRef(false);
    const lastRouteUrlRef = useRef("");
    const savedIssueFormRef = useRef<IssueForm>(initialIssueForm);
    const savedStoryRowsRef = useRef<StoryRow[]>(initialStoryRows);
    const savedContentRowsRef = useRef<ContentRow[]>(emptyContentRows());
    const isUndoingRef = useRef(false);
    const issueCreatePendingRef = useRef(false);
    const pendingUndoFocusRef = useRef<UndoAction | null>(null);
    const isLoggedIn = currentUser !== null;
    const setBrowserUrl = useCallback((url: string, mode: "push" | "replace" = "push")=>{
        if (typeof window === "undefined") return;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl === url || lastRouteUrlRef.current === url && mode === "replace") return;
        if (mode === "replace") {
            window.history.replaceState(null, "", url);
        } else {
            window.history.pushState(null, "", url);
        }
        lastRouteUrlRef.current = url;
    }, []);
    const navigateToErrorRoute = useCallback((kind: AppErrorRouteKind)=>{
        setRouteContext({});
        setActiveErrorRoute(kind);
        setView("view");
        setBrowserUrl(buildErrorRoutePath(kind), "replace");
    }, [
        setBrowserUrl
    ]);
    const throwIfDatabaseUnavailable = useCallback((response: { status: number }, body?: { error?: string; code?: string } | null, fallbackMessage = "データベースに接続できません。")=>{
        const routeKind = resolveApiErrorRouteKind(response, body);
        if (routeKind !== "db-unavailable") return;
        navigateToErrorRoute(routeKind);
        throw new Error(body?.error || fallbackMessage);
    }, [
        navigateToErrorRoute
    ]);
    useEffect(()=>{
        if (initialCurrentUser) {
            setLoginNameInput(initialCurrentUser.loginName);
            setLoginErrorMessage("");
        }
    }, [
        initialCurrentUser
    ]);
    useEffect(()=>{
        if (typeof window === "undefined" || typeof document === "undefined") return;
        let frameId = window.requestAnimationFrame(repositionNextDevBadge);
        const portalHost = document.querySelector("nextjs-portal");
        const observer = portalHost instanceof HTMLElement
            ? new MutationObserver(()=>{
                if (frameId) cancelAnimationFrame(frameId);
                frameId = window.requestAnimationFrame(repositionNextDevBadge);
            })
            : null;
        if (portalHost instanceof HTMLElement && observer) {
            observer.observe(portalHost, {
                childList: true,
                subtree: true,
                attributes: true
            });
        }
        const handleViewportChange = ()=>{
            if (frameId) cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(repositionNextDevBadge);
        };
        window.addEventListener("resize", handleViewportChange);
        return ()=>{
            if (frameId) cancelAnimationFrame(frameId);
            observer?.disconnect();
            window.removeEventListener("resize", handleViewportChange);
        };
    }, [
        isLoggedIn,
        currentUser?.loginName
    ]);
    useEffect(()=>{
        if (!isLoggedIn) return;
        let cancelled = false;
        fetch("/api/authors")
            .then(async (response)=>{
                const body = await response.json() as AuthorsResponse;
                if (isDatabaseUnavailableApiError(response, body)) {
                    navigateToErrorRoute("db-unavailable");
                    throw new Error("db_unavailable");
                }
                if (!response.ok) {
                    throw new Error(body.error || `著者APIが ${response.status} を返しました`);
                }
                return body.records ?? [];
            })
            .then((records)=>{
                if (cancelled) return;
                setMiAuthorDirectoryOptions(buildAuthorAutocompleteOptions(records));
            })
            .catch(()=>{
            });
        return ()=>{
            cancelled = true;
        };
    }, [
        isLoggedIn,
        navigateToErrorRoute
    ]);
    useEffect(()=>{
        if (!isLoggedIn) return;
        let cancelled = false;
        fetch("/api/publishers")
            .then(async (response)=>{
                const body = await response.json() as PublishersResponse;
                if (isDatabaseUnavailableApiError(response, body)) {
                    navigateToErrorRoute("db-unavailable");
                    throw new Error("db_unavailable");
                }
                if (!response.ok) {
                    throw new Error(body.error || `出版社APIが ${response.status} を返しました`);
                }
                return body.records ?? [];
            })
            .then((records)=>{
                if (cancelled) return;
                setMiPublisherDirectoryOptions(records.map((publisher)=>({
                            id: publisher.id,
                            internalKey: publisher.internalId,
                            name: publisher.name,
                            reading: publisher.reading,
                            aliases: [
                                publisher.id
                            ]
                        })).sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")));
            })
            .catch(()=>{
            });
        return ()=>{
            cancelled = true;
        };
    }, [
        isLoggedIn,
        navigateToErrorRoute
    ]);
    const handleAuthorDirectoryOptionsChange = useCallback((options: AutocompleteOption[])=>{
        setMiAuthorDirectoryOptions(options);
    }, []);
    useEffect(()=>{
        if (!currentUser) {
            setApplicationBadgeSummary({
                masters: {},
                issues: {}
            });
            return;
        }
        let cancelled = false;
        fetch("/api/application-requests?view=summary", {
            cache: "no-store"
        })
            .then(async (response)=>{
                const body = await response.json() as ApplicationSummaryResponse;
                if (isDatabaseUnavailableApiError(response, body)) {
                    navigateToErrorRoute("db-unavailable");
                    throw new Error("db_unavailable");
                }
                if (!response.ok) {
                    throw new Error(body.error || "申請サマリーを読み込めませんでした。");
                }
                return body.summary ?? {
                    masters: {},
                    issues: {}
                };
            })
            .then((summary)=>{
                if (cancelled) return;
                setApplicationBadgeSummary(summary);
            })
            .catch(()=>{
                if (cancelled) return;
                setApplicationBadgeSummary({
                    masters: {},
                    issues: {}
                });
            });
        return ()=>{
            cancelled = true;
        };
    }, [
        currentUser?.loginName,
        currentUser?.role,
        navigateToErrorRoute
    ]);
    useLayoutEffect(()=>{
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mediaQueryList = window.matchMedia(phoneViewportMediaQuery);
        const applyMatch = (matches: boolean)=>{
            isPhoneModeRef.current = matches;
            setIsPhoneMode(matches);
        };
        applyMatch(mediaQueryList.matches);
        const handleChange = (event: MediaQueryListEvent)=>applyMatch(event.matches);
        mediaQueryList.addEventListener("change", handleChange);
        return ()=>{
            mediaQueryList.removeEventListener("change", handleChange);
        };
    }, []);
    const showHeaderSaveNotice = useCallback((status: SaveStatus, message: string)=>{
        if (headerSaveNoticeTimerRef.current) {
            clearTimeout(headerSaveNoticeTimerRef.current);
            headerSaveNoticeTimerRef.current = null;
        }
        if (status === "idle" || !message.trim()) {
            setHeaderSaveNotice({
                status: "idle",
                message: "",
                isVisible: false,
                isHiding: false
            });
            return;
        }
        setHeaderSaveNotice({
            status,
            message,
            isVisible: true,
            isHiding: false
        });
        if (status === "saved" || status === "error") {
            headerSaveNoticeTimerRef.current = setTimeout(()=>{
                setHeaderSaveNotice((current)=>({
                        ...current,
                        isHiding: true
                    }));
                headerSaveNoticeTimerRef.current = setTimeout(()=>{
                    setHeaderSaveNotice({
                        status: "idle",
                        message: "",
                        isVisible: false,
                        isHiding: false
                    });
                    headerSaveNoticeTimerRef.current = null;
                }, defaultUiPreferences.saveNoticeFadeMs);
            }, defaultUiPreferences.saveNoticeVisibleMs);
        }
    }, []);
    useEffect(()=>()=> {
            if (headerSaveNoticeTimerRef.current) clearTimeout(headerSaveNoticeTimerRef.current);
        }, []);
    useEffect(()=>{
        setUndoStackLimit(getStoredUndoStackLimit());
    }, []);
    useEffect(()=>{
        setIssueCopyLimit(getStoredIssueCopyLimit());
    }, []);
    const refreshUndoStack = useCallback(async (issueId: string)=>{
        if (!issueId || issueId.startsWith("NEW-")) {
            setUndoStack([]);
            return [] as UndoAction[];
        }
        const response = await fetch(`/api/user-undo?issueId=${encodeURIComponent(issueId)}`, {
            cache: "no-store"
        });
        const body = await response.json() as UserUndoResponse;
        throwIfDatabaseUnavailable(response, body, "アンドゥ履歴の読み込みに失敗しました");
        if (!response.ok) throw new Error(body.error || "アンドゥ履歴の読み込みに失敗しました");
        const nextLimit = Number(body.limit ?? defaultUiPreferences.undoStackLimit);
        if (Number.isFinite(nextLimit) && nextLimit > 0) {
            setUndoStackLimit(nextLimit);
        }
        const actions = body.actions ?? [];
        setUndoStack(actions);
        return actions;
    }, [
        throwIfDatabaseUnavailable
    ]);
    const focusUndoTarget = useCallback((action: UndoAction)=>{
        if (typeof document === "undefined") return false;
        const focusElement = (selector: string | undefined)=>{
            if (!selector) return false;
            const element = document.querySelector(selector) as HTMLElement | null;
            if (!element) return false;
            element.focus();
            element.scrollIntoView({
                block: "center",
                inline: "nearest"
            });
            return true;
        };
        if (action.kind === "issue") {
            return focusElement(issueUndoFieldSelectors[action.field as keyof IssueForm]);
        }
        const rowIndex = action.rowIndex;
        if (rowIndex == null || !Number.isFinite(rowIndex)) return false;
        const rowKind = action.kind === "story" ? "story" : "content";
        const rowSelector = `[data-undo-kind="${rowKind}"][data-row-index="${rowIndex}"]`;
        const fieldSelector = action.kind === "story"
            ? ({
                title: 'input[placeholder="作品タイトル"]',
                titleReading: 'input[placeholder="作品タイトルの読み"]',
                authors: 'input[placeholder="著者を入力"]',
                storyType: 'input[placeholder="読み切り"]',
                pageCount: 'input[placeholder="18"]',
                seriesTitle: 'input[placeholder="シリーズ名"]',
                seriesReading: 'input[placeholder="シリーズ読み"]',
                subtitle: 'input[placeholder="サブタイトル"]',
                subtitleReading: 'input[placeholder="サブタイトル読み"]',
                episodeNumber: 'input[placeholder="3"]',
                episodeLabel: 'input[placeholder="第3話"]',
                colorInfo: 'input[placeholder="巻頭カラー、2色カラーなど"]',
                tags: '.tag-input input',
                memo: 'input[placeholder="検索オプションでのみ対象"]'
            } as Record<string, string>)[action.field]
            : ({
                contentType: 'input[placeholder="表紙、目次、広告など"]',
                contributorsJson: 'input[placeholder="関係者を入力"]',
                pageStart: 'input[placeholder="1"]',
                pageEnd: 'input[placeholder="4"]',
                detail: 'textarea[placeholder="内容の詳細"]'
            } as Record<string, string>)[action.field];
        return focusElement(fieldSelector ? `${rowSelector} ${fieldSelector}` : rowSelector);
    }, []);
    const prepareUndoTargetVisibility = useCallback((action: UndoAction)=>{
        if (action.kind === "issue") {
            if (issueDetailUndoFields.has(action.field as keyof IssueForm)) {
                setIsDetailsOpen(true);
            }
            return;
        }
        const rowIndex = action.rowIndex;
        if (rowIndex == null || !Number.isFinite(rowIndex)) return;
        if (action.kind === "story") {
            setStoryRowOpenStates((current)=>current.map((value, index)=>index === rowIndex ? true : value));
            return;
        }
        setContentRowOpenStates((current)=>current.map((value, index)=>index === rowIndex ? true : value));
    }, []);
    useEffect(()=>{
        const pendingAction = pendingUndoFocusRef.current;
        if (!pendingAction || pendingAction.issueId !== selectedIssue.id) return;
        const timer = window.setTimeout(()=>{
            if (focusUndoTarget(pendingAction)) {
                pendingUndoFocusRef.current = null;
            }
        }, 30);
        return ()=>window.clearTimeout(timer);
    }, [
        selectedIssue.id,
        issueForm,
        storyRows,
        contentRows,
        focusUndoTarget
    ]);
    const loadWorkHistories = useCallback(async ()=>{
        setIsWorkHistoryLoading(true);
        setWorkHistoryError("");
        try {
            const response = await fetch(`/api/work-histories?limit=${defaultUiPreferences.historyMaxItems}`, {
                cache: "no-store"
            });
            const body = await response.json() as WorkHistoryResponse;
            if (isDatabaseUnavailableApiError(response, body)) {
                navigateToErrorRoute("db-unavailable");
                return;
            }
            if (!response.ok) throw new Error(body.error || "履歴の読み込みに失敗しました");
            setWorkHistoryEntries(body.entries ?? []);
        } catch (error) {
            setWorkHistoryEntries([]);
            setWorkHistoryError(error instanceof Error ? error.message : "履歴の読み込みに失敗しました");
        } finally {
            setIsWorkHistoryLoading(false);
        }
    }, [
        navigateToErrorRoute
    ]);
    const upsertWorkHistory = useCallback(async (payload: WorkHistoryUpsertBody)=>{
        await fetch("/api/work-histories", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    }, []);
    const recordSavedIssueWorkHistory = useCallback((params: {
        issueId: string;
        issueLabel: string;
        lastAction: string;
        magazineId?: string;
        magazineTitle?: string;
    })=>{
        if (!isLoggedIn || !params.issueId || !params.magazineId || !params.magazineTitle) return;
        void upsertWorkHistory({
            context: "magazine_issue_editor",
            targetType: "magazine_issue",
            targetId: params.issueId,
            targetLabel: `${params.magazineTitle} ${params.issueLabel}`.trim(),
            parentType: "magazine_title",
            parentId: params.magazineId,
            parentLabel: params.magazineTitle,
            lastAction: params.lastAction,
            metadata: {
                issueLabel: params.issueLabel,
                magazineId: params.magazineId
            }
        }).catch(()=>{});
    }, [
        isLoggedIn,
        upsertWorkHistory
    ]);
    const hasMiUnsavedChanges = useMemo(()=>{
        if (view !== "mi") return false;
        if (issueSaveStatus === "saving") return true;
        return !areIssueFormsEqual(issueForm, savedIssueFormRef.current) || !areStoryRowsEqual(storyRows, savedStoryRowsRef.current) || !areContentRowsEqual(contentRows, savedContentRowsRef.current);
    }, [
        view,
        issueSaveStatus,
        issueForm,
        storyRows,
        contentRows
    ]);
    const hasUnsavedChanges = view === "mi" ? hasMiUnsavedChanges : masterEditorHasUnsavedChanges;
    const handleUndoStackLimitChange = useCallback((value: string)=>{
        const numericValue = Number(value);
        const nextLimit = !Number.isFinite(numericValue) ? defaultUiPreferences.undoStackLimit : Math.min(defaultUiPreferences.maxUndoStackLimit, Math.max(defaultUiPreferences.minUndoStackLimit, Math.round(numericValue)));
        setUndoStackLimit(nextLimit);
        setUndoStack((current)=>current.slice(0, nextLimit));
        if (typeof window !== "undefined") {
            window.localStorage.setItem(uiPreferenceStorageKeys.undoStackLimit, String(nextLimit));
        }
        void fetch("/api/user-undo", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                undoStackLimit: nextLimit
            })
        }).catch(()=>{});
    }, []);
    const handleIssueCopyLimitChange = useCallback((value: string)=>{
        const numericValue = Number(value);
        const nextLimit = !Number.isFinite(numericValue) ? defaultUiPreferences.issueCopyLimit : Math.min(defaultUiPreferences.maxIssueCopyLimit, Math.max(defaultUiPreferences.minIssueCopyLimit, Math.round(numericValue)));
        setIssueCopyLimit(nextLimit);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(uiPreferenceStorageKeys.issueCopyLimit, String(nextLimit));
        }
        setIssueCopyDialog((current)=>current ? {
                ...current,
                maxCopyCount: nextLimit,
                countText: `${Math.min(parseIssueCopyCount(current.countText, nextLimit) || 1, nextLimit)}`
            } : current);
    }, []);
    useEffect(()=>{
        setContentRows((rows)=>{
            const hasLegacyEmptyContributors = rows.some((row)=>row.contributorsJson?.trim() === "[]");
            if (!hasLegacyEmptyContributors) return rows;
            return rows.map((row)=>row.contributorsJson?.trim() === "[]" ? {
                    ...row,
                    contributorsJson: ""
                } : row);
        });
    }, []);
    useEffect(()=>{
        if (view !== "mi" || !selectedIssue.id || isUnsavedNewIssue(selectedIssue)) {
            setUndoStack([]);
            return;
        }
        refreshUndoStack(selectedIssue.id).catch(()=>setUndoStack([]));
    }, [
        view,
        selectedIssue.id,
        selectedIssue.status,
        refreshUndoStack
    ]);
    useEffect(()=>{
        setStoryRowOpenStates((current)=>storyRows.map((_, index)=>current[index] ?? false));
    }, [
        storyRows.length
    ]);
    useEffect(()=>{
        setContentRowOpenStates((current)=>contentRows.map((_, index)=>current[index] ?? false));
    }, [
        contentRows.length
    ]);
    const activeLabel = useMemo(()=>viewLabels[view], [
        view
    ]);
    const activeTheme = useMemo(()=>viewThemes[view], [
        view
    ]);
    const issueDigestParts = useMemo(()=>view === "mi" ? buildIssueDigestParts(issueForm) : {
            title: "",
            detail: ""
        }, [
        view,
        issueForm
    ]);
    const updateStoryRow = (index, key, value)=>{
        if (isSelectedIssueReadOnly) return;
        setStoryRows((rows)=>rows.map((row, rowIndex)=>rowIndex === index ? {
                    ...row,
                    [key]: value
                } : row));
    };
    const addStoryRow = ()=>{
        if (isSelectedIssueReadOnly) return;
        setStoryRows((rows)=>[
                ...rows,
                {
                    position: rows.length,
                    title: "",
                    titleReading: "",
                    authors: "",
                    storyType: "読み切り",
                    pageCount: "",
                    seriesTitle: "",
                    seriesReading: "",
                    subtitle: "",
                    subtitleReading: "",
                    episodeNumber: "",
                    episodeLabel: "",
                    colorInfo: "",
                    memo: "",
                    tags: []
                }
            ].map((row, index)=>({
                    ...row,
                    position: index + 1
                })));
    };
    const moveStoryRow = (fromIndex, toIndex)=>{
        if (isSelectedIssueReadOnly) return;
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= storyRows.length || toIndex >= storyRows.length) {
            return;
        }
        const nextRows = [
            ...storyRows
        ];
        const [movedRow] = nextRows.splice(fromIndex, 1);
        nextRows.splice(toIndex, 0, movedRow);
        const renumberedRows = nextRows.map((row, index)=>({
                ...row,
                position: index + 1
            }));
        setStoryRows(renumberedRows);
        const selectedIssueId = selectedIssue.id;
        setSelectedIssue((current)=>current.id === selectedIssueId ? {
                ...current,
                stories: renumberedRows
            } : current);
        setIssuesByMagazineId((current)=>{
            const magazineId = activeMagazine?.id;
            if (!magazineId || !current[magazineId]) return current;
            return {
                ...current,
                [magazineId]: current[magazineId].map((issue)=>issue.id === selectedIssueId ? {
                        ...issue,
                        stories: renumberedRows
                    } : issue)
            };
        });
        void commitStoryRowOrder(renumberedRows);
    };
    const copyStoryRow = (index, placement)=>{
        if (isSelectedIssueReadOnly) return;
        setStoryRows((rows)=>{
            const target = rows[index];
            if (!target) return rows;
            const insertIndex = placement === "above" ? index : index + 1;
            const nextRows = [
                ...rows
            ];
            nextRows.splice(insertIndex, 0, {
                ...target
            });
            return renumberRows(nextRows);
        });
    };
    const deleteStoryRow = async (index)=>{
        if (isSelectedIssueReadOnly) return;
        const target = storyRows[index];
        if (!target) return;
        if (!isStoryRowEmpty(target) && !await confirmDeleteRow(`作品リスト${index + 1}行目`)) {
            return;
        }
        if (!target.storyId || isUnsavedNewIssue(selectedIssue)) {
            const nextRows = renumberRows(storyRows.filter((_, rowIndex)=>rowIndex !== index));
            setStoryRows(nextRows);
            savedStoryRowsRef.current = nextRows;
            showHeaderSaveNotice("saved", "削除しました");
            return;
        }
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `作品削除中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "作品削除中";
        setIssueSaveStatus("saving");
        setIssueSaveMessage(savingMessage);
        showHeaderSaveNotice("saving", savingMessage);
        try {
            const response = await fetch("/api/stories", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    storyId: target.storyId,
                    undoMeta: {
                        field: "delete",
                        rowIndex: index,
                        beforeValue: target.title || target.storyId,
                        afterValue: ""
                    } satisfies UndoMetadata,
                    debugDelayMs
                })
            });
            const body = await response.json() as StoryDeleteResponse;
            throwIfDatabaseUnavailable(response, body, "作品の削除に失敗しました");
            if (!response.ok) throw new Error(body.error || "作品の削除に失敗しました");
            const nextRows = renumberRows(storyRows.filter((_, rowIndex)=>rowIndex !== index));
            setStoryRows(nextRows);
            savedStoryRowsRef.current = nextRows;
            setSelectedIssue((current)=>current.id === selectedIssue.id ? {
                    ...current,
                    stories: nextRows
                } : current);
            setIssuesByMagazineId((current)=>{
                const magazineId = activeMagazine?.id;
                if (!magazineId || !current[magazineId]) return current;
                return {
                    ...current,
                    [magazineId]: current[magazineId].map((issue)=>issue.id === selectedIssue.id ? {
                            ...issue,
                            stories: nextRows
                        } : issue)
                };
            });
            setIssueSaveStatus("saved");
            setIssueSaveMessage("削除しました");
            if (!isUndoingRef.current) await refreshUndoStack(selectedIssue.id);
            showHeaderSaveNotice("saved", "削除しました");
        } catch (error) {
            const message = error instanceof Error ? error.message : "作品の削除に失敗しました";
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    };
    const mergeSavedStory = useCallback((index: number, savedStory: StoryRow)=>{
        setStoryRows((currentRows)=>{
            const nextRows = currentRows.map((row, rowIndex)=>rowIndex === index ? {
                    ...row,
                    ...savedStory,
                    position: row.position
                } : row);
            const selectedIssueId = selectedIssue.id;
            setSelectedIssue((current)=>current.id === selectedIssueId ? {
                    ...current,
                    stories: nextRows
                } : current);
            setIssuesByMagazineId((current)=>{
                const magazineId = activeMagazine?.id;
                if (!magazineId || !current[magazineId]) return current;
                return {
                    ...current,
                    [magazineId]: current[magazineId].map((issue)=>issue.id === selectedIssueId ? {
                            ...issue,
                            stories: nextRows
                        } : issue)
                };
            });
            return nextRows;
        });
    }, [
        activeMagazine?.id,
        selectedIssue.id
    ]);
    const commitStoryRowOrder = useCallback(async (nextRows: StoryRow[])=>{
        if (selectedIssue.status === "submitted" || selectedIssue.status === "on_hold") return;
        if (!selectedIssue.id || isUnsavedNewIssue(selectedIssue)) {
            savedStoryRowsRef.current = nextRows;
            return;
        }
        const persistedRows = nextRows.filter((row)=>row.storyId);
        if (persistedRows.length === 0) {
            savedStoryRowsRef.current = nextRows;
            return;
        }
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `作品順保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "作品順保存中";
        setIssueSaveStatus("saving");
        setIssueSaveMessage(savingMessage);
        showHeaderSaveNotice("saving", savingMessage);
        try {
            for (const row of persistedRows){
                const response = await fetch("/api/stories", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        storyId: row.storyId,
                        field: "position",
                        value: row.position,
                        debugDelayMs
                    })
                });
                const body = await response.json() as StoryPatchResponse;
                throwIfDatabaseUnavailable(response, body, "作品順の保存に失敗しました");
                if (!response.ok) throw new Error(body.error || "作品順の保存に失敗しました");
            }
            savedStoryRowsRef.current = nextRows;
            setIssueSaveStatus("saved");
            setIssueSaveMessage("作品順保存済み");
            showHeaderSaveNotice("saved", "作品順保存済み");
            recordSavedIssueWorkHistory({
                issueId: selectedIssue.id,
                issueLabel: buildIssueDisplayLabel(issueForm) || selectedIssue.label || selectedIssue.id,
                lastAction: "save_story_order",
                magazineId: activeMagazine?.id,
                magazineTitle: activeMagazine?.title
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "作品順の保存に失敗しました";
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    }, [
        selectedIssue.id,
        selectedIssue.status,
        showHeaderSaveNotice,
        throwIfDatabaseUnavailable
    ]);
    const loadSimilarStoryCandidates = useCallback(async (reading: string, storyId?: string)=>{
        const params = new URLSearchParams({
            reading
        });
        if (storyId) params.set("storyId", storyId);
        const response = await fetch(`/api/stories/similar?${params.toString()}`, {
            cache: "no-store"
        });
        const body = await response.json() as { candidates?: SimilarStoryCandidate[]; error?: string };
        throwIfDatabaseUnavailable(response, body, "類似作品の検索に失敗しました");
        if (!response.ok) throw new Error(body.error || "類似作品の検索に失敗しました");
        const queryCore = normalizeStoryReadingCore(reading);
        return (body.candidates ?? []).map((candidate)=>{
            const metrics = calculateStoryReadingSimilarity(reading, candidate.titleReading ?? "");
            const candidateCore = candidate.titleReadingCore || normalizeStoryReadingCore(candidate.titleReading ?? "");
            return {
                ...candidate,
                titleReadingCore: candidateCore,
                score: Number(metrics.score.toFixed(4)),
                coreScore: Number(metrics.coreScore.toFixed(4)),
                fullScore: Number(metrics.fullScore.toFixed(4)),
                sameCore: Boolean(queryCore && candidateCore && queryCore === candidateCore)
            };
        }).filter((candidate)=>candidate.score >= STORY_READING_CANDIDATE_MIN_THRESHOLD).sort((left, right)=>{
            if (right.score !== left.score) return right.score - left.score;
            if (right.sameCore !== left.sameCore) return right.sameCore ? 1 : -1;
            return left.storyId.localeCompare(right.storyId);
        }).slice(0, 8);
    }, [
        throwIfDatabaseUnavailable
    ]);
    const createStoryRecord = useCallback(async (index: number, nextRow: StoryRow, key: keyof StoryRow, value: StoryRow[keyof StoryRow], previousValue: StoryRow[keyof StoryRow] | undefined, options?: {
        skipUndo?: boolean;
    })=>{
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `作品保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "作品保存中";
        setIssueSaveStatus("saving");
        setIssueSaveMessage(savingMessage);
        showHeaderSaveNotice("saving", savingMessage);
        try {
            const response = await fetch("/api/stories", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    issueId: selectedIssue.id,
                    row: nextRow,
                    undoMeta: {
                        field: String(key),
                        rowIndex: index,
                        beforeValue: previousValue ?? "",
                        afterValue: value
                    } satisfies UndoMetadata,
                    debugDelayMs
                })
            });
            const body = await response.json() as StoryPatchResponse;
            throwIfDatabaseUnavailable(response, body, "作品情報の保存に失敗しました");
            if (!response.ok) throw new Error(body.error || "作品情報の保存に失敗しました");
            if (body.story) {
                mergeSavedStory(index, body.story);
                savedStoryRowsRef.current = storyRows.map((row, rowIndex)=>rowIndex === index ? {
                        ...row,
                        ...body.story,
                        [key]: value
                    } : row);
            }
            if (!options?.skipUndo && !isUndoingRef.current) await refreshUndoStack(selectedIssue.id);
            setIssueSaveStatus("saved");
            setIssueSaveMessage("作品保存済み");
            showHeaderSaveNotice("saved", "作品保存済み");
            recordSavedIssueWorkHistory({
                issueId: selectedIssue.id,
                issueLabel: buildIssueDisplayLabel(issueForm) || selectedIssue.label || selectedIssue.id,
                lastAction: "create_story",
                magazineId: activeMagazine?.id,
                magazineTitle: activeMagazine?.title
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "作品情報の保存に失敗しました";
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    }, [
        mergeSavedStory,
        refreshUndoStack,
        selectedIssue.id,
        showHeaderSaveNotice,
        storyRows,
        throwIfDatabaseUnavailable
    ]);
    const commitStoryRowField = useCallback(async (index: number, key: keyof StoryRow, value: StoryRow[keyof StoryRow], options?: {
        skipUndo?: boolean;
    })=>{
        if (!selectedIssue.id || isUnsavedNewIssue(selectedIssue)) return;
        const currentRow = storyRows[index];
        if (!currentRow) return;
        const savedRow = savedStoryRowsRef.current[index];
        const previousValue = savedRow?.[key];
        if (areUndoValuesEqual(previousValue, value)) return;
        const nextRow = {
            ...currentRow,
            [key]: value
        } as StoryRow;
        if (!nextRow.storyId && !nextRow.title.trim()) return;
        if (!nextRow.storyId) {
            if (!nextRow.title.trim() || !nextRow.titleReading.trim() || !isHiraganaReading(nextRow.titleReading)) return;
            try {
                const candidates = await loadSimilarStoryCandidates(nextRow.titleReading);
                const exactMatches = candidates.filter((candidate)=>candidate.score >= STORY_READING_EXACT_MATCH_THRESHOLD).slice(0, 5);
                const nearMatches = candidates.filter((candidate)=>candidate.score >= STORY_READING_NEAR_MATCH_THRESHOLD).slice(0, 5);
                if (exactMatches.length > 0) {
                    setStorySimilarityDialog({
                        mode: "insert_blocked",
                        rowIndex: index,
                        row: nextRow,
                        candidates: exactMatches,
                        exactMatches,
                        nearMatches: [],
                        key,
                        value,
                        previousValue,
                        skipUndo: options?.skipUndo
                    });
                    return;
                }
                if (nearMatches.length > 0) {
                    setStorySimilarityDialog({
                        mode: "insert_confirm",
                        rowIndex: index,
                        row: nextRow,
                        candidates: nearMatches,
                        exactMatches: [],
                        nearMatches,
                        key,
                        value,
                        previousValue,
                        skipUndo: options?.skipUndo
                    });
                    return;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "類似作品の検索に失敗しました";
                setIssueSaveStatus("error");
                setIssueSaveMessage(message);
                showHeaderSaveNotice("error", message);
                return;
            }
            await createStoryRecord(index, nextRow, key, value, previousValue, options);
            return;
        }
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `作品保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "作品保存中";
        setIssueSaveStatus("saving");
        setIssueSaveMessage(savingMessage);
        showHeaderSaveNotice("saving", savingMessage);
        try {
            const response = await fetch("/api/stories", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    storyId: nextRow.storyId,
                    field: key,
                    value,
                    undoMeta: {
                        field: String(key),
                        rowIndex: index,
                        beforeValue: previousValue ?? "",
                        afterValue: value
                    } satisfies UndoMetadata,
                    debugDelayMs
                })
            });
            const body = await response.json() as StoryPatchResponse;
            throwIfDatabaseUnavailable(response, body, "作品情報の保存に失敗しました");
            if (!response.ok) throw new Error(body.error || "作品情報の保存に失敗しました");
            if (body.story) {
                mergeSavedStory(index, body.story);
                savedStoryRowsRef.current = storyRows.map((row, rowIndex)=>rowIndex === index ? {
                        ...row,
                        ...body.story,
                        [key]: value
                    } : row);
            }
            if (!options?.skipUndo && !isUndoingRef.current) await refreshUndoStack(selectedIssue.id);
            setIssueSaveStatus("saved");
            setIssueSaveMessage("作品保存済み");
            showHeaderSaveNotice("saved", "作品保存済み");
            recordSavedIssueWorkHistory({
                issueId: selectedIssue.id,
                issueLabel: buildIssueDisplayLabel(issueForm) || selectedIssue.label || selectedIssue.id,
                lastAction: "save_story",
                magazineId: activeMagazine?.id,
                magazineTitle: activeMagazine?.title
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "作品情報の保存に失敗しました";
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    }, [
        createStoryRecord,
        loadSimilarStoryCandidates,
        selectedIssue.id,
        selectedIssue.status,
        storyRows,
        mergeSavedStory,
        refreshUndoStack,
        showHeaderSaveNotice,
        throwIfDatabaseUnavailable
    ]);
    const handleStorySimilarityConfirm = useCallback(async ()=>{
        if (!storySimilarityDialog || storySimilarityDialog.mode === "browse" || !storySimilarityDialog.key) return;
        const dialogState = storySimilarityDialog;
        setStorySimilarityDialog(null);
        await createStoryRecord(dialogState.rowIndex, dialogState.row, dialogState.key!, dialogState.value ?? "", dialogState.previousValue, {
            skipUndo: dialogState.skipUndo
        });
    }, [
        createStoryRecord,
        storySimilarityDialog
    ]);
    const handleStorySimilarityReject = useCallback(()=>{
        if (!storySimilarityDialog) return;
        const rowIndex = storySimilarityDialog.rowIndex;
        setStoryRows((rows)=>rows.map((row, index)=>index === rowIndex ? {
                ...row,
                title: "",
                titleReading: ""
            } : row));
        setStorySimilarityDialog(null);
    }, [
        storySimilarityDialog
    ]);
    const openStorySimilaritySearch = useCallback(async (index: number, row: StoryRow)=>{
        if (!row.titleReading.trim() || !isHiraganaReading(row.titleReading)) {
            setStorySimilarityDialog({
                mode: "browse",
                rowIndex: index,
                row,
                candidates: [],
                exactMatches: [],
                nearMatches: []
            });
            return;
        }
        try {
            const candidates = await loadSimilarStoryCandidates(row.titleReading, row.storyId);
            const exactMatches = candidates.filter((candidate)=>candidate.score >= STORY_READING_EXACT_MATCH_THRESHOLD);
            const nearMatches = candidates.filter((candidate)=>candidate.score >= STORY_READING_NEAR_MATCH_THRESHOLD && candidate.score < STORY_READING_EXACT_MATCH_THRESHOLD);
            setStorySimilarityDialog({
                mode: "browse",
                rowIndex: index,
                row,
                candidates,
                exactMatches,
                nearMatches
            });
        } catch (error) {
            setIssueSaveStatus("error");
            setIssueSaveMessage(error instanceof Error ? error.message : "類似作品の検索に失敗しました");
            showHeaderSaveNotice("error", error instanceof Error ? error.message : "類似作品の検索に失敗しました");
        }
    }, [
        loadSimilarStoryCandidates,
        showHeaderSaveNotice
    ]);
    const mergeSavedIssue = useCallback((savedIssue: ExistingIssue)=>{
        setSelectedIssue((current)=>current.id === savedIssue.id ? {
                ...current,
                ...savedIssue,
                stories: mergeIssueDraftCollections(current.stories, savedIssue.stories),
                contents: mergeIssueDraftCollections(current.contents, savedIssue.contents)
            } : current);
        setIssuesByMagazineId((current)=>{
            const magazineId = savedIssue.magazineId;
            if (!magazineId || !current[magazineId]) return current;
            return {
                ...current,
                [magazineId]: current[magazineId].map((issue)=>issue.id === savedIssue.id ? {
                        ...issue,
                        ...savedIssue,
                        stories: mergeIssueDraftCollections(issue.stories, savedIssue.stories),
                        contents: mergeIssueDraftCollections(issue.contents, savedIssue.contents)
                    } : issue)
            };
        });
        const nextMagazineId = savedIssue.magazineId || activeMagazine?.id || "";
        if (nextMagazineId) {
            syncSelectedMagazine(createMagazineHistoryItemFromIssue({
                magazineId: nextMagazineId,
                title: resolveMagazineDisplayTitle({
                    magazineId: nextMagazineId,
                    selectedTitle: activeMagazine?.title,
                    formTitle: issueForm.magazineTitle,
                    issueMagazineTitle: savedIssue.magazineTitle,
                    issueTitle: savedIssue.title
                }),
                publisher: savedIssue.publisherName || activeMagazine?.publisher,
                lastEdited: activeMagazine?.lastEdited,
                note: activeMagazine?.note
            }));
        }
    }, [
        activeMagazine,
        issueForm.magazineTitle,
        syncSelectedMagazine
    ]);
    const updateContentRow = (index, key, value)=>{
        if (isSelectedIssueReadOnly) return;
        setContentRows((rows)=>rows.map((row, rowIndex)=>rowIndex === index ? {
                    ...row,
                    [key]: value
                } : row));
    };
    const commitContentRows = useCallback(async (nextRows: ContentRow[], options?: {
        skipUndo?: boolean;
        undoAction?: UndoAction;
    })=>{
        if (selectedIssue.status === "submitted" || selectedIssue.status === "on_hold") return;
        if (!selectedIssue.id || isUnsavedNewIssue(selectedIssue)) return;
        const sanitizedRows = stripContentRowClientKeys(nextRows);
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `コンテンツ保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "コンテンツ保存中";
        setIssueSaveStatus("saving");
        setIssueSaveMessage(savingMessage);
        showHeaderSaveNotice("saving", savingMessage);
        try {
            const response = await fetch("/api/magazine-issues", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    issueId: selectedIssue.id,
                    field: "contents",
                    value: sanitizedRows,
                    undoMeta: options?.undoAction ? {
                        field: options.undoAction.field,
                        rowIndex: options.undoAction.rowIndex,
                        beforeValue: options.undoAction.beforeValue,
                        afterValue: options.undoAction.afterValue
                    } satisfies UndoMetadata : undefined,
                    debugDelayMs
                })
            });
            const body = await response.json() as MagazineIssuePatchResponse;
            throwIfDatabaseUnavailable(response, body, "コンテンツの保存に失敗しました");
            if (!response.ok) throw new Error(body.error || "コンテンツの保存に失敗しました");
            if (body.issue) {
                mergeSavedIssue(body.issue);
                if (body.issue.contents) {
                    const nextContentRows = ensureContentRowClientKeys(body.issue.contents);
                    setContentRows(nextContentRows);
                    savedContentRowsRef.current = nextContentRows;
                } else {
                    savedContentRowsRef.current = nextRows;
                }
            }
            if (options?.undoAction && !options.skipUndo && !isUndoingRef.current) await refreshUndoStack(selectedIssue.id);
            setIssueSaveStatus("saved");
            setIssueSaveMessage("コンテンツ保存済み");
            showHeaderSaveNotice("saved", "コンテンツ保存済み");
            recordSavedIssueWorkHistory({
                issueId: selectedIssue.id,
                issueLabel: buildIssueDisplayLabel(issueForm) || selectedIssue.label || selectedIssue.id,
                lastAction: "save_content",
                magazineId: activeMagazine?.id,
                magazineTitle: activeMagazine?.title
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "コンテンツの保存に失敗しました";
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    }, [
        selectedIssue.id,
        selectedIssue.status,
        mergeSavedIssue,
        refreshUndoStack,
        showHeaderSaveNotice
    ]);
    const commitContentRowField = useCallback(async (index: number, key: keyof ContentRow, value: ContentRow[keyof ContentRow], options?: {
        skipUndo?: boolean;
    })=>{
        if (selectedIssue.status === "submitted" || selectedIssue.status === "on_hold") return;
        const previousValue = savedContentRowsRef.current[index]?.[key];
        if (areUndoValuesEqual(previousValue, value)) return;
        const nextRows = contentRows.map((row, rowIndex)=>rowIndex === index ? {
                ...row,
                [key]: value
            } : row).map((row, rowIndex)=>({
                ...row,
                position: rowIndex + 1
            }));
        void commitContentRows(nextRows, {
            skipUndo: options?.skipUndo,
            undoAction: {
                kind: "content",
                issueId: selectedIssue.id,
                field: String(key),
                beforeValue: previousValue ?? "",
                afterValue: value,
                label: `コンテンツ${index + 1}行目`,
                rowIndex: index,
                timestamp: Date.now()
            }
        });
    }, [
        contentRows,
        commitContentRows,
        selectedIssue.id
    ]);
    const addContentRow = ()=>{
        if (isSelectedIssueReadOnly) return;
        setContentRows((rows)=>{
            const nextRows = [
                ...rows,
                {
                    clientKey: createContentRowClientKey(),
                    position: rows.length + 1,
                    contentType: "記事",
                    pageStart: "",
                    pageEnd: "",
                    detail: "",
                    contributorsJson: ""
                }
            ];
            void commitContentRows(nextRows, {
                undoAction: {
                    kind: "content",
                    issueId: selectedIssue.id,
                    field: "create",
                    beforeValue: "",
                    afterValue: `コンテンツ${nextRows.length}行目`,
                    label: `コンテンツ${nextRows.length}行目`,
                    rowIndex: nextRows.length - 1,
                    timestamp: Date.now()
                }
            });
            return nextRows;
        });
    };
    const moveContentRow = (fromIndex, toIndex)=>{
        if (isSelectedIssueReadOnly) return;
        setContentRows((rows)=>{
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= rows.length || toIndex >= rows.length) {
                return rows;
            }
            const nextRows = [
                ...rows
            ];
            const [movedRow] = nextRows.splice(fromIndex, 1);
            nextRows.splice(toIndex, 0, movedRow);
            const renumberedRows = nextRows.map((row, index)=>({
                    ...row,
                    position: index + 1
                }));
            void commitContentRows(renumberedRows);
            return renumberedRows;
        });
    };
    const copyContentRow = (index, placement)=>{
        if (isSelectedIssueReadOnly) return;
        setContentRows((rows)=>{
            const target = rows[index];
            if (!target) return rows;
            const insertIndex = placement === "above" ? index : index + 1;
            const nextRows = [
                ...rows
            ];
            nextRows.splice(insertIndex, 0, {
                ...target,
                clientKey: createContentRowClientKey(),
                detail: ""
            });
            const renumberedRows = renumberRows(nextRows);
            void commitContentRows(renumberedRows, {
                undoAction: {
                    kind: "content",
                    issueId: selectedIssue.id,
                    field: "create",
                    beforeValue: "",
                    afterValue: target.contentType || `コンテンツ${insertIndex + 1}行目`,
                    label: `コンテンツ${insertIndex + 1}行目`,
                    rowIndex: insertIndex,
                    timestamp: Date.now()
                }
            });
            return renumberedRows;
        });
    };
    const deleteContentRow = async (index)=>{
        if (isSelectedIssueReadOnly) return;
        const target = contentRows[index];
        if (!target) return;
        if (!isContentRowEmpty(target) && !await confirmDeleteRow(`コンテンツ${index + 1}行目`)) {
            return;
        }
        setContentRows((rows)=>{
            const nextRows = renumberRows(rows.filter((_, rowIndex)=>rowIndex !== index));
            void commitContentRows(nextRows, {
                undoAction: {
                    kind: "content",
                    issueId: selectedIssue.id,
                    field: "delete",
                    beforeValue: target.contentType || `コンテンツ${index + 1}行目`,
                    afterValue: "",
                    label: `コンテンツ${index + 1}行目`,
                    rowIndex: index,
                    timestamp: Date.now()
                }
            });
            return nextRows;
        });
    };
    const updateIssueForm = (key, value)=>{
        if (isSelectedIssueReadOnly) return;
        setIssueForm((current)=>({
                ...current,
                [key]: value
            }));
    };
    const commitIssueFormField = useCallback(async (key, value, options?: {
        skipUndo?: boolean;
    })=>{
        if (selectedIssue.status === "submitted" || selectedIssue.status === "on_hold") return;
        if (!selectedIssue.id) return;
        if (isUnsavedNewIssue(selectedIssue)) {
            if (!activeMagazine || key !== "issueTitle" && key !== "titleReading" || issueCreatePendingRef.current) return;
            const draftTitle = String(key === "issueTitle" ? value : issueForm.issueTitle ?? "").trim();
            const draftReading = String(key === "titleReading" ? value : issueForm.titleReading ?? "").trim();
            if (!draftTitle || !draftReading) return;
            const debugDelayMs = getIssueSaveDebugDelayMs();
            const savingMessage = debugDelayMs > 0 ? `新規保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "新規保存中";
            issueCreatePendingRef.current = true;
            setIssueSaveStatus("saving");
            setIssueSaveMessage(savingMessage);
            showHeaderSaveNotice("saving", savingMessage);
            try {
                const response = await fetch("/api/magazine-issues", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        magazineId: activeMagazine.id,
                        issueTitle: draftTitle,
                        titleReading: draftReading,
                        debugDelayMs
                })
            });
            const body = await response.json() as MagazineIssuePatchResponse;
            throwIfDatabaseUnavailable(response, body, "雑誌個別の新規保存に失敗しました");
            if (!response.ok || !body.issue) throw new Error(body.error || "雑誌個別の新規保存に失敗しました");
            const createdIssue = body.issue;
                setIssuesByMagazineId((current)=>{
                    const currentRows = current[activeMagazine.id] ?? [];
                    const nextRows = [
                        createdIssue,
                        ...currentRows.filter((issue)=>issue.id !== createdIssue.id)
                    ];
                    return {
                        ...current,
                        [activeMagazine.id]: nextRows
                    };
                });
                setMagazineIssueCounts((current)=>({
                    ...current,
                    [activeMagazine.id]: (current[activeMagazine.id] ?? 0) + 1
                }));
                setSelectedIssue(createdIssue);
                const nextForm = {
                    ...createEmptyIssueForm(activeMagazine.title),
                    issueTitle: createdIssue.title ?? draftTitle,
                    titleReading: createdIssue.titleReading ?? draftReading,
                    publicationFrequency: createdIssue.publicationFrequency ?? "月刊",
                    mediaFormat: createdIssue.mediaFormat ?? "print",
                    publishersJson: createdIssue.publishersJson ?? "",
                    status: createdIssue.status === "published" ? "active" : createdIssue.status
                } as IssueForm;
                setIssueForm(nextForm);
                setStoryRows(createdIssue.stories && createdIssue.stories.length > 0 ? createdIssue.stories : emptyStoryRows());
                setContentRows(createdIssue.contents && createdIssue.contents.length > 0 ? ensureContentRowClientKeys(createdIssue.contents) : emptyContentRows());
                savedIssueFormRef.current = nextForm;
                savedStoryRowsRef.current = createdIssue.stories && createdIssue.stories.length > 0 ? createdIssue.stories : emptyStoryRows();
                savedContentRowsRef.current = createdIssue.contents && createdIssue.contents.length > 0 ? ensureContentRowClientKeys(createdIssue.contents) : emptyContentRows();
                setUndoStack([]);
                setRouteContext({});
                setBrowserUrl(buildIssueRoutePath(activeMagazine.id, createdIssue.id));
                setIssueSaveStatus("saved");
                setIssueSaveMessage("新規保存済み");
                showHeaderSaveNotice("saved", "新規保存済み");
                recordSavedIssueWorkHistory({
                    issueId: createdIssue.id,
                    issueLabel: buildIssueDisplayLabel(nextForm) || createdIssue.label || createdIssue.id,
                    lastAction: "create_magazine_issue",
                    magazineId: activeMagazine.id,
                    magazineTitle: activeMagazine.title
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : "新規保存に失敗しました";
                setIssueSaveStatus("error");
                setIssueSaveMessage(message);
                showHeaderSaveNotice("error", message);
            } finally {
                issueCreatePendingRef.current = false;
            }
            return;
        }
        const previousValue = savedIssueFormRef.current[key];
        if (areUndoValuesEqual(previousValue, value)) return;
        const debugDelayMs = getIssueSaveDebugDelayMs();
        setIssueSaveStatus("saving");
        setIssueSaveMessage(debugDelayMs > 0 ? `保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "保存中");
        showHeaderSaveNotice("saving", debugDelayMs > 0 ? `保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "保存中");
        try {
            const response = await fetch("/api/magazine-issues", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    issueId: selectedIssue.id,
                    field: key,
                    value,
                    undoMeta: {
                        field: String(key),
                        beforeValue: previousValue ?? "",
                        afterValue: value
                    } satisfies UndoMetadata,
                    debugDelayMs
                })
            });
            const body = await response.json() as MagazineIssuePatchResponse;
            throwIfDatabaseUnavailable(response, body, "雑誌個別情報の保存に失敗しました");
            if (!response.ok) throw new Error(body.error || "雑誌個別情報の保存に失敗しました");
            if (body.issue) mergeSavedIssue(body.issue);
            savedIssueFormRef.current = {
                ...savedIssueFormRef.current,
                [key]: value
            };
            if (!options?.skipUndo && !isUndoingRef.current) await refreshUndoStack(selectedIssue.id);
            setIssueSaveStatus("saved");
            setIssueSaveMessage("保存済み");
            showHeaderSaveNotice("saved", "保存済み");
            recordSavedIssueWorkHistory({
                issueId: selectedIssue.id,
                issueLabel: buildIssueDisplayLabel({
                    ...issueForm,
                    [key]: value
                } as IssueForm) || selectedIssue.label || selectedIssue.id,
                lastAction: "save_magazine_issue",
                magazineId: activeMagazine?.id,
                magazineTitle: activeMagazine?.title
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "保存に失敗しました";
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    }, [
        activeMagazine,
        createStoryRecord,
        issueForm.issueTitle,
        issueForm.titleReading,
        mergeSavedIssue,
        refreshUndoStack,
        selectedIssue.id,
        selectedIssue.status,
        setBrowserUrl,
        showHeaderSaveNotice,
        storyRows
    ]);
    const buildIssueFormFromIssue = useCallback((issue: ExistingIssue, magazineTitle: string, current: IssueForm): IssueForm=>{
        const resolvedMagazineTitle = resolveMagazineDisplayTitle({
            magazineId: issue.magazineId,
            selectedTitle: activeMagazine?.title,
            formTitle: issueForm.magazineTitle,
            issueMagazineTitle: issue.magazineTitle,
            issueTitle: magazineTitle || issue.title
        });
        const parsedDate = parseIssueDate(issue.date);
        const year = issue.year || parsedDate.year;
        const month = issue.month || parsedDate.month;
        const day = issue.day || parsedDate.day;
        const displayYear = issue.displayYear || year;
        const displayMonth = issue.displayMonth || month;
        const displayDay = issue.displayYear || issue.displayMonth ? issue.displayDay ?? "" : day;
        return {
            ...current,
            magazineTitle: resolvedMagazineTitle,
            issueTitle: issue.title || resolvedMagazineTitle,
            titleReading: issue.titleReading ?? current.titleReading,
            subtitle: issue.subtitle ?? "",
            subtitleReading: issue.subtitleReading ?? "みていぎ",
            publicationFrequency: issue.publicationFrequency ?? current.publicationFrequency,
            mediaFormat: issue.mediaFormat ?? current.mediaFormat,
            releaseYear: year,
            releaseMonth: month,
            releaseDay: day,
            displayReleaseYear: displayYear,
            displayReleaseMonth: displayMonth,
            displayReleaseDay: displayDay,
            displayReleaseCombinedMonth: issue.displayCombinedMonth ?? "",
            displayReleaseCombinedDay: issue.displayCombinedDay ?? "",
            publicationYear: issue.publicationYear ?? year,
            publicationMonth: issue.publicationMonth ?? month,
            publicationDay: issue.publicationDay ?? day,
            publicationCombinedMonth: issue.publicationCombinedMonth ?? "",
            publicationCombinedDay: issue.publicationCombinedDay ?? "",
            volumeNumber: issue.volumeNumber ?? "",
            issueNumber: issue.issueNumber ?? "",
            totalIssueNumber: issue.totalIssueNumber ?? "",
            volumeNumberDisplayed: issue.issueNumberDisplayed ?? "",
            issueNumberCombined: issue.subIssueNumber ?? "",
            volumeIssueNote: issue.volumeIssueNote ?? "",
            publishersJson: issue.publishersJson ?? "",
            publisherPerson: issue.publisherPerson ?? "",
            editorPerson: issue.editorPerson ?? "",
            relatedMagazinesJson: issue.relatedMagazinesJson ?? "",
            binding: issue.binding ?? "",
            magazineCode: issue.magazineCode ?? "",
            category: issue.category?.join(", ") ?? "",
            rating: issue.rating ?? "",
            price: issue.price ?? "",
            size: issue.size ?? "",
            numberOfPages: issue.numberOfPages ?? "",
            isSpecialIssue: issue.isSpecialIssue ?? false,
            isMitsumine: issue.isMitsumine ?? false,
            note: issue.note ?? "",
            tag: issue.tag?.join(", ") ?? "",
            status: issue.status === "published" ? "active" : issue.status
        };
    }, [
        activeMagazine?.title,
        issueForm.magazineTitle
    ]);
    const applyIssueRowsState = useCallback((issue: ExistingIssue)=>{
        const nextRows = resolveIssueRows(issue);
        setStoryRows(nextRows.storyRows);
        setContentRows(nextRows.contentRows);
        savedStoryRowsRef.current = nextRows.storyRows;
        savedContentRowsRef.current = nextRows.contentRows;
    }, []);
    const syncMagazineContextForIssue = useCallback((issue: ExistingIssue, magazineTitle: string)=>{
        const nextMagazineId = issue.magazineId || activeMagazine?.id || "";
        if (!nextMagazineId) return;
        syncSelectedMagazine(createMagazineHistoryItemFromIssue({
            magazineId: nextMagazineId,
            title: resolveMagazineDisplayTitle({
                magazineId: nextMagazineId,
                selectedTitle: activeMagazine?.title,
                formTitle: issueForm.magazineTitle,
                issueMagazineTitle: issue.magazineTitle,
                issueTitle: magazineTitle || issue.title
            }),
            publisher: issue.publisherName || activeMagazine?.publisher,
            lastEdited: activeMagazine?.lastEdited,
            note: activeMagazine?.note
        }));
    }, [
        activeMagazine,
        issueForm.magazineTitle,
        syncSelectedMagazine
    ]);
    const applyIssueToForm = (issue: ExistingIssue, magazineTitle: string)=>{
        const nextForm = buildIssueFormFromIssue(issue, magazineTitle, savedIssueFormRef.current);
        setIssueForm(nextForm);
        savedIssueFormRef.current = nextForm;
        applyIssueRowsState(issue);
        setUndoStack([]);
        syncMagazineContextForIssue(issue, magazineTitle);
    };
    const loadMagazineIssues = useCallback(async (magazineId?: string)=>{
        const path = magazineId ? `/api/magazine-issues?magazineId=${encodeURIComponent(magazineId)}` : "/api/magazine-issues";
        const response = await fetch(path);
        const body = await response.json() as MagazineIssuesResponse;
        if (isDatabaseUnavailableApiError(response, body)) {
            navigateToErrorRoute("db-unavailable");
            throw new Error(body.error || "データベースに接続できません。");
        }
        if (!response.ok) {
            throw new Error(body.error || `雑誌個別APIが ${response.status} を返しました`);
        }
        if (body.counts) {
            setMagazineIssueCounts(Object.fromEntries(body.counts.map((count)=>[
                    count.magazineId,
                    count.count
                ])));
        }
        const issues = body.issues ?? [];
        if (magazineId) {
            setIssuesByMagazineId((current)=>({
                    ...current,
                    [magazineId]: issues
                }));
        }
        setMagazineIssueLoadError("");
        return issues;
    }, [
        navigateToErrorRoute
    ]);
    const performUndo = useCallback(async ()=>{
        const latestAction = undoStack[0];
        if (!latestAction || latestAction.issueId !== selectedIssue.id || issueSaveStatus === "saving" || !activeMagazine?.id) return;
        isUndoingRef.current = true;
        try {
            const response = await fetch("/api/user-undo/apply", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    issueId: selectedIssue.id
                })
            });
            const body = await response.json() as ApplyUndoResponse;
            throwIfDatabaseUnavailable(response, body, "アンドゥに失敗しました");
            if (!response.ok) throw new Error(body.error || "アンドゥに失敗しました");
            pendingUndoFocusRef.current = latestAction;
            prepareUndoTargetVisibility(latestAction);
            const nextIssues = await loadMagazineIssues(activeMagazine.id);
            const nextSelectedIssue = nextIssues.find((issue)=>issue.id === selectedIssue.id);
            if (nextSelectedIssue) {
                setSelectedIssue(nextSelectedIssue);
                applyIssueToForm(nextSelectedIssue, activeMagazine.title);
            }
            await refreshUndoStack(selectedIssue.id);
            showHeaderSaveNotice("saved", `元に戻しました: ${body.label || latestAction.label}`);
        } finally {
            isUndoingRef.current = false;
        }
    }, [
        undoStack,
        selectedIssue.id,
        issueSaveStatus,
        activeMagazine,
        loadMagazineIssues,
        prepareUndoTargetVisibility,
        applyIssueToForm,
        refreshUndoStack,
        showHeaderSaveNotice
    ]);
    useEffect(()=>{
        if (view !== "mi") return;
        const handleKeyDown = (event: KeyboardEvent)=>{
            if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
            if (event.key.toLowerCase() !== "z") return;
            event.preventDefault();
            void performUndo();
        };
        window.addEventListener("keydown", handleKeyDown);
        return ()=>window.removeEventListener("keydown", handleKeyDown);
    }, [
        view,
        performUndo
    ]);
    useEffect(()=>{
        loadMagazineIssues().catch((error)=>{
            setMagazineIssueLoadError(error instanceof Error ? error.message : "雑誌個別DBの読み込みに失敗しました");
        });
    }, [
        loadMagazineIssues
    ]);
    useEffect(()=>{
        let isActive = true;
        fetch("/api/magazine-titles").then(async (response)=>{
            const body = await response.json() as MagazineTitlesResponse;
            if (isDatabaseUnavailableApiError(response, body)) {
                navigateToErrorRoute("db-unavailable");
                throw new Error("db_unavailable");
            }
            if (!response.ok) {
                throw new Error(body.error || `雑誌マスターAPIが ${response.status} を返しました`);
            }
            if (!isActive) return;
            const records = body.records ?? [];
            setMiMagazineDirectoryOptions(records.map((magazine)=>({
                        id: magazine.id,
                        internalKey: magazine.internalId ?? "",
                        name: magazine.name,
                        reading: magazine.reading,
                        aliases: [
                            magazine.id
                        ]
                    })).sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")));
        }).catch(()=>{
            if (!isActive) return;
            setMiMagazineDirectoryOptions([]);
        });
        return ()=>{
            isActive = false;
        };
    }, [
        navigateToErrorRoute
    ]);
    const selectMagazineFromHistory = async (magazine: MagazineHistoryItem)=>{
        let issues = issuesByMagazineId[magazine.id] ?? [];
        if (!issuesByMagazineId[magazine.id]) {
            try {
                issues = await loadMagazineIssues(magazine.id);
            } catch (error) {
                setMagazineIssueLoadError(error instanceof Error ? error.message : "雑誌個別DBの読み込みに失敗しました");
            }
        }
        const latestIssue = issues[0] ?? ({
            id: `NEW-${magazine.id}`,
            magazineId: magazine.id,
            date: "",
            label: "新規",
            title: magazine.title,
            digest: "新規作成",
            status: "draft"
        } as ExistingIssue);
        const nextForm = issues[0] ? savedIssueFormRef.current : createEmptyIssueForm(magazine.title);
        setRouteContext({
            from: "history"
        });
        syncSelectedMagazine(magazine);
        setSelectedIssue(latestIssue);
        if (issues[0]) {
            applyIssueToForm(latestIssue, magazine.title);
            setBrowserUrl(buildIssueRoutePath(magazine.id, latestIssue.id, {
                from: "history"
            }));
        } else {
            const nextStoryRows = emptyStoryRows();
            const nextContentRows = emptyContentRows();
            setIssueForm(nextForm);
            setStoryRows(nextStoryRows);
            setContentRows(nextContentRows);
            savedIssueFormRef.current = nextForm;
            savedStoryRowsRef.current = nextStoryRows;
            savedContentRowsRef.current = nextContentRows;
            setUndoStack([]);
            setBrowserUrl(`/magazines/${encodeURIComponent(magazine.id)}/issues/new?from=history`);
        }
        setIsHistoryOpen(false);
        setView("mi");
    };
    const selectExistingIssue = (issue)=>{
        setSelectedIssue(issue);
        applyIssueToForm(issue, activeMagazine?.title ?? issue.magazineTitle ?? issue.title);
        setIsIssueListOpen(false);
        if (activeMagazine?.id) {
            const context = {
                from: "issue-list"
            };
            setRouteContext(context);
            setBrowserUrl(buildIssueRoutePath(activeMagazine.id, issue.id, context));
        }
    };
    const openLatestMagazineIssue = async (record: MagazineMasterRecord)=>{
        let issues = issuesByMagazineId[record.id] ?? [];
        if (!issuesByMagazineId[record.id]) {
            try {
                issues = await loadMagazineIssues(record.id);
            } catch (error) {
                setMagazineIssueLoadError(error instanceof Error ? error.message : "雑誌個別DBの読み込みに失敗しました");
            }
        }
        const latestIssue = issues[0] ?? createDraftIssue(record);
        syncSelectedMagazine(createMagazineHistoryItem(record));
        setSelectedIssue(latestIssue);
        if (issues[0]) {
            applyIssueToForm(latestIssue, record.name);
        } else {
            const nextForm = createEmptyIssueForm(record.name);
            setIssueForm(nextForm);
            setStoryRows(emptyStoryRows());
            setContentRows(emptyContentRows());
            savedIssueFormRef.current = nextForm;
            savedStoryRowsRef.current = emptyStoryRows();
            savedContentRowsRef.current = emptyContentRows();
            setUndoStack([]);
        }
        const context = {
            from: "magazine-master"
        };
        setRouteContext(context);
        setBrowserUrl(buildIssueRoutePath(record.id, latestIssue.id, context));
        setView("mi");
    };
    const openNewIssueForSelectedMagazine = ()=>{
        if (!activeMagazine) return;
        const nextForm = createEmptyIssueForm(activeMagazine.title);
        const nextStoryRows = emptyStoryRows();
        const nextContentRows = emptyContentRows();
        setSelectedIssue({
            id: `NEW-${activeMagazine.id}`,
            date: "",
            label: "新規",
            title: activeMagazine.title,
            digest: "新規作成",
            status: "draft"
        });
        setIssueForm(nextForm);
        setStoryRows(nextStoryRows);
        setContentRows(nextContentRows);
        savedIssueFormRef.current = nextForm;
        savedStoryRowsRef.current = nextStoryRows;
        savedContentRowsRef.current = nextContentRows;
        setUndoStack([]);
        setIsIssueListOpen(false);
        setRouteContext({});
        setBrowserUrl(`/magazines/${encodeURIComponent(activeMagazine.id)}/issues/new`);
        setView("mi");
    };
    const openIssueCopyDialog = useCallback(()=>{
        if (!activeMagazine) return;
        setIssueCopyDialog({
            mode: "edit",
            isSubmitting: false,
            issueLabel: buildIssueBreadcrumbLabel(issueForm) || buildIssueDisplayLabel(issueForm) || selectedIssue.label || "雑誌個別",
            magazineTitle: activeMagazine.title,
            countText: "1",
            maxCopyCount: issueCopyLimit,
            selectedFieldIds: defaultIssueCopyFieldIds,
            incrementFieldIds: [],
            sourceForm: {
                ...issueForm
            },
            previewLabels: []
        });
    }, [
        issueCopyLimit,
        issueForm,
        selectedIssue.label,
        activeMagazine
    ]);
    const openIssueDeleteDialog = useCallback(()=>{
        if (!selectedIssue.id || isUnsavedNewIssue(selectedIssue)) return;
        setIssueDeleteDialog({
            issue: selectedIssue,
            storyCount: storyRows.filter((row)=>Boolean(row.storyId?.trim() || row.title?.trim())).length,
            contentCount: contentRows.filter((row)=>Boolean(row.contentType?.trim() || row.detail?.trim() || row.pageStart?.trim() || row.pageEnd?.trim() || row.contributorsJson?.trim())).length
        });
    }, [
        selectedIssue,
        storyRows,
        contentRows
    ]);
    const toggleIssueCopyField = useCallback((fieldId: IssueCopyFieldId)=>{
        setIssueCopyDialog((current)=>{
            if (!current) return current;
            return {
                ...current,
                selectedFieldIds: current.selectedFieldIds.includes(fieldId)
                    ? current.selectedFieldIds.filter((id)=>id !== fieldId)
                    : [
                        ...current.selectedFieldIds,
                        fieldId
                    ]
            };
        });
    }, []);
    const toggleIssueCopyIncrementField = useCallback((fieldId: IssueCopyIncrementFieldId)=>{
        setIssueCopyDialog((current)=>{
            if (!current) return current;
            return {
                ...current,
                incrementFieldIds: current.incrementFieldIds.includes(fieldId)
                    ? current.incrementFieldIds.filter((id)=>id !== fieldId)
                    : [
                        ...current.incrementFieldIds,
                        fieldId
                    ]
            };
        });
    }, []);
    const openIssueCopyConfirm = useCallback(()=>{
        setIssueCopyDialog((current)=>{
            if (!current) return current;
            const previewForms = buildIssueCopyPreviewForms(current);
            return {
                ...current,
                mode: "confirm",
                previewLabels: previewForms.map((form)=>buildIssueDigestTitle(form) || buildIssueDisplayLabel(form) || current.issueLabel)
            };
        });
    }, []);
    const returnIssueCopyEditor = useCallback(()=>{
        setIssueCopyDialog((current)=>current ? {
                ...current,
                mode: "edit"
            } : current);
    }, []);
    const executeIssueCopyInsert = useCallback(async ()=>{
        if (!activeMagazine || !issueCopyDialog || issueCopyDialog.isSubmitting) return;
        const dialogState = issueCopyDialog;
        const previewForms = buildIssueCopyPreviewForms(dialogState);
        if (previewForms.length === 0) {
            setIssueSaveStatus("error");
            setIssueSaveMessage("コピー件数が不正です");
            showHeaderSaveNotice("error", "コピー件数が不正です");
            return;
        }
        const debugDelayMs = getIssueSaveDebugDelayMs();
        setIssueCopyDialog((current)=>current ? {
                ...current,
                isSubmitting: true
            } : current);
        setIssueSaveStatus("saving");
        setIssueSaveMessage(`コピー追加中 1/${previewForms.length}`);
        showHeaderSaveNotice("saving", `コピー追加中 1/${previewForms.length}`);
        try {
            const createdIssueIds: string[] = [];
            for (let index = 0; index < previewForms.length; index += 1) {
                const form = previewForms[index];
                setIssueSaveMessage(`コピー追加中 ${index + 1}/${previewForms.length}`);
                showHeaderSaveNotice("saving", `コピー追加中 ${index + 1}/${previewForms.length}`);
                const createResponse = await fetch("/api/magazine-issues", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        magazineId: activeMagazine.id,
                        issueTitle: form.issueTitle,
                        titleReading: form.titleReading,
                        debugDelayMs
                    })
                });
                const createBody = await createResponse.json() as MagazineIssuePatchResponse;
                if (!createResponse.ok || !createBody.issue) {
                    throw new Error(createBody.error || `${index + 1}件目の新規作成に失敗しました`);
                }
                let savedIssue = createBody.issue;
                const patchEntries = collectIssueCopyPatchEntries(dialogState.selectedFieldIds, form);
                for (const entry of patchEntries) {
                    const patchResponse = await fetch("/api/magazine-issues", {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            issueId: savedIssue.id,
                            field: entry.key,
                            value: entry.value,
                            debugDelayMs
                        })
                    });
                    const patchBody = await patchResponse.json() as MagazineIssuePatchResponse;
                    if (!patchResponse.ok) {
                        throw new Error(patchBody.error || `${index + 1}件目の保存に失敗しました`);
                    }
                    if (patchBody.issue) savedIssue = patchBody.issue;
                }
                createdIssueIds.push(savedIssue.id);
            }
            const nextIssues = await loadMagazineIssues(activeMagazine.id);
            const selectedCreatedIssueId = createdIssueIds[createdIssueIds.length - 1] ?? "";
            const nextSelectedIssue = nextIssues.find((issue)=>issue.id === selectedCreatedIssueId) ?? nextIssues[0] ?? null;
            if (nextSelectedIssue) {
                setSelectedIssue(nextSelectedIssue);
                applyIssueToForm(nextSelectedIssue, activeMagazine.title);
                setRouteContext({});
                setBrowserUrl(buildIssueRoutePath(activeMagazine.id, nextSelectedIssue.id));
            }
            setIssueCopyDialog(null);
            const successMessage = `${previewForms.length}件を追加しました`;
            setIssueSaveStatus("saved");
            setIssueSaveMessage(successMessage);
            showHeaderSaveNotice("saved", successMessage);
        } catch (error) {
            const message = error instanceof Error ? error.message : "コピー追加に失敗しました";
            setIssueCopyDialog((current)=>current ? {
                    ...current,
                    isSubmitting: false
                } : current);
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    }, [
        applyIssueToForm,
        issueCopyDialog,
        loadMagazineIssues,
        activeMagazine,
        showHeaderSaveNotice,
        setBrowserUrl
    ]);
    const deleteSelectedIssue = useCallback(async ()=>{
        if (selectedIssue.status === "submitted" || selectedIssue.status === "on_hold") {
            setIssueDeleteDialog(null);
            return;
        }
        if (!activeMagazine || !selectedIssue.id || isUnsavedNewIssue(selectedIssue)) {
            setIssueDeleteDialog(null);
            return;
        }
        setIssueDeleteDialog(null);
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `削除中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "削除中";
        setIssueSaveStatus("saving");
        setIssueSaveMessage(savingMessage);
        showHeaderSaveNotice("saving", savingMessage);
        try {
            const response = await fetch("/api/magazine-issues", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    issueId: selectedIssue.id,
                    debugDelayMs
                })
            });
            const body = await response.json() as MagazineIssueDeleteResponse;
            throwIfDatabaseUnavailable(response, body, "雑誌個別の削除に失敗しました");
            if (!response.ok) throw new Error(body.error || "雑誌個別の削除に失敗しました");
            const nextIssues = await loadMagazineIssues(activeMagazine.id);
            const nextIssue = nextIssues[0] ?? null;
            if (nextIssue) {
                setSelectedIssue(nextIssue);
                applyIssueToForm(nextIssue, activeMagazine.title);
            } else {
                openNewIssueForSelectedMagazine();
            }
            const deletedStoryCount = body.deletedStoryCount ?? body.deletedStoryIds?.length ?? 0;
            const updatedStoryCount = body.updatedStoryCount ?? 0;
            const deletedContentCount = body.deletedContentCount ?? 0;
            const successParts = [
                "削除しました",
                deletedContentCount > 0 ? `コンテンツ${deletedContentCount}件` : "",
                deletedStoryCount > 0 ? `story${deletedStoryCount}件も理論削除` : "",
                updatedStoryCount > 0 ? `story${updatedStoryCount}件は参照先を更新` : ""
            ].filter(Boolean);
            const successMessage = successParts.join(" / ");
            setIssueSaveStatus("saved");
            setIssueSaveMessage(successMessage);
            showHeaderSaveNotice("saved", successMessage);
        } catch (error) {
            const message = error instanceof Error ? error.message : "雑誌個別の削除に失敗しました";
            setIssueSaveStatus("error");
            setIssueSaveMessage(message);
            showHeaderSaveNotice("error", message);
        }
    }, [
        activeMagazine,
        selectedIssue,
        loadMagazineIssues,
        applyIssueToForm,
        openNewIssueForSelectedMagazine,
        showHeaderSaveNotice
    ]);
    const selectMasterFromHistory = (kind: MasterEditorKind, id: string, context?: RouteContext)=>{
        setSelectedMasterHistoryIds((current)=>({
                ...current,
                [kind]: id
            }));
        setMasterHistorySelection({
            kind,
            id
        });
        setRouteContext(context ?? {});
        setBrowserUrl(buildMasterRoutePath(kind, id, context));
        setIsHistoryOpen(false);
        setView(kind);
    };
    const handleMasterRecordSelected = (kind: MasterEditorKind, id: string, options?: { preserveRouteContext?: boolean })=>{
        setSelectedMasterHistoryIds((current)=>({
                ...current,
                [kind]: id
            }));
        if (!options?.preserveRouteContext) {
            setRouteContext({});
        }
    };
    const resolveRouteIssueSelection = useCallback((route: ParsedRoute, issues: ExistingIssue[])=>{
        if (route.view !== "mi" || !route.magazineId) return null;
        if (route.isNewIssue) return null;
        if (route.issueId) return issues.find((candidate)=>candidate.id === route.issueId) ?? null;
        return issues[0] ?? null;
    }, []);
    const applyMagazineIssueRouteState = useCallback((route: ParsedRoute, issue: ExistingIssue | null)=>{
        if (route.view !== "mi" || !route.magazineId) return;
        const magazineTitle = issue?.magazineTitle || issue?.title || route.magazineId;
        const magazine = createMagazineHistoryItemFromIssue({
            magazineId: route.magazineId,
            title: magazineTitle,
            publisher: issue?.publisherName || "出版社不明",
            lastEdited: "URLから表示",
            note: "URLから表示"
        });
        syncSelectedMagazine(magazine);
        if (route.isNewIssue || !issue) {
            setSelectedIssue(createDraftIssue({
                id: route.magazineId,
                name: magazineTitle
            } as MagazineMasterRecord));
            setIssueForm(createEmptyIssueForm(magazineTitle));
            setStoryRows(emptyStoryRows());
            setContentRows(emptyContentRows());
        } else {
            setSelectedIssue(issue);
            applyIssueToForm(issue, magazineTitle);
        }
        setView("mi");
    }, [
        applyIssueToForm,
        syncSelectedMagazine
    ]);
    const applyParsedRoute = useCallback(async (route: ParsedRoute | null)=>{
        if (!route) {
            setActiveErrorRoute(null);
            setView(getDefaultModeView(isPhoneModeRef.current));
            return;
        }
        isApplyingRouteRef.current = true;
        setRouteContext(route.context ?? {});
        setIsHistoryOpen(false);
        setIsIssueListOpen(false);
        try {
            if (route.errorKind) {
                setActiveErrorRoute(route.errorKind);
                setView("view");
                return;
            }
            setActiveErrorRoute(null);
            if (isPhoneModeRef.current) {
                setView("view");
                return;
            }
            if (route.masterKind) {
                if (route.masterId) {
                    setSelectedMasterHistoryIds((current)=>({
                            ...current,
                            [route.masterKind as MasterEditorKind]: route.masterId as string
                        }));
                    setMasterHistorySelection({
                        kind: route.masterKind,
                        id: route.masterId
                    });
                }
                setView(route.masterKind);
                return;
            }
            if (route.view === "mi" && route.magazineId) {
                let issues = issuesByMagazineId[route.magazineId] ?? [];
                if (!issuesByMagazineId[route.magazineId]) {
                    try {
                        issues = await loadMagazineIssues(route.magazineId);
                    } catch (error) {
                        setMagazineIssueLoadError(error instanceof Error ? error.message : "雑誌個別DBの読み込みに失敗しました");
                    }
                }
                const issue = resolveRouteIssueSelection(route, issues);
                applyMagazineIssueRouteState(route, issue);
                return;
            }
            setView(route.view);
        } finally {
            window.setTimeout(()=>{
                isApplyingRouteRef.current = false;
            }, defaultUiPreferences.routeApplyReleaseDelayMs);
        }
    }, [
        issuesByMagazineId,
        loadMagazineIssues,
        resolveRouteIssueSelection,
        applyMagazineIssueRouteState
    ]);
    const navigateToView = (nextView: ViewKey)=>{
        if (isPhoneModeRef.current) {
            setRouteContext({});
            setActiveErrorRoute(null);
            setBrowserUrl("/", "replace");
            setView("view");
            return;
        }
        setRouteContext({});
        setActiveErrorRoute(null);
        if (isMasterView(nextView)) {
            setBrowserUrl(buildMasterRoutePath(nextView));
        } else {
            setBrowserUrl(`/${nextView}`);
        }
        setView(nextView);
    };
    useEffect(()=>{
        if (typeof window === "undefined") return;
        const applyCurrentLocation = ()=>{
            const route = parseAppRoute(window.location.pathname, window.location.search);
            void applyParsedRoute(route);
        };
        const initialRoute = parseAppRoute(window.location.pathname, window.location.search);
        if (initialRoute) {
            void applyParsedRoute(initialRoute).finally(()=>setIsRouteReady(true));
        } else {
            setBrowserUrl(isPhoneViewport() ? "/" : buildMasterRoutePath("magazines"), "replace");
            setIsRouteReady(true);
        }
        window.addEventListener("popstate", applyCurrentLocation);
        return ()=>{
            window.removeEventListener("popstate", applyCurrentLocation);
        };
    }, []);
    useEffect(()=>{
        if (!isRouteReady || typeof window === "undefined") return;
        if (activeErrorRoute) return;
        if (isPhoneMode) {
            if (window.location.pathname !== "/") {
                setBrowserUrl("/", "replace");
            }
            if (view !== "view") {
                setRouteContext({});
                setView("view");
            }
            return;
        }
        if (window.location.pathname === "/" || view === "view") {
            setRouteContext({});
            setView("magazines");
            setBrowserUrl(buildMasterRoutePath("magazines"), "replace");
        }
    }, [
        activeErrorRoute,
        isPhoneMode,
        isRouteReady,
        view,
        setBrowserUrl
    ]);
    useEffect(()=>{
        if (!isRouteReady || isApplyingRouteRef.current) return;
        if (activeErrorRoute) return;
        let nextUrl = "";
        if (isMasterView(view)) {
            nextUrl = buildMasterRoutePath(view, selectedMasterHistoryIds[view], routeContext);
        } else if (view === "mi" && activeMagazine) {
            const issueId = isUnsavedNewIssue(selectedIssue) ? "new" : selectedIssue.id;
            nextUrl = issueId === "new"
                ? appendRouteContext(`/magazines/${encodeURIComponent(activeMagazine.id)}/issues/new`, routeContext)
                : buildIssueRoutePath(activeMagazine.id, issueId, routeContext);
        } else if (view === "books" || view === "approvals" || view === "users") {
            nextUrl = `/${view}`;
        }
        if (nextUrl) setBrowserUrl(nextUrl, "replace");
    }, [
        activeErrorRoute,
        isRouteReady,
        view,
        selectedMasterHistoryIds,
        activeMagazine,
        selectedIssue,
        routeContext,
        setBrowserUrl
    ]);
    const navigateByUrl = useCallback((url: string)=>{
        if (typeof window === "undefined") return;
        const nextUrl = new URL(url, window.location.origin);
        setActiveErrorRoute(null);
        setBrowserUrl(`${nextUrl.pathname}${nextUrl.search}`);
        void applyParsedRoute(parseAppRoute(nextUrl.pathname, nextUrl.search));
    }, [
        applyParsedRoute,
        setBrowserUrl
    ]);
    const openHistoryDialog = useCallback(()=>{
        setIsHistoryOpen(true);
        setIsIssueListOpen(false);
        void loadWorkHistories();
    }, [
        loadWorkHistories
    ]);
    const closeHistoryDialog = useCallback(()=>{
        setIsHistoryOpen(false);
    }, []);
    const toggleIssueList = ()=>{
        setIsIssueListOpen((value)=>{
            const nextValue = !value;
            if (nextValue) {
                setIsHistoryOpen(false);
                if (activeMagazine?.id) {
                    loadMagazineIssues(activeMagazine.id).catch((error)=>{
                        setMagazineIssueLoadError(error instanceof Error ? error.message : "雑誌個別DBの読み込みに失敗しました");
                    });
                }
            }
            return nextValue;
        });
    };
    const workHistoryDialogEntries = useMemo<WorkHistoryDialogEntry[]>(()=>workHistoryEntries.map((entry)=>({
                id: entry.id,
                kind: entry.targetType,
                label: buildWorkHistoryLabel(entry),
                updatedAtLabel: formatWorkHistoryTimestamp(entry.lastWorkedAt),
                isActive: entry.targetType === "magazine_issue"
                    ? view === "mi" && selectedIssue.id === entry.targetId
                    : entry.targetType === "magazine_title"
                        ? view === "magazines" && selectedMasterHistoryIds.magazines === entry.targetId
                        : entry.targetType === "author"
                            ? view === "authors" && selectedMasterHistoryIds.authors === entry.targetId
                            : view === "publishers" && selectedMasterHistoryIds.publishers === entry.targetId
            })), [
        workHistoryEntries,
        view,
        selectedIssue.id,
        selectedMasterHistoryIds
    ]);
    const handleWorkHistorySelect = useCallback(async (entryId: string)=>{
        const entry = workHistoryEntries.find((item)=>item.id === entryId);
        if (!entry) return;
        if (hasUnsavedChanges) {
            const isConfirmed = await showConfirmDialog({
                title: "編集中の確認",
                message: "現在の編集内容が残っています。離れてもいいですか？",
                confirmLabel: "OK",
                cancelLabel: "キャンセル"
            });
            if (!isConfirmed) return;
        }
        setIsHistoryOpen(false);
        if (entry.targetType === "magazine_issue" && entry.parentId) {
            navigateByUrl(buildIssueRoutePath(entry.parentId, entry.targetId, {
                from: "history"
            }));
            return;
        }
        if (entry.targetType === "magazine_title") {
            navigateByUrl(buildMasterRoutePath("magazines", entry.targetId, {
                from: "history"
            }));
            return;
        }
        if (entry.targetType === "author") {
            navigateByUrl(buildMasterRoutePath("authors", entry.targetId, {
                from: "history"
            }));
            return;
        }
        if (entry.targetType === "publisher") {
            navigateByUrl(buildMasterRoutePath("publishers", entry.targetId, {
                from: "history"
            }));
        }
    }, [
        workHistoryEntries,
        hasUnsavedChanges,
        navigateByUrl
    ]);
    const selectedMagazineIssues = activeMagazine?.id ? issuesByMagazineId[activeMagazine.id] ?? [] : [];
    const latestUndoAction = undoStack[0];
    const canUndo = view === "mi" && !!latestUndoAction && latestUndoAction.issueId === selectedIssue.id && issueSaveStatus !== "saving";
    const isMagazineIssueRoutePending = view === "mi" && (!isRouteReady || isApplyingRouteRef.current);
    const handleLoginSubmit = useCallback(async ()=>{
        if (isLoginSubmitting) return;
        setIsLoginSubmitting(true);
        setLoginErrorMessage("");
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    loginName: loginNameInput,
                    password: loginPasswordInput
                })
            });
            const body = await response.json() as AuthSessionResponse;
            if (isDatabaseUnavailableApiError(response, body)) {
                setCurrentUser(null);
                setLoginErrorMessage("");
                setIsHistoryOpen(false);
                navigateToErrorRoute("db-unavailable");
                return;
            }
            if (!response.ok || !body.user) {
                throw new Error(body.error || "ログインに失敗しました。");
            }
            setCurrentUser(body.user);
            setLoginNameInput(body.user.loginName);
            setLoginErrorMessage("");
        } catch (error) {
            setCurrentUser(null);
            setLoginErrorMessage(sanitizeLoginErrorMessage(error instanceof Error ? error.message : "ログインに失敗しました。"));
        } finally {
            setIsLoginSubmitting(false);
        }
    }, [
        isLoginSubmitting,
        loginNameInput,
        loginPasswordInput,
        navigateToErrorRoute
    ]);
    const handleLogout = useCallback(async ()=>{
        try {
            await fetch("/api/auth/logout", {
                method: "POST"
            });
        } catch {
        }
        setCurrentUser(null);
        setLoginErrorMessage("");
        setIsHistoryOpen(false);
        setActiveErrorRoute(null);
        setBrowserUrl("/", "replace");
    }, [
        setBrowserUrl
    ]);
    if (activeErrorRoute === "db-unavailable") {
        return <DatabaseUnavailablePage/>;
    }
    if (activeErrorRoute === "unexpected") {
        return <UnexpectedErrorPage/>;
    }
    if (!isLoggedIn && !isPhoneMode) {
        return <LoginScreen loginName={loginNameInput} password={loginPasswordInput} errorMessage={loginErrorMessage} isLoading={isLoginSubmitting} onLoginNameChange={setLoginNameInput} onPasswordChange={setLoginPasswordInput} onSubmit={()=>void handleLoginSubmit()}/>;
    }
    return /*#__PURE__*/ _jsxs("main", {
        className: view === "view" ? `app-shell theme-${activeTheme} view-mode-shell` : `app-shell theme-${activeTheme}`,
        children: [
            /*#__PURE__*/ _jsxs("header", {
                className: "app-header",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "brand-mark",
                        children: [
                            /*#__PURE__*/ _jsxs("span", {
                                className: "brand-icon",
                                "aria-label": "表示モード",
                                children: [
                                    /*#__PURE__*/ _jsx(Monitor, {
                                        className: "device-icon monitor",
                                        size: 18
                                    }),
                                    /*#__PURE__*/ _jsx(Tablet, {
                                        className: "device-icon tablet",
                                        size: 18
                                    }),
                                    /*#__PURE__*/ _jsx(Eye, {
                                        className: "device-icon eye",
                                        size: 18
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                children: "mymag"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("label", {
                        className: "global-search",
                        children: [
                            /*#__PURE__*/ _jsx("input", {
                                placeholder: "著者、出版社、雑誌マスター、雑誌個別、単行本、storyを検索"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                "aria-label": "検索",
                                children: /*#__PURE__*/ _jsx(Search, {
                                    size: 18
                                })
                            })
                        ]
                    }),
                    !isPhoneMode && /*#__PURE__*/ _jsx(AccountMenu, {
                        isLoggedIn: isLoggedIn,
                        currentUser: currentUser,
                        onOpenHistory: openHistoryDialog,
                        onLoginRequest: ()=>setCurrentUser(null),
                        onLogout: ()=>void handleLogout(),
                        onDatabaseUnavailable: ()=>navigateToErrorRoute("db-unavailable")
                    })
                ]
            }),
                    view !== "view" && /*#__PURE__*/ _jsxs("nav", {
                className: "top-nav",
                "aria-label": "主要メニュー",
                children: primaryNavItems.map((item)=>{
                        const Icon = item.icon;
                        const href = buildViewRoutePath(item.key);
                        return /*#__PURE__*/ _jsxs("a", {
                            href: href,
                            className: viewThemes[view] === item.theme && (view === item.key || item.key === "magazines" && view === "mi") ? `top-nav-item theme-${item.theme} active` : `top-nav-item theme-${item.theme}`,
                            "aria-label": item.isUnderConstruction ? `${item.label}（工事中）` : item.label,
                            onClick: (event)=>{
                                event.preventDefault();
                                navigateToView(item.key);
                            },
                            children: [
                                /*#__PURE__*/ _jsxs("span", {
                                    className: item.isUnderConstruction ? "top-nav-icon-wrap under-construction" : "top-nav-icon-wrap",
                                    children: [
                                        /*#__PURE__*/ _jsx(Icon, {
                                            size: 18
                                        }),
                                        item.isUnderConstruction && /*#__PURE__*/ _jsx(Construction, {
                                            className: "top-nav-construction-icon",
                                            size: 11
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    children: item.label
                                }),
                                item.isUnderConstruction && /*#__PURE__*/ _jsx("span", {
                                    className: "top-nav-construction-label",
                                    children: "工事中"
                                })
                            ]
                        }, item.key);
                    })
            }),
            /*#__PURE__*/ _jsx("section", {
                className: "workspace",
                children: /*#__PURE__*/ _jsxs("section", {
                    className: "main-panel",
                    children: [
                        /*#__PURE__*/ _jsx(MobileReadOnlyView, {
                            view: view,
                            selectedMagazine: activeMagazine,
                            selectedIssue: selectedIssue,
                            issueForm: issueForm,
                            storyRows: storyRows,
                            contentRows: contentRows
                        }),
                        view !== "view" && /*#__PURE__*/ _jsxs("div", {
                            className: "body-header",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "body-header-title",
                                    children: [
                                        /*#__PURE__*/ _jsx("h1", {
                                            children: activeLabel
                                        }),
                                        view === "mi" && applicationBadgeSummary.issues[selectedIssue.id] && /*#__PURE__*/ _jsx("span", {
                                            className: `application-state-badge tone-${applicationBadgeSummary.issues[selectedIssue.id]?.tone}`,
                                            children: applicationBadgeSummary.issues[selectedIssue.id]?.label
                                        }),
                                        view === "mi" && /*#__PURE__*/ _jsx("span", {
                                            className: isUnsavedNewIssue(selectedIssue) ? "body-header-mode new" : "body-header-mode edit",
                                            children: isUnsavedNewIssue(selectedIssue) ? "新規" : "編集"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "body-header-digest",
                                    children: [
                                        issueDigestParts.title && /*#__PURE__*/ _jsx("span", {
                                            className: "body-header-digest-main",
                                            children: issueDigestParts.title
                                        }),
                                        issueDigestParts.detail && /*#__PURE__*/ _jsx("span", {
                                            className: "body-header-digest-detail",
                                            children: issueDigestParts.detail
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "body-header-actions",
                                    children: [
                                        /*#__PURE__*/ _jsxs("button", {
                                            type: "button",
                                            className: "secondary-button undo-button",
                                            disabled: !canUndo,
                                            onClick: ()=>void performUndo(),
                                            children: [
                                                /*#__PURE__*/ _jsx(ArrowUpToLine, {
                                                    size: 14
                                                }),
                                                "元に戻す"
                                            ]
                                        })
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsx("div", {
                            className: view === "view" ? "body-content view-mode-body" : "body-content",
                            children: view === "mi" ? isMagazineIssueRoutePending ? /*#__PURE__*/ _jsx("section", {
                                className: "panel-empty-state",
                                children: /*#__PURE__*/ _jsx("p", {
                                    children: "雑誌個別を読み込んでいます。"
                                })
                            }) : activeMagazine ? /*#__PURE__*/ _jsx(MiEditor, {
                                issueForm: issueForm,
                                selectedMagazine: activeMagazine,
                                selectedIssue: selectedIssue,
                                storyRows: storyRows,
                                contentRows: contentRows,
                                storyRowOpenStates: storyRowOpenStates,
                                contentRowOpenStates: contentRowOpenStates,
                                existingIssues: selectedMagazineIssues,
                                authorOptions: miAuthorDirectoryOptions,
                                publisherOptions: miPublisherDirectoryOptions,
                                magazineOptions: miMagazineDirectoryOptions,
                                isDetailsOpen: isDetailsOpen,
                                isIssueListOpen: isIssueListOpen,
                                isReadingCompletionEnabled: isReadingCompletionEnabled,
                                applicationIssueBadges: applicationBadgeSummary.issues,
                                onReadingCompletionChange: setIsReadingCompletionEnabled,
                                onToggleDetails: ()=>setIsDetailsOpen((value)=>!value),
                                onToggleIssueList: toggleIssueList,
                                onSelectIssue: selectExistingIssue,
                                onAddStory: addStoryRow,
                                onAddContent: addContentRow,
                                onUpdateIssueForm: updateIssueForm,
                                onCommitIssueForm: commitIssueFormField,
                                onUpdateStoryRow: updateStoryRow,
                                onCommitStoryRow: commitStoryRowField,
                                onMoveStoryRow: moveStoryRow,
                                onCopyStoryRow: copyStoryRow,
                                onDeleteStoryRow: deleteStoryRow,
                                onStoryRowOpenStatesChange: setStoryRowOpenStates,
                                onOpenStorySimilaritySearch: openStorySimilaritySearch,
                                onUpdateContentRow: updateContentRow,
                                onCommitContentRow: commitContentRowField,
                                onMoveContentRow: moveContentRow,
                                onCopyContentRow: copyContentRow,
                                onDeleteContentRow: deleteContentRow,
                                onContentRowOpenStatesChange: setContentRowOpenStates,
                                onCreateIssue: openNewIssueForSelectedMagazine,
                                onRequestCopyIssue: openIssueCopyDialog,
                                onRequestDeleteIssue: openIssueDeleteDialog,
                                onNavigateHome: ()=>navigateToView("magazines"),
                                onOpenMagazineMasterList: ()=>navigateToView("magazines"),
                                onOpenSelectedMagazineMaster: ()=>activeMagazine ? selectMasterFromHistory("magazines", activeMagazine.id, {
                                        from: "magazine-issue",
                                        issue: selectedIssue.id
                                    }) : undefined,
                                onAuthorOptionsChange: handleAuthorDirectoryOptionsChange
                            }) : /*#__PURE__*/ _jsx(MissingMagazinePanel, {
                                onOpenMagazines: ()=>navigateToView("magazines")
                            }) : /*#__PURE__*/ _jsx(DataView, {
                                view: view,
                                masterHistorySelection: masterHistorySelection,
                                onMasterHistorySelectionConsumed: ()=>setMasterHistorySelection(null),
                                onMasterRecordSelected: handleMasterRecordSelected,
                                onOpenMagazineIssueEdit: openLatestMagazineIssue,
                                magazineIssueCounts: magazineIssueCounts,
                                magazineIssueLoadError: magazineIssueLoadError,
                                onAuthorDirectoryOptionsChange: handleAuthorDirectoryOptionsChange,
                                onSaveStatusChange: showHeaderSaveNotice,
                                onDirtyStateChange: setMasterEditorHasUnsavedChanges,
                                isLoggedIn: isLoggedIn,
                                currentUser: currentUser,
                                applicationBadgeSummary: applicationBadgeSummary,
                                onDatabaseUnavailable: ()=>navigateToErrorRoute("db-unavailable"),
                                onRecordWorkHistory: upsertWorkHistory
                            })
                        })
                    ]
                })
            }),
            /*#__PURE__*/ _jsxs("footer", {
                className: "app-footer",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "app-footer-left",
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                children: "mymag database v0.1"
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                children: view === "mi" ? issueSaveMessage : "autosaved draft 14:32"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "app-footer-center",
                        children: /*#__PURE__*/ _jsx(FooterNoticeBadge, {
                            notice: headerSaveNotice
                        })
                    }),
                    !isPhoneMode && /*#__PURE__*/ _jsx(DropdownMenu, {
                        align: "end",
                        className: "app-footer-right",
                        menuClassName: "footer-popup dropdown-menu-surface",
                        items: [
                            {
                                id: "footer-settings",
                                label: "特殊機能",
                                icon: /*#__PURE__*/ _jsx(Settings, {
                                    size: 16
                                }),
                                children: [
                                    ...footerNavItems.map((item)=>{
                                        const Icon = item.icon;
                                        return {
                                            id: `footer-nav-${item.key}`,
                                            label: item.label,
                                            icon: /*#__PURE__*/ _jsx(Icon, {
                                                size: 17
                                            }),
                                            onSelect: ()=>navigateToView(item.key)
                                        };
                                    }),
                                    {
                                        id: "footer-divider",
                                        kind: "separator"
                                    },
                                    {
                                        id: "footer-undo-limit",
                                        kind: "custom",
                                        render: /*#__PURE__*/ _jsxs("label", {
                                            className: "footer-popup-setting",
                                            children: [
                                                /*#__PURE__*/ _jsx("span", {
                                                    children: "アンドゥ回数"
                                                }),
                                                /*#__PURE__*/ _jsx("input", {
                                                    type: "number",
                                                    min: defaultUiPreferences.minUndoStackLimit,
                                                    max: defaultUiPreferences.maxUndoStackLimit,
                                                    value: undoStackLimit,
                                                    onChange: (event)=>handleUndoStackLimitChange(event.currentTarget.value)
                                                })
                                            ]
                                        })
                                    },
                                    {
                                        id: "footer-issue-copy-limit",
                                        kind: "custom",
                                        render: /*#__PURE__*/ _jsxs("label", {
                                            className: "footer-popup-setting",
                                            children: [
                                                /*#__PURE__*/ _jsx("span", {
                                                    children: "コピー上限"
                                                }),
                                                /*#__PURE__*/ _jsx("input", {
                                                    type: "number",
                                                    min: defaultUiPreferences.minIssueCopyLimit,
                                                    max: defaultUiPreferences.maxIssueCopyLimit,
                                                    value: issueCopyLimit,
                                                    onChange: (event)=>handleIssueCopyLimitChange(event.currentTarget.value)
                                                })
                                            ]
                                        })
                                    }
                                ]
                            }
                        ],
                        trigger: ({ toggle, buttonRef, ariaProps })=>/*#__PURE__*/ _jsxs("button", {
                                ref: buttonRef,
                                className: "footer-menu-button",
                                onClick: toggle,
                                ...ariaProps,
                                children: [
                                    /*#__PURE__*/ _jsx(Settings, {
                                        size: 14
                                    }),
                                    "メニュー"
                                ]
                            })
                    })
                ]
            }),
            storySimilarityDialog && /*#__PURE__*/ _jsx(StorySimilarityDialog, {
                dialog: storySimilarityDialog,
                onClose: ()=>setStorySimilarityDialog(null),
                onConfirmInsert: ()=>void handleStorySimilarityConfirm(),
                onRejectInsert: handleStorySimilarityReject
            }),
            /*#__PURE__*/ _jsx(WorkHistoryDialog, {
                entries: workHistoryDialogEntries,
                error: workHistoryError,
                isLoading: isWorkHistoryLoading,
                isOpen: isHistoryOpen,
                onClose: closeHistoryDialog,
                onSelect: (entryId)=>void handleWorkHistorySelect(entryId)
            }),
            issueCopyDialog && /*#__PURE__*/ _jsx(IssueCopyDialog, {
                dialog: issueCopyDialog,
                onClose: ()=>setIssueCopyDialog(null),
                onCountChange: (value)=>setIssueCopyDialog((current)=>current ? {
                            ...current,
                            countText: value
                        } : current),
                onToggleField: toggleIssueCopyField,
                onToggleIncrementField: toggleIssueCopyIncrementField,
                onConfirmStep: openIssueCopyConfirm,
                onBackStep: returnIssueCopyEditor,
                onExecuteInsert: ()=>void executeIssueCopyInsert()
            }),
            issueDeleteDialog && /*#__PURE__*/ _jsx(IssueDeleteConfirmDialog, {
                dialog: issueDeleteDialog,
                onClose: ()=>setIssueDeleteDialog(null),
                onConfirm: ()=>void deleteSelectedIssue()
            }),
            /*#__PURE__*/ _jsx(AlertDialogHost, {})
        ]
    });
}
function MiEditor({ issueForm, selectedMagazine, selectedIssue, storyRows, contentRows, storyRowOpenStates, contentRowOpenStates, existingIssues, authorOptions, publisherOptions, magazineOptions, isDetailsOpen, isIssueListOpen, isReadingCompletionEnabled, applicationIssueBadges, onReadingCompletionChange, onToggleDetails, onToggleIssueList, onSelectIssue, onAddStory, onAddContent, onUpdateIssueForm, onCommitIssueForm, onUpdateStoryRow, onCommitStoryRow, onMoveStoryRow, onCopyStoryRow, onDeleteStoryRow, onStoryRowOpenStatesChange, onOpenStorySimilaritySearch, onUpdateContentRow, onCommitContentRow, onMoveContentRow, onCopyContentRow, onDeleteContentRow, onContentRowOpenStatesChange, onCreateIssue, onRequestCopyIssue, onRequestDeleteIssue, onNavigateHome, onOpenMagazineMasterList, onOpenSelectedMagazineMaster, onAuthorOptionsChange }) {
    const isCreateMode = isUnsavedNewIssue(selectedIssue);
    const [issueListSort, setIssueListSort] = useState<IssueListSortValue>("published:asc");
    const selectedIssueLabel = buildIssueBreadcrumbLabel(issueForm) || buildIssueDisplayLabel(issueForm) || selectedIssue.label;
    const selectedIssueIndex = existingIssues.findIndex((issue)=>issue.id === selectedIssue.id);
    const previousIssue = selectedIssueIndex > 0 ? existingIssues[selectedIssueIndex - 1] : null;
    const nextIssue = selectedIssueIndex >= 0 && selectedIssueIndex < existingIssues.length - 1 ? existingIssues[selectedIssueIndex + 1] : null;
    const selectedMagazineMasterHref = buildMasterRoutePath("magazines", selectedMagazine.id, {
        from: "magazine-issue",
        issue: selectedIssue.id
    });
    const currentIssueHref = isUnsavedNewIssue(selectedIssue) ? `/magazines/${encodeURIComponent(selectedMagazine.id)}/issues/new` : buildIssueRoutePath(selectedMagazine.id, selectedIssue.id);
    const handleBreadcrumbClick = (event: ReactMouseEvent<HTMLAnchorElement>, callback: ()=>void)=>{
        event.preventDefault();
        callback();
    };
    const issueListSortLabel = issueListSortOptions.find((option)=>option.value === issueListSort)?.label ?? issueListSortOptions[0].label;
    const areAllStoryRowsOpen = storyRows.length > 0 && storyRowOpenStates.length === storyRows.length && storyRowOpenStates.every(Boolean);
    const areAllContentRowsOpen = contentRows.length > 0 && contentRowOpenStates.length === contentRows.length && contentRowOpenStates.every(Boolean);
    const toggleAllStoryRows = ()=>{
        const nextValue = !areAllStoryRowsOpen;
        onStoryRowOpenStatesChange(storyRows.map(()=>nextValue));
    };
    const toggleAllContentRows = ()=>{
        const nextValue = !areAllContentRowsOpen;
        onContentRowOpenStatesChange(contentRows.map(()=>nextValue));
    };
    const sortedExistingIssues = useMemo(()=>{
        const issues = [
            ...existingIssues
        ];
        const compareText = (left: string, right: string)=>left.localeCompare(right, "ja");
        const compareDateText = (left: string, right: string)=>left.localeCompare(right);
        issues.sort((left, right)=>{
            switch(issueListSort){
                case "published:asc":
                    return compareDateText(left.date ?? "", right.date ?? "") || compareText(left.label ?? "", right.label ?? "") || compareText(left.id, right.id);
                case "published:desc":
                    return compareDateText(right.date ?? "", left.date ?? "") || compareText(right.label ?? "", left.label ?? "") || compareText(right.id, left.id);
                case "updated:desc":
                    return compareDateText(right.updatedAt ?? "", left.updatedAt ?? "") || compareDateText(right.date ?? "", left.date ?? "") || compareText(right.id, left.id);
                case "created:desc":
                    return compareDateText(right.createdAt ?? "", left.createdAt ?? "") || compareDateText(right.date ?? "", left.date ?? "") || compareText(right.id, left.id);
                case "name:desc":
                    return compareText(right.title ?? "", left.title ?? "") || compareDateText(right.date ?? "", left.date ?? "") || compareText(right.id, left.id);
                case "name:asc":
                    return compareText(left.title ?? "", right.title ?? "") || compareDateText(left.date ?? "", right.date ?? "") || compareText(left.id, right.id);
                default:
                    return 0;
            }
        });
        return issues;
    }, [
        existingIssues,
        issueListSort
    ]);
    const handleIssueNumericBlur = (key, value)=>{
        const normalized = normalizeNumericText(value);
        if (normalized !== issueForm[key]) {
            onUpdateIssueForm(key, normalized);
        }
        const label = issueNumericFields.find((field)=>field.key === key)?.label ?? "雑誌個別情報";
        const isInvalid = issueIntegerFieldKeys.has(key) ? !isIntegerNumericText(normalized) : issueSignedDecimalFieldKeys.has(key) ? !isSignedDecimalNumericText(normalized) : !isDecimalNumericText(normalized);
        if (isInvalid) {
            const showAlert = issueIntegerFieldKeys.has(key) ? showIntegerValidationAlert : issueSignedDecimalFieldKeys.has(key) ? showSignedDecimalValidationAlert : showNumericValidationAlert;
            showAlert([
                label
            ]);
            return;
        }
        if (key.endsWith("Month") && !isMonthInRange(normalized) || key.endsWith("Day") && !isDayInRange(normalized)) {
            showDateRangeValidationAlert([
                label
            ]);
            return;
        }
        onCommitIssueForm?.(key, normalized);
    };
    return /*#__PURE__*/ _jsxs("div", {
        className: "mi-layout",
        children: [
            /*#__PURE__*/ _jsx("button", {
                "aria-label": "登録済み雑誌個別を開く",
                className: "issue-list-tab",
                onClick: onToggleIssueList,
                children: /*#__PURE__*/ _jsx(ChartBarDecreasing, {
                    size: 20
                })
            }),
            isIssueListOpen && /*#__PURE__*/ _jsxs("div", {
                className: "sidebar-dialog-layer",
                role: "dialog",
                "aria-modal": "true",
                children: [
                    /*#__PURE__*/ _jsx("div", {
                        "aria-hidden": "true",
                        className: "modal-blocking-backdrop sidebar-dialog-backdrop",
                        onClick: onToggleIssueList
                    }),
                    /*#__PURE__*/ _jsxs("aside", {
                        className: "sidebar-dialog",
                        onClick: (event)=>event.stopPropagation(),
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "sidebar-dialog-header",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        children: [
                                            /*#__PURE__*/ _jsx("strong", {
                                                children: "雑誌選択リスト"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                children: issueListSortLabel
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-modal-header-actions",
                                        children: [
                                            /*#__PURE__*/ _jsx("label", {
                                                className: "issue-sidebar-sort-select",
                                                children: /*#__PURE__*/ _jsx("select", {
                                                    value: issueListSort,
                                                    onChange: (event)=>setIssueListSort(event.target.value as IssueListSortValue),
                                                    "aria-label": "雑誌個別リストの並び順",
                                                    children: issueListSortOptions.map((option)=>/*#__PURE__*/ _jsx("option", {
                                                            value: option.value,
                                                            children: option.label
                                                        }, option.value))
                                                })
                                            }),
                                            /*#__PURE__*/ _jsx("button", {
                                                "aria-label": "閉じる",
                                                className: "issue-sidebar-close",
                                                onClick: onToggleIssueList,
                                                children: /*#__PURE__*/ _jsx(CircleChevronLeft, {
                                                    size: 34
                                                })
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "issue-list",
                                children: sortedExistingIssues.map((issue)=>/*#__PURE__*/ _jsxs("button", {
                                        className: selectedIssue.id === issue.id ? "issue-item active" : "issue-item",
                                        onClick: ()=>onSelectIssue(issue),
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "issue-item-title-row",
                                                children: [
                                                    /*#__PURE__*/ _jsx("strong", {
                                                        children: issue.label
                                                    }),
                                                    applicationIssueBadges[issue.id] && /*#__PURE__*/ _jsx("span", {
                                                        className: `application-state-badge tone-${applicationIssueBadges[issue.id]?.tone}`,
                                                        children: applicationIssueBadges[issue.id]?.label
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("small", {
                                                children: [
                                                    issue.title,
                                                    issue.digest
                                                ].filter(Boolean).join(" / ")
                                            })
                                        ]
                                    }, issue.id))
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "issue-sidebar-footer",
                                children: /*#__PURE__*/ _jsxs("span", {
                                    className: "issue-sidebar-count",
                                    children: [
                                        sortedExistingIssues.length,
                                        "件"
                                    ]
                                })
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "mi-workbench",
                children: [
                    /*#__PURE__*/ _jsx("section", {
                        className: "selected-magazine-strip",
                        children: /*#__PURE__*/ _jsxs("nav", {
                            className: "issue-breadcrumb-nav",
                            "aria-label": "雑誌個別ナビゲーション",
                            children: [
                                /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "issue-breadcrumb-arrow",
                                    onClick: ()=>previousIssue && onSelectIssue(previousIssue),
                                    disabled: !previousIssue,
                                    "aria-label": previousIssue ? `前の雑誌個別 ${previousIssue.label} へ移動` : "前の雑誌個別はありません",
                                    children: /*#__PURE__*/ _jsx(CircleChevronLeft, {
                                        size: 28
                                    })
                                }),
                                /*#__PURE__*/ _jsx("a", {
                                    href: "/",
                                    onClick: (event)=>handleBreadcrumbClick(event, onNavigateHome),
                                    "aria-label": "HOME",
                                    title: "HOME",
                                    className: "issue-breadcrumb-home",
                                    children: /*#__PURE__*/ _jsx(House, {
                                        size: 18
                                    })
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    className: "issue-breadcrumb-separator",
                                    "aria-hidden": "true",
                                    children: "/"
                                }),
                                /*#__PURE__*/ _jsx("a", {
                                    href: buildMasterRoutePath("magazines"),
                                    onClick: (event)=>handleBreadcrumbClick(event, onOpenMagazineMasterList),
                                    children: "雑誌マスター"
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    className: "issue-breadcrumb-separator",
                                    "aria-hidden": "true",
                                    children: "/"
                                }),
                                /*#__PURE__*/ _jsx("a", {
                                    href: selectedMagazineMasterHref,
                                    onClick: (event)=>handleBreadcrumbClick(event, onOpenSelectedMagazineMaster),
                                    className: "issue-breadcrumb-magazine",
                                    children: selectedMagazine.title
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    className: "issue-breadcrumb-separator",
                                    "aria-hidden": "true",
                                    children: "/"
                                }),
                                /*#__PURE__*/ _jsx("a", {
                                    href: currentIssueHref,
                                    className: "issue-breadcrumb-current",
                                    "aria-current": "page",
                                    onClick: (event)=>event.preventDefault(),
                                    children: selectedIssueLabel
                                }),
                                /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "issue-breadcrumb-arrow",
                                    onClick: ()=>nextIssue && onSelectIssue(nextIssue),
                                    disabled: !nextIssue,
                                    "aria-label": nextIssue ? `次の雑誌個別 ${nextIssue.label} へ移動` : "次の雑誌個別はありません",
                                    children: /*#__PURE__*/ _jsx(CircleChevronRight, {
                                        size: 28
                                    })
                                })
                            ]
                        })
                    }),
                    /*#__PURE__*/ _jsxs("section", {
                        className: isCreateMode ? "panel mi-create-mode-panel" : "panel",
                        onDoubleClick: (event)=>{
                            if (!shouldToggleRowDetailsOnDoubleClick(event.target)) return;
                            onToggleDetails();
                        },
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "panel-title panel-header",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        children: [
                                            /*#__PURE__*/ _jsxs("h2", {
                                                children: [
                                                    /*#__PURE__*/ _jsxs("span", {
                                                        className: "panel-title-icon book-search-title-icon",
                                                        "aria-hidden": "true",
                                                        children: [
                                                            /*#__PURE__*/ _jsx(BookOpen, {
                                                                size: 18
                                                            }),
                                                            /*#__PURE__*/ _jsx(Search, {
                                                                size: 9
                                                            })
                                                        ]
                                                    }),
                                                    "雑誌個別情報"
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("p", {
                                                children: "雑誌1冊単位の基本情報。タイトル表記は必須です。"
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                    className: "issue-header-actions",
                                    children: [
                                            /*#__PURE__*/ _jsxs("button", {
                                                type: "button",
                                                className: "primary-button issue-header-new-button",
                                                onClick: onCreateIssue,
                                                children: [
                                                    /*#__PURE__*/ _jsx(Plus, {
                                                        size: 16
                                                    }),
                                                    "新規作成"
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx(DropdownMenu, {
                                                align: "end",
                                                className: "row-menu-wrap issue-header-action-wrap",
                                                menuClassName: "master-list-action-menu issue-header-action-menu",
                                                items: [
                                                    {
                                                        id: "copy-issue",
                                                        label: "雑誌個別情報を新規コピー",
                                                        icon: /*#__PURE__*/ _jsx(Copy, {
                                                            size: 14
                                                        }),
                                                        onSelect: onRequestCopyIssue
                                                    },
                                                    {
                                                        id: "issue-divider",
                                                        kind: "separator"
                                                    },
                                                    {
                                                        id: "delete-issue",
                                                        label: "雑誌データを完全消去",
                                                        icon: /*#__PURE__*/ _jsx(Trash2, {
                                                            size: 14
                                                        }),
                                                        danger: true,
                                                        onSelect: onRequestDeleteIssue
                                                    }
                                                ],
                                                trigger: ({ toggle, buttonRef, ariaProps })=>/*#__PURE__*/ _jsx("button", {
                                                        type: "button",
                                                        ref: buttonRef,
                                                        className: "issue-header-action-button",
                                                        "aria-label": "操作",
                                                        onClick: toggle,
                                                        ...ariaProps,
                                                        children: /*#__PURE__*/ _jsx(Ellipsis, {
                                                            size: 29
                                                        })
                                                    })
                                            }),
                                            /*#__PURE__*/ _jsx("button", {
                                                type: "button",
                                                className: "issue-header-detail-button",
                                                "aria-label": isDetailsOpen ? "詳細を閉じる" : "詳細を開く",
                                                onClick: onToggleDetails,
                                                children: isDetailsOpen ? /*#__PURE__*/ _jsx(CircleChevronUp, {
                                                    size: 33
                                                }) : /*#__PURE__*/ _jsx(CircleChevronDown, {
                                                    size: 33
                                                })
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: isCreateMode ? "mi-editor-mode-banner create-mode" : "mi-editor-mode-banner",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        children: [
                                            /*#__PURE__*/ _jsx("strong", {
                                                children: isCreateMode ? "新規作成モード" : "編集モード"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                children: isCreateMode ? "必須項目のタイトルと読みが確定した時点で保存され、ID が発行されます。" : "変更はフィールドごとに自動保存されます。"
                                            })
                                        ]
                                    })
                                ]
                            }),
                            isCreateMode && /*#__PURE__*/ _jsx("div", {
                                className: "mi-create-mode-note",
                                children: "雑誌個別の新規入力中です。タイトルと読みの両方がそろうと、その時点で保存されて通常の編集状態に切り替わります。"
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "form-grid primary-fields",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-title-fields",
                                        children: [
                                            /*#__PURE__*/ _jsx(TitleReadingInput, {
                                                titleLabel: "雑誌個別の表記名",
                                                readingLabel: "雑誌個別の読み",
                                                title: issueForm.issueTitle,
                                                reading: issueForm.titleReading,
                                                isCompletionEnabled: isReadingCompletionEnabled,
                                                isRequired: true,
                                                onCompletionEnabledChange: onReadingCompletionChange,
                                                onTitleChange: (value)=>onUpdateIssueForm("issueTitle", value),
                                                onReadingChange: (value)=>onUpdateIssueForm("titleReading", value),
                                                onTitleBlur: (value)=>onCommitIssueForm?.("issueTitle", value),
                                                onReadingBlur: (value)=>onCommitIssueForm?.("titleReading", value)
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "issue-title-side-fields",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("div", {
                                                        className: "inline-labeled-field issue-frequency-field",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("span", {
                                                                className: "inline-field-label",
                                                                children: "刊行"
                                                            }),
                                                            /*#__PURE__*/ _jsx(SelectableTextInput, {
                                                                value: issueForm.publicationFrequency,
                                                                placeholder: "週刊",
                                                                options: publicationFrequencyOptions,
                                                                menuWidth: 172,
                                                                fontSize: 10,
                                                                onChange: (value)=>onUpdateIssueForm("publicationFrequency", value),
                                                                onCommit: (value)=>onCommitIssueForm?.("publicationFrequency", value)
                                                            })
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("div", {
                                                        className: "inline-labeled-field issue-media-field",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("span", {
                                                                className: "inline-field-label",
                                                                children: "媒体"
                                                            }),
                                                            /*#__PURE__*/ _jsx(SelectableTextInput, {
                                                                value: issueForm.mediaFormat,
                                                                placeholder: "紙",
                                                                options: mediaFormatOptions,
                                                                menuWidth: 172,
                                                                fontSize: 10,
                                                                onChange: (value)=>onUpdateIssueForm("mediaFormat", value),
                                                                onCommit: (value)=>onCommitIssueForm?.("mediaFormat", value)
                                                            })
                                                        ]
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-number-row",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "ymd-pair-group",
                                                children: [
                                                    /*#__PURE__*/ _jsx(YmdInputSet, {
                                                        label: "発売表示",
                                                        year: issueForm.displayReleaseYear,
                                                        month: issueForm.displayReleaseMonth,
                                                        day: issueForm.displayReleaseDay,
                                                        onYearChange: (value)=>onUpdateIssueForm("displayReleaseYear", value),
                                                        onMonthChange: (value)=>onUpdateIssueForm("displayReleaseMonth", value),
                                                        onDayChange: (value)=>onUpdateIssueForm("displayReleaseDay", value),
                                                        onYearBlur: (value)=>handleIssueNumericBlur("displayReleaseYear", value),
                                                        onMonthBlur: (value)=>handleIssueNumericBlur("displayReleaseMonth", value),
                                                        onDayBlur: (value)=>handleIssueNumericBlur("displayReleaseDay", value)
                                                    }),
                                                    /*#__PURE__*/ _jsx(GitCommitVertical, { size: 14, className: "ymd-pair-icon" }),
                                                    /*#__PURE__*/ _jsx(MdInputSet, {
                                                        label: "表示合併",
                                                        month: issueForm.displayReleaseCombinedMonth,
                                                        day: issueForm.displayReleaseCombinedDay,
                                                        onMonthChange: (value)=>onUpdateIssueForm("displayReleaseCombinedMonth", value),
                                                        onDayChange: (value)=>onUpdateIssueForm("displayReleaseCombinedDay", value),
                                                        onMonthBlur: (value)=>handleIssueNumericBlur("displayReleaseCombinedMonth", value),
                                                        onDayBlur: (value)=>handleIssueNumericBlur("displayReleaseCombinedDay", value)
                                                    }),
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx(KgtInputSet, {
                                                volume: issueForm.volumeNumber,
                                                issue: issueForm.issueNumber,
                                                total: issueForm.totalIssueNumber,
                                                onVolumeChange: (value)=>onUpdateIssueForm("volumeNumber", value),
                                                onIssueChange: (value)=>onUpdateIssueForm("issueNumber", value),
                                                onTotalChange: (value)=>onUpdateIssueForm("totalIssueNumber", value),
                                                onVolumeBlur: (value)=>handleIssueNumericBlur("volumeNumber", value),
                                                onIssueBlur: (value)=>handleIssueNumericBlur("issueNumber", value),
                                                onTotalBlur: (value)=>handleIssueNumericBlur("totalIssueNumber", value)
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "issue-number-secondary-row",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("div", {
                                                        className: "ymd-pair-group",
                                                        children: [
                                                            /*#__PURE__*/ _jsxs("div", {
                                                                className: "inline-labeled-field issue-number-display-field",
                                                                children: [
                                                                    /*#__PURE__*/ _jsx("span", {
                                                                        className: "inline-field-label",
                                                                        children: "号数・Vol"
                                                                    }),
                                                                    /*#__PURE__*/ _jsx("input", {
                                                                        value: issueForm.volumeNumberDisplayed,
                                                                        placeholder: "号",
                                                                        inputMode: "decimal",
                                                                        onChange: (event)=>onUpdateIssueForm("volumeNumberDisplayed", event.target.value),
                                                                        onBlur: (event)=>handleIssueNumericBlur("volumeNumberDisplayed", event.currentTarget.value)
                                                                    })
                                                                ]
                                                            }),
                                                            /*#__PURE__*/ _jsx(GitCommitVertical, { size: 14, className: "ymd-pair-icon" }),
                                                            /*#__PURE__*/ _jsxs("div", {
                                                                className: "inline-labeled-field issue-number-combined-field",
                                                                children: [
                                                                    /*#__PURE__*/ _jsx("span", {
                                                                        className: "inline-field-label",
                                                                        children: "号数合併"
                                                                    }),
                                                                    /*#__PURE__*/ _jsx("input", {
                                                                        value: issueForm.issueNumberCombined,
                                                                        placeholder: "合併",
                                                                        inputMode: "decimal",
                                                                        onChange: (event)=>onUpdateIssueForm("issueNumberCombined", event.target.value),
                                                                        onBlur: (event)=>handleIssueNumericBlur("issueNumberCombined", event.currentTarget.value)
                                                                    })
                                                                ]
                                                            }),
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("label", {
                                                        className: "checkbox-rule-field issue-special-check",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("span", {
                                                                className: "checkbox-rule-label",
                                                                children: "増刊"
                                                            }),
                                                            /*#__PURE__*/ _jsx("input", {
                                                                type: "checkbox",
                                                                checked: issueForm.isSpecialIssue,
                                                                onChange: (event)=>{
                                                                    onUpdateIssueForm("isSpecialIssue", event.target.checked);
                                                                    onCommitIssueForm?.("isSpecialIssue", event.target.checked);
                                                                }
                                                            }),
                                                            /*#__PURE__*/ _jsx("span", {
                                                                className: "checkbox-rule-box",
                                                                "aria-hidden": "true"
                                                            })
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("label", {
                                                        className: "checkbox-rule-field issue-mitsumine-check",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("span", {
                                                                className: "checkbox-rule-label",
                                                                children: "三峯"
                                                            }),
                                                            /*#__PURE__*/ _jsx("input", {
                                                                type: "checkbox",
                                                                checked: issueForm.isMitsumine,
                                                                onChange: (event)=>{
                                                                    onUpdateIssueForm("isMitsumine", event.target.checked);
                                                                    onCommitIssueForm?.("isMitsumine", event.target.checked);
                                                                }
                                                            }),
                                                            /*#__PURE__*/ _jsx("span", {
                                                                className: "checkbox-rule-box",
                                                                "aria-hidden": "true"
                                                            })
                                                        ]
                                                    })
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            }),
                            isDetailsOpen && /*#__PURE__*/ _jsxs("div", {
                                className: "details-grid",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-subtitle-meta-row",
                                        children: [
                                            /*#__PURE__*/ _jsx(TitleReadingInput, {
                                                titleLabel: "サブタイトル",
                                                readingLabel: "サブタイトルの読み",
                                                title: issueForm.subtitle,
                                                reading: issueForm.subtitleReading,
                                                isCompletionEnabled: isReadingCompletionEnabled,
                                                onCompletionEnabledChange: onReadingCompletionChange,
                                                onTitleChange: (value)=>onUpdateIssueForm("subtitle", value),
                                                onReadingChange: (value)=>onUpdateIssueForm("subtitleReading", value),
                                                onTitleBlur: (value)=>onCommitIssueForm?.("subtitle", value),
                                                onReadingBlur: (value)=>onCommitIssueForm?.("subtitleReading", value)
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "issue-subtitle-meta-dates",
                                                "aria-label": "発売・発行日時",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("div", {
                                                        className: "issue-subtitle-meta-date-row",
                                                        children: [
                                                            /*#__PURE__*/ _jsxs("div", {
                                                                className: "ymd-pair-group",
                                                                children: [
                                                                    /*#__PURE__*/ _jsx(YmdInputSet, {
                                                                        label: "発行日",
                                                                        year: issueForm.publicationYear,
                                                                        month: issueForm.publicationMonth,
                                                                        day: issueForm.publicationDay,
                                                                        onYearChange: (value)=>onUpdateIssueForm("publicationYear", value),
                                                                        onMonthChange: (value)=>onUpdateIssueForm("publicationMonth", value),
                                                                        onDayChange: (value)=>onUpdateIssueForm("publicationDay", value),
                                                                        onYearBlur: (value)=>handleIssueNumericBlur("publicationYear", value),
                                                                        onMonthBlur: (value)=>handleIssueNumericBlur("publicationMonth", value),
                                                                        onDayBlur: (value)=>handleIssueNumericBlur("publicationDay", value)
                                                                    }),
                                                                    /*#__PURE__*/ _jsx(GitCommitVertical, { size: 14, className: "ymd-pair-icon" }),
                                                                    /*#__PURE__*/ _jsx(MdInputSet, {
                                                                        label: "発行合併",
                                                                        month: issueForm.publicationCombinedMonth,
                                                                        day: issueForm.publicationCombinedDay,
                                                                        onMonthChange: (value)=>onUpdateIssueForm("publicationCombinedMonth", value),
                                                                        onDayChange: (value)=>onUpdateIssueForm("publicationCombinedDay", value),
                                                                        onMonthBlur: (value)=>handleIssueNumericBlur("publicationCombinedMonth", value),
                                                                        onDayBlur: (value)=>handleIssueNumericBlur("publicationCombinedDay", value)
                                                                    }),
                                                                ]
                                                            })
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("div", {
                                                        className: "issue-subtitle-meta-date-row",
                                                        children: [
                                                            /*#__PURE__*/ _jsx(YmdInputSet, {
                                                                label: "発売日",
                                                                year: issueForm.releaseYear,
                                                                month: issueForm.releaseMonth,
                                                                day: issueForm.releaseDay,
                                                                onYearChange: (value)=>onUpdateIssueForm("releaseYear", value),
                                                                onMonthChange: (value)=>onUpdateIssueForm("releaseMonth", value),
                                                                onDayChange: (value)=>onUpdateIssueForm("releaseDay", value),
                                                                onYearBlur: (value)=>handleIssueNumericBlur("releaseYear", value),
                                                                onMonthBlur: (value)=>handleIssueNumericBlur("releaseMonth", value),
                                                                onDayBlur: (value)=>handleIssueNumericBlur("releaseDay", value)
                                                            })
                                                        ]
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-detail-standard-row",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "発行人"
                                                    }),
                                                    /*#__PURE__*/ _jsx("input", {
                                                        value: issueForm.publisherPerson,
                                                        placeholder: "発行人名",
                                                        onChange: (event)=>onUpdateIssueForm("publisherPerson", event.target.value),
                                                        onBlur: (event)=>onCommitIssueForm?.("publisherPerson", event.currentTarget.value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "編集人"
                                                    }),
                                                    /*#__PURE__*/ _jsx("input", {
                                                        value: issueForm.editorPerson,
                                                        placeholder: "編集人名",
                                                        onChange: (event)=>onUpdateIssueForm("editorPerson", event.target.value),
                                                        onBlur: (event)=>onCommitIssueForm?.("editorPerson", event.currentTarget.value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "出版社"
                                                    }),
                                                    /*#__PURE__*/ _jsx(MasterListSelectionInput, {
                                                        value: issueForm.publishersJson,
                                                        options: publisherOptions,
                                                        idKey: "publisher_id",
                                                        keyKey: "publisher_key",
                                                        label: "出版社",
                                                        autoCommitDefaultRole: true,
                                                        roleOptions: [
                                                            "発行",
                                                            "発売",
                                                            "編集"
                                                        ],
                                                        defaultRole: "発行",
                                                        placeholder: "出版社を入力",
                                                        onChange: (value)=>{
                                                            onUpdateIssueForm("publishersJson", value);
                                                            onCommitIssueForm?.("publishersJson", value);
                                                        }
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "関連誌"
                                                    }),
                                                    /*#__PURE__*/ _jsx(MasterListSelectionInput, {
                                                        value: issueForm.relatedMagazinesJson,
                                                        options: magazineOptions,
                                                        idKey: "magazine_id",
                                                        keyKey: "magazine_key",
                                                        placeholder: "関連誌を入力",
                                                        label: "関連誌",
                                                        roleOptions: magazineRelationRoleOptions,
                                                        autoCommitDefaultRole: true,
                                                        allowUnregistered: true,
                                                        onChange: (value)=>{
                                                            onUpdateIssueForm("relatedMagazinesJson", value);
                                                            onCommitIssueForm?.("relatedMagazinesJson", value);
                                                        }
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-detail-standard-row",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "補助表記巻号"
                                                    }),
                                                    /*#__PURE__*/ _jsx("input", {
                                                        value: issueForm.volumeIssueNote,
                                                        placeholder: "巻号に関する補足",
                                                        onChange: (event)=>onUpdateIssueForm("volumeIssueNote", event.target.value),
                                                        onBlur: (event)=>onCommitIssueForm?.("volumeIssueNote", event.currentTarget.value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "雑誌コード"
                                                    }),
                                                    /*#__PURE__*/ _jsx("input", {
                                                        value: issueForm.magazineCode,
                                                        placeholder: "例: 29933-07",
                                                        onChange: (event)=>onUpdateIssueForm("magazineCode", event.target.value),
                                                        onBlur: (event)=>onCommitIssueForm?.("magazineCode", event.currentTarget.value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "製本"
                                                    }),
                                                    /*#__PURE__*/ _jsx(SelectableTextInput, {
                                                        value: issueForm.binding,
                                                        placeholder: "中綴じ、平綴じなど",
                                                        options: bindingOptions,
                                                        onChange: (value)=>onUpdateIssueForm("binding", value),
                                                        onCommit: (value)=>onCommitIssueForm?.("binding", value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "サイズ"
                                                    }),
                                                    /*#__PURE__*/ _jsx(SelectableTextInput, {
                                                        value: issueForm.size,
                                                        placeholder: "B5など",
                                                        options: issueSizeOptions,
                                                        onChange: (value)=>onUpdateIssueForm("size", value),
                                                        onCommit: (value)=>onCommitIssueForm?.("size", value)
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-detail-standard-row issue-detail-pricing-row",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "価格"
                                                    }),
                                                    /*#__PURE__*/ _jsx("input", {
                                                        value: issueForm.price,
                                                        placeholder: "例: 290",
                                                        inputMode: "numeric",
                                                        pattern: "[0-9]*",
                                                        onChange: (event)=>onUpdateIssueForm("price", event.target.value),
                                                        onBlur: (event)=>handleIssueNumericBlur("price", event.currentTarget.value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "ページ数"
                                                    }),
                                                    /*#__PURE__*/ _jsx("input", {
                                                        value: issueForm.numberOfPages,
                                                        placeholder: "例: 480",
                                                        inputMode: "numeric",
                                                        pattern: "[0-9]*",
                                                        onChange: (event)=>onUpdateIssueForm("numberOfPages", event.target.value),
                                                        onBlur: (event)=>handleIssueNumericBlur("numberOfPages", event.currentTarget.value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "レイティング"
                                                    }),
                                                    /*#__PURE__*/ _jsx(SelectableTextInput, {
                                                        value: issueForm.rating,
                                                        placeholder: "R18など",
                                                        options: issueRatingOptions,
                                                        onChange: (value)=>onUpdateIssueForm("rating", value),
                                                        onCommit: (value)=>onCommitIssueForm?.("rating", value)
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "field-badge-wrap issue-standard-field issue-category-field",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "field-badge",
                                                        children: "分類"
                                                    }),
                                                    /*#__PURE__*/ _jsx(TagInput, {
                                                        tags: splitTagText(issueForm.category),
                                                        placeholder: "美少女、エロ劇画、TL,BL、など",
                                                        onChange: (tags)=>{
                                                            const value = tags.join(", ");
                                                            onUpdateIssueForm("category", value);
                                                            onCommitIssueForm?.("category", value);
                                                        }
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-detail-wide-field inline-labeled-field issue-tag-field",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "inline-field-label",
                                                children: "タグ"
                                            }),
                                            /*#__PURE__*/ _jsx(TagInput, {
                                                tags: splitTagText(issueForm.tag),
                                                onChange: (tags)=>{
                                                    const value = tags.join(", ");
                                                    onUpdateIssueForm("tag", value);
                                                    onCommitIssueForm?.("tag", value);
                                                }
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "issue-detail-wide-field inline-labeled-field issue-note-field",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "inline-field-label",
                                                children: "備考"
                                            }),
                                            /*#__PURE__*/ _jsx("textarea", {
                                                value: issueForm.note,
                                                placeholder: "雑誌個別情報に関する備考",
                                                onChange: (event)=>onUpdateIssueForm("note", event.target.value),
                                                onBlur: (event)=>onCommitIssueForm?.("note", event.currentTarget.value)
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("section", {
                        className: "panel content-panel",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "panel-title panel-header",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        children: [
                                            /*#__PURE__*/ _jsxs("h2", {
                                                children: [
                                                    /*#__PURE__*/ _jsx(NotepadText, {
                                                        className: "panel-title-icon",
                                                        size: 19,
                                                        "aria-hidden": "true"
                                                    }),
                                                    "作品リスト"
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("p", {
                                                children: "漫画作品・掲載作品の一覧。詳細行で話数やシリーズ情報を管理します。"
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("button", {
                                        type: "button",
                                        className: "secondary-button issue-list-toggle-button",
                                        onClick: toggleAllStoryRows,
                                        children: [
                                            areAllStoryRowsOpen ? /*#__PURE__*/ _jsx(CircleChevronUp, {
                                                size: 18
                                            }) : /*#__PURE__*/ _jsx(CircleChevronDown, {
                                                size: 18
                                            }),
                                            areAllStoryRowsOpen ? "全て閉じる" : "全て開く"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "content-table",
                                role: "table",
                                "aria-label": "Story list",
                                children: storyRows.map((row, index)=>/*#__PURE__*/ _jsx(StoryEditorRow, {
                                        row: row,
                                        index: index,
                                        isOpen: storyRowOpenStates[index] ?? false,
                                        onOpenChange: (nextValue)=>onStoryRowOpenStatesChange(storyRowOpenStates.map((value, rowIndex)=>rowIndex === index ? nextValue : value)),
                                        isReadingCompletionEnabled: isReadingCompletionEnabled,
                                        onReadingCompletionChange: onReadingCompletionChange,
                                        onUpdate: onUpdateStoryRow,
                                        onCommit: onCommitStoryRow,
                                        onMove: onMoveStoryRow,
                                        onCopy: onCopyStoryRow,
                                        onDelete: onDeleteStoryRow,
                                        onOpenSimilaritySearch: onOpenStorySimilaritySearch,
                                        authorOptions: authorOptions,
                                        onAuthorOptionsChange: onAuthorOptionsChange
                                    }, `story-${index}`))
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "content-table-footer",
                                children: /*#__PURE__*/ _jsxs("button", {
                                    type: "button",
                                    className: "primary-button issue-list-add-button",
                                    onClick: onAddStory,
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "issue-list-add-button-icon",
                                            "aria-hidden": "true",
                                            children: /*#__PURE__*/ _jsx(CirclePlus, {
                                                size: 18
                                            })
                                        }),
                                        "追加"
                                    ]
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("section", {
                        className: "panel content-panel",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "panel-title panel-header",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        children: [
                                            /*#__PURE__*/ _jsxs("h2", {
                                                children: [
                                                    /*#__PURE__*/ _jsx(Package2, {
                                                        className: "panel-title-icon",
                                                        size: 19,
                                                        "aria-hidden": "true"
                                                    }),
                                                    "コンテンツ"
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("p", {
                                                children: "表紙、目次、広告、記事など。漫画作品は作品リスト側で管理します。"
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("button", {
                                        type: "button",
                                        className: "secondary-button issue-list-toggle-button",
                                        onClick: toggleAllContentRows,
                                        children: [
                                            areAllContentRowsOpen ? /*#__PURE__*/ _jsx(CircleChevronUp, {
                                                size: 18
                                            }) : /*#__PURE__*/ _jsx(CircleChevronDown, {
                                                size: 18
                                            }),
                                            areAllContentRowsOpen ? "全て閉じる" : "全て開く"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "content-table",
                                role: "table",
                                "aria-label": "Magazine contents",
                                children: contentRows.map((row, index)=>/*#__PURE__*/ _jsx(MagazineContentEditorRow, {
                                        row: row,
                                        index: index,
                                        isOpen: contentRowOpenStates[index] ?? false,
                                        onOpenChange: (nextValue)=>onContentRowOpenStatesChange(contentRowOpenStates.map((value, rowIndex)=>rowIndex === index ? nextValue : value)),
                                        onUpdate: onUpdateContentRow,
                                        onCommit: onCommitContentRow,
                                        onMove: onMoveContentRow,
                                        onCopy: onCopyContentRow,
                                        onDelete: onDeleteContentRow,
                                        authorOptions: authorOptions,
                                        onAuthorOptionsChange: onAuthorOptionsChange
                                    }, row.clientKey ?? `content-${index}`))
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "content-table-footer",
                                children: /*#__PURE__*/ _jsxs("button", {
                                    type: "button",
                                    className: "primary-button issue-list-add-button",
                                    onClick: onAddContent,
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "issue-list-add-button-icon",
                                            "aria-hidden": "true",
                                            children: /*#__PURE__*/ _jsx(CirclePlus, {
                                                size: 18
                                            })
                                        }),
                                        "追加"
                                    ]
                                })
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
function StoryEditorRow({ row, index, isOpen, onOpenChange, isReadingCompletionEnabled, onReadingCompletionChange, onUpdate, onCommit, onMove, onCopy, onDelete, onOpenSimilaritySearch, authorOptions, onAuthorOptionsChange }) {
    const [contextMenuPosition, setContextMenuPosition] = useState<{
        left: number;
        top: number;
    } | null>(null);
    useEffect(()=>{
        if (!contextMenuPosition) return;
        const closeMenu = (event: MouseEvent | KeyboardEvent)=>{
            if ("button" in event && event.button === 2) return;
            setContextMenuPosition(null);
        };
        document.addEventListener("mousedown", closeMenu);
        document.addEventListener("keydown", closeMenu);
        return ()=>{
            document.removeEventListener("mousedown", closeMenu);
            document.removeEventListener("keydown", closeMenu);
        };
    }, [
        contextMenuPosition
    ]);
    const handleNumericBlur = (key, label)=>{
        const normalized = normalizeNumericText(row[key] ?? "");
        if (normalized !== (row[key] ?? "")) {
            onUpdate(index, key, normalized);
        }
        const allowsDecimal = key === "episodeNumber";
        if (allowsDecimal ? !isDecimalNumericText(normalized) : !isIntegerNumericText(normalized)) {
            (allowsDecimal ? showNumericValidationAlert : showIntegerValidationAlert)([
                `作品リスト${index + 1}行目: ${label}`
            ]);
            return;
        }
        onCommit?.(index, key, normalized);
    };
    return /*#__PURE__*/ _jsxs("div", {
        className: isOpen ? "content-editor-row story-editor-row is-open" : "content-editor-row story-editor-row",
        "data-row-index": index,
        "data-undo-kind": "story",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "story-row",
                role: "row",
                onDoubleClick: (event)=>{
                    if (!shouldToggleRowDetailsOnDoubleClick(event.target)) return;
                    onOpenChange(!isOpen);
                },
                onDragOver: (event)=>{
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                },
                onDrop: (event)=>{
                    event.preventDefault();
                    const fromIndex = getDraggedRowIndex(event, "story");
                    if (fromIndex !== null) {
                        onMove(fromIndex, index);
                    }
                },
                children: [
                    /*#__PURE__*/ _jsx("button", {
                        type: "button",
                        className: "drag-handle",
                        "aria-label": `${row.position}行目を並べ替え`,
                        draggable: true,
                        onDragStart: (event)=>setRowDragPreview(event, "story", index),
                        onDragEnd: clearRowDragPreview,
                        children: /*#__PURE__*/ _jsx(GripVertical, {
                            size: 18
                        })
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "position-cell",
                        children: row.position
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "story-title-cell",
                        children: [
                            /*#__PURE__*/ _jsx(TitleReadingInput, {
                                titleLabel: "作品タイトル",
                                readingLabel: "作品タイトルの読み",
                                title: row.title,
                                reading: row.titleReading,
                                isCompletionEnabled: isReadingCompletionEnabled,
                                onCompletionEnabledChange: onReadingCompletionChange,
                                onTitleChange: (value)=>onUpdate(index, "title", value),
                                onReadingChange: (value)=>onUpdate(index, "titleReading", value),
                                onTitleBlur: (value)=>onCommit?.(index, "title", value),
                                onReadingBlur: (value)=>onCommit?.(index, "titleReading", value),
                                onContextMenu: (event)=>{
                                    if (!row.storyId) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setContextMenuPosition({
                                        left: event.clientX,
                                        top: event.clientY
                                    });
                                }
                            }),
                            contextMenuPosition && typeof document !== "undefined" && createPortal(/*#__PURE__*/ _jsx("div", {
                                className: "story-title-context-menu",
                                style: {
                                    left: contextMenuPosition.left,
                                    top: contextMenuPosition.top
                                },
                                onMouseDown: (event)=>{
                                    event.stopPropagation();
                                },
                                children: /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    onClick: ()=>{
                                        setContextMenuPosition(null);
                                        onOpenSimilaritySearch(index, row);
                                    },
                                    children: "類似タイトルを探す"
                                })
                            }), document.body)
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "story-main-fields",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "inline-labeled-field story-author-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "inline-field-label",
                                        children: "著者"
                                    }),
                                    /*#__PURE__*/ _jsx(MasterListSelectionInput, {
                                        value: row.authors,
                                        options: authorOptions,
                                        onOptionsChange: onAuthorOptionsChange,
                                        idKey: "author_id",
                                        placeholder: "著者を入力",
                                        label: "著者",
                                        defaultRole: "著",
                                        autoCommitDefaultRole: true,
                                        roleOptions: [
                                            "著",
                                            "作",
                                            "画",
                                            "作画",
                                            "漫画",
                                            "原作",
                                            "脚本",
                                            "構成",
                                            "監修",
                                            "協力",
                                            "その他"
                                        ],
                                        onChange: (value)=>{
                                            onUpdate(index, "authors", value);
                                            onCommit?.(index, "authors", value);
                                        }
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "inline-labeled-field story-type-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "inline-field-label",
                                        children: "タイプ"
                                    }),
                                    /*#__PURE__*/ _jsx(SelectableTextInput, {
                                        value: row.storyType,
                                        placeholder: "読み切り",
                                        options: storyTypeOptions,
                                        fontSize: 10,
                                        onChange: (value)=>onUpdate(index, "storyType", value),
                                        onCommit: (value)=>onCommit?.(index, "storyType", value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "inline-labeled-field story-page-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "inline-field-label",
                                        children: "ページ"
                                    }),
                                    /*#__PURE__*/ _jsx("input", {
                                        className: "page-count-input",
                                        value: row.pageCount ?? "",
                                        placeholder: "18",
                                        inputMode: "numeric",
                                        pattern: "[0-9]*",
                                        onChange: (event)=>onUpdate(index, "pageCount", event.target.value),
                                        onBlur: ()=>handleNumericBlur("pageCount", "ページ")
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "row-action-stack",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                className: "detail-toggle-button",
                                "aria-label": isOpen ? "詳細を閉じる" : "詳細を開く",
                                onClick: ()=>onOpenChange(!isOpen),
                                children: isOpen ? /*#__PURE__*/ _jsx(CircleChevronUp, {
                                    size: 22
                                }) : /*#__PURE__*/ _jsx(CircleChevronDown, {
                                    size: 22
                                })
                            }),
                            /*#__PURE__*/ _jsx(DropdownMenu, {
                                align: "end",
                                className: "row-menu-wrap",
                                items: [
                                    {
                                        id: `story-copy-above-${index}`,
                                        label: "上にコピー",
                                        icon: /*#__PURE__*/ _jsx(ArrowUpToLine, {
                                            size: 14
                                        }),
                                        onSelect: ()=>onCopy(index, "above")
                                    },
                                    {
                                        id: `story-copy-below-${index}`,
                                        label: "下にコピー",
                                        icon: /*#__PURE__*/ _jsx(ArrowDownToLine, {
                                            size: 14
                                        }),
                                        onSelect: ()=>onCopy(index, "below")
                                    },
                                    {
                                        id: `story-divider-${index}`,
                                        kind: "separator"
                                    },
                                    {
                                        id: `story-delete-${index}`,
                                        label: "削除",
                                        icon: /*#__PURE__*/ _jsx(Trash2, {
                                            size: 14
                                        }),
                                        danger: true,
                                        onSelect: ()=>onDelete(index)
                                    }
                                ],
                                trigger: ({ toggle, buttonRef, ariaProps })=>/*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        ref: buttonRef,
                                        className: "row-menu-button",
                                        "aria-label": `${row.position}行目の操作`,
                                        onClick: toggle,
                                        ...ariaProps,
                                        children: /*#__PURE__*/ _jsx(Ellipsis, {
                                            size: 19
                                        })
                                    })
                            })
                        ]
                    })
                ]
            }),
            isOpen && /*#__PURE__*/ _jsxs("div", {
                className: "story-details",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "story-detail-row detail-row-one",
                        children: [
                            /*#__PURE__*/ _jsx(TitleReadingInput, {
                                titleLabel: "シリーズ名",
                                readingLabel: "シリーズ読み",
                                title: row.seriesTitle ?? "",
                                reading: row.seriesReading ?? "",
                                isCompletionEnabled: isReadingCompletionEnabled,
                                onCompletionEnabledChange: onReadingCompletionChange,
                                onTitleChange: (value)=>onUpdate(index, "seriesTitle", value),
                                onReadingChange: (value)=>onUpdate(index, "seriesReading", value),
                                onTitleBlur: (value)=>onCommit?.(index, "seriesTitle", value),
                                onReadingBlur: (value)=>onCommit?.(index, "seriesReading", value)
                            }),
                            /*#__PURE__*/ _jsx(TitleReadingInput, {
                                titleLabel: "サブタイトル",
                                readingLabel: "サブタイトル読み",
                                title: row.subtitle ?? "",
                                reading: row.subtitleReading ?? "",
                                isCompletionEnabled: isReadingCompletionEnabled,
                                onCompletionEnabledChange: onReadingCompletionChange,
                                onTitleChange: (value)=>onUpdate(index, "subtitle", value),
                                onReadingChange: (value)=>onUpdate(index, "subtitleReading", value),
                                onTitleBlur: (value)=>onCommit?.(index, "subtitle", value),
                                onReadingBlur: (value)=>onCommit?.(index, "subtitleReading", value)
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "story-detail-row detail-row-two",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "field-badge-wrap centered-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "field-badge",
                                        children: "話数"
                                    }),
                                    /*#__PURE__*/ _jsx("input", {
                                        value: row.episodeNumber ?? "",
                                        placeholder: "3",
                                        inputMode: "decimal",
                                        onChange: (event)=>onUpdate(index, "episodeNumber", event.target.value),
                                        onBlur: ()=>handleNumericBlur("episodeNumber", "話数")
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "field-badge-wrap centered-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "field-badge",
                                        children: "話数表記"
                                    }),
                                    /*#__PURE__*/ _jsx("input", {
                                        value: row.episodeLabel ?? "",
                                        placeholder: "第3話",
                                        onChange: (event)=>onUpdate(index, "episodeLabel", event.target.value),
                                        onBlur: (event)=>onCommit?.(index, "episodeLabel", event.currentTarget.value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "field-badge-wrap",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "field-badge",
                                        children: "カラー情報"
                                    }),
                                    /*#__PURE__*/ _jsx("input", {
                                        value: row.colorInfo ?? "",
                                        placeholder: "巻頭カラー、2色カラーなど",
                                        onChange: (event)=>onUpdate(index, "colorInfo", event.target.value),
                                        onBlur: (event)=>onCommit?.(index, "colorInfo", event.currentTarget.value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "field-badge-wrap",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "field-badge",
                                        children: "タグ"
                                    }),
                                    /*#__PURE__*/ _jsx(TagInput, {
                                        tags: row.tags,
                                        onChange: (tags)=>{
                                            onUpdate(index, "tags", tags);
                                            onCommit?.(index, "tags", tags);
                                        }
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "story-detail-row detail-row-three",
                        children: /*#__PURE__*/ _jsxs("div", {
                            className: "inline-labeled-field story-memo-field",
                            children: [
                                /*#__PURE__*/ _jsx("span", {
                                    className: "inline-field-label",
                                    children: "メモ"
                                }),
                                /*#__PURE__*/ _jsx("input", {
                                    value: row.memo ?? "",
                                    placeholder: "検索オプションでのみ対象",
                                    onChange: (event)=>onUpdate(index, "memo", event.target.value),
                                    onBlur: (event)=>onCommit?.(index, "memo", event.currentTarget.value)
                                })
                            ]
                        })
                    })
                ]
            })
        ]
    });
}
function StorySimilarityDialog({ dialog, onClose, onConfirmInsert, onRejectInsert }: {
    dialog: StorySimilarityDialogState;
    onClose: ()=>void;
    onConfirmInsert: ()=>void;
    onRejectInsert: ()=>void;
}) {
    const exactMatches = dialog.exactMatches;
    const nearMatches = dialog.nearMatches;
    const renderCandidate = (candidate: SimilarStoryCandidate)=>/*#__PURE__*/ _jsxs("div", {
            className: "story-similarity-dialog-item",
            children: [
                /*#__PURE__*/ _jsxs("div", {
                    className: "story-similarity-dialog-title",
                    children: [
                        candidate.title,
                        candidate.episodeLabel ? ` ${candidate.episodeLabel}` : ""
                    ]
                }),
                /*#__PURE__*/ _jsxs("div", {
                    className: "story-similarity-dialog-meta",
                    children: [
                        candidate.magazineTitle || "雑誌不明",
                        candidate.issueLabel ? ` / ${candidate.issueLabel}` : candidate.issueTitle ? ` / ${candidate.issueTitle}` : ""
                    ]
                }),
                /*#__PURE__*/ _jsx("div", {
                    className: "story-similarity-dialog-meta",
                    children: candidate.contributorsLabel || "著者情報なし"
                })
            ]
        }, candidate.storyId);
    const isInsertBlocked = dialog.mode === "insert_blocked";
    const isInsertConfirm = dialog.mode === "insert_confirm";
    const isBrowse = dialog.mode === "browse";
    const showNoResults = isBrowse && exactMatches.length === 0 && nearMatches.length === 0;
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer story-similarity-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop"
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog story-similarity-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: isBrowse ? "類似タイトルを探す" : "類似タイトル確認"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: isInsertBlocked ? "同じタイトルの作品があります。新規に追加しますか。" : isInsertConfirm ? "近いタイトルがあります。新規に追加しますか。" : "完全一致と近似タイトルを表示しています。"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "story-similarity-dialog-body",
                        children: [
                            exactMatches.length > 0 && /*#__PURE__*/ _jsxs("section", {
                                className: "story-similarity-section",
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: "完全一致"
                                    }),
                                    exactMatches.map(renderCandidate)
                                ]
                            }),
                            nearMatches.length > 0 && /*#__PURE__*/ _jsxs("section", {
                                className: "story-similarity-section",
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: isInsertConfirm ? "近似候補 上位5件" : "近似候補"
                                    }),
                                    nearMatches.map(renderCandidate)
                                ]
                            }),
                            showNoResults && /*#__PURE__*/ _jsx("div", {
                                className: "story-similarity-empty-message",
                                children: "近いタイトルのものはありません。"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "story-similarity-dialog-actions",
                        children: [
                            (isInsertBlocked || isInsertConfirm) && /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "primary-button",
                                onClick: onConfirmInsert,
                                children: "YES"
                            }),
                            (isInsertBlocked || isInsertConfirm) && /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onRejectInsert,
                                children: isInsertBlocked ? "やめる" : "NO"
                            }),
                            isBrowse && /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onClose,
                                children: "閉じる"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
function MasterDuplicateDialog({ dialog, onClose, onOpenExisting }: {
    dialog: MasterDuplicateDialogState;
    onClose: ()=>void;
    onOpenExisting: (recordId: string)=>void;
}) {
    const title = dialog.kind === "authors" ? "著者" : dialog.kind === "publishers" ? "出版社" : "雑誌";
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop"
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog master-duplicate-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "同名マスター確認"
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "同じ",
                                            title,
                                            "名のマスターが見つかりました。"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-body",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-duplicate-summary",
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: dialog.name || "名称未入力"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: dialog.reading || "読み未入力"
                                    })
                                ]
                            }),
                            dialog.records.map((record)=>/*#__PURE__*/ _jsxs("div", {
                                    className: "master-duplicate-card",
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "master-duplicate-card-title",
                                            children: record.name
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "master-duplicate-card-meta",
                                            children: [
                                                "読み: ",
                                                record.reading || "未設定"
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "master-duplicate-card-meta",
                                            children: [
                                                "ID: ",
                                                record.id
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            className: "secondary-button",
                                            onClick: ()=>onOpenExisting(record.id),
                                            children: "既存を開く"
                                        })
                                    ]
                                }, `${dialog.kind}:${record.id}`))
                        ]
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "master-duplicate-dialog-actions",
                        children: /*#__PURE__*/ _jsx("button", {
                            type: "button",
                            className: "secondary-button",
                            onClick: onClose,
                            children: "入力を見直す"
                        })
                    })
                ]
            })
        ]
    });
}
function DeleteBlockedDialog({ dialog, onClose }: {
    dialog: DeleteBlockedDialogState;
    onClose: ()=>void;
}) {
    const title = dialog.kind === "authors" ? "著者" : dialog.kind === "publishers" ? "出版社" : "雑誌";
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop"
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog master-duplicate-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "削除できません"
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "この",
                                            title,
                                            "は、まだ他のデータと関係しています。"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-body",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-duplicate-summary",
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: dialog.name || "名称未設定"
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "ID: ",
                                            dialog.id
                                        ]
                                    })
                                ]
                            }),
                            dialog.dependencies.map((dependency)=>/*#__PURE__*/ _jsxs("div", {
                                    className: "master-duplicate-card dependency-card",
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "master-duplicate-card-title",
                                            children: dependency.label
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "master-duplicate-card-meta",
                                            children: [
                                                dependency.count,
                                                "件"
                                            ]
                                        })
                                    ]
                                }, `${dialog.kind}:${dependency.label}`)),
                            /*#__PURE__*/ _jsx("div", {
                                className: "master-delete-blocked-note",
                                children: "まだ関係しているものがあるので削除できません。参照を外してから、もう一度削除してください。"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "master-duplicate-dialog-actions",
                        children: /*#__PURE__*/ _jsx("button", {
                            type: "button",
                            className: "secondary-button",
                            onClick: onClose,
                            children: "閉じる"
                        })
                    })
                ]
            })
        ]
    });
}
function DeleteConfirmDialog({ dialog, onClose, onConfirm }: {
    dialog: DeleteConfirmDialogState;
    onClose: ()=>void;
    onConfirm: ()=>void;
}) {
    const title = dialog.kind === "authors" ? "著者" : dialog.kind === "publishers" ? "出版社" : "雑誌";
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop"
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog master-duplicate-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "削除確認"
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "この",
                                            title,
                                            "を削除してよいか確認してください。"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-body",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-duplicate-summary",
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: dialog.name || "名称未設定"
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "ID: ",
                                            dialog.id
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "master-delete-blocked-note",
                                children: "紐づけがないことを確認した上で、本当に削除する場合のみ実行してください。"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-actions",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onClose,
                                children: "やめる"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "primary-button danger-button",
                                onClick: onConfirm,
                                children: "削除する"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
function MagazineCsvDownloadDialog({ dialog, onClose, onToggleColumn, onModeChange, onDownload }: {
    dialog: MagazineCsvDownloadDialogState;
    onClose: ()=>void;
    onToggleColumn: (columnId: MagazineMasterCsvDownloadFieldId)=>void;
    onModeChange: (mode: "display" | "raw")=>void;
    onDownload: ()=>void;
}) {
    const selectedCount = dialog.selectedColumnIds.length;
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop",
                onClick: onClose
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog magazine-csv-download-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "雑誌マスター CSV ダウンロード"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "出力したい列を選択してください。初期状態ではすべて選択されています。"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "magazine-csv-download-dialog-body",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "magazine-csv-download-summary",
                                children: [
                                    "選択中 ",
                                    selectedCount,
                                    " 列"
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "magazine-csv-download-mode-group",
                                role: "radiogroup",
                                "aria-label": "CSV出力モード",
                                children: [
                                    /*#__PURE__*/ _jsxs("label", {
                                        className: [
                                            "magazine-csv-download-mode-option",
                                            dialog.mode === "display" ? "is-active" : ""
                                        ].filter(Boolean).join(" "),
                                        children: [
                                            /*#__PURE__*/ _jsx("input", {
                                                type: "radio",
                                                name: "magazine-csv-download-mode",
                                                checked: dialog.mode === "display",
                                                onChange: ()=>onModeChange("display")
                                            }),
                                            /*#__PURE__*/ _jsxs("span", {
                                                className: "magazine-csv-download-mode-copy",
                                                children: [
                                                    /*#__PURE__*/ _jsx("strong", {
                                                        children: "通常表示用"
                                                    }),
                                                    /*#__PURE__*/ _jsx("small", {
                                                        children: "人が読みやすい形で出力"
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("label", {
                                        className: [
                                            "magazine-csv-download-mode-option",
                                            dialog.mode === "raw" ? "is-active" : ""
                                        ].filter(Boolean).join(" "),
                                        children: [
                                            /*#__PURE__*/ _jsx("input", {
                                                type: "radio",
                                                name: "magazine-csv-download-mode",
                                                checked: dialog.mode === "raw",
                                                onChange: ()=>onModeChange("raw")
                                            }),
                                            /*#__PURE__*/ _jsxs("span", {
                                                className: "magazine-csv-download-mode-copy",
                                                children: [
                                                    /*#__PURE__*/ _jsx("strong", {
                                                        children: "JSONそのまま"
                                                    }),
                                                    /*#__PURE__*/ _jsx("small", {
                                                        children: "正式データ向けの生形式"
                                                    })
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "magazine-csv-download-columns",
                                role: "group",
                                "aria-label": "CSVに含める列",
                                children: magazineMasterCsvDownloadFields.map((column)=>{
                                    const isChecked = dialog.selectedColumnIds.includes(column.id);
                                    return /*#__PURE__*/ _jsxs("label", {
                                        className: "magazine-csv-download-column",
                                        children: [
                                            /*#__PURE__*/ _jsx("input", {
                                                type: "checkbox",
                                                checked: isChecked,
                                                onChange: ()=>onToggleColumn(column.id)
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                children: column.label
                                            })
                                        ]
                                    }, column.id);
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "magazine-csv-download-dialog-actions",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onClose,
                                children: "キャンセル"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "primary-button",
                                disabled: selectedCount === 0,
                                onClick: onDownload,
                                children: "ダウンロード"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
function MagazineCsvHelpDialog({ onClose }: {
    onClose: ()=>void;
}) {
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop",
                onClick: onClose
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog magazine-csv-help-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "雑誌マスター CSV Help"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "CSVメニューの役割と、入力時に守るルールをまとめています。"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "magazine-csv-help-dialog-body",
                        children: [
                            /*#__PURE__*/ _jsxs("section", {
                                className: "magazine-csv-help-section",
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: "CSVメニュー"
                                    }),
                                    /*#__PURE__*/ _jsxs("ul", {
                                        className: "magazine-csv-help-list",
                                        children: [
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "CSV File Down: 現在の雑誌マスターデータをCSVでダウンロードします。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "CSV File Template Down: 新規追加や一括修正のためのテンプレートCSVをダウンロードします。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "CSV File Upload: テンプレートに合わせたCSVを読み込み、新規追加または修正を行います。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "Undo Upload: 一括アップロード直後の反映を、1回だけ丸ごと元に戻す想定です。"
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("section", {
                                className: "magazine-csv-help-section",
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: "基本ルール"
                                    }),
                                    /*#__PURE__*/ _jsxs("ul", {
                                        className: "magazine-csv-help-list",
                                        children: [
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "CSVのヘッダー名は日本語で統一します。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "文字コードは UTF-8、区切りはカンマです。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "データ内にカンマや改行が入る場合は、その値全体をダブルクォートで囲みます。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "id が空欄なら新規追加、id が入っていれば既存データの修正として扱います。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "修正時に空欄の項目は「変更しない」として扱います。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "1件でもエラーがあれば、そのCSVアップロード全体を中止します。"
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("section", {
                                className: "magazine-csv-help-section",
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: "関連データの書き方"
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        className: "magazine-csv-help-text",
                                        children: [
                                            "出版社や関連雑誌のような複数値は、1件ごとに ",
                                            /*#__PURE__*/ _jsx("code", {
                                                children: ";"
                                            }),
                                            " で区切ります。"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        className: "magazine-csv-help-text",
                                        children: [
                                            "各項目は基本的に ",
                                            /*#__PURE__*/ _jsx("code", {
                                                children: "肩書|名前|読み"
                                            }),
                                            " の順で記入します。"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("div", {
                                        className: "magazine-csv-help-example",
                                        children: "発行|集英社|しゅうえいしゃ; 発売|ホーム社|ほーむしゃ"
                                    }),
                                    /*#__PURE__*/ _jsx("p", {
                                        className: "magazine-csv-help-text",
                                        children: "肩書がない場合は、名前と読みだけでも受け付ける想定です。"
                                    }),
                                    /*#__PURE__*/ _jsx("div", {
                                        className: "magazine-csv-help-example",
                                        children: "集英社|しゅうえいしゃ; ホーム社"
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        className: "magazine-csv-help-text",
                                        children: [
                                            "名前や読みそのものに区切り記号の ",
                                            /*#__PURE__*/ _jsx("code", {
                                                children: "|"
                                            }),
                                            " や ",
                                            /*#__PURE__*/ _jsx("code", {
                                                children: ";"
                                            }),
                                            " を入れたいときは、",
                                            /*#__PURE__*/ _jsx("code", {
                                                children: "\\|"
                                            }),
                                            " や ",
                                            /*#__PURE__*/ _jsx("code", {
                                                children: "\\;"
                                            }),
                                            " と書くと文字として扱います。"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("div", {
                                        className: "magazine-csv-help-example",
                                        children: "発行|A\\|B出版\\;東京|えーびーしゅっぱん"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("section", {
                                className: "magazine-csv-help-section",
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: "補完と確認"
                                    }),
                                    /*#__PURE__*/ _jsxs("ul", {
                                        className: "magazine-csv-help-list",
                                        children: [
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "publisher_id や magazine_id がなくても、名前や読みから候補を確認できる流れを想定しています。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "名前と id が食い違う場合も、そのまま流し込まず確認フェイズを入れます。"
                                            }),
                                            /*#__PURE__*/ _jsx("li", {
                                                children: "不足している出版社や雑誌があれば、その場で新規追加して処理を進める方針です。"
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "magazine-csv-help-dialog-actions",
                        children: /*#__PURE__*/ _jsx("button", {
                            type: "button",
                            className: "primary-button",
                            onClick: onClose,
                            children: "閉じる"
                        })
                    })
                ]
            })
        ]
    });
}
function MagazineCsvUploadDialog({ dialog, onClose, onCommit }: {
    dialog: MagazineCsvUploadDialogState;
    onClose: ()=>void;
    onCommit: ()=>void;
}) {
    const rows = dialog.preview.rows ?? [];
    const errorCount = dialog.preview.errorCount ?? 0;
    const canCommit = Boolean(dialog.preview.canCommit) && !dialog.isSubmitting;
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop",
                onClick: dialog.isSubmitting ? undefined : onClose
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog magazine-csv-upload-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "雑誌マスター CSV アップロード確認"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: dialog.fileName
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                disabled: dialog.isSubmitting,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "magazine-csv-upload-dialog-body",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "magazine-csv-upload-summary",
                                children: [
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "全 ",
                                            dialog.preview.totalRows ?? rows.length,
                                            " 行"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "新規 ",
                                            dialog.preview.createCount ?? 0,
                                            " 件"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "修正 ",
                                            dialog.preview.updateCount ?? 0,
                                            " 件"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        className: errorCount > 0 ? "has-error" : "",
                                        children: [
                                            "エラー ",
                                            errorCount,
                                            " 件"
                                        ]
                                    })
                                ]
                            }),
                            (dialog.submitError || dialog.preview.error) && /*#__PURE__*/ _jsx("div", {
                                className: "inline-feedback error",
                                children: dialog.submitError || dialog.preview.error
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "magazine-csv-upload-rows",
                                children: rows.map((row, rowIndex)=>/*#__PURE__*/ _jsxs("div", {
                                        className: [
                                            "magazine-csv-upload-row",
                                            row.action === "create" ? "is-create" : "is-update",
                                            row.status === "error" ? "is-error" : "is-ready"
                                        ].join(" "),
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "magazine-csv-upload-row-head",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("strong", {
                                                        children: [
                                                            rowIndex + 1,
                                                            "行目"
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: [
                                                            "magazine-csv-upload-row-badge",
                                                            row.action === "create" ? "create" : "update"
                                                        ].join(" "),
                                                        children: row.action === "create" ? "新規" : "修正"
                                                    }),
                                                    row.sourceId && /*#__PURE__*/ _jsx("span", {
                                                        className: "magazine-csv-upload-row-id",
                                                        children: row.sourceId
                                                    }),
                                                    row.title && /*#__PURE__*/ _jsx("span", {
                                                        className: "magazine-csv-upload-row-title",
                                                        children: row.title
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("ul", {
                                                className: "magazine-csv-upload-row-messages",
                                                children: row.messages.map((message, index)=>/*#__PURE__*/ _jsx("li", {
                                                        children: message
                                                    }, `${row.rowNumber}-${index}`))
                                            })
                                        ]
                                    }, row.rowNumber))
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "magazine-csv-upload-dialog-actions",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onClose,
                                disabled: dialog.isSubmitting,
                                children: "閉じる"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "primary-button",
                                onClick: onCommit,
                                disabled: !canCommit,
                                children: dialog.isSubmitting ? "取り込み中..." : "この内容で取り込む"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
function AuthorCsvDownloadDialog({ dialog, onClose, onToggleColumn, onModeChange, onDownload }: {
    dialog: AuthorCsvDownloadDialogState;
    onClose: ()=>void;
    onToggleColumn: (columnId: AuthorCsvDownloadFieldId)=>void;
    onModeChange: (mode: "display" | "raw")=>void;
    onDownload: ()=>void;
}) {
    const selectedCount = dialog.selectedColumnIds.length;
    return <div className="plain-dialog-layer master-duplicate-dialog-layer" role="dialog" aria-modal="true">
        <div aria-hidden="true" className="modal-blocking-backdrop plain-dialog-backdrop" onClick={onClose}/>
        <section className="plain-dialog magazine-csv-download-dialog">
            <div className="plain-dialog-header">
                <div>
                    <strong>著者 CSV ダウンロード</strong>
                    <span>出力したい列を選択してください。初期状態ではすべて選択されています。</span>
                </div>
                <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose}><CircleX size={28}/></button>
            </div>
            <div className="magazine-csv-download-dialog-body">
                <div className="magazine-csv-download-summary">選択中 {selectedCount} 列</div>
                <div className="magazine-csv-download-mode-group" role="radiogroup" aria-label="CSV出力モード">
                    <label className={["magazine-csv-download-mode-option", dialog.mode === "display" ? "is-active" : ""].filter(Boolean).join(" ")}>
                        <input type="radio" name="author-csv-download-mode" checked={dialog.mode === "display"} onChange={()=>onModeChange("display")}/>
                        <span className="magazine-csv-download-mode-copy"><strong>通常表示用</strong><small>人が読みやすい形で出力</small></span>
                    </label>
                    <label className={["magazine-csv-download-mode-option", dialog.mode === "raw" ? "is-active" : ""].filter(Boolean).join(" ")}>
                        <input type="radio" name="author-csv-download-mode" checked={dialog.mode === "raw"} onChange={()=>onModeChange("raw")}/>
                        <span className="magazine-csv-download-mode-copy"><strong>JSONそのまま</strong><small>正式データ向けの生形式</small></span>
                    </label>
                </div>
                <div className="magazine-csv-download-columns" role="group" aria-label="CSVに含める列">
                    {authorCsvDownloadFields.map((column)=>{
                        const isChecked = dialog.selectedColumnIds.includes(column.id);
                        return <label className="magazine-csv-download-column" key={column.id}>
                            <input type="checkbox" checked={isChecked} onChange={()=>onToggleColumn(column.id)}/>
                            <span>{column.label}</span>
                        </label>;
                    })}
                </div>
            </div>
            <div className="magazine-csv-download-dialog-actions">
                <button type="button" className="secondary-button" onClick={onClose}>キャンセル</button>
                <button type="button" className="primary-button" disabled={selectedCount === 0} onClick={onDownload}>ダウンロード</button>
            </div>
        </section>
    </div>;
}
function AuthorCsvHelpDialog({ onClose }: { onClose: ()=>void }) {
    return <div className="plain-dialog-layer master-duplicate-dialog-layer" role="dialog" aria-modal="true">
        <div aria-hidden="true" className="modal-blocking-backdrop plain-dialog-backdrop" onClick={onClose}/>
        <section className="plain-dialog magazine-csv-help-dialog">
            <div className="plain-dialog-header">
                <div>
                    <strong>著者 CSV Help</strong>
                    <span>CSVメニューの役割と、入力時に守るルールをまとめています。</span>
                </div>
                <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose}><CircleX size={28}/></button>
            </div>
            <div className="magazine-csv-help-dialog-body">
                <section className="magazine-csv-help-section">
                    <h3>CSVメニュー</h3>
                    <ul className="magazine-csv-help-list">
                        <li>CSV File Down: 現在の著者データをCSVでダウンロードします。</li>
                        <li>CSV File Template Down: 新規追加や一括修正のためのテンプレートCSVをダウンロードします。</li>
                        <li>CSV File Upload: テンプレートに合わせたCSVを読み込み、新規追加または修正を行います。</li>
                        <li>Undo Upload: 一括アップロード直後の反映を、1回だけ丸ごと元に戻す想定です。</li>
                    </ul>
                </section>
                <section className="magazine-csv-help-section">
                    <h3>基本ルール</h3>
                    <ul className="magazine-csv-help-list">
                        <li>CSVのヘッダー名は日本語で統一します。</li>
                        <li>文字コードは UTF-8、区切りはカンマです。</li>
                        <li>名前と読みは必須です。</li>
                        <li>id が空欄なら新規追加、id が入っていれば既存データの修正として扱います。</li>
                        <li>修正時に空欄の項目は「変更しない」として扱います。</li>
                        <li>1件でもエラーがあれば、そのCSVアップロード全体を中止します。</li>
                    </ul>
                </section>
                <section className="magazine-csv-help-section">
                    <h3>別名義とSNSの書き方</h3>
                    <p className="magazine-csv-help-text">別名義やSNSのような複数値は、1件ごとに <code>;</code> で区切ります。</p>
                    <p className="magazine-csv-help-text">別名義は <code>名前|ID</code>、SNSは <code>サービス|アカウント名|URL|メモ</code> の順で記入します。</p>
                    <div className="magazine-csv-help-example">別名サンプル|A000001; 既存別名義|A000002</div>
                    <div className="magazine-csv-help-example">X|@sample_author|https://x.com/sample_author|告知用; 公式サイト||https://example.jp/authors/sample|プロフィール</div>
                    <p className="magazine-csv-help-text">文字の中に <code>|</code> や <code>;</code> を入れたいときは <code>\|</code> や <code>\;</code> と書くと文字として扱います。</p>
                </section>
            </div>
            <div className="magazine-csv-help-dialog-actions">
                <button type="button" className="primary-button" onClick={onClose}>閉じる</button>
            </div>
        </section>
    </div>;
}
function AuthorCsvUploadDialog({ dialog, onClose, onCommit }: {
    dialog: AuthorCsvUploadDialogState;
    onClose: ()=>void;
    onCommit: ()=>void;
}) {
    const rows = dialog.preview.rows ?? [];
    const errorCount = dialog.preview.errorCount ?? 0;
    const canCommit = Boolean(dialog.preview.canCommit) && !dialog.isSubmitting;
    return <div className="plain-dialog-layer master-duplicate-dialog-layer" role="dialog" aria-modal="true">
        <div aria-hidden="true" className="modal-blocking-backdrop plain-dialog-backdrop" onClick={dialog.isSubmitting ? undefined : onClose}/>
        <section className="plain-dialog magazine-csv-upload-dialog">
            <div className="plain-dialog-header">
                <div>
                    <strong>著者 CSV アップロード確認</strong>
                    <span>{dialog.fileName}</span>
                </div>
                <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose} disabled={dialog.isSubmitting}><CircleX size={28}/></button>
            </div>
            <div className="magazine-csv-upload-dialog-body">
                <div className="magazine-csv-upload-summary">
                    <span>全 {dialog.preview.totalRows ?? rows.length} 行</span>
                    <span>新規 {dialog.preview.createCount ?? 0} 件</span>
                    <span>修正 {dialog.preview.updateCount ?? 0} 件</span>
                    <span className={errorCount > 0 ? "has-error" : ""}>エラー {errorCount} 件</span>
                </div>
                {(dialog.submitError || dialog.preview.error) && <div className="inline-feedback error">{dialog.submitError || dialog.preview.error}</div>}
                <div className="magazine-csv-upload-rows">
                    {rows.map((row, rowIndex)=><div className={["magazine-csv-upload-row", row.action === "create" ? "is-create" : "is-update", row.status === "error" ? "is-error" : "is-ready"].join(" ")} key={row.rowNumber}>
                        <div className="magazine-csv-upload-row-head">
                            <strong>{rowIndex + 1}行目</strong>
                            <span className={["magazine-csv-upload-row-badge", row.action === "create" ? "create" : "update"].join(" ")}>{row.action === "create" ? "新規" : "修正"}</span>
                            {row.sourceId && <span className="magazine-csv-upload-row-id">{row.sourceId}</span>}
                            {row.title && <span className="magazine-csv-upload-row-title">{row.title}</span>}
                        </div>
                        <ul className="magazine-csv-upload-row-messages">
                            {row.messages.map((message, index)=><li key={`${row.rowNumber}-${index}`}>{message}</li>)}
                        </ul>
                    </div>)}
                </div>
            </div>
            <div className="magazine-csv-upload-dialog-actions">
                <button type="button" className="secondary-button" onClick={onClose} disabled={dialog.isSubmitting}>閉じる</button>
                <button type="button" className="primary-button" onClick={onCommit} disabled={!canCommit}>{dialog.isSubmitting ? "取り込み中..." : "この内容で取り込む"}</button>
            </div>
        </section>
    </div>;
}
function PublisherCsvDownloadDialog({ dialog, onClose, onToggleColumn, onModeChange, onDownload }: {
    dialog: PublisherCsvDownloadDialogState;
    onClose: ()=>void;
    onToggleColumn: (columnId: PublisherCsvDownloadFieldId)=>void;
    onModeChange: (mode: "display" | "raw")=>void;
    onDownload: ()=>void;
}) {
    const selectedCount = dialog.selectedColumnIds.length;
    return <div className="plain-dialog-layer master-duplicate-dialog-layer" role="dialog" aria-modal="true">
        <div aria-hidden="true" className="modal-blocking-backdrop plain-dialog-backdrop" onClick={onClose}/>
        <section className="plain-dialog magazine-csv-download-dialog">
            <div className="plain-dialog-header">
                <div>
                    <strong>出版社 CSV ダウンロード</strong>
                    <span>出力したい列を選択してください。初期状態ではすべて選択されています。</span>
                </div>
                <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose}><CircleX size={28}/></button>
            </div>
            <div className="magazine-csv-download-dialog-body">
                <div className="magazine-csv-download-summary">選択中 {selectedCount} 列</div>
                <div className="magazine-csv-download-mode-group" role="radiogroup" aria-label="CSV出力モード">
                    <label className={["magazine-csv-download-mode-option", dialog.mode === "display" ? "is-active" : ""].filter(Boolean).join(" ")}>
                        <input type="radio" name="publisher-csv-download-mode" checked={dialog.mode === "display"} onChange={()=>onModeChange("display")}/>
                        <span className="magazine-csv-download-mode-copy"><strong>通常表示用</strong><small>人が読みやすい形で出力</small></span>
                    </label>
                    <label className={["magazine-csv-download-mode-option", dialog.mode === "raw" ? "is-active" : ""].filter(Boolean).join(" ")}>
                        <input type="radio" name="publisher-csv-download-mode" checked={dialog.mode === "raw"} onChange={()=>onModeChange("raw")}/>
                        <span className="magazine-csv-download-mode-copy"><strong>JSONそのまま</strong><small>正式データ向けの生形式</small></span>
                    </label>
                </div>
                <div className="magazine-csv-download-columns" role="group" aria-label="CSVに含める列">
                    {publisherCsvDownloadFields.map((column)=>{
                        const isChecked = dialog.selectedColumnIds.includes(column.id);
                        return <label className="magazine-csv-download-column" key={column.id}>
                            <input type="checkbox" checked={isChecked} onChange={()=>onToggleColumn(column.id)}/>
                            <span>{column.label}</span>
                        </label>;
                    })}
                </div>
            </div>
            <div className="magazine-csv-download-dialog-actions">
                <button type="button" className="secondary-button" onClick={onClose}>キャンセル</button>
                <button type="button" className="primary-button" disabled={selectedCount === 0} onClick={onDownload}>ダウンロード</button>
            </div>
        </section>
    </div>;
}
function PublisherCsvHelpDialog({ onClose }: { onClose: ()=>void }) {
    return <div className="plain-dialog-layer master-duplicate-dialog-layer" role="dialog" aria-modal="true">
        <div aria-hidden="true" className="modal-blocking-backdrop plain-dialog-backdrop" onClick={onClose}/>
        <section className="plain-dialog magazine-csv-help-dialog">
            <div className="plain-dialog-header">
                <div>
                    <strong>出版社 CSV Help</strong>
                    <span>CSVメニューの役割と、入力時に守るルールをまとめています。</span>
                </div>
                <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose}><CircleX size={28}/></button>
            </div>
            <div className="magazine-csv-help-dialog-body">
                <section className="magazine-csv-help-section">
                    <h3>CSVメニュー</h3>
                    <ul className="magazine-csv-help-list">
                        <li>CSV File Down: 現在の出版社データをCSVでダウンロードします。</li>
                        <li>CSV File Template Down: 新規追加や一括修正のためのテンプレートCSVをダウンロードします。</li>
                        <li>CSV File Upload: テンプレートに合わせたCSVを読み込み、新規追加または修正を行います。</li>
                        <li>Undo Upload: 一括アップロード直後の反映を、1回だけ丸ごと元に戻す想定です。</li>
                    </ul>
                </section>
                <section className="magazine-csv-help-section">
                    <h3>基本ルール</h3>
                    <ul className="magazine-csv-help-list">
                        <li>CSVのヘッダー名は日本語で統一します。</li>
                        <li>文字コードは UTF-8、区切りはカンマです。</li>
                        <li>名前と読みは必須です。</li>
                        <li>id が空欄なら新規追加、id が入っていれば既存データの修正として扱います。</li>
                        <li>修正時に空欄の項目は「変更しない」として扱います。</li>
                        <li>1件でもエラーがあれば、そのCSVアップロード全体を中止します。</li>
                    </ul>
                </section>
                <section className="magazine-csv-help-section">
                    <h3>関連データの書き方</h3>
                    <p className="magazine-csv-help-text">関連会社や関連URLのような複数値は、1件ごとに <code>;</code> で区切ります。</p>
                    <p className="magazine-csv-help-text">関連会社は <code>肩書|名前|ID</code> の順、関連URLは <code>肩書|URL|メモ</code> の順で記入します。</p>
                    <div className="magazine-csv-help-example">関連会社|サンプル関連会社|P000001; 取引先|未登録会社</div>
                    <div className="magazine-csv-help-example">公式|https://example.jp|会社概要; SNS|https://example.jp/x|運用中</div>
                    <p className="magazine-csv-help-text">名前やメモに <code>|</code> や <code>;</code> を入れたいときは <code>\|</code> や <code>\;</code> と書くと文字として扱います。</p>
                </section>
            </div>
            <div className="magazine-csv-help-dialog-actions">
                <button type="button" className="primary-button" onClick={onClose}>閉じる</button>
            </div>
        </section>
    </div>;
}
function PublisherCsvUploadDialog({ dialog, onClose, onCommit }: {
    dialog: PublisherCsvUploadDialogState;
    onClose: ()=>void;
    onCommit: ()=>void;
}) {
    const rows = dialog.preview.rows ?? [];
    const errorCount = dialog.preview.errorCount ?? 0;
    const canCommit = Boolean(dialog.preview.canCommit) && !dialog.isSubmitting;
    return <div className="plain-dialog-layer master-duplicate-dialog-layer" role="dialog" aria-modal="true">
        <div aria-hidden="true" className="modal-blocking-backdrop plain-dialog-backdrop" onClick={dialog.isSubmitting ? undefined : onClose}/>
        <section className="plain-dialog magazine-csv-upload-dialog">
            <div className="plain-dialog-header">
                <div>
                    <strong>出版社 CSV アップロード確認</strong>
                    <span>{dialog.fileName}</span>
                </div>
                <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose} disabled={dialog.isSubmitting}><CircleX size={28}/></button>
            </div>
            <div className="magazine-csv-upload-dialog-body">
                <div className="magazine-csv-upload-summary">
                    <span>全 {dialog.preview.totalRows ?? rows.length} 行</span>
                    <span>新規 {dialog.preview.createCount ?? 0} 件</span>
                    <span>修正 {dialog.preview.updateCount ?? 0} 件</span>
                    <span className={errorCount > 0 ? "has-error" : ""}>エラー {errorCount} 件</span>
                </div>
                {(dialog.submitError || dialog.preview.error) && <div className="inline-feedback error">{dialog.submitError || dialog.preview.error}</div>}
                <div className="magazine-csv-upload-rows">
                    {rows.map((row, rowIndex)=><div className={["magazine-csv-upload-row", row.action === "create" ? "is-create" : "is-update", row.status === "error" ? "is-error" : "is-ready"].join(" ")} key={row.rowNumber}>
                        <div className="magazine-csv-upload-row-head">
                            <strong>{rowIndex + 1}行目</strong>
                            <span className={["magazine-csv-upload-row-badge", row.action === "create" ? "create" : "update"].join(" ")}>{row.action === "create" ? "新規" : "修正"}</span>
                            {row.sourceId && <span className="magazine-csv-upload-row-id">{row.sourceId}</span>}
                            {row.title && <span className="magazine-csv-upload-row-title">{row.title}</span>}
                        </div>
                        <ul className="magazine-csv-upload-row-messages">
                            {row.messages.map((message, index)=><li key={`${row.rowNumber}-${index}`}>{message}</li>)}
                        </ul>
                    </div>)}
                </div>
            </div>
            <div className="magazine-csv-upload-dialog-actions">
                <button type="button" className="secondary-button" onClick={onClose} disabled={dialog.isSubmitting}>閉じる</button>
                <button type="button" className="primary-button" onClick={onCommit} disabled={!canCommit}>{dialog.isSubmitting ? "取り込み中..." : "この内容で取り込む"}</button>
            </div>
        </section>
    </div>;
}
function IssueCopyDialog({ dialog, onClose, onCountChange, onToggleField, onToggleIncrementField, onConfirmStep, onBackStep, onExecuteInsert }: {
    dialog: IssueCopyDialogState;
    onClose: ()=>void;
    onCountChange: (value: string)=>void;
    onToggleField: (fieldId: IssueCopyFieldId)=>void;
    onToggleIncrementField: (fieldId: IssueCopyIncrementFieldId)=>void;
    onConfirmStep: ()=>void;
    onBackStep: ()=>void;
    onExecuteInsert: ()=>void;
}) {
    const previewCount = dialog.previewLabels.length;
    const isConfirmMode = dialog.mode === "confirm";
    const canProceed = parseIssueCopyCount(dialog.countText, dialog.maxCopyCount) > 0;
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop"
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog issue-copy-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: isConfirmMode ? "雑誌個別情報コピー確認" : "雑誌個別情報を新規コピー"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: isConfirmMode ? "確認内容がよければ、このまま最終の追加処理へ進みます。" : "タイトルと読みは元データと同じ内容で必ずコピーします。ここでは、そのほかにコピーする項目と作成数を確認します。"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-body issue-copy-dialog-body",
                        children: isConfirmMode ? [
                            /*#__PURE__*/ _jsx("div", {
                                className: "issue-copy-confirm-title",
                                children: "以下のデータを追加していいですか？"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "issue-copy-confirm-list",
                                children: dialog.previewLabels.map((label, index)=>/*#__PURE__*/ _jsxs("div", {
                                        className: "issue-copy-confirm-item",
                                        children: [
                                            /*#__PURE__*/ _jsxs("span", {
                                                className: "issue-copy-confirm-quote",
                                                children: [
                                                    "「",
                                                    label || `${dialog.magazineTitle} 新規コピー ${index + 1}`,
                                                    "」"
                                                ]
                                            })
                                        ]
                                    }, `${label}:${index}`))
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-delete-blocked-note issue-copy-confirm-note",
                                children: [
                                    "以上の",
                                    previewCount,
                                    "冊をデータに追加してよいか、最後に確認してください。"
                                ]
                            })
                        ] : [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-duplicate-summary issue-copy-summary",
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: dialog.issueLabel || "雑誌個別"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: dialog.magazineTitle || "雑誌マスター未選択"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("label", {
                                className: "issue-copy-count-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "issue-copy-count-label",
                                        children: "新規コピー数"
                                    }),
                                    /*#__PURE__*/ _jsx("input", {
                                        type: "number",
                                        min: "1",
                                        step: "1",
                                        max: `${dialog.maxCopyCount}`,
                                        value: dialog.countText,
                                        onChange: (event)=>onCountChange(event.target.value),
                                        placeholder: "1"
                                    }),
                                    /*#__PURE__*/ _jsx("small", {
                                        children: [
                                            "ここでは UI のみ実装済みです。次に Insert 処理を接続します。上限は ",
                                            dialog.maxCopyCount,
                                            " 件です。"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-duplicate-summary issue-copy-fixed-fields",
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "固定でコピーする項目"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "タイトル、読み"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "この2項目は必須のため、元の雑誌個別情報と同じ内容をそのままコピーします。"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-delete-blocked-note issue-copy-excluded-note",
                                children: [
                                    /*#__PURE__*/ _jsx(AlertTriangle, {
                                        size: 18
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "今回の新規コピーでは、",
                                            /*#__PURE__*/ _jsx("strong", {
                                                children: "作品リスト"
                                            }),
                                            " と ",
                                            /*#__PURE__*/ _jsx("strong", {
                                                children: "コンテンツ"
                                            }),
                                            " はコピーしません。雑誌個別情報のみを対象にします。"
                                        ]
                                    }),
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "issue-copy-checklist-label",
                                children: "コピーする項目"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "issue-copy-checklist",
                                children: issueCopyFieldOptions.map((field)=>/*#__PURE__*/ _jsxs("div", {
                                        className: "issue-copy-check-item",
                                        children: [
                                            /*#__PURE__*/ _jsx("button", {
                                                type: "button",
                                                className: "issue-copy-maincheck",
                                                "aria-checked": dialog.selectedFieldIds.includes(field.id),
                                                role: "checkbox",
                                                onClick: ()=>onToggleField(field.id),
                                                children: /*#__PURE__*/ _jsx("span", {
                                                    className: "issue-copy-check-box",
                                                    "data-checked": dialog.selectedFieldIds.includes(field.id) ? "true" : "false",
                                                    "aria-hidden": "true"
                                                })
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "issue-copy-check-text",
                                                children: [
                                                    /*#__PURE__*/ _jsx("strong", {
                                                        children: field.label
                                                    }),
                                                    /*#__PURE__*/ _jsx("small", {
                                                        children: field.description
                                                    }),
                                                    field.incrementLabel && /*#__PURE__*/ _jsxs("div", {
                                                        className: "issue-copy-subcheck",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("button", {
                                                                type: "button",
                                                                className: "issue-copy-subcheck-toggle",
                                                                "aria-checked": dialog.incrementFieldIds.includes(field.id as IssueCopyIncrementFieldId),
                                                                role: "checkbox",
                                                                onClick: ()=>onToggleIncrementField(field.id as IssueCopyIncrementFieldId),
                                                                children: /*#__PURE__*/ _jsx("span", {
                                                                    className: "issue-copy-subcheck-box",
                                                                    "data-checked": dialog.incrementFieldIds.includes(field.id as IssueCopyIncrementFieldId) ? "true" : "false",
                                                                    "aria-hidden": "true"
                                                                })
                                                            }),
                                                            /*#__PURE__*/ _jsx("span", {
                                                                children: field.incrementLabel
                                                            })
                                                        ]
                                                    })
                                                ]
                                            })
                                        ]
                                    }, field.id))
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-actions",
                        children: isConfirmMode ? [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onBackStep,
                                disabled: dialog.isSubmitting,
                                children: "戻る"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "primary-button",
                                disabled: previewCount === 0 || dialog.isSubmitting,
                                onClick: onExecuteInsert,
                                children: dialog.isSubmitting ? "追加中..." : "追加する"
                            })
                        ] : [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onClose,
                                disabled: dialog.isSubmitting,
                                children: "閉じる"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "primary-button",
                                disabled: !canProceed || dialog.isSubmitting,
                                onClick: onConfirmStep,
                                children: "確認"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
function IssueDeleteConfirmDialog({ dialog, onClose, onConfirm }: {
    dialog: IssueDeleteDialogState;
    onClose: ()=>void;
    onConfirm: ()=>void;
}) {
    return /*#__PURE__*/ _jsxs("div", {
        className: "plain-dialog-layer master-duplicate-dialog-layer",
        role: "dialog",
        "aria-modal": "true",
        children: [
            /*#__PURE__*/ _jsx("div", {
                "aria-hidden": "true",
                className: "modal-blocking-backdrop plain-dialog-backdrop"
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "plain-dialog master-duplicate-dialog",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "plain-dialog-header",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "雑誌個別削除確認"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "削除すると、この号に含まれる掲載データもまとめて削除されます。"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "issue-sidebar-close",
                                "aria-label": "閉じる",
                                onClick: onClose,
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 28
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-body",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-duplicate-summary",
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: dialog.issue.label || "雑誌個別"
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        children: [
                                            "ID: ",
                                            dialog.issue.id
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "master-delete-blocked-note",
                                children: [
                                    "雑誌個別本体: 1件 / コンテンツ行: ",
                                    dialog.contentCount,
                                    "件 / 作品リスト story: ",
                                    dialog.storyCount,
                                    "件"
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "master-delete-blocked-note",
                                children: "storyマスターは、参照が 0 件になったものだけ自動で理論削除します。"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "master-duplicate-dialog-actions",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "secondary-button",
                                onClick: onClose,
                                children: "やめる"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "primary-button danger-button",
                                onClick: onConfirm,
                                children: "内容を確認して削除"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
const findAuthorOptionByName = (name: string, options: AutocompleteOption[])=>options.find((option)=>option.name === name.trim());
const makeAuthorAliasEntry = (name: string, options: AutocompleteOption[]): AuthorAliasEntry=>{
    const option = findAuthorOptionByName(name, options);
    return {
        name,
        author_key: option?.internalKey ?? "",
        author_id: option?.id ?? option?.aliases?.find((alias)=>/^[A-Z]\d/.test(alias)) ?? ""
    };
};
const emptyAuthorAliasRow = (): AuthorAliasEntry=>({
        name: "",
        author_key: "",
        author_id: ""
    });
const parseAuthorAliasValue = (value: string): AuthorAliasEntry[]=>{
    if (!value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry)=>{
            if (typeof entry === "string") {
                return {
                    name: /^[A-Z]\d/.test(entry) ? "" : entry,
                    author_key: "",
                    author_id: /^[A-Z]\d/.test(entry) ? entry : ""
                };
            }
            return {
                name: String(entry.name ?? entry.author_name ?? ""),
                author_key: String(entry.author_key ?? ""),
                author_id: String(entry.author_id ?? entry.id ?? "")
            };
        }).filter((entry)=>entry.name.trim() || entry.author_id.trim());
    } catch  {
        return value.split(/[,\u3001]/).map((name)=>({
                name: name.trim(),
                author_id: ""
            })).filter((entry)=>entry.name);
    }
};
const serializeAuthorAliasValue = (rows: AuthorAliasEntry[])=>JSON.stringify(rows.filter((row)=>row.name.trim() || row.author_id.trim()).map((row)=>({
            name: row.name,
            ...(row.author_key?.trim() ? {
                author_key: row.author_key
            } : {}),
            author_id: row.author_id
        })));
const formatAuthorAliasDisplay = (rows: AuthorAliasEntry[])=>rows.map((row)=>row.name || row.author_id).filter(Boolean).join("、");
const getAuthorAliasMatchRank = (option: AutocompleteOption, query: string)=>{
    const searchableTexts = [
        option.name,
        option.reading ?? "",
        ...option.aliases ?? []
    ].map(normalizeAutocompleteText).filter(Boolean);
    if (searchableTexts.some((text)=>text === query)) return 0;
    if (normalizeAutocompleteText(option.reading ?? "").startsWith(query)) return 1;
    if (normalizeAutocompleteText(option.name).startsWith(query)) return 2;
    if ((option.aliases ?? []).some((alias)=>normalizeAutocompleteText(alias).startsWith(query))) return 3;
    if (searchableTexts.some((text)=>text.includes(query))) return 4;
    return null;
};
const getAuthorAliasMatches = (value: string, options: AutocompleteOption[], selectedKeys: Set<string>, limit: number)=>{
    const query = normalizeAutocompleteText(value);
    if (!query) return [];
    return options.map((option)=>({
            option,
            rank: getAuthorAliasMatchRank(option, query)
        })).filter((match): match is { option: AutocompleteOption; rank: number }=>{
        if (match.rank == null) return false;
        return !selectedKeys.has(match.option.id ?? match.option.name);
    }).sort((left, right)=>left.rank - right.rank || (left.option.reading ?? left.option.name).localeCompare(right.option.reading ?? right.option.name, "ja") || left.option.name.localeCompare(right.option.name, "ja")).slice(0, limit).map((match)=>match.option);
};
function AuthorAliasInput({ value, options, onCreateAuthor, onChange, readOnly = false }: {
    value: string;
    options: AutocompleteOption[];
    onCreateAuthor: (name: string, reading: string)=>Promise<AuthorMasterRecord | null>;
    onChange: (value: string)=>void;
    readOnly?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [newReading, setNewReading] = useState("");
    const [warningText, setWarningText] = useState("");
    const [aliasText, setAliasText] = useState("");
    const [isCreateMode, setIsCreateMode] = useState(false);
    const [isSearchComposing, setIsSearchComposing] = useState(false);
    const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number; width: number }>({
        left: 24,
        top: 96,
        width: defaultUiPreferences.popupDefaultWidth
    });
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const parsedRows = useMemo(()=>parseAuthorAliasValue(value), [
        value
    ]);
    const selectedKeys = useMemo(()=>new Set(parsedRows.map((row)=>row.author_id || row.name)), [
        parsedRows
    ]);
    const aliasSuggestions = useMemo(()=>{
        if (normalizeAutocompleteText(aliasText).length < 2) return [];
        return getAuthorAliasMatches(aliasText, options, selectedKeys, defaultUiPreferences.authorAliasInlineMaxSuggestions);
    }, [
        aliasText,
        options,
        selectedKeys
    ]);
    const commitRows = (nextRows: AuthorAliasEntry[])=>{
        if (readOnly) return;
        onChange(serializeAuthorAliasValue(nextRows));
    };
    const closePopover = ()=>{
        setIsOpen(false);
        setWarningText("");
    };
    const appendAlias = (alias: AuthorAliasEntry)=>{
        if (!alias.name.trim() || !alias.author_id.trim()) return;
        if (parsedRows.some((row)=>row.author_id === alias.author_id || row.name === alias.name)) {
            closePopover();
            return;
        }
        commitRows([
            ...parsedRows,
            alias
        ]);
        closePopover();
    };
    const commitAliasText = (text = aliasText)=>{
        const rejectedNames: string[] = [];
        const draftRows = parseAuthorAliasValue(text).map((row)=>{
            if (row.author_id.trim()) return row;
            const exactMatch = options.find((option)=>normalizeAutocompleteText(option.name) === normalizeAutocompleteText(row.name));
            if (!exactMatch?.id) {
                if (row.name.trim()) rejectedNames.push(row.name.trim());
                return null;
            }
            return {
                name: exactMatch.name,
                author_key: exactMatch.internalKey ?? "",
                author_id: exactMatch.id
            };
        }).filter((row): row is AuthorAliasEntry=>Boolean(row && (row.name.trim() || row.author_id.trim())));
        if (rejectedNames.length > 0) {
            void showAlertDialog({
                title: "著者追加エラー",
                message: `著者マスターにない名前は追加できません。\n\n対象:\n- ${rejectedNames.join("\n- ")}`,
                confirmLabel: "OK"
            });
        }
        if (draftRows.length === 0) {
            setAliasText("");
            return;
        }
        const nextRows = [
            ...parsedRows
        ];
        draftRows.forEach((row)=>{
            const key = row.author_id || row.name;
            if (!key) return;
            if (nextRows.some((entry)=>entry.author_id === row.author_id && row.author_id || entry.name === row.name)) return;
            nextRows.push(row);
        });
        commitRows(nextRows);
        setAliasText("");
    };
    const openPopoverAt = (clientX: number, clientY: number)=>{
        if (readOnly) return;
        setPopoverPosition(calculateClickPopoverPosition(clientX, clientY, defaultUiPreferences.popupDefaultWidth, defaultUiPreferences.authorAliasPopupEstimatedHeight));
        setAliasText("");
        setSearchText("");
        setNewReading("");
        setWarningText("");
        setIsCreateMode(false);
        setIsSearchComposing(false);
        setIsOpen(true);
    };
    const openPopover = (event: ReactMouseEvent<HTMLElement>)=>openPopoverAt(event.clientX, event.clientY);
    const filteredOptions = useMemo(()=>{
        if (!normalizeAutocompleteText(searchText)) return options.filter((option)=>!selectedKeys.has(option.id ?? option.name)).slice(0, defaultUiPreferences.popupSelectionMaxSuggestions);
        return getAuthorAliasMatches(searchText, options, selectedKeys, defaultUiPreferences.popupSelectionMaxSuggestions);
    }, [
        options,
        searchText,
        selectedKeys
    ]);
    const canRegisterAuthor = isCreateMode && Boolean(searchText.trim()) && Boolean(newReading.trim()) && isHiraganaReading(newReading);
    const handleCreateAuthor = async ()=>{
        const name = searchText.trim();
        const reading = newReading.trim();
        if (!isCreateMode) {
            setWarningText("候補がない場合のみ新規作成できます");
            return;
        }
        if (!canRegisterAuthor) {
            setWarningText("著者名とひらがなの読みを入力してください");
            return;
        }
        const isConfirmed = await showConfirmDialog({
            title: "著者登録確認",
            message: `著者マスターに登録します。\n\n著者: ${name}\n読み: ${reading}\n\n登録してよろしいですか？`,
            confirmLabel: "OK",
            cancelLabel: "キャンセル"
        });
        if (!isConfirmed) {
            return;
        }
        const exactMatch = options.find((option)=>normalizeAutocompleteText(option.name) === normalizeAutocompleteText(name));
        if (exactMatch?.id) {
            appendAlias({
                name: exactMatch.name,
                author_key: exactMatch.internalKey ?? "",
                author_id: exactMatch.id
            });
            return;
        }
        const created = await onCreateAuthor(name, reading);
        if (!created) {
            setWarningText("著者を作成できませんでした");
            return;
        }
        setSearchText(created.name);
        setNewReading("");
        setWarningText("登録しました。候補から選択してください");
    };
    useEffect(()=>{
        if (!isOpen) return;
        searchInputRef.current?.focus();
    }, [
        isOpen
    ]);
    useEffect(()=>{
        if (!isOpen || !isCreateMode) return;
        searchInputRef.current?.focus();
    }, [
        isCreateMode,
        isOpen
    ]);
    useEffect(()=>{
        if (!isOpen || isSearchComposing) return;
        setIsCreateMode(filteredOptions.length === 0 && searchText.trim().length > 0);
    }, [
        filteredOptions.length,
        isOpen,
        isSearchComposing,
        searchText
    ]);
    useEffect(()=>{
        if (!isOpen) return;
        const handlePointerDown = (event: globalThis.MouseEvent)=>{
            const target = event.target as Node;
            if (!wrapRef.current?.contains(target) && !popoverRef.current?.contains(target)) closePopover();
        };
        const handleKeyDown = (event: KeyboardEvent)=>{
            if (event.key === "Escape") {
                event.preventDefault();
                closePopover();
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return ()=>{
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        isOpen
    ]);
    const popover = isOpen && typeof document !== "undefined" ? /*#__PURE__*/ createPortal(/*#__PURE__*/ _jsxs("div", {
        className: "author-alias-popover",
        ref: popoverRef,
        style: {
            left: popoverPosition.left,
            top: popoverPosition.top,
            width: popoverPosition.width
        },
        children: [
            isCreateMode ? /*#__PURE__*/ _jsxs("div", {
                className: "author-alias-create-header",
                children: [
                    /*#__PURE__*/ _jsx("input", {
                        ref: searchInputRef,
                        value: searchText,
                        placeholder: "著者",
                        onCompositionStart: ()=>setIsSearchComposing(true),
                        onCompositionEnd: ()=>setIsSearchComposing(false),
                        onChange: (event)=>setSearchText(event.target.value)
                    }),
                    /*#__PURE__*/ _jsx("input", {
                        value: newReading,
                        placeholder: "読み",
                        onChange: (event)=>setNewReading(event.target.value)
                    })
                ]
            }) : /*#__PURE__*/ _jsxs("div", {
                className: "author-alias-search-bar",
                children: [
                    /*#__PURE__*/ _jsx(Search, {
                        size: 15
                    }),
                    /*#__PURE__*/ _jsx("input", {
                        ref: searchInputRef,
                        value: searchText,
                        placeholder: "著者を検索",
                        onCompositionStart: ()=>setIsSearchComposing(true),
                        onCompositionEnd: ()=>setIsSearchComposing(false),
                        onChange: (event)=>setSearchText(event.target.value)
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "author-alias-list",
                children: filteredOptions.length > 0 ? filteredOptions.map((option)=>/*#__PURE__*/ _jsxs("button", {
                        type: "button",
                        className: selectedKeys.has(option.id ?? option.name) ? "author-alias-list-item active" : "author-alias-list-item",
                        disabled: selectedKeys.has(option.id ?? option.name),
                        onClick: ()=>appendAlias({
                                name: option.name,
                                author_key: option.internalKey ?? "",
                                author_id: option.id ?? ""
                            }),
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                className: "author-alias-list-name",
                                children: option.name
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: "author-alias-list-reading",
                                children: option.reading ?? ""
                            })
                        ]
                    }, option.id ?? option.name)) : /*#__PURE__*/ _jsx("div", {
                        className: "author-alias-empty",
                        children: "候補がありません"
                    })
            }),
            isCreateMode && /*#__PURE__*/ _jsxs("div", {
                className: "author-alias-create",
                children: [
                    /*#__PURE__*/ _jsxs("button", {
                        type: "button",
                        className: "author-alias-create-button",
                        disabled: !canRegisterAuthor,
                        onClick: handleCreateAuthor,
                        children: [
                            /*#__PURE__*/ _jsx(UserRoundPlus, {
                                size: 14
                            }),
                            "登録"
                        ]
                    })
                ]
            }),
            warningText && /*#__PURE__*/ _jsx("div", {
                className: "author-alias-warning-banner",
                children: warningText
            })
        ]
    }), document.body) : null;
    return /*#__PURE__*/ _jsxs("div", {
        className: "author-alias-input-wrap",
        ref: wrapRef,
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "tag-input author-alias-tag-input",
                onContextMenu: (event)=>{
                    if (readOnly) return;
                    event.preventDefault();
                    openPopover(event);
                },
                children: [
                    parsedRows.map((row)=>/*#__PURE__*/ _jsxs("span", {
                            className: `tag-chip author-alias-tag-chip entity-link-chip ${(row.author_id || row.author_key) ? "linked" : "unlinked"}`,
                            children: [
                                /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "tag-chip-remove-button",
                                    "aria-label": `${row.name || row.author_id}を削除`,
                                    disabled: readOnly,
                                    onClick: ()=>commitRows(parsedRows.filter((entry)=>entry.author_id !== row.author_id || entry.name !== row.name)),
                                    children: /*#__PURE__*/ _jsx(X, {
                                        size: 14
                                    })
                                }),
                                row.name || row.author_id
                            ]
                        }, `${row.author_id}-${row.name}`)),
                    /*#__PURE__*/ _jsx("input", {
                        value: aliasText,
                        placeholder: parsedRows.length > 0 ? "" : "別名義を入力",
                        readOnly: readOnly,
                        onChange: (event)=>setAliasText(event.target.value),
                        onBlur: ()=>commitAliasText(),
                        onKeyDown: (event)=>{
                            if (event.nativeEvent.isComposing) return;
                            if (event.key === "Backspace" && event.currentTarget.value === "" && parsedRows.length > 0) {
                                event.preventDefault();
                                commitRows(parsedRows.slice(0, -1));
                                return;
                            }
                            if (event.key === "Enter") {
                                event.preventDefault();
                                commitAliasText(event.currentTarget.value);
                            }
                        }
                    }),
                    !isOpen && aliasSuggestions.length > 0 && /*#__PURE__*/ _jsx("div", {
                        className: "author-alias-inline-suggestions",
                        children: aliasSuggestions.map((option)=>/*#__PURE__*/ _jsxs("button", {
                                type: "button",
                                onMouseDown: (event)=>{
                                    event.preventDefault();
                                    appendAlias({
                                        name: option.name,
                                        author_key: option.internalKey ?? "",
                                        author_id: option.id ?? ""
                                    });
                                    setAliasText("");
                                },
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "author-alias-inline-name",
                                        children: option.name
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "author-alias-inline-reading",
                                        children: option.reading ?? ""
                                    })
                                ]
                            }, option.id ?? option.name))
                    })
                ]
            }),
            popover
        ]
    });
}
function MasterListSelectionInput({ value, options, idKey, keyKey, placeholder, label, roleOptions = [], defaultRole = "", autoCommitDefaultRole = false, autoCommitRoleValue, replaceExisting = false, allowUnregistered = false, onChange, onOptionsChange, readOnly = false }: {
    value: string;
    options: AutocompleteOption[];
    idKey: string;
    keyKey?: string;
    placeholder: string;
    label: string;
    roleOptions?: string[];
    defaultRole?: string;
    autoCommitDefaultRole?: boolean;
    autoCommitRoleValue?: string;
    replaceExisting?: boolean;
    allowUnregistered?: boolean;
    onChange: (value: string)=>void;
    onOptionsChange?: (options: AutocompleteOption[])=>void;
    readOnly?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputText, setInputText] = useState("");
    const [searchText, setSearchText] = useState("");
    const [newReading, setNewReading] = useState("");
    const [selectedRole, setSelectedRole] = useState(defaultRole);
    const [warningText, setWarningText] = useState("");
    const [isCreateMode, setIsCreateMode] = useState(false);
    const [isSearchComposing, setIsSearchComposing] = useState(false);
    const [localOptions, setLocalOptions] = useState<AutocompleteOption[]>(options);
    const [pendingOption, setPendingOption] = useState<AutocompleteOption | null>(null);
    const [isPendingFromInline, setIsPendingFromInline] = useState(false);
    const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
    const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
    const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number; width: number }>({
        left: 24,
        top: 96,
        width: defaultUiPreferences.popupDefaultWidth
    });
    const [inlineSuggestionPosition, setInlineSuggestionPosition] = useState<{ left: number; top: number; width: number }>({
        left: 24,
        top: 96,
        width: defaultUiPreferences.popupDefaultWidth
    });
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const roleConfirmInputRef = useRef<HTMLInputElement | null>(null);
    const skipNextInputBlurRef = useRef(false);
    const popoverAnchorTopRef = useRef<number | null>(null);
    useEffect(()=>{
        setLocalOptions(options);
    }, [
        options
    ]);
    const parseEntries = (sourceValue: string): ListSelectionEntry[]=>{
        if (!sourceValue.trim()) return [];
        try {
            const parsed = JSON.parse(sourceValue);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((entry)=>{
                if (typeof entry === "string") {
                    const option = options.find((candidate)=>normalizeAutocompleteText(candidate.name) === normalizeAutocompleteText(entry));
                    return {
                        name: option?.name ?? entry,
                        id: option?.id ?? "",
                        internalKey: option?.internalKey ?? "",
                        reading: option?.reading ?? ""
                    };
                }
                const name = String(entry.name ?? entry.title ?? entry.publisher_name ?? "");
                return {
                    name,
                    id: String(entry[idKey] ?? entry.id ?? ""),
                    internalKey: String((keyKey ? entry[keyKey] : entry.internalKey) ?? ""),
                    reading: String(entry.reading ?? entry.title_reading ?? entry.publisher_reading ?? ""),
                    role: String(entry.role ?? "")
                };
            }).filter((entry)=>entry.name.trim() || entry.id.trim());
        } catch  {
            return parseRoleNameText(sourceValue).map((row)=>{
                const option = localOptions.find((candidate)=>normalizeAutocompleteText(candidate.name) === normalizeAutocompleteText(row.name));
                return {
                    name: option?.name ?? row.name,
                    id: option?.id ?? "",
                    internalKey: option?.internalKey ?? "",
                    reading: option?.reading ?? "",
                    role: row.role
                };
            }).filter((entry)=>entry.name.trim() || entry.id.trim());
        }
    };
    const rows = useMemo(()=>parseEntries(value), [
        value,
        localOptions,
        idKey
    ]);
    const selectedKeys = useMemo(()=>new Set(rows.map((row)=>row.id || row.name)), [
        rows
    ]);
    const serializeRows = (nextRows: ListSelectionEntry[])=>JSON.stringify(nextRows.filter((row)=>row.name.trim() || row.id.trim()).map((row)=>({
                role: row.role ?? "",
                name: row.name,
                reading: row.reading ?? "",
                [idKey]: row.id,
                ...(keyKey && row.internalKey ? {
                    [keyKey]: row.internalKey
                } : {})
            })));
    const commitRows = (nextRows: ListSelectionEntry[])=>{
        if (readOnly) return;
        onChange(serializeRows(nextRows));
    };
    const requiresRole = roleOptions.length > 0;
    const commitFreeTextRows = (text: string)=>{
        const parsedRows = parseRoleNameText(text).map((row)=>({
                name: row.name.trim(),
                id: "",
                internalKey: "",
                reading: "",
                role: row.role || selectedRole || defaultRole
            })).filter((row)=>row.name);
        if (parsedRows.length === 0) {
            setInputText("");
            return false;
        }
        const nextRows = replaceExisting ? [] : [
            ...rows
        ];
        parsedRows.forEach((row)=>{
            if (nextRows.some((entry)=>entry.name === row.name && entry.role === row.role)) return;
            nextRows.push(row);
        });
        commitRows(nextRows);
        setInputText("");
        return true;
    };
    const commitOption = (option: AutocompleteOption, role = selectedRole)=>{
        const normalizedName = option.name.trim();
        const normalizedId = option.id?.trim() ?? "";
        if (!normalizedName) return;
        if (!replaceExisting && rows.some((row)=>normalizedId ? row.id === normalizedId || row.name === normalizedName : row.name === normalizedName)) {
            setIsOpen(false);
            setInputText("");
            setPendingOption(null);
            setIsPendingFromInline(false);
            setEditingRowIndex(null);
            return;
        }
        const nextRow = {
            name: normalizedName,
            id: normalizedId,
            internalKey: option.internalKey ?? "",
            reading: option.reading ?? "",
            role
        };
        commitRows(replaceExisting ? [
            nextRow
        ] : [
            ...rows,
            nextRow
        ]);
        setInputText("");
        setPendingOption(null);
        setIsPendingFromInline(false);
        setEditingRowIndex(null);
        setIsOpen(false);
    };
    const appendOption = (option: AutocompleteOption, source: "dialog" | "inline" = "dialog")=>{
        if (!option.id) return;
        if (requiresRole) {
            if (autoCommitDefaultRole) {
                commitOption(option, autoCommitRoleValue ?? (selectedRole || defaultRole));
                return;
            }
            setPendingOption(option);
            setIsPendingFromInline(source === "inline");
            setSelectedRole(selectedRole || defaultRole);
            setWarningText("");
            return;
        }
        commitOption(option, "");
    };
    const commitPendingOption = ()=>{
        if (!pendingOption) return;
        const role = selectedRole.trim();
        if (editingRowIndex !== null) {
            const nextRows = rows.map((row, index)=>index === editingRowIndex ? {
                    ...row,
                    role
                } : row);
            commitRows(nextRows);
            setInputText("");
            setPendingOption(null);
            setIsPendingFromInline(false);
            setEditingRowIndex(null);
            setIsOpen(false);
            return;
        }
        commitOption(pendingOption, role);
    };
    const commitInputText = (text = inputText)=>{
        if (skipNextInputBlurRef.current) {
            skipNextInputBlurRef.current = false;
            return;
        }
        const rejectedNames: string[] = [];
        const draftRows = parseRoleNameText(text).map((row): ListSelectionEntry | null=>{
            const option = localOptions.find((candidate)=>normalizeAutocompleteText(candidate.name) === normalizeAutocompleteText(row.name));
            if (!option?.id) {
                if (!row.name.trim()) return null;
                if (!allowUnregistered) {
                    rejectedNames.push(row.name.trim());
                    return null;
                }
                return {
                    name: row.name.trim(),
                    id: "",
                    internalKey: "",
                    reading: "",
                    role: row.role || selectedRole
                };
            }
            return {
                name: option.name,
                id: option.id,
                internalKey: option.internalKey ?? "",
                reading: option.reading ?? "",
                role: row.role || selectedRole
            };
        }).filter((row): row is ListSelectionEntry=>Boolean(row && row.name.trim() && row.id.trim()));
        if (rejectedNames.length > 0) {
            void showAlertDialog({
                title: `${label}追加エラー`,
                message: `${label}マスターにない名前は追加できません。\n\n対象:\n- ${rejectedNames.join("\n- ")}`,
                confirmLabel: "OK"
            });
        }
        if (draftRows.length === 0) {
            setInputText("");
            return;
        }
        if (requiresRole && !autoCommitDefaultRole && draftRows.length === 1) {
            const row = draftRows[0];
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) openRoleConfirmPopoverAt(rect.left + 36, rect.top + rect.height / 2);
            setPendingOption({
                id: row.id,
                internalKey: row.internalKey,
                name: row.name,
                reading: row.reading ?? "",
                aliases: []
            });
            setIsPendingFromInline(false);
            setEditingRowIndex(null);
            setSelectedRole(row.role || selectedRole || defaultRole);
            setInputText("");
            return;
        }
        const nextRows = replaceExisting ? [] : [
            ...rows
        ];
        draftRows.forEach((row)=>{
            if (nextRows.some((entry)=>entry.id === row.id || entry.name === row.name)) return;
            nextRows.push(row);
        });
        commitRows(nextRows);
        setInputText("");
    };
    const inlineSuggestions = useMemo(()=>{
        const query = normalizeAutocompleteText(stripRoleNameQuotes(inputText));
        if (query.length < 2) return [];
        return getRankedListSelectionMatches(inputText, localOptions, selectedKeys, defaultUiPreferences.inlineSelectionMaxSuggestions);
    }, [
        inputText,
        localOptions,
        selectedKeys
    ]);
    const updateInlineSuggestionPosition = useCallback(()=>{
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        setInlineSuggestionPosition({
            left: rect.left + 8,
            top: rect.bottom + 4,
            width: Math.max(160, rect.width - 16)
        });
    }, []);
    const filteredOptions = useMemo(()=>{
        if (!normalizeAutocompleteText(stripRoleNameQuotes(searchText))) {
            return localOptions.slice(0, defaultUiPreferences.popupSelectionMaxSuggestions);
        }
        return getRankedListSelectionMatches(searchText, localOptions, new Set(), defaultUiPreferences.popupSelectionMaxSuggestions);
    }, [
        localOptions,
        searchText
    ]);
    const normalizedRegistrationName = stripRoleNameQuotes(searchText).trim();
    const canRegister = isCreateMode && Boolean(normalizedRegistrationName) && Boolean(newReading.trim()) && isHiraganaReading(newReading);
    const handleRegister = async ()=>{
        const name = normalizedRegistrationName;
        const reading = newReading.trim();
        if (!canRegister) {
            setWarningText(`${label}名とひらがなの読みを入力してください`);
            return;
        }
        const isConfirmed = await showConfirmDialog({
            title: `${label}登録確認`,
            message: `${label}マスターに登録します。\n\n${label}: ${name}\n読み: ${reading}\n\n登録してよろしいですか？`,
            confirmLabel: "OK",
            cancelLabel: "キャンセル"
        });
        if (!isConfirmed) return;
        if (idKey !== "author_id") {
            setWarningText("この画面から登録できるのは著者のみです");
            return;
        }
        try {
            const response = await fetch("/api/authors", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name,
                    reading
                })
            });
            const body = await response.json() as AuthorPatchResponse;
            if (response.status === 409 && body.duplicates?.length) {
                const duplicateOptions = buildAuthorAutocompleteOptions(body.duplicates);
                const nextOptions = [
                    ...localOptions,
                    ...duplicateOptions
                ].filter((option, index, source)=>source.findIndex((candidate)=>(candidate.id || candidate.name) === (option.id || option.name)) === index);
                setLocalOptions(nextOptions);
                onOptionsChange?.(nextOptions);
                if (duplicateOptions.length === 1) {
                    setSearchText("");
                    setNewReading("");
                    setWarningText("");
                    commitOption(duplicateOptions[0], requiresRole ? autoCommitRoleValue ?? (selectedRole || defaultRole) : "");
                    setIsCreateMode(false);
                    return;
                }
                setSearchText(name);
                setNewReading("");
                setWarningText("同じ名前の著者があるため、新規登録できませんでした。候補から選択してください");
                setIsCreateMode(false);
                return;
            }
            if (!response.ok || !body.record) {
                throw new Error(body.error || "著者マスターの登録に失敗しました");
            }
            const createdOption = buildAuthorAutocompleteOptions([
                body.record
            ])[0];
            const nextOptions = [
                ...localOptions.filter((option)=>(option.id || option.name) !== (createdOption.id || createdOption.name)),
                createdOption
            ].sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja"));
            setLocalOptions(nextOptions);
            onOptionsChange?.(nextOptions);
            setSearchText("");
            setNewReading("");
            setWarningText("");
            commitOption(createdOption, requiresRole ? autoCommitRoleValue ?? (selectedRole || defaultRole) : "");
        } catch (error) {
            setWarningText(error instanceof Error ? error.message : "著者マスターの登録に失敗しました");
        }
    };
    const rememberPopoverAnchorTop = ()=>{
        const anchorTop = wrapRef.current?.getBoundingClientRect().top;
        if (anchorTop !== undefined) popoverAnchorTopRef.current = anchorTop;
        return anchorTop;
    };
    const setInitialPopoverPosition = (clientX: number, estimatedHeight: number, rememberAnchor = true)=>{
        const anchorTop = rememberAnchor ? rememberPopoverAnchorTop() : popoverAnchorTopRef.current ?? rememberPopoverAnchorTop();
        const nextPosition = calculateClickPopoverPosition(clientX, anchorTop ?? 0, defaultUiPreferences.popupDefaultWidth, estimatedHeight);
        setPopoverPosition({
            ...nextPosition,
            top: (anchorTop ?? nextPosition.top + estimatedHeight + 2) - estimatedHeight - 2
        });
    };
    const openPopoverAt = (clientX: number, _clientY: number)=>{
        if (readOnly) return;
        setInitialPopoverPosition(clientX, defaultUiPreferences.selectionPopupEstimatedHeight);
        setInputText("");
        setSearchText("");
        setNewReading("");
        setWarningText("");
        setIsCreateMode(false);
        setIsSearchComposing(false);
        setPendingOption(null);
        setIsPendingFromInline(false);
        setEditingRowIndex(null);
        setIsOpen(true);
    };
    const openRoleConfirmPopoverAt = (clientX: number, _clientY: number, source: "dialog" | "inline" = "dialog")=>{
        if (readOnly) return;
        setInitialPopoverPosition(clientX, source === "inline" ? 150 : 210, !isOpen);
        setSearchText("");
        setNewReading("");
        setWarningText("");
        setIsCreateMode(false);
        setIsSearchComposing(false);
        setIsPendingFromInline(source === "inline");
        setEditingRowIndex(null);
        setIsOpen(true);
    };
    const openRoleEditPopoverAt = (row: ListSelectionEntry, rowIndex: number, clientX: number, _clientY: number)=>{
        if (readOnly) return;
        setInitialPopoverPosition(clientX, 150);
        setSearchText("");
        setNewReading("");
        setWarningText("");
        setIsCreateMode(false);
        setIsSearchComposing(false);
        setPendingOption({
            id: row.id,
            name: row.name,
            reading: row.reading ?? "",
            aliases: []
        });
        setIsPendingFromInline(true);
        setEditingRowIndex(rowIndex);
        setSelectedRole(row.role ?? "");
        setIsOpen(true);
    };
    useEffect(()=>{
        if (!isOpen) return;
        searchInputRef.current?.focus();
    }, [
        isOpen
    ]);
    useEffect(()=>{
        if (!isOpen || !pendingOption) return;
        roleConfirmInputRef.current?.focus();
    }, [
        isOpen,
        pendingOption
    ]);
    useEffect(()=>{
        if (isOpen || inlineSuggestions.length === 0) return undefined;
        const handlePositionChange = ()=>updateInlineSuggestionPosition();
        updateInlineSuggestionPosition();
        window.addEventListener("scroll", handlePositionChange, true);
        window.addEventListener("resize", handlePositionChange);
        return ()=>{
            window.removeEventListener("scroll", handlePositionChange, true);
            window.removeEventListener("resize", handlePositionChange);
        };
    }, [
        isOpen,
        inlineSuggestions.length,
        updateInlineSuggestionPosition
    ]);
    useEffect(()=>{
        setIsRoleMenuOpen(false);
    }, [
        pendingOption
    ]);
    useLayoutEffect(()=>{
        if (!isOpen || !popoverRef.current || popoverAnchorTopRef.current === null) return;
        const popoverElement = popoverRef.current;
        const updatePopoverTop = ()=>{
            const anchorTop = popoverAnchorTopRef.current;
            if (anchorTop === null) return;
            const nextTop = anchorTop - popoverElement.getBoundingClientRect().height - 2;
            setPopoverPosition((current)=>Math.abs(current.top - nextTop) < 0.5 ? current : {
                    ...current,
                    top: nextTop
                });
        };
        updatePopoverTop();
        const resizeObserver = new ResizeObserver(updatePopoverTop);
        resizeObserver.observe(popoverElement);
        return ()=>resizeObserver.disconnect();
    }, [
        isOpen
    ]);
    useEffect(()=>{
        if (!isOpen || isSearchComposing) return;
        if (pendingOption) {
            setIsCreateMode(false);
            return;
        }
        setIsCreateMode(filteredOptions.length === 0 && searchText.trim().length > 0);
    }, [
        filteredOptions.length,
        isOpen,
        isSearchComposing,
        pendingOption,
        searchText
    ]);
    useEffect(()=>{
        if (!isOpen) return;
        const handlePointerDown = (event: globalThis.MouseEvent)=>{
            const target = event.target as Node;
            if (!wrapRef.current?.contains(target) && !popoverRef.current?.contains(target)) setIsOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent)=>{
            if (event.key === "Escape") {
                event.preventDefault();
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return ()=>{
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        isOpen
    ]);
    const inlineSuggestionPopover = !isOpen && inlineSuggestions.length > 0 && typeof document !== "undefined" ? /*#__PURE__*/ createPortal(/*#__PURE__*/ _jsx("div", {
        className: "author-alias-inline-suggestions author-alias-inline-suggestions-floating",
        style: {
            left: inlineSuggestionPosition.left,
            top: inlineSuggestionPosition.top,
            width: inlineSuggestionPosition.width
        },
        children: inlineSuggestions.map((option)=>/*#__PURE__*/ _jsxs("button", {
                type: "button",
                onMouseDown: (event)=>{
                    event.preventDefault();
                    skipNextInputBlurRef.current = true;
                    if (requiresRole && !autoCommitDefaultRole) {
                        const rect = wrapRef.current?.getBoundingClientRect();
                        if (rect) openRoleConfirmPopoverAt(rect.left + 36, rect.top + rect.height / 2, "inline");
                        else openRoleConfirmPopoverAt(event.clientX, event.clientY, "inline");
                    }
                    appendOption(option, "inline");
                },
                children: [
                    /*#__PURE__*/ _jsx("span", {
                        className: "author-alias-inline-name",
                        children: option.name
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "author-alias-inline-reading",
                        children: option.reading ?? option.id ?? ""
                    })
                ]
            }, option.id ?? option.name))
    }), document.body) : null;
    const isInlineRoleConfirm = Boolean(pendingOption && isPendingFromInline);
    const popover = isOpen && typeof document !== "undefined" ? /*#__PURE__*/ createPortal(/*#__PURE__*/ _jsxs("div", {
        className: "list-selection-popover",
        ref: popoverRef,
        style: {
            left: popoverPosition.left,
            top: popoverPosition.top,
            width: popoverPosition.width
        },
        children: [
            !isInlineRoleConfirm && (isCreateMode ? /*#__PURE__*/ _jsxs("div", {
                className: "author-alias-create-header",
                children: [
                    /*#__PURE__*/ _jsx("input", {
                        ref: searchInputRef,
                        value: searchText,
                        placeholder: label,
                        onCompositionStart: ()=>setIsSearchComposing(true),
                        onCompositionEnd: ()=>setIsSearchComposing(false),
                        onChange: (event)=>{
                            setPendingOption(null);
                            setSearchText(event.target.value);
                        },
                        onKeyDown: (event)=>{
                            if (event.nativeEvent.isComposing || event.key !== "Enter") return;
                            event.preventDefault();
                            if (pendingOption) {
                                commitPendingOption();
                                return;
                            }
                            if (filteredOptions.length > 0) {
                                appendOption(filteredOptions[0]);
                                return;
                            }
                            if (canRegister) {
                                handleRegister();
                            }
                        }
                    }),
                    /*#__PURE__*/ _jsx("input", {
                        value: newReading,
                        placeholder: "読み",
                        onChange: (event)=>setNewReading(event.target.value)
                    })
                ]
            }) : /*#__PURE__*/ _jsxs("div", {
                className: "author-alias-search-bar",
                children: [
                    /*#__PURE__*/ _jsx(Search, {
                        size: 15
                    }),
                    /*#__PURE__*/ _jsx("input", {
                        ref: searchInputRef,
                        value: searchText,
                        placeholder: `${label}を検索`,
                        onCompositionStart: ()=>setIsSearchComposing(true),
                        onCompositionEnd: ()=>setIsSearchComposing(false),
                        onChange: (event)=>{
                            setPendingOption(null);
                            setSearchText(event.target.value);
                        },
                        onKeyDown: (event)=>{
                            if (event.nativeEvent.isComposing || event.key !== "Enter") return;
                            event.preventDefault();
                            if (pendingOption) {
                                commitPendingOption();
                                return;
                            }
                            if (filteredOptions.length > 0) {
                                appendOption(filteredOptions[0]);
                            }
                        }
                    })
                ]
            })),
            (!isInlineRoleConfirm || pendingOption) && /*#__PURE__*/ _jsx("div", {
                className: "author-alias-list",
                children: pendingOption ? /*#__PURE__*/ _jsxs("div", {
                    className: "list-selection-pending-item",
                    children: [
                        /*#__PURE__*/ _jsx("span", {
                            className: "author-alias-list-name",
                            children: pendingOption.name
                        }),
                        /*#__PURE__*/ _jsx("span", {
                            className: "author-alias-list-reading",
                            children: pendingOption.reading ?? pendingOption.id ?? ""
                        })
                    ]
                }) : filteredOptions.length > 0 ? filteredOptions.map((option)=>/*#__PURE__*/ _jsxs("button", {
                        type: "button",
                        className: selectedKeys.has(option.id ?? option.name) ? "author-alias-list-item active" : "author-alias-list-item",
                        disabled: selectedKeys.has(option.id ?? option.name),
                        onClick: ()=>appendOption(option),
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                className: "author-alias-list-name",
                                children: option.name
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: "author-alias-list-reading",
                                children: option.reading ?? option.id ?? ""
                            })
                        ]
                    }, option.id ?? option.name)) : /*#__PURE__*/ _jsx("div", {
                        className: "author-alias-empty",
                        children: "候補がありません"
                    })
            }),
            pendingOption && /*#__PURE__*/ _jsxs("div", {
                className: "list-selection-role-confirm-row",
                children: [
                    roleOptions.length > 0 && /*#__PURE__*/ _jsx("div", {
                        className: "list-selection-role-options",
                        children: /*#__PURE__*/ _jsxs("div", {
                            className: "list-selection-role-select-wrap",
                            children: [
                                /*#__PURE__*/ _jsx("input", {
                                    ref: roleConfirmInputRef,
                                    value: selectedRole,
                                    placeholder: "肩書",
                                    onChange: (event)=>setSelectedRole(event.target.value),
                                    onKeyDown: (event)=>{
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            commitPendingOption();
                                        }
                                    }
                                }),
                                /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "list-selection-role-select-icon",
                                    "aria-label": "肩書候補を開く",
                                    "aria-expanded": isRoleMenuOpen,
                                    onMouseDown: (event)=>event.preventDefault(),
                                    onClick: ()=>setIsRoleMenuOpen((current)=>!current),
                                    children: /*#__PURE__*/ _jsx(ChevronDown, {
                                        size: 18
                                    })
                                }),
                                isRoleMenuOpen && /*#__PURE__*/ _jsx("div", {
                                    className: "list-selection-role-menu",
                                    children: roleOptions.map((role)=>/*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            className: selectedRole === role ? "active" : "",
                                            onMouseDown: (event)=>event.preventDefault(),
                                            onClick: ()=>{
                                                setSelectedRole(role);
                                                setIsRoleMenuOpen(false);
                                                roleConfirmInputRef.current?.focus();
                                            },
                                            children: role
                                        }, role))
                                })
                            ]
                        })
                    })
                ]
            }),
            isCreateMode && /*#__PURE__*/ _jsxs("div", {
                className: "list-selection-register-row",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "list-selection-role-combo",
                        children: [
                            /*#__PURE__*/ _jsx("input", {
                                value: selectedRole,
                                placeholder: "肩書",
                                disabled: filteredOptions.length === 0,
                                onChange: (event)=>setSelectedRole(event.target.value)
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("button", {
                        type: "button",
                        className: "author-alias-create-button",
                        disabled: !canRegister,
                        onClick: handleRegister,
                        children: [
                            /*#__PURE__*/ _jsx(UserRoundPlus, {
                                size: 14
                            }),
                            "登録"
                        ]
                    })
                ]
            }),
            warningText && /*#__PURE__*/ _jsx("div", {
                className: "author-alias-warning-banner",
                children: warningText
            })
        ]
    }), document.body) : null;
    return /*#__PURE__*/ _jsxs("div", {
        className: "author-alias-input-wrap list-selection-input-wrap",
        ref: wrapRef,
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "tag-input author-alias-tag-input list-selection-tag-input",
                onContextMenu: (event)=>{
                    if (readOnly) return;
                    event.preventDefault();
                    openPopoverAt(event.clientX, event.clientY);
                },
                children: [
                    rows.map((row, rowIndex)=>/*#__PURE__*/ _jsxs("span", {
                            className: `tag-chip author-alias-tag-chip entity-link-chip ${(row.id || row.internalKey) ? "linked" : "unlinked"}`,
                            onContextMenu: (event)=>{
                                if (readOnly) return;
                                event.preventDefault();
                                event.stopPropagation();
                                openRoleEditPopoverAt(row, rowIndex, event.clientX, event.clientY);
                            },
                            children: [
                                /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "tag-chip-remove-button",
                                    "aria-label": `${row.name || row.id}を削除`,
                                    disabled: readOnly,
                                    onClick: ()=>commitRows(rows.filter((entry)=>entry.id !== row.id || entry.name !== row.name)),
                                    children: /*#__PURE__*/ _jsx(X, {
                                        size: 14
                                    })
                                }),
                                /*#__PURE__*/ _jsxs("span", {
                                    className: "list-selection-chip-text",
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "list-selection-chip-name",
                                            children: row.role ? `${row.role}：${row.name || row.id}` : row.name || row.id
                                        })
                                    ]
                                })
                            ]
                        }, `${row.id}-${row.name}`)),
                    /*#__PURE__*/ _jsx("input", {
                        value: inputText,
                        placeholder: rows.length > 0 ? "" : placeholder,
                        readOnly: readOnly,
                        onInput: (event)=>setInputText(event.currentTarget.value),
                        onCompositionEnd: (event)=>setInputText(event.currentTarget.value),
                        onChange: (event)=>setInputText(event.target.value),
                        onBlur: (event)=>{
                            if (allowUnregistered && event.currentTarget.value.trim()) {
                                commitFreeTextRows(event.currentTarget.value);
                                return;
                            }
                            commitInputText();
                        },
                        onKeyDown: (event)=>{
                            if (event.nativeEvent.isComposing) return;
                            if (event.key === "Backspace" && event.currentTarget.value === "" && rows.length > 0) {
                                event.preventDefault();
                                commitRows(rows.slice(0, -1));
                                return;
                            }
                            if (event.key === "Enter") {
                                event.preventDefault();
                                if (inlineSuggestions.length > 0) {
                                    skipNextInputBlurRef.current = true;
                                    if (requiresRole && !autoCommitDefaultRole) {
                                        const rect = wrapRef.current?.getBoundingClientRect();
                                        if (rect) openRoleConfirmPopoverAt(rect.left + 36, rect.top + rect.height / 2, "inline");
                                    }
                                    appendOption(inlineSuggestions[0], "inline");
                                    return;
                                }
                                if (allowUnregistered && event.currentTarget.value.trim()) {
                                    commitFreeTextRows(event.currentTarget.value);
                                    return;
                                }
                                commitInputText(event.currentTarget.value);
                            }
                        }
                    }),
                    null
                ]
            }),
            inlineSuggestionPopover,
            popover
        ]
    });
}
const emptySocialLinkRow = (): SocialLinkEntry=>({
        service: "",
        account: "",
        url: "",
        memo: ""
    });
const socialServiceOptions = [
    "X",
    "BlueSky",
    "インスタ",
    "Instagram",
    "YouTube",
    "ニコニコ動画",
    "mix",
    "mix2",
    "TikTok",
    "パトレオン",
    "Patreon",
    "Pixiv",
    "Pixiv FANBOX",
    "Fantia",
    "note",
    "BOOTH",
    "Skeb",
    "Threads",
    "Facebook",
    "Mastodon",
    "Misskey",
    "Tumblr",
    "LINE",
    "Discord",
    "Twitch",
    "GitHub",
    "SoundCloud",
    "Spotify",
    "Flickr",
    "noteメンバーシップ",
    "Ci-en",
    "DLsite",
    "DMM",
    "FANZA",
    "メロンブックス",
    "とらのあな",
    "Amazon著者ページ",
    "Wikipedia",
    "公式サイト",
    "ブログ",
    "メール",
    "その他"
];
const parseSocialLinksValue = (value: string): SocialLinkEntry[]=>{
    if (!value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry)=>({
                service: String(entry.service ?? ""),
                account: String(entry.account ?? entry.account_name ?? ""),
                url: String(entry.url ?? ""),
                memo: String(entry.memo ?? entry.note ?? "")
            })).filter((entry)=>entry.service || entry.account || entry.url || entry.memo);
    } catch  {
        return [];
    }
};
const serializeSocialLinksValue = (rows: SocialLinkEntry[])=>JSON.stringify(rows.filter((row)=>row.service.trim() || row.account.trim() || row.url.trim() || row.memo.trim()));
function SocialLinksTable({ value, onChange, readOnly = false }: {
    value: string;
    onChange: (value: string)=>void;
    readOnly?: boolean;
}) {
    const [visibleRowCount, setVisibleRowCount] = useState(3);
    const parsedRows = parseSocialLinksValue(value);
    const effectiveRowCount = Math.max(visibleRowCount, parsedRows.length);
    const rows = [
        ...parsedRows,
        ...Array.from({
            length: Math.max(0, effectiveRowCount - parsedRows.length)
        }, ()=>({
                ...emptySocialLinkRow()
            }))
    ];
    const updateRows = (nextRows: SocialLinkEntry[])=>onChange(serializeSocialLinksValue(nextRows));
    const updateRow = (rowIndex: number, field: keyof SocialLinkEntry, nextValue: string)=>{
        updateRows(rows.map((row, index)=>index === rowIndex ? {
                    ...row,
                    [field]: nextValue
                } : row));
    };
    const addRow = ()=>updateRows([
            ...rows,
            {
                ...emptySocialLinkRow()
            }
        ]);
    const handleAddRow = ()=>{
        setVisibleRowCount((count)=>count + 1);
        addRow();
    };
    const deleteRow = (rowIndex: number)=>{
        setVisibleRowCount(Math.max(1, rows.length - 1));
        updateRows(rows.filter((_, index)=>index !== rowIndex));
    };
    return <div className="social-links-table">
        <div className="social-links-scroll">
            <div className="social-links-head">
                <span/>
                <span>サービス</span>
                <span>アカウント名</span>
                <span>URL</span>
                <span>備考</span>
            </div>
            <div className="social-links-body">
                {rows.map((row, rowIndex)=><div className="social-links-row" key={`social-${rowIndex}`}>
                    <button type="button" className="social-link-delete-button" aria-label="SNS行を削除" disabled={readOnly} onClick={()=>deleteRow(rowIndex)}>
                        <Trash2 size={15}/>
                    </button>
                    <SelectableTextInput value={row.service} placeholder="サービス" options={socialServiceOptions} disabled={readOnly} onChange={(value)=>updateRow(rowIndex, "service", value)}/>
                    <input value={row.account} placeholder="@sample" readOnly={readOnly} onChange={(event)=>updateRow(rowIndex, "account", event.target.value)}/>
                    <input value={row.url} placeholder="https://" readOnly={readOnly} onChange={(event)=>updateRow(rowIndex, "url", event.target.value)}/>
                    <input value={row.memo} placeholder="備考" readOnly={readOnly} onChange={(event)=>updateRow(rowIndex, "memo", event.target.value)}/>
                </div>)}
            </div>
            <button type="button" className="social-links-add-button" disabled={readOnly} onClick={handleAddRow}>
                <CirclePlus size={16}/>
                追加
            </button>
        </div>
    </div>;
}
const emptyRelatedUrlRow = (): RelatedUrlEntry=>({
        role: "",
        url: "",
        memo: ""
    });
const parseRelatedUrlValue = (value: string): RelatedUrlEntry[]=>{
    if (!value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry)=>({
                role: String(entry.role ?? entry.label ?? entry.title ?? ""),
                url: String(entry.url ?? ""),
                memo: String(entry.memo ?? entry.note ?? "")
            })).filter((entry)=>entry.role || entry.url || entry.memo);
    } catch  {
        return [];
    }
};
const serializeRelatedUrlValue = (rows: RelatedUrlEntry[])=>JSON.stringify(rows.filter((row)=>row.role.trim() || row.url.trim() || row.memo.trim()));
function RelatedUrlTable({ value, onChange, readOnly = false }: {
    value: string;
    onChange: (value: string)=>void;
    readOnly?: boolean;
}) {
    const [visibleRowCount, setVisibleRowCount] = useState(3);
    const parsedRows = parseRelatedUrlValue(value);
    const effectiveRowCount = Math.max(visibleRowCount, parsedRows.length);
    const rows = [
        ...parsedRows,
        ...Array.from({
            length: Math.max(0, effectiveRowCount - parsedRows.length)
        }, ()=>({
                ...emptyRelatedUrlRow()
            }))
    ];
    const updateRows = (nextRows: RelatedUrlEntry[])=>onChange(serializeRelatedUrlValue(nextRows));
    const updateRow = (rowIndex: number, field: keyof RelatedUrlEntry, nextValue: string)=>{
        updateRows(rows.map((row, index)=>index === rowIndex ? {
                    ...row,
                    [field]: nextValue
                } : row));
    };
    const addRow = ()=>updateRows([
            ...rows,
            {
                ...emptyRelatedUrlRow()
            }
        ]);
    const handleAddRow = ()=>{
        setVisibleRowCount((count)=>count + 1);
        addRow();
    };
    const deleteRow = (rowIndex: number)=>{
        setVisibleRowCount(Math.max(1, rows.length - 1));
        updateRows(rows.filter((_, index)=>index !== rowIndex));
    };
    return <div className="related-url-table">
        <div className="related-url-scroll">
            <div className="related-url-head">
                <span/>
                <span>肩書</span>
                <span>URL</span>
                <span>備考</span>
            </div>
            <div className="related-url-body">
                {rows.map((row, rowIndex)=><div className="related-url-row" key={`related-url-${rowIndex}`}>
                    <button type="button" className="related-url-delete-button" aria-label="関連URL行を削除" disabled={readOnly} onClick={()=>deleteRow(rowIndex)}>
                        <Trash2 size={15}/>
                    </button>
                    <input value={row.role} placeholder="肩書" readOnly={readOnly} onChange={(event)=>updateRow(rowIndex, "role", event.target.value)}/>
                    <input value={row.url} placeholder="https://" readOnly={readOnly} onChange={(event)=>updateRow(rowIndex, "url", event.target.value)}/>
                    <input value={row.memo} placeholder="備考" readOnly={readOnly} onChange={(event)=>updateRow(rowIndex, "memo", event.target.value)}/>
                </div>)}
            </div>
            <button type="button" className="related-url-add-button" disabled={readOnly} onClick={handleAddRow}>
                <CirclePlus size={16}/>
                追加
            </button>
        </div>
    </div>;
}
const findPublisherOptionByName = (name: string, options: AutocompleteOption[])=>options.find((option)=>option.name === name.trim());
const makeRelatedPublisherEntry = (role: string, name: string, options: AutocompleteOption[]): RelatedPublisherEntry=>{
    const option = findPublisherOptionByName(name, options);
    return {
        role,
        name,
        publisher_key: option?.internalKey ?? "",
        publisher_id: option?.id ?? option?.aliases?.find((alias)=>/^P/.test(alias)) ?? ""
    };
};
const parseRelatedPublisherValue = (value: string): RelatedPublisherEntry[]=>{
    if (!value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry)=>{
            if (typeof entry === "string") {
                return {
                    role: "",
                    name: entry,
                    publisher_key: "",
                    publisher_id: /^P/.test(entry) ? entry : ""
                };
            }
            return {
                role: String(entry.role ?? entry.relation ?? ""),
                name: String(entry.name ?? entry.publisher_name ?? ""),
                publisher_key: String(entry.publisher_key ?? ""),
                publisher_id: String(entry.publisher_id ?? entry.id ?? "")
            };
        }).filter((entry)=>entry.role.trim() || entry.name.trim() || entry.publisher_id.trim() || entry.publisher_key?.trim());
    } catch  {
        return [];
    }
};
const serializeRelatedPublisherValue = (rows: RelatedPublisherEntry[])=>JSON.stringify(rows.filter((row)=>row.role.trim() || row.name.trim() || row.publisher_id.trim() || row.publisher_key?.trim()));
const formatRelatedPublisherDisplay = (rows: RelatedPublisherEntry[])=>rows.map((row)=>row.role && row.name ? `${row.role}:${row.name}` : row.name || row.publisher_id).filter(Boolean).join("、");
const emptyRelatedPublisherRow = (): RelatedPublisherEntry=>({
        role: "",
        name: "",
        publisher_key: "",
        publisher_id: ""
    });
type TableDialogExpansion = "default" | "wide-left" | "wide-right";
const getTableDialogExpansion = (anchor: HTMLElement | null, clientX: number): TableDialogExpansion=>{
    const rect = anchor?.getBoundingClientRect();
    if (!rect || rect.width >= 320) return "default";
    return clientX > window.innerWidth / 2 ? "wide-left" : "wide-right";
};
const getTableDialogPopoverClassName = (expansion: TableDialogExpansion)=>expansion === "default" ? "related-publisher-popover" : `related-publisher-popover ${expansion}`;
function RelatedPublisherInput({ value, options, onChange, roleOptions = relatedPublisherRoleOptions, defaultRole = "", placeholder = "関連会社を入力", namePlaceholder = "会社名を入力", roleHeader = "関係", nameHeader = "会社名", nameLabel = "会社名" }: {
    value: string;
    options: AutocompleteOption[];
    onChange: (value: string)=>void;
    roleOptions?: string[];
    defaultRole?: string;
    placeholder?: string;
    namePlaceholder?: string;
    roleHeader?: string;
    nameHeader?: string;
    nameLabel?: string;
}) {
    const [visibleRowCount, setVisibleRowCount] = useState(1);
    const [isOpen, setIsOpen] = useState(false);
    const [isMainFocused, setIsMainFocused] = useState(false);
    const [inputText, setInputText] = useState("");
    const [focusedRow, setFocusedRow] = useState<number | null>(null);
    const [closeWarning, setCloseWarning] = useState("");
    const [popoverExpansion, setPopoverExpansion] = useState<TableDialogExpansion>("default");
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const parsedRows = parseRelatedPublisherValue(value);
    const effectiveRowCount = Math.max(visibleRowCount, parsedRows.length, 1);
    const rows = [
        ...parsedRows,
        ...Array.from({
            length: Math.max(0, effectiveRowCount - parsedRows.length)
        }, ()=>emptyRelatedPublisherRow())
    ];
    const completedCount = parsedRows.filter((row)=>row.role.trim() || row.name.trim() || row.publisher_id.trim()).length;
    const hasAnyVisibleInput = rows.some((row)=>row.role.trim() || row.name.trim());
    const hasPublisherName = rows.some((row)=>row.name.trim());
    const hasRoleWithoutName = rows.some((row)=>row.role.trim() && !row.name.trim());
    const closeBlockMessage = !hasAnyVisibleInput ? "" : !hasPublisherName ? `${nameLabel}を1件以上入力してください` : hasRoleWithoutName ? `${roleHeader}だけの行は${nameLabel}も入力してください` : "";
    const updateRows = (nextRows: RelatedPublisherEntry[])=>onChange(serializeRelatedPublisherValue(nextRows));
    const updateRow = (rowIndex: number, field: "role" | "name", nextValue: string)=>{
        updateRows(rows.map((row, index)=>{
            if (index !== rowIndex) return row;
            if (field === "name") return makeRelatedPublisherEntry(row.role || defaultRole, nextValue, options);
            return {
                ...row,
                role: nextValue
            };
        }));
    };
    const addRow = ()=>{
        setVisibleRowCount((count)=>count + 1);
        updateRows([
            ...rows,
            emptyRelatedPublisherRow()
        ]);
    };
    const deleteRow = (rowIndex: number)=>{
        const targetRow = rows[rowIndex];
        if (targetRow?.role.trim() || targetRow?.name.trim() || targetRow?.publisher_id.trim() || targetRow?.publisher_key?.trim()) {
            setCloseWarning("入力済みの行は削除できません");
            return;
        }
        setVisibleRowCount(Math.max(1, rows.length - 1));
        updateRows(rows.filter((_, index)=>index !== rowIndex));
    };
    const closePopover = ()=>{
        if (closeBlockMessage) {
            setCloseWarning(closeBlockMessage);
            return false;
        }
        setCloseWarning("");
        setIsOpen(false);
        setIsMainFocused(false);
        setFocusedRow(null);
        setPopoverExpansion("default");
        return true;
    };
    const openPopover = (clientX: number)=>{
        setCloseWarning("");
        setPopoverExpansion(getTableDialogExpansion(wrapRef.current, clientX));
        setIsOpen(true);
    };
    useEffect(()=>{
        if (!closeBlockMessage) setCloseWarning("");
    }, [
        closeBlockMessage
    ]);
    const commitMainInputText = (rawValue: string)=>{
        const nextValue = rawValue.trim();
        if (!nextValue) {
            setInputText("");
            return;
        }
        const nextRow = makeRelatedPublisherEntry(defaultRole, nextValue, options);
        if (!nextRow.name.trim() && !nextRow.publisher_id.trim() && !(nextRow.publisher_key ?? "").trim()) {
            setInputText("");
            return;
        }
        if (parsedRows.some((row)=>(row.publisher_id && nextRow.publisher_id && row.publisher_id === nextRow.publisher_id) || normalizeAutocompleteText(row.name) === normalizeAutocompleteText(nextRow.name))) {
            setInputText("");
            return;
        }
        updateRows([
            ...parsedRows,
            nextRow
        ]);
        setInputText("");
    };
    useEffect(()=>{
        if (!isOpen) return;
        const handlePointerDown = (event: globalThis.MouseEvent)=>{
            if (!wrapRef.current?.contains(event.target as Node)) closePopover();
        };
        const handleKeyDown = (event: KeyboardEvent)=>{
            if (event.key === "Escape") {
                event.preventDefault();
                closePopover();
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return ()=>{
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        isOpen,
        closeBlockMessage
    ]);
    const mainSuggestions = !isOpen && isMainFocused ? getAutocompleteMatches(inputText, options).filter((suggestion)=>!parsedRows.some((row)=>normalizeAutocompleteText(row.name) === normalizeAutocompleteText(suggestion))) : [];
    return <div className="related-publisher-input-wrap" ref={wrapRef}>
        <div className="tag-input author-alias-tag-input list-selection-tag-input related-publisher-input">
            {parsedRows.map((row, rowIndex)=><span className={`tag-chip author-alias-tag-chip entity-link-chip ${(row.publisher_id || row.publisher_key) ? "linked" : "unlinked"}`} key={`related-publisher-chip-${row.publisher_id || row.publisher_key || row.name}-${rowIndex}`}>
                <button type="button" className="tag-chip-remove-button" aria-label={`${row.name || row.publisher_id}を削除`} onClick={()=>updateRows(parsedRows.filter((_, index)=>index !== rowIndex))}>
                    <X size={14}/>
                </button>
                <span className="list-selection-chip-text">
                    <span className="list-selection-chip-name">{row.role ? `${row.role}：${row.name || row.publisher_id}` : row.name || row.publisher_id}</span>
                </span>
            </span>)}
            <input value={inputText} placeholder={parsedRows.length > 0 ? "" : placeholder} onFocus={()=>setIsMainFocused(true)} onBlur={(event)=>{
                setIsMainFocused(false);
                commitMainInputText(event.currentTarget.value);
            }} onChange={(event)=>setInputText(event.target.value)} onKeyDown={(event)=>{
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Backspace" && event.currentTarget.value === "" && parsedRows.length > 0) {
                    event.preventDefault();
                    updateRows(parsedRows.slice(0, -1));
                    return;
                }
                if (event.key === "Enter") {
                    event.preventDefault();
                    commitMainInputText(event.currentTarget.value);
                }
            }}/>
            <button type="button" onClick={(event)=>isOpen ? closePopover() : openPopover(event.clientX)}>{completedCount > 0 ? `${completedCount}件` : "複数"}</button>
            <NameSuggestionList suggestions={mainSuggestions} onSelect={(suggestion)=>{
                commitMainInputText(suggestion);
                setIsMainFocused(false);
            }}/>
        </div>
        {isOpen && <div className={getTableDialogPopoverClassName(popoverExpansion)}>
            <div className="related-publisher-table free-role-name-table">
                <div className="related-publisher-scroll">
                    <div className="related-publisher-head free-role-name-head">
                        <span/>
                        <span>{roleHeader}</span>
                        <span>{nameHeader}</span>
                    </div>
                    <div className="related-publisher-rows">
                        {rows.map((row, rowIndex)=><div className="related-publisher-row free-role-name-row" key={`publisher-relation-${rowIndex}`}>
                            <button type="button" className="related-publisher-delete-button" aria-label="関連会社行を削除" onClick={()=>deleteRow(rowIndex)}>
                                <Trash2 size={15}/>
                            </button>
                            <SelectableTextInput value={row.role} placeholder={roleHeader} options={roleOptions} onChange={(value)=>updateRow(rowIndex, "role", value)}/>
                            <div className="related-publisher-name-cell">
                                <input value={row.name} placeholder={namePlaceholder} onFocus={()=>setFocusedRow(rowIndex)} onBlur={()=>setFocusedRow(null)} onChange={(event)=>updateRow(rowIndex, "name", event.target.value)}/>
                                {row.name && <button type="button" className="table-dialog-clear-button" aria-label={`${nameLabel}を消去`} onMouseDown={(event)=>event.preventDefault()} onClick={()=>updateRow(rowIndex, "name", "")}>
                                    <X size={14}/>
                                </button>}
                                <NameSuggestionList suggestions={focusedRow === rowIndex ? getAutocompleteMatches(row.name, options) : []} onSelect={(suggestion)=>{
                                    updateRow(rowIndex, "name", suggestion);
                                    setFocusedRow(null);
                                }}/>
                            </div>
                        </div>)}
                    </div>
                    <div className="related-publisher-footer">
                        <button type="button" className="related-publisher-add-button" onClick={addRow}>
                            <CirclePlus size={16}/>
                            追加
                        </button>
                        {closeWarning && <span className="related-publisher-warning">{closeWarning}</span>}
                    </div>
                </div>
            </div>
        </div>}
    </div>;
}
const magazineRelationRoleOptions = [
    "本誌",
    "増刊",
    "別冊",
    "付録",
    "関連",
    "前身",
    "後継",
    "派生",
    "姉妹誌"
];
const findMagazineOptionByName = (name: string, options: AutocompleteOption[])=>options.find((option)=>option.name === name.trim());
const makeRelatedMagazineEntry = (role: string, name: string, options: AutocompleteOption[]): RelatedMagazineEntry=>{
    const option = findMagazineOptionByName(name, options);
    return {
        role,
        name,
        magazine_key: option?.internalKey ?? "",
        magazine_id: option?.id ?? ""
    };
};
const parseRelatedMagazineValue = (value: string): RelatedMagazineEntry[]=>{
    if (!value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry)=>{
            if (typeof entry === "string") {
                return {
                    role: "",
                    name: entry,
                    magazine_key: "",
                    magazine_id: /^M/.test(entry) ? entry : ""
                };
            }
            return {
                role: String(entry.role ?? entry.relation ?? ""),
                name: String(entry.name ?? entry.title ?? entry.magazine_title ?? ""),
                magazine_key: String(entry.magazine_key ?? ""),
                magazine_id: String(entry.magazine_id ?? entry.id ?? "")
            };
        }).filter((entry)=>entry.role.trim() || entry.name.trim() || entry.magazine_id.trim() || entry.magazine_key?.trim());
    } catch  {
        return [];
    }
};
const serializeRelatedMagazineValue = (rows: RelatedMagazineEntry[])=>JSON.stringify(rows.filter((row)=>row.role.trim() || row.name.trim() || row.magazine_id.trim() || row.magazine_key?.trim()));
const formatRelatedMagazineDisplay = (rows: RelatedMagazineEntry[])=>rows.map((row)=>row.role && row.name ? `${row.role}:${row.name}` : row.name || row.magazine_id).filter(Boolean).join("、");
const emptyRelatedMagazineRow = (): RelatedMagazineEntry=>({
        role: "",
        name: "",
        magazine_key: "",
        magazine_id: ""
    });
function RelatedMagazineInput({ value, options, onChange }: {
    value: string;
    options: AutocompleteOption[];
    onChange: (value: string)=>void;
}) {
    const [visibleRowCount, setVisibleRowCount] = useState(1);
    const [isOpen, setIsOpen] = useState(false);
    const [isMainFocused, setIsMainFocused] = useState(false);
    const [focusedRow, setFocusedRow] = useState<number | null>(null);
    const [closeWarning, setCloseWarning] = useState("");
    const [popoverExpansion, setPopoverExpansion] = useState<TableDialogExpansion>("default");
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const parsedRows = parseRelatedMagazineValue(value);
    const effectiveRowCount = Math.max(visibleRowCount, parsedRows.length, 1);
    const rows = [
        ...parsedRows,
        ...Array.from({
            length: Math.max(0, effectiveRowCount - parsedRows.length)
        }, ()=>emptyRelatedMagazineRow())
    ];
    const displayText = formatRelatedMagazineDisplay(parsedRows);
    const completedCount = parsedRows.filter((row)=>row.role.trim() || row.name.trim() || row.magazine_id.trim()).length;
    const hasAnyVisibleInput = rows.some((row)=>row.role.trim() || row.name.trim());
    const hasMagazineName = rows.some((row)=>row.name.trim());
    const hasRoleWithoutName = rows.some((row)=>row.role.trim() && !row.name.trim());
    const closeBlockMessage = !hasAnyVisibleInput ? "" : !hasMagazineName ? "雑誌名を1件以上入力してください" : hasRoleWithoutName ? "関係だけの行は雑誌名も入力してください" : "";
    const updateRows = (nextRows: RelatedMagazineEntry[])=>onChange(serializeRelatedMagazineValue(nextRows));
    const updateRow = (rowIndex: number, field: "role" | "name", nextValue: string)=>{
        updateRows(rows.map((row, index)=>{
            if (index !== rowIndex) return row;
            if (field === "name") return makeRelatedMagazineEntry(row.role, nextValue, options);
            return {
                ...row,
                role: nextValue
            };
        }));
    };
    const addRow = ()=>{
        setVisibleRowCount((count)=>count + 1);
        updateRows([
            ...rows,
            emptyRelatedMagazineRow()
        ]);
    };
    const deleteRow = (rowIndex: number)=>{
        const targetRow = rows[rowIndex];
        if (targetRow?.role.trim() || targetRow?.name.trim() || targetRow?.magazine_id.trim() || targetRow?.magazine_key?.trim()) {
            setCloseWarning("入力済みの行は削除できません");
            return;
        }
        setVisibleRowCount(Math.max(1, rows.length - 1));
        updateRows(rows.filter((_, index)=>index !== rowIndex));
    };
    const closePopover = ()=>{
        if (closeBlockMessage) {
            setCloseWarning(closeBlockMessage);
            return false;
        }
        setCloseWarning("");
        setIsOpen(false);
        setIsMainFocused(false);
        setFocusedRow(null);
        setPopoverExpansion("default");
        return true;
    };
    const openPopover = (clientX: number)=>{
        setCloseWarning("");
        setPopoverExpansion(getTableDialogExpansion(wrapRef.current, clientX));
        setIsOpen(true);
    };
    useEffect(()=>{
        if (!closeBlockMessage) setCloseWarning("");
    }, [
        closeBlockMessage
    ]);
    useEffect(()=>{
        if (!isOpen) return;
        const handlePointerDown = (event: globalThis.MouseEvent)=>{
            if (!wrapRef.current?.contains(event.target as Node)) closePopover();
        };
        const handleKeyDown = (event: KeyboardEvent)=>{
            if (event.key === "Escape") {
                event.preventDefault();
                closePopover();
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return ()=>{
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        isOpen,
        closeBlockMessage
    ]);
    const mainSuggestions = !isOpen && isMainFocused ? getAutocompleteMatches(displayText, options) : [];
    return <div className="related-publisher-input-wrap" ref={wrapRef}>
        <div className="role-name-input related-publisher-input">
            <input value={displayText} placeholder="関連誌を入力" onFocus={()=>setIsMainFocused(true)} onBlur={()=>setIsMainFocused(false)} onChange={(event)=>updateRows([
                    makeRelatedMagazineEntry("", event.target.value, options)
                ])}/>
            <button type="button" onClick={(event)=>isOpen ? closePopover() : openPopover(event.clientX)}>{completedCount > 0 ? `${completedCount}件` : "複数"}</button>
            <NameSuggestionList suggestions={mainSuggestions} onSelect={(suggestion)=>{
                updateRows([
                    makeRelatedMagazineEntry("", suggestion, options)
                ]);
                setIsMainFocused(false);
            }}/>
        </div>
        {isOpen && <div className={getTableDialogPopoverClassName(popoverExpansion)}>
            <div className="related-publisher-table free-role-name-table">
                <div className="related-publisher-scroll">
                    <div className="related-publisher-head free-role-name-head">
                        <span/>
                        <span>関係</span>
                        <span>雑誌名</span>
                    </div>
                    <div className="related-publisher-rows">
                        {rows.map((row, rowIndex)=><div className="related-publisher-row free-role-name-row" key={`magazine-relation-${rowIndex}`}>
                            <button type="button" className="related-publisher-delete-button" aria-label="関連誌行を削除" onClick={()=>deleteRow(rowIndex)}>
                                <Trash2 size={15}/>
                            </button>
                            <SelectableTextInput value={row.role} placeholder="関係" options={magazineRelationRoleOptions} onChange={(value)=>updateRow(rowIndex, "role", value)}/>
                            <div className="related-publisher-name-cell">
                                <input value={row.name} placeholder="雑誌名を入力" onFocus={()=>setFocusedRow(rowIndex)} onBlur={()=>setFocusedRow(null)} onChange={(event)=>updateRow(rowIndex, "name", event.target.value)}/>
                                {row.name && <button type="button" className="table-dialog-clear-button" aria-label="雑誌名を消去" onMouseDown={(event)=>event.preventDefault()} onClick={()=>updateRow(rowIndex, "name", "")}>
                                    <X size={14}/>
                                </button>}
                                <NameSuggestionList suggestions={focusedRow === rowIndex ? getAutocompleteMatches(row.name, options) : []} onSelect={(suggestion)=>{
                                    updateRow(rowIndex, "name", suggestion);
                                    setFocusedRow(null);
                                }}/>
                            </div>
                        </div>)}
                    </div>
                    <div className="related-publisher-footer">
                        <button type="button" className="related-publisher-add-button" onClick={addRow}>
                            <CirclePlus size={16}/>
                            追加
                        </button>
                        {closeWarning && <span className="related-publisher-warning">{closeWarning}</span>}
                    </div>
                </div>
            </div>
        </div>}
    </div>;
}
function FreeRoleNameTableInput({ value, placeholder, roleOptions, nameSuggestions = [], countUnit = "件", onChange }: {
    value: string;
    placeholder: string;
    roleOptions: string[];
    nameSuggestions?: AutocompleteOption[];
    countUnit?: string;
    onChange: (value: string)=>void;
}) {
    const [visibleRowCount, setVisibleRowCount] = useState(1);
    const [isOpen, setIsOpen] = useState(false);
    const [isMainFocused, setIsMainFocused] = useState(false);
    const [focusedRow, setFocusedRow] = useState<number | null>(null);
    const [closeWarning, setCloseWarning] = useState("");
    const [tableRows, setTableRows] = useState<RoleNameRow[]>([]);
    const [popoverPosition, setPopoverPosition] = useState({
        left: 24,
        top: 96,
        width: 500
    });
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const parsedRows = parseRoleNameText(value).filter((row)=>row.role.trim() || row.name.trim());
    const sourceRows = isOpen ? tableRows : parsedRows;
    const effectiveRowCount = Math.max(visibleRowCount, sourceRows.length, 1);
    const rows: RoleNameRow[] = [
        ...sourceRows,
        ...Array.from({
            length: Math.max(0, effectiveRowCount - sourceRows.length)
        }, (): RoleNameRow=>({
                role: "",
                name: ""
            }))
    ];
    const displayText = formatRoleNameRows(parsedRows);
    const completedCount = parsedRows.filter((row)=>row.name.trim()).length;
    const hasRoleWithoutName = rows.some((row)=>row.role.trim() && !row.name.trim());
    const closeBlockMessage = hasRoleWithoutName ? "肩書だけの行は名前も入力してください" : "";
    const updateRows = (nextRows: RoleNameRow[])=>{
        setTableRows(nextRows);
        onChange(formatRoleNameRows(nextRows));
    };
    const updateRow = (rowIndex: number, field: "role" | "name", nextValue: string)=>{
        updateRows(rows.map((row, index)=>index === rowIndex ? {
                ...row,
                [field]: field === "name" ? stripRoleNameQuotes(nextValue) : nextValue,
                ...field === "name" ? {
                    preserveSpacing: row.preserveSpacing || isQuotedRoleNameValue(nextValue)
                } : {}
            } : row));
    };
    const addRow = ()=>{
        setVisibleRowCount((count)=>count + 1);
        updateRows([
            ...rows,
            {
                role: "",
                name: ""
            }
        ]);
    };
    const deleteRow = (rowIndex: number)=>{
        const targetRow = rows[rowIndex];
        if (targetRow?.role.trim() || targetRow?.name.trim()) {
            setCloseWarning("入力済みの行は削除できません");
            return;
        }
        setVisibleRowCount(Math.max(1, rows.length - 1));
        updateRows(rows.filter((_, index)=>index !== rowIndex));
    };
    const closePopover = ()=>{
        if (closeBlockMessage) {
            setCloseWarning(closeBlockMessage);
            return false;
        }
        setCloseWarning("");
        setIsOpen(false);
        setIsMainFocused(false);
        setFocusedRow(null);
        return true;
    };
    const openPopover = ()=>{
        const rect = wrapRef.current?.getBoundingClientRect();
        if (rect) {
            const width = Math.min(500, window.innerWidth - 24);
            const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
            const top = Math.min(rect.bottom + 6, window.innerHeight - 220);
            setPopoverPosition({
                left,
                top: Math.max(12, top),
                width
            });
        }
        setCloseWarning("");
        setTableRows(rows);
        setIsOpen(true);
    };
    useEffect(()=>{
        if (!closeBlockMessage) setCloseWarning("");
    }, [
        closeBlockMessage
    ]);
    useEffect(()=>{
        if (!isOpen) return;
        const handlePointerDown = (event: globalThis.MouseEvent)=>{
            const target = event.target as Node;
            if (!wrapRef.current?.contains(target) && !popoverRef.current?.contains(target)) closePopover();
        };
        const handleKeyDown = (event: KeyboardEvent)=>{
            if (event.key === "Escape") {
                event.preventDefault();
                closePopover();
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return ()=>{
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        isOpen,
        closeBlockMessage
    ]);
    const mainSuggestions = !isOpen && isMainFocused ? getAutocompleteMatches(displayText, nameSuggestions) : [];
    const popover = isOpen && typeof document !== "undefined" ? createPortal(<div className="related-publisher-popover free-role-name-popover" ref={popoverRef} style={{
        left: popoverPosition.left,
        top: popoverPosition.top,
        width: popoverPosition.width
    }}>
            <div className="related-publisher-table free-role-name-table">
                <div className="related-publisher-scroll">
                    <div className="related-publisher-head free-role-name-head">
                        <span/>
                        <span>肩書</span>
                        <span>名前</span>
                    </div>
                    <div className="related-publisher-rows">
                        {rows.map((row, rowIndex)=><div className="related-publisher-row free-role-name-row" key={`free-role-name-${rowIndex}`}>
                            <button type="button" className="related-publisher-delete-button" aria-label="関係者行を削除" onClick={()=>deleteRow(rowIndex)}>
                                <Trash2 size={15}/>
                            </button>
                            <SelectableTextInput value={row.role} placeholder="肩書" options={roleOptions} onChange={(nextRole)=>updateRow(rowIndex, "role", nextRole)}/>
                            <div className="related-publisher-name-cell">
                                <input value={row.name} placeholder={placeholder} onFocus={()=>setFocusedRow(rowIndex)} onBlur={()=>setFocusedRow(null)} onChange={(event)=>updateRow(rowIndex, "name", event.target.value)}/>
                                {row.name && <button type="button" className="table-dialog-clear-button" aria-label="名前を消去" onMouseDown={(event)=>event.preventDefault()} onClick={()=>updateRow(rowIndex, "name", "")}>
                                    <X size={14}/>
                                </button>}
                                <NameSuggestionList suggestions={focusedRow === rowIndex ? getAutocompleteMatches(row.name, nameSuggestions) : []} onSelect={(suggestion)=>{
                                    updateRow(rowIndex, "name", suggestion);
                                    setFocusedRow(null);
                                }}/>
                            </div>
                        </div>)}
                    </div>
                    <div className="related-publisher-footer">
                        <button type="button" className="related-publisher-add-button" onClick={addRow}>
                            <CirclePlus size={16}/>
                            追加
                        </button>
                        {closeWarning && <span className="related-publisher-warning">{closeWarning}</span>}
                    </div>
                </div>
            </div>
        </div>, document.body) : null;
    return <div className="related-publisher-input-wrap free-role-name-input-wrap" ref={wrapRef}>
        <div className="role-name-input related-publisher-input free-role-name-input">
            <input value={displayText} placeholder={placeholder} onFocus={()=>setIsMainFocused(true)} onBlur={()=>setIsMainFocused(false)} onChange={(event)=>updateRows(parseRoleNameText(event.target.value))}/>
            <button type="button" onClick={()=>isOpen ? closePopover() : openPopover()}>{completedCount > 0 ? `${completedCount}${countUnit}` : "複数"}</button>
            <NameSuggestionList suggestions={mainSuggestions} onSelect={(suggestion)=>{
                updateRows([
                    {
                        role: "",
                        name: suggestion
                    }
                ]);
                setIsMainFocused(false);
            }}/>
        </div>
        {popover}
    </div>;
}
function RoleNameInput({ value, placeholder, defaultRole, roleOptions, nameSuggestions = [], countUnit, dialogTitle = "著者複数登録", onChange }: {
    value: string;
    placeholder: string;
    defaultRole?: string;
    roleOptions: string[];
    nameSuggestions?: AutocompleteOption[];
    countUnit?: string;
    dialogTitle?: string;
    onChange: (value: string)=>void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isMainFocused, setIsMainFocused] = useState(false);
    const [focusedSuggestionRow, setFocusedSuggestionRow] = useState<number | null>(null);
    const [placement, setPlacement] = useState<"above" | "below">("above");
    const [popoverPosition, setPopoverPosition] = useState<{
        left: number;
        width: number;
        anchorX: number;
        bottom?: number;
        top?: number;
    }>({
        left: 24,
        width: defaultUiPreferences.roleNamePopoverWidth,
        anchorX: 420,
        bottom: 120
    });
    const [popoverRows, setPopoverRows] = useState<RoleNameRow[]>(ensureRoleNameRows(value));
    const inputWrapRef = useRef<HTMLDivElement | null>(null);
    const roleInputRefs = useRef<Array<HTMLInputElement | null>>([]);
    const listBaseId = useId();
    const completedRowCount = (isOpen ? popoverRows : parseRoleNameText(value)).filter((row)=>row.name.trim().length > 0).length;
    const multipleButtonLabel = countUnit && completedRowCount > 0 ? `${completedRowCount}${countUnit}` : "複数";
    const mainSuggestions = !isOpen && isMainFocused ? getAutocompleteMatches(value, nameSuggestions) : [];
    const updateRows = (nextRows)=>{
        setPopoverRows(nextRows);
        onChange(formatRoleNameRows(nextRows));
    };
    const updateRow = (rowIndex, key, nextValue)=>{
        updateRows(popoverRows.map((row, index)=>index === rowIndex ? {
                ...row,
                [key]: key === "name" ? stripRoleNameQuotes(nextValue) : nextValue,
                ...key === "name" ? {
                    preserveSpacing: row.preserveSpacing || isQuotedRoleNameValue(nextValue)
                } : {}
            } : row));
    };
    const updatePopoverPosition = useCallback(()=>{
        const rect = inputWrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        const gutter = 24;
        const width = Math.min(defaultUiPreferences.roleNamePopoverWidth, window.innerWidth - gutter * 2);
        const left = Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter));
        const nextPlacement = rect.top < defaultUiPreferences.roleNamePopoverAboveThreshold ? "below" : "above";
        const anchorX = Math.min(width - 48, Math.max(48, rect.right - left - 161));
        setPopoverPosition({
            left,
            width,
            anchorX,
            ...nextPlacement === "above" ? {
                bottom: window.innerHeight - rect.top + 14
            } : {
                top: rect.bottom + 14
            }
        });
        setPlacement(nextPlacement);
    }, []);
    useEffect(()=>{
        if (!isOpen) return undefined;
        const handlePositionChange = ()=>updatePopoverPosition();
        updatePopoverPosition();
        window.addEventListener("scroll", handlePositionChange, true);
        window.addEventListener("resize", handlePositionChange);
        return ()=>{
            window.removeEventListener("scroll", handlePositionChange, true);
            window.removeEventListener("resize", handlePositionChange);
        };
    }, [
        isOpen,
        updatePopoverPosition
    ]);
    const popoverStyle = {
        left: popoverPosition.left,
        width: popoverPosition.width,
        "--anchor-x": `${popoverPosition.anchorX}px`,
        ...placement === "above" ? {
            bottom: popoverPosition.bottom
        } : {
            top: popoverPosition.top
        }
    };
    const hasIncompleteRows = popoverRows.some((row)=>{
        const hasRole = row.role.trim().length > 0;
        const hasName = row.name.trim().length > 0;
        return (hasRole || hasName) && !(hasRole && hasName);
    });
    const togglePopover = ()=>{
        if (isOpen) {
            if (hasIncompleteRows) return;
            setIsOpen(false);
            return;
        }
        updatePopoverPosition();
        setPopoverRows(ensureRoleNameRows(value));
        setIsOpen(true);
    };
    const popover = isOpen && typeof document !== "undefined" ? /*#__PURE__*/ createPortal(/*#__PURE__*/ _jsxs("div", {
        className: `role-name-popover ${placement}`,
        style: popoverStyle,
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "role-name-popover-header",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "role-name-popover-title",
                        children: [
                            /*#__PURE__*/ _jsx(UserRoundPlus, {
                                size: 38
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                children: dialogTitle
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "role-name-popover-tools",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                "aria-label": "ヘルプ",
                                children: /*#__PURE__*/ _jsx(CircleHelp, {
                                    size: 34
                                })
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "role-popover-close",
                                "aria-label": "閉じる",
                                disabled: hasIncompleteRows,
                                onClick: ()=>setIsOpen(false),
                                children: /*#__PURE__*/ _jsx(CircleX, {
                                    size: 34
                                })
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "role-name-rows",
                children: popoverRows.map((row, rowIndex)=>/*#__PURE__*/ _jsxs("div", {
                        className: "role-name-row",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "role-name-role-cell",
                                children: [
                                    /*#__PURE__*/ _jsx("input", {
                                        ref: (element)=>{
                                            roleInputRefs.current[rowIndex] = element;
                                        },
                                        list: `${listBaseId}-${rowIndex}`,
                                        value: row.role,
                                        placeholder: "肩書",
                                        onChange: (event)=>updateRow(rowIndex, "role", event.target.value)
                                    }),
                                    /*#__PURE__*/ _jsx("datalist", {
                                        id: `${listBaseId}-${rowIndex}`,
                                        children: roleOptions.map((role)=>/*#__PURE__*/ _jsx("option", {
                                                value: role
                                            }, role))
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        "aria-label": "肩書候補",
                                        onClick: ()=>{
                                            const input = roleInputRefs.current[rowIndex];
                                            input?.focus();
                                            input?.showPicker?.();
                                        },
                                        children: /*#__PURE__*/ _jsx(ChevronDown, {
                                            size: 24
                                        })
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "role-name-name-cell",
                                children: [
                                    /*#__PURE__*/ _jsx("input", {
                                        className: "role-name-person-input",
                                        value: row.name,
                                        placeholder: placeholder,
                                        onFocus: ()=>setFocusedSuggestionRow(rowIndex),
                                        onBlur: ()=>setFocusedSuggestionRow(null),
                                        onChange: (event)=>updateRow(rowIndex, "name", event.target.value)
                                    }),
                                    /*#__PURE__*/ _jsx(NameSuggestionList, {
                                        suggestions: focusedSuggestionRow === rowIndex ? getAutocompleteMatches(row.name, nameSuggestions) : [],
                                        onSelect: (suggestion)=>{
                                            updateRow(rowIndex, "name", suggestion);
                                            setFocusedSuggestionRow(null);
                                        }
                                    })
                                ]
                            })
                        ]
                    }, `role-${rowIndex}`))
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "role-popover-footer",
                children: [
                    hasIncompleteRows && /*#__PURE__*/ _jsx("p", {
                        className: "role-popover-guidance",
                        children: "記入欄は空欄にしないでください"
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "role-popover-actions",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "round-action",
                                onClick: ()=>updateRows([
                                        ...popoverRows,
                                        {
                                            role: "",
                                            name: ""
                                        }
                                    ]),
                                children: /*#__PURE__*/ _jsx(CirclePlus, {
                                    size: 34
                                })
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "round-action",
                                onClick: ()=>updateRows(popoverRows.length > 1 ? popoverRows.slice(0, -1) : popoverRows),
                                children: /*#__PURE__*/ _jsx(CircleMinus, {
                                    size: 34
                                })
                            })
                        ]
                    })
                ]
            })
        ]
    }), document.body) : null;
    return /*#__PURE__*/ _jsxs("div", {
        className: "role-name-input-wrap",
        ref: inputWrapRef,
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "role-name-input",
                children: [
                    /*#__PURE__*/ _jsx("input", {
                        value: value,
                        placeholder: placeholder,
                        disabled: isOpen,
                        onFocus: ()=>setIsMainFocused(true),
                        onBlur: ()=>setIsMainFocused(false),
                        onChange: (event)=>{
                            onChange(event.target.value);
                            setPopoverRows(ensureRoleNameRows(event.target.value));
                        }
                    }),
                    /*#__PURE__*/ _jsx("button", {
                        type: "button",
                        onClick: togglePopover,
                        children: multipleButtonLabel
                    }),
                    /*#__PURE__*/ _jsx(NameSuggestionList, {
                        suggestions: mainSuggestions,
                        onSelect: (suggestion)=>{
                            onChange(suggestion);
                            setPopoverRows(ensureRoleNameRows(suggestion));
                            setIsMainFocused(false);
                        }
                    })
                ]
            }),
            popover
        ]
    });
}
function MagazineContentEditorRow({ row, index, isOpen, onOpenChange, onUpdate, onCommit, onMove, onCopy, onDelete, authorOptions, onAuthorOptionsChange }) {
    const handlePageBlur = (key, label)=>{
        const normalized = normalizeNumericText(row[key] ?? "");
        if (normalized !== (row[key] ?? "")) {
            onUpdate(index, key, normalized);
        }
        if (!isIntegerNumericText(normalized)) {
            showIntegerValidationAlert([
                `コンテンツ${index + 1}行目: ${label}`
            ]);
            return;
        }
        onCommit?.(index, key, normalized);
    };
    return /*#__PURE__*/ _jsxs("div", {
        className: isOpen ? "content-editor-row magazine-content-editor-row is-open" : "content-editor-row magazine-content-editor-row",
        "data-row-index": index,
        "data-undo-kind": "content",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "magazine-content-row",
                role: "row",
                onDoubleClick: (event)=>{
                    if (!shouldToggleRowDetailsOnDoubleClick(event.target)) return;
                    onOpenChange(!isOpen);
                },
                onDragOver: (event)=>{
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                },
                onDrop: (event)=>{
                    event.preventDefault();
                    const fromIndex = getDraggedRowIndex(event, "content");
                    if (fromIndex !== null) {
                        onMove(fromIndex, index);
                    }
                },
                children: [
                    /*#__PURE__*/ _jsx("button", {
                        type: "button",
                        className: "drag-handle",
                        "aria-label": `${row.position}行目を並べ替え`,
                        draggable: true,
                        onDragStart: (event)=>setRowDragPreview(event, "content", index),
                        onDragEnd: clearRowDragPreview,
                        children: /*#__PURE__*/ _jsx(GripVertical, {
                            size: 18
                        })
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "position-cell",
                        children: row.position
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "content-main-fields",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "inline-labeled-field content-type-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "inline-field-label",
                                        children: "種別"
                                    }),
                                    /*#__PURE__*/ _jsx(SelectableTextInput, {
                                        value: row.contentType,
                                        placeholder: "表紙、目次、広告など",
                                        options: contentTypeOptions,
                                        fontSize: 10,
                                        onChange: (value)=>onUpdate(index, "contentType", value),
                                        onCommit: (value)=>onCommit?.(index, "contentType", value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "inline-labeled-field content-contributor-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "inline-field-label",
                                        children: "関係者"
                                    }),
                                    /*#__PURE__*/ _jsx(MasterListSelectionInput, {
                                        value: row.contributorsJson ?? "",
                                        options: authorOptions,
                                        onOptionsChange: onAuthorOptionsChange,
                                        idKey: "author_id",
                                        placeholder: "関係者を入力",
                                        label: "関係者",
                                        defaultRole: "担当",
                                        autoCommitDefaultRole: true,
                                        roleOptions: [
                                            "担当",
                                            "写真",
                                            "文",
                                            "構成",
                                            "編集",
                                            "デザイン",
                                            "協力",
                                            "その他"
                                        ],
                                        onChange: (value)=>{
                                            onUpdate(index, "contributorsJson", value);
                                            onCommit?.(index, "contributorsJson", value);
                                        }
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "inline-labeled-field content-page-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "inline-field-label",
                                        children: "SP"
                                    }),
                                    /*#__PURE__*/ _jsx("input", {
                                        value: row.pageStart ?? "",
                                        placeholder: "1",
                                        inputMode: "numeric",
                                        pattern: "[0-9]*",
                                        onChange: (event)=>onUpdate(index, "pageStart", event.target.value),
                                        onBlur: ()=>handlePageBlur("pageStart", "SP")
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "inline-labeled-field content-page-field",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "inline-field-label",
                                        children: "EP"
                                    }),
                                    /*#__PURE__*/ _jsx("input", {
                                        value: row.pageEnd ?? "",
                                        placeholder: "4",
                                        inputMode: "numeric",
                                        pattern: "[0-9]*",
                                        onChange: (event)=>onUpdate(index, "pageEnd", event.target.value),
                                        onBlur: ()=>handlePageBlur("pageEnd", "EP")
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "row-action-inline",
                        children: [
                            /*#__PURE__*/ _jsx(DropdownMenu, {
                                align: "end",
                                className: "row-menu-wrap",
                                items: [
                                    {
                                        id: `content-copy-above-${index}`,
                                        label: "上にコピー",
                                        icon: /*#__PURE__*/ _jsx(ArrowUpToLine, {
                                            size: 14
                                        }),
                                        onSelect: ()=>onCopy(index, "above")
                                    },
                                    {
                                        id: `content-copy-below-${index}`,
                                        label: "下にコピー",
                                        icon: /*#__PURE__*/ _jsx(ArrowDownToLine, {
                                            size: 14
                                        }),
                                        onSelect: ()=>onCopy(index, "below")
                                    },
                                    {
                                        id: `content-divider-${index}`,
                                        kind: "separator"
                                    },
                                    {
                                        id: `content-delete-${index}`,
                                        label: "削除",
                                        icon: /*#__PURE__*/ _jsx(Trash2, {
                                            size: 14
                                        }),
                                        danger: true,
                                        onSelect: ()=>onDelete(index)
                                    }
                                ],
                                trigger: ({ toggle, buttonRef, ariaProps })=>/*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        ref: buttonRef,
                                        className: "row-menu-button",
                                        "aria-label": `${row.position}行目の操作`,
                                        onClick: toggle,
                                        ...ariaProps,
                                        children: /*#__PURE__*/ _jsx(Ellipsis, {
                                            size: 19
                                        })
                                    })
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                className: "detail-toggle-button",
                                "aria-label": isOpen ? "詳細を閉じる" : "詳細を開く",
                                onClick: ()=>onOpenChange(!isOpen),
                                children: isOpen ? /*#__PURE__*/ _jsx(CircleChevronUp, {
                                    size: 22
                                }) : /*#__PURE__*/ _jsx(CircleChevronDown, {
                                    size: 22
                                })
                            })
                        ]
                    })
                ]
            }),
            isOpen && /*#__PURE__*/ _jsx("div", {
                className: "magazine-content-details",
                children: /*#__PURE__*/ _jsxs("div", {
                    className: "inline-labeled-field content-detail-field",
                    children: [
                        /*#__PURE__*/ _jsx("span", {
                            className: "inline-field-label",
                            children: "詳細"
                        }),
                        /*#__PURE__*/ _jsx("textarea", {
                            value: row.detail ?? "",
                            placeholder: "内容の詳細",
                            onChange: (event)=>onUpdate(index, "detail", event.target.value),
                            onBlur: (event)=>onCommit?.(index, "detail", event.currentTarget.value)
                        })
                    ]
                })
            })
        ]
    });
}
function UsersAdminView({ currentUser, isLoggedIn, onDatabaseUnavailable }: {
    currentUser: AuthenticatedUser | null;
    isLoggedIn: boolean;
    onDatabaseUnavailable: ()=>void;
}) {
    const [rows, setRows] = useState<string[][]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    useEffect(()=>{
        if (!isLoggedIn || currentUser?.role !== "super_admin") return;
        let cancelled = false;
        setIsLoading(true);
        setErrorMessage("");
        fetch("/api/users", {
            cache: "no-store"
        }).then(async (response)=>{
            const body = await response.json() as UsersResponse;
            if (isDatabaseUnavailableApiError(response, body)) {
                onDatabaseUnavailable();
                throw new Error("db_unavailable");
            }
            if (!response.ok) {
                throw new Error(body.error || "ユーザー一覧の読み込みに失敗しました。");
            }
            if (cancelled) return;
            setRows((body.records ?? []).map((record)=>[
                    `${record.loginName} (${record.userId})`,
                    record.displayName,
                    formatAuthRoleLabel(record.role),
                    record.status,
                    `Undo ${record.undoStackLimit} / 履歴 ${record.workHistoryMaxItems}`
                ]));
        }).catch((error)=>{
            if (cancelled) return;
            setRows([]);
            setErrorMessage(error instanceof Error ? error.message : "ユーザー一覧の読み込みに失敗しました。");
        }).finally(()=>{
            if (!cancelled) setIsLoading(false);
        });
        return ()=>{
            cancelled = true;
        };
    }, [
        currentUser?.role,
        isLoggedIn,
        onDatabaseUnavailable
    ]);
    if (currentUser?.role !== "super_admin") {
        return <section className="panel">
            <div className="panel-title">
                <div>
                    <h2>ユーザー管理</h2>
                    <p>この画面は超管理人のみ表示できます。</p>
                </div>
            </div>
        </section>;
    }
    return <section className="panel">
        <div className="panel-title">
            <div>
                <h2>ユーザー管理</h2>
                <p>テストユーザー5名をDB管理しています。認証強化は後続実装に切り分けています。</p>
            </div>
        </div>
        {errorMessage && <div className="inline-feedback error">{errorMessage}</div>}
        {isLoading ? <div className="panel-empty-state">ユーザー一覧を読み込み中です。</div> : <SimpleTable headers={[
            "アカウント",
            "表示名",
            "権限",
            "状態",
            "設定"
        ]} rows={rows}/>}
    </section>;
}
function DataView({ view, masterHistorySelection, onMasterHistorySelectionConsumed, onMasterRecordSelected, onOpenMagazineIssueEdit, magazineIssueCounts, magazineIssueLoadError, onAuthorDirectoryOptionsChange, onSaveStatusChange, onDirtyStateChange, isLoggedIn, currentUser, applicationBadgeSummary, onDatabaseUnavailable, onRecordWorkHistory }: {
    view: ViewKey;
    masterHistorySelection: MasterHistorySelection | null;
    onMasterHistorySelectionConsumed: ()=>void;
    onMasterRecordSelected: (kind: MasterEditorKind, id: string, options?: { preserveRouteContext?: boolean })=>void;
    onOpenMagazineIssueEdit: (record: MagazineMasterRecord)=>void;
    magazineIssueCounts: Record<string, number>;
    magazineIssueLoadError: string;
    onAuthorDirectoryOptionsChange: (options: AutocompleteOption[])=>void;
    onSaveStatusChange: (status: SaveStatus, message: string)=>void;
    onDirtyStateChange: (nextValue: boolean)=>void;
    isLoggedIn: boolean;
    currentUser: AuthenticatedUser | null;
    applicationBadgeSummary: ApplicationBadgeSummary;
    onDatabaseUnavailable: ()=>void;
    onRecordWorkHistory: (payload: WorkHistoryUpsertBody)=>Promise<void>;
}) {
    useEffect(()=>{
        if (view !== "authors" && view !== "publishers" && view !== "magazines") {
            onDirtyStateChange(false);
        }
    }, [
        view,
        onDirtyStateChange
    ]);
    if (view === "books") {
        return /*#__PURE__*/ _jsx(BooksUnderConstructionView, {});
    }
    if (view === "view") {
        return <section className="view-mode-placeholder" aria-label="Viewモード">
            <p>Viewモード</p>
        </section>;
    }
    if (view === "approvals") {
        return /*#__PURE__*/ _jsxs("section", {
            className: "panel",
            children: [
                /*#__PURE__*/ _jsxs("div", {
                    className: "panel-title",
                    children: [
                        /*#__PURE__*/ _jsxs("div", {
                            children: [
                                /*#__PURE__*/ _jsx("h2", {
                                    children: "承認待ち"
                                }),
                                /*#__PURE__*/ _jsx("p", {
                                    children: "申請データと正式データを分けて管理します。"
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("button", {
                            className: "secondary-button",
                            children: [
                                /*#__PURE__*/ _jsx(ShieldCheck, {
                                    size: 16
                                }),
                                "パスキー確認"
                            ]
                        })
                    ]
                }),
                /*#__PURE__*/ _jsx(SimpleTable, {
                    headers: [
                        "ID",
                        "種別",
                        "対象",
                        "状態"
                    ],
                    rows: []
                })
            ]
        });
    }
    if (view === "users") {
        return <UsersAdminView currentUser={currentUser} isLoggedIn={isLoggedIn} onDatabaseUnavailable={onDatabaseUnavailable}/>;
    }
    if (view === "authors" || view === "publishers" || view === "magazines") {
        return /*#__PURE__*/ _jsx(MasterEditorView, {
            kind: view,
            historySelectedId: masterHistorySelection?.kind === view ? masterHistorySelection.id : null,
            onHistorySelectionConsumed: onMasterHistorySelectionConsumed,
            onSelectedIdChange: onMasterRecordSelected,
            onOpenMagazineIssueEdit: onOpenMagazineIssueEdit,
            magazineIssueCounts: magazineIssueCounts,
            magazineIssueLoadError: magazineIssueLoadError,
            onAuthorDirectoryOptionsChange: onAuthorDirectoryOptionsChange,
            onSaveStatusChange: onSaveStatusChange,
            onDirtyStateChange: onDirtyStateChange,
            isLoggedIn: isLoggedIn,
            currentUser: currentUser,
            applicationBadgeSummary: applicationBadgeSummary,
            onDatabaseUnavailable: onDatabaseUnavailable,
            onRecordWorkHistory: onRecordWorkHistory
        });
    }
    return null;
}
function MasterEditorView({ kind, historySelectedId, onHistorySelectionConsumed, onSelectedIdChange, onOpenMagazineIssueEdit, magazineIssueCounts, magazineIssueLoadError, onAuthorDirectoryOptionsChange, onSaveStatusChange, onDirtyStateChange, isLoggedIn, currentUser, applicationBadgeSummary, onDatabaseUnavailable, onRecordWorkHistory }: {
    kind: MasterEditorKind;
    historySelectedId: string | null;
    onHistorySelectionConsumed: ()=>void;
    onSelectedIdChange: (kind: MasterEditorKind, id: string, options?: { preserveRouteContext?: boolean })=>void;
    onOpenMagazineIssueEdit: (record: MagazineMasterRecord)=>void;
    magazineIssueCounts: Record<string, number>;
    magazineIssueLoadError: string;
    onAuthorDirectoryOptionsChange: (options: AutocompleteOption[])=>void;
    onSaveStatusChange: (status: SaveStatus, message: string)=>void;
    onDirtyStateChange: (nextValue: boolean)=>void;
    isLoggedIn: boolean;
    currentUser?: AuthenticatedUser | null;
    applicationBadgeSummary: ApplicationBadgeSummary;
    onDatabaseUnavailable: ()=>void;
    onRecordWorkHistory: (payload: WorkHistoryUpsertBody)=>Promise<void>;
}) {
    const [authorDrafts, setAuthorDrafts] = useState<AuthorMasterRecord[]>([]);
    const [publisherDrafts, setPublisherDrafts] = useState<PublisherMasterRecord[]>([]);
    const [magazineDrafts, setMagazineDrafts] = useState<MagazineMasterRecord[]>([]);
    const [masterListVisibleCount, setMasterListVisibleCount] = useState<number>(defaultUiPreferences.masterListMaxItems);
    const [authorLoadState, setAuthorLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
    const [authorLoadError, setAuthorLoadError] = useState("");
    const [publisherLoadState, setPublisherLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
    const [publisherLoadError, setPublisherLoadError] = useState("");
    const [magazineLoadState, setMagazineLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
    const [magazineLoadError, setMagazineLoadError] = useState("");
    const authorLoadRequestIdRef = useRef(0);
    const publisherLoadRequestIdRef = useRef(0);
    const magazineLoadRequestIdRef = useRef(0);
    const [selectedIds, setSelectedIds] = useState<Record<MasterEditorKind, string>>({
        authors: "",
        publishers: "",
        magazines: ""
    });
    const [searchText, setSearchText] = useState("");
    const [masterListSorts, setMasterListSorts] = useState<Record<MasterEditorKind, MasterListSortValue>>(()=>readStoredMasterListSorts());
    const [isMasterReadingCompletionEnabled, setIsMasterReadingCompletionEnabled] = useState(false);
    const [openAuthorActionId, setOpenAuthorActionId] = useState<string | null>(null);
    const [isHeaderActionMenuOpen, setIsHeaderActionMenuOpen] = useState(false);
    const [authorCreateDraft, setAuthorCreateDraft] = useState<AuthorMasterRecord | null>(null);
    const [publisherCreateDraft, setPublisherCreateDraft] = useState<PublisherMasterRecord | null>(null);
    const [magazineCreateDraft, setMagazineCreateDraft] = useState<MagazineMasterRecord | null>(null);
    const [authorEditDraft, setAuthorEditDraft] = useState<AuthorMasterRecord | null>(null);
    const [publisherEditDraft, setPublisherEditDraft] = useState<PublisherMasterRecord | null>(null);
    const [magazineEditDraft, setMagazineEditDraft] = useState<MagazineMasterRecord | null>(null);
    const [masterDuplicateDialog, setMasterDuplicateDialog] = useState<MasterDuplicateDialogState | null>(null);
    const [deleteBlockedDialog, setDeleteBlockedDialog] = useState<DeleteBlockedDialogState | null>(null);
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<DeleteConfirmDialogState | null>(null);
    const [magazineCsvDownloadDialog, setMagazineCsvDownloadDialog] = useState<MagazineCsvDownloadDialogState | null>(null);
    const [magazineCsvHelpDialog, setMagazineCsvHelpDialog] = useState<MagazineCsvHelpDialogState | null>(null);
    const [magazineCsvUploadDialog, setMagazineCsvUploadDialog] = useState<MagazineCsvUploadDialogState | null>(null);
    const [magazineCsvUploadUndoState, setMagazineCsvUploadUndoState] = useState<MagazineCsvUploadUndoState | null>(null);
    const [authorCsvDownloadDialog, setAuthorCsvDownloadDialog] = useState<AuthorCsvDownloadDialogState | null>(null);
    const [authorCsvHelpDialog, setAuthorCsvHelpDialog] = useState<AuthorCsvHelpDialogState | null>(null);
    const [authorCsvUploadDialog, setAuthorCsvUploadDialog] = useState<AuthorCsvUploadDialogState | null>(null);
    const [authorCsvUploadUndoState, setAuthorCsvUploadUndoState] = useState<AuthorCsvUploadUndoState | null>(null);
    const [publisherCsvDownloadDialog, setPublisherCsvDownloadDialog] = useState<PublisherCsvDownloadDialogState | null>(null);
    const [publisherCsvHelpDialog, setPublisherCsvHelpDialog] = useState<PublisherCsvHelpDialogState | null>(null);
    const [publisherCsvUploadDialog, setPublisherCsvUploadDialog] = useState<PublisherCsvUploadDialogState | null>(null);
    const [publisherCsvUploadUndoState, setPublisherCsvUploadUndoState] = useState<PublisherCsvUploadUndoState | null>(null);
    const createRequestPendingRef = useRef(false);
    const magazineCsvUploadInputRef = useRef<HTMLInputElement | null>(null);
    const authorCsvUploadInputRef = useRef<HTMLInputElement | null>(null);
    const publisherCsvUploadInputRef = useRef<HTMLInputElement | null>(null);
    const isAuthor = kind === "authors";
    const isPublisher = kind === "publishers";
    const isMagazine = kind === "magazines";
    const demoApplicationBadge = kind === "authors"
        ? applicationBadgeSummary.masters.authors ?? null
        : kind === "publishers"
            ? applicationBadgeSummary.masters.publishers ?? null
            : applicationBadgeSummary.masters.magazines ?? null;
    const getListApplicationBadge = (recordId: string)=>{
        const badge = kind === "authors"
            ? applicationBadgeSummary.masters.authors
            : kind === "publishers"
                ? applicationBadgeSummary.masters.publishers
                : applicationBadgeSummary.masters.magazines;
        if (!badge || badge.entityId !== recordId) return null;
        return badge;
    };
    const masterListSortOptions = getMasterListSortOptions(kind);
    const currentMasterListSort = masterListSortOptions.some((option)=>option.value === masterListSorts[kind])
        ? masterListSorts[kind]
        : "reading:asc";
    const updateMasterListSort = (value: MasterListSortValue)=>{
        setMasterListSorts((current)=>{
            const next = {
                ...current,
                [kind]: value
            };
            if (typeof window !== "undefined") {
                window.localStorage.setItem(uiPreferenceStorageKeys.masterListSort, JSON.stringify(next));
            }
            return next;
        });
    };
    useEffect(()=>{
        if (!isAuthor || authorLoadState !== "idle") return;
        const requestId = authorLoadRequestIdRef.current + 1;
        authorLoadRequestIdRef.current = requestId;
        setAuthorLoadState("loading");
        fetch("/api/authors")
            .then(async (response)=>{
                const body = await response.json() as AuthorsResponse;
                if (isDatabaseUnavailableApiError(response, body)) {
                    onDatabaseUnavailable();
                    throw new Error("db_unavailable");
                }
                if (!response.ok) {
                    throw new Error(body.error || `著者APIが ${response.status} を返しました`);
                }
                return body.records ?? [];
            })
            .then((records)=>{
                if (authorLoadRequestIdRef.current !== requestId) return;
                if (records.length > 0) {
                    setAuthorDrafts(records);
                    setSelectedIds((current)=>{
                        const currentId = current.authors;
                        const nextId = records.some((record)=>record.id === currentId) ? currentId : records[0].id;
                        return {
                            ...current,
                            authors: nextId
                        };
                    });
                }
                setAuthorLoadState("loaded");
                setAuthorLoadError("");
            })
            .catch((error)=>{
                if (authorLoadRequestIdRef.current !== requestId) return;
                setAuthorLoadState("error");
                setAuthorLoadError(error instanceof Error ? error.message : "著者DBの読み込みに失敗しました");
            });
    }, [
        isAuthor,
        authorLoadState,
        onDatabaseUnavailable
    ]);
    useEffect(()=>{
        if ((!isPublisher && !isMagazine) || publisherLoadState !== "idle") return;
        const requestId = publisherLoadRequestIdRef.current + 1;
        publisherLoadRequestIdRef.current = requestId;
        setPublisherLoadState("loading");
        fetch("/api/publishers")
            .then(async (response)=>{
                const body = await response.json() as PublishersResponse;
                if (isDatabaseUnavailableApiError(response, body)) {
                    onDatabaseUnavailable();
                    throw new Error("db_unavailable");
                }
                if (!response.ok) {
                    throw new Error(body.error || `出版社APIが ${response.status} を返しました`);
                }
                return body.records ?? [];
            })
            .then((records)=>{
                if (publisherLoadRequestIdRef.current !== requestId) return;
                if (records.length > 0) {
                    setPublisherDrafts(records);
                    setSelectedIds((current)=>{
                        const currentId = current.publishers;
                        const nextId = records.some((record)=>record.id === currentId) ? currentId : records[0].id;
                        return {
                            ...current,
                            publishers: nextId
                        };
                    });
                }
                setPublisherLoadState("loaded");
                setPublisherLoadError("");
            })
            .catch((error)=>{
                if (publisherLoadRequestIdRef.current !== requestId) return;
                setPublisherLoadState("error");
                setPublisherLoadError(error instanceof Error ? error.message : "出版社DBの読み込みに失敗しました");
            });
    }, [
        isPublisher,
        isMagazine,
        publisherLoadState,
        onDatabaseUnavailable
    ]);
    useEffect(()=>{
        if (!isMagazine || magazineLoadState !== "idle") return;
        const requestId = magazineLoadRequestIdRef.current + 1;
        magazineLoadRequestIdRef.current = requestId;
        setMagazineLoadState("loading");
        fetch("/api/magazine-titles")
            .then(async (response)=>{
                const body = await response.json() as MagazineTitlesResponse;
                if (isDatabaseUnavailableApiError(response, body)) {
                    onDatabaseUnavailable();
                    throw new Error("db_unavailable");
                }
                if (!response.ok) {
                    throw new Error(body.error || `雑誌マスターAPIが ${response.status} を返しました`);
                }
                return body.records ?? [];
            })
            .then((records)=>{
                if (magazineLoadRequestIdRef.current !== requestId) return;
                if (records.length > 0) {
                    setMagazineDrafts(records);
                    setSelectedIds((current)=>{
                        const currentId = current.magazines;
                        const nextId = records.some((record)=>record.id === currentId) ? currentId : records[0].id;
                        return {
                            ...current,
                            magazines: nextId
                        };
                    });
                }
                setMagazineLoadState("loaded");
                setMagazineLoadError("");
            })
            .catch((error)=>{
                if (magazineLoadRequestIdRef.current !== requestId) return;
                setMagazineLoadState("error");
                setMagazineLoadError(error instanceof Error ? error.message : "雑誌マスターDBの読み込みに失敗しました");
            });
    }, [
        isMagazine,
        magazineLoadState,
        onDatabaseUnavailable
    ]);
    const reloadMagazineCsvUploadUndoState = useCallback(()=>{
        if (!isMagazine) {
            setMagazineCsvUploadUndoState(null);
            return;
        }
        fetch("/api/magazine-titles/upload/undo", {
            cache: "no-store"
        }).then(async (response)=>{
            const body = await response.json() as MagazineCsvUploadUndoResponse;
            if (isDatabaseUnavailableApiError(response, body)) {
                onDatabaseUnavailable();
                throw new Error("db_unavailable");
            }
            if (!response.ok) {
                throw new Error(body.error || "アップロードUndoの状態取得に失敗しました");
            }
            if (!body.available || !body.actionId) {
                setMagazineCsvUploadUndoState(null);
                return;
            }
            setMagazineCsvUploadUndoState({
                actionId: body.actionId,
                label: body.label ?? "Undo Upload",
                fileName: body.fileName ?? "",
                importedCount: body.importedCount ?? 0,
                createCount: body.createCount ?? 0,
                updateCount: body.updateCount ?? 0
            });
        }).catch(()=>{
            setMagazineCsvUploadUndoState(null);
        });
    }, [
        isMagazine,
        onDatabaseUnavailable
    ]);
    useEffect(()=>{
        reloadMagazineCsvUploadUndoState();
    }, [
        reloadMagazineCsvUploadUndoState
    ]);
    const reloadAuthorCsvUploadUndoState = useCallback(()=>{
        if (!isAuthor) {
            setAuthorCsvUploadUndoState(null);
            return;
        }
        fetch("/api/authors/upload/undo", {
            cache: "no-store"
        }).then(async (response)=>{
            const body = await response.json() as AuthorCsvUploadUndoResponse;
            if (isDatabaseUnavailableApiError(response, body)) {
                onDatabaseUnavailable();
                throw new Error("db_unavailable");
            }
            if (!response.ok) {
                throw new Error(body.error || "アップロードUndoの状態取得に失敗しました");
            }
            if (!body.available || !body.actionId) {
                setAuthorCsvUploadUndoState(null);
                return;
            }
            setAuthorCsvUploadUndoState({
                actionId: body.actionId,
                label: body.label ?? "Undo Upload",
                fileName: body.fileName ?? "",
                importedCount: body.importedCount ?? 0,
                createCount: body.createCount ?? 0,
                updateCount: body.updateCount ?? 0
            });
        }).catch(()=>{
            setAuthorCsvUploadUndoState(null);
        });
    }, [
        isAuthor,
        onDatabaseUnavailable
    ]);
    useEffect(()=>{
        reloadAuthorCsvUploadUndoState();
    }, [
        reloadAuthorCsvUploadUndoState
    ]);
    const reloadPublisherCsvUploadUndoState = useCallback(()=>{
        if (!isPublisher) {
            setPublisherCsvUploadUndoState(null);
            return;
        }
        fetch("/api/publishers/upload/undo", {
            cache: "no-store"
        }).then(async (response)=>{
            const body = await response.json() as PublisherCsvUploadUndoResponse;
            if (isDatabaseUnavailableApiError(response, body)) {
                onDatabaseUnavailable();
                throw new Error("db_unavailable");
            }
            if (!response.ok) {
                throw new Error(body.error || "アップロードUndoの状態取得に失敗しました");
            }
            if (!body.available || !body.actionId) {
                setPublisherCsvUploadUndoState(null);
                return;
            }
            setPublisherCsvUploadUndoState({
                actionId: body.actionId,
                label: body.label ?? "Undo Upload",
                fileName: body.fileName ?? "",
                importedCount: body.importedCount ?? 0,
                createCount: body.createCount ?? 0,
                updateCount: body.updateCount ?? 0
            });
        }).catch(()=>{
            setPublisherCsvUploadUndoState(null);
        });
    }, [
        isPublisher,
        onDatabaseUnavailable
    ]);
    useEffect(()=>{
        reloadPublisherCsvUploadUndoState();
    }, [
        reloadPublisherCsvUploadUndoState
    ]);
    const reloadMagazineUploadSources = useCallback((preferredMagazineId?: string)=>{
        if (preferredMagazineId) {
            setSelectedIds((current)=>({
                    ...current,
                    magazines: preferredMagazineId
                }));
            onSelectedIdChange("magazines", preferredMagazineId);
        }
        setPublisherLoadState("idle");
        setMagazineLoadState("idle");
        reloadMagazineCsvUploadUndoState();
    }, [
        onSelectedIdChange,
        reloadMagazineCsvUploadUndoState
    ]);
    const records: Array<AuthorMasterRecord | PublisherMasterRecord | MagazineMasterRecord> = isAuthor ? authorDrafts : isPublisher ? publisherDrafts : magazineDrafts;
const authorDirectoryOptions = useMemo(()=>buildAuthorAutocompleteOptions(authorDrafts), [
        authorDrafts
    ]);
const publisherDirectoryOptions = useMemo(()=>publisherDrafts.map((publisher)=>({
                id: publisher.id,
                internalKey: publisher.internalId,
                name: publisher.name,
                reading: publisher.reading,
                aliases: [
                    publisher.id
                ]
            })).sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")), [
        publisherDrafts
    ]);
const magazineDirectoryOptions = useMemo(()=>magazineDrafts.map((magazine)=>({
                id: magazine.id,
                internalKey: magazine.internalId,
                name: magazine.name,
                reading: magazine.reading,
                aliases: [
                    magazine.id
                ]
            })).sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")), [
        magazineDrafts
    ]);
    const title = isAuthor ? "著者" : isPublisher ? "出版社" : "雑誌マスター";
    const description = isAuthor ? "著者・作者・ペンネームのマスターを編集します。" : isPublisher ? "出版社、URL、関連URL、関連会社のマスターを編集します。" : "雑誌タイトル、出版社、刊行情報、関連誌のマスターを編集します。";
    const throwIfMasterDbUnavailable = (response: { status: number }, body?: { error?: string; code?: string } | null, fallbackMessage = "データベースに接続できません。")=>{
        if (!isDatabaseUnavailableApiError(response, body)) return;
        onDatabaseUnavailable();
        throw new Error(body?.error || fallbackMessage);
    };
    const currentCreateDraft = isAuthor ? authorCreateDraft : isPublisher ? publisherCreateDraft : isMagazine ? magazineCreateDraft : null;
    const currentEditDraft = isAuthor ? authorEditDraft : isPublisher ? publisherEditDraft : isMagazine ? magazineEditDraft : null;
    const isCreateMode = Boolean(currentCreateDraft);
    useEffect(()=>{
        onDirtyStateChange(Boolean(currentCreateDraft || currentEditDraft));
    }, [
        currentCreateDraft,
        currentEditDraft,
        onDirtyStateChange
    ]);
    const deferredSearchText = useDeferredValue(searchText);
    const normalizedQuery = useMemo(()=>normalizeAutocompleteText(deferredSearchText), [
        deferredSearchText
    ]);
    const searchableRecords = useMemo(()=>records.map((record)=>({
                record,
                normalizedSearchIndex: normalizeAutocompleteText([
                    record.id,
                    record.name,
                    record.reading,
                    record.searchText
                ].filter(Boolean).join(" "))
            })), [
        records
    ]);
    const matchedRecords = useMemo(()=>searchableRecords.filter(({ normalizedSearchIndex })=>!normalizedQuery || normalizedSearchIndex.includes(normalizedQuery)).map(({ record })=>record), [
        searchableRecords,
        normalizedQuery
    ]);
    const sortedMatchedRecords = useMemo(()=>{
        const [sortKey, direction] = currentMasterListSort.split(":") as [MasterListSortKey, SortDirection];
        const multiplier = direction === "asc" ? 1 : -1;
        return [
            ...matchedRecords
        ].sort((left, right)=>{
            let result = 0;
            if (sortKey === "publisher" && isMagazine) {
                const leftMagazine = left as MagazineMasterRecord;
                const rightMagazine = right as MagazineMasterRecord;
                result = compareText(parseMagazinePublisherSortText(leftMagazine.publishers), parseMagazinePublisherSortText(rightMagazine.publishers));
            } else if (sortKey === "updated") {
                result = compareText(left.updatedAt ?? "", right.updatedAt ?? "");
            } else if (sortKey === "issueCount" && isMagazine) {
                const leftMagazine = left as MagazineMasterRecord;
                const rightMagazine = right as MagazineMasterRecord;
                result = (magazineIssueCounts[leftMagazine.id] ?? 0) - (magazineIssueCounts[rightMagazine.id] ?? 0);
            } else {
                result = compareText(left.reading || left.name, right.reading || right.name);
            }
            if (result !== 0) return result * multiplier;
            return compareText(left.reading || left.name, right.reading || right.name) || compareText(left.name, right.name) || compareText(left.id, right.id);
        });
    }, [
        isMagazine,
        matchedRecords,
        magazineIssueCounts,
        currentMasterListSort
    ]);
    const filteredRecords = useMemo(()=>sortedMatchedRecords.slice(0, masterListVisibleCount), [
        sortedMatchedRecords,
        masterListVisibleCount
    ]);
    const recordsById = useMemo(()=>new Map(records.map((record)=>[
                record.id,
                record
            ])), [
        records
    ]);
    const listCountLabel = useMemo(()=>matchedRecords.length > filteredRecords.length ? `${matchedRecords.length}件中 ${filteredRecords.length}件表示` : `${matchedRecords.length}件`, [
        matchedRecords.length,
        filteredRecords.length
    ]);
    const currentLoadState = isAuthor ? authorLoadState : isPublisher ? publisherLoadState : magazineLoadState;
    const currentLoadError = isAuthor ? authorLoadError : isPublisher ? publisherLoadError : magazineLoadError;
    const isDbReady = currentLoadState === "loaded";
    useEffect(()=>{
        if (!isAuthor || authorLoadState !== "loaded") return;
        onAuthorDirectoryOptionsChange(authorDirectoryOptions);
    }, [
        isAuthor,
        authorLoadState,
        authorDirectoryOptions,
        onAuthorDirectoryOptionsChange
    ]);
    useEffect(()=>{
        setMasterListVisibleCount(defaultUiPreferences.masterListMaxItems);
    }, [
        kind,
        normalizedQuery,
        currentMasterListSort
    ]);
    const listStatusLabel = currentLoadState === "loading" ? "DB読込中" : currentLoadState === "error" ? "DB未接続" : listCountLabel;
    const emptyListMessage = currentLoadState === "loading" ? "DBから一覧を読み込んでいます。" : currentLoadState === "error" ? "DBに接続できないため一覧を表示できません。" : "データがありません。";
    const selectedPersistedRecord = useMemo(()=>recordsById.get(selectedIds[kind]) ?? filteredRecords[0] ?? records[0], [
        recordsById,
        records,
        selectedIds,
        kind,
        filteredRecords
    ]);
    const selectedRecord = currentCreateDraft ?? currentEditDraft ?? selectedPersistedRecord;
    const selectedApplicationBadge = selectedRecord ? getListApplicationBadge(selectedRecord.id) : null;
    const isSelectedRecordReadOnly = !isCreateMode && Boolean(selectedApplicationBadge && (selectedApplicationBadge.status === "submitted" || selectedApplicationBadge.status === "on_hold"));
    const recordSavedMasterHistory = useCallback((record: AuthorMasterRecord | PublisherMasterRecord | MagazineMasterRecord, action: "create" | "save")=>{
        if (!isLoggedIn || !record.id) return;
        const targetType: WorkHistoryTargetType = isAuthor ? "author" : isPublisher ? "publisher" : "magazine_title";
        const context = isAuthor ? "author_editor" : isPublisher ? "publisher_editor" : "magazine_title_editor";
        void onRecordWorkHistory({
            context,
            targetType,
            targetId: record.id,
            targetLabel: record.name,
            lastAction: `${action}_${targetType}`,
            metadata: {
                reading: record.reading ?? ""
            }
        }).catch(()=>{});
    }, [
        isLoggedIn,
        isAuthor,
        isPublisher,
        onRecordWorkHistory
    ]);
    const clearCurrentCreateMode = ()=>{
        if (isAuthor) {
            setAuthorCreateDraft(null);
            setAuthorEditDraft(null);
            return;
        }
        if (isPublisher) {
            setPublisherCreateDraft(null);
            setPublisherEditDraft(null);
            return;
        }
        if (isMagazine) {
            setMagazineCreateDraft(null);
            setMagazineEditDraft(null);
        }
    };
    const updateSelectedId = (id: string)=>{
        clearCurrentCreateMode();
        setMasterDuplicateDialog(null);
        setDeleteBlockedDialog(null);
        setDeleteConfirmDialog(null);
        setAuthorEditDraft(null);
        setPublisherEditDraft(null);
        setMagazineEditDraft(null);
        setIsHeaderActionMenuOpen(false);
        setSelectedIds((current)=>({
                ...current,
                [kind]: id
            }));
        onSelectedIdChange(kind, id);
    };
    const scrollMasterListRecordIntoView = (id: string)=>{
        window.requestAnimationFrame(()=>{
            document.querySelector<HTMLElement>(`[data-master-record-id="${id}"]`)?.scrollIntoView({
                block: "nearest"
            });
        });
    };
    const moveMasterListSelection = (direction: -1 | 1)=>{
        if (filteredRecords.length === 0) return;
        const currentIndex = filteredRecords.findIndex((record)=>record.id === selectedRecord?.id);
        const nextIndex = currentIndex < 0 ? direction > 0 ? 0 : filteredRecords.length - 1 : Math.min(filteredRecords.length - 1, Math.max(0, currentIndex + direction));
        const nextRecord = filteredRecords[nextIndex];
        if (!nextRecord) return;
        updateSelectedId(nextRecord.id);
        setOpenAuthorActionId(null);
        scrollMasterListRecordIntoView(nextRecord.id);
    };
    const handleMasterListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>)=>{
        if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            event.preventDefault();
            moveMasterListSelection(-1);
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            event.preventDefault();
            moveMasterListSelection(1);
        }
    };
    const handleMasterListScroll = (event: ReactUIEvent<HTMLDivElement>)=>{
        const element = event.currentTarget;
        if (masterListVisibleCount >= sortedMatchedRecords.length) return;
        if (element.scrollTop + element.clientHeight < element.scrollHeight - 24) return;
        setMasterListVisibleCount((current)=>Math.min(sortedMatchedRecords.length, current + defaultUiPreferences.masterListLoadMoreItems));
    };
    useEffect(()=>{
        if (!historySelectedId || !recordsById.has(historySelectedId)) return;
        clearCurrentCreateMode();
        setMasterDuplicateDialog(null);
        setDeleteBlockedDialog(null);
        setDeleteConfirmDialog(null);
        setAuthorEditDraft(null);
        setPublisherEditDraft(null);
        setMagazineEditDraft(null);
        setSelectedIds((current)=>({
                ...current,
                [kind]: historySelectedId
        }));
        setSearchText("");
        setOpenAuthorActionId(null);
        setDeleteBlockedDialog(null);
        setDeleteConfirmDialog(null);
        setIsHeaderActionMenuOpen(false);
        onSelectedIdChange(kind, historySelectedId, {
            preserveRouteContext: true
        });
        onHistorySelectionConsumed();
    }, [
        historySelectedId,
        kind,
        recordsById
    ]);
    const updateAuthorRecord = (field: keyof AuthorMasterRecord, value: string | string[])=>{
        if (!isAuthor) return;
        if (authorCreateDraft) {
            setAuthorCreateDraft((current)=>current ? {
                    ...current,
                    [field]: value
                } : current);
            return;
        }
        if (isSelectedRecordReadOnly) return;
        if (!selectedPersistedRecord) return;
        const baseRecord = selectedPersistedRecord as AuthorMasterRecord;
        setAuthorEditDraft((current)=>({
                ...(current ?? baseRecord),
                [field]: value
            }));
    };
    const createAuthorRecord = async (name: string, reading: string)=>{
        if (!isAuthor) return null;
        const nextName = name.trim();
        const nextReading = reading.trim();
        if (!nextName || !nextReading || createRequestPendingRef.current) return null;
        if (!isHiraganaReading(nextReading)) return null;
        const localDuplicate = authorDrafts.find((record)=>record.name.trim() === nextName);
        if (localDuplicate) return localDuplicate;
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `新規保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "新規保存中";
        createRequestPendingRef.current = true;
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/authors", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name: nextName,
                    reading: nextReading,
                    debugDelayMs
                })
            });
            const body = await response.json() as AuthorPatchResponse;
            throwIfMasterDbUnavailable(response, body, "著者マスターの新規保存に失敗しました");
            if (response.status === 409 && body.duplicates?.length) {
                return body.duplicates[0] ?? null;
            }
            if (!response.ok || !body.record) {
                throw new Error(body.error || "著者マスターの新規保存に失敗しました");
            }
            setAuthorDrafts((current)=>[
                    body.record as AuthorMasterRecord,
                    ...current.filter((record)=>record.id !== body.record?.id)
                ].sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")));
            recordSavedMasterHistory(body.record, "create");
            onSaveStatusChange("saved", "新規保存済み");
            return body.record;
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "新規保存に失敗しました");
            return null;
        } finally {
            createRequestPendingRef.current = false;
        }
    };
    const addAliasFromAuthorRecord = (aliasRecord: AuthorMasterRecord)=>{
        if (!isAuthor || !selectedRecord || aliasRecord.id === selectedRecord.id) {
            setOpenAuthorActionId(null);
            return;
        }
        setAuthorDrafts((current)=>current.map((record)=>{
            if (record.id !== selectedRecord.id) return record;
            const aliases = parseAuthorAliasValue(record.otherAuthorIds);
            const isAlreadyAdded = aliases.some((alias)=>alias.author_id === aliasRecord.id || alias.name === aliasRecord.name);
            if (isAlreadyAdded) return record;
            return {
                ...record,
                otherAuthorIds: serializeAuthorAliasValue([
                    ...aliases,
                    {
                        name: aliasRecord.name,
                        author_id: aliasRecord.id
                    }
                ])
            };
        }));
        setOpenAuthorActionId(null);
    };
    const updatePublisherRecord = (field: keyof PublisherMasterRecord, value: string | string[])=>{
        if (!isPublisher) return;
        if (publisherCreateDraft) {
            setPublisherCreateDraft((current)=>current ? {
                    ...current,
                    [field]: value
                } : current);
            return;
        }
        if (isSelectedRecordReadOnly) return;
        if (!selectedPersistedRecord) return;
        const baseRecord = selectedPersistedRecord as PublisherMasterRecord;
        setPublisherEditDraft((current)=>({
                ...(current ?? baseRecord),
                [field]: value
            }));
    };
    const mergeSavedAuthorRecord = useCallback((savedRecord: AuthorMasterRecord)=>{
        setAuthorDrafts((current)=>current.map((record)=>record.id === savedRecord.id ? {
                    ...record,
                    ...savedRecord
                } : record));
        setAuthorEditDraft((current)=>current?.id === savedRecord.id ? {
                ...savedRecord
            } : current);
    }, []);
    const mergeSavedPublisherRecord = useCallback((savedRecord: PublisherMasterRecord)=>{
        setPublisherDrafts((current)=>current.map((record)=>record.id === savedRecord.id ? {
                    ...record,
                    ...savedRecord
                } : record));
        setPublisherEditDraft((current)=>current?.id === savedRecord.id ? {
                ...savedRecord
            } : current);
    }, []);
    const addCreatedAuthorRecord = useCallback((createdRecord: AuthorMasterRecord)=>{
        setAuthorDrafts((current)=>[
                createdRecord,
                ...current.filter((record)=>record.id !== createdRecord.id)
            ].sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")));
        setSelectedIds((current)=>({
                ...current,
                authors: createdRecord.id
            }));
        setSearchText("");
        onSelectedIdChange("authors", createdRecord.id);
    }, [
        onSelectedIdChange
    ]);
    const addCreatedPublisherRecord = useCallback((createdRecord: PublisherMasterRecord)=>{
        setPublisherDrafts((current)=>[
                createdRecord,
                ...current.filter((record)=>record.id !== createdRecord.id)
            ].sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")));
        setSelectedIds((current)=>({
                ...current,
                publishers: createdRecord.id
            }));
        setSearchText("");
        onSelectedIdChange("publishers", createdRecord.id);
    }, [
        onSelectedIdChange
    ]);
    const beginAuthorCreateMode = useCallback(()=>{
        if (!isAuthor) return;
        setMasterDuplicateDialog(null);
        setDeleteBlockedDialog(null);
        setDeleteConfirmDialog(null);
        setSearchText("");
        setOpenAuthorActionId(null);
        setIsHeaderActionMenuOpen(false);
        setAuthorEditDraft(null);
        setAuthorCreateDraft({
            id: "",
            internalId: "",
            name: "",
            reading: "",
            otherAuthorIds: "[]",
            socialLinks: "[]",
            memo: "",
            tag: [],
            searchText: ""
        });
    }, [
        isAuthor
    ]);
    const beginPublisherCreateMode = useCallback(()=>{
        if (!isPublisher) return;
        setMasterDuplicateDialog(null);
        setDeleteBlockedDialog(null);
        setDeleteConfirmDialog(null);
        setSearchText("");
        setOpenAuthorActionId(null);
        setIsHeaderActionMenuOpen(false);
        setPublisherEditDraft(null);
        setPublisherCreateDraft({
            id: "",
            internalId: "",
            name: "",
            reading: "",
            address: "",
            url: "",
            relatedLink: "[]",
            startDate: "",
            endDate: "",
            memo: "",
            relatedPublishers: "[]",
            tag: [],
            searchText: ""
        });
    }, [
        isPublisher
    ]);
    const beginMagazineCreateMode = useCallback(()=>{
        if (!isMagazine) return;
        setMasterDuplicateDialog(null);
        setDeleteBlockedDialog(null);
        setDeleteConfirmDialog(null);
        setSearchText("");
        setOpenAuthorActionId(null);
        setIsHeaderActionMenuOpen(false);
        setMagazineEditDraft(null);
        setMagazineCreateDraft({
            id: "",
            internalId: "",
            name: "",
            reading: "",
            aliasName: "",
            aliasReading: "",
            publishers: "[]",
            publicationFrequency: [],
            firstPublishedDate: "",
            closedDate: "",
            issn: "",
            jpno: "",
            relatedMagazines: "[]",
            relationNote: "",
            memo: "",
            tag: [],
            searchText: ""
        });
    }, [
        isMagazine
    ]);
    const showDuplicateDialog = useCallback((duplicateKind: "authors" | "publishers" | "magazines", name: string, reading: string, duplicates: Array<AuthorMasterRecord | PublisherMasterRecord | MagazineMasterRecord>)=>{
        setMasterDuplicateDialog({
            kind: duplicateKind,
            name,
            reading,
            records: duplicates
        });
        onSaveStatusChange("error", `同じ${duplicateKind === "authors" ? "著者" : duplicateKind === "publishers" ? "出版社" : "雑誌"}名のマスターがあります`);
    }, [
        onSaveStatusChange
    ]);
    const createAuthorMasterRecord = useCallback(async (draftOverride?: AuthorMasterRecord | null)=>{
        const draft = draftOverride ?? authorCreateDraft;
        if (!isAuthor || !draft) return;
        const name = draft.name.trim();
        const reading = draft.reading.trim();
        if (!name || !reading || createRequestPendingRef.current) return;
        if (!isHiraganaReading(reading)) {
            showReadingValidationAlert([
                "読み"
            ]);
            return;
        }
        const localDuplicates = authorDrafts.filter((record)=>record.name.trim() === name);
        if (localDuplicates.length > 0) {
            showDuplicateDialog("authors", name, reading, localDuplicates);
            return;
        }
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `新規保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "新規保存中";
        createRequestPendingRef.current = true;
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/authors", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name,
                    reading,
                    debugDelayMs
                })
            });
            const body = await response.json() as AuthorPatchResponse;
            throwIfMasterDbUnavailable(response, body, "著者マスターの新規保存に失敗しました");
            if (response.status === 409 && body.duplicates?.length) {
                showDuplicateDialog("authors", name, reading, body.duplicates);
                return;
            }
            if (!response.ok) throw new Error(body.error || "著者マスターの新規保存に失敗しました");
            if (body.record) {
                addCreatedAuthorRecord(body.record);
                setAuthorCreateDraft(null);
                recordSavedMasterHistory(body.record, "create");
            }
            onSaveStatusChange("saved", "新規保存済み");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "新規保存に失敗しました");
        } finally {
            createRequestPendingRef.current = false;
        }
    }, [
        isAuthor,
        authorCreateDraft,
        authorDrafts,
        addCreatedAuthorRecord,
        onSaveStatusChange,
        showDuplicateDialog
    ]);
    const createPublisherMasterRecord = useCallback(async (draftOverride?: PublisherMasterRecord | null)=>{
        const draft = draftOverride ?? publisherCreateDraft;
        if (!isPublisher || !draft) return;
        const name = draft.name.trim();
        const reading = draft.reading.trim();
        if (!name || !reading || createRequestPendingRef.current) return;
        if (!isHiraganaReading(reading)) {
            showReadingValidationAlert([
                "読み"
            ]);
            return;
        }
        const localDuplicates = publisherDrafts.filter((record)=>record.name.trim() === name);
        if (localDuplicates.length > 0) {
            showDuplicateDialog("publishers", name, reading, localDuplicates);
            return;
        }
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `新規保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "新規保存中";
        createRequestPendingRef.current = true;
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/publishers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name,
                    reading,
                    debugDelayMs
                })
            });
            const body = await response.json() as PublisherPatchResponse;
            throwIfMasterDbUnavailable(response, body, "出版社マスターの新規保存に失敗しました");
            if (response.status === 409 && body.duplicates?.length) {
                showDuplicateDialog("publishers", name, reading, body.duplicates);
                return;
            }
            if (!response.ok) throw new Error(body.error || "出版社マスターの新規保存に失敗しました");
            if (body.record) {
                addCreatedPublisherRecord(body.record);
                setPublisherCreateDraft(null);
                recordSavedMasterHistory(body.record, "create");
            }
            onSaveStatusChange("saved", "新規保存済み");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "新規保存に失敗しました");
        } finally {
            createRequestPendingRef.current = false;
        }
    }, [
        isPublisher,
        publisherCreateDraft,
        publisherDrafts,
        addCreatedPublisherRecord,
        onSaveStatusChange,
        showDuplicateDialog
    ]);
    const createMasterRecord = useCallback(()=>{
        if (isAuthor) {
            beginAuthorCreateMode();
            return;
        }
        if (isPublisher) {
            beginPublisherCreateMode();
            return;
        }
        beginMagazineCreateMode();
    }, [
        isAuthor,
        isPublisher,
        isMagazine,
        beginAuthorCreateMode,
        beginPublisherCreateMode,
        beginMagazineCreateMode
    ]);
    const commitAuthorRecord = useCallback(async (field: keyof AuthorMasterRecord, value: string | string[])=>{
        if (isSelectedRecordReadOnly) return;
        if (!isAuthor || !selectedPersistedRecord) return;
        if (areUndoValuesEqual(selectedPersistedRecord[field], value)) return;
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "保存中";
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/authors", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    authorKey: selectedPersistedRecord.internalId,
                    authorId: selectedPersistedRecord.id,
                    field,
                    value,
                    debugDelayMs
                })
            });
            const body = await response.json() as AuthorPatchResponse;
            throwIfMasterDbUnavailable(response, body, "著者マスターの保存に失敗しました");
            if (!response.ok) throw new Error(body.error || "著者マスターの保存に失敗しました");
            if (body.record) {
                mergeSavedAuthorRecord(body.record);
                recordSavedMasterHistory(body.record, "save");
            }
            onSaveStatusChange("saved", "保存済み");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "保存に失敗しました");
        }
    }, [
        isAuthor,
        isSelectedRecordReadOnly,
        selectedPersistedRecord,
        mergeSavedAuthorRecord,
        onSaveStatusChange
    ]);
    const commitPublisherRecord = useCallback(async (field: keyof PublisherMasterRecord, value: string | string[])=>{
        if (isSelectedRecordReadOnly) return;
        if (!isPublisher || !selectedPersistedRecord) return;
        if (areUndoValuesEqual(selectedPersistedRecord[field], value)) return;
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "保存中";
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/publishers", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    publisherKey: selectedPersistedRecord.internalId,
                    publisherId: selectedPersistedRecord.id,
                    field,
                    value,
                    debugDelayMs
                })
            });
            const body = await response.json() as PublisherPatchResponse;
            throwIfMasterDbUnavailable(response, body, "出版社マスターの保存に失敗しました");
            if (!response.ok) throw new Error(body.error || "出版社マスターの保存に失敗しました");
            if (body.record) {
                mergeSavedPublisherRecord(body.record);
                recordSavedMasterHistory(body.record, "save");
            }
            onSaveStatusChange("saved", "保存済み");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "保存に失敗しました");
        }
    }, [
        isPublisher,
        isSelectedRecordReadOnly,
        selectedPersistedRecord,
        mergeSavedPublisherRecord,
        onSaveStatusChange
    ]);
    const updateMagazineRecord = (field: keyof MagazineMasterRecord, value: string | string[])=>{
        if (!isMagazine) return;
        if (magazineCreateDraft) {
            setMagazineCreateDraft((current)=>current ? {
                    ...current,
                    [field]: value
                } : current);
            return;
        }
        if (isSelectedRecordReadOnly) return;
        if (!selectedPersistedRecord) return;
        const baseRecord = selectedPersistedRecord as MagazineMasterRecord;
        setMagazineEditDraft((current)=>({
                ...(current ?? baseRecord),
                [field]: value
            }));
    };
    const mergeSavedMagazineRecord = useCallback((savedRecord: MagazineMasterRecord)=>{
        setMagazineDrafts((current)=>current.map((record)=>record.id === savedRecord.id ? {
                    ...record,
                    ...savedRecord
                } : record));
        setMagazineEditDraft((current)=>current?.id === savedRecord.id ? {
                ...savedRecord
            } : current);
    }, []);
    const addCreatedMagazineRecord = useCallback((createdRecord: MagazineMasterRecord)=>{
        setMagazineDrafts((current)=>[
                createdRecord,
                ...current.filter((record)=>record.id !== createdRecord.id)
            ].sort((a, b)=>(a.reading ?? a.name).localeCompare(b.reading ?? b.name, "ja")));
        setSelectedIds((current)=>({
                ...current,
                magazines: createdRecord.id
            }));
        setSearchText("");
        onSelectedIdChange("magazines", createdRecord.id);
    }, [
        onSelectedIdChange
    ]);
    const createMagazineMasterRecord = useCallback(async (draftOverride?: MagazineMasterRecord | null)=>{
        const draft = draftOverride ?? magazineCreateDraft;
        if (!isMagazine || !draft) return;
        const name = draft.name.trim();
        const reading = draft.reading.trim();
        const publishers = draft.publishers.trim();
        if (!name || !reading || !publishers || publishers === "[]" || createRequestPendingRef.current) return;
        if (!isHiraganaReading(reading)) {
            showReadingValidationAlert([
                "読み"
            ]);
            return;
        }
        const localDuplicates = magazineDrafts.filter((record)=>record.name.trim() === name);
        if (localDuplicates.length > 0) {
            showDuplicateDialog("magazines", name, reading, localDuplicates);
            return;
        }
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `新規保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "新規保存中";
        createRequestPendingRef.current = true;
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/magazine-titles", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name,
                    reading,
                    publishers: draft.publishers,
                    debugDelayMs
                })
            });
            const body = await response.json() as MagazineTitlePatchResponse;
            throwIfMasterDbUnavailable(response, body, "雑誌マスターの新規保存に失敗しました");
            if (response.status === 409 && body.duplicates?.length) {
                showDuplicateDialog("magazines", name, reading, body.duplicates);
                return;
            }
            if (!response.ok) throw new Error(body.error || "雑誌マスターの新規保存に失敗しました");
            if (body.record) {
                addCreatedMagazineRecord(body.record);
                setMagazineCreateDraft(null);
                recordSavedMasterHistory(body.record, "create");
            }
            onSaveStatusChange("saved", "新規保存済み");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "新規保存に失敗しました");
        } finally {
            createRequestPendingRef.current = false;
        }
    }, [
        isMagazine,
        magazineCreateDraft,
        magazineDrafts,
        addCreatedMagazineRecord,
        onSaveStatusChange,
        showDuplicateDialog
    ]);
    const commitMagazineRecord = useCallback(async (field: keyof MagazineMasterRecord, value: string | string[])=>{
        if (isSelectedRecordReadOnly) return;
        if (!isMagazine || !selectedPersistedRecord) return;
        if (areUndoValuesEqual(selectedPersistedRecord[field], value)) return;
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `保存中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "保存中";
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/magazine-titles", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    magazineKey: selectedPersistedRecord.internalId,
                    magazineId: selectedPersistedRecord.id,
                    field,
                    value,
                    debugDelayMs
                })
            });
            const body = await response.json() as MagazineTitlePatchResponse;
            throwIfMasterDbUnavailable(response, body, "雑誌マスターの保存に失敗しました");
            if (!response.ok) throw new Error(body.error || "雑誌マスターの保存に失敗しました");
            if (body.record) {
                mergeSavedMagazineRecord(body.record);
                recordSavedMasterHistory(body.record, "save");
            }
            onSaveStatusChange("saved", "保存済み");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "保存に失敗しました");
        }
    }, [
        isMagazine,
        isSelectedRecordReadOnly,
        selectedPersistedRecord,
        mergeSavedMagazineRecord,
        onSaveStatusChange
    ]);
    const updatePrimaryRecord = (field: "name" | "reading", value: string)=>{
        if (isAuthor) updateAuthorRecord(field, value);
        else if (isPublisher) updatePublisherRecord(field, value);
        else updateMagazineRecord(field, value);
    };
    const handlePrimaryRecordBlur = (field: "name" | "reading", value: string)=>{
        if (isSelectedRecordReadOnly) return;
        if (isCreateMode) {
            if (isAuthor) {
                const nextDraft = authorCreateDraft ? {
                    ...authorCreateDraft,
                    [field]: value
                } : null;
                if (field === "name") {
                    setAuthorCreateDraft((current)=>current ? {
                            ...current,
                            name: value
                        } : current);
                } else {
                    setAuthorCreateDraft((current)=>current ? {
                            ...current,
                            reading: value
                        } : current);
                }
                void createAuthorMasterRecord(nextDraft);
                return;
            }
            if (isPublisher) {
                const nextDraft = publisherCreateDraft ? {
                    ...publisherCreateDraft,
                    [field]: value
                } : null;
                if (field === "name") {
                    setPublisherCreateDraft((current)=>current ? {
                            ...current,
                            name: value
                        } : current);
                } else {
                    setPublisherCreateDraft((current)=>current ? {
                            ...current,
                            reading: value
                        } : current);
                }
                void createPublisherMasterRecord(nextDraft);
                return;
            }
            if (isMagazine) {
                const nextDraft = magazineCreateDraft ? {
                    ...magazineCreateDraft,
                    [field]: value
                } : null;
                if (field === "name") {
                    setMagazineCreateDraft((current)=>current ? {
                            ...current,
                            name: value
                        } : current);
                } else {
                    setMagazineCreateDraft((current)=>current ? {
                            ...current,
                            reading: value
                        } : current);
                }
                void createMagazineMasterRecord(nextDraft);
                return;
            }
        }
        if (isAuthor) {
            void commitAuthorRecord(field, value);
            return;
        }
        if (isPublisher) {
            void commitPublisherRecord(field, value);
            return;
        }
        void commitMagazineRecord(field, value);
    };
    const handleMagazineFieldCommit = (field: keyof MagazineMasterRecord, value: string | string[])=>{
        if (isSelectedRecordReadOnly) return;
        if (isCreateMode) {
            if (field === "publishers") {
                const nextDraft = magazineCreateDraft ? {
                    ...magazineCreateDraft,
                    publishers: String(value)
                } : null;
                setMagazineCreateDraft((current)=>current ? {
                        ...current,
                        publishers: String(value)
                    } : current);
                void createMagazineMasterRecord(nextDraft);
                return;
            }
            updateMagazineRecord(field, value);
            return;
        }
        void commitMagazineRecord(field, value);
    };
    const handleOpenDuplicateRecord = (recordId: string)=>{
        setMasterDuplicateDialog(null);
        updateSelectedId(recordId);
    };
    const deleteSelectedAuthorRecord = useCallback(async ()=>{
        if (isSelectedRecordReadOnly) return;
        if (!isAuthor || !selectedRecord || isCreateMode) return;
        setDeleteConfirmDialog(null);
        setIsHeaderActionMenuOpen(false);
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `削除中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "削除中";
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/authors", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    authorKey: selectedRecord.internalId,
                    authorId: selectedRecord.id,
                    debugDelayMs
                })
            });
            const body = await response.json() as AuthorDeleteResponse;
            throwIfMasterDbUnavailable(response, body, "著者マスターの削除に失敗しました");
            if (response.status === 409 && body.dependencies?.length) {
                setDeleteBlockedDialog({
                    kind: "authors",
                    name: selectedRecord.name,
                    id: selectedRecord.id,
                    dependencies: body.dependencies
                });
                onSaveStatusChange("error", "参照中のため削除できません");
                return;
            }
            if (!response.ok) throw new Error(body.error || "著者マスターの削除に失敗しました");
            const deletedId = body.deletedAuthorId ?? selectedRecord.id;
            const nextRecords = authorDrafts.filter((record)=>record.id !== deletedId);
            setAuthorDrafts(nextRecords);
            setSelectedIds((current)=>({
                    ...current,
                    authors: nextRecords[0]?.id ?? ""
                }));
            onSelectedIdChange("authors", nextRecords[0]?.id ?? "");
            onSaveStatusChange("saved", "削除しました");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "削除に失敗しました");
        }
    }, [
        isAuthor,
        isSelectedRecordReadOnly,
        selectedRecord,
        isCreateMode,
        onSaveStatusChange,
        authorDrafts,
        onSelectedIdChange
    ]);
    const deleteSelectedPublisherRecord = useCallback(async ()=>{
        if (isSelectedRecordReadOnly) return;
        if (!isPublisher || !selectedRecord || isCreateMode) return;
        setDeleteConfirmDialog(null);
        setIsHeaderActionMenuOpen(false);
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `削除中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "削除中";
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/publishers", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    publisherKey: selectedRecord.internalId,
                    publisherId: selectedRecord.id,
                    debugDelayMs
                })
            });
            const body = await response.json() as PublisherDeleteResponse;
            throwIfMasterDbUnavailable(response, body, "出版社マスターの削除に失敗しました");
            if (response.status === 409 && body.dependencies?.length) {
                setDeleteBlockedDialog({
                    kind: "publishers",
                    name: selectedRecord.name,
                    id: selectedRecord.id,
                    dependencies: body.dependencies
                });
                onSaveStatusChange("error", "参照中のため削除できません");
                return;
            }
            if (!response.ok) throw new Error(body.error || "出版社マスターの削除に失敗しました");
            const deletedId = body.deletedPublisherId ?? selectedRecord.id;
            const nextRecords = publisherDrafts.filter((record)=>record.id !== deletedId);
            setPublisherDrafts(nextRecords);
            setSelectedIds((current)=>({
                    ...current,
                    publishers: nextRecords[0]?.id ?? ""
                }));
            onSelectedIdChange("publishers", nextRecords[0]?.id ?? "");
            onSaveStatusChange("saved", "削除しました");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "削除に失敗しました");
        }
    }, [
        isPublisher,
        isSelectedRecordReadOnly,
        selectedRecord,
        isCreateMode,
        onSaveStatusChange,
        publisherDrafts,
        onSelectedIdChange
    ]);
    const deleteSelectedMagazineRecord = useCallback(async ()=>{
        if (isSelectedRecordReadOnly) return;
        if (!isMagazine || !selectedRecord || isCreateMode) return;
        const linkedIssueCount = magazineIssueCounts[selectedRecord.id] ?? 0;
        if (linkedIssueCount > 0) {
            setDeleteConfirmDialog(null);
            setIsHeaderActionMenuOpen(false);
            setDeleteBlockedDialog({
                kind: "magazines",
                name: selectedRecord.name,
                id: selectedRecord.id,
                dependencies: [
                    {
                        label: "雑誌個別",
                        count: linkedIssueCount
                    }
                ]
            });
            onSaveStatusChange("error", "参照中のため削除できません");
            return;
        }
        setDeleteConfirmDialog(null);
        setIsHeaderActionMenuOpen(false);
        const debugDelayMs = getIssueSaveDebugDelayMs();
        const savingMessage = debugDelayMs > 0 ? `削除中（${(debugDelayMs / 1000).toFixed(1)}秒テスト）` : "削除中";
        onSaveStatusChange("saving", savingMessage);
        try {
            const response = await fetch("/api/magazine-titles", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    magazineKey: selectedRecord.internalId,
                    magazineId: selectedRecord.id,
                    debugDelayMs
                })
            });
            const body = await response.json() as MagazineTitlePatchResponse & { deletedMagazineId?: string };
            throwIfMasterDbUnavailable(response, body, "雑誌マスターの削除に失敗しました");
            if (response.status === 409 && body.dependencies?.length) {
                setDeleteBlockedDialog({
                    kind: "magazines",
                    name: selectedRecord.name,
                    id: selectedRecord.id,
                    dependencies: body.dependencies
                });
                onSaveStatusChange("error", "参照中のため削除できません");
                return;
            }
            if (!response.ok) throw new Error(body.error || "雑誌マスターの削除に失敗しました");
            const deletedId = body.deletedMagazineId ?? selectedRecord.id;
            const nextRecords = magazineDrafts.filter((record)=>record.id !== deletedId);
            setMagazineDrafts(nextRecords);
            setSelectedIds((current)=>({
                    ...current,
                    magazines: nextRecords[0]?.id ?? ""
                }));
            onSelectedIdChange("magazines", nextRecords[0]?.id ?? "");
            onSaveStatusChange("saved", "削除しました");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "削除に失敗しました");
        }
    }, [
        isMagazine,
        isSelectedRecordReadOnly,
        selectedRecord,
        isCreateMode,
        magazineIssueCounts,
        onSaveStatusChange,
        magazineDrafts,
        onSelectedIdChange
    ]);
    const openDeleteConfirmDialog = ()=>{
        if (isSelectedRecordReadOnly) return;
        if (!selectedRecord || isCreateMode) return;
        setIsHeaderActionMenuOpen(false);
        if (isMagazine) {
            const linkedIssueCount = magazineIssueCounts[selectedRecord.id] ?? 0;
            if (linkedIssueCount > 0) {
                setDeleteBlockedDialog({
                    kind: "magazines",
                    name: selectedRecord.name,
                    id: selectedRecord.id,
                    dependencies: [
                        {
                            label: "雑誌個別",
                            count: linkedIssueCount
                        }
                    ]
                });
                onSaveStatusChange("error", "参照中のため削除できません");
                return;
            }
        }
        setDeleteBlockedDialog(null);
        setDeleteConfirmDialog({
            kind: kind as "authors" | "publishers" | "magazines",
            name: selectedRecord.name,
            id: selectedRecord.id
        });
    };
    const openMagazineCsvDownloadDialog = ()=>{
        setIsHeaderActionMenuOpen(false);
        setMagazineCsvDownloadDialog({
            selectedColumnIds: [
                ...defaultMagazineCsvDownloadColumnIds
            ],
            mode: "display"
        });
    };
    const closeMagazineCsvDownloadDialog = ()=>{
        setMagazineCsvDownloadDialog(null);
    };
    const openMagazineCsvHelpDialog = ()=>{
        setIsHeaderActionMenuOpen(false);
        setMagazineCsvHelpDialog({
            kind: "magazines"
        });
    };
    const closeMagazineCsvHelpDialog = ()=>{
        setMagazineCsvHelpDialog(null);
    };
    const openMagazineCsvUploadPicker = ()=>{
        setIsHeaderActionMenuOpen(false);
        magazineCsvUploadInputRef.current?.click();
    };
    const handleMagazineCsvUploadFile = async (file: File | null)=>{
        if (!file) return;
        const fileSizeError = ensureCsvUploadFileSize(file);
        if (fileSizeError) {
            onSaveStatusChange("error", fileSizeError);
            return;
        }
        onSaveStatusChange("saving", "CSVを解析中");
        try {
            const csvText = await file.text();
            const response = await fetch("/api/magazine-titles/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "preview",
                    fileName: file.name,
                    csvText,
                    fileSizeBytes: file.size
                })
            });
            const body = await response.json() as MagazineCsvUploadResponse;
            throwIfMasterDbUnavailable(response, body, "CSVの解析に失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVの解析に失敗しました");
            }
            setMagazineCsvUploadDialog({
                fileName: file.name,
                csvText,
                isSubmitting: false,
                preview: body,
                submitError: ""
            });
            onSaveStatusChange("saved", "CSVの確認内容を表示しました");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "CSVの解析に失敗しました");
        }
    };
    const handleMagazineCsvUploadFileChange = async (event: ChangeEvent<HTMLInputElement>)=>{
        const file = event.currentTarget.files?.[0] ?? null;
        event.currentTarget.value = "";
        await handleMagazineCsvUploadFile(file);
    };
    const handleMagazineCsvDrop = (files: File[])=>{
        const csvFile = files.find((file)=>/\.csv$/i.test(file.name) || file.type === "text/csv") ?? files[0] ?? null;
        void handleMagazineCsvUploadFile(csvFile);
    };
    const closeMagazineCsvUploadDialog = ()=>{
        setMagazineCsvUploadDialog(null);
    };
    const executeMagazineCsvUpload = async ()=>{
        if (!magazineCsvUploadDialog || magazineCsvUploadDialog.isSubmitting) return;
        setMagazineCsvUploadDialog((current)=>current ? {
                ...current,
                isSubmitting: true,
                submitError: ""
            } : current);
        onSaveStatusChange("saving", "CSVを取り込み中");
        try {
            const response = await fetch("/api/magazine-titles/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "commit",
                    fileName: magazineCsvUploadDialog.fileName,
                    csvText: magazineCsvUploadDialog.csvText
                })
            });
            const body = await response.json() as MagazineCsvUploadResponse;
            throwIfMasterDbUnavailable(response, body, "CSVの取り込みに失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVの取り込みに失敗しました");
            }
            const preferredMagazineId = body.affectedMagazineIds?.[0] ?? "";
            closeMagazineCsvUploadDialog();
            reloadMagazineUploadSources(preferredMagazineId);
            onSaveStatusChange("saved", `CSVを取り込みました（${body.importedCount ?? body.affectedMagazineIds?.length ?? 0}件）`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "CSVの取り込みに失敗しました";
            setMagazineCsvUploadDialog((current)=>current ? {
                    ...current,
                    isSubmitting: false,
                    submitError: message
                } : current);
            onSaveStatusChange("error", message);
        }
    };
    const executeMagazineCsvUploadUndo = async ()=>{
        if (!magazineCsvUploadUndoState) return;
        const isConfirmed = await showConfirmDialog({
            title: "Undo Upload 確認",
            message: `直前のCSVアップロードを丸ごと元に戻します。\n\nファイル: ${magazineCsvUploadUndoState.fileName || "CSVアップロード"}\n対象: ${magazineCsvUploadUndoState.importedCount}件\n\nこの操作を実行しますか？`,
            confirmLabel: "元に戻す",
            cancelLabel: "キャンセル"
        });
        if (!isConfirmed) return;
        onSaveStatusChange("saving", "CSVアップロードを元に戻しています");
        try {
            const response = await fetch("/api/magazine-titles/upload/undo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            const body = await response.json() as MagazineCsvUploadUndoResponse;
            throwIfMasterDbUnavailable(response, body, "CSVアップロードのUndoに失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVアップロードのUndoに失敗しました");
            }
            reloadMagazineUploadSources();
            onSaveStatusChange("saved", `CSVアップロードを元に戻しました（${body.importedCount ?? magazineCsvUploadUndoState.importedCount}件）`);
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "CSVアップロードのUndoに失敗しました");
        }
    };
    const toggleMagazineCsvDownloadColumn = (columnId: MagazineMasterCsvDownloadFieldId)=>{
        setMagazineCsvDownloadDialog((current)=>{
            if (!current) return current;
            const exists = current.selectedColumnIds.includes(columnId);
            return {
                ...current,
                selectedColumnIds: exists ? current.selectedColumnIds.filter((id)=>id !== columnId) : [
                    ...current.selectedColumnIds,
                    columnId
                ]
            };
        });
    };
    const updateMagazineCsvDownloadMode = (mode: "display" | "raw")=>{
        setMagazineCsvDownloadDialog((current)=>current ? {
                ...current,
                mode
            } : current);
    };
    const executeMagazineCsvTemplateDownload = ()=>{
        const csvRows = [
            magazineMasterCsvTemplateFields.map((column)=>escapeCsvValue(column.label)).join(","),
            ...magazineMasterCsvTemplateSampleRows.map((sampleRow)=>magazineMasterCsvTemplateFields.map((column)=>escapeCsvValue(sampleRow[column.id] ?? "")).join(","))
        ];
        const blob = new Blob([
            csvRows.join("\r\n")
        ], {
            type: "text/csv;charset=utf-8"
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildMagazineCsvTemplateFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl), 0);
        onSaveStatusChange("saved", "雑誌マスターCSVテンプレートをダウンロードしました");
    };
    const executeMagazineCsvDownload = ()=>{
        if (!magazineCsvDownloadDialog) return;
        const selectedColumns = magazineMasterCsvDownloadFields.filter((column)=>magazineCsvDownloadDialog.selectedColumnIds.includes(column.id));
        if (selectedColumns.length === 0) {
            onSaveStatusChange("error", "CSVに含める列を1つ以上選択してください");
            return;
        }
        const csvRows = [
            selectedColumns.map((column)=>escapeCsvValue(column.label)).join(","),
            ...magazineDrafts.map((record)=>selectedColumns.map((column)=>escapeCsvValue((magazineCsvDownloadDialog.mode === "raw" ? column.getRawValue(record) : column.getDisplayValue(record)) ?? "")).join(","))
        ];
        const blob = new Blob([
            csvRows.join("\r\n")
        ], {
            type: "text/csv;charset=utf-8"
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildMagazineCsvFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl), 0);
        setMagazineCsvDownloadDialog(null);
        onSaveStatusChange("saved", `雑誌マスターCSVをダウンロードしました（${magazineDrafts.length}件）`);
    };
    const openAuthorCsvDownloadDialog = ()=>{
        setIsHeaderActionMenuOpen(false);
        setAuthorCsvDownloadDialog({
            selectedColumnIds: authorCsvDownloadFields.map((column)=>column.id),
            mode: "display"
        });
    };
    const closeAuthorCsvDownloadDialog = ()=>{
        setAuthorCsvDownloadDialog(null);
    };
    const openAuthorCsvHelpDialog = ()=>{
        setIsHeaderActionMenuOpen(false);
        setAuthorCsvHelpDialog({
            kind: "authors"
        });
    };
    const closeAuthorCsvHelpDialog = ()=>{
        setAuthorCsvHelpDialog(null);
    };
    const openAuthorCsvUploadPicker = ()=>{
        setIsHeaderActionMenuOpen(false);
        authorCsvUploadInputRef.current?.click();
    };
    const handleAuthorCsvUploadFile = async (file: File | null)=>{
        if (!file) return;
        const fileSizeError = ensureCsvUploadFileSize(file);
        if (fileSizeError) {
            onSaveStatusChange("error", fileSizeError);
            return;
        }
        onSaveStatusChange("saving", "CSVを解析中");
        try {
            const csvText = await file.text();
            const response = await fetch("/api/authors/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "preview",
                    fileName: file.name,
                    csvText,
                    fileSizeBytes: file.size
                })
            });
            const body = await response.json() as AuthorCsvUploadResponse;
            throwIfMasterDbUnavailable(response, body, "CSVの解析に失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVの解析に失敗しました");
            }
            setAuthorCsvUploadDialog({
                fileName: file.name,
                csvText,
                isSubmitting: false,
                preview: body,
                submitError: ""
            });
            onSaveStatusChange("saved", "CSVの確認内容を表示しました");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "CSVの解析に失敗しました");
        }
    };
    const handleAuthorCsvUploadFileChange = async (event: ChangeEvent<HTMLInputElement>)=>{
        const file = event.currentTarget.files?.[0] ?? null;
        event.currentTarget.value = "";
        await handleAuthorCsvUploadFile(file);
    };
    const closeAuthorCsvUploadDialog = ()=>{
        setAuthorCsvUploadDialog(null);
    };
    const executeAuthorCsvUpload = async ()=>{
        if (!authorCsvUploadDialog || authorCsvUploadDialog.isSubmitting) return;
        setAuthorCsvUploadDialog((current)=>current ? {
                ...current,
                isSubmitting: true,
                submitError: ""
            } : current);
        onSaveStatusChange("saving", "CSVを取り込み中");
        try {
            const response = await fetch("/api/authors/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "commit",
                    fileName: authorCsvUploadDialog.fileName,
                    csvText: authorCsvUploadDialog.csvText
                })
            });
            const body = await response.json() as AuthorCsvUploadResponse;
            throwIfMasterDbUnavailable(response, body, "CSVの取り込みに失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVの取り込みに失敗しました");
            }
            closeAuthorCsvUploadDialog();
            setAuthorLoadState("idle");
            void reloadAuthorCsvUploadUndoState();
            onSaveStatusChange("saved", `CSVを取り込みました（${body.importedCount ?? body.affectedAuthorIds?.length ?? 0}件）`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "CSVの取り込みに失敗しました";
            setAuthorCsvUploadDialog((current)=>current ? {
                    ...current,
                    isSubmitting: false,
                    submitError: message
                } : current);
            onSaveStatusChange("error", message);
        }
    };
    const executeAuthorCsvUploadUndo = async ()=>{
        if (!authorCsvUploadUndoState) return;
        const isConfirmed = await showConfirmDialog({
            title: "Undo Upload 確認",
            message: `直前のCSVアップロードを丸ごと元に戻します。\n\nファイル: ${authorCsvUploadUndoState.fileName || "CSVアップロード"}\n対象: ${authorCsvUploadUndoState.importedCount}件\n\nこの操作を実行しますか？`,
            confirmLabel: "元に戻す",
            cancelLabel: "キャンセル"
        });
        if (!isConfirmed) return;
        onSaveStatusChange("saving", "CSVアップロードを元に戻しています");
        try {
            const response = await fetch("/api/authors/upload/undo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            const body = await response.json() as AuthorCsvUploadUndoResponse;
            throwIfMasterDbUnavailable(response, body, "CSVアップロードのUndoに失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVアップロードのUndoに失敗しました");
            }
            setAuthorLoadState("idle");
            void reloadAuthorCsvUploadUndoState();
            onSaveStatusChange("saved", `CSVアップロードを元に戻しました（${body.importedCount ?? authorCsvUploadUndoState.importedCount}件）`);
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "CSVアップロードのUndoに失敗しました");
        }
    };
    const toggleAuthorCsvDownloadColumn = (columnId: AuthorCsvDownloadFieldId)=>{
        setAuthorCsvDownloadDialog((current)=>{
            if (!current) return current;
            const exists = current.selectedColumnIds.includes(columnId);
            return {
                ...current,
                selectedColumnIds: exists ? current.selectedColumnIds.filter((id)=>id !== columnId) : [
                    ...current.selectedColumnIds,
                    columnId
                ]
            };
        });
    };
    const updateAuthorCsvDownloadMode = (mode: "display" | "raw")=>{
        setAuthorCsvDownloadDialog((current)=>current ? {
                ...current,
                mode
            } : current);
    };
    const executeAuthorCsvTemplateDownload = ()=>{
        const csvRows = [
            authorCsvTemplateFields.map((column)=>escapeCsvValue(column.label)).join(","),
            ...authorCsvTemplateSampleRows.map((sampleRow)=>authorCsvTemplateFields.map((column)=>escapeCsvValue(sampleRow[column.id] ?? "")).join(","))
        ];
        const blob = new Blob([
            csvRows.join("\r\n")
        ], {
            type: "text/csv;charset=utf-8"
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildAuthorCsvTemplateFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl), 0);
        onSaveStatusChange("saved", "著者CSVテンプレートをダウンロードしました");
    };
    const executeAuthorCsvDownload = ()=>{
        if (!authorCsvDownloadDialog) return;
        const selectedColumns = authorCsvDownloadFields.filter((column)=>authorCsvDownloadDialog.selectedColumnIds.includes(column.id));
        if (selectedColumns.length === 0) {
            onSaveStatusChange("error", "CSVに含める列を1つ以上選択してください");
            return;
        }
        const csvRows = [
            selectedColumns.map((column)=>escapeCsvValue(column.label)).join(","),
            ...authorDrafts.map((record)=>selectedColumns.map((column)=>escapeCsvValue((authorCsvDownloadDialog.mode === "raw" ? column.getRawValue(record) : column.getDisplayValue(record)) ?? "")).join(","))
        ];
        const blob = new Blob([
            csvRows.join("\r\n")
        ], {
            type: "text/csv;charset=utf-8"
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildAuthorCsvFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl), 0);
        setAuthorCsvDownloadDialog(null);
        onSaveStatusChange("saved", `著者CSVをダウンロードしました（${authorDrafts.length}件）`);
    };
    const openPublisherCsvDownloadDialog = ()=>{
        setIsHeaderActionMenuOpen(false);
        setPublisherCsvDownloadDialog({
            selectedColumnIds: publisherCsvDownloadFields.map((column)=>column.id),
            mode: "display"
        });
    };
    const closePublisherCsvDownloadDialog = ()=>{
        setPublisherCsvDownloadDialog(null);
    };
    const openPublisherCsvHelpDialog = ()=>{
        setIsHeaderActionMenuOpen(false);
        setPublisherCsvHelpDialog({
            kind: "publishers"
        });
    };
    const closePublisherCsvHelpDialog = ()=>{
        setPublisherCsvHelpDialog(null);
    };
    const openPublisherCsvUploadPicker = ()=>{
        setIsHeaderActionMenuOpen(false);
        publisherCsvUploadInputRef.current?.click();
    };
    const handlePublisherCsvUploadFile = async (file: File | null)=>{
        if (!file) return;
        const fileSizeError = ensureCsvUploadFileSize(file);
        if (fileSizeError) {
            onSaveStatusChange("error", fileSizeError);
            return;
        }
        onSaveStatusChange("saving", "CSVを解析中");
        try {
            const csvText = await file.text();
            const response = await fetch("/api/publishers/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "preview",
                    fileName: file.name,
                    csvText,
                    fileSizeBytes: file.size
                })
            });
            const body = await response.json() as PublisherCsvUploadResponse;
            throwIfMasterDbUnavailable(response, body, "CSVの解析に失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVの解析に失敗しました");
            }
            setPublisherCsvUploadDialog({
                fileName: file.name,
                csvText,
                isSubmitting: false,
                preview: body,
                submitError: ""
            });
            onSaveStatusChange("saved", "CSVの確認内容を表示しました");
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "CSVの解析に失敗しました");
        }
    };
    const handlePublisherCsvUploadFileChange = async (event: ChangeEvent<HTMLInputElement>)=>{
        const file = event.currentTarget.files?.[0] ?? null;
        event.currentTarget.value = "";
        await handlePublisherCsvUploadFile(file);
    };
    const closePublisherCsvUploadDialog = ()=>{
        setPublisherCsvUploadDialog(null);
    };
    const executePublisherCsvUpload = async ()=>{
        if (!publisherCsvUploadDialog || publisherCsvUploadDialog.isSubmitting) return;
        setPublisherCsvUploadDialog((current)=>current ? {
                ...current,
                isSubmitting: true,
                submitError: ""
            } : current);
        onSaveStatusChange("saving", "CSVを取り込み中");
        try {
            const response = await fetch("/api/publishers/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "commit",
                    fileName: publisherCsvUploadDialog.fileName,
                    csvText: publisherCsvUploadDialog.csvText
                })
            });
            const body = await response.json() as PublisherCsvUploadResponse;
            throwIfMasterDbUnavailable(response, body, "CSVの取り込みに失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVの取り込みに失敗しました");
            }
            closePublisherCsvUploadDialog();
            setPublisherLoadState("idle");
            void reloadPublisherCsvUploadUndoState();
            onSaveStatusChange("saved", `CSVを取り込みました（${body.importedCount ?? body.affectedPublisherIds?.length ?? 0}件）`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "CSVの取り込みに失敗しました";
            setPublisherCsvUploadDialog((current)=>current ? {
                    ...current,
                    isSubmitting: false,
                    submitError: message
                } : current);
            onSaveStatusChange("error", message);
        }
    };
    const executePublisherCsvUploadUndo = async ()=>{
        if (!publisherCsvUploadUndoState) return;
        const isConfirmed = await showConfirmDialog({
            title: "Undo Upload 確認",
            message: `直前のCSVアップロードを丸ごと元に戻します。\n\nファイル: ${publisherCsvUploadUndoState.fileName || "CSVアップロード"}\n対象: ${publisherCsvUploadUndoState.importedCount}件\n\nこの操作を実行しますか？`,
            confirmLabel: "元に戻す",
            cancelLabel: "キャンセル"
        });
        if (!isConfirmed) return;
        onSaveStatusChange("saving", "CSVアップロードを元に戻しています");
        try {
            const response = await fetch("/api/publishers/upload/undo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            const body = await response.json() as PublisherCsvUploadUndoResponse;
            throwIfMasterDbUnavailable(response, body, "CSVアップロードのUndoに失敗しました");
            if (!response.ok) {
                throw new Error(body.error || "CSVアップロードのUndoに失敗しました");
            }
            setPublisherLoadState("idle");
            void reloadPublisherCsvUploadUndoState();
            onSaveStatusChange("saved", `CSVアップロードを元に戻しました（${body.importedCount ?? publisherCsvUploadUndoState.importedCount}件）`);
        } catch (error) {
            onSaveStatusChange("error", error instanceof Error ? error.message : "CSVアップロードのUndoに失敗しました");
        }
    };
    const togglePublisherCsvDownloadColumn = (columnId: PublisherCsvDownloadFieldId)=>{
        setPublisherCsvDownloadDialog((current)=>{
            if (!current) return current;
            const exists = current.selectedColumnIds.includes(columnId);
            return {
                ...current,
                selectedColumnIds: exists ? current.selectedColumnIds.filter((id)=>id !== columnId) : [
                    ...current.selectedColumnIds,
                    columnId
                ]
            };
        });
    };
    const updatePublisherCsvDownloadMode = (mode: "display" | "raw")=>{
        setPublisherCsvDownloadDialog((current)=>current ? {
                ...current,
                mode
            } : current);
    };
    const executePublisherCsvTemplateDownload = ()=>{
        const csvRows = [
            publisherCsvTemplateFields.map((column)=>escapeCsvValue(column.label)).join(","),
            ...publisherCsvTemplateSampleRows.map((sampleRow)=>publisherCsvTemplateFields.map((column)=>escapeCsvValue(sampleRow[column.id] ?? "")).join(","))
        ];
        const blob = new Blob([
            csvRows.join("\r\n")
        ], {
            type: "text/csv;charset=utf-8"
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildPublisherCsvTemplateFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl), 0);
        onSaveStatusChange("saved", "出版社CSVテンプレートをダウンロードしました");
    };
    const executePublisherCsvDownload = ()=>{
        if (!publisherCsvDownloadDialog) return;
        const selectedColumns = publisherCsvDownloadFields.filter((column)=>publisherCsvDownloadDialog.selectedColumnIds.includes(column.id));
        if (selectedColumns.length === 0) {
            onSaveStatusChange("error", "CSVに含める列を1つ以上選択してください");
            return;
        }
        const csvRows = [
            selectedColumns.map((column)=>escapeCsvValue(column.label)).join(","),
            ...publisherDrafts.map((record)=>selectedColumns.map((column)=>escapeCsvValue((publisherCsvDownloadDialog.mode === "raw" ? column.getRawValue(record) : column.getDisplayValue(record)) ?? "")).join(","))
        ];
        const blob = new Blob([
            csvRows.join("\r\n")
        ], {
            type: "text/csv;charset=utf-8"
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildPublisherCsvFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl), 0);
        setPublisherCsvDownloadDialog(null);
        onSaveStatusChange("saved", `出版社CSVをダウンロードしました（${publisherDrafts.length}件）`);
    };
    const isHeaderActionButtonDisabled = isMagazine ? false : !selectedRecord || isCreateMode || isSelectedRecordReadOnly;
    return <FileDropOverlay
        disabled={!isMagazine && !isPublisher && !isAuthor}
        title="CSVファイルをアップロード"
        description={isAuthor ? "この画面全体へドロップすると、著者CSVの確認画面を開きます。" : isPublisher ? "この画面全体へドロップすると、出版社CSVの確認画面を開きます。" : "この画面全体へドロップすると、雑誌マスターCSVの確認画面を開きます。"}
        acceptHint="対応形式: .csv"
        onFilesSelected={isAuthor ? (files)=>{
            const csvFile = files.find((file)=>/\.csv$/i.test(file.name) || file.type === "text/csv") ?? files[0] ?? null;
            void handleAuthorCsvUploadFile(csvFile);
        } : isPublisher ? (files)=>{
            const csvFile = files.find((file)=>/\.csv$/i.test(file.name) || file.type === "text/csv") ?? files[0] ?? null;
            void handlePublisherCsvUploadFile(csvFile);
        } : handleMagazineCsvDrop}
    >
        <section className={`panel master-editor-panel theme-${kind}`}>
        {isMagazine && <input ref={magazineCsvUploadInputRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={handleMagazineCsvUploadFileChange}/>}
        {isAuthor && <input ref={authorCsvUploadInputRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={handleAuthorCsvUploadFileChange}/>}
        {isPublisher && <input ref={publisherCsvUploadInputRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={handlePublisherCsvUploadFileChange}/>}
        <div className="panel-title panel-header">
            <div>
                <h2>{title}{demoApplicationBadge && <span className={`application-state-badge tone-${demoApplicationBadge.tone}`}>{demoApplicationBadge.label}</span>}</h2>
                <p>{description}</p>
            </div>
            <div className="master-panel-actions">
                <button className="primary-button" type="button" onClick={createMasterRecord} disabled={!isDbReady || isCreateMode}>
                    <Plus size={16}/>
                    {isCreateMode ? "新規入力中" : "新規作成"}
                </button>
                {(isAuthor || isPublisher || isMagazine) && <DropdownMenu
                    align="end"
                    className="master-panel-action-wrap"
                    menuClassName="master-list-action-menu master-header-action-menu"
                    items={[
                        ...isMagazine ? [
                            {
                                id: "csv-file",
                                label: "CSV File",
                                icon: <NotepadText size={14}/>,
                                children: [
                                    {
                                        id: "csv-file-download",
                                        label: "CSV File Down",
                                        icon: <ArrowDownToLine size={14}/>,
                                        onSelect: openMagazineCsvDownloadDialog
                                    },
                                    {
                                        id: "csv-file-template-download",
                                        label: "CSV File Template Down",
                                        icon: <Copy size={14}/>,
                                        onSelect: executeMagazineCsvTemplateDownload
                                    },
                                    {
                                        id: "csv-file-upload",
                                        label: "CSV File Upload",
                                        icon: <ArrowUpToLine size={14}/>,
                                        onSelect: openMagazineCsvUploadPicker
                                    },
                                    {
                                        id: "csv-file-help",
                                        label: "CSV Help",
                                        icon: <CircleHelp size={14}/>,
                                        onSelect: openMagazineCsvHelpDialog
                                    },
                                    {
                                        id: "csv-file-undo-separator",
                                        kind: "separator" as const
                                    },
                                    {
                                        id: "csv-file-undo-upload",
                                        label: "Undo Upload",
                                        icon: <RotateCcw size={14}/>,
                                        disabled: !magazineCsvUploadUndoState,
                                        onSelect: ()=>void executeMagazineCsvUploadUndo()
                                    }
                                ]
                            },
                            {
                                id: "csv-separator",
                                kind: "separator" as const
                            }
                        ] : isAuthor ? [
                            {
                                id: "csv-file",
                                label: "CSV File",
                                icon: <NotepadText size={14}/>,
                                children: [
                                    {
                                        id: "csv-file-download",
                                        label: "CSV File Down",
                                        icon: <ArrowDownToLine size={14}/>,
                                        onSelect: openAuthorCsvDownloadDialog
                                    },
                                    {
                                        id: "csv-file-template-download",
                                        label: "CSV File Template Down",
                                        icon: <Copy size={14}/>,
                                        onSelect: executeAuthorCsvTemplateDownload
                                    },
                                    {
                                        id: "csv-file-upload",
                                        label: "CSV File Upload",
                                        icon: <ArrowUpToLine size={14}/>,
                                        onSelect: openAuthorCsvUploadPicker
                                    },
                                    {
                                        id: "csv-file-help",
                                        label: "CSV Help",
                                        icon: <CircleHelp size={14}/>,
                                        onSelect: openAuthorCsvHelpDialog
                                    },
                                    {
                                        id: "csv-file-undo-separator",
                                        kind: "separator" as const
                                    },
                                    {
                                        id: "csv-file-undo-upload",
                                        label: "Undo Upload",
                                        icon: <RotateCcw size={14}/>,
                                        disabled: !authorCsvUploadUndoState,
                                        onSelect: ()=>void executeAuthorCsvUploadUndo()
                                    }
                                ]
                            },
                            {
                                id: "csv-separator",
                                kind: "separator" as const
                            }
                        ] : isPublisher ? [
                            {
                                id: "csv-file",
                                label: "CSV File",
                                icon: <NotepadText size={14}/>,
                                children: [
                                    {
                                        id: "csv-file-download",
                                        label: "CSV File Down",
                                        icon: <ArrowDownToLine size={14}/>,
                                        onSelect: openPublisherCsvDownloadDialog
                                    },
                                    {
                                        id: "csv-file-template-download",
                                        label: "CSV File Template Down",
                                        icon: <Copy size={14}/>,
                                        onSelect: executePublisherCsvTemplateDownload
                                    },
                                    {
                                        id: "csv-file-upload",
                                        label: "CSV File Upload",
                                        icon: <ArrowUpToLine size={14}/>,
                                        onSelect: openPublisherCsvUploadPicker
                                    },
                                    {
                                        id: "csv-file-help",
                                        label: "CSV Help",
                                        icon: <CircleHelp size={14}/>,
                                        onSelect: openPublisherCsvHelpDialog
                                    },
                                    {
                                        id: "csv-file-undo-separator",
                                        kind: "separator" as const
                                    },
                                    {
                                        id: "csv-file-undo-upload",
                                        label: "Undo Upload",
                                        icon: <RotateCcw size={14}/>,
                                        disabled: !publisherCsvUploadUndoState,
                                        onSelect: ()=>void executePublisherCsvUploadUndo()
                                    }
                                ]
                            },
                            {
                                id: "csv-separator",
                                kind: "separator" as const
                            }
                        ] : [],
                        {
                            id: "delete-master-record",
                            label: isAuthor ? "この著者を削除" : isPublisher ? "この出版社を削除" : "この雑誌を削除",
                            icon: <Trash2 size={14}/>,
                            danger: true,
                            disabled: !selectedRecord || isCreateMode || isSelectedRecordReadOnly,
                            onSelect: openDeleteConfirmDialog
                        }
                    ]}
                    trigger={({ toggle, buttonRef, ariaProps })=><button type="button" ref={buttonRef} className="master-list-action-button master-header-action-button" aria-label={`${title}の操作`} disabled={isHeaderActionButtonDisabled} onClick={toggle} {...ariaProps}>
                            <Ellipsis size={18}/>
                        </button>}
                />}
            </div>
        </div>
        <div className="author-publisher-layout">
            <aside className="master-list-pane">
                <div className="master-list-search">
                    <Search size={18}/>
                    <input value={searchText} placeholder={`${title}を検索`} onChange={(event)=>setSearchText(event.target.value)}/>
                </div>
                <div className="master-list-meta">
                    <label className="master-list-sort-select">
                        <select value={currentMasterListSort} onChange={(event)=>updateMasterListSort(event.target.value as MasterListSortValue)} aria-label={`${kind === "magazines" ? "雑誌" : title}リストの並び順`}>
                            {masterListSortOptions.map((option)=><option value={option.value} key={option.value}>
                                {option.label}
                            </option>)}
                        </select>
                    </label>
                    <span>{listStatusLabel}</span>
                </div>
                {currentLoadState === "error" && <div className="master-load-error">{currentLoadError}</div>}
                {isMagazine && magazineIssueLoadError && <div className="master-load-error">{magazineIssueLoadError}</div>}
                <div className="master-vertical-list" tabIndex={0} onKeyDown={handleMasterListKeyDown} onScroll={handleMasterListScroll} aria-label={`${title}リスト`}>
                    {filteredRecords.length > 0 ? filteredRecords.map((record)=>{
                    const itemClassName = [
                        "master-list-item",
                        isMagazine ? "magazine-list-item" : "",
                        selectedRecord?.id === record.id ? "active" : ""
                    ].filter(Boolean).join(" ");
                    const rowApplicationBadge = getListApplicationBadge(record.id);
                    if (isMagazine) {
                        const magazineRecord = record as MagazineMasterRecord;
                        return <button type="button" key={record.id} className={itemClassName} data-master-record-id={record.id} onClick={()=>{
                            updateSelectedId(record.id);
                            setOpenAuthorActionId(null);
                        }} onDoubleClick={()=>{
                            updateSelectedId(record.id);
                            onOpenMagazineIssueEdit(magazineRecord);
                        }}>
                            <span className="master-list-select-button">
                                <span className="master-list-name">
                                    {record.name}
                                    {rowApplicationBadge && <span className={`application-state-badge tone-${rowApplicationBadge.tone}`}>{rowApplicationBadge.label}</span>}
                                </span>
                                <span className="master-list-reading">{record.reading}</span>
                            </span>
                            <span className="magazine-list-issue-count">登録 {magazineIssueCounts[record.id] ?? 0}件</span>
                        </button>;
                    }
                    return <div key={record.id} className={itemClassName} data-master-record-id={record.id}>
                        <button type="button" className="master-list-select-button" onClick={()=>{
                            updateSelectedId(record.id);
                            setOpenAuthorActionId(null);
                        }}>
                            <span className="master-list-name">
                                {record.name}
                                {rowApplicationBadge && <span className={`application-state-badge tone-${rowApplicationBadge.tone}`}>{rowApplicationBadge.label}</span>}
                            </span>
                            <span className="master-list-reading">{record.reading}</span>
                        </button>
                        {isAuthor && <DropdownMenu
                            align="end"
                            className="master-list-action-wrap"
                            menuClassName="master-list-action-menu"
                            items={[
                                {
                                    id: `alias-${record.id}`,
                                    label: "別名義に追加",
                                    disabled: selectedRecord?.id === record.id,
                                    onSelect: ()=>addAliasFromAuthorRecord(record as AuthorMasterRecord)
                                }
                            ]}
                            trigger={({ toggle, buttonRef, ariaProps })=><button type="button" ref={buttonRef} className="master-list-action-button" aria-label={`${record.name}の操作`} onClick={(event)=>{
                                    event.stopPropagation();
                                    toggle();
                                }} {...ariaProps}>
                                    <Ellipsis size={17}/>
                                </button>}
                        />}
                    </div>;
                }) : <div className="master-list-empty">{emptyListMessage}</div>}
                    {filteredRecords.length > 0 && filteredRecords.length < sortedMatchedRecords.length && <div className="master-list-load-more-indicator">
                        続きはスクロールでさらに {Math.min(defaultUiPreferences.masterListLoadMoreItems, sortedMatchedRecords.length - filteredRecords.length)}件表示
                    </div>}
                </div>
            </aside>
            <div className={isCreateMode ? "master-editor-pane is-create-mode" : "master-editor-pane"}>
                {currentLoadState === "loading" ? <div className="master-editor-empty">DBからデータを読み込んでいます。</div> : currentLoadState === "error" ? <div className="master-editor-empty">DBに接続できないため編集画面を表示できません。</div> : selectedRecord ? <>
                    {(isAuthor || isPublisher || isMagazine) && <div className={isCreateMode ? "master-editor-mode-banner create-mode" : "master-editor-mode-banner"}>
                        <div>
                            <strong>{isCreateMode ? "新規作成モード" : isSelectedRecordReadOnly ? "申請中の閲覧モード" : "編集モード"}</strong>
                            <span>{isCreateMode ? isMagazine ? "タイトル・読み・出版社がそろうと、その時点でIDを発行して保存します。" : "名前と読みがそろうと、その時点でIDを発行して保存します。" : isSelectedRecordReadOnly ? "このデータは申請中です。編集中に戻すまでここでは修正できません。" : "変更はフィールドごとに自動保存されます。"}</span>
                        </div>
                        {isCreateMode && <button type="button" className="secondary-button" onClick={clearCurrentCreateMode}>
                            やめる
                        </button>}
                    </div>}
                    <fieldset className="master-editor-fieldset" disabled={isSelectedRecordReadOnly}>
                        <div className="master-editor-main-row">
                            <TitleReadingInput titleLabel={isMagazine ? "タイトル" : title} readingLabel="読み" title={selectedRecord.name} reading={selectedRecord.reading} isCompletionEnabled={isMasterReadingCompletionEnabled} isRequired={isMagazine || isAuthor || isPublisher} onCompletionEnabledChange={setIsMasterReadingCompletionEnabled} onTitleChange={(value)=>updatePrimaryRecord("name", value)} onReadingChange={(value)=>updatePrimaryRecord("reading", value)} onTitleBlur={(value)=>handlePrimaryRecordBlur("name", value)} onReadingBlur={(value)=>handlePrimaryRecordBlur("reading", value)}/>
                            {isMagazine && !isCreateMode && <TitleReadingInput titleLabel="タイトル表記ブレ（複数可）" readingLabel="タイトル表記ブレの読み" title={(selectedRecord as MagazineMasterRecord).aliasName} reading={(selectedRecord as MagazineMasterRecord).aliasReading} isCompletionEnabled={isMasterReadingCompletionEnabled} onCompletionEnabledChange={setIsMasterReadingCompletionEnabled} onTitleChange={(value)=>updateMagazineRecord("aliasName", value)} onReadingChange={(value)=>updateMagazineRecord("aliasReading", value)} onTitleBlur={(value)=>commitMagazineRecord("aliasName", value)} onReadingBlur={(value)=>commitMagazineRecord("aliasReading", value)}/>}
                        </div>
                        {isCreateMode && (isAuthor || isPublisher || isMagazine) ? <>
                        <div className="master-create-mode-note">{isMagazine ? "必須項目のタイトル・読み・出版社が確定した時点で保存され、ID が発行されます。「出版社不明」を選んで登録することもできます。" : "必須項目の名前と読みが確定した時点で保存され、ID が発行されます。"}</div>
                        {isMagazine ? <MagazineMasterFields record={selectedRecord as MagazineMasterRecord} publisherOptions={publisherDirectoryOptions} magazineOptions={magazineDirectoryOptions} onUpdate={updateMagazineRecord} onCommit={handleMagazineFieldCommit} readOnly={isSelectedRecordReadOnly}/> : null}
                    </> : isAuthor ? <AuthorMasterFields record={selectedRecord as AuthorMasterRecord} authorOptions={authorDirectoryOptions} onCreateAuthor={createAuthorRecord} onUpdate={updateAuthorRecord} onCommit={commitAuthorRecord} readOnly={isSelectedRecordReadOnly}/> : isPublisher ? <PublisherMasterFields record={selectedRecord as PublisherMasterRecord} publisherOptions={publisherDirectoryOptions} onUpdate={updatePublisherRecord} onCommit={commitPublisherRecord} readOnly={isSelectedRecordReadOnly}/> : <MagazineMasterFields record={selectedRecord as MagazineMasterRecord} publisherOptions={publisherDirectoryOptions} magazineOptions={magazineDirectoryOptions} onUpdate={updateMagazineRecord} onCommit={commitMagazineRecord} readOnly={isSelectedRecordReadOnly}/>}
                    </fieldset>
                </> : <div className="master-editor-empty">候補がありません</div>}
            </div>
        </div>
        {masterDuplicateDialog && <MasterDuplicateDialog dialog={masterDuplicateDialog} onClose={()=>setMasterDuplicateDialog(null)} onOpenExisting={handleOpenDuplicateRecord}/>}
        {deleteBlockedDialog && <DeleteBlockedDialog dialog={deleteBlockedDialog} onClose={()=>setDeleteBlockedDialog(null)}/>}
        {deleteConfirmDialog && <DeleteConfirmDialog dialog={deleteConfirmDialog} onClose={()=>setDeleteConfirmDialog(null)} onConfirm={()=>{
            if (deleteConfirmDialog.kind === "authors") {
                void deleteSelectedAuthorRecord();
                return;
            }
            if (deleteConfirmDialog.kind === "publishers") {
                void deleteSelectedPublisherRecord();
                return;
            }
            void deleteSelectedMagazineRecord();
        }}/>}
        {magazineCsvDownloadDialog && <MagazineCsvDownloadDialog dialog={magazineCsvDownloadDialog} onClose={closeMagazineCsvDownloadDialog} onToggleColumn={toggleMagazineCsvDownloadColumn} onModeChange={updateMagazineCsvDownloadMode} onDownload={executeMagazineCsvDownload}/>}
        {magazineCsvHelpDialog && <MagazineCsvHelpDialog onClose={closeMagazineCsvHelpDialog}/>}
        {magazineCsvUploadDialog && <MagazineCsvUploadDialog dialog={magazineCsvUploadDialog} onClose={closeMagazineCsvUploadDialog} onCommit={()=>void executeMagazineCsvUpload()}/>}
        {authorCsvDownloadDialog && <AuthorCsvDownloadDialog dialog={authorCsvDownloadDialog} onClose={closeAuthorCsvDownloadDialog} onToggleColumn={toggleAuthorCsvDownloadColumn} onModeChange={updateAuthorCsvDownloadMode} onDownload={executeAuthorCsvDownload}/>}
        {authorCsvHelpDialog && <AuthorCsvHelpDialog onClose={closeAuthorCsvHelpDialog}/>}
        {authorCsvUploadDialog && <AuthorCsvUploadDialog dialog={authorCsvUploadDialog} onClose={closeAuthorCsvUploadDialog} onCommit={()=>void executeAuthorCsvUpload()}/>}
        {publisherCsvDownloadDialog && <PublisherCsvDownloadDialog dialog={publisherCsvDownloadDialog} onClose={closePublisherCsvDownloadDialog} onToggleColumn={togglePublisherCsvDownloadColumn} onModeChange={updatePublisherCsvDownloadMode} onDownload={executePublisherCsvDownload}/>}
        {publisherCsvHelpDialog && <PublisherCsvHelpDialog onClose={closePublisherCsvHelpDialog}/>}
        {publisherCsvUploadDialog && <PublisherCsvUploadDialog dialog={publisherCsvUploadDialog} onClose={closePublisherCsvUploadDialog} onCommit={()=>void executePublisherCsvUpload()}/>}
    </section>
    </FileDropOverlay>;
}
function AuthorMasterFields({ record, authorOptions, onCreateAuthor, onUpdate, onCommit, readOnly = false }: {
    record: AuthorMasterRecord;
    authorOptions: AutocompleteOption[];
    onCreateAuthor: (name: string, reading: string)=>Promise<AuthorMasterRecord | null>;
    onUpdate: (field: keyof AuthorMasterRecord, value: string | string[])=>void;
    onCommit: (field: keyof AuthorMasterRecord, value: string | string[])=>void;
    readOnly?: boolean;
}) {
    return <div className="master-editor-grid">
        <div className="master-wide-field inline-labeled-field author-alias-field">
            <span className="inline-field-label">別名義</span>
            <AuthorAliasInput value={record.otherAuthorIds} options={authorOptions} onCreateAuthor={onCreateAuthor} readOnly={readOnly} onChange={(value)=>{
                onUpdate("otherAuthorIds", value);
                onCommit("otherAuthorIds", value);
            }}/>
        </div>
        <div className="master-wide-field inline-labeled-field master-tag-field">
            <span className="inline-field-label">タグ</span>
            <TagInput tags={record.tag} readOnly={readOnly} onChange={(tags)=>{
                onUpdate("tag", tags);
                onCommit("tag", tags);
            }} placeholder="タグを入力"/>
        </div>
        <label className="master-wide-field inline-labeled-field master-note-field">
            <span className="inline-field-label">メモ</span>
            <textarea value={record.memo} readOnly={readOnly} placeholder="通常検索対象外" onChange={(event)=>onUpdate("memo", event.target.value)} onBlur={(event)=>onCommit("memo", event.currentTarget.value)}/>
        </label>
        <div className="field-badge-wrap master-standard-field master-wide-field social-links-field">
            <span className="field-badge">SNS</span>
            <SocialLinksTable value={record.socialLinks} readOnly={readOnly} onChange={(value)=>{
                onUpdate("socialLinks", value);
                onCommit("socialLinks", value);
            }}/>
        </div>
    </div>;
}
function PublisherMasterFields({ record, publisherOptions, onUpdate, onCommit, readOnly = false }: {
    record: PublisherMasterRecord;
    publisherOptions: AutocompleteOption[];
    onUpdate: (field: keyof PublisherMasterRecord, value: string | string[])=>void;
    onCommit: (field: keyof PublisherMasterRecord, value: string | string[])=>void;
    readOnly?: boolean;
}) {
    return <div className="master-editor-grid">
        <label className="master-wide-field inline-labeled-field publisher-inline-field publisher-address-field">
            <span className="inline-field-label">住所</span>
            <input value={record.address} readOnly={readOnly} placeholder="住所" onChange={(event)=>onUpdate("address", event.target.value)} onBlur={(event)=>onCommit("address", event.currentTarget.value)}/>
        </label>
        <label className="master-wide-field inline-labeled-field publisher-inline-field publisher-url-field">
            <span className="inline-field-label">URL</span>
            <input value={record.url} readOnly={readOnly} placeholder="公式URL" onChange={(event)=>onUpdate("url", event.target.value)} onBlur={(event)=>onCommit("url", event.currentTarget.value)}/>
        </label>
        <label className="inline-labeled-field publisher-inline-field">
            <span className="inline-field-label">設立日</span>
            <input value={record.startDate} readOnly={readOnly} placeholder="YYYY-MM-DD" onChange={(event)=>onUpdate("startDate", event.target.value)} onBlur={(event)=>onCommit("startDate", event.currentTarget.value)}/>
        </label>
        <label className="inline-labeled-field publisher-inline-field">
            <span className="inline-field-label">終了日</span>
            <input value={record.endDate} readOnly={readOnly} placeholder="YYYY-MM-DD" onChange={(event)=>onUpdate("endDate", event.target.value)} onBlur={(event)=>onCommit("endDate", event.currentTarget.value)}/>
        </label>
        <div className="master-wide-field inline-labeled-field related-publisher-field">
            <span className="inline-field-label">関連会社</span>
            <MasterListSelectionInput value={record.relatedPublishers} options={publisherOptions} idKey="publisher_id" keyKey="publisher_key" placeholder="関連会社を入力" label="関連会社" roleOptions={relatedPublisherRoleOptions} autoCommitDefaultRole={true} autoCommitRoleValue="" readOnly={readOnly} onChange={(value)=>{
                onUpdate("relatedPublishers", value);
                onCommit("relatedPublishers", value);
            }}/>
        </div>
        <div className="master-wide-field inline-labeled-field publisher-inline-field master-tag-field">
            <span className="inline-field-label">タグ</span>
            <TagInput tags={record.tag} readOnly={readOnly} onChange={(tags)=>{
                onUpdate("tag", tags);
                onCommit("tag", tags);
            }} placeholder="タグを入力"/>
        </div>
        <label className="master-wide-field inline-labeled-field publisher-inline-field master-note-field">
            <span className="inline-field-label">メモ</span>
            <textarea value={record.memo} readOnly={readOnly} placeholder="通常検索対象外" onChange={(event)=>onUpdate("memo", event.target.value)} onBlur={(event)=>onCommit("memo", event.currentTarget.value)}/>
        </label>
        <div className="field-badge-wrap master-standard-field master-wide-field related-url-field">
            <span className="field-badge">関連URL</span>
            <RelatedUrlTable value={record.relatedLink} readOnly={readOnly} onChange={(value)=>{
                onUpdate("relatedLink", value);
                onCommit("relatedLink", value);
            }}/>
        </div>
    </div>;
}
function MagazineMasterFields({ record, publisherOptions, magazineOptions, onUpdate, onCommit, readOnly = false }: {
    record: MagazineMasterRecord;
    publisherOptions: AutocompleteOption[];
    magazineOptions: AutocompleteOption[];
    onUpdate: (field: keyof MagazineMasterRecord, value: string | string[])=>void;
    onCommit: (field: keyof MagazineMasterRecord, value: string | string[])=>void;
    readOnly?: boolean;
}) {
    return <div className="master-editor-grid magazine-master-grid">
        <div className="master-wide-field inline-labeled-field required-field magazine-inline-field magazine-master-selection-field">
            <span className="inline-field-label">出版社</span>
            <MasterListSelectionInput value={record.publishers} options={publisherOptions} idKey="publisher_id" keyKey="publisher_key" placeholder="出版社を入力" label="出版社" defaultRole="発行" autoCommitDefaultRole={true} readOnly={readOnly} roleOptions={[
                "発行",
                "発売",
                "編集"
            ]} onChange={(value)=>{
                onUpdate("publishers", value);
                onCommit("publishers", value);
            }}/>
        </div>
        <div className="master-wide-field inline-labeled-field magazine-inline-field master-tag-field magazine-frequency-field">
            <span className="inline-field-label">刊行頻度</span>
            <TagInput tags={record.publicationFrequency} readOnly={readOnly} onChange={(tags)=>{
                onUpdate("publicationFrequency", tags);
                onCommit("publicationFrequency", tags);
            }} placeholder={`刊行頻度を入力（${publicationFrequencyOptions.slice(0, 3).join("・")}）`}/>
        </div>
        <label className="inline-labeled-field magazine-inline-field">
            <span className="inline-field-label">創刊日</span>
            <input value={record.firstPublishedDate} readOnly={readOnly} placeholder="YYYY / YYYY-MM / YYYY-MM-DD" onChange={(event)=>onUpdate("firstPublishedDate", event.target.value)} onBlur={(event)=>onCommit("firstPublishedDate", event.currentTarget.value)}/>
        </label>
        <label className="inline-labeled-field magazine-inline-field">
            <span className="inline-field-label">休刊日</span>
            <input value={record.closedDate} readOnly={readOnly} placeholder="YYYY / YYYY-MM / YYYY-MM-DD" onChange={(event)=>onUpdate("closedDate", event.target.value)} onBlur={(event)=>onCommit("closedDate", event.currentTarget.value)}/>
        </label>
        <label className="inline-labeled-field magazine-inline-field">
            <span className="inline-field-label">ISSN</span>
            <input value={record.issn} readOnly={readOnly} placeholder="0000-0000" onChange={(event)=>onUpdate("issn", event.target.value)} onBlur={(event)=>onCommit("issn", event.currentTarget.value)}/>
        </label>
        <label className="inline-labeled-field magazine-inline-field">
            <span className="inline-field-label">JPNO</span>
            <input value={record.jpno} readOnly={readOnly} placeholder="JPNO" onChange={(event)=>onUpdate("jpno", event.target.value)} onBlur={(event)=>onCommit("jpno", event.currentTarget.value)}/>
        </label>
        <div className="master-wide-field inline-labeled-field magazine-inline-field related-publisher-field">
            <span className="inline-field-label">関連誌</span>
            <MasterListSelectionInput value={record.relatedMagazines} options={magazineOptions} idKey="magazine_id" keyKey="magazine_key" placeholder="関連誌を入力" label="関連誌" roleOptions={magazineRelationRoleOptions} autoCommitDefaultRole={true} allowUnregistered={true} readOnly={readOnly} onChange={(value)=>{
                onUpdate("relatedMagazines", value);
                onCommit("relatedMagazines", value);
            }}/>
        </div>
        <label className="master-wide-field inline-labeled-field magazine-inline-field master-note-field">
            <span className="inline-field-label">関係補足</span>
            <textarea value={record.relationNote} readOnly={readOnly} placeholder="関連誌についての補足" onChange={(event)=>onUpdate("relationNote", event.target.value)} onBlur={(event)=>onCommit("relationNote", event.currentTarget.value)}/>
        </label>
        <div className="master-wide-field inline-labeled-field magazine-inline-field master-tag-field">
            <span className="inline-field-label">タグ</span>
            <TagInput tags={record.tag} readOnly={readOnly} onChange={(tags)=>{
                onUpdate("tag", tags);
                onCommit("tag", tags);
            }} placeholder="タグを入力"/>
        </div>
        <label className="master-wide-field inline-labeled-field magazine-inline-field master-note-field">
            <span className="inline-field-label">メモ</span>
            <textarea value={record.memo} readOnly={readOnly} placeholder="通常検索対象外" onChange={(event)=>onUpdate("memo", event.target.value)} onBlur={(event)=>onCommit("memo", event.currentTarget.value)}/>
        </label>
    </div>;
}
function isMasterView(view: ViewKey): view is MasterEditorKind {
    return view === "magazines" || view === "authors" || view === "publishers";
}
