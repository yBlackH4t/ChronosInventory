import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const argMap = parseArgs(process.argv.slice(2));
const changelogPath = path.resolve(argMap.changelog ?? path.join(repoRoot, "CHANGELOG.md"));
const outputPath = path.resolve(argMap.output ?? path.join(repoRoot, "frontend", "src", "lib", "changelog.ts"));
const maxHighlights = Number(argMap.maxHighlights ?? 12);

if (!Number.isFinite(maxHighlights) || maxHighlights < 1) {
  fail("Parametro --maxHighlights invalido. Use um inteiro >= 1.");
}

if (!fs.existsSync(changelogPath)) {
  fail(`CHANGELOG nao encontrado: ${changelogPath}`);
}

const changelogText = fs.readFileSync(changelogPath, "utf8");
const entries = parseChangelog(changelogText).map((entry) => ({
  version: normalizeVersion(entry.version),
  date: entry.date,
  title: deriveTitle(entry),
  highlights: buildHighlights(entry, maxHighlights),
}));

const output = buildTsOutput(entries);
fs.writeFileSync(outputPath, output, "utf8");
console.log(`changelog.ts atualizado com ${entries.length} versao(oes): ${outputPath}`);

function parseArgs(argv) {
  const map = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    map[key] = value;
  }
  return map;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "");
}

function parseChangelog(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const entries = [];
  let current = null;
  let currentSection = "other";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = rawLine.match(/^##\s+\[([^\]]+)\](?:\s*-\s*([0-9]{4}-[0-9]{2}-[0-9]{2}))?/i);
    if (heading) {
      pushCurrent(entries, current);
      const version = normalizeVersion(heading[1]);
      if (!version || version.toLowerCase() === "unreleased") {
        current = null;
        currentSection = "other";
        continue;
      }
      current = {
        version,
        date: heading[2] || "",
        sections: {
          added: [],
          changed: [],
          fixed: [],
          other: [],
        },
      };
      currentSection = "other";
      continue;
    }

    if (!current) continue;

    const subheading = line.match(/^###\s+(.+)$/);
    if (subheading) {
      currentSection = normalizeSection(subheading[1]);
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      const text = cleanMarkdownInline(bullet[1]);
      if (!text || /^todo$/i.test(text)) continue;
      current.sections[currentSection].push(text);
    }
  }

  pushCurrent(entries, current);
  return entries;
}

function pushCurrent(list, entry) {
  if (!entry) return;
  list.push(entry);
}

function normalizeSection(name) {
  const key = String(name || "").trim().toLowerCase();
  if (key === "added") return "added";
  if (key === "changed") return "changed";
  if (key === "fixed") return "fixed";
  return "other";
}

function cleanMarkdownInline(input) {
  return String(input || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

function deriveTitle(entry) {
  const added = entry.sections.added.length;
  const changed = entry.sections.changed.length;
  const fixed = entry.sections.fixed.length;

  if (added > 0 && fixed > 0) return "Melhorias e correcoes";
  if (added > 0 && changed > 0) return "Novidades e ajustes";
  if (added > 0) return "Novas funcionalidades";
  if (fixed > 0) return "Correcao e estabilidade";
  if (changed > 0) return "Ajustes operacionais";
  return "Atualizacao de versao";
}

function buildHighlights(entry, limit) {
  const result = [];
  const orderedSections = [
    { key: "added", label: "Novo" },
    { key: "changed", label: "Mudanca" },
    { key: "fixed", label: "Correcao" },
    { key: "other", label: "Nota" },
  ];

  for (const section of orderedSections) {
    for (const item of entry.sections[section.key]) {
      if (result.length >= limit) break;
      result.push(`${section.label}: ${item}`);
    }
    if (result.length >= limit) break;
  }

  if (result.length === 0) {
    result.push("Sem notas detalhadas para esta versao.");
  }
  return result;
}

function buildTsOutput(entries) {
  const serialized = JSON.stringify(entries, null, 2);
  return `/* Arquivo gerado automaticamente por frontend/scripts/sync_changelog.mjs */\n` +
    `/* Nao edite manualmente: atualize CHANGELOG.md e rode npm run changelog:sync */\n\n` +
    `export type ReleaseEntry = {\n` +
    `  version: string;\n` +
    `  date: string;\n` +
    `  title: string;\n` +
    `  highlights: string[];\n` +
    `};\n\n` +
    `export const RELEASE_ENTRIES: ReleaseEntry[] = ${serialized};\n\n` +
    `export function normalizeVersion(version: string): string {\n` +
    `  return (version || "").trim().replace(/^v/i, "");\n` +
    `}\n\n` +
    `export function getReleaseEntry(version: string): ReleaseEntry | undefined {\n` +
    `  const normalized = normalizeVersion(version);\n` +
    `  return RELEASE_ENTRIES.find((entry) => normalizeVersion(entry.version) === normalized);\n` +
    `}\n\n` +
    `export function getLatestReleaseEntry(): ReleaseEntry | undefined {\n` +
    `  return RELEASE_ENTRIES[0];\n` +
    `}\n`;
}
