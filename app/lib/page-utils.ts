import type {
    AutocompleteOption,
    ContentRow,
    IssueForm,
    IssueStringKey,
    RoleNameRow,
    StoryRow
} from "./types";
import { showAlertDialog, showConfirmDialog } from "./alert-dialog";
import { defaultUiPreferences } from "./ui-preferences";

const readingDictionary: Record<string, string> = {
    週刊少年ジャンプ: "しゅうかんしょうねんじゃんぷ",
    週刊少年マガジン: "しゅうかんしょうねんまがじん",
    月刊コミックビーム: "げっかんこみっくびーむ",
    表紙: "ひょうし",
    裏表紙: "うらびょうし",
    目次: "もくじ"
};

export const parseIssueDate = (date: string)=>{
    const [year = "", month = "", day = ""] = date.split("-");
    return {
        year,
        month: month.replace(/^0/, ""),
        day: day.replace(/^0/, "")
    };
};

export const predictReading = (value: string)=>{
    if (readingDictionary[value]) return readingDictionary[value];
    return value.replace(/[ァ-ン]/g, (char)=>String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/[^\u3040-\u309fー]/g, "");
};

export const isHiraganaReading = (value: string)=>{
    const trimmed = value.trim();
    return trimmed === "" || /^[ぁ-ゖー]+$/.test(trimmed);
};

export const showReadingValidationAlert = (labels: string[])=>{
    if (typeof window === "undefined" || labels.length === 0) return;
    void showAlertDialog({
        title: "入力エラー",
        message: `読み欄はひらがなと長音「ー」のみで入力してください。\n\n対象:\n- ${labels.join("\n- ")}`
    });
};

export const normalizeNumericText = (value: string)=>value.trim().replace(/[０-９]/g, (char)=>String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/[．。]/g, ".").replace(/[－−]/g, "-");

export const isDecimalNumericText = (value: string)=>{
    const normalized = normalizeNumericText(value);
    return normalized === "" || /^\d+(?:\.\d+)?$/.test(normalized);
};

export const isIntegerNumericText = (value: string)=>{
    const normalized = normalizeNumericText(value);
    return normalized === "" || /^\d+$/.test(normalized);
};

export const isSignedDecimalNumericText = (value: string)=>{
    const normalized = normalizeNumericText(value);
    return normalized === "" || /^-?\d+(?:\.\d+)?$/.test(normalized);
};

export const showNumericValidationAlert = (labels: string[])=>{
    if (typeof window === "undefined" || labels.length === 0) return;
    void showAlertDialog({
        title: "入力エラー",
        message: `数字欄は半角数字で入力してください。小数点は使用できます。\n\n対象:\n- ${labels.join("\n- ")}`
    });
};

export const showIntegerValidationAlert = (labels: string[])=>{
    if (typeof window === "undefined" || labels.length === 0) return;
    void showAlertDialog({
        title: "入力エラー",
        message: `半角数字のみで入力してください。\n\n対象:\n- ${labels.join("\n- ")}`
    });
};

export const showSignedDecimalValidationAlert = (labels: string[])=>{
    if (typeof window === "undefined" || labels.length === 0) return;
    void showAlertDialog({
        title: "入力エラー",
        message: `半角数字で入力してください。小数点、0、マイナスを使用できます。\n\n対象:\n- ${labels.join("\n- ")}`
    });
};

export const isMonthInRange = (value: string)=>{
    if (value.trim() === "") return true;
    if (!/^\d+$/.test(value)) return false;
    const month = Number(value);
    return month > 0 && month < 13;
};

export const isDayInRange = (value: string)=>{
    if (value.trim() === "") return true;
    if (!/^\d+$/.test(value)) return false;
    const day = Number(value);
    return day > 0 && day < 32;
};

export const showDateRangeValidationAlert = (labels: string[])=>{
    if (typeof window === "undefined" || labels.length === 0) return;
    void showAlertDialog({
        title: "入力エラー",
        message: `月は1〜12、日は1〜31で入力してください。\n\n対象:\n- ${labels.join("\n- ")}`
    });
};

export const calculateClickPopoverPosition = (clientX: number, clientY: number, width: number = defaultUiPreferences.popupDefaultWidth, estimatedHeight: number = defaultUiPreferences.selectionPopupEstimatedHeight)=>{
    const gutter = 16;
    const offset = 10;
    const safeWidth = Math.min(width, Math.max(160, window.innerWidth - gutter * 2));
    const left = Math.max(gutter, Math.min(clientX - 20, window.innerWidth - safeWidth - gutter));
    const belowTop = clientY + offset;
    const aboveTop = clientY - estimatedHeight - offset;
    const top = belowTop + estimatedHeight <= window.innerHeight - gutter ? belowTop : Math.max(gutter, aboveTop);
    return {
        left,
        top,
        width: safeWidth
    };
};

export const collectReadingValidationErrors = (issueForm: IssueForm, storyRows: StoryRow[])=>{
    const errors: string[] = [];
    if (!isHiraganaReading(issueForm.titleReading)) errors.push("雑誌個別の読み");
    if (!isHiraganaReading(issueForm.subtitleReading)) errors.push("雑誌個別サブタイトルの読み");
    storyRows.forEach((row, index)=>{
        const rowLabel = `作品リスト${index + 1}行目`;
        if (!isHiraganaReading(row.titleReading)) errors.push(`${rowLabel}: 作品タイトルの読み`);
        if (!isHiraganaReading(row.seriesReading ?? "")) errors.push(`${rowLabel}: シリーズ読み`);
        if (!isHiraganaReading(row.subtitleReading ?? "")) errors.push(`${rowLabel}: サブタイトル読み`);
    });
    return errors;
};

export const normalizeStoryNumericFields = (rows: StoryRow[])=>rows.map((row)=>({
    ...row,
    pageCount: normalizeNumericText(row.pageCount ?? ""),
    episodeNumber: normalizeNumericText(row.episodeNumber ?? "")
}));

export const normalizeContentNumericFields = (rows: ContentRow[])=>rows.map((row)=>({
    ...row,
    pageStart: normalizeNumericText(row.pageStart ?? ""),
    pageEnd: normalizeNumericText(row.pageEnd ?? "")
}));

export const issueNumericFields: Array<{ key: IssueStringKey; label: string }> = [
    { key: "releaseYear", label: "雑誌個別情報: 発売年" },
    { key: "releaseMonth", label: "雑誌個別情報: 発売月" },
    { key: "releaseDay", label: "雑誌個別情報: 発売日" },
    { key: "displayReleaseYear", label: "雑誌個別情報: 表示年" },
    { key: "displayReleaseMonth", label: "雑誌個別情報: 表示月" },
    { key: "displayReleaseDay", label: "雑誌個別情報: 表示日" },
    { key: "displayReleaseCombinedMonth", label: "雑誌個別情報: 表示年月日 合併月" },
    { key: "displayReleaseCombinedDay", label: "雑誌個別情報: 表示年月日 合併日" },
    { key: "publicationYear", label: "雑誌個別情報: 発行年" },
    { key: "publicationMonth", label: "雑誌個別情報: 発行月" },
    { key: "publicationDay", label: "雑誌個別情報: 発行日" },
    { key: "publicationCombinedMonth", label: "雑誌個別情報: 発行年月日 合併月" },
    { key: "publicationCombinedDay", label: "雑誌個別情報: 発行年月日 合併日" },
    { key: "issueNumber", label: "雑誌個別情報: 主号数" },
    { key: "volumeNumber", label: "雑誌個別情報: 巻" },
    { key: "totalIssueNumber", label: "雑誌個別情報: 通巻号" },
    { key: "volumeNumberDisplayed", label: "雑誌個別情報: 号数・Vol" },
    { key: "issueNumberCombined", label: "雑誌個別情報: 号数合併" },
    { key: "price", label: "雑誌個別情報: 価格" },
    { key: "numberOfPages", label: "雑誌個別情報: ページ数" }
];

export const issueIntegerFieldKeys = new Set<IssueStringKey>([
    "price",
    "numberOfPages"
]);

export const issueSignedDecimalFieldKeys = new Set<IssueStringKey>([
    "volumeNumberDisplayed",
    "issueNumberCombined"
]);

export const normalizeIssueNumericFields = (issueForm: IssueForm)=>issueNumericFields.reduce((nextIssueForm, field)=>({
    ...nextIssueForm,
    [field.key]: normalizeNumericText(nextIssueForm[field.key] ?? "")
}), issueForm);

export const collectNumericValidationErrors = (issueForm: IssueForm, storyRows: StoryRow[], contentRows: ContentRow[])=>{
    const errors: string[] = [];
    issueNumericFields.forEach((field)=>{
        const value = issueForm[field.key] ?? "";
        if (!issueIntegerFieldKeys.has(field.key) && !issueSignedDecimalFieldKeys.has(field.key) && !isDecimalNumericText(value)) errors.push(field.label);
    });
    storyRows.forEach((row, index)=>{
        const rowLabel = `作品リスト${index + 1}行目`;
        if (!isDecimalNumericText(row.episodeNumber ?? "")) errors.push(`${rowLabel}: 話数`);
    });
    return errors;
};

export const collectIntegerValidationErrors = (issueForm: IssueForm, storyRows: StoryRow[], contentRows: ContentRow[])=>{
    const errors = issueNumericFields.filter((field)=>issueIntegerFieldKeys.has(field.key) && !isIntegerNumericText(issueForm[field.key] ?? "")).map((field)=>field.label);
    storyRows.forEach((row, index)=>{
        if (!isIntegerNumericText(row.pageCount ?? "")) errors.push(`作品リスト${index + 1}行目: ページ`);
    });
    contentRows.forEach((row, index)=>{
        if (!isIntegerNumericText(row.pageStart ?? "")) errors.push(`コンテンツ${index + 1}行目: SP`);
        if (!isIntegerNumericText(row.pageEnd ?? "")) errors.push(`コンテンツ${index + 1}行目: EP`);
    });
    return errors;
};

export const collectSignedDecimalValidationErrors = (issueForm: IssueForm)=>issueNumericFields.filter((field)=>issueSignedDecimalFieldKeys.has(field.key) && !isSignedDecimalNumericText(issueForm[field.key] ?? "")).map((field)=>field.label);

export const collectDateRangeValidationErrors = (issueForm: IssueForm)=>{
    const errors: string[] = [];
    issueNumericFields.forEach((field)=>{
        const value = issueForm[field.key] ?? "";
        if (field.key.endsWith("Month") && !isMonthInRange(value)) errors.push(field.label);
        if (field.key.endsWith("Day") && !isDayInRange(value)) errors.push(field.label);
    });
    return errors;
};

export const renumberRows = <T extends { position: number }>(rows: T[])=>rows.map((row, index)=>({
    ...row,
    position: index + 1
}));

const hasTextValue = (value: string | null | undefined)=>(value ?? "").trim().length > 0;

export const isStoryRowEmpty = (row: StoryRow)=>!hasTextValue(row.title) && !hasTextValue(row.titleReading) && !hasTextValue(row.authors) && (!hasTextValue(row.storyType) || row.storyType === "読み切り") && !hasTextValue(row.pageCount) && !hasTextValue(row.seriesTitle) && !hasTextValue(row.seriesReading) && !hasTextValue(row.subtitle) && !hasTextValue(row.subtitleReading) && !hasTextValue(row.episodeNumber) && !hasTextValue(row.episodeLabel) && !hasTextValue(row.colorInfo) && !hasTextValue(row.memo) && row.tags.length === 0;

export const isContentRowEmpty = (row: ContentRow)=>!hasTextValue(row.contentType) && !hasTextValue(row.pageStart) && !hasTextValue(row.pageEnd) && !hasTextValue(row.detail) && !hasTextValue(row.contributorsJson);

export const confirmDeleteRow = async (label: string)=>{
    if (typeof window === "undefined") return true;
    return showConfirmDialog({
        title: "削除確認",
        message: `${label}を削除しますか？`,
        confirmLabel: "OK",
        cancelLabel: "キャンセル"
    });
};

const splitRoleNameText = (value: string)=>{
    const parts: string[] = [];
    let current = "";
    let isQuoted = false;
    for(let index = 0; index < value.length; index += 1){
        const char = value[index];
        const nextChar = value[index + 1];
        if (char === "\"" && nextChar === "\"") {
            current += "\"";
            index += 1;
            continue;
        }
        if (char === "\"") {
            isQuoted = !isQuoted;
            current += char;
            continue;
        }
        const isLegacyRoleSeparator = char === "," && /^\s*\[[^\]]+\]/.test(value.slice(index + 1));
        if (!isQuoted && (char === "、" || isLegacyRoleSeparator)) {
            const part = current.trim();
            if (part) parts.push(part);
            current = "";
            continue;
        }
        current += char;
    }
    const part = current.trim();
    if (part) parts.push(part);
    return parts;
};

const roleNameQuotePairs: Array<[string, string]> = [
    ["\"", "\""],
    ["“", "”"],
    ["”", "”"],
    ["＂", "＂"]
];

const getWrappedRoleNameQuotePair = (value: string): [string, string] | null=>{
    const trimmed = value.trim();
    if (trimmed.length < 2) return null;
    return roleNameQuotePairs.find(([startQuote, endQuote])=>trimmed.startsWith(startQuote) && trimmed.endsWith(endQuote)) ?? null;
};

export const stripRoleNameQuotes = (value: string)=>{
    const trimmed = value.trim();
    const quotePair = getWrappedRoleNameQuotePair(trimmed);
    if (quotePair) {
        const [startQuote, endQuote] = quotePair;
        const innerText = trimmed.slice(startQuote.length, trimmed.length - endQuote.length);
        if (startQuote === "\"" && endQuote === "\"") {
            return innerText.replace(/""/g, "\"");
        }
        return innerText;
    }
    return trimmed;
};

export const isQuotedRoleNameValue = (value: string)=>{
    return Boolean(getWrappedRoleNameQuotePair(value));
};

const normalizeRoleNameValue = (value: string, preserveSpacing = false)=>{
    const unquoted = stripRoleNameQuotes(value);
    if (!unquoted) return "";
    if (preserveSpacing || isQuotedRoleNameValue(value)) return unquoted;
    return unquoted.replace(/\s+/g, "");
};

export const parseRoleNameText = (value: string): RoleNameRow[]=>{
    const parts = splitRoleNameText(value);
    if (parts.length === 0) return [{ role: "", name: "" }];
    return parts.map((part)=>{
        const match = part.match(/^\[([^\]]+)\]\s*(.+)$/);
        if (!match) {
            return {
                role: "",
                name: stripRoleNameQuotes(part),
                preserveSpacing: isQuotedRoleNameValue(part)
            };
        }
        return {
            role: match[1].trim(),
            name: stripRoleNameQuotes(match[2]),
            preserveSpacing: isQuotedRoleNameValue(match[2])
        };
    });
};

export const formatRoleNameRows = (rows: RoleNameRow[])=>rows.map((row)=>{
    const name = row.name.trim();
    const role = row.role.trim();
    if (!name) return "";
    const formattedName = normalizeRoleNameValue(name, row.preserveSpacing);
    return role ? `[${role}]${formattedName}` : formattedName;
}).filter(Boolean).join("、");

export const ensureRoleNameRows = (value: string): RoleNameRow[]=>{
    const rows = parseRoleNameText(value);
    while(rows.length < 2) rows.push({ role: "", name: "" });
    return rows;
};

export const normalizeAutocompleteText = (value: string)=>value.trim().toLowerCase().replace(/[ァ-ン]/g, (char)=>String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/\s+/g, "");

export const getAutocompleteMatches = (value: string, options: AutocompleteOption[])=>{
    const isExactMatchQuery = isQuotedRoleNameValue(value);
    const query = normalizeAutocompleteText(stripRoleNameQuotes(value));
    if (!query) return [];
    return options.filter((option)=>{
        const searchableTexts = [option.name, option.reading ?? "", ...option.aliases ?? []];
        return searchableTexts.some((text)=>{
            const normalizedText = normalizeAutocompleteText(text);
            return isExactMatchQuery ? normalizedText === query : normalizedText.includes(query);
        });
    }).slice(0, defaultUiPreferences.autocompleteMaxSuggestions).map((option)=>option.name);
};

export const splitTagText = (value: string)=>value.split(/[,\u3001]/).map((tag)=>tag.trim()).filter(Boolean);

const formatIssueDigestDate = (year: string, month: string, day: string, combinedMonth = "", combinedDay = "")=>{
    const yearText = year.trim();
    const monthText = month.trim() ? String(Number(month.trim())).padStart(2, "0") : "";
    const dayText = day.trim() ? String(Number(day.trim())).padStart(2, "0") : "";
    const combinedMonthText = combinedMonth.trim();
    const combinedDayText = combinedDay.trim();
    const startDateText = [
        yearText ? `${yearText}年` : "",
        monthText ? `${monthText}月` : "",
        dayText ? `${dayText}日` : ""
    ].filter(Boolean).join("");
    if (!startDateText) return "";
    if (!combinedMonthText && !combinedDayText) return `${startDateText}号`;
    const combinedDateText = dayText ? [
        combinedMonthText ? `${combinedMonthText}月` : "",
        combinedDayText ? `${combinedDayText}日` : ""
    ].filter(Boolean).join("") : combinedMonthText ? `${combinedMonthText}月` : "";
    return combinedDateText ? `${startDateText}-${combinedDateText}合併号` : `${startDateText}号`;
};

const formatIssueDigestKgt = (volume: string, issue: string, total: string)=>{
    const volumeText = volume.trim();
    const issueText = issue.trim();
    const totalText = total.trim();
    const volumeIssueText = volumeText && issueText ? `（${volumeText}-${issueText}）` : "";
    const totalLabel = totalText ? `通巻${totalText}` : "";
    if (volumeIssueText && totalLabel) return `${volumeIssueText}${totalLabel}`;
    return volumeIssueText || totalLabel;
};

const formatIssueDigestVol = (volumeNumberDisplayed: string, issueNumberCombined: string)=>{
    const volumeText = volumeNumberDisplayed.trim();
    const combinedText = issueNumberCombined.trim();
    if (!volumeText) return "";
    return combinedText ? `Vol.${volumeText}-${combinedText}` : `Vol.${volumeText}`;
};

export const buildIssueDigestParts = (issueForm: IssueForm)=>{
    const title = issueForm.issueTitle.trim() || issueForm.magazineTitle.trim();
    const dateText = formatIssueDigestDate(issueForm.displayReleaseYear, issueForm.displayReleaseMonth, issueForm.displayReleaseDay, issueForm.displayReleaseCombinedMonth, issueForm.displayReleaseCombinedDay);
    const kgtText = formatIssueDigestKgt(issueForm.volumeNumber, issueForm.issueNumber, issueForm.totalIssueNumber);
    const volText = formatIssueDigestVol(issueForm.volumeNumberDisplayed, issueForm.issueNumberCombined);
    return {
        title,
        detail: [dateText, kgtText, volText].filter(Boolean).join("  ")
    };
};

export const buildIssueDigestTitle = (issueForm: IssueForm)=>{
    const { title, detail } = buildIssueDigestParts(issueForm);
    return [title, detail].filter(Boolean).join("  ");
};

export const buildIssueDisplayLabel = (issueForm: IssueForm)=>{
    const title = issueForm.issueTitle.trim() || issueForm.magazineTitle.trim();
    const dateText = formatIssueDigestDate(issueForm.displayReleaseYear, issueForm.displayReleaseMonth, issueForm.displayReleaseDay, issueForm.displayReleaseCombinedMonth, issueForm.displayReleaseCombinedDay);
    const kgtText = formatIssueDigestKgt(issueForm.volumeNumber, issueForm.issueNumber, issueForm.totalIssueNumber);
    const volText = formatIssueDigestVol(issueForm.volumeNumberDisplayed, issueForm.issueNumberCombined);
    return [`${title}${dateText ? `(${dateText})` : ""}`, kgtText, volText].filter(Boolean).join(" ");
};

export const buildIssueBreadcrumbLabel = (issueForm: IssueForm)=>{
    const dateText = formatIssueDigestDate(issueForm.displayReleaseYear, issueForm.displayReleaseMonth, issueForm.displayReleaseDay, issueForm.displayReleaseCombinedMonth, issueForm.displayReleaseCombinedDay);
    const volText = formatIssueDigestVol(issueForm.volumeNumberDisplayed, issueForm.issueNumberCombined);
    return [dateText, volText].filter(Boolean).join(" ");
};
