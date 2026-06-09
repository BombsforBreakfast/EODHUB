import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([".git", ".next", "node_modules", ".vercel"]);
const allowedFiles = new Set([
  path.normalize("app/lib/storageImageUrl.ts"),
  path.normalize("scripts/check-supabase-image-transforms.mjs"),
  path.normalize("GAME_COST_GUARDRAILS.md"),
]);

const bannedPatterns = [
  {
    label: "Supabase render/image URL",
    pattern: /\/storage\/v1\/render\/image\//,
  },
  {
    label: "Supabase transform helper call",
    pattern: /\bsupabaseStorageImageUrl\s*\(/,
  },
  {
    label: "Supabase image transform env flag",
    pattern: /\bNEXT_PUBLIC_ENABLE_SUPABASE_IMAGE_TRANSFORMS\b/,
  },
];

const checkedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".md",
  ".sql",
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.relative(root, fullPath);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (!ignoredDirs.has(entry)) walk(fullPath, files);
      continue;
    }

    if (stats.isFile() && checkedExtensions.has(path.extname(entry))) {
      files.push(relPath);
    }
  }
  return files;
}

const findings = [];

for (const relPath of walk(root)) {
  const normalized = path.normalize(relPath);
  if (allowedFiles.has(normalized)) continue;

  const source = readFileSync(path.join(root, relPath), "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const { label, pattern } of bannedPatterns) {
      if (pattern.test(line)) {
        findings.push(`${relPath}:${index + 1} ${label}: ${line.trim()}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Supabase image transform guardrail failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Supabase image transform guardrail passed.");
