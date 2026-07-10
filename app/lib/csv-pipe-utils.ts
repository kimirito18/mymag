const isWhitespace = (value: string) => /\s/.test(value);

export const unescapeCsvPipeText = (value: string) => {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      const next = value[index + 1];
      if (next === "|" || next === ";" || next === "\\" || next === ",") {
        result += next;
        index += 1;
        continue;
      }
    }
    result += char;
  }
  return result;
};

export const escapeCsvPipeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/;/g, "\\;");

export const splitEscapedPipe = (value: string) => {
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      const next = value[index + 1];
      if (next === "|" || next === ";" || next === "\\" || next === ",") {
        current += next;
        index += 1;
        continue;
      }
    }
    if (char === "|") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current.trim());
  return parts.filter(Boolean);
};

export const splitEscapedPipeList = (value: string) => {
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      const next = value[index + 1];
      if (next === "|" || next === ";" || next === "\\" || next === ",") {
        current += next;
        index += 1;
        continue;
      }
    }
    if ((char === "|" || char === "," || char === "、") && current.trim()) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    if ((char === "|" || char === "," || char === "、") && !current.trim()) {
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts.filter(Boolean);
};

export const splitStructuredCsvEntries = (value: string) => {
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      const next = value[index + 1];
      if (next === "|" || next === ";" || next === "\\" || next === ",") {
        current += next;
        index += 1;
        continue;
      }
    }
    if (char === ";" || char === "\n") {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
      while (isWhitespace(value[index + 1] ?? "")) {
        index += 1;
      }
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
};
