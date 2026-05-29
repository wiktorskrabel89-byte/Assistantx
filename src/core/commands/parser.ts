import { getAssistantCommand, listAssistantCommands } from "./registry";
import type { AssistantCommandId, ParsedAssistantCommand } from "./types";

function normalizeInput(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function parseSlash(input: string): ParsedAssistantCommand | null {
  const normalized = normalizeInput(input);
  if (!normalized.startsWith("/")) return null;
  const match = normalized.match(/^\/([a-z]+)(?:\s+(.*))?$/i);
  if (!match) return null;
  const slashAliasMap: Record<string, AssistantCommandId> = {
    skill: "skills",
  };
  const id = (slashAliasMap[match[1].toLowerCase()] ?? match[1].toLowerCase()) as AssistantCommandId;
  const command = getAssistantCommand(id);
  if (!command) return null;
  return {
    id,
    slash: command.slash,
    argsText: (match[2] ?? "").trim(),
    matchedBy: "slash",
    rawInput: input,
  };
}

type AliasMatcher = {
  id: AssistantCommandId;
  test: (normalized: string) => string | null;
};

const ALIAS_MATCHERS: AliasMatcher[] = [
  {
    id: "skills",
    test: (input) => (/^(show|list|pokaż)?\s*(skills|capabilities|tools)$/i.test(input) ? "" : null),
  },
  {
    id: "today",
    test: (input) => (/^(plan|agenda|today|dzisiaj|plan dnia)$/i.test(input) ? "" : null),
  },
  {
    id: "screenshot",
    test: (input) => (/^(take|make|zrób|capture).*(screenshot|screen shot|zrzut)/i.test(input) ? "" : null),
  },
  {
    id: "sleep",
    test: (input) => (/^(sleep|hibernate|uśpij)/i.test(input) ? "" : null),
  },
  {
    id: "os",
    test: (input) => (/^(system status|status komputera|status systemu|hardware status|cpu status)$/i.test(input) ? "" : null),
  },
  {
    id: "google",
    test: (input) => {
      const match = input.match(/^(google|wyszukaj|search web|szukaj w google)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "gmail",
    test: (input) => {
      const match = input.match(/^(gmail|mail|email|poczta)\s+(.+)/i);
      return match?.[2]?.trim() ?? (/(^gmail$|^mail$|^email$|^poczta$)/i.test(input) ? "" : null);
    },
  },
  {
    id: "drive",
    test: (input) => {
      const match = input.match(/^(drive|dysk|google drive)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "calendar",
    test: (input) => {
      const match = input.match(/^(calendar|kalendarz|dodaj spotkanie|create event)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "draft",
    test: (input) => {
      const match = input.match(/^(draft|szkic|napisz mail)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "web",
    test: (input) => {
      const match = input.match(/^(web|website|page|strona)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "slack",
    test: (input) => {
      const match = input.match(/^(slack)\s+(.+)/i);
      return match?.[2]?.trim() ?? (input === "slack" ? "" : null);
    },
  },
  {
    id: "file",
    test: (input) => {
      const match = input.match(/^(file|read file|plik)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "search",
    test: (input) => {
      const match = input.match(/^(search|find|szukaj)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "repo",
    test: (input) => {
      const match = input.match(/^(repo|repository)\s*(.*)$/i);
      return match ? match[2].trim() : null;
    },
  },
  {
    id: "index",
    test: (input) => {
      const match = input.match(/^(index|indeksuj|scan repo)\s*(.*)$/i);
      return match ? match[2].trim() : null;
    },
  },
  {
    id: "ignore",
    test: (input) => {
      const match = input.match(/^(ignore|pomijaj)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "db",
    test: (input) => {
      const match = input.match(/^(db|database|postgres|sql)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "game",
    test: (input) => {
      const match = input.match(/^(game|uruchom|odpal|graj)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
  {
    id: "open",
    test: (input) => {
      const match = input.match(/^(open|launch|otwórz|włącz)\s+(.+)/i);
      return match?.[2]?.trim() ?? null;
    },
  },
];

function parseAlias(input: string): ParsedAssistantCommand | null {
  const normalized = normalizeInput(input);
  if (!normalized || normalized.startsWith("/")) return null;

  for (const matcher of ALIAS_MATCHERS) {
    const argsText = matcher.test(normalized);
    if (argsText === null) continue;
    const command = getAssistantCommand(matcher.id);
    if (!command) continue;
    return {
      id: matcher.id,
      slash: command.slash,
      argsText,
      matchedBy: "alias",
      rawInput: input,
    };
  }

  return null;
}

export function parseAssistantCommand(input: string): ParsedAssistantCommand | null {
  return parseSlash(input) ?? parseAlias(input);
}

export function shouldShowSlashSuggestions(input: string) {
  return normalizeInput(input).startsWith("/");
}

export function buildSlashSuggestionQuery(input: string) {
  const normalized = normalizeInput(input);
  if (!normalized.startsWith("/")) return "";
  return normalized.slice(1).toLowerCase();
}

export function filterAssistantCommandsForQuery(input: string) {
  const query = buildSlashSuggestionQuery(input);
  return listAssistantCommands().filter((command) => (
    !query
      || command.id.includes(query)
      || command.title.toLowerCase().includes(query)
      || command.aliases.some((alias) => alias.toLowerCase().includes(query))
  ));
}
