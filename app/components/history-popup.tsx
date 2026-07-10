import { FilePen } from "lucide-react";

export type HistoryPopupEntry = {
    id: string;
    title: string;
    detail: string;
    isActive: boolean;
    onSelect: ()=>void;
};

type HistoryPopupProps = {
    entries: HistoryPopupEntry[];
    isOpen: boolean;
    onToggle: ()=>void;
};

export function HistoryPopup({ entries, isOpen, onToggle }: HistoryPopupProps) {
    if (entries.length === 0) return null;
    return <div className="history-menu-wrap">
        <button className="history-button" onClick={onToggle}>
            <FilePen size={16}/>
            履歴
        </button>
        {isOpen && <div className="history-popup" role="dialog" aria-label="編集履歴リスト">
            <div className="history-popup-head">
                <strong>編集履歴リスト</strong>
            </div>
            <div className="history-list">
                {entries.map((entry)=><button className={entry.isActive ? "history-item active" : "history-item"} onClick={entry.onSelect} key={entry.id}>
                    <strong>{entry.title}</strong>
                    <small>{entry.detail}</small>
                </button>)}
            </div>
            <div className="history-popup-footer"/>
        </div>}
    </div>;
}
