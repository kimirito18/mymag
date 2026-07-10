import type { MagazineMasterRecord } from "./types";
import { escapeCsvPipeText } from "./csv-pipe-utils";

type FieldVisibility = "public" | "internal";

type MagazineMasterFieldDictionaryEntry = {
  labelJa: string;
  visibility: FieldVisibility;
  csvDownload: boolean;
  csvTemplate: boolean;
  sampleValue?: string;
  getCsvValue?: (record: MagazineMasterRecord) => string;
  getRawCsvValue?: (record: MagazineMasterRecord) => string;
};

const formatMagazineCsvRoleText = (
  value: string,
  idKey: "publisher_id" | "magazine_id",
) => {
  if (!value.trim()) return "";
  try {
    const rows = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return value;
    return rows
      .map((row) => {
        const role = typeof row.role === "string" ? row.role.trim() : "";
        const name = typeof row.name === "string" ? escapeCsvPipeText(row.name.trim()) : "";
        const reading = typeof row.reading === "string" ? escapeCsvPipeText(row.reading.trim()) : "";
        const idValue = typeof row[idKey] === "string" ? row[idKey].trim() : "";
        const parts = [escapeCsvPipeText(role), name, reading, idValue].filter(Boolean);
        return parts.join("|");
      })
      .filter(Boolean)
      .join("; ");
  } catch {
    return value;
  }
};

export const magazineMasterFieldDictionary = {
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
    labelJa: "タイトル",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "サンプルマガジン",
  },
  reading: {
    labelJa: "読み",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "さんぷるまがじん",
  },
  aliasName: {
    labelJa: "タイトル表記ブレ",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "サンプルMAGAZINE",
  },
  aliasReading: {
    labelJa: "タイトル表記ブレの読み",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "さんぷるまがじん",
  },
  publishers: {
    labelJa: "出版社",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: JSON.stringify([
      {
        name: "サンプル出版社",
        role: "発行",
        reading: "さんぷるしゅっぱんしゃ",
        publisher_id: "P000001",
      },
    ]),
    getCsvValue: (record) => formatMagazineCsvRoleText(record.publishers, "publisher_id"),
    getRawCsvValue: (record) => record.publishers,
  },
  publicationFrequency: {
    labelJa: "刊行頻度",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "月刊 | 増刊",
    getCsvValue: (record) => record.publicationFrequency.map((value) => escapeCsvPipeText(value)).join(" | "),
    getRawCsvValue: (record) => JSON.stringify(record.publicationFrequency),
  },
  firstPublishedDate: {
    labelJa: "創刊日",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "2024-04",
  },
  closedDate: {
    labelJa: "休廃刊日",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "",
  },
  issn: {
    labelJa: "ISSN",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "1234-5678",
  },
  jpno: {
    labelJa: "JPNo",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "00000000",
  },
  relatedMagazines: {
    labelJa: "関連誌",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: JSON.stringify([
      {
        name: "サンプル関連誌",
        role: "関連",
        reading: "さんぷるかんれんし",
        magazine_id: "M000001",
      },
    ]),
    getCsvValue: (record) => formatMagazineCsvRoleText(record.relatedMagazines, "magazine_id"),
    getRawCsvValue: (record) => record.relatedMagazines,
  },
  relationNote: {
    labelJa: "関連誌メモ",
    visibility: "public",
    csvDownload: true,
    csvTemplate: true,
    sampleValue: "本誌から派生した姉妹誌の例です。",
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
    sampleValue: "サンプル | 月刊誌 | テンプレート",
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
} satisfies Record<keyof MagazineMasterRecord, MagazineMasterFieldDictionaryEntry>;

type MagazineMasterFieldId = keyof typeof magazineMasterFieldDictionary;

const magazineMasterFieldEntries = Object.entries(magazineMasterFieldDictionary) as Array<
  [MagazineMasterFieldId, MagazineMasterFieldDictionaryEntry]
>;

const assertMagazineMasterFieldDictionary = () => {
  magazineMasterFieldEntries.forEach(([fieldId, entry]) => {
    if (entry.visibility === "internal" && (entry.csvDownload || entry.csvTemplate)) {
      throw new Error(`Internal field "${fieldId}" cannot be published to CSV.`);
    }
    if (entry.csvTemplate && entry.sampleValue == null) {
      throw new Error(`Template field "${fieldId}" requires a sampleValue.`);
    }
  });
};

assertMagazineMasterFieldDictionary();

export type MagazineMasterCsvDownloadFieldId = {
  [K in MagazineMasterFieldId]: (typeof magazineMasterFieldDictionary)[K]["csvDownload"] extends true ? K : never;
}[MagazineMasterFieldId];

export type MagazineMasterCsvTemplateFieldId = {
  [K in MagazineMasterFieldId]: (typeof magazineMasterFieldDictionary)[K]["csvTemplate"] extends true ? K : never;
}[MagazineMasterFieldId];

export const magazineMasterCsvDownloadFields = magazineMasterFieldEntries
  .filter(([, entry]) => entry.csvDownload)
  .map(([id, entry]) => ({
    id: id as MagazineMasterCsvDownloadFieldId,
    label: entry.labelJa,
    getDisplayValue: (record: MagazineMasterRecord) =>
      entry.getCsvValue ? entry.getCsvValue(record) : String(record[id] ?? ""),
    getRawValue: (record: MagazineMasterRecord) =>
      entry.getRawCsvValue
        ? entry.getRawCsvValue(record)
        : entry.getCsvValue
          ? entry.getCsvValue(record)
          : String(record[id] ?? ""),
  }));

export const magazineMasterCsvTemplateFields = magazineMasterFieldEntries
  .filter(([, entry]) => entry.csvTemplate)
  .map(([id, entry]) => ({
    id: id as MagazineMasterCsvTemplateFieldId,
    label: entry.labelJa,
    sampleValue: entry.sampleValue ?? "",
  }));

const buildTemplateSampleRow = (
  overrides: Partial<Record<MagazineMasterCsvTemplateFieldId, string>> = {},
) =>
  magazineMasterCsvTemplateFields.reduce<Record<MagazineMasterCsvTemplateFieldId, string>>((row, field) => {
    row[field.id] = overrides[field.id] ?? field.sampleValue;
    return row;
  }, {} as Record<MagazineMasterCsvTemplateFieldId, string>);

export const magazineMasterCsvTemplateSampleRows = [
  buildTemplateSampleRow({
    id: "",
    memo: "新規追加サンプルです。IDが空欄なら新規追加として扱います。",
  }),
  buildTemplateSampleRow({
    id: "M000001",
    name: "既存サンプルマガジン",
    reading: "きそんさんぷるまがじん",
    aliasName: "既存サンプルMAGAZINE",
    aliasReading: "きそんさんぷるまがじん",
    publishers: JSON.stringify([
      {
        name: "既存サンプル出版社",
        role: "発行",
        reading: "きそんさんぷるしゅっぱんしゃ",
        publisher_id: "P000001",
      },
    ]),
    relationNote: "修正サンプルです。",
    memo: "修正サンプルです。IDが入っている行は既存データの修正として扱います。空欄項目は変更しません。",
    tag: "修正サンプル | テンプレート",
  }),
];
