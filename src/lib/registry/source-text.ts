/**
 * Just enough JavaScript lexing to edit config files safely.
 *
 * `maskSource` blanks out comments (and optionally string contents) so
 * structural patterns only ever match real code. The result has the same
 * length and line breaks as the input, so an index in the masked text is the
 * same index in the original. Anything the scanner is not sure about (an
 * unterminated string, comment or regular expression) returns `null`, and
 * callers fall back to printing instructions rather than guessing.
 *
 * The readers below work on source masked with `strings: true` — string
 * contents are spaces but their quotes remain — and read literal values back
 * from the original text at the same indices.
 */
export function maskSource(source: string, options: { strings: boolean }): string | null {
  const out = source.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  // Last significant character, to tell a regex literal from a division.
  let previous = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return null;
      blank(i, end + 2);
      i = end + 2;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      let depth = 0;
      for (; j < source.length; j++) {
        const c = source[j];
        if (c === "\\") {
          j++;
        } else if (ch === "`" && c === "$" && source[j + 1] === "{") {
          depth++;
          j++;
        } else if (ch === "`" && depth > 0 && c === "}") {
          depth--;
        } else if (c === ch && depth === 0) {
          break;
        } else if (c === "\n" && ch !== "`") {
          return null;
        }
      }
      if (j >= source.length) return null;
      if (options.strings) blank(i + 1, j);
      previous = ch;
      i = j + 1;
    } else if (ch === "/" && (previous === "" || "(,=:[!&|?{};+-*%<>~^".includes(previous))) {
      let j = i + 1;
      let inClass = false;
      for (; j < source.length; j++) {
        const c = source[j];
        if (c === "\\") j++;
        else if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) break;
        else if (c === "\n") return null;
      }
      if (j >= source.length) return null;
      if (options.strings) blank(i + 1, j);
      previous = "/";
      i = j + 1;
    } else {
      if (!/\s/.test(ch)) previous = ch;
      i++;
    }
  }
  return out.join("");
}

const QUOTES = new Set(['"', "'", "`"]);
const CLOSERS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

/** Index of the first non-whitespace character at or after `index`. */
export function skipSpace(code: string, index: number): number {
  let i = index;
  while (i < code.length && /\s/.test(code[i])) i++;
  return i;
}

/** The string literal starting at `index` (after whitespace), or `undefined`. */
export function stringAt(code: string, source: string, index: number): string | undefined {
  const start = skipSpace(code, index);
  const quote = code[start];
  if (!QUOTES.has(quote)) return undefined;
  const end = code.indexOf(quote, start + 1);
  if (end === -1) return undefined;
  const text = source.slice(start + 1, end);
  // A template with substitutions has no single static value.
  return quote === "`" && text.includes("${") ? undefined : text;
}

/** Index of the bracket that closes the one at `open`, or -1. */
function matching(code: string, open: number): number {
  const stack: string[] = [];
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (CLOSERS[ch]) stack.push(CLOSERS[ch]);
    else if (ch === "}" || ch === "]" || ch === ")") {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

export interface ObjectLiteral {
  /** Property name → index just after its `:`. */
  keys: Map<string, number>;
  /** A spread, computed key or shorthand property makes the key set unknowable. */
  opaque: boolean;
  close: number;
}

/**
 * The properties at the top level of the object literal whose `{` is at
 * `open`. `null` when the braces do not balance.
 */
export function readObject(code: string, source: string, open: number): ObjectLiteral | null {
  const close = matching(code, open);
  if (close === -1) return null;
  const keys = new Map<string, number>();
  let opaque = false;
  let i = open + 1;
  while (i < close) {
    i = skipSpace(code, i);
    if (i >= close) break;
    let name: string | undefined;
    let after = i;
    if (QUOTES.has(code[i])) {
      name = stringAt(code, source, i);
      after = code.indexOf(code[i], i + 1) + 1;
    } else {
      const ident = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, close));
      if (ident) {
        name = ident[0];
        after = i + ident[0].length;
      }
    }
    const colon = skipSpace(code, after);
    if (name === undefined || code[colon] !== ":") opaque = true;
    else if (!keys.has(name)) keys.set(name, colon + 1);

    // Move past this property's value to the next top-level comma.
    let j = name !== undefined && code[colon] === ":" ? colon + 1 : i;
    for (; j < close; j++) {
      const ch = code[j];
      if (CLOSERS[ch]) {
        j = matching(code, j);
        if (j === -1) return null;
      } else if (ch === ",") {
        break;
      }
    }
    i = j + 1;
  }
  return { keys, opaque, close };
}

/** Start indices of the top-level elements of the array literal at `open`. */
export function readArray(code: string, open: number): number[] | null {
  const close = matching(code, open);
  if (close === -1) return null;
  const elements: number[] = [];
  let i = open + 1;
  while (i < close) {
    i = skipSpace(code, i);
    if (i >= close) break;
    elements.push(i);
    let j = i;
    for (; j < close; j++) {
      if (CLOSERS[code[j]]) {
        j = matching(code, j);
        if (j === -1) return null;
      } else if (code[j] === ",") {
        break;
      }
    }
    i = j + 1;
  }
  return elements;
}

export interface ImportDeclaration {
  specifier: string;
  /** What is imported, e.g. `tailwindcss` or `{ fileURLToPath }`; empty for side-effect imports. */
  clause: string;
}

/**
 * Real `import … from "x"`, `import "x"` and `require("x")` in the file.
 * Strings and comments that merely mention a module never count, because the
 * keyword itself must be code.
 */
export function readImports(code: string, source: string): ImportDeclaration[] {
  const found: ImportDeclaration[] = [];
  const pattern = /(?<![\w$.])import\s*([\w$*{},\s]*?)\s*(?:from\s*)?(?=["'])|(?<![\w$.])require\s*\(\s*(?=["'])/g;
  for (const match of code.matchAll(pattern)) {
    const at = (match.index ?? 0) + match[0].length;
    const specifier = stringAt(code, source, at);
    if (specifier === undefined) continue;
    const clause = match[0].startsWith("import") ? (match[1] ?? "").trim() : "";
    found.push({ specifier, clause });
  }
  return found;
}
