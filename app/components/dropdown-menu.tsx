"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export type DropdownMenuItem = {
  id: string;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children?: DropdownMenuItem[];
  render?: ReactNode;
  kind?: "item" | "separator" | "custom";
};

type DropdownMenuProps = {
  items: DropdownMenuItem[];
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
  trigger: (props: {
    isOpen: boolean;
    toggle: () => void;
    buttonRef: React.RefObject<HTMLButtonElement | null>;
    ariaProps: {
      "aria-expanded": boolean;
      "aria-haspopup": "menu";
    };
  }) => ReactNode;
};

type DropdownMenuPanelProps = {
  items: DropdownMenuItem[];
  closeRoot: () => void;
  className?: string;
  level?: number;
};

type MenuPlacement = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  placement: "down" | "up";
};

function DropdownMenuPanel({ items, closeRoot, className, level = 0 }: DropdownMenuPanelProps) {
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [submenuDirection, setSubmenuDirection] = useState<Record<string, "left" | "right">>({});
  const submenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const itemsWithChildren = useMemo(
    () => items.filter((item) => item.kind !== "separator" && item.children?.length),
    [items],
  );

  useLayoutEffect(() => {
    if (!openSubmenuId) return;
    const element = submenuRefs.current[openSubmenuId];
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const nextDirection = rect.right > window.innerWidth - 12 ? "left" : "right";
    setSubmenuDirection((current) =>
      current[openSubmenuId] === nextDirection ? current : { ...current, [openSubmenuId]: nextDirection },
    );
  }, [openSubmenuId, itemsWithChildren]);

  return (
    <div className={className ?? "dropdown-menu-panel"} role={level === 0 ? "menu" : "menu"}>
      {items.map((item) => {
        if (item.kind === "separator") {
          return <div key={item.id} className="dropdown-menu-separator" role="separator" />;
        }
        if (item.kind === "custom") {
          return <div key={item.id} className="dropdown-menu-custom-row">{item.render}</div>;
        }
        const hasChildren = Boolean(item.children?.length);
        const submenuAlign = submenuDirection[item.id] ?? "right";
        return (
          <div
            key={item.id}
            className="dropdown-menu-item-wrap"
            onMouseEnter={() => setOpenSubmenuId(hasChildren ? item.id : null)}
            onMouseLeave={() => setOpenSubmenuId((current) => (current === item.id ? null : current))}
          >
            <button
              type="button"
              role="menuitem"
              className={[
                "dropdown-menu-item",
                item.danger ? "danger" : "",
                item.disabled ? "disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                if (hasChildren) {
                  setOpenSubmenuId((current) => (current === item.id ? null : item.id));
                  return;
                }
                item.onSelect?.();
                closeRoot();
              }}
            >
              <span className="dropdown-menu-item-icon" aria-hidden="true">
                {item.icon ?? null}
              </span>
              <span className="dropdown-menu-item-label">{item.label}</span>
              <span className="dropdown-menu-item-arrow" aria-hidden="true">
                {hasChildren ? "▶" : ""}
              </span>
            </button>
            {hasChildren && openSubmenuId === item.id ? (
              <div
                ref={(node) => {
                  submenuRefs.current[item.id] = node;
                }}
                className={`dropdown-submenu-panel ${submenuAlign === "left" ? "align-left" : "align-right"}`}
              >
                <DropdownMenuPanel items={item.children ?? []} closeRoot={closeRoot} level={level + 1} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function DropdownMenu({
  items,
  align = "start",
  className,
  menuClassName,
  trigger,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<MenuPlacement>({
    placement: "down",
    top: 0,
    left: 0,
  });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const updatePlacement = () => {
    if (!buttonRef.current || !panelRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    const gap = 8;
    const viewportPadding = 12;
    const openUp =
      buttonRect.bottom + gap + panelRect.height > window.innerHeight - viewportPadding &&
      buttonRect.top - gap - panelRect.height >= viewportPadding;

    if (align === "end") {
      setPlacement({
        placement: openUp ? "up" : "down",
        right: Math.max(viewportPadding, window.innerWidth - buttonRect.right),
        ...(openUp
          ? { bottom: Math.max(viewportPadding, window.innerHeight - buttonRect.top + gap) }
          : { top: Math.max(viewportPadding, buttonRect.bottom + gap) }),
      });
      return;
    }

    setPlacement({
      placement: openUp ? "up" : "down",
      left: Math.max(viewportPadding, buttonRect.left),
      ...(openUp
        ? { bottom: Math.max(viewportPadding, window.innerHeight - buttonRect.top + gap) }
        : { top: Math.max(viewportPadding, buttonRect.bottom + gap) }),
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    };
    let frameId = 0;
    const handleViewportChange = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        updatePlacement();
      });
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [align, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePlacement();
  }, [align, isOpen]);

  const closeRoot = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const panelClassName = [
    "dropdown-menu-popover",
    align === "end" ? "align-end" : "align-start",
    placement.placement === "up" ? "open-up" : "open-down",
    menuClassName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={["dropdown-menu-wrap", className ?? ""].filter(Boolean).join(" ")} ref={wrapRef}>
      {trigger({
        isOpen,
        toggle: () => setIsOpen((current) => !current),
        buttonRef,
        ariaProps: {
          "aria-expanded": isOpen,
          "aria-haspopup": "menu",
        },
      })}
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div ref={panelRef} className={panelClassName} style={placement as CSSProperties}>
              <DropdownMenuPanel items={items} closeRoot={closeRoot} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
