"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { isHiraganaReading } from "../lib/page-utils";
import { showAlertDialog } from "../lib/alert-dialog";
import { defaultUiPreferences } from "../lib/ui-preferences";
import type { SelectableOption } from "../lib/types";

export function TagInput({ tags, onChange, placeholder = "タグを入力", readOnly = false }) {
    const [draft, setDraft] = useState("");
    const draftRef = useRef("");
    const addTag = (value)=>{
        const nextTags = value.split(/[,\u3001]/).map((tag)=>tag.trim()).filter(Boolean);
        draftRef.current = "";
        setDraft("");
        if (nextTags.length === 0) return;
        onChange(Array.from(new Set([...tags, ...nextTags])));
    };
    const removeTag = (target)=>onChange(tags.filter((tag)=>tag !== target));
    return <div className="tag-input">
        {tags.map((tag)=><span className="tag-chip" key={tag}>
            <button
                type="button"
                className="tag-chip-remove-button"
                aria-label={`${tag}を削除`}
                disabled={readOnly}
                onClick={()=>removeTag(tag)}
            >
                <X size={14}/>
            </button>
            {tag}
        </span>)}
        <input
            value={draft}
            placeholder={placeholder}
            disabled={readOnly}
            readOnly={readOnly}
            onChange={(event)=>{
                draftRef.current = event.target.value;
                setDraft(event.target.value);
            }}
            onKeyDown={(event)=>{
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") {
                    event.preventDefault();
                    addTag(event.currentTarget.value);
                    event.currentTarget.value = "";
                }
                if (event.key === "Backspace" && draftRef.current === "" && tags.length > 0) {
                    event.preventDefault();
                    onChange(tags.slice(0, -1));
                }
            }}
            onBlur={()=>addTag(draftRef.current)}
        />
    </div>;
}

type SelectableTextInputProps = {
    value: string;
    placeholder: string;
    options: SelectableOption[];
    onChange: (value: string)=>void;
    onCommit?: (value: string)=>void;
    menuWidth?: number;
    fontSize?: number;
    disabled?: boolean;
};

export function SelectableTextInput({ value, placeholder, options, onChange, onCommit, menuWidth, fontSize, disabled = false }: SelectableTextInputProps) {
    const [isOpen, setIsOpen] = useState(false);
    const resolvedFontSize = fontSize ?? 13;
    const menuItemHeight = Math.max(24, resolvedFontSize + 14);
    const triggerSize = Math.max(20, resolvedFontSize + 10);
    const inputPaddingRight = triggerSize + 18;
    const iconSize = Math.max(10, Math.min(18, resolvedFontSize + 2));
    const [menuPosition, setMenuPosition] = useState({
        left: 0,
        top: 0,
        width: 180,
        placement: "down" as "down" | "up",
        maxHeight: undefined as number | undefined
    });
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const normalizedOptions = options.map((option)=>typeof option === "string" ? { value: option, label: option } : option);
    const displayValue = normalizedOptions.find((option)=>option.value === value)?.label ?? value;
    const estimateMenuWidth = ()=>{
        if (typeof document === "undefined") return menuWidth ?? 0;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return menuWidth ?? 0;
        context.font = `800 ${resolvedFontSize}px sans-serif`;
        const widestLabel = normalizedOptions.reduce((maxWidth, option)=>Math.max(maxWidth, context.measureText(option.label).width), 0);
        return Math.ceil(widestLabel + 20 + 10 + 16 + 16);
    };
    const updateMenuPosition = ()=>{
        const rect = wrapRef.current?.getBoundingClientRect();
        if (rect) {
            const measuredWidth = estimateMenuWidth();
            const nextWidth = Math.max(rect.width, menuWidth ?? 0, measuredWidth, 150);
            const estimatedHeight = normalizedOptions.length * menuItemHeight + 12;
            const shouldScroll = normalizedOptions.length > 30;
            const nextMaxHeight = shouldScroll ? 30 * menuItemHeight + 12 : undefined;
            const openUp = rect.bottom + 6 + estimatedHeight > window.innerHeight - 12 && rect.top - 6 - estimatedHeight >= 12;
            const alignedLeft = nextWidth > rect.width ? rect.right - nextWidth : rect.left;
            const clampedLeft = Math.min(Math.max(12, alignedLeft), window.innerWidth - nextWidth - 12);
            setMenuPosition({
                left: clampedLeft,
                top: openUp ? rect.top - 6 : rect.bottom + 6,
                width: nextWidth,
                placement: openUp ? "up" : "down",
                maxHeight: nextMaxHeight
            });
        }
    };
    const openMenu = ()=>{
        if (disabled) return;
        updateMenuPosition();
        setIsOpen((current)=>!current);
    };
    useEffect(()=>{
        if (!isOpen) return;
        const handlePointerDown = (event: globalThis.MouseEvent)=>{
            const target = event.target as Node;
            if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent)=>{
            if (event.key === "Escape") {
                event.preventDefault();
                setIsOpen(false);
            }
        };
        let frameId = 0;
        const handleViewportChange = ()=>{
            if (frameId) cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(()=>{
                updateMenuPosition();
            });
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);
        return ()=>{
            if (frameId) cancelAnimationFrame(frameId);
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("resize", handleViewportChange);
            window.removeEventListener("scroll", handleViewportChange, true);
        };
    }, [
        isOpen,
        menuItemHeight,
        menuWidth,
        normalizedOptions,
        resolvedFontSize
    ]);
    const menu = isOpen && typeof document !== "undefined" ? createPortal(<div className={`story-type-menu floating-story-type-menu ${menuPosition.placement === "up" ? "open-up" : "open-down"}`} ref={menuRef} style={{
        left: menuPosition.left,
        top: menuPosition.top,
        width: menuPosition.width,
        maxHeight: menuPosition.maxHeight,
        "--selectable-text-font-size": `${resolvedFontSize}px`,
        "--selectable-menu-item-height": `${menuItemHeight}px`,
        "--selectable-icon-size": `${iconSize}px`
    } as CSSProperties} onMouseDown={(event)=>{
        event.preventDefault();
        event.stopPropagation();
    }} onClick={(event)=>event.stopPropagation()}>
            {normalizedOptions.map((option)=><button
                type="button"
                className="menu-like-option"
                onMouseDown={(event)=>{
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onClick={(event)=>{
                    event.stopPropagation();
                    onChange(option.value);
                    onCommit?.(option.value);
                    setIsOpen(false);
                }}
                key={option.value}
            >
                <span className="menu-like-option-icon" aria-hidden="true"/>
                <span className="menu-like-option-label">{option.label}</span>
            </button>)}
        </div>, document.body) : null;
    return <div className="story-type-input selectable-text-input" ref={wrapRef} style={{
        "--selectable-text-font-size": `${resolvedFontSize}px`,
        "--selectable-menu-item-height": `${menuItemHeight}px`,
        "--selectable-trigger-size": `${triggerSize}px`,
        "--selectable-input-padding-right": `${inputPaddingRight}px`,
        "--selectable-icon-size": `${iconSize}px`
    } as CSSProperties}>
        <input
            value={displayValue}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={disabled}
            onChange={(event)=>{
                onChange(event.target.value);
                setIsOpen(false);
            }}
            onFocus={()=>setIsOpen(false)}
            onBlur={()=>onCommit?.(value)}
        />
        <button type="button" aria-label="候補" disabled={disabled} onClick={openMenu}>
            <ChevronDown size={iconSize}/>
        </button>
        {menu}
    </div>;
}

type TitleReadingInputProps = {
    titleLabel: string;
    readingLabel: string;
    title: string;
    reading: string;
    isCompletionEnabled: boolean;
    isRequired?: boolean;
    onCompletionEnabledChange: (value: boolean)=>void;
    onTitleChange: (value: string)=>void;
    onReadingChange: (value: string)=>void;
    onTitleBlur?: (value: string)=>void;
    onReadingBlur?: (value: string)=>void;
    onContextMenu?: (event: ReactMouseEvent<HTMLElement>)=>void;
    readOnly?: boolean;
};

export function TitleReadingInput({ titleLabel, readingLabel, title, reading, isCompletionEnabled, isRequired = false, onCompletionEnabledChange, onTitleChange, onReadingChange, onTitleBlur, onReadingBlur, onContextMenu, readOnly = false }: TitleReadingInputProps) {
    const [isConvertingKana, setIsConvertingKana] = useState(false);
    const isReadingInvalid = reading.trim().length > 0 && !isHiraganaReading(reading);
    const readingErrorMessage = "読みはひらがなと長音「ー」のみで入力してください（記号・数字不可）";
    const handleTitleChange = (value)=>{
        onTitleChange(value);
    };
    const handleKanaCompletion = async ()=>{
        const sourceText = title.trim();
        if (!sourceText || isConvertingKana) return;
        setIsConvertingKana(true);
        try {
            const response = await fetch("/api/kana", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: sourceText
                })
            });
            const body = await response.json() as { kana?: string; error?: string };
            if (!response.ok) {
                throw new Error(body.error || "かな補完に失敗しました");
            }
            const nextReading = body.kana ?? "";
            onReadingChange(nextReading);
            if (!isHiraganaReading(nextReading)) {
                return;
            }
            onReadingBlur?.(nextReading);
            onCompletionEnabledChange(false);
        } catch (error) {
            await showAlertDialog({
                title: "かな補完エラー",
                message: error instanceof Error ? error.message : "かな補完に失敗しました",
                confirmLabel: "OK"
            });
        } finally {
            setIsConvertingKana(false);
        }
    };
    return <div className={isRequired ? "title-reading-input required-field" : "title-reading-input"} onContextMenu={onContextMenu}>
        <input value={title} placeholder={titleLabel} aria-required={isRequired} aria-readonly={readOnly} readOnly={readOnly} onChange={(event)=>handleTitleChange(event.target.value)} onBlur={(event)=>onTitleBlur?.(event.currentTarget.value)} onContextMenu={onContextMenu}/>
        <div className="reading-row">
            <input
                value={reading}
                placeholder={readingLabel}
                aria-required={isRequired}
                aria-invalid={isReadingInvalid}
                aria-readonly={readOnly}
                className={isReadingInvalid ? "reading-invalid" : undefined}
                readOnly={readOnly}
                onChange={(event)=>onReadingChange(event.target.value)}
                onContextMenu={onContextMenu}
                onBlur={(event)=>{
                    if (!isHiraganaReading(event.currentTarget.value)) {
                        return;
                    }
                    onReadingBlur?.(event.currentTarget.value);
                }}
            />
            <button
                type="button"
                className={isConvertingKana || isCompletionEnabled ? "prediction-toggle on" : "prediction-toggle"}
                disabled={readOnly || !title.trim() || isConvertingKana}
                onMouseDown={(event)=>{
                    event.preventDefault();
                }}
                onClick={handleKanaCompletion}
            >
                {isConvertingKana ? "変換中" : "かな補完"}
            </button>
        </div>
        {isReadingInvalid && <div className="reading-validation-message" role="alert">
            {readingErrorMessage}
        </div>}
    </div>;
}

export function KgtInputSet({ volume, issue, total, onVolumeChange, onIssueChange, onTotalChange, onVolumeBlur, onIssueBlur, onTotalBlur }) {
    const handleNumericInput = (event)=>{
        event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "");
    };
    const handleCommitKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, onCommit?: (value: string)=>void)=>{
        if (!onCommit || event.nativeEvent.isComposing) return;
        if (event.key !== "Tab" && event.key !== "Enter") return;
        event.currentTarget.dataset.skipBlurCommit = event.currentTarget.value;
        onCommit(event.currentTarget.value);
        if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
        }
    };
    const handleCommitBlur = (event: React.FocusEvent<HTMLInputElement>, onCommit?: (value: string)=>void)=>{
        if (!onCommit) return;
        const pendingValue = event.currentTarget.dataset.skipBlurCommit;
        const nextValue = event.currentTarget.value;
        delete event.currentTarget.dataset.skipBlurCommit;
        if (pendingValue != null && pendingValue === nextValue) {
            return;
        }
        onCommit(nextValue);
    };
    return <div className="kgt-inline-field" role="group" aria-label="巻号">
        <div className="kgt-inline-group">
            <span className="kgt-inline-label">巻号</span>
            <input className="kgt-inline-input" value={volume} placeholder="巻" inputMode="numeric" pattern="[0-9]*" onInput={handleNumericInput} onChange={(event)=>onVolumeChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onVolumeBlur)} onBlur={(event)=>handleCommitBlur(event, onVolumeBlur)}/>
        </div>
        <input className="kgt-inline-input" value={issue} placeholder="号" inputMode="numeric" pattern="[0-9]*" onInput={handleNumericInput} onChange={(event)=>onIssueChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onIssueBlur)} onBlur={(event)=>handleCommitBlur(event, onIssueBlur)}/>
        <input className="kgt-inline-input" value={total} placeholder="通巻" inputMode="numeric" pattern="[0-9]*" onInput={handleNumericInput} onChange={(event)=>onTotalChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onTotalBlur)} onBlur={(event)=>handleCommitBlur(event, onTotalBlur)}/>
    </div>;
}

export function MdInputSet({ label, month, day, onMonthChange, onDayChange, onMonthBlur, onDayBlur }) {
    const normalizeInput = (event)=>{ event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, defaultUiPreferences.dateMonthDayMaxDigits); };
    const handleCommitKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, onCommit?: (value: string)=>void)=>{
        if (!onCommit || event.nativeEvent.isComposing) return;
        if (event.key !== "Tab" && event.key !== "Enter") return;
        event.currentTarget.dataset.skipBlurCommit = event.currentTarget.value;
        onCommit(event.currentTarget.value);
        if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
        }
    };
    const handleCommitBlur = (event: React.FocusEvent<HTMLInputElement>, onCommit?: (value: string)=>void)=>{
        if (!onCommit) return;
        const pendingValue = event.currentTarget.dataset.skipBlurCommit;
        const nextValue = event.currentTarget.value;
        delete event.currentTarget.dataset.skipBlurCommit;
        if (pendingValue != null && pendingValue === nextValue) {
            return;
        }
        onCommit(nextValue);
    };
    return <div className="ymd-inline-field md-inline-field" role="group" aria-label={label}>
        <div className="ymd-inline-group">
            <span className="ymd-inline-label">{label}</span>
            <input className="ymd-inline-input md" value={month} placeholder="月" inputMode="numeric" pattern="[0-9]*" maxLength={2} onInput={normalizeInput} onChange={(event)=>onMonthChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onMonthBlur)} onBlur={(event)=>handleCommitBlur(event, onMonthBlur)}/>
        </div>
        <input className="ymd-inline-input md" value={day} placeholder="日" inputMode="numeric" pattern="[0-9]*" maxLength={2} onInput={normalizeInput} onChange={(event)=>onDayChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onDayBlur)} onBlur={(event)=>handleCommitBlur(event, onDayBlur)}/>
    </div>;
}

export function YmdInputSet({ label, year, month, day, onYearChange, onMonthChange, onDayChange, onYearBlur, onMonthBlur, onDayBlur }) {
    const normalizeYear = (event)=>{ event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, defaultUiPreferences.dateYearMaxDigits); };
    const normalizeMonthDay = (event)=>{ event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, defaultUiPreferences.dateMonthDayMaxDigits); };
    const handleCommitKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, onCommit?: (value: string)=>void)=>{
        if (!onCommit || event.nativeEvent.isComposing) return;
        if (event.key !== "Tab" && event.key !== "Enter") return;
        event.currentTarget.dataset.skipBlurCommit = event.currentTarget.value;
        onCommit(event.currentTarget.value);
        if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
        }
    };
    const handleCommitBlur = (event: React.FocusEvent<HTMLInputElement>, onCommit?: (value: string)=>void)=>{
        if (!onCommit) return;
        const pendingValue = event.currentTarget.dataset.skipBlurCommit;
        const nextValue = event.currentTarget.value;
        delete event.currentTarget.dataset.skipBlurCommit;
        if (pendingValue != null && pendingValue === nextValue) {
            return;
        }
        onCommit(nextValue);
    };
    return <div className="ymd-inline-field" role="group" aria-label={label}>
        <div className="ymd-inline-group">
            <span className="ymd-inline-label">{label}</span>
            <input className="ymd-inline-input year" value={year} placeholder="年" inputMode="numeric" pattern="[0-9]*" maxLength={4} onInput={normalizeYear} onChange={(event)=>onYearChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onYearBlur)} onBlur={(event)=>handleCommitBlur(event, onYearBlur)}/>
        </div>
        <input className="ymd-inline-input md" value={month} placeholder="月" inputMode="numeric" pattern="[0-9]*" maxLength={2} onInput={normalizeMonthDay} onChange={(event)=>onMonthChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onMonthBlur)} onBlur={(event)=>handleCommitBlur(event, onMonthBlur)}/>
        <input className="ymd-inline-input md" value={day} placeholder="日" inputMode="numeric" pattern="[0-9]*" maxLength={2} onInput={normalizeMonthDay} onChange={(event)=>onDayChange(event.target.value)} onKeyDown={(event)=>handleCommitKeyDown(event, onDayBlur)} onBlur={(event)=>handleCommitBlur(event, onDayBlur)}/>
    </div>;
}

export function NameSuggestionList({ suggestions, onSelect }) {
    if (suggestions.length === 0) return null;
    return <div className="name-suggestion-list">
        {suggestions.map((suggestion)=><button type="button" onMouseDown={(event)=>event.preventDefault()} onClick={()=>onSelect(suggestion)} key={suggestion}>
            {suggestion}
        </button>)}
    </div>;
}

export function SimpleTable({ headers, rows }) {
    const gridTemplateColumns = `repeat(${headers.length}, minmax(120px, 1fr))`;
    return <div className="simple-table">
        <div className="simple-table-row head" style={{ gridTemplateColumns }}>
            {headers.map((header)=><span key={header}>{header}</span>)}
        </div>
        {rows.map((row)=><button className="simple-table-row" style={{ gridTemplateColumns }} key={row.join("-")}>
            {row.map((cell)=><span key={cell}>{cell}</span>)}
        </button>)}
    </div>;
}
