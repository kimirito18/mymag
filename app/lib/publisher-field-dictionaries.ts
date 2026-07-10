import { escapeCsvPipeText } from "./csv-pipe-utils";
import type { PublisherMasterRecord } from "./types";

type FieldVisibility = "public" | "internal";

type PublisherFieldDictionaryEntry = {
  labelJa: string;
  visibility: FieldVisibility;
  csvDownload: boolean;
  csvTemplate: boolean;
  sampleValue?: string;
  getCsvValue?: (record: PublisherMasterRecord) => string;
  getRawCsvValue?: (record: PublisherMasterRecord) => string;
};

const formatRelatedPublishersCsv = (value: string) => {
  if (!value.trim()) return "";
  try {
    const rows = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return value;
    return rows
      .map((row) => {
        const role = typeof row.role === "string" ? escapeCsvPipeText(row.role.trim()) : "";
        const name = typeof row.name === "string" ? escapeCsvPipeText(row.name.trim()) : "";
        const idValue = typeof row.publisher_id === "string" ? row.publisher_id.trim() : "";
        return [role, name, idValue].filter(Boolean).join("|");
      })
      .filter(Boolean)
      .join("; ");
  } catch {
    return value;
  }
};

const formatRelatedLinksCsv = (value: string) => {
  if (!value.trim()) return "";
  try {
    const rows = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return value;
    return rows
      .map((row) => {
        const role = typeof row.role === "string" ? escapeCsvPipeText(row.role.trim()) : "";
        const url = typeof row.url === "string" ? escapeCsvPipeText(row.url.trim()) : "";
        const memo = typeof row.memo === "string" ? escapeCsvPipeText(row.memo.trim()) : "";
        return [role, url, memo].filter(Boolean).join("|");
      })
      .filter(Boolean)
      .join("; ");
  } catch {
    return value;
  }
};

export const publisherFieldDictionary = {
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
    sampleValue: "サンプル出版社",
  },
  reading: {
    labelJa: "読み",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "さんぷるしゅっぱんしゃ",
  },
  address: {
    labelJa: "住所",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "東京都千代田区サンプル1-2-3",
  },
  url: {
    labelJa: "URL",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "https://example.jp/publisher",
  },
  relatedLink: {
    labelJa: "関連URL",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: JSON.stringify([{ role: "公式", url: "https://example.jp/info", memo: "会社概要" }]),
    getCsvValue: (record) => formatRelatedLinksCsv(record.relatedLink),
    getRawCsvValue: (record) => record.relatedLink,
  },
  startDate: {
    labelJa: "設立日",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "2001-04-01",
  },
  endDate: {
    labelJa: "終了日",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "",
  },
  memo: {
    labelJa: "メモ",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "アップロード用テンプレートのサンプル行です。",
  },
  relatedPublishers: {
    labelJa: "関連会社",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: JSON.stringify([{ role: "関連会社", name: "サンプル関連会社", publisher_id: "P000001" }]),
    getCsvValue: (record) => formatRelatedPublishersCsv(record.relatedPublishers),
    getRawCsvValue: (record) => record.relatedPublishers,
  },
  tag: {
    labelJa: "タグ",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "サンプル | 出版社 | テンプレート",
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
} satisfies Record<keyof PublisherMasterRecord, PublisherFieldDictionaryEntry>;

type PublisherFieldId = keyof typeof publisherFieldDictionary;

const publisherFieldEntries = Object.entries(publisherFieldDictionary) as Array<
  [PublisherFieldId, PublisherFieldDictionaryEntry]
>;

publisherFieldEntries.forEach(([fieldId, entry]) => {
  if (entry.visibility === "internal" && (entry.csvDownload || entry.csvTemplate)) {
    throw new Error(`Internal field "${fieldId}" cannot be published to CSV.`);
  }
  if (entry.csvTemplate && entry.sampleValue == null) {
    throw new Error(`Template field "${fieldId}" requires a sampleValue.`);
  }
});

export type PublisherCsvDownloadFieldId = {
  [K in PublisherFieldId]: (typeof publisherFieldDictionary)[K]["csvDownload"] extends true ? K : never;
}[PublisherFieldId];

export type PublisherCsvTemplateFieldId = {
  [K in PublisherFieldId]: (typeof publisherFieldDictionary)[K]["csvTemplate"] extends true ? K : never;
}[PublisherFieldId];

export const publisherCsvDownloadFields = publisherFieldEntries
  .filter(([, entry]) => entry.csvDownload)
  .map(([id, entry]) => ({
    id: id as PublisherCsvDownloadFieldId,
    label: entry.labelJa,
    getDisplayValue: (record: PublisherMasterRecord) =>
      entry.getCsvValue ? entry.getCsvValue(record) : String(record[id] ?? ""),
    getRawValue: (record: PublisherMasterRecord) =>
      entry.getRawCsvValue
        ? entry.getRawCsvValue(record)
        : entry.getCsvValue
          ? entry.getCsvValue(record)
          : String(record[id] ?? ""),
  }));

export const publisherCsvTemplateFields = publisherFieldEntries
  .filter(([, entry]) => entry.csvTemplate)
  .map(([id, entry]) => ({
    id: id as PublisherCsvTemplateFieldId,
    label: entry.labelJa,
    sampleValue: entry.sampleValue ?? "",
  }));

const buildTemplateSampleRow = (
  overrides: Partial<Record<PublisherCsvTemplateFieldId, string>> = {},
) =>
  publisherCsvTemplateFields.reduce<Record<PublisherCsvTemplateFieldId, string>>((row, field) => {
    row[field.id] = overrides[field.id] ?? field.sampleValue;
    return row;
  }, {} as Record<PublisherCsvTemplateFieldId, string>);

export const publisherCsvTemplateSampleRows = [
  buildTemplateSampleRow({
    id: "",
    memo: "新規追加サンプルです。IDが空欄なら新規追加として扱います。",
  }),
  buildTemplateSampleRow({
    id: "P000001",
    name: "既存サンプル出版社",
    reading: "きそんさんぷるしゅっぱんしゃ",
    memo: "既存修正サンプルです。空欄は変更しません。",
  }),
];
