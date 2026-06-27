import type { JsonSchema, SlashCommandArgument } from "../models";
import { LookupSlashCommand, type ImplicitMatch, type SlashCommandContext } from "./base";
import { DEFAULT_INSTALL_CONFIG, type InstallConfig } from "./install";

type CalcArgs = {
  expression: string;
};

export type CalcOutput = {
  expression: string;
  result: number;
  formatted: string;
};

export const calcOutputSchema = {
  type: "object",
  required: ["expression", "result", "formatted"],
  properties: {
    expression: { type: "string" },
    result: { type: "number" },
    formatted: { type: "string" }
  }
} satisfies JsonSchema;

// A small recursive-descent arithmetic evaluator. No `eval`, no `Function`, no
// global lookups — it only ever produces a JS number from a fixed grammar:
//
//   expr    := term (("+" | "-") term)*
//   term    := power (("*" | "/" | "%") power)*
//   power   := unary ("^" power)?           (right-associative)
//   unary   := ("+" | "-") unary | primary
//   primary := number | "(" expr ")" | constant
//
// Supported constants: pi, e. Everything else is a parse error.

type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "%" | "^" }
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "ident"; value: string };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%" || char === "^") {
      tokens.push({ kind: "op", value: char });
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let number = "";
      while (index < input.length && /[0-9._]/.test(input[index]!)) {
        if (input[index] !== "_") {
          number += input[index];
        }
        index += 1;
      }
      // Optional scientific notation: 1e3, 2.5e-4
      if (input[index] === "e" || input[index] === "E") {
        const lookahead = input[index + 1];
        if (lookahead && /[0-9+-]/.test(lookahead)) {
          number += "e";
          index += 1;
          if (input[index] === "+" || input[index] === "-") {
            number += input[index];
            index += 1;
          }
          while (index < input.length && /[0-9]/.test(input[index]!)) {
            number += input[index];
            index += 1;
          }
        }
      }
      const value = Number(number);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number "${number}".`);
      }
      tokens.push({ kind: "number", value });
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      let ident = "";
      while (index < input.length && /[a-zA-Z]/.test(input[index]!)) {
        ident += input[index];
        index += 1;
      }
      tokens.push({ kind: "ident", value: ident.toLowerCase() });
      continue;
    }

    throw new Error(`Unexpected character "${char}".`);
  }

  return tokens;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    if (this.tokens.length === 0) {
      throw new Error("Empty expression.");
    }
    const value = this.parseExpr();
    if (this.position < this.tokens.length) {
      throw new Error("Unexpected trailing input.");
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private consume(): Token {
    const token = this.tokens[this.position];
    if (!token) {
      throw new Error("Unexpected end of expression.");
    }
    this.position += 1;
    return token;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    while (true) {
      const token = this.peek();
      if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
        this.consume();
        const right = this.parseTerm();
        value = token.value === "+" ? value + right : value - right;
      } else {
        break;
      }
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parsePower();
    while (true) {
      const token = this.peek();
      if (token?.kind === "op" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        this.consume();
        const right = this.parsePower();
        if ((token.value === "/" || token.value === "%") && right === 0) {
          throw new Error("Division by zero.");
        }
        if (token.value === "*") {
          value *= right;
        } else if (token.value === "/") {
          value /= right;
        } else {
          value %= right;
        }
      } else {
        break;
      }
    }
    return value;
  }

  private parsePower(): number {
    const base = this.parseUnary();
    const token = this.peek();
    if (token?.kind === "op" && token.value === "^") {
      this.consume();
      // Right-associative: 2^3^2 === 2^(3^2).
      const exponent = this.parsePower();
      return base ** exponent;
    }
    return base;
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
      this.consume();
      const value = this.parseUnary();
      return token.value === "-" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.consume();

    if (token.kind === "number") {
      return token.value;
    }

    if (token.kind === "paren" && token.value === "(") {
      const value = this.parseExpr();
      const closing = this.consume();
      if (closing.kind !== "paren" || closing.value !== ")") {
        throw new Error("Expected closing parenthesis.");
      }
      return value;
    }

    if (token.kind === "ident") {
      const constant = CONSTANTS[token.value];
      if (typeof constant === "number") {
        return constant;
      }
      throw new Error(`Unknown identifier "${token.value}".`);
    }

    throw new Error("Expected a number or parenthesised expression.");
  }
}

export function evaluate(expression: string): number {
  const tokens = tokenize(expression);
  const result = new Parser(tokens).parse();
  if (!Number.isFinite(result)) {
    throw new Error("Result is not a finite number.");
  }
  return result;
}

// Non-throwing evaluator for implicit detection — returns undefined on any
// parse/eval error instead of raising.
export function tryEvaluate(expression: string): number | undefined {
  try {
    return evaluate(expression);
  } catch {
    return undefined;
  }
}

// A bare number ("5", "-3.2") is technically a valid expression but not an
// interesting *calculation* to surface implicitly. We require evidence of an
// actual operation: a binary operator or a parenthesised sub-expression. A
// lone constant like "pi" also qualifies (the user clearly wants its value).
const HAS_OPERATION = /[+\-*/%^]/;
const HAS_PAREN = /\(/;
const HAS_CONSTANT = /\b(pi|e)\b/i;
const ONLY_CALC_CHARS = /^[\s\d.+\-*/%^()eE_piPI]*$/;

export function looksLikeFormula(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }
  if (!ONLY_CALC_CHARS.test(trimmed)) {
    return false;
  }
  // Must contain a digit OR a known constant, and some operation/paren/constant.
  const hasNumberOrConstant = /\d/.test(trimmed) || HAS_CONSTANT.test(trimmed);
  if (!hasNumberOrConstant) {
    return false;
  }
  // Strip a leading sign before deciding "is there a real operation": "-5" alone
  // shouldn't count, but "-5 + 2" should.
  const withoutLeadingSign = trimmed.replace(/^[+\-]\s*/, "");
  return HAS_OPERATION.test(withoutLeadingSign) || HAS_PAREN.test(trimmed) || HAS_CONSTANT.test(trimmed);
}

function formatResult(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString("en-US");
  }
  // Trim floating-point noise while keeping useful precision.
  const rounded = Number(value.toPrecision(12));
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

export class CalcCommand extends LookupSlashCommand<CalcArgs, CalcOutput> {
  readonly id = "slash.calc";
  readonly name = "Calculator";
  readonly command = "/calc";
  readonly description = "Evaluate an arithmetic expression (+ - * / % ^, parentheses, pi, e).";
  readonly arguments: SlashCommandArgument[] = [{
    name: "expression",
    label: "expression",
    type: "text",
    required: true,
    placeholder: "2 + 2 * 10",
    widthChars: 24
  }];
  readonly outputSchema = calcOutputSchema;

  protected readonly triggerPatterns = [/^\s*[-+(]?\s*\d[\d\s.+\-*/%^()e]*$/];

  // Implicit pickup ON by default: a bare formula renders its result inline,
  // live, beneath the input ("5 + 7" → 12).
  readonly installDefaults: InstallConfig = {
    ...DEFAULT_INSTALL_CONFIG,
    priority: 10,
    implicit: { enabled: true, render: "inline-live", minConfidence: 0.6 }
  };

  detectImplicit(query: string): ImplicitMatch<CalcArgs> | undefined {
    const expression = query.trim();
    if (!looksLikeFormula(expression)) {
      return undefined;
    }
    const result = tryEvaluate(expression);
    if (result === undefined) {
      return undefined;
    }
    // Confidence scales with how "operator-dense" the input is — "5+7" is almost
    // certainly a calc; "2024" with no operator never reaches here.
    const operatorCount = (expression.match(/[+\-*/%^]/g) ?? []).length;
    const confidence = Math.min(0.7 + operatorCount * 0.1, 0.99);
    return {
      confidence,
      args: { expression },
      label: `${expression} = ${formatResult(result)}`
    };
  }

  parseArguments(context: SlashCommandContext): CalcArgs {
    const explicit = this.argumentValue(context, "expression");
    const inline = context.request.query.replace(/^\/calc\b/i, "").trim();
    const expression = String(explicit || inline).trim();

    if (!expression) {
      throw new Error("/calc requires an expression.");
    }

    return { expression };
  }

  executeCommand(args: CalcArgs): CalcOutput {
    const result = evaluate(args.expression);
    return {
      expression: args.expression,
      result,
      formatted: formatResult(result)
    };
  }
}

export function calcSlashCommand() {
  return new CalcCommand();
}
