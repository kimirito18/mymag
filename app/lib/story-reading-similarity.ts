import levenshtein from "fast-levenshtein";

export type StoryReadingSimilarityMetrics = {
    strategy: StoryReadingSimilarityStrategyId;
    score: number;
    coreScore: number;
    fullScore: number;
    trigram: number;
    levenshteinNormalized: number;
    distance: number;
    prefixBonus: number;
    lengthBonus: number;
};

export const STORY_READING_EXACT_MATCH_THRESHOLD = 1;
export const STORY_READING_NEAR_MATCH_THRESHOLD = 0.7;
export const STORY_READING_CANDIDATE_MIN_THRESHOLD = 0.55;

export type StoryReadingSimilarityStrategyId = "fast_levenshtein" | "hybrid_legacy";

type StoryReadingSimilarityStrategy = {
    id: StoryReadingSimilarityStrategyId;
    label: string;
    calculate: (queryReading: string, candidateReading: string)=>StoryReadingSimilarityMetrics;
};

export const STORY_READING_DEFAULT_STRATEGY: StoryReadingSimilarityStrategyId = "fast_levenshtein";

const normalizeReadingText = (value: string)=>String(value ?? "").trim().replace(/\s+/g, "").replace(/ー+/g, "ー");

const trailingPartPattern = /(だい[ぁ-ゖー]+わ)(?:ぜんぺん|こうへん|ちゅうへん)?$/u;
const trailingSectionPattern = /(ぜんぺん|こうへん|ちゅうへん|じょう|げ)$/u;

export const normalizeStoryReadingCore = (value: string)=>{
    const original = normalizeReadingText(value);
    let normalized = original;
    normalized = normalized.replace(trailingPartPattern, "");
    normalized = normalized.replace(trailingSectionPattern, "");
    normalized = normalized.trim();
    return normalized || original;
};

const toTrigrams = (value: string)=>{
    const normalized = `  ${normalizeReadingText(value)}  `;
    const grams: string[] = [];
    for(let index = 0; index < normalized.length - 2; index += 1){
        grams.push(normalized.slice(index, index + 3));
    }
    return grams;
};

const trigramSimilarity = (left: string, right: string)=>{
    const leftGrams = toTrigrams(left);
    const rightGrams = toTrigrams(right);
    if (leftGrams.length === 0 || rightGrams.length === 0) return 0;
    const rightCounts = new Map<string, number>();
    for (const gram of rightGrams){
        rightCounts.set(gram, (rightCounts.get(gram) ?? 0) + 1);
    }
    let matches = 0;
    for (const gram of leftGrams){
        const count = rightCounts.get(gram) ?? 0;
        if (count > 0) {
            matches += 1;
            rightCounts.set(gram, count - 1);
        }
    }
    return 2 * matches / (leftGrams.length + rightGrams.length);
};

const levenshteinDistance = (left: string, right: string)=>{
    const a = normalizeReadingText(left);
    const b = normalizeReadingText(right);
    if (!a) return b.length;
    if (!b) return a.length;
    const prev = Array.from({
        length: b.length + 1
    }, (_, index)=>index);
    for(let row = 1; row <= a.length; row += 1){
        const current = [
            row
        ];
        for(let col = 1; col <= b.length; col += 1){
            const cost = a[row - 1] === b[col - 1] ? 0 : 1;
            current[col] = Math.min(current[col - 1] + 1, prev[col] + 1, prev[col - 1] + cost);
        }
        for(let index = 0; index < current.length; index += 1){
            prev[index] = current[index];
        }
    }
    return prev[b.length];
};

const commonPrefixLength = (left: string, right: string)=>{
    const a = normalizeReadingText(left);
    const b = normalizeReadingText(right);
    const limit = Math.min(a.length, b.length);
    let index = 0;
    while(index < limit && a[index] === b[index]){
        index += 1;
    }
    return index;
};

const calculateLegacyBaseScore = (left: string, right: string)=>{
    const a = normalizeReadingText(left);
    const b = normalizeReadingText(right);
    const maxLength = Math.max(a.length, b.length, 1);
    const trigram = trigramSimilarity(a, b);
    const distance = levenshteinDistance(a, b);
    const levenshteinNormalized = 1 - distance / maxLength;
    const prefixBonus = commonPrefixLength(a, b) / maxLength;
    const lengthBonus = 1 - Math.abs(a.length - b.length) / maxLength;
    return {
        score: trigram * 0.55 + levenshteinNormalized * 0.3 + prefixBonus * 0.1 + lengthBonus * 0.05,
        trigram,
        levenshteinNormalized,
        distance,
        prefixBonus,
        lengthBonus
    };
};

const calculateFastLevenshteinScore = (left: string, right: string)=>{
    const a = normalizeReadingText(left);
    const b = normalizeReadingText(right);
    const maxLength = Math.max(a.length, b.length, 1);
    const distance = levenshtein.get(a, b);
    const normalized = 1 - distance / maxLength;
    return {
        score: normalized,
        trigram: trigramSimilarity(a, b),
        levenshteinNormalized: normalized,
        distance,
        prefixBonus: commonPrefixLength(a, b) / maxLength,
        lengthBonus: 1 - Math.abs(a.length - b.length) / maxLength
    };
};

const calculateLegacySimilarity = (queryReading: string, candidateReading: string): StoryReadingSimilarityMetrics=>{
    const full = calculateLegacyBaseScore(queryReading, candidateReading);
    const queryCore = normalizeStoryReadingCore(queryReading);
    const candidateCore = normalizeStoryReadingCore(candidateReading);
    const core = queryCore && candidateCore ? calculateLegacyBaseScore(queryCore, candidateCore) : {
        score: 0,
        trigram: full.trigram,
        levenshteinNormalized: full.levenshteinNormalized,
        distance: full.distance,
        prefixBonus: full.prefixBonus,
        lengthBonus: full.lengthBonus
    };
    const boostedScore = queryCore && candidateCore ? core.score * 0.75 + full.score * 0.25 : full.score;
    return {
        strategy: "hybrid_legacy",
        score: boostedScore,
        coreScore: core.score,
        fullScore: full.score,
        trigram: core.score >= full.score ? core.trigram : full.trigram,
        levenshteinNormalized: core.score >= full.score ? core.levenshteinNormalized : full.levenshteinNormalized,
        distance: core.score >= full.score ? core.distance : full.distance,
        prefixBonus: core.score >= full.score ? core.prefixBonus : full.prefixBonus,
        lengthBonus: core.score >= full.score ? core.lengthBonus : full.lengthBonus
    };
};

const calculateFastLevenshteinSimilarity = (queryReading: string, candidateReading: string): StoryReadingSimilarityMetrics=>{
    const full = calculateFastLevenshteinScore(queryReading, candidateReading);
    const queryCore = normalizeStoryReadingCore(queryReading);
    const candidateCore = normalizeStoryReadingCore(candidateReading);
    const core = queryCore && candidateCore ? calculateFastLevenshteinScore(queryCore, candidateCore) : {
        score: 0,
        trigram: full.trigram,
        levenshteinNormalized: full.levenshteinNormalized,
        distance: full.distance,
        prefixBonus: full.prefixBonus,
        lengthBonus: full.lengthBonus
    };
    const boostedScore = queryCore && candidateCore ? core.score * 0.75 + full.score * 0.25 : full.score;
    return {
        strategy: "fast_levenshtein",
        score: boostedScore,
        coreScore: core.score,
        fullScore: full.score,
        trigram: core.score >= full.score ? core.trigram : full.trigram,
        levenshteinNormalized: core.score >= full.score ? core.levenshteinNormalized : full.levenshteinNormalized,
        distance: core.score >= full.score ? core.distance : full.distance,
        prefixBonus: core.score >= full.score ? core.prefixBonus : full.prefixBonus,
        lengthBonus: core.score >= full.score ? core.lengthBonus : full.lengthBonus
    };
};

export const storyReadingSimilarityStrategies: Record<StoryReadingSimilarityStrategyId, StoryReadingSimilarityStrategy> = {
    fast_levenshtein: {
        id: "fast_levenshtein",
        label: "Fast Levenshtein",
        calculate: calculateFastLevenshteinSimilarity
    },
    hybrid_legacy: {
        id: "hybrid_legacy",
        label: "Hybrid Legacy",
        calculate: calculateLegacySimilarity
    }
};

export const calculateStoryReadingSimilarity = (queryReading: string, candidateReading: string, strategyId: StoryReadingSimilarityStrategyId = STORY_READING_DEFAULT_STRATEGY): StoryReadingSimilarityMetrics=>{
    const strategy = storyReadingSimilarityStrategies[strategyId] ?? storyReadingSimilarityStrategies[STORY_READING_DEFAULT_STRATEGY];
    return strategy.calculate(queryReading, candidateReading);
};
