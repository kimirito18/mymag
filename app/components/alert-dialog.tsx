"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  installAlertDialogHandler,
  type AlertDialogRequest,
} from "../lib/alert-dialog";

type AlertDialogQueueItem = {
  id: number;
  request: AlertDialogRequest;
  resolve: (value: boolean) => void;
};

let alertDialogQueueId = 1;

export function AlertDialogHost() {
  const [queue, setQueue] = useState<AlertDialogQueueItem[]>([]);
  const activeItem = queue[0] ?? null;

  useEffect(() => {
    return installAlertDialogHandler(
      (request) =>
        new Promise<boolean>((resolve) => {
          setQueue((current) => [
            ...current,
            {
              id: alertDialogQueueId += 1,
              request,
              resolve,
            },
          ]);
        }),
    );
  }, []);

  const closeDialog = useCallback((result: boolean) => {
    setQueue((current) => {
      const [active, ...rest] = current;
      active?.resolve(result);
      return rest;
    });
  }, []);

  const messageLines = useMemo(
    () => activeItem?.request.message.split("\n") ?? [],
    [activeItem],
  );

  if (!activeItem || typeof document === "undefined") return null;

  const { request } = activeItem;
  const confirmLabel = request.confirmLabel ?? "OK";
  const cancelLabel = request.cancelLabel ?? "キャンセル";

  return createPortal(
    <div className="alert-dialog-layer" role="dialog" aria-modal="true" aria-label={request.title}>
      <div className="modal-blocking-backdrop alert-dialog-backdrop" aria-hidden="true" />
      <section className="alert-dialog">
        <header className="alert-dialog-header">
          <div className="alert-dialog-icon" aria-hidden="true">
            <AlertTriangle size={28} />
          </div>
          <div className="alert-dialog-head-copy">
            <strong>{request.title}</strong>
          </div>
        </header>
        <div className="alert-dialog-body">
          {messageLines.map((line, index) =>
            line.trim() ? (
              <p key={`${activeItem.id}:${index}`}>{line}</p>
            ) : (
              <div key={`${activeItem.id}:${index}`} className="alert-dialog-spacer" />
            ),
          )}
        </div>
        <footer className="alert-dialog-actions">
          {request.kind === "confirm" ? (
            <button
              type="button"
              className="secondary-button alert-dialog-cancel"
              onClick={() => closeDialog(false)}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button alert-dialog-confirm"
            onClick={() => closeDialog(true)}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
