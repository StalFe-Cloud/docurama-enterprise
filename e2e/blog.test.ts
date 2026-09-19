import { expect, test } from "bun:test";
import { getBlogPost, listBlogPosts, parsePost } from "../src/lib/blog";

test("frontmatter quotes are parsed before blog headings and authors are rendered", () => {
  const post = getBlogPost("docurama-is-live");
  expect(post?.title).toBe("Docurama is live: sign documents, prove everything");
  expect(post?.author).toBe("Docurama Team");
  expect(listBlogPosts().some((p) => p.slug === post?.slug)).toBe(true);
});

test.each(["\n", "\r\n"])("frontmatter metadata and draft state survive line ending %j", (lineEnding) => {
  const content = ["First paragraph.", "", "Second paragraph."].join(lineEnding);
  const raw = [
    "---",
    'title: "Quoted title"',
    "description: 'A team''s signing workflow'",
    "draft: true",
    "date: 2026-09-19",
    'author: "Example Team"',
    "tags: [product, security]",
    "---",
    content,
    "",
  ].join(lineEnding);

  expect(parsePost("line-ending-fixture", raw)).toEqual({
    slug: "line-ending-fixture",
    title: "Quoted title",
    description: "A team's signing workflow",
    date: "2026-09-19",
    author: "Example Team",
    tags: ["product", "security"],
    draft: true,
    content,
    readingMinutes: 1,
  });
});
