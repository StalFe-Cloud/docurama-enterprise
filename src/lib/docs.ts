import fs from "fs";
import path from "path";

export interface DocMetadata {
  title: string;
  description: string;
  group: string;
  order: number;
  tags: string[];
  slug: string;
}

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

export interface DocArticle {
  meta: DocMetadata;
  content: string;
  toc: TocItem[];
}

export interface NavGroup {
  name: string;
  items: {
    title: string;
    slug: string;
    description: string;
  }[];
}

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

/**
 * Parse simple YAML frontmatter from markdown file.
 */
function parseFrontmatter(raw: string): { meta: Partial<DocMetadata>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, content: raw };
  }

  const yaml = match[1];
  const content = match[2];
  const meta: Record<string, any> = {};

  for (const line of yaml.split("\n")) {
    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) {
      const key = kv[1].trim();
      let val: any = kv[2].trim();
      if (val.startsWith("[") && val.endsWith("]")) {
        val = val.slice(1, -1).split(",").map((s: string) => s.trim());
      } else if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      } else if (!isNaN(Number(val))) {
        val = Number(val);
      }
      meta[key] = val;
    }
  }

  return { meta, content };
}

/**
 * Extract H2 and H3 headings for the Table of Contents.
 */
export function extractToc(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const title = h2[1].replace(/[`*_]/g, "").trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      headings.push({ id, title, level: 2 });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const title = h3[1].replace(/[`*_]/g, "").trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      headings.push({ id, title, level: 3 });
    }
  }

  return headings;
}

/**
 * Recursively find all markdown files in content/docs.
 */
function walkDocs(dir: string, base = ""): { fullPath: string; relSlug: string }[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results: { fullPath: string; relSlug: string }[] = [];

  for (const entry of entries) {
    const rel = path.join(base, entry.name);
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(walkDocs(full, rel));
    } else if (entry.name.endsWith(".md")) {
      const slug = rel.replace(/\.md$/, "").replace(/\\/g, "/");
      results.push({ fullPath: full, relSlug: slug === "index" ? "" : slug });
    }
  }

  return results;
}

/**
 * Get full article by slug string array.
 */
export function getDocArticle(slugParts: string[] = []): DocArticle | null {
  const slug = slugParts.join("/");
  const targetRel = slug === "" ? "index.md" : `${slug}.md`;
  const targetPath = path.join(DOCS_DIR, targetRel);

  // Fallback to index.md in directory if directory requested
  let resolvedPath = targetPath;
  if (!fs.existsSync(resolvedPath)) {
    const dirIndexPath = path.join(DOCS_DIR, slug, "index.md");
    if (fs.existsSync(dirIndexPath)) {
      resolvedPath = dirIndexPath;
    } else {
      return null;
    }
  }

  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const { meta, content } = parseFrontmatter(raw);
  const toc = extractToc(content);

  const fallbackTitle = slugParts.length > 0 ? slugParts[slugParts.length - 1].replace(/-/g, " ") : "Documentation";
  const docMeta: DocMetadata = {
    title: meta.title || fallbackTitle,
    description: meta.description || "",
    group: meta.group || (slugParts.length > 1 ? slugParts[0].replace(/-/g, " ") : "Overview"),
    order: meta.order ?? 99,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    slug,
  };

  return {
    meta: docMeta,
    content,
    toc,
  };
}

/**
 * Build navigation tree grouped by sections.
 */
export function getDocsNav(): NavGroup[] {
  const all = walkDocs(DOCS_DIR);
  const items: DocMetadata[] = [];

  for (const file of all) {
    const raw = fs.readFileSync(file.fullPath, "utf-8");
    const { meta } = parseFrontmatter(raw);
    items.push({
      title: meta.title || file.relSlug || "Introduction",
      description: meta.description || "",
      group: meta.group || (file.relSlug.includes("/") ? file.relSlug.split("/")[0] : "Getting Started"),
      order: meta.order ?? 99,
      tags: meta.tags || [],
      slug: file.relSlug,
    });
  }

  items.sort((a, b) => a.order - b.order);

  const groupsMap = new Map<string, { title: string; slug: string; description: string }[]>();

  for (const item of items) {
    const grp = item.group;
    if (!groupsMap.has(grp)) {
      groupsMap.set(grp, []);
    }
    groupsMap.get(grp)!.push({
      title: item.title,
      slug: item.slug,
      description: item.description,
    });
  }

  const groups: NavGroup[] = [];
  for (const [name, gItems] of groupsMap.entries()) {
    groups.push({ name, items: gItems });
  }

  return groups;
}

/**
 * Generate llms.txt content for AI agents.
 */
export function generateLlmsTxt(): string {
  const all = walkDocs(DOCS_DIR);
  let out = `# Docurama Documentation Corpus (llms.txt)\n\n`;
  out += `Docurama SAS is an electronic signature platform hosted in Paris, France.\n`;
  out += `This document provides the full documentation context for autonomous agents.\n\n---\n\n`;

  for (const file of all) {
    const raw = fs.readFileSync(file.fullPath, "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    out += `## Document: ${meta.title || file.relSlug}\n`;
    out += `Path: /docs/${file.relSlug}\n`;
    if (meta.description) out += `Description: ${meta.description}\n`;
    out += `\n${content}\n\n---\n\n`;
  }

  return out;
}
