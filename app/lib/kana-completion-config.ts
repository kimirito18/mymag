import { readFile } from "fs/promises";

const DEFAULT_KURONEKO_API_URL = "https://eng-jpn-api.krnk.org/query";
const DEFAULT_YAHOO_FURIGANA_API_URL = "https://jlp.yahooapis.jp/FuriganaService/V2/furigana";
const DEFAULT_LEGACY_KANA_PY_PATH = "/Volumes/DATA4 8T/myprogram/lib/kana.py";

type KanaCompletionConfig = {
    kuronekoApiUrl: string;
    yahooFuriganaApiUrl: string;
    yahooClientId: string;
};

let cachedConfig: KanaCompletionConfig | null = null;

const isPlaceholderClientId = (value: string)=>{
    const normalized = value.trim().toLowerCase();
    return !normalized
        || normalized === "your-yahoo-client-id"
        || normalized.includes("あなたのclient id")
        || normalized.includes("application id")
        || normalized.includes("アプリケーションid")
        || /^<.*>$/.test(normalized);
};

const readLegacyClientId = async ()=>{
    const legacyPath = process.env.KANA_LEGACY_CLIENT_ID_PATH?.trim() || DEFAULT_LEGACY_KANA_PY_PATH;
    try {
        const source = await readFile(legacyPath, "utf8");
        return source.match(/CLIENT_ID\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
    } catch {
        return "";
    }
};

export const getKanaCompletionConfig = async ()=>{
    if (cachedConfig) return cachedConfig;

    const envClientId = process.env.YAHOO_CLIENT_ID?.trim() ?? "";
    const legacyClientId = envClientId && !isPlaceholderClientId(envClientId)
        ? ""
        : (await readLegacyClientId()).trim();

    cachedConfig = {
        kuronekoApiUrl: process.env.KANA_KURONEKO_API_URL?.trim() || DEFAULT_KURONEKO_API_URL,
        yahooFuriganaApiUrl: process.env.KANA_YAHOO_FURIGANA_API_URL?.trim() || DEFAULT_YAHOO_FURIGANA_API_URL,
        yahooClientId: envClientId && !isPlaceholderClientId(envClientId)
            ? envClientId
            : legacyClientId && !isPlaceholderClientId(legacyClientId)
                ? legacyClientId
                : ""
    };

    return cachedConfig;
};
