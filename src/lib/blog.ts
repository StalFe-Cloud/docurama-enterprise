import fs from "fs";
import path from "path";

/**
 * Blog engine (go-live cycle): content/blog/*.md with YAML-ish frontmatter.
 *
 *   ---
 *   title: "…"
 *   description: "…"
 *   date: 2026-09-19
 *   author: "Docurama Team"
 *   tags: [product, security]
 *   draft: false
 *   ---
 *
 * Posts are plain files — no CMS, no build step. Adding a post is a commit.
 */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  author: string;
  tags: string[];
  draft: boolean;
  content: string;
  readingMinutes: number;
}

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export function parsePost(slug: string, raw: string): BlogPost | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) {
      const value = kv[2].trim();
      // Quoted YAML scalar values must not render their quote delimiters.
      meta[kv[1].trim()] = value.startsWith('"') && value.endsWith('"')
        ? JSON.parse(value)
        : value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1).replace(/''/g, "'")
          : value;
    }
  }

  const tags = (meta.tags ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const content = match[2].trim();
  const words = content.split(/\s+/).length;

  return {
    slug,
    title: meta.title ?? slug,
    description: meta.description ?? "",
    date: meta.date ?? "1970-01-01",
    author: meta.author ?? "Docurama Team",
    tags,
    draft: meta.draft === "true",
    content,
    readingMinutes: Math.max(1, Math.round(words / 210)),
  };
}

/** All published posts, newest first. */
export function listBlogPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  const posts = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      try {
        return parsePost(f.replace(/\.md$/, ""), fs.readFileSync(path.join(BLOG_DIR, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((p): p is BlogPost => p !== null && !p.draft);
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

export function getBlogPost(slug: string): BlogPost | null {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  const file = path.join(BLOG_DIR, `${safe}.md`);
  if (!fs.existsSync(file)) return null;
  try {
    const post = parsePost(safe, fs.readFileSync(file, "utf8"));
    return post && !post.draft ? post : null;
  } catch {
    return null;
  }
}

/** All distinct tags with counts, most used first. */
export function blogTagCloud(): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of listBlogPosts()) {
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
