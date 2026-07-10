"use client";

import { CircleUserRound, CircleX, ClipboardCheck, LockKeyhole, LogOut, MessageSquareText, RotateCcw, Send, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applicationActionLabelMap,
  applicationStatusLabelMap,
  formatApplicationUpdatedAt,
  type ApplicationRequestAction,
  type ApplicationRequestListItem,
  type ApplicationRequestListResponse,
  type ApplicationRequestStatus,
} from "../lib/application-requests";
import { type MessageThreadListResponse, type MessageThreadRecord } from "../lib/message-threads";
import { isDatabaseUnavailableApiError, resolveApiErrorRouteKind } from "../lib/database-error";
import { DropdownMenu, type DropdownMenuItem } from "./dropdown-menu";

type AccountPanel = "account";
type ApplicationDialogMode = "application_list" | "application_history" | "application_submit";
type ReviewOperation = "approve" | "reject" | "hold";
type MessageDialogTab = "general" | "application";

type WorkItem = {
  id: string;
  kind: string;
  title: string;
  parent: string;
  updatedAt: string;
  status: ApplicationRequestStatus;
  requester?: string;
  action: ApplicationRequestAction;
  routePath: string;
  dependencyGroupId: string;
  dependencyGroupLabel: string;
  dependsOnRequestIds: string[];
  dependsOnTitles: string[];
  groupSize: number;
  reviewerNote: string;
  reviewedAt: string;
  summaryItems: string[];
  changedFieldLabels: string[];
  policyNote: string;
};

type ApplicationGroup = {
  id: string;
  label: string;
  items: WorkItem[];
  requester: string;
  updatedAt: string;
};

type ApplicationGroupSummary = {
  summaryItems: string[];
  changedFieldLabels: string[];
  dependencyTitles: string[];
  policyNote: string;
  actionLabels: string[];
};

type MessageEntry = {
  id: string;
  type: "text" | "system";
  author: string;
  body: string;
  time: string;
};

type MessageThreadPreview = {
  id: string;
  kind: MessageDialogTab;
  title: string;
  subtitle: string;
  updatedAt: string;
  unreadCount: number;
  accent: "general" | "application";
  messages: MessageEntry[];
  lastMessagePreview?: string;
  isClosed?: boolean;
  canManage?: boolean;
};

type MessageThreadSummaryItem = {
  label: string;
  value: string;
  tone?: "general" | "application" | "muted";
};

type MessageDialogSize = {
  width: number;
  height: number;
};

const getThreadKindLabel = (thread: MessageThreadPreview) => (
  thread.kind === "application" ? "申請・認証" : "一般"
);

const getThreadStateLabel = (thread: MessageThreadPreview) => (
  thread.isClosed ? "クローズ" : thread.kind === "application" ? "進行中" : "オープン"
);

const getThreadPreviewText = (thread: MessageThreadPreview) => {
  const preview = thread.lastMessagePreview?.trim() || thread.messages[thread.messages.length - 1]?.body?.trim() || "";
  if (!preview) {
    return thread.kind === "application"
      ? "まだ補足コメントはありません。"
      : "まだメッセージはありません。";
  }
  return preview;
};

const getThreadActionHint = (thread: MessageThreadPreview, currentUser: AccountMenuProps["currentUser"]) => {
  if (thread.isClosed) {
    return thread.canManage ? "現在は返信停止中です。必要なら再開できます。" : "このスレッドは現在クローズされています。";
  }
  if (thread.kind === "application") {
    return currentUser?.role === "super_admin"
      ? "admin が確認し、補足コメントや close/reopen を行えます。"
      : "補足コメントを返しながら、admin の確認を待つスレッドです。";
  }
  return "全員向けの共有連絡スレッドです。";
};

const buildThreadSummaryItems = (thread: MessageThreadPreview, currentUser: AccountMenuProps["currentUser"]): MessageThreadSummaryItem[] => [
  {
    label: "種別",
    value: getThreadKindLabel(thread),
    tone: thread.kind === "application" ? "application" : "general",
  },
  {
    label: "現在の状態",
    value: getThreadStateLabel(thread),
    tone: thread.isClosed ? "muted" : thread.kind === "application" ? "application" : "general",
  },
  {
    label: "対象",
    value: thread.subtitle || (thread.kind === "application" ? "申請スレッド" : "全体共有スレッド"),
  },
  {
    label: "次の見どころ",
    value: getThreadActionHint(thread, currentUser),
  },
];

const buildDefaultApprovalMessage = (group: ApplicationGroup) => {
  const titles = Array.from(new Set(group.items.map((item) => item.title).filter(Boolean)));
  const subject = titles.length > 0 ? titles.join("、") : group.label;
  return `${subject}を認証しました`;
};

const buildApplicationGroupSummary = (group: ApplicationGroup): ApplicationGroupSummary => {
  const summaryItemMap = new Map<string, number>();
  const changedFieldSet = new Set<string>();
  const dependencyTitleSet = new Set<string>();
  const actionLabelSet = new Set<string>();
  let policyNote = "";

  for (const item of group.items) {
    actionLabelSet.add(applicationActionLabelMap[item.action]);
    for (const summaryItem of item.summaryItems) {
      const match = summaryItem.match(/^(.*)\s+(\d+)件$/);
      if (!match) {
        summaryItemMap.set(summaryItem, (summaryItemMap.get(summaryItem) ?? 0) + 1);
        continue;
      }
      const label = match[1] ?? summaryItem;
      const count = Number(match[2] ?? "0") || 0;
      summaryItemMap.set(label, (summaryItemMap.get(label) ?? 0) + count);
    }
    for (const fieldLabel of item.changedFieldLabels) {
      changedFieldSet.add(fieldLabel);
    }
    for (const dependencyTitle of item.dependsOnTitles) {
      if (dependencyTitle) dependencyTitleSet.add(dependencyTitle);
    }
    if (!policyNote && item.policyNote) {
      policyNote = item.policyNote;
    }
  }

  return {
    summaryItems: Array.from(summaryItemMap.entries()).map(([label, count]) => `${label} ${count}件`),
    changedFieldLabels: Array.from(changedFieldSet),
    dependencyTitles: Array.from(dependencyTitleSet),
    policyNote,
    actionLabels: Array.from(actionLabelSet),
  };
};

const mapGeneralThreadRecord = (thread: MessageThreadRecord): MessageThreadPreview => ({
  id: thread.id,
  kind: "general",
  title: thread.title,
  subtitle: thread.subtitle,
  updatedAt: thread.updatedAt,
  unreadCount: thread.unreadCount,
  accent: "general",
  lastMessagePreview: thread.lastMessagePreview,
  isClosed: thread.isClosed,
  canManage: thread.canManage,
  messages: thread.messages.map((message) => ({
    id: message.id,
    type: message.type,
    author: message.authorDisplayName || message.authorLoginName || "system",
    body: message.body,
    time: message.time,
  })),
});

const mapApplicationThreadRecord = (thread: MessageThreadRecord): MessageThreadPreview => ({
  id: thread.id,
  kind: "application",
  title: thread.title,
  subtitle: thread.subtitle,
  updatedAt: thread.updatedAt,
  unreadCount: thread.unreadCount,
  accent: "application",
  lastMessagePreview: thread.lastMessagePreview,
  isClosed: thread.isClosed,
  canManage: thread.canManage,
  messages: thread.messages.map((message) => ({
    id: message.id,
    type: message.type,
    author: message.authorDisplayName || message.authorLoginName || "system",
    body: message.body,
    time: message.time,
  })),
});

const applicationActionToneMap = {
  create: "create",
  update: "update",
  delete: "delete",
} as const;

type AccountMenuProps = {
  isLoggedIn: boolean;
  currentUser: {
    loginName: string;
    displayName: string;
    role: "super_admin" | "expert" | "viewer";
  } | null;
  onLoginRequest: () => void;
  onLogout: () => void;
  onOpenHistory: () => void;
  onDatabaseUnavailable: () => void;
};

const roleLabelMap = {
  super_admin: "超管理人",
  expert: "編集者",
  viewer: "回覧のみ",
} as const;

const mapListItemToWorkItem = (item: ApplicationRequestListItem): WorkItem => ({
  id: item.requestId,
  kind: item.kind,
  title: item.title,
  parent: item.parent,
  updatedAt: item.updatedAt,
  status: item.status,
  requester: item.requester,
  action: item.action,
  routePath: item.routePath,
  dependencyGroupId: item.dependencyGroupId,
  dependencyGroupLabel: item.dependencyGroupLabel,
  dependsOnRequestIds: item.dependsOnRequestIds,
  dependsOnTitles: item.dependsOnTitles,
  groupSize: item.groupSize,
  reviewerNote: item.reviewerNote,
  reviewedAt: item.reviewedAt,
  summaryItems: item.summaryItems,
  changedFieldLabels: item.changedFieldLabels,
  policyNote: item.policyNote,
});

const buildDependencyWarnings = (selectedDraftIds: string[], draftItems: WorkItem[], submittedItems: WorkItem[]) => {
  const selectedIds = new Set(selectedDraftIds);
  const submittedIds = new Set(submittedItems.map((item) => item.id));
  const draftById = new Map(draftItems.map((item) => [item.id, item]));
  return selectedDraftIds.flatMap((requestId) => {
    const item = draftById.get(requestId);
    if (!item || item.dependsOnRequestIds.length === 0) return [];
    const unresolvedDependencies = item.dependsOnRequestIds.filter((dependencyId) => !submittedIds.has(dependencyId) && !selectedIds.has(dependencyId));
    if (unresolvedDependencies.length === 0) return [];
    const unresolvedTitles = unresolvedDependencies.map((dependencyId) => {
      const dependencyItem = draftById.get(dependencyId) ?? submittedItems.find((candidate) => candidate.id === dependencyId);
      return dependencyItem?.title || dependencyId;
    });
    return [`「${item.title}」は、${unresolvedTitles.join(" / ")} を同時に選択してください。`];
  });
};

const buildApplicationGroups = (items: WorkItem[]): ApplicationGroup[] => {
  const groups = new Map<string, ApplicationGroup>();
  for (const item of items) {
    const groupId = item.dependencyGroupId || item.id;
    const group = groups.get(groupId) ?? {
      id: groupId,
      label: item.dependencyGroupLabel || item.parent || item.title,
      items: [],
      requester: item.requester ?? "",
      updatedAt: item.updatedAt,
    };
    group.items.push(item);
    if (item.updatedAt > group.updatedAt) {
      group.updatedAt = item.updatedAt;
    }
    if (!group.requester && item.requester) {
      group.requester = item.requester;
    }
    groups.set(groupId, group);
  }
  return Array.from(groups.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt, "ja"));
};

export function AccountMenu({ isLoggedIn, currentUser, onLoginRequest, onLogout, onOpenHistory, onDatabaseUnavailable }: AccountMenuProps) {
  const [activePanel, setActivePanel] = useState<AccountPanel | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [historyItems, setHistoryItems] = useState<WorkItem[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [applicationDialogMode, setApplicationDialogMode] = useState<ApplicationDialogMode | null>(null);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageDialogTab, setMessageDialogTab] = useState<MessageDialogTab>("general");
  const [generalMessageThreads, setGeneralMessageThreads] = useState<MessageThreadPreview[]>([]);
  const [applicationMessageThreads, setApplicationMessageThreads] = useState<MessageThreadPreview[]>([]);
  const [isLoadingGeneralMessages, setIsLoadingGeneralMessages] = useState(false);
  const [isLoadingApplicationMessages, setIsLoadingApplicationMessages] = useState(false);
  const [generalMessageError, setGeneralMessageError] = useState("");
  const [applicationMessageError, setApplicationMessageError] = useState("");
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [isAccountAlertPulsing, setIsAccountAlertPulsing] = useState(false);
  const isSuperAdmin = currentUser?.role === "super_admin";
  const canUseMessages = currentUser?.role === "super_admin" || currentUser?.role === "expert";
  const previousPendingReviewCountRef = useRef(0);
  const throwIfDbUnavailable = (response: { status: number }, body?: { error?: string; code?: string } | null, fallbackMessage = "データベースに接続できません。") => {
    const routeKind = resolveApiErrorRouteKind(response, body);
    if (routeKind !== "db-unavailable") return;
    onDatabaseUnavailable();
    throw new Error(body?.error || fallbackMessage);
  };

  const loadApplicationItems = async () => {
    if (!isLoggedIn || !currentUser) {
      setWorkItems([]);
      setHistoryItems([]);
      setSelectedDraftIds([]);
      setApplicationError("");
      return;
    }
    setIsLoadingApplications(true);
    try {
      const [activeResponse, historyResponse] = await Promise.all([
        fetch("/api/application-requests", { cache: "no-store" }),
        fetch("/api/application-requests?view=history", { cache: "no-store" }),
      ]);
      const activeBody = await activeResponse.json() as ApplicationRequestListResponse;
      const historyBody = await historyResponse.json() as ApplicationRequestListResponse;
      throwIfDbUnavailable(activeResponse, activeBody, "申請データを読み込めませんでした。");
      throwIfDbUnavailable(historyResponse, historyBody, "申請履歴を読み込めませんでした。");
      if (!activeResponse.ok) {
        throw new Error(activeBody.error || "申請データを読み込めませんでした。");
      }
      if (!historyResponse.ok) {
        throw new Error(historyBody.error || "申請履歴を読み込めませんでした。");
      }
      const nextItems = (activeBody.items ?? []).map(mapListItemToWorkItem);
      const nextHistoryItems = (historyBody.items ?? []).map(mapListItemToWorkItem);
      setWorkItems(nextItems);
      setHistoryItems(nextHistoryItems);
      setSelectedDraftIds((currentSelectedIds) => currentSelectedIds.filter((id) => nextItems.some((item) => item.id === id && item.status === "draft")));
      setApplicationError("");
    } catch (error) {
      setWorkItems([]);
      setHistoryItems([]);
      setSelectedDraftIds([]);
      setApplicationError(error instanceof Error ? error.message : "申請データを読み込めませんでした。");
    } finally {
      setIsLoadingApplications(false);
    }
  };

  const loadGeneralMessages = async () => {
    if (!isLoggedIn || !currentUser || !canUseMessages) {
      setGeneralMessageThreads([]);
      setGeneralMessageError("");
      return;
    }
    setIsLoadingGeneralMessages(true);
    try {
      const response = await fetch("/api/messages?threadType=general", { cache: "no-store" });
      const body = await response.json() as MessageThreadListResponse;
      throwIfDbUnavailable(response, body, "メッセージを読み込めませんでした。");
      if (!response.ok) {
        throw new Error(body.error || "メッセージを読み込めませんでした。");
      }
      setGeneralMessageThreads((body.threads ?? []).map(mapGeneralThreadRecord));
      setGeneralMessageError("");
    } catch (error) {
      setGeneralMessageThreads([]);
      setGeneralMessageError(error instanceof Error ? error.message : "メッセージを読み込めませんでした。");
    } finally {
      setIsLoadingGeneralMessages(false);
    }
  };

  const loadApplicationMessages = async () => {
    if (!isLoggedIn || !currentUser || !canUseMessages) {
      setApplicationMessageThreads([]);
      setApplicationMessageError("");
      return;
    }
    setIsLoadingApplicationMessages(true);
    try {
      const response = await fetch("/api/messages?threadType=application", { cache: "no-store" });
      const body = await response.json() as MessageThreadListResponse;
      throwIfDbUnavailable(response, body, "申請メッセージを読み込めませんでした。");
      if (!response.ok) {
        throw new Error(body.error || "申請メッセージを読み込めませんでした。");
      }
      setApplicationMessageThreads((body.threads ?? []).map(mapApplicationThreadRecord));
      setApplicationMessageError("");
    } catch (error) {
      setApplicationMessageThreads([]);
      setApplicationMessageError(error instanceof Error ? error.message : "申請メッセージを読み込めませんでした。");
    } finally {
      setIsLoadingApplicationMessages(false);
    }
  };

  useEffect(() => {
    void loadApplicationItems();
  }, [isLoggedIn, currentUser?.loginName, currentUser?.role]);

  useEffect(() => {
    if (!messageDialogOpen || messageDialogTab !== "general") return;
    void loadGeneralMessages();
  }, [messageDialogOpen, messageDialogTab, isLoggedIn, currentUser?.loginName, currentUser?.role]);

  useEffect(() => {
    if (!messageDialogOpen || messageDialogTab !== "application") return;
    void loadApplicationMessages();
  }, [messageDialogOpen, messageDialogTab, isLoggedIn, currentUser?.loginName, currentUser?.role]);

  const draftItems = useMemo(() => workItems.filter((item) => item.status === "draft"), [workItems]);
  const submittedItems = useMemo(() => workItems.filter((item) => item.status === "submitted" || item.status === "on_hold"), [workItems]);
  const applicationHistoryItems = useMemo(() => historyItems, [historyItems]);
  const adminReviewGroups = useMemo(() => buildApplicationGroups(submittedItems), [submittedItems]);
  const selectedDraftDependencyWarnings = useMemo(
    () => buildDependencyWarnings(selectedDraftIds, draftItems, submittedItems),
    [draftItems, selectedDraftIds, submittedItems],
  );
  const selectedDraftCount = selectedDraftIds.filter((id) => draftItems.some((item) => item.id === id)).length;
  const areAllDraftsSelected = draftItems.length > 0 && draftItems.every((item) => selectedDraftIds.includes(item.id));
  const pendingReviewCount = isSuperAdmin ? submittedItems.length : 0;

  useEffect(() => {
    if (!isSuperAdmin) {
      previousPendingReviewCountRef.current = 0;
      setIsAccountAlertPulsing(false);
      return;
    }
    if (pendingReviewCount > previousPendingReviewCountRef.current) {
      setIsAccountAlertPulsing(true);
      const timeout = window.setTimeout(() => setIsAccountAlertPulsing(false), 4200);
      previousPendingReviewCountRef.current = pendingReviewCount;
      return () => window.clearTimeout(timeout);
    }
    previousPendingReviewCountRef.current = pendingReviewCount;
  }, [isSuperAdmin, pendingReviewCount]);

  const toggleDraftSelection = (id: string) => {
    setSelectedDraftIds((ids) => (ids.includes(id) ? ids.filter((itemId) => itemId !== id) : [...ids, id]));
  };

  const toggleAllDraftSelections = () => {
    setSelectedDraftIds(areAllDraftsSelected ? [] : draftItems.map((item) => item.id));
  };

  const submitSelectedDrafts = async (submitterNote: string) => {
    if (selectedDraftIds.length === 0) return;
    const response = await fetch("/api/application-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "submit",
        requestIds: selectedDraftIds,
        submitterNote,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "申請に失敗しました。" })) as { error?: string };
      throwIfDbUnavailable(response, body, "申請に失敗しました。");
      setApplicationError(body.error || "申請に失敗しました。");
      return;
    }
    setSelectedDraftIds([]);
    setApplicationDialogMode("application_list");
    await loadApplicationItems();
  };

  const withdrawSubmission = async (id: string) => {
    const response = await fetch("/api/application-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "withdraw",
        requestIds: [id],
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "申請を編集中へ戻せませんでした。" })) as { error?: string };
      throwIfDbUnavailable(response, body, "申請を編集中へ戻せませんでした。");
      setApplicationError(body.error || "申請を編集中へ戻せませんでした。");
      return;
    }
    setApplicationDialogMode("application_submit");
    await loadApplicationItems();
  };

  const reviewApplicationGroup = async (requestIds: string[], operation: ReviewOperation, reviewerNote: string) => {
    const response = await fetch("/api/application-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation,
        requestIds,
        reviewerNote,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "申請レビューに失敗しました。" })) as { error?: string };
      throwIfDbUnavailable(response, body, "申請レビューに失敗しました。");
      setApplicationError(body.error || "申請レビューに失敗しました。");
      return false;
    }
    await loadApplicationItems();
    return true;
  };

  const createGeneralMessageThread = async (title: string, body: string) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "create_thread",
        title,
        body,
      }),
    });
    const responseBody = await response.json().catch(() => ({ error: "スレッドを作成できませんでした。" })) as MessageThreadListResponse;
    throwIfDbUnavailable(response, responseBody, "スレッドを作成できませんでした。");
    if (!response.ok) {
      throw new Error(responseBody.error || "スレッドを作成できませんでした。");
    }
    setGeneralMessageThreads((responseBody.threads ?? []).map(mapGeneralThreadRecord));
    setGeneralMessageError("");
  };

  const postGeneralMessage = async (threadId: string, body: string) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "post_message",
        threadId,
        body,
      }),
    });
    const responseBody = await response.json().catch(() => ({ error: "メッセージを送信できませんでした。" })) as MessageThreadListResponse;
    throwIfDbUnavailable(response, responseBody, "メッセージを送信できませんでした。");
    if (!response.ok) {
      throw new Error(responseBody.error || "メッセージを送信できませんでした。");
    }
    setGeneralMessageThreads((responseBody.threads ?? []).map(mapGeneralThreadRecord));
    setGeneralMessageError("");
  };

  const postApplicationMessage = async (threadId: string, body: string) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "post_message",
        threadId,
        threadType: "application",
        body,
      }),
    });
    const responseBody = await response.json().catch(() => ({ error: "申請メッセージを送信できませんでした。" })) as MessageThreadListResponse;
    throwIfDbUnavailable(response, responseBody, "申請メッセージを送信できませんでした。");
    if (!response.ok) {
      throw new Error(responseBody.error || "申請メッセージを送信できませんでした。");
    }
    setApplicationMessageThreads((responseBody.threads ?? []).map(mapApplicationThreadRecord));
    setApplicationMessageError("");
  };

  const toggleMessageThreadClosed = async (threadId: string, threadType: MessageDialogTab, isClosed: boolean) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "toggle_thread_closed",
        threadId,
        threadType,
        isClosed,
      }),
    });
    const responseBody = await response.json().catch(() => ({ error: "スレッド状態を更新できませんでした。" })) as MessageThreadListResponse;
    throwIfDbUnavailable(response, responseBody, "スレッド状態を更新できませんでした。");
    if (!response.ok) {
      throw new Error(responseBody.error || "スレッド状態を更新できませんでした。");
    }
    if (threadType === "general") {
      setGeneralMessageThreads((responseBody.threads ?? []).map(mapGeneralThreadRecord));
      setGeneralMessageError("");
      return;
    }
    setApplicationMessageThreads((responseBody.threads ?? []).map(mapApplicationThreadRecord));
    setApplicationMessageError("");
  };

  const markGeneralThreadRead = async (threadId: string, lastMessageId: string) => {
    if (!threadId || !lastMessageId) return;
    setGeneralMessageThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, unreadCount: 0 } : thread));
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "mark_read",
        threadId,
        lastMessageId,
      }),
    }).catch(() => undefined);
    if (!response) return;
    const body = await response.json().catch(() => ({ error: "既読更新に失敗しました。" })) as { error?: string; code?: string };
    if (isDatabaseUnavailableApiError(response, body)) {
      onDatabaseUnavailable();
    }
  };

  const markApplicationThreadRead = async (threadId: string, lastMessageId: string) => {
    if (!threadId || !lastMessageId) return;
    setApplicationMessageThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, unreadCount: 0 } : thread));
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "mark_read",
        threadId,
        lastMessageId,
      }),
    }).catch(() => undefined);
    if (!response) return;
    const body = await response.json().catch(() => ({ error: "既読更新に失敗しました。" })) as { error?: string; code?: string };
    if (isDatabaseUnavailableApiError(response, body)) {
      onDatabaseUnavailable();
    }
  };

  const handleLogout = () => {
    setActivePanel(null);
    onLogout();
  };

  return (
    <div className="account-menu-wrap">
      {isLoggedIn ? (
        <DropdownMenu
          align="end"
          menuClassName="account-dropdown"
          items={[
            {
              id: "account",
              label: "アカウント情報",
              icon: <UserRound size={17} />,
              onSelect: () => setActivePanel("account"),
            },
            ...(canUseMessages
              ? [{
                  id: "messages",
                  label: "メッセージ",
                  icon: <MessageSquareText size={17} />,
                  onSelect: () => setMessageDialogOpen(true),
                } satisfies DropdownMenuItem]
              : []),
            {
              id: "applications",
              label: "申請",
              icon: <ClipboardCheck size={17} />,
              children: [
                {
                  id: "application-list",
                  label: `申請リスト一覧 (${isSuperAdmin ? adminReviewGroups.length : submittedItems.length})`,
                  onSelect: () => setApplicationDialogMode("application_list"),
                },
                {
                  id: "application-history",
                  label: `申請の履歴 (${applicationHistoryItems.length})`,
                  onSelect: () => setApplicationDialogMode("application_history"),
                },
                ...(isSuperAdmin
                  ? []
                  : ([
                      { id: "divider-application", kind: "separator" as const },
                      {
                        id: "application-submit",
                        label: `データの申請 (${draftItems.length})`,
                        onSelect: () => setApplicationDialogMode("application_submit"),
                      },
                    ] satisfies DropdownMenuItem[])),
              ],
            },
            {
              id: "history",
              label: "操作履歴",
              icon: <RotateCcw size={17} />,
              onSelect: onOpenHistory,
            },
            { id: "divider-1", kind: "separator" },
            {
              id: "logout",
              label: "ログアウト",
              icon: <LogOut size={17} />,
              danger: true,
              onSelect: handleLogout,
            },
          ] satisfies DropdownMenuItem[]}
          trigger={({ toggle, buttonRef, ariaProps }) => (
            <button
              ref={buttonRef}
              className={`account-pill${isSuperAdmin && pendingReviewCount > 0 ? " admin-alert" : ""}${isAccountAlertPulsing ? " pulse" : ""}`}
              aria-label="アカウント"
              onClick={toggle}
              {...ariaProps}
            >
              <CircleUserRound size={20} />
              <span className="account-label">{currentUser?.loginName ?? "account"}</span>
              {isSuperAdmin && pendingReviewCount > 0 && (
                <span className="account-pill-count" aria-label={`未処理申請 ${pendingReviewCount}件`}>
                  {pendingReviewCount}
                </span>
              )}
            </button>
          )}
        />
      ) : (
        <button className="account-pill" aria-label="ログイン" onClick={onLoginRequest}>
          <LockKeyhole size={18} />
          <span className="account-label">ログイン</span>
        </button>
      )}

      {isLoggedIn && activePanel === "account" && (
        <div className="account-work-panel" role="dialog" aria-label="アカウント情報">
          <div className="account-work-panel-head">
            <div className="account-work-panel-head-title">
              <strong>アカウント情報</strong>
              <span>ログイン中のユーザー</span>
            </div>
            <div className="account-work-panel-head-actions">
              <button className="icon-button small" type="button" aria-label="閉じる" onClick={() => setActivePanel(null)}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="account-info-panel">
            <dl>
              <div>
                <dt>アカウント</dt>
                <dd>{currentUser?.loginName ?? "-"}</dd>
              </div>
              <div>
                <dt>表示名</dt>
                <dd>{currentUser?.displayName ?? "-"}</dd>
              </div>
              <div>
                <dt>権限</dt>
                <dd>{currentUser ? roleLabelMap[currentUser.role] : "-"}</dd>
              </div>
              <div>
                <dt>状態</dt>
                <dd>active</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {isLoggedIn && applicationDialogMode && (
        <ApplicationDialog
          mode={applicationDialogMode}
          isSuperAdmin={isSuperAdmin}
          items={applicationDialogMode === "application_submit" ? draftItems : applicationDialogMode === "application_list" ? submittedItems : applicationHistoryItems}
          groups={adminReviewGroups}
          isLoading={isLoadingApplications}
          errorMessage={applicationError}
          selectedDraftIds={selectedDraftIds}
          selectedDraftCount={selectedDraftCount}
          selectedDraftDependencyWarnings={selectedDraftDependencyWarnings}
          areAllDraftsSelected={areAllDraftsSelected}
          onClose={() => setApplicationDialogMode(null)}
          onToggleDraftSelection={toggleDraftSelection}
          onToggleAllDraftSelections={toggleAllDraftSelections}
          onSubmitSelectedDrafts={submitSelectedDrafts}
          onWithdrawSubmission={withdrawSubmission}
          onReviewGroup={reviewApplicationGroup}
        />
      )}

      {isLoggedIn && canUseMessages && messageDialogOpen && (
        <MessageDialog
          currentUser={currentUser}
          activeTab={messageDialogTab}
          generalThreads={generalMessageThreads}
          applicationThreads={applicationMessageThreads}
          isLoadingGeneralMessages={isLoadingGeneralMessages}
          isLoadingApplicationMessages={isLoadingApplicationMessages}
          generalMessageError={generalMessageError}
          applicationMessageError={applicationMessageError}
          onTabChange={setMessageDialogTab}
          onCreateGeneralThread={createGeneralMessageThread}
          onPostGeneralMessage={postGeneralMessage}
          onPostApplicationMessage={postApplicationMessage}
          onToggleThreadClosed={toggleMessageThreadClosed}
          onMarkGeneralThreadRead={markGeneralThreadRead}
          onMarkApplicationThreadRead={markApplicationThreadRead}
          onClose={() => setMessageDialogOpen(false)}
        />
      )}
    </div>
  );
}

function ApplicationGroupReadOnlyCard({
  group,
  isDraftSelection,
  selectedDraftIds,
  onToggleDraftSelection,
  onWithdrawSubmission,
  showRequester,
  allowWithdraw,
}: {
  group: ApplicationGroup;
  isDraftSelection: boolean;
  selectedDraftIds: string[];
  onToggleDraftSelection: (id: string) => void;
  onWithdrawSubmission: (id: string) => void;
  showRequester?: boolean;
  allowWithdraw?: boolean;
}) {
  const summary = buildApplicationGroupSummary(group);
  const selectedCount = group.items.filter((item) => selectedDraftIds.includes(item.id)).length;
  return (
    <section className="admin-application-group-card account-application-card" key={group.id}>
      <div className="admin-application-group-head">
        <div className="admin-application-group-title">
          <strong>{group.label}</strong>
          <span>
            {group.items[0]?.kind ?? "申請"} / {showRequester && group.requester ? `申請者: ${group.requester}` : `${group.items.length}件の申請`}
          </span>
        </div>
        <div className="admin-application-group-meta">
          {summary.actionLabels.map((actionLabel) => (
            <span key={actionLabel} className="admin-application-group-count submitted">{actionLabel}</span>
          ))}
          {isDraftSelection && <span className="admin-application-group-count on-hold">選択中 {selectedCount}/{group.items.length}</span>}
          <span>{formatApplicationUpdatedAt(group.updatedAt)}</span>
        </div>
      </div>

      {(summary.dependencyTitles.length > 0 || summary.policyNote) && (
        <div className="application-group-banner-row">
          {summary.dependencyTitles.length > 0 && (
            <div className="application-group-banner dependency">
              <strong>依存関係</strong>
              <span>{summary.dependencyTitles.join(" / ")} の承認状況を確認します。</span>
            </div>
          )}
          {summary.policyNote && (
            <div className="application-group-banner caution">
              <strong>承認単位</strong>
              <span>{summary.policyNote}</span>
            </div>
          )}
        </div>
      )}

      <div className="application-group-summary-grid">
        {summary.summaryItems.map((summaryItem) => (
          <div className="application-group-summary-chip" key={summaryItem}>{summaryItem}</div>
        ))}
      </div>

      {summary.changedFieldLabels.length > 0 && (
        <div className="application-group-field-block">
          <strong>変更項目</strong>
          <div className="application-group-field-chips">
            {summary.changedFieldLabels.slice(0, 12).map((label) => (
              <span className="application-group-field-chip" key={label}>{label}</span>
            ))}
          </div>
        </div>
      )}

      <div className="admin-application-group-items">
        {group.items.map((item) => (
          <div className="admin-application-group-item" key={item.id}>
            <div className="admin-application-group-item-top">
              <small>{item.kind} / {item.parent}</small>
              {isDraftSelection ? (
                <label className="application-item-checkbox">
                  <input
                    type="checkbox"
                    aria-label={`${item.title}を申請対象にする`}
                    checked={selectedDraftIds.includes(item.id)}
                    onChange={() => onToggleDraftSelection(item.id)}
                  />
                  <span>選択</span>
                </label>
              ) : (
                <span className={`account-work-status status-${item.status}`}>{applicationStatusLabelMap[item.status]}</span>
              )}
            </div>
            <strong>
              {item.title}
              <span className={`application-state-badge tone-${applicationActionToneMap[item.action]}`}>{applicationActionLabelMap[item.action]}</span>
            </strong>
            {item.reviewerNote && <small className="account-work-item-review-note">管理メモ: {item.reviewerNote}</small>}
            <span className="application-item-time">{formatApplicationUpdatedAt(item.reviewedAt || item.updatedAt)}</span>
            {!isDraftSelection && allowWithdraw && (item.status === "submitted" || item.status === "on_hold") && (
              <button className="secondary-button account-work-return" type="button" onClick={() => onWithdrawSubmission(item.id)}>
                <RotateCcw size={14} />
                編集中に戻す
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountWorkList({
  items,
  isDraftSelection,
  selectedDraftIds,
  isLoading,
  errorMessage,
  onToggleDraftSelection,
  onWithdrawSubmission,
  showRequester,
  allowWithdraw,
}: {
  items: WorkItem[];
  isDraftSelection: boolean;
  selectedDraftIds: string[];
  isLoading?: boolean;
  errorMessage?: string;
  onToggleDraftSelection: (id: string) => void;
  onWithdrawSubmission: (id: string) => void;
  showRequester?: boolean;
  allowWithdraw?: boolean;
}) {
  if (isLoading) {
    return <div className="account-work-empty">申請データを読み込み中です。</div>;
  }
  if (errorMessage) {
    return <div className="account-work-empty">{errorMessage}</div>;
  }
  if (items.length === 0) {
    return <div className="account-work-empty">該当するデータはありません。</div>;
  }

  const groups = buildApplicationGroups(items);

  return (
    <div className="admin-application-group-list account-application-group-list">
      {groups.map((group) => (
        <ApplicationGroupReadOnlyCard
          key={group.id}
          group={group}
          isDraftSelection={isDraftSelection}
          selectedDraftIds={selectedDraftIds}
          onToggleDraftSelection={onToggleDraftSelection}
          onWithdrawSubmission={onWithdrawSubmission}
          showRequester={showRequester}
          allowWithdraw={allowWithdraw}
        />
      ))}
    </div>
  );
}

function ApplicationDialog({
  mode,
  isSuperAdmin,
  items,
  groups,
  isLoading,
  errorMessage,
  selectedDraftIds,
  selectedDraftCount,
  selectedDraftDependencyWarnings,
  areAllDraftsSelected,
  onClose,
  onToggleDraftSelection,
  onToggleAllDraftSelections,
  onSubmitSelectedDrafts,
  onWithdrawSubmission,
  onReviewGroup,
}: {
  mode: ApplicationDialogMode;
  isSuperAdmin: boolean;
  items: WorkItem[];
  groups: ApplicationGroup[];
  isLoading: boolean;
  errorMessage: string;
  selectedDraftIds: string[];
  selectedDraftCount: number;
  selectedDraftDependencyWarnings: string[];
  areAllDraftsSelected: boolean;
  onClose: () => void;
  onToggleDraftSelection: (id: string) => void;
  onToggleAllDraftSelections: () => void;
  onSubmitSelectedDrafts: (submitterNote: string) => Promise<void>;
  onWithdrawSubmission: (id: string) => void;
  onReviewGroup: (requestIds: string[], operation: ReviewOperation, reviewerNote: string) => Promise<boolean>;
}) {
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processingGroupId, setProcessingGroupId] = useState("");
  const [submitterNote, setSubmitterNote] = useState("");
  const title = mode === "application_list" ? "申請リスト一覧" : mode === "application_history" ? "申請の履歴" : "データの申請";
  const subtitle =
    mode === "application_list"
      ? isSuperAdmin
        ? "編集者から届いている承認待ちデータです。雑誌個別はセット単位で確認し、作品リストとコンテンツも一括で扱います。"
        : "送信済みの申請データです。依存先の親申請もあわせて確認します。"
      : mode === "application_history"
        ? "申請データの流れと依存関係を確認します。"
        : "申請対象の下書きデータを選択してください。雑誌個別の新規は、親の雑誌マスターと同時申請が必要です。";

  const handleReview = async (group: ApplicationGroup, operation: ReviewOperation) => {
    setProcessingGroupId(group.id);
    try {
      const reviewerNote =
        operation === "approve"
          ? (reviewNotes[group.id] ?? "").trim() || buildDefaultApprovalMessage(group)
          : reviewNotes[group.id] ?? "";
      await onReviewGroup(group.items.map((item) => item.id), operation, reviewerNote);
    } finally {
      setProcessingGroupId("");
    }
  };

  const handleReviewAll = async (operation: ReviewOperation) => {
    if (groups.length === 0) return;
    setProcessingGroupId("__all__");
    try {
      for (const group of groups) {
        const reviewerNote =
          operation === "approve"
            ? (reviewNotes[group.id] ?? "").trim() || buildDefaultApprovalMessage(group)
            : reviewNotes[group.id] ?? "";
        const ok = await onReviewGroup(group.items.map((item) => item.id), operation, reviewerNote);
        if (!ok) {
          break;
        }
      }
    } finally {
      setProcessingGroupId("");
    }
  };

  return (
    <div className="plain-dialog-layer application-dialog-layer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-blocking-backdrop plain-dialog-backdrop" aria-hidden="true" />
      <section className="plain-dialog work-history-dialog application-dialog">
        <header className="plain-dialog-header">
          <div>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
          <div className="application-dialog-head-actions">
            {mode === "application_submit" && (
              <button className="account-select-all-button" type="button" disabled={items.length === 0} onClick={onToggleAllDraftSelections}>
                {areAllDraftsSelected ? "全解除" : "全選択"}
              </button>
            )}
            <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose}>
              <CircleX size={28} />
            </button>
          </div>
        </header>
        <div className="work-history-dialog-body">
          {isSuperAdmin && mode === "application_list" ? (
            <AdminApplicationReviewList
              groups={groups}
              isLoading={isLoading}
              errorMessage={errorMessage}
              reviewNotes={reviewNotes}
              processingGroupId={processingGroupId}
              onReviewNoteChange={(groupId, value) => setReviewNotes((current) => ({ ...current, [groupId]: value }))}
              onReview={handleReview}
            />
          ) : (
            <AccountWorkList
              items={items}
              isDraftSelection={mode === "application_submit"}
              isLoading={isLoading}
              errorMessage={errorMessage}
              selectedDraftIds={selectedDraftIds}
              onToggleDraftSelection={onToggleDraftSelection}
              onWithdrawSubmission={onWithdrawSubmission}
              showRequester={isSuperAdmin}
              allowWithdraw={!isSuperAdmin && mode === "application_list"}
            />
          )}
        </div>
        <footer className="work-history-dialog-footer">
          {mode === "application_submit" ? (
            <>
              <span className="application-dialog-footer-note">
                {selectedDraftDependencyWarnings[0]
                  ? selectedDraftDependencyWarnings[0]
                  : selectedDraftCount > 0
                    ? `${selectedDraftCount}件を選択中`
                    : "申請するデータを選択してください"}
              </span>
              <label className="admin-application-group-review-label application-submit-note">
                申請時コメント
                <textarea
                  className="admin-application-group-review-textarea"
                  value={submitterNote}
                  onChange={(event) => setSubmitterNote(event.target.value)}
                  placeholder="申請の補足や確認してほしい点を記入"
                />
              </label>
              <button className="primary-button" type="button" disabled={selectedDraftCount === 0 || selectedDraftDependencyWarnings.length > 0} onClick={() => void onSubmitSelectedDrafts(submitterNote.trim())}>
                <Send size={15} />
                申請
              </button>
            </>
          ) : isSuperAdmin && mode === "application_list" ? (
            <>
              <span className="application-dialog-footer-note">
                {groups.length > 0 ? `${groups.length}セットを確認できます` : "確認待ちの申請セットはありません"}
              </span>
              <div className="application-dialog-admin-footer-actions">
                <button type="button" className="secondary-button" disabled={groups.length === 0 || processingGroupId !== ""} onClick={() => void handleReviewAll("hold")}>
                  全部を保留
                </button>
                <button type="button" className="secondary-button danger" disabled={groups.length === 0 || processingGroupId !== ""} onClick={() => void handleReviewAll("reject")}>
                  全部を却下
                </button>
                <button type="button" className="primary-button" disabled={groups.length === 0 || processingGroupId !== ""} onClick={() => void handleReviewAll("approve")}>
                  全部を承認
                </button>
                <button type="button" className="secondary-button" onClick={onClose}>
                  閉じる
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="secondary-button" onClick={onClose}>
              閉じる
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function AdminApplicationReviewList({
  groups,
  isLoading,
  errorMessage,
  reviewNotes,
  processingGroupId,
  onReviewNoteChange,
  onReview,
}: {
  groups: ApplicationGroup[];
  isLoading: boolean;
  errorMessage: string;
  reviewNotes: Record<string, string>;
  processingGroupId: string;
  onReviewNoteChange: (groupId: string, value: string) => void;
  onReview: (group: ApplicationGroup, operation: ReviewOperation) => void;
}) {
  if (isLoading) {
    return <div className="account-work-empty">申請データを読み込み中です。</div>;
  }
  if (errorMessage) {
    return <div className="account-work-empty">{errorMessage}</div>;
  }
  if (groups.length === 0) {
    return <div className="account-work-empty">確認待ちの申請セットはありません。</div>;
  }

  return (
    <div className="admin-application-group-list">
      {groups.map((group) => {
        const submittedCount = group.items.filter((item) => item.status === "submitted").length;
        const holdCount = group.items.filter((item) => item.status === "on_hold").length;
        const isProcessing = processingGroupId === group.id || processingGroupId === "__all__";
        const reviewValue = Object.prototype.hasOwnProperty.call(reviewNotes, group.id)
          ? reviewNotes[group.id]
          : buildDefaultApprovalMessage(group);
        const summary = buildApplicationGroupSummary(group);
        return (
          <section className="admin-application-group-card" key={group.id}>
            <div className="admin-application-group-head">
              <div className="admin-application-group-title">
                <strong>{group.label}</strong>
                <span>{group.requester ? `申請者: ${group.requester}` : "申請者未設定"}</span>
              </div>
              <div className="admin-application-group-meta">
                {submittedCount > 0 && <span className="admin-application-group-count submitted">申請中 {submittedCount}</span>}
                {holdCount > 0 && <span className="admin-application-group-count on-hold">保留 {holdCount}</span>}
                <span>{formatApplicationUpdatedAt(group.updatedAt)}</span>
              </div>
            </div>
            {(summary.dependencyTitles.length > 0 || summary.policyNote) && (
              <div className="application-group-banner-row">
                {summary.dependencyTitles.length > 0 && (
                  <div className="application-group-banner dependency">
                    <strong>依存関係</strong>
                    <span>{summary.dependencyTitles.join(" / ")} の承認状況を確認します。</span>
                  </div>
                )}
                {summary.policyNote && (
                  <div className="application-group-banner caution">
                    <strong>承認単位</strong>
                    <span>{summary.policyNote}</span>
                  </div>
                )}
              </div>
            )}
            <div className="application-group-summary-grid">
              {summary.summaryItems.map((summaryItem) => (
                <div className="application-group-summary-chip" key={summaryItem}>{summaryItem}</div>
              ))}
            </div>
            {summary.changedFieldLabels.length > 0 && (
              <div className="application-group-field-block">
                <strong>変更項目</strong>
                <div className="application-group-field-chips">
                  {summary.changedFieldLabels.slice(0, 12).map((label) => (
                    <span className="application-group-field-chip" key={label}>{label}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="admin-application-group-items">
              {group.items.map((item) => (
                <div className="admin-application-group-item" key={item.id}>
                  <div className="admin-application-group-item-top">
                    <small>{item.kind} / {item.parent}</small>
                    <span className={`account-work-status status-${item.status}`}>{applicationStatusLabelMap[item.status]}</span>
                  </div>
                  <strong>
                    {item.title}
                    <span className={`application-state-badge tone-${applicationActionToneMap[item.action]}`}>{applicationActionLabelMap[item.action]}</span>
                  </strong>
                  {item.reviewerNote && <small className="account-work-item-review-note">管理メモ: {item.reviewerNote}</small>}
                  <span className="application-item-time">{formatApplicationUpdatedAt(item.reviewedAt || item.updatedAt)}</span>
                </div>
              ))}
            </div>
            <div className="admin-application-group-review">
              <label className="admin-application-group-review-label">
                管理者メッセージ
                <textarea
                  className="admin-application-group-review-textarea"
                  value={reviewValue}
                  onChange={(event) => onReviewNoteChange(group.id, event.target.value)}
                  placeholder="承認・保留・却下の理由や連絡事項を記入"
                />
              </label>
              <div className="admin-application-group-actions">
                <button type="button" className="secondary-button" disabled={isProcessing} onClick={() => onReview(group, "hold")}>
                  保留
                </button>
                <button type="button" className="secondary-button danger" disabled={isProcessing} onClick={() => onReview(group, "reject")}>
                  却下
                </button>
                <button type="button" className="primary-button" disabled={isProcessing} onClick={() => onReview(group, "approve")}>
                  承認
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MessageDialog({
  currentUser,
  activeTab,
  generalThreads,
  applicationThreads,
  isLoadingGeneralMessages,
  isLoadingApplicationMessages,
  generalMessageError,
  applicationMessageError,
  onTabChange,
  onCreateGeneralThread,
  onPostGeneralMessage,
  onPostApplicationMessage,
  onToggleThreadClosed,
  onMarkGeneralThreadRead,
  onMarkApplicationThreadRead,
  onClose,
}: {
  currentUser: AccountMenuProps["currentUser"];
  activeTab: MessageDialogTab;
  generalThreads: MessageThreadPreview[];
  applicationThreads: MessageThreadPreview[];
  isLoadingGeneralMessages: boolean;
  isLoadingApplicationMessages: boolean;
  generalMessageError: string;
  applicationMessageError: string;
  onTabChange: (tab: MessageDialogTab) => void;
  onCreateGeneralThread: (title: string, body: string) => Promise<void>;
  onPostGeneralMessage: (threadId: string, body: string) => Promise<void>;
  onPostApplicationMessage: (threadId: string, body: string) => Promise<void>;
  onToggleThreadClosed: (threadId: string, threadType: MessageDialogTab, isClosed: boolean) => Promise<void>;
  onMarkGeneralThreadRead: (threadId: string, lastMessageId: string) => Promise<void>;
  onMarkApplicationThreadRead: (threadId: string, lastMessageId: string) => Promise<void>;
  onClose: () => void;
	}) {
	  const threads = activeTab === "general" ? generalThreads : applicationThreads;
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadBody, setNewThreadBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [messageError, setMessageError] = useState("");
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [isTogglingThreadState, setIsTogglingThreadState] = useState(false);
  const [dialogSize, setDialogSize] = useState<MessageDialogSize | null>(null);
  const [isResizingDialog, setIsResizingDialog] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const resizePointerRef = useRef<{ pointerId: number; startX: number; startY: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedThreadId("");
      return;
    }
    if (!threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0]?.id ?? "");
    }
  }, [selectedThreadId, threads]);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const selectedThreadSummaryItems = selectedThread ? buildThreadSummaryItems(selectedThread, currentUser) : [];
  const isGeneralTab = activeTab === "general";

  useEffect(() => {
    if (activeTab !== "general") {
      setIsCreatingThread(false);
      setMessageError("");
      return;
    }
    if (generalThreads.length === 0) {
      setIsCreatingThread(true);
    }
  }, [activeTab, generalThreads.length]);

  useEffect(() => {
    if (!selectedThread || activeTab !== "general") return;
    const lastMessage = selectedThread.messages[selectedThread.messages.length - 1];
    if (!lastMessage || selectedThread.unreadCount === 0) return;
    void onMarkGeneralThreadRead(selectedThread.id, lastMessage.id);
  }, [activeTab, onMarkGeneralThreadRead, selectedThread]);

  useEffect(() => {
    if (!selectedThread || activeTab !== "application") return;
    const lastMessage = selectedThread.messages[selectedThread.messages.length - 1];
    if (!lastMessage || selectedThread.unreadCount === 0) return;
    void onMarkApplicationThreadRead(selectedThread.id, lastMessage.id);
  }, [activeTab, onMarkApplicationThreadRead, selectedThread]);

  useEffect(() => {
    if (!isResizingDialog) return;
    const handlePointerMove = (event: PointerEvent) => {
      const current = resizePointerRef.current;
      if (!current) return;
      const nextWidth = Math.min(window.innerWidth - 32, Math.max(900, current.width + event.clientX - current.startX));
      const nextHeight = Math.min(window.innerHeight - 32, Math.max(520, current.height + event.clientY - current.startY));
      setDialogSize({ width: nextWidth, height: nextHeight });
    };
    const handlePointerUp = () => {
      resizePointerRef.current = null;
      setIsResizingDialog(false);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingDialog]);

  const handleCreateThread = async () => {
    const title = newThreadTitle.trim();
    const body = newThreadBody.trim();
    if (!title || !body) {
      setMessageError("タイトルと本文を入力してください。");
      return;
    }
    setIsSubmittingMessage(true);
    try {
      await onCreateGeneralThread(title, body);
      setNewThreadTitle("");
      setNewThreadBody("");
      setReplyBody("");
      setMessageError("");
      setIsCreatingThread(false);
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "スレッドを作成できませんでした。");
    } finally {
      setIsSubmittingMessage(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedThread) return;
    const body = replyBody.trim();
    if (!body) {
      setMessageError("本文を入力してください。");
      return;
    }
    setIsSubmittingMessage(true);
    try {
      if (activeTab === "general") {
        await onPostGeneralMessage(selectedThread.id, body);
      } else {
        await onPostApplicationMessage(selectedThread.id, body);
      }
      setReplyBody("");
      setMessageError("");
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "メッセージを送信できませんでした。");
    } finally {
      setIsSubmittingMessage(false);
    }
  };

  const handleToggleThreadClosed = async () => {
    if (!selectedThread) return;
    setIsTogglingThreadState(true);
    try {
      await onToggleThreadClosed(selectedThread.id, activeTab, !selectedThread.isClosed);
      setMessageError("");
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "スレッド状態を更新できませんでした。");
    } finally {
      setIsTogglingThreadState(false);
    }
  };

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dialogRef.current) return;
    const rect = dialogRef.current.getBoundingClientRect();
    resizePointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
    };
    setDialogSize({ width: rect.width, height: rect.height });
    setIsResizingDialog(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  return (
    <div className="plain-dialog-layer message-dialog-layer" role="dialog" aria-modal="true" aria-label="メッセージ">
      <div className="modal-blocking-backdrop plain-dialog-backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className={`plain-dialog work-history-dialog message-dialog${isGeneralTab ? " general-mode" : " application-mode"}${isResizingDialog ? " is-resizing" : ""}`}
        style={dialogSize ? { width: `${dialogSize.width}px`, height: `${dialogSize.height}px`, maxHeight: "calc(100vh - 32px)" } : undefined}
      >
        <header className="plain-dialog-header">
          <div>
            <strong>メッセージ</strong>
            <span>admin と editor だけが使える共有スレッドです。一般連絡と申請・認証を分けて確認します。</span>
          </div>
          <div className="application-dialog-head-actions">
            <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose}>
              <CircleX size={28} />
            </button>
          </div>
        </header>
        <div className="work-history-dialog-body message-dialog-body">
          <aside className="message-dialog-sidebar">
            <div className="message-dialog-tabs" role="tablist" aria-label="メッセージ種別">
              <button type="button" className={`message-dialog-tab${activeTab === "general" ? " active" : ""}`} onClick={() => onTabChange("general")}>
                一般メッセージ
              </button>
              <button type="button" className={`message-dialog-tab${activeTab === "application" ? " active" : ""}`} onClick={() => onTabChange("application")}>
                申請・認証
              </button>
            </div>
            {activeTab === "general" && (
              <div className="message-dialog-sidebar-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setIsCreatingThread(true);
                    setSelectedThreadId("");
                    setMessageError("");
                  }}
                >
                  新規スレッド
                </button>
              </div>
            )}
            <div className="message-thread-list" aria-label="メッセージスレッド一覧">
              {activeTab === "general" && isLoadingGeneralMessages ? (
                <div className="account-work-empty">メッセージを読み込み中です。</div>
              ) : activeTab === "general" && generalMessageError ? (
                <div className="account-work-empty">{generalMessageError}</div>
              ) : activeTab === "application" && isLoadingApplicationMessages ? (
                <div className="account-work-empty">申請メッセージを読み込み中です。</div>
              ) : activeTab === "application" && applicationMessageError ? (
                <div className="account-work-empty">{applicationMessageError}</div>
              ) : threads.length === 0 ? (
                <div className="account-work-empty">まだスレッドはありません。</div>
		              ) : (
		                threads.map((thread) => (
		                  <button
	                    key={thread.id}
	                    type="button"
                    className={`message-thread-card${thread.id === selectedThreadId ? " active" : ""}`}
                    onClick={() => setSelectedThreadId(thread.id)}
	                  >
                        <div className="message-thread-card-meta">
                          {!isGeneralTab && <span className={`message-thread-kind-chip tone-${thread.accent}`}>{getThreadKindLabel(thread)}</span>}
                          <span className={`message-thread-state-chip${thread.isClosed ? " closed" : ""}`}>{getThreadStateLabel(thread)}</span>
                        </div>
		                    <div className="message-thread-card-top">
		                      <strong>{thread.title}</strong>
		                      <div className="message-thread-card-top-side">
		                        {thread.unreadCount > 0 && <span className={`message-thread-badge tone-${thread.accent}`}>{thread.unreadCount}</span>}
		                        {isGeneralTab && <small>{formatApplicationUpdatedAt(thread.updatedAt)}</small>}
		                      </div>
		                    </div>
		                    <span>{thread.subtitle}</span>
		                    <p>{getThreadPreviewText(thread)}</p>
                        {!isGeneralTab && <small>{formatApplicationUpdatedAt(thread.updatedAt)}</small>}
		                  </button>
		                ))
		              )}
            </div>
          </aside>

          <section className="message-thread-view" aria-label="メッセージ本文">
            {activeTab === "general" && isCreatingThread ? (
              <div className="message-thread-create">
                <div className="message-thread-view-head">
                  <div>
                    <strong>新規スレッド</strong>
                    <span>全員に共有される一般メッセージスレッドを作成します。</span>
                  </div>
                  <small>{currentUser?.loginName ?? "user"}</small>
                </div>
                <div className="message-thread-create-form">
                  <label className="message-thread-composer-label">
                    タイトル
                    <input
                      className="message-thread-title-input"
                      value={newThreadTitle}
                      onChange={(event) => setNewThreadTitle(event.target.value)}
                      placeholder="例: 今週の入力作業メモ"
                    />
                  </label>
                  <label className="message-thread-composer-label">
                    本文
                    <textarea
                      className="message-thread-composer-textarea"
                      value={newThreadBody}
                      onChange={(event) => setNewThreadBody(event.target.value)}
                      placeholder="最初の共有メッセージを入力"
                    />
                  </label>
                  {messageError && <div className="message-thread-error">{messageError}</div>}
                  <div className="message-thread-create-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setIsCreatingThread(false);
                        setMessageError("");
                        setNewThreadTitle("");
                        setNewThreadBody("");
                      }}
                    >
                      キャンセル
                    </button>
                    <button type="button" className="primary-button" disabled={isSubmittingMessage} onClick={() => void handleCreateThread()}>
                      作成
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedThread ? (
	              <>
	                <div className="message-thread-view-head">
		                  <div>
		                    <strong>{selectedThread.title}</strong>
		                    <span>{selectedThread.subtitle}</span>
                        <div className="message-thread-view-head-meta">
                          {!isGeneralTab && <span className={`message-thread-kind-chip tone-${selectedThread.accent}`}>{getThreadKindLabel(selectedThread)}</span>}
                          <span className={`message-thread-state-chip${selectedThread.isClosed ? " closed" : ""}`}>{getThreadStateLabel(selectedThread)}</span>
                          {selectedThread.unreadCount > 0 && <span className={`message-thread-badge tone-${selectedThread.accent}`}>未読 {selectedThread.unreadCount}</span>}
                        </div>
		                  </div>
	                  <div className="message-thread-view-head-actions">
	                    {selectedThread.canManage && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={isTogglingThreadState}
                        onClick={() => void handleToggleThreadClosed()}
                      >
                        {selectedThread.isClosed ? "スレッドを再開" : "スレッドを閉じる"}
                      </button>
                    )}
	                    <small>{currentUser?.loginName ?? "user"}</small>
	                  </div>
	                </div>
		                <div className="message-thread-log">
                      {isGeneralTab ? (
                        <section className="message-thread-summary compact" aria-label="スレッド要約">
                          <div className="message-thread-summary-inline">
                            <span>{selectedThread.subtitle}</span>
                            <small>{formatApplicationUpdatedAt(selectedThread.updatedAt)}</small>
                          </div>
                          <p className="message-thread-summary-preview">{getThreadPreviewText(selectedThread)}</p>
                        </section>
                      ) : (
                        <section className="message-thread-summary" aria-label="スレッド要約">
                          <div className="message-thread-summary-head">
                            <strong>このスレッドの要点</strong>
                            <small>{formatApplicationUpdatedAt(selectedThread.updatedAt)}</small>
                          </div>
                          <div className="message-thread-summary-grid">
                            {selectedThreadSummaryItems.map((item) => (
                              <article key={item.label} className="message-thread-summary-item">
                                <span>{item.label}</span>
                                {item.tone ? (
                                  <strong className={`tone-${item.tone}`}>{item.value}</strong>
                                ) : (
                                  <strong>{item.value}</strong>
                                )}
                              </article>
                            ))}
                          </div>
                          <p className="message-thread-summary-preview">{getThreadPreviewText(selectedThread)}</p>
                        </section>
                      )}
		                  {selectedThread.messages.map((message) => (
	                    <article key={message.id} className={`message-bubble ${message.type === "system" ? "system" : ""}`}>
	                      <div className="message-bubble-meta">
                        <strong>{message.author}</strong>
                        <span>{formatApplicationUpdatedAt(message.time)}</span>
                      </div>
                      <p>{message.body}</p>
                    </article>
                  ))}
                </div>
                <div className="message-thread-composer">
                  {activeTab === "general" || activeTab === "application" ? (
                    <>
                      <label className="message-thread-composer-label">
                        {activeTab === "general" ? "メッセージ入力" : "申請スレッドへの返信"}
                        <textarea
                          className="message-thread-composer-textarea"
                          value={replyBody}
                          onChange={(event) => setReplyBody(event.target.value)}
                          placeholder={activeTab === "general" ? "このスレッドへ全員向けのメッセージを送ります" : "この申請スレッドへ補足コメントを送ります"}
                          disabled={selectedThread.isClosed}
                        />
                      </label>
                      {messageError && <div className="message-thread-error">{messageError}</div>}
                      <div className="message-thread-create-actions">
                        <button type="button" className="primary-button" disabled={isSubmittingMessage || Boolean(selectedThread.isClosed)} onClick={() => void handleSendReply()}>
                          送信
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="message-thread-readonly-note">このスレッドは読み取り専用です。</div>
                  )}
                </div>
              </>
            ) : (
              <div className="account-work-empty">表示するスレッドがありません。</div>
            )}
          </section>
        </div>
        <footer className="work-history-dialog-footer">
          <span className="application-dialog-footer-note">
            {activeTab === "general"
              ? `${generalThreads.length}件の一般スレッド`
              : `${applicationThreads.length}件の申請・認証スレッド`}
          </span>
          <button type="button" className="secondary-button" onClick={onClose}>
            閉じる
          </button>
        </footer>
        <div
          className="message-dialog-resize-handle"
          role="presentation"
          aria-hidden="true"
          onPointerDown={handleResizePointerDown}
        />
      </section>
    </div>
  );
}
