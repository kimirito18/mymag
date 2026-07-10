declare module "fast-levenshtein" {
    const levenshtein: {
        get(left: string, right: string, options?: {
            useCollator?: boolean;
        }): number;
    };
    export default levenshtein;
}
