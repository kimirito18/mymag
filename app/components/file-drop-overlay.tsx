"use client";

import { ArrowUpToLine, FileArchive } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";

type FileDropOverlayProps = {
  children: ReactNode;
  disabled?: boolean;
  title: string;
  description: string;
  acceptHint?: string;
  onFilesSelected: (files: File[]) => void;
};

const hasFileTransfer = (event: DragEvent<HTMLElement>) => {
  const transfer = event.dataTransfer;
  if (!transfer) return false;

  const itemKinds = Array.from(transfer.items ?? []).map((item) => item.kind);
  if (itemKinds.includes("file")) return true;

  if ((transfer.files?.length ?? 0) > 0) return true;

  const normalizedTypes = Array.from(transfer.types ?? []).map((type) => type.toLowerCase());
  return normalizedTypes.some((type) => type === "files" || type.includes("file"));
};

export function FileDropOverlay({
  children,
  disabled = false,
  title,
  description,
  acceptHint,
  onFilesSelected,
}: FileDropOverlayProps) {
  const [isActive, setIsActive] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsActive(false);
  }, []);

  useEffect(() => {
    if (disabled) {
      resetDragState();
      return;
    }

    const handleWindowDragEnter = (event: DragEvent | globalThis.DragEvent) => {
      if (!hasFileTransfer(event as DragEvent<HTMLElement>)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsActive(true);
    };

    const handleWindowDragOver = (event: DragEvent | globalThis.DragEvent) => {
      if (!hasFileTransfer(event as DragEvent<HTMLElement>)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setIsActive(true);
    };

    const handleWindowDragLeave = (event: DragEvent | globalThis.DragEvent) => {
      if (!hasFileTransfer(event as DragEvent<HTMLElement>)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      const leftWindow =
        "clientX" in event &&
        "clientY" in event &&
        event.clientX === 0 &&
        event.clientY === 0;
      if (dragDepthRef.current === 0 || leftWindow) {
        resetDragState();
      }
    };

    const handleWindowDrop = (event: DragEvent | globalThis.DragEvent) => {
      if (!hasFileTransfer(event as DragEvent<HTMLElement>)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      resetDragState();
      if (files.length === 0) return;
      onFilesSelected(files);
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [disabled, onFilesSelected, resetDragState]);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFileTransfer(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsActive(true);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFileTransfer(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!isActive) {
        setIsActive(true);
      }
    },
    [disabled, isActive],
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFileTransfer(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsActive(false);
      }
    },
    [disabled],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFileTransfer(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files ?? []);
      resetDragState();
      if (files.length === 0) return;
      onFilesSelected(files);
    },
    [disabled, onFilesSelected, resetDragState],
  );

  return (
    <div
      className={["file-drop-overlay-wrap", isActive ? "is-active" : "", disabled ? "is-disabled" : ""]
        .filter(Boolean)
        .join(" ")}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isActive ? (
        <div className="file-drop-overlay-layer" aria-hidden="true">
          <div className="file-drop-overlay-panel">
            <div className="file-drop-overlay-icons">
              <FileArchive size={34} />
              <ArrowUpToLine size={28} />
            </div>
            <strong>{title}</strong>
            <p>{description}</p>
            {acceptHint ? <span>{acceptHint}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
