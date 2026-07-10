import { escapeCsvPipeText } from "./csv-pipe-utils";
import type { AuthorMasterRecord } from "./types";

type FieldVisibility = "public" | "internal";

type AuthorFieldDictionaryEntry = {
  labelJa: string;
  visibility: FieldVisibility;
  csvDownload: boolean;
  csvTemplate: boolean;
  sampleValue?: string;
  getCsvValue?: (record: AuthorMasterRecord) => string;
  getRawCsvValue?: (record: AuthorMasterRecord) => string;
};

const formatAliasCsv = (value: string) => {
  if (!value.trim()) return "";
  try {
    const rows = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return value;
    return rows
      .map((row) => {
        const name = typeof row.name === "string" ? escapeCsvPipeText(row.name.trim()) : "";
        const idValue = typeof row.author_id === "string" ? row.author_id.trim() : "";
        return [name, idValue].filter(Boolean).join("|");
      })
      .filter(Boolean)
      .join("; ");
  } catch {
    return value;
  }
};

const formatSocialLinksCsv = (value: string) => {
  if (!value.trim()) return "";
  try {
    const rows = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return value;
    return rows
      .map((row) => {
        const service = typeof row.service === "string" ? escapeCsvPipeText(row.service.trim()) : "";
        const account = typeof row.account === "string" ? escapeCsvPipeText(row.account.trim()) : "";
        const url = typeof row.url === "string" ? escapeCsvPipeText(row.url.trim()) : "";
        const memo = typeof row.memo === "string" ? escapeCsvPipeText(row.memo.trim()) : "";
        return [service, account, url, memo].filter(Boolean).join("|");
      })
      .filter(Boolean)
      .join("; ");
  } catch {
    return value;
  }
};

export const authorFieldDictionary = {
  id: {
    labelJa: "ID",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "",
  },
  internalId: {
    labelJa: "内部キー",
    visibility: "internal",
    csvDownload: false,
    csvTemplate: false,
  },
  name: {
    labelJa: "名前",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "サンプル著者",
  },
  reading: {
    labelJa: "読み",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "さんぷるちょしゃ",
  },
  otherAuthorIds: {
    labelJa: "別名義",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: JSON.stringify([{ name: "別名サンプル", author_id: "A000001" }]),
    getCsvValue: (record) => formatAliasCsv(record.otherAuthorIds),
    getRawCsvValue: (record) => record.otherAuthorIds,
  },
  socialLinks: {
    labelJa: "SNS",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: JSON.stringify([{ service: "X", account: "@sample_author", url: "https://x.com/sample_author", memo: "告知用" }]),
    getCsvValue: (record) => formatSocialLinksCsv(record.socialLinks),
    getRawCsvValue: (record) => record.socialLinks,
  },
  memo: {
    labelJa: "メモ",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "アップロード用テンプレートのサンプル行です。",
  },
  tag: {
    labelJa: "タグ",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "サンプル | 著者 | テンプレート",
    getCsvValue: (record) => record.tag.map((value) => escapeCsvPipeText(value)).join(" | "),
    getRawCsvValue: (record) => JSON.stringify(record.tag),
  },
  searchText: {
    labelJa: "検索用テキスト",
    visibility: "internal",
    csvDownload: false,
    csvTemplate: false,
  },
  updatedAt: {
    labelJa: "更新日時",
    visibility: "internal",
    csvDownload: false,
    csvTemplate: false,
  },
} satisfies Record<keyof AuthorMasterRecord, AuthorFieldDictionaryEntry>;

type AuthorFieldId = keyof typeof authorFieldDictionary;

const authorFieldEntries = Object.entries(authorFieldDictionary) as Array<
  [AuthorFieldId, AuthorFieldDictionaryEntry]
>;

authorFieldEntries.forEach(([fieldId, entry]) => {
  if (entry.visibility === "internal" && (entry.csvDownload || entry.csvTemplate)) {
    throw new Error(`Internal field "${fieldId}" cannot be published to CSV.`);
  }
  if (entry.csvTemplate && entry.sampleValue == null) {
    throw new Error(`Template field "${fieldId}" requires a sampleValue.`);
  }
});

export type AuthorCsvDownloadFieldId = {
  [K in AuthorFieldId]: (typeof authorFieldDictionary)[K]["csvDownload"] extends true ? K : never;
}[AuthorFieldId];

export type AuthorCsvTemplateFieldId = {
  [K in AuthorFieldId]: (typeof authorFieldDictionary)[K]["csvTemplate"] extends true ? K : never;
}[AuthorFieldId];

export const authorCsvDownloadFields = authorFieldEntries
  .filter(([, entry]) => entry.csvDownload)
  .map(([id, entry]) => ({
    id: id as AuthorCsvDownloadFieldId,
    label: entry.labelJa,
    getDisplayValue: (record: AuthorMasterRecord) =>
      entry.getCsvValue ? entry.getCsvValue(record) : String(record[id] ?? ""),
    getRawValue: (record: AuthorMasterRecord) =>
      entry.getRawCsvValue
        ? entry.getRawCsvValue(record)
        : entry.getCsvValue
          ? entry.getCsvValue(record)
          : String(record[id] ?? ""),
  }));

export const authorCsvTemplateFields = authorFieldEntries
  .filter(([, entry]) => entry.csvTemplate)
  .map(([id, entry]) => ({
    id: id as AuthorCsvTemplateFieldId,
    label: entry.labelJa,
    sampleValue: entry.sampleValue ?? "",
  }));

const buildTemplateSampleRow = (
  overrides: Partial<Record<AuthorCsvTemplateFieldId, string>> = {},
) =>
  authorCsvTemplateFields.reduce<Record<AuthorCsvTemplateFieldId, string>>((row, field) => {
    row[field.id] = overrides[field.id] ?? field.sampleValue;
    return row;
  }, {} as Record<AuthorCsvTemplateFieldId, string>);

export const authorCsvTemplateSampleRows = [
  buildTemplateSampleRow({
    id: "",
    memo: "新規追加サンプルです。IDが空欄なら新規追加として扱います。",
  }),
  buildTemplateSampleRow({
    id: "A000001",
    name: "既存サンプル著者",
    reading: "きそんさんぷるちょしゃ",
    memo: "既存修正サンプルです。空欄は変更しません。",
  }),
];
