"use client";

export type AlertDialogRequest = {
  kind: "alert" | "confirm";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type AlertDialogHandler = (request: AlertDialogRequest) => Promise<boolean>;
type PendingAlertRequest = {
  request: AlertDialogRequest;
  resolve: (value: boolean) => void;
};

let activeHandler: AlertDialogHandler | null = null;
let pendingRequests: PendingAlertRequest[] = [];

const flushPendingRequests = () => {
  if (!activeHandler || pendingRequests.length === 0) return;
  const queued = pendingRequests;
  pendingRequests = [];
  queued.forEach(({ request, resolve }) => {
    void activeHandler?.(request).then(resolve);
  });
};

export const installAlertDialogHandler = (handler: AlertDialogHandler) => {
  activeHandler = handler;
  flushPendingRequests();
  return () => {
    if (activeHandler === handler) {
      activeHandler = null;
    }
  };
};

const getMessageText = (
  input:
    | string
    | {
        title?: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
      },
) => (typeof input === "string" ? { message: input } : input);

export const showAlertDialog = async (
  input:
    | string
    | {
        title?: string;
        message: string;
        confirmLabel?: string;
      },
) => {
  if (typeof window === "undefined") return;
  const { title = "アラート", message, confirmLabel } = getMessageText(input);
  const request: AlertDialogRequest = {
    kind: "alert",
    title,
    message,
    confirmLabel,
  };
  if (!activeHandler) {
    await new Promise<boolean>((resolve) => {
      pendingRequests.push({ request, resolve });
    });
    return;
  }
  await activeHandler(request);
};

export const showConfirmDialog = async (
  input:
    | string
    | {
        title?: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
      },
) => {
  if (typeof window === "undefined") return true;
  const {
    title = "確認",
    message,
    confirmLabel,
    cancelLabel,
  } = getMessageText(input);
  const request: AlertDialogRequest = {
    kind: "confirm",
    title,
    message,
    confirmLabel,
    cancelLabel,
  };
  if (!activeHandler) {
    return new Promise<boolean>((resolve) => {
      pendingRequests.push({ request, resolve });
    });
  }
  return activeHandler(request);
};
