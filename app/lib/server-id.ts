import crypto from "node:crypto";

const INTERNAL_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DEFAULT_INTERNAL_ID_LENGTH = 12;

export const createInternalId = (prefix: string, length = DEFAULT_INTERNAL_ID_LENGTH)=>{
    const normalizedPrefix = String(prefix).trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(normalizedPrefix)) {
        throw new Error(`invalid internal id prefix: ${prefix}`);
    }

    const bytes = crypto.randomBytes(length);
    let suffix = "";
    for (let index = 0; index < length; index += 1) {
        suffix += INTERNAL_ID_ALPHABET[bytes[index] % INTERNAL_ID_ALPHABET.length];
    }
    return `${normalizedPrefix}_${suffix}`;
};
