"use client";

import { Book, BookOpen, Building2, ClipboardCheck, Construction, Eye, LockKeyhole, SquareLibrary, UserCog, UsersRound } from "lucide-react";
import { approvals, authorMasterRecords, magazineMasterRecords, publisherMasterRecords, users } from "../lib/sample-data";
import { buildIssueDisplayLabel } from "../lib/page-utils";
import { defaultUiPreferences } from "../lib/ui-preferences";
import type { ContentRow, ExistingIssue, IssueForm, MagazineHistoryItem, StoryRow, ViewKey } from "../lib/types";

type MobileReadOnlyViewProps = {
    view: ViewKey;
    selectedMagazine: MagazineHistoryItem | null;
    selectedIssue: ExistingIssue;
    issueForm: IssueForm;
    storyRows: StoryRow[];
    contentRows: ContentRow[];
};

export function MobileReadOnlyView({ view, selectedMagazine, selectedIssue, issueForm, storyRows, contentRows }: MobileReadOnlyViewProps) {
    if (view === "view") {
        return <article className="mobile-view mobile-view-placeholder" aria-label="Viewモード">
            <section className="mobile-view-placeholder-panel">
                <div className="mobile-view-mode">
                    <Eye size={15}/>
                    Viewモード
                </div>
                <div className="mobile-view-placeholder-mark">
                    <Eye size={28}/>
                </div>
                <div className="mobile-view-placeholder-copy">
                    <h1>Viewモード</h1>
                    <p>スマホでは View モードを表示します。編集モードとアカウントモードは PC またはタブレットで利用します。</p>
                </div>
            </section>
        </article>;
    }
    if (view === "books") return <BooksUnderConstructionView compact/>;
    const magazine = magazineMasterRecords.find((record)=>record.id === "M119459") ?? magazineMasterRecords[0];
    const author = authorMasterRecords.find((record)=>record.id === "A48012") ?? authorMasterRecords[0];
    const publisher = publisherMasterRecords.find((record)=>record.id === "P4080000000") ?? publisherMasterRecords[0];
    const issueDate = [
        issueForm.displayReleaseYear,
        issueForm.displayReleaseMonth,
        issueForm.displayReleaseDay
    ].filter(Boolean).join("-");
    const issueLabel = buildIssueDisplayLabel(issueForm) || selectedIssue.label;
    const issueContents = [
        ...storyRows.filter((row)=>row.title.trim()).map((row)=>({
                label: row.storyType || "作品",
                title: row.title,
                detail: row.authors || row.memo
            })),
        ...contentRows.filter((row)=>row.contentType.trim()).map((row)=>({
                label: "コンテンツ",
                title: row.contentType,
                detail: row.detail || [
                    row.pageStart,
                    row.pageEnd
                ].filter(Boolean).join("-")
            }))
    ].slice(0, defaultUiPreferences.mobilePreviewContentMaxItems);
    const viewData = {
        mi: {
            icon: BookOpen,
            type: "雑誌個別",
            title: issueForm.issueTitle || selectedMagazine?.title || "雑誌個別",
            reading: issueForm.titleReading,
            id: selectedIssue.id,
            status: issueForm.status || selectedIssue.status,
            facts: [
                ["親雑誌", selectedMagazine?.title ?? issueForm.magazineTitle],
                ["発売日", issueDate || selectedIssue.date],
                ["表示ラベル", issueLabel],
                ["刊行頻度", issueForm.publicationFrequency || "不明"],
                ["出版社", selectedMagazine?.publisher ?? "出版社不明"],
                ["媒体", issueForm.mediaFormat === "print" ? "紙" : issueForm.mediaFormat === "digital" ? "電子" : issueForm.mediaFormat || "不明"]
            ],
            tags: [
                issueLabel,
                issueForm.isSpecialIssue ? "特別号" : "通常号"
            ].filter(Boolean),
            listTitle: "掲載内容",
            list: issueContents
        },
        magazines: {
            icon: SquareLibrary,
            type: "雑誌マスター",
            title: magazine.name,
            reading: magazine.reading,
            id: magazine.id,
            status: "active",
            facts: [
                ["出版社", "集英社"],
                ["刊行頻度", magazine.publicationFrequency.join("、")],
                ["創刊日", magazine.firstPublishedDate],
                ["ISSN", magazine.issn]
            ],
            tags: magazine.tag,
            listTitle: "関連情報",
            list: [
                {
                    label: "関連誌",
                    title: "週刊少年マガジン",
                    detail: "M119033"
                }
            ]
        },
        authors: {
            icon: UsersRound,
            type: "著者",
            title: author.name,
            reading: author.reading,
            id: author.id,
            status: "active",
            facts: [
                ["別名義", "なし"],
                ["登録作品", "ONE PIECE"],
                ["SNS", "X 公式アカウント"]
            ],
            tags: [
                "漫画家",
                "少年漫画"
            ],
            listTitle: "主な作品",
            list: [
                {
                    label: "連載",
                    title: "ONE PIECE",
                    detail: "週刊少年ジャンプ"
                }
            ]
        },
        publishers: {
            icon: Building2,
            type: "出版社",
            title: publisher.name,
            reading: publisher.reading,
            id: publisher.id,
            status: "active",
            facts: [
                ["URL", publisher.url],
                ["住所", publisher.address || "未登録"],
                ["関連会社", "1件"]
            ],
            tags: [
                "出版社",
                "漫画"
            ],
            listTitle: "主な雑誌",
            list: [
                {
                    label: "週刊",
                    title: "週刊少年ジャンプ",
                    detail: "M119459"
                },
                {
                    label: "月刊",
                    title: "りぼん",
                    detail: "M300001"
                }
            ]
        },
        approvals: {
            icon: ClipboardCheck,
            type: "承認待ち",
            title: approvals[0][2],
            reading: "",
            id: approvals[0][0],
            status: approvals[0][3],
            facts: [
                ["申請種別", approvals[0][1]],
                ["状態", approvals[0][3]],
                ["申請者", "専門家"]
            ],
            tags: [
                "申請データ"
            ],
            listTitle: "申請内容",
            list: approvals.slice(1, 3).map((approval)=>({
                    label: approval[1],
                    title: approval[2],
                    detail: approval[3]
                }))
        },
        users: {
            icon: UserCog,
            type: "ユーザー",
            title: users[0][1],
            reading: "",
            id: users[0][0],
            status: users[0][3],
            facts: [
                ["権限", users[0][2]],
                ["状態", users[0][3]],
                ["認証", users[0][4]]
            ],
            tags: [
                "管理者"
            ],
            listTitle: "アカウント情報",
            list: users.slice(1, 3).map((user)=>({
                    label: user[2],
                    title: user[1],
                    detail: user[3]
                }))
        }
    }[view];
    const ViewIcon = viewData.icon;
    return <article className="mobile-view" aria-label={`${viewData.type}閲覧画面`}>
        <div className="mobile-view-mode">
            <Eye size={15}/>
            閲覧モード
        </div>
        <header className="mobile-view-hero">
            <div className="mobile-view-icon">
                <ViewIcon size={24}/>
            </div>
            <div>
                <span>{viewData.type}</span>
                <h1>{viewData.title}</h1>
                {viewData.reading && <p>{viewData.reading}</p>}
            </div>
        </header>
        <div className="mobile-view-identity">
            <span>{viewData.id}</span>
            <span className={`mobile-view-status status-${viewData.status}`}>{viewData.status}</span>
        </div>
        <section className="mobile-view-card">
            <h2>基本情報</h2>
            <dl className="mobile-view-facts">
                {viewData.facts.map(([label, value])=><div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "未登録"}</dd>
                </div>)}
            </dl>
        </section>
        {viewData.tags.length > 0 && <section className="mobile-view-card">
            <h2>タグ</h2>
            <div className="mobile-view-tags">
                {viewData.tags.map((tag)=><span key={tag}>{tag}</span>)}
            </div>
        </section>}
        <section className="mobile-view-card">
            <h2>{viewData.listTitle}</h2>
            <div className="mobile-view-list">
                {viewData.list.length > 0 ? viewData.list.map((item, index)=><div key={`${item.label}-${item.title}-${index}`}>
                    <span>{item.label}</span>
                    <strong>{item.title}</strong>
                    {item.detail && <small>{item.detail}</small>}
                </div>) : <p className="mobile-view-empty">表示できる情報はありません</p>}
            </div>
        </section>
        <p className="mobile-view-note">スマホでは閲覧のみです。編集はPCまたはタブレットで行えます。</p>
    </article>;
}

export function BooksUnderConstructionView({ compact = false }: {
    compact?: boolean;
}) {
    return <section className={compact ? "books-construction-view compact" : "books-construction-view"} aria-label="単行本 工事中">
        <div className="books-construction-mark">
            <Book size={44}/>
            <span>
                <Construction size={24}/>
            </span>
        </div>
        <div className="books-construction-copy">
            <span className="books-construction-badge">
                <Construction size={15}/>
                工事中
            </span>
            <h2>単行本データベースは準備中です</h2>
            <p>現在は雑誌データベースの整備を優先しています。単行本の閲覧・追加・編集機能は、仕様が確定するまで利用できません。</p>
        </div>
        <div className="books-construction-lock">
            <LockKeyhole size={17}/>
            すべての単行本機能を停止中
        </div>
    </section>;
}

export function MissingMagazinePanel({ onOpenMagazines }: {
    onOpenMagazines: ()=>void;
}) {
    return <section className="panel missing-magazine-panel">
        <div>
            <h2>作業するMを決められませんでした</h2>
            <p>履歴を取得できない場合は、雑誌マスター編集でMを検索し、対象Mから雑誌個別編集へ移動します。</p>
        </div>
        <button className="primary-button" onClick={onOpenMagazines}>
            <SquareLibrary size={16}/>
            雑誌マスター編集へ
        </button>
    </section>;
}
