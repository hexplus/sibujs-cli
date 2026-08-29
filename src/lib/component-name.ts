import path from "node:path";

/**
 * Component-name policy for `sibujs generate component <name>`.
 *
 * The generated name is used for two things at once: a filename inside the
 * output directory, and a function declaration in the emitted source. A value
 * that is unsafe for either is rejected outright rather than coerced, because
 * silently rewriting a name the user typed is its own kind of surprise.
 *
 * Accepted input: one or more alphanumeric words separated by `-` or `_`,
 * optionally already PascalCase. The first character of the result must be a
 * letter.
 *
 *   button          -> Button
 *   my-card         -> MyCard
 *   user_profile    -> UserProfile
 *   already-Pascal  -> AlreadyPascal
 *
 * Everything else is refused: path separators and traversal segments, absolute
 * and drive-qualified paths, NUL and control characters, whitespace, quotes and
 * template delimiters, leading digits, and reserved words that cannot legally
 * follow `function`.
 */

/**
 * Words that cannot appear as a function name in a `function <name>()`
 * declaration in strict-mode ES modules, which is what the template emits.
 * Contextual keywords such as `type` or `from` are legal identifiers and are
 * deliberately absent.
 */
const RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/** Only letters and digits, grouped by `-`/`_` separators. */
const VALID_RAW_NAME = /^[A-Za-z][A-Za-z0-9]*(?:[-_]+[A-Za-z0-9]+)*$/;

export interface NameRejection {
  ok: false;
  reason: string;
}
export interface NameAcceptance {
  ok: true;
  /** PascalCase identifier, safe as both a filename stem and a function name. */
  name: string;
}
export type NameResult = NameAcceptance | NameRejection;

function toPascalCase(name: string): string {
  return name
    .replace(/[-_]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

/**
 * Validate and normalize a raw component name.
 *
 * Purely a decision function: it touches no filesystem and creates nothing, so
 * a rejected name can never have left a directory or a partial file behind.
 */
export function normalizeComponentName(rawName: unknown): NameResult {
  if (typeof rawName !== "string") {
    return { ok: false, reason: "Component name must be a string." };
  }

  if (rawName.length === 0) {
    return { ok: false, reason: "Component name cannot be empty." };
  }

  // Checked before anything else: a NUL can truncate a path inside some
  // syscalls, so it must never reach path handling.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: detecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(rawName)) {
    return { ok: false, reason: "Component name cannot contain control characters." };
  }

  if (/[/\\]/.test(rawName)) {
    return {
      ok: false,
      reason: "Component name cannot contain path separators (`/` or `\\`).",
    };
  }

  // Catches `.`, `..`, and any dotted form such as `component.name`.
  if (rawName.includes(".")) {
    return { ok: false, reason: "Component name cannot contain `.`." };
  }

  // `C:name` has no separator but is still drive-qualified on Windows.
  if (/^[A-Za-z]:/.test(rawName)) {
    return { ok: false, reason: "Component name cannot be a drive-qualified path." };
  }

  if (path.isAbsolute(rawName)) {
    return { ok: false, reason: "Component name cannot be an absolute path." };
  }

  if (/\s/.test(rawName)) {
    return { ok: false, reason: "Component name cannot contain whitespace." };
  }

  if (/^[0-9]/.test(rawName)) {
    return { ok: false, reason: "Component name cannot start with a digit." };
  }

  if (!VALID_RAW_NAME.test(rawName)) {
    return {
      ok: false,
      reason:
        "Component name may only contain letters and digits, separated by `-` or `_`, and must start with a letter.",
    };
  }

  const name = toPascalCase(rawName);

  // Belt and braces: the emitted source must parse even if the rules above are
  // ever loosened.
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    return { ok: false, reason: `"${name}" is not a valid identifier.` };
  }

  // Normalization always capitalizes the first character, so a reserved word
  // such as `class` becomes `Class`, which is a perfectly legal function name
  // and is therefore accepted. This check is the safety net for the case where
  // the rules above are ever loosened enough to let a bare keyword through.
  if (RESERVED_WORDS.has(name)) {
    return { ok: false, reason: `"${name}" is a reserved word and cannot be a function name.` };
  }

  return { ok: true, name };
}

/**
 * Confirm that `filePath` is a direct child of `outDir`.
 *
 * Uses `path.relative` on resolved paths rather than string prefixes, so it is
 * correct under both POSIX and Windows semantics: a different drive letter
 * yields an absolute relative path, and any traversal yields a `..` segment.
 */
export function isDirectChild(outDir: string, filePath: string): boolean {
  const resolvedDir = path.resolve(outDir);
  const resolvedFile = path.resolve(filePath);
  const rel = path.relative(resolvedDir, resolvedFile);

  if (rel === "" || rel === ".") return false;
  if (path.isAbsolute(rel)) return false;
  // Any traversal, or any nesting, disqualifies it.
  if (rel.split(/[/\\]/).length !== 1) return false;
  if (rel === ".." || rel.startsWith("..")) return false;

  return true;
}
