export type SqlDialect = "postgresql" | "mysql" | "sqlite";
export type SqlKeywordCase = "uppercase" | "lowercase";

type TokenType = "word" | "string" | "comment" | "symbol";

interface Token {
  value: string;
  type: TokenType;
}

const BASE_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "JOIN", "LEFT", "RIGHT", "INNER",
  "OUTER", "FULL", "CROSS", "ON", "AS", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN",
  "LIKE", "IS", "NULL", "DISTINCT", "UNION", "ALL", "CASE", "WHEN", "THEN", "ELSE", "END",
  "CREATE", "TABLE", "ALTER", "DROP", "INDEX", "VIEW", "WITH", "RECURSIVE", "RETURNING",
]);

const DIALECT_KEYWORDS: Record<SqlDialect, Set<string>> = {
  postgresql: new Set(["ILIKE", "SIMILAR", "SERIAL", "JSONB", "RETURNING", "LATERAL"]),
  mysql: new Set(["REPLACE", "STRAIGHT_JOIN", "AUTO_INCREMENT", "SHOW", "DESCRIBE"]),
  sqlite: new Set(["WITHOUT", "ROWID", "GLOB", "PRAGMA", "VACUUM"]),
};

const CLAUSE_BREAK_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "JOIN", "LEFT", "RIGHT", "INNER",
  "OUTER", "FULL", "CROSS", "ON", "UNION", "WITH", "WHEN", "ELSE", "THEN",
]);

function isBackslashEscaped(sql: string, quoteIndex: number): boolean {
  let slashCount = 0;
  let cursor = quoteIndex - 1;

  while (cursor >= 0 && sql[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }

  return slashCount % 2 === 1;
}

function matchDollarQuoteDelimiter(sql: string, startIndex: number): string | null {
  if (sql[startIndex] !== "$") {
    return null;
  }

  let cursor = startIndex + 1;
  while (cursor < sql.length && sql[cursor] !== "$") {
    const ch = sql[cursor];
    if (!/[A-Za-z0-9_]/.test(ch)) {
      return null;
    }

    cursor += 1;
  }

  if (cursor >= sql.length || sql[cursor] !== "$") {
    return null;
  }

  return sql.slice(startIndex, cursor + 1);
}

function isPrefixedQuotePrefix(prefix: string): boolean {
  const upper = prefix.toUpperCase();

  if (upper === "E" || upper === "N" || upper === "X" || upper === "B" || upper === "U&") {
    return true;
  }

  return prefix.startsWith("_");
}

function findQuotedTokenEnd(sql: string, quote: string, startQuoteIndex: number): number {
  let cursor = startQuoteIndex + 1;

  while (cursor < sql.length) {
    if (sql[cursor] === quote) {
      if (sql[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }

      if ((quote === "'" || quote === '"') && isBackslashEscaped(sql, cursor)) {
        cursor += 1;
        continue;
      }

      return cursor + 1;
    }

    cursor += 1;
  }

  return sql.length;
}

function matchPrefixedQuotedLiteral(sql: string, startIndex: number): { end: number } | null {
  const first = sql[startIndex];
  if (!/[A-Za-z_]/.test(first)) {
    return null;
  }

  let cursor = startIndex + 1;
  while (cursor < sql.length && /[A-Za-z0-9_&]/.test(sql[cursor])) {
    cursor += 1;
  }

  if (cursor >= sql.length || (sql[cursor] !== "'" && sql[cursor] !== '"' && sql[cursor] !== "`")) {
    return null;
  }

  const prefix = sql.slice(startIndex, cursor);
  if (!isPrefixedQuotePrefix(prefix)) {
    return null;
  }

  return { end: findQuotedTokenEnd(sql, sql[cursor], cursor) };
}


function findLineCommentEnd(sql: string, startIndex: number): number {
  let cursor = startIndex;
  while (cursor < sql.length && sql[cursor] !== "\n") {
    cursor += 1;
  }

  return cursor;
}

function findBlockCommentEnd(sql: string, startIndex: number): number {
  let cursor = startIndex + 2;
  let depth = 1;

  while (cursor < sql.length - 1) {
    if (sql[cursor] === "/" && sql[cursor + 1] === "*") {
      depth += 1;
      cursor += 2;
      continue;
    }

    if (sql[cursor] === "*" && sql[cursor + 1] === "/") {
      depth -= 1;
      cursor += 2;
      if (depth === 0) {
        return cursor;
      }
      continue;
    }

    cursor += 1;
  }

  return sql.length;
}

function isLineCommentToken(token: Token): boolean {
  return token.type === "comment" && (token.value.startsWith("--") || token.value.startsWith("#"));
}

function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      const tokenEnd = findLineCommentEnd(sql, i + 2);
      tokens.push({ value: sql.slice(i, tokenEnd), type: "comment" });
      i = tokenEnd;
      continue;
    }

    if (ch === "#") {
      const tokenEnd = findLineCommentEnd(sql, i + 1);
      tokens.push({ value: sql.slice(i, tokenEnd), type: "comment" });
      i = tokenEnd;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      const tokenEnd = findBlockCommentEnd(sql, i);
      tokens.push({ value: sql.slice(i, tokenEnd), type: "comment" });
      i = tokenEnd;
      continue;
    }

    const dollarDelimiter = matchDollarQuoteDelimiter(sql, i);
    if (dollarDelimiter) {
      const bodyStart = i + dollarDelimiter.length;
      const endIndex = sql.indexOf(dollarDelimiter, bodyStart);
      const tokenEnd = endIndex === -1 ? sql.length : endIndex + dollarDelimiter.length;
      tokens.push({ value: sql.slice(i, tokenEnd), type: "string" });
      i = tokenEnd;
      continue;
    }

    const prefixedQuotedLiteral = matchPrefixedQuotedLiteral(sql, i);
    if (prefixedQuotedLiteral) {
      tokens.push({ value: sql.slice(i, prefixedQuotedLiteral.end), type: "string" });
      i = prefixedQuotedLiteral.end;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      const tokenEnd = findQuotedTokenEnd(sql, ch, i);
      tokens.push({ value: sql.slice(i, tokenEnd), type: "string" });
      i = tokenEnd;
      continue;
    }

    if (/[(),;]/.test(ch)) {
      tokens.push({ value: ch, type: "symbol" });
      i += 1;
      continue;
    }

    let j = i;
    while (j < sql.length && !/\s/.test(sql[j]) && !/[(),;]/.test(sql[j])) {
      if (sql[j] === "-" && sql[j + 1] === "-") break;
      if (sql[j] === "#") break;
      if (sql[j] === "/" && sql[j + 1] === "*") break;
      j += 1;
    }

    tokens.push({ value: sql.slice(i, j), type: "word" });
    i = j;
  }

  return tokens;
}

function isKeyword(token: Token, dialect: SqlDialect): boolean {
  if (token.type !== "word") return false;
  const upper = token.value.toUpperCase();
  return BASE_KEYWORDS.has(upper) || DIALECT_KEYWORDS[dialect].has(upper);
}

function withKeywordCase(value: string, keywordCase: SqlKeywordCase): string {
  return keywordCase === "uppercase" ? value.toUpperCase() : value.toLowerCase();
}

export function formatSql(
  sql: string,
  { dialect, keywordCase, indentSize }: { dialect: SqlDialect; keywordCase: SqlKeywordCase; indentSize: number }
): string {
  const tokens = tokenizeSql(sql);
  const lines: string[] = [];
  let currentLine = "";
  let indentLevel = 0;

  const flushLine = () => {
    if (currentLine.trim()) {
      lines.push(currentLine.trimEnd());
      currentLine = "";
    }
  };

  const append = (text: string) => {
    if (!currentLine) {
      currentLine = `${" ".repeat(indentLevel * indentSize)}${text}`;
    } else {
      currentLine += `${needsSpace(currentLine, text) ? " " : ""}${text}`;
    }
  };

  for (const token of tokens) {
    const upper = token.value.toUpperCase();

    if (token.value === ")") {
      flushLine();
      indentLevel = Math.max(0, indentLevel - 1);
      append(")");
      continue;
    }

    if (token.type === "comment") {
      flushLine();
      append(token.value);
      flushLine();
      continue;
    }

    if (token.value === "(") {
      append("(");
      flushLine();
      indentLevel += 1;
      continue;
    }

    if (token.value === ",") {
      append(",");
      flushLine();
      continue;
    }

    if (token.value === ";") {
      append(";");
      flushLine();
      lines.push("");
      continue;
    }

    if (isKeyword(token, dialect) && CLAUSE_BREAK_KEYWORDS.has(upper)) {
      flushLine();
      append(withKeywordCase(token.value, keywordCase));
      continue;
    }

    if (isKeyword(token, dialect)) {
      append(withKeywordCase(token.value, keywordCase));
      continue;
    }

    append(token.value);
  }

  flushLine();

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function needsSpace(currentLine: string, next: string): boolean {
  if (!currentLine) return false;
  const last = currentLine[currentLine.length - 1];
  if (last === "(" || next === ")" || next === "," || next === ";") return false;
  return true;
}

export function minifySql(sql: string, { dialect, keywordCase }: { dialect: SqlDialect; keywordCase: SqlKeywordCase }): string {
  const tokens = tokenizeSql(sql);
  let output = "";
  let forceNewlineBeforeNextToken = false;

  for (const token of tokens) {
    let value = token.value;

    if (isKeyword(token, dialect)) {
      value = withKeywordCase(token.value, keywordCase);
    }

    if (!output) {
      output = value;
      forceNewlineBeforeNextToken = isLineCommentToken(token);
      continue;
    }

    if (token.value === "," || token.value === ")" || token.value === ";") {
      output += `${forceNewlineBeforeNextToken ? "\n" : ""}${value}`;
      forceNewlineBeforeNextToken = token.value === ";";
      continue;
    }

    const prev = output[output.length - 1];
    if (prev === "(" || value === "(") {
      output += value;
      forceNewlineBeforeNextToken = false;
      continue;
    }

    output += `${forceNewlineBeforeNextToken ? "\n" : " "}${value}`;
    forceNewlineBeforeNextToken = isLineCommentToken(token);
  }

  return output.trim();
}
