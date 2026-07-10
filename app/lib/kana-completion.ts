import { getKanaCompletionConfig } from "./kana-completion-config.ts";

type YahooFuriganaWord = {
    surface?: string;
    furigana?: string;
};

type YahooFuriganaResponse = {
    result?: {
        word?: YahooFuriganaWord[];
    };
    error?: unknown;
};

const katakanaToHiragana = (value: string)=>value.replace(/[\u30a1-\u30f6]/g, (char)=>String.fromCharCode(char.charCodeAt(0) - 0x60));

const kanaSourceCorrections: Array<[RegExp, string]> = [
    [/幸わせ/g, "幸せ"],
    [/M[＠@]STER/gi, "MASTER"]
];

const localEnglishReadings: Array<[RegExp, string]> = [
    [/\b1LDK\b/gi, "わんえるでぃーけー"],
    [/\bLDK\b/gi, "えるでぃーけー"],
    [/\bJK\b/gi, "じぇいけー"],
    [/\bJD\b/gi, "じぇいでぃー"],
    [/\bH\b/g, "えっち"]
];

const smallNumberReadings: Record<number, string> = {
    0: "ぜろ",
    1: "いち",
    2: "に",
    3: "さん",
    4: "よん",
    5: "ご",
    6: "ろく",
    7: "なな",
    8: "はち",
    9: "きゅう",
    10: "じゅう"
};

const hiraganaVowels: Record<string, string> = {
    あ: "あ", か: "あ", が: "あ", さ: "あ", ざ: "あ", た: "あ", だ: "あ", な: "あ", は: "あ", ば: "あ", ぱ: "あ", ま: "あ", や: "あ", ら: "あ", わ: "あ",
    い: "い", き: "い", ぎ: "い", し: "い", じ: "い", ち: "い", に: "い", ひ: "い", び: "い", ぴ: "い", み: "い", り: "い",
    う: "う", く: "う", ぐ: "う", す: "う", ず: "う", つ: "う", づ: "う", ぬ: "う", ふ: "う", ぶ: "う", ぷ: "う", む: "う", ゆ: "う", る: "う",
    え: "え", け: "え", げ: "え", せ: "え", ぜ: "え", て: "え", で: "え", ね: "え", へ: "え", べ: "え", ぺ: "え", め: "え", れ: "え",
    お: "お", こ: "お", ご: "お", そ: "お", ぞ: "お", と: "お", ど: "お", の: "お", ほ: "お", ぼ: "お", ぽ: "お", も: "お", よ: "お", ろ: "お", を: "お"
};

const applyKanaSourceCorrections = (value: string)=>{
    return kanaSourceCorrections.reduce((current, [pattern, replacement])=>current.replace(pattern, replacement), value);
};

const applyLocalEnglishReadings = (value: string)=>{
    return localEnglishReadings.reduce((current, [pattern, replacement])=>current.replace(pattern, replacement), value);
};

const numberToReading = (value: number): string=>{
    if (value in smallNumberReadings) return smallNumberReadings[value];
    if (value < 20) return `じゅう${smallNumberReadings[value - 10] ?? ""}`;
    if (value < 100) {
        const tens = Math.floor(value / 10);
        const ones = value % 10;
        return `${tens === 1 ? "" : smallNumberReadings[tens] ?? ""}じゅう${ones === 0 ? "" : smallNumberReadings[ones] ?? ""}`;
    }
    return String(value);
};

const applyEpisodeNumberReadings = (value: string)=>{
    return value.replace(/第([0-9]{1,2})話/g, (_, numberText: string)=>`だい${numberToReading(Number(numberText))}わ`);
};

const expandLongVowels = (value: string)=>{
    const result: string[] = [];
    for (const char of Array.from(value)){
        if (char === "ー") {
            result.push(hiraganaVowels[result.at(-1) ?? ""] ?? "");
        } else {
            result.push(char);
        }
    }
    return result.join("");
};

export const normalizeKanaResult = (value: string)=>{
    return expandLongVowels(katakanaToHiragana(value)).replace(/[^\u3041-\u3096]/g, "");
};

const normalizeKanaSourceText = (value: string)=>{
    const corrected = applyEpisodeNumberReadings(applyLocalEnglishReadings(applyKanaSourceCorrections(value)));
    return Array.from(corrected).filter((char)=>/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Letter}\p{Number}ー々〆ヶ]/u.test(char)).join("");
};

const convertEnglishTokenWithKuroneko = async (token: string, apiUrl: string)=>{
    const url = new URL(apiUrl);
    url.searchParams.set("text", token);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`KuronekoServer returned ${response.status}`);
    }
    return normalizeKanaResult(await response.text());
};

const replaceEnglishTokensWithKana = async (text: string, kuronekoApiUrl: string)=>{
    const corrected = applyEpisodeNumberReadings(applyLocalEnglishReadings(applyKanaSourceCorrections(text)));
    const matches = [
        ...corrected.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)
    ];
    if (matches.length === 0) return corrected;

    let result = "";
    let lastIndex = 0;
    const cache = new Map<string, string>();
    for (const match of matches){
        const token = match[0];
        const possessiveBase = token.match(/^([A-Za-z]+)['’]s$/i)?.[1] ?? "";
        const queryToken = possessiveBase || token;
        result += corrected.slice(lastIndex, match.index);
        const cacheKey = queryToken.toLowerCase();
        const baseKana = cache.get(cacheKey) ?? await convertEnglishTokenWithKuroneko(queryToken, kuronekoApiUrl);
        const kana = possessiveBase ? `${baseKana}ず` : baseKana;
        cache.set(cacheKey, baseKana);
        result += kana;
        lastIndex = (match.index ?? 0) + token.length;
    }
    result += corrected.slice(lastIndex);
    return result;
};

export const convertTextToKana = async (text: string)=>{
    const config = await getKanaCompletionConfig();
    if (!config.yahooClientId) {
        throw new Error("Yahoo Client ID is not configured");
    }

    const preprocessedText = await replaceEnglishTokensWithKana(text, config.kuronekoApiUrl);
    const sourceText = normalizeKanaSourceText(preprocessedText);
    if (!sourceText) {
        throw new Error("かな補完できる文字がありません");
    }

    const response = await fetch(config.yahooFuriganaApiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": `Yahoo AppID: ${config.yahooClientId}`
        },
        body: JSON.stringify({
            id: "1",
            jsonrpc: "2.0",
            method: "jlp.furiganaservice.furigana",
            params: {
                q: sourceText,
                grade: 1
            }
        })
    });
    if (!response.ok) {
        const detail = response.status === 403
            ? "実際のYahoo Client IDが設定されているか確認してください"
            : "Yahoo APIへの接続に失敗しました";
        throw new Error(`Yahoo Furigana API returned ${response.status}: ${detail}`);
    }

    const body = await response.json() as YahooFuriganaResponse;
    if (body.error) {
        throw new Error(`Yahoo Furigana API error: ${JSON.stringify(body.error)}`);
    }
    const words = body.result?.word ?? [];
    const kana = normalizeKanaResult(words.map((word)=>word.furigana ?? word.surface ?? "").join(""));
    if (!kana) {
        throw new Error("かな補完できる読みがありません");
    }
    return kana;
};
