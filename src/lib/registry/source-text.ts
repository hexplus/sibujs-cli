/**
 * Just enough JavaScript lexing to edit config files safely: blank out
 * comments (and optionally string contents) so structural patterns such as
 * `plugins: [` only ever match real code.
 *
 * The result has the same length and line breaks as the input, so a match
 * index in the masked text is the same index in the original. Anything the
 * scanner is not sure about (an unterminated string, comment or regular
 * expression) returns `null`, and callers fall back to printing instructions
 * rather than guessing.
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

const OPENERS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

/**
 * Within the object literal whose `{` is at `open` in masked `code`, find a
 * property named `key` at the top level of that object (not in a nested
 * object such as `build.rollupOptions`). Returns the index just after
 * `key:`, or -1. Also returns the index of the object's closing `}`.
 */
export function findTopLevelKey(code: string, open: number, key: string): { value: number; close: number } {
  const stack: string[] = [];
  let value = -1;
  let lastSignificant = "{";
  const pattern = new RegExp(`^${key}\\s*:`);
  for (let i = open + 1; i < code.length; i++) {
    const ch = code[i];
    if (OPENERS[ch]) {
      stack.push(OPENERS[ch]);
    } else if (ch === "}" || ch === "]" || ch === ")") {
      if (stack.length === 0) return { value, close: ch === "}" ? i : -1 };
      if (stack.pop() !== ch) return { value: -1, close: -1 };
    } else if (
      stack.length === 0 &&
      value === -1 &&
      (lastSignificant === "{" || lastSignificant === ",") &&
      /[A-Za-z_$]/.test(ch)
    ) {
      // A property name at depth 0 directly follows `{` or `,`.
      const match = pattern.exec(code.slice(i, i + key.length + 64));
      if (match) value = i + match[0].length;
    }
    if (!/\s/.test(ch)) lastSignificant = ch;
  }
  return { value, close: -1 };
}
