export type MessageThreadType = "general" | "application";

export type MessageEntryRecord = {
  id: string;
  type: "text" | "system";
  authorLoginName: string;
  authorDisplayName: string;
  body: string;
  time: string;
  eventType: string;
};

export type MessageThreadRecord = {
  id: string;
  kind: MessageThreadType;
  title: string;
  subtitle: string;
  updatedAt: string;
  unreadCount: number;
  isClosed: boolean;
  canManage: boolean;
  lastMessagePreview: string;
  messages: MessageEntryRecord[];
};

export type MessageThreadListResponse = {
  threads?: MessageThreadRecord[];
  error?: string;
};
