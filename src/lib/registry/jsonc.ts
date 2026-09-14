/**
 * Minimal JSONC reading for tsconfig files: strips `//` and `/* *\/` comments
 * and trailing commas outside of strings, then hands the rest to JSON.parse.
 */
export function parseJsonc(text: string): { data: unknown; hasComments: boolean } {
  let out = "";
  let hasComments = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      hasComments = true;
      while (i < text.length && text[i] !== "\n") i++;
    } else if (ch === "/" && text[i + 1] === "*") {
      hasComments = true;
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += ch;
      i++;
    }
  }
  return { data: JSON.parse(removeTrailingCommas(out)), hasComments };
}

function removeTrailingCommas(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") {
        i++;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

const PRIMITIVE = String.raw`(?:"[^"\\]*(?:\\.[^"\\]*)*"|-?\d[\d.eE+-]*|true|false|null)`;
const PRIMITIVE_ARRAY = new RegExp(String.raw`\[\s*(${PRIMITIVE}(?:,\s*${PRIMITIVE})*)\s*\]`, "g");

/** `JSON.stringify` with 2-space indent, keeping arrays of primitives on one line, as tsconfig files usually are. */
export function formatJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2).replace(PRIMITIVE_ARRAY, (_m, body: string) => `[${body.split(/,\s*\n\s*/).join(", ")}]`)}\n`;
}
