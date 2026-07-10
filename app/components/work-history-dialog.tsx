"use client";

import { BookOpen, Building2, CircleX, Clock3, History, SquareLibrary, UsersRound } from "lucide-react";

export type WorkHistoryDialogEntry = {
  id: string;
  label: string;
  updatedAtLabel: string;
  isActive: boolean;
  kind: "author" | "publisher" | "magazine_title" | "magazine_issue";
};

type WorkHistoryDialogProps = {
  entries: WorkHistoryDialogEntry[];
  error: string;
  isLoading: boolean;
  isOpen: boolean;
  onClose: ()=>void;
  onSelect: (entryId: string)=>void;
};

export function WorkHistoryDialog({
  entries,
  error,
  isLoading,
  isOpen,
  onClose,
  onSelect
}: WorkHistoryDialogProps) {
  const renderItemIcon = (kind: WorkHistoryDialogEntry["kind"])=>{
    if (kind === "author") return <UsersRound size={18}/>;
    if (kind === "publisher") return <Building2 size={18}/>;
    if (kind === "magazine_title") return <SquareLibrary size={18}/>;
    return <BookOpen size={18}/>;
  };
  if (!isOpen) return null;
  return <div className="plain-dialog-layer work-history-dialog-layer" role="dialog" aria-modal="true" aria-label="操作履歴">
    <div className="modal-blocking-backdrop plain-dialog-backdrop" aria-hidden="true"/>
    <section className="plain-dialog work-history-dialog">
      <header className="plain-dialog-header">
        <div>
          <strong>操作履歴</strong>
          <span>直近で操作した編集パネルを開き直します。</span>
        </div>
        <button type="button" className="issue-sidebar-close" aria-label="閉じる" onClick={onClose}>
          <CircleX size={28}/>
        </button>
      </header>
      <div className="work-history-dialog-body">
        {isLoading ? <div className="work-history-empty">
          <Clock3 size={18}/>
          <span>操作履歴を読み込んでいます。</span>
        </div> : error ? <div className="work-history-empty error">
          <History size={18}/>
          <span>{error}</span>
        </div> : entries.length === 0 ? <div className="work-history-empty">
          <History size={18}/>
          <span>操作履歴はまだありません。</span>
        </div> : <div className="work-history-list">
          {entries.map((entry)=><button
            type="button"
            key={entry.id}
            className={entry.isActive ? "work-history-item active" : "work-history-item"}
            onClick={()=>onSelect(entry.id)}
          >
            <div className="work-history-item-main">
              <span className="work-history-item-icon" aria-hidden="true">{renderItemIcon(entry.kind)}</span>
              <span>{entry.label}</span>
            </div>
            <small>{entry.updatedAtLabel}</small>
          </button>)}
        </div>}
      </div>
      <footer className="work-history-dialog-footer">
        <button type="button" className="secondary-button" onClick={onClose}>閉じる</button>
      </footer>
    </section>
  </div>;
}
