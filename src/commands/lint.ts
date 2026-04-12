import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

interface LintViolation {
  rule: string;
  message: string;
  line: number;
  column: number;
}

interface LintRule {
  name: string;
  check: (content: string) => Array<{ index: number; message: string }>;
}

const HOOK_NAMES = [
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
];

export const RULES: LintRule[] = [
  {
    name: "no-hooks-in-conditionals",
    check(content) {
      const results: Array<{ index: number; message: string }> = [];
      // Find hooks that appear inside if/else blocks, ternaries, or && short-circuits
      // Strategy: track brace depth after if/else keywords
      const hookPattern = new RegExp(`\\b(${HOOK_NAMES.join("|")})\\s*\\(`, "g");
      const lines = content.split("\n");

      // Stack of brace depths at which conditional blocks were entered.
      // Allows nested if/else tracking without losing the outer context.
      //
      // Processing is split into phases per line to handle patterns like
      // `} else if (x) {` where the leading `}` must close the previous
      // conditional before the new one is pushed.
      const conditionalStack: number[] = [];
      let bracelessConditional = false;
      let braceDepth = 0;
      let offset = 0;

      for (const line of lines) {
        const isConditionalStart =
          /^\s*if\s*\(/.test(line) ||
          /}\s*else\s*(if\s*\()?\s*\{?/.test(line) ||
          /^\s*else\s*(if\s*\()?\s*\{?/.test(line);
        const hasLeadingClose = isConditionalStart && /^\s*\}/.test(line);

        // Phase 1: process leading `}` for `} else` patterns BEFORE pushing new conditional
        if (hasLeadingClose) {
          braceDepth--;
          while (conditionalStack.length > 0 && braceDepth < conditionalStack[conditionalStack.length - 1]) {
            conditionalStack.pop();
          }
        }

        // Phase 2: push new conditional onto the stack
        if (isConditionalStart) {
          if (line.includes("{")) {
            conditionalStack.push(braceDepth + 1);
          } else {
            bracelessConditional = true;
          }
        }

        // Phase 3: process remaining braces (skip leading `}` if already handled)
        const braceStartIdx = hasLeadingClose ? line.indexOf("}") + 1 : 0;
        for (let ci = braceStartIdx; ci < line.length; ci++) {
          const ch = line[ci];
          if (ch === "{") braceDepth++;
          if (ch === "}") {
            braceDepth--;
            while (conditionalStack.length > 0 && braceDepth < conditionalStack[conditionalStack.length - 1]) {
              conditionalStack.pop();
            }
          }
        }

        // Phase 4: check for hooks on this line if we're inside a conditional.
        // For single-line blocks like `if (x) { hook(); }`, the stack may already
        // be empty after brace tracking, so also check conditional-start lines directly.
        const inConditional =
          conditionalStack.length > 0 || bracelessConditional || (isConditionalStart && line.includes("{"));

        if (inConditional) {
          const searchLine = isConditionalStart ? (line.includes("{") ? line.slice(line.indexOf("{") + 1) : "") : line;
          const searchOffset = isConditionalStart ? (line.includes("{") ? line.indexOf("{") + 1 : 0) : 0;

          if (searchLine) {
            let match: RegExpExecArray | null;
            hookPattern.lastIndex = 0;
            while ((match = hookPattern.exec(searchLine)) !== null) {
              results.push({
                index: offset + searchOffset + match.index,
                message: `${match[1]} should not be called inside conditionals`,
              });
            }
          }
          // Braceless conditional only covers the next statement
          if (bracelessConditional && !isConditionalStart) bracelessConditional = false;
        }

        offset += line.length + 1; // +1 for newline
      }

      return results;
    },
  },
  {
    name: "no-direct-dom-mutation",
    check(content) {
      const results: Array<{ index: number; message: string }> = [];
      const pattern = /\.(innerHTML|outerHTML)\s*=/g;
      const lines = content.split("\n");
      let offset = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Support inline disable comments
        if (trimmed.includes("sibujs-disable") && !trimmed.includes("sibujs-disable-next-line")) {
          offset += line.length + 1;
          continue;
        }
        if (i > 0) {
          const prevTrimmed = lines[i - 1].trim();
          if (
            prevTrimmed.includes("sibujs-disable-next-line") &&
            (prevTrimmed.includes("no-direct-dom-mutation") ||
              !prevTrimmed.includes(" ", prevTrimmed.indexOf("sibujs-disable-next-line") + 25))
          ) {
            offset += line.length + 1;
            continue;
          }
        }
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
          results.push({
            index: offset + match.index,
            message: "Avoid direct DOM mutation — use reactive bindings instead",
          });
        }
        offset += line.length + 1;
      }
      return results;
    },
  },
  {
    name: "each-requires-key",
    check(content) {
      const results: Array<{ index: number; message: string }> = [];
      // Find each() calls and check if they have a key option.
      // each(signal, renderFn) — missing key
      // each(signal, renderFn, { key: ... }) — has key
      // We look for `each(` and then check if a third argument with `key` exists.
      const eachPattern = /\beach\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = eachPattern.exec(content)) !== null) {
        // Walk forward from the match to find the balanced closing paren
        const start = match.index + match[0].length;
        let depth = 1;
        let i = start;
        let argCount = 1;
        let hasKey = false;

        while (i < content.length && depth > 0) {
          const ch = content[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) break;
          } else if (ch === "," && depth === 1) {
            argCount++;
          }
          // Check for key: or "key" in what looks like a third argument
          if (argCount >= 3 && depth === 1 && !hasKey) {
            const remaining = content.slice(i, Math.min(i + 50, content.length));
            if (/key\s*[:=]/.test(remaining) || /key\s*,/.test(remaining)) {
              hasKey = true;
            }
          }
          i++;
        }

        if (argCount < 3 && !hasKey) {
          results.push({
            index: match.index,
            message: "each() should include a key option for efficient updates",
          });
        }
      }
      return results;
    },
  },
];

export function lintFile(filePath: string): LintViolation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const violations: LintViolation[] = [];

  for (const rule of RULES) {
    const hits = rule.check(content);
    for (const hit of hits) {
      const beforeMatch = content.slice(0, hit.index);
      const line = beforeMatch.split("\n").length;
      const lastNewline = beforeMatch.lastIndexOf("\n");
      const column = hit.index - lastNewline;
      violations.push({ rule: rule.name, message: hit.message, line, column });
    }
  }

  return violations;
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

export function lint(files?: string[]) {
  const targets =
    files && files.length > 0
      ? files.map((f) => path.resolve(f))
      : collectFiles(path.resolve("src"), [".ts", ".tsx", ".js", ".jsx"]);

  if (targets.length === 0) {
    console.log(pc.yellow("No files found to lint."));
    return;
  }

  let totalViolations = 0;

  for (const file of targets) {
    const violations = lintFile(file);
    if (violations.length > 0) {
      const rel = path.relative(process.cwd(), file);
      console.log(`\n${pc.underline(rel)}`);
      for (const v of violations) {
        console.log(`  ${pc.dim(`${v.line}:${v.column}`)}  ${pc.yellow("warning")}  ${v.message}  ${pc.dim(v.rule)}`);
      }
      totalViolations += violations.length;
    }
  }

  if (totalViolations === 0) {
    console.log(pc.green("✔ No lint issues found."));
  } else {
    console.log(`\n${pc.yellow(`⚠ ${totalViolations} issue${totalViolations > 1 ? "s" : ""} found.`)}`);
  }
}
