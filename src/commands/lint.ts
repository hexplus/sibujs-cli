import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import type * as TS from "typescript";
import { loadTypeScript, typeScriptMissingMessage } from "../lib/ts-loader.js";

export interface LintViolation {
  rule: string;
  message: string;
  line: number;
  column: number;
}

/**
 * Reactive primitives that must be created unconditionally, so the same set is
 * created on every execution of a component.
 */
const HOOK_NAMES = new Set([
  "signal",
  "effect",
  "derived",
  "watch",
  "memo",
  "ref",
  "store",
  "array",
  "memoFn",
  "deepSignal",
  "writable",
]);

const RULE_NAMES = ["no-hooks-in-conditionals", "no-direct-dom-mutation", "each-requires-key"] as const;
export type RuleName = (typeof RULE_NAMES)[number];

interface RawHit {
  rule: RuleName;
  message: string;
  pos: number;
}

/**
 * Is this a call `name(...)` on a bare identifier?
 *
 * Member calls such as `obj.signal()` are a different function and are not
 * reported. Local shadowing of an imported name is not tracked — that needs a
 * full type checker, and is documented as a known limitation.
 */
function isBareCallTo(ts: typeof TS, node: TS.Node, names: Set<string> | string): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isIdentifier(callee)) return false;
  return typeof names === "string" ? callee.text === names : names.has(callee.text);
}

/**
 * Collect hook calls in `node` without descending into nested function bodies.
 *
 * A hook inside a function *declared* in a conditional branch runs when that
 * function is called, not when the branch is taken, so it is not the defect
 * this rule is about.
 */
function collectHookCalls(ts: typeof TS, node: TS.Node, out: TS.CallExpression[]): void {
  const visit = (n: TS.Node): void => {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isClassDeclaration(n)
    ) {
      return;
    }
    if (isBareCallTo(ts, n, HOOK_NAMES)) out.push(n as TS.CallExpression);
    ts.forEachChild(n, visit);
  };
  visit(node);
}

/**
 * `each()` needs a key to reconcile efficiently.
 *
 * A key is accepted only when it can be established statically: the third
 * argument is an object literal carrying a `key` property, either `{ key: fn }`
 * or the shorthand `{ key }`. Everything else is reported — no third argument,
 * `undefined`, an object literal without `key`, or a variable whose contents
 * are unknown at this point.
 *
 * The conservative direction is deliberate. A missing key degrades list
 * reconciliation silently at runtime, so the rule never assumes an opaque value
 * supplies one. Spreading a variable (`{ ...opts }`) is likewise not proof of a
 * key. Suppress a known-good dynamic case with a `sibujs-disable-next-line`
 * comment.
 */
function eachCallHasStaticKey(ts: typeof TS, call: TS.CallExpression): boolean {
  const third = call.arguments[2];
  if (!third) return false;
  if (!ts.isObjectLiteralExpression(third)) return false;

  for (const prop of third.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      const name = prop.name;
      if (ts.isIdentifier(name) && name.text === "key") return true;
      if (ts.isStringLiteralLike(name) && name.text === "key") return true;
    }
  }
  return false;
}

/** Left-hand sides that write raw markup into the DOM. */
const DOM_SINKS = new Set(["innerHTML", "outerHTML"]);

function isDomSinkAssignment(ts: typeof TS, node: TS.Node): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  const left = node.left;
  if (ts.isPropertyAccessExpression(left) && DOM_SINKS.has(left.name.text)) return true;
  if (ts.isElementAccessExpression(left)) {
    const arg = left.argumentExpression;
    if (arg && ts.isStringLiteralLike(arg) && DOM_SINKS.has(arg.text)) return true;
  }
  return false;
}

/**
 * Suppression directives.
 *
 * Grammar — the whole comment body, after stripping comment markers and
 * trimming, must match:
 *
 *     <directive> [ <rule-name> ] [ "--" <reason> ]
 *
 *     <directive>  ::= "sibujs-disable" | "sibujs-disable-next-line"
 *     <rule-name>  ::= "no-hooks-in-conditionals"
 *                    | "no-direct-dom-mutation"
 *                    | "each-requires-key"
 *
 * Matching is token-based, never substring-based, so `sibujs-disabled`,
 * `not-sibujs-disable`, `sibujs-disable-next-lines` and
 * `sibujs-disable-something-else` are ordinary prose and suppress nothing.
 *
 * A directive naming an unknown rule is invalid and suppresses nothing. That is
 * the fail-safe direction: a typo must not silently switch off every rule.
 *
 * Anything after a `--` separator is a free-text reason and is ignored.
 */
type DirectiveKind = "disable" | "disable-next-line";

interface ParsedDirective {
  kind: DirectiveKind;
  /** `null` means every rule. */
  rules: RuleName[] | null;
}

const DIRECTIVE_KINDS: Record<string, DirectiveKind> = {
  "sibujs-disable": "disable",
  "sibujs-disable-next-line": "disable-next-line",
};

const KNOWN_RULES = new Set<string>(RULE_NAMES);

/**
 * Parse a comment body.
 *
 * @returns the directive, `"invalid"` when it opens with a directive keyword
 * but does not match the grammar, or `null` when it is not a directive at all.
 */
export function parseDirective(body: string): ParsedDirective | "invalid" | null {
  const tokens = body.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const kind = DIRECTIVE_KINDS[tokens[0]];
  if (!kind) return null;

  const rest = tokens.slice(1);
  if (rest.length === 0) return { kind, rules: null };

  // `sibujs-disable -- reason`
  if (rest[0] === "--") return { kind, rules: null };

  if (!KNOWN_RULES.has(rest[0])) return "invalid";

  // `sibujs-disable <rule>` optionally followed by `-- reason`
  if (rest.length > 1 && rest[1] !== "--") return "invalid";

  return { kind, rules: [rest[0] as RuleName] };
}

/**
 * The body of a comment, with its markers removed.
 *
 * A line comment contributes everything after its leading slashes.
 *
 * A block comment contributes its content only when, after the opening and
 * closing markers and any per-line leading asterisks are stripped, exactly one
 * non-empty line remains. That admits a one-line block directive and the boxed
 * form spread over three lines, while a JSDoc description that merely mentions
 * a directive alongside prose never becomes one.
 *
 * @returns the body, or `null` when the comment cannot carry a directive.
 */
function commentBody(text: string, isBlock: boolean): string | null {
  if (!isBlock) return text.replace(/^\/\/+/, "");

  const inner = text.replace(/^\/\*/, "").replace(/\*\/$/, "");
  const lines = inner
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/^\s*\*+/, "").trim())
    .filter((line) => line.length > 0);

  return lines.length === 1 ? lines[0] : null;
}

interface CommentInfo {
  body: string;
  isBlock: boolean;
  /** Zero-based line on which the comment ends. */
  endLine: number;
}

/**
 * Every comment in the file, taken from parser trivia rather than raw text.
 *
 * Comments are trivia attached ahead of tokens, so walking the parsed tokens
 * and reading the comment ranges at each boundary finds all of them — including
 * a trailing comment at end of file, which is trivia of the EOF token. Because
 * the positions come from the parser, a `/` that opens a regular expression or
 * a `//` inside a string, template or JSX literal is never mistaken for a
 * comment: those characters sit inside a token, not at a trivia boundary.
 */
function collectComments(ts: typeof TS, sourceFile: TS.SourceFile, text: string): CommentInfo[] {
  const ranges = new Map<number, TS.CommentRange>();

  const visit = (node: TS.Node): void => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
      ranges.set(range.pos, range);
    }
    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) {
      ranges.set(range.pos, range);
    }
    for (const child of node.getChildren(sourceFile)) visit(child);
  };
  visit(sourceFile);

  const comments: CommentInfo[] = [];
  for (const range of [...ranges.values()].sort((a, b) => a.pos - b.pos)) {
    const isBlock = range.kind === ts.SyntaxKind.MultiLineCommentTrivia;
    const body = commentBody(text.slice(range.pos, range.end), isBlock);
    if (body === null) continue;
    comments.push({
      body,
      isBlock,
      // `end` can sit just past a trailing newline; clamp to the last character
      // so the reported line is the one the comment visibly ends on.
      endLine: sourceFile.getLineAndCharacterOfPosition(Math.max(range.pos, range.end - 1)).line,
    });
  }
  return comments;
}

/**
 * Which lines are suppressed, and for which rules.
 *
 * `sibujs-disable` suppresses the line the comment ends on;
 * `sibujs-disable-next-line` suppresses the immediately following physical
 * line. Blank lines are not skipped.
 */
function collectDisabledLines(
  ts: typeof TS,
  sourceFile: TS.SourceFile,
  text: string,
): Map<number, Set<string> | "all"> {
  const disabled = new Map<number, Set<string> | "all">();

  const record = (lineNo: number, rules: RuleName[] | null) => {
    if (rules === null) {
      disabled.set(lineNo, "all");
      return;
    }
    const existing = disabled.get(lineNo);
    if (existing === "all") return;
    const set = existing ?? new Set<string>();
    for (const rule of rules) set.add(rule);
    disabled.set(lineNo, set);
  };

  for (const comment of collectComments(ts, sourceFile, text)) {
    const directive = parseDirective(comment.body);
    // `null` is ordinary prose; `"invalid"` is a malformed directive, which
    // deliberately suppresses nothing.
    if (directive === null || directive === "invalid") continue;
    record(comment.endLine + (directive.kind === "disable-next-line" ? 1 : 0), directive.rules);
  }

  return disabled;
}

function isSuppressed(disabled: Map<number, Set<string> | "all">, line: number, rule: string): boolean {
  const entry = disabled.get(line);
  if (entry === undefined) return false;
  if (entry === "all") return true;
  return entry.has(rule);
}

function hookMessage(ts: typeof TS, call: TS.CallExpression): string {
  const callee = call.expression;
  const name = ts.isIdentifier(callee) ? callee.text : "hook";
  return `${name}() should not be called inside conditionals`;
}

interface AnalyzedHit extends RawHit {
  line: number;
  column: number;
}

/**
 * Parse `content` and return every unsuppressed violation with its offset.
 * Shared by {@link lintSource} and the {@link RULES} compatibility layer.
 */
function analyzeSource(ts: typeof TS, fileName: string, content: string): AnalyzedHit[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const hits: RawHit[] = [];

  const reportHooks = (branch: TS.Node) => {
    const calls: TS.CallExpression[] = [];
    collectHookCalls(ts, branch, calls);
    for (const call of calls) {
      hits.push({
        rule: "no-hooks-in-conditionals",
        message: hookMessage(ts, call),
        pos: call.getStart(sourceFile),
      });
    }
  };

  const visit = (node: TS.Node): void => {
    // ---- no-hooks-in-conditionals -----------------------------------------
    if (ts.isIfStatement(node)) {
      // Covers both braced and braceless branches: the branch is a Block or a
      // single Statement, and either is walked the same way.
      reportHooks(node.thenStatement);
      // `else if` is itself an IfStatement and is reached by the normal walk,
      // so only a non-if else branch is scanned here.
      if (node.elseStatement && !ts.isIfStatement(node.elseStatement)) reportHooks(node.elseStatement);
    } else if (ts.isConditionalExpression(node)) {
      reportHooks(node.whenTrue);
      reportHooks(node.whenFalse);
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      // Only the short-circuited side is conditional.
      reportHooks(node.right);
    }

    // ---- no-direct-dom-mutation -------------------------------------------
    if (isDomSinkAssignment(ts, node)) {
      hits.push({
        rule: "no-direct-dom-mutation",
        message: "Avoid direct DOM mutation — use reactive bindings instead",
        pos: node.getStart(sourceFile),
      });
    }

    // ---- each-requires-key -------------------------------------------------
    if (isBareCallTo(ts, node, "each") && !eachCallHasStaticKey(ts, node as TS.CallExpression)) {
      hits.push({
        rule: "each-requires-key",
        message: "each() should include a key option for efficient updates",
        pos: node.getStart(sourceFile),
      });
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  const disabled = collectDisabledLines(ts, sourceFile, content);
  const analyzed: AnalyzedHit[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(hit.pos);
    if (isSuppressed(disabled, line, hit.rule)) continue;
    // A hook inside nested conditionals is visited once per enclosing
    // construct; report it once.
    const dedupe = `${hit.rule}:${hit.pos}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    analyzed.push({ ...hit, line: line + 1, column: character + 1 });
  }

  analyzed.sort((a, b) => a.line - b.line || a.column - b.column);
  return analyzed;
}

/**
 * Lint one file's source text.
 *
 * Exported so tests can exercise the rules without touching the filesystem.
 * Parsing with the TypeScript compiler means comments, strings, template
 * literals, regular expressions and property names are never mistaken for
 * executable syntax.
 */
export function lintSource(ts: typeof TS, fileName: string, content: string): LintViolation[] {
  return analyzeSource(ts, fileName, content).map(({ rule, message, line, column }) => ({
    rule,
    message,
    line,
    column,
  }));
}

export interface LintRule {
  name: RuleName;
  /** @returns character offsets of each violation, for compatibility. */
  check: (content: string) => Array<{ index: number; message: string }>;
}

/**
 * Rule objects addressable by name.
 *
 * Retained as the public surface it has always been, now backed by the AST
 * implementation rather than by per-rule text scanning. `check()` parses the
 * content and returns only the hits belonging to that rule.
 */
export const RULES: LintRule[] = RULE_NAMES.map((name) => ({
  name,
  check(content: string) {
    const ts = loadTypeScript();
    if (!ts) throw new Error("TypeScript compiler unavailable");
    return analyzeSource(ts, "rule-check.ts", content)
      .filter((hit) => hit.rule === name)
      .map((hit) => ({ index: hit.pos, message: hit.message }));
  },
}));

export function lintFile(filePath: string, ts?: typeof TS): LintViolation[] {
  const compiler = ts ?? loadTypeScript(path.dirname(filePath));
  if (!compiler) throw new Error("TypeScript compiler unavailable");
  const content = fs.readFileSync(filePath, "utf-8");
  return lintSource(compiler, filePath, content);
}

function collectFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      results.push(...collectFiles(fullPath, ext));
    } else if (ext.some((e) => entry.name.endsWith(e))) {
      results.push(fullPath);
    }
  }
  return results;
}

export interface LintOptions {
  /**
   * Report findings but still exit 0. Off by default: `sibujs lint` is wired
   * into generated projects as their `lint` script, and a lint step that always
   * succeeds gives CI false confidence.
   */
  warnOnly?: boolean;
}

/**
 * Lint the given files, or everything under `src/`.
 *
 * @returns the number of violations, or -1 when the parser is unavailable.
 * Sets `process.exitCode` to 1 on violations unless `warnOnly` is set.
 */
export function lint(files?: string[], options: LintOptions = {}): number {
  const ts = loadTypeScript();
  if (!ts) {
    console.error(typeScriptMissingMessage());
    process.exitCode = 1;
    return -1;
  }

  const targets =
    files && files.length > 0
      ? files.map((f) => path.resolve(f))
      : collectFiles(path.resolve("src"), [".ts", ".tsx", ".js", ".jsx"]);

  if (targets.length === 0) {
    console.log(pc.yellow("No files found to lint."));
    return 0;
  }

  let totalViolations = 0;
  const label = options.warnOnly ? pc.yellow("warning") : pc.red("error");

  for (const file of targets) {
    const violations = lintSource(ts, file, fs.readFileSync(file, "utf-8"));
    if (violations.length > 0) {
      const rel = path.relative(process.cwd(), file);
      console.log(`\n${pc.underline(rel)}`);
      for (const v of violations) {
        console.log(`  ${pc.dim(`${v.line}:${v.column}`)}  ${label}  ${v.message}  ${pc.dim(v.rule)}`);
      }
      totalViolations += violations.length;
    }
  }

  if (totalViolations === 0) {
    console.log(pc.green("✔ No lint issues found."));
    return 0;
  }

  const summary = `${totalViolations} issue${totalViolations > 1 ? "s" : ""} found.`;
  if (options.warnOnly) {
    console.log(`\n${pc.yellow(`⚠ ${summary}`)}`);
  } else {
    console.error(`\n${pc.red(`✖ ${summary}`)}`);
    process.exitCode = 1;
  }
  return totalViolations;
}
