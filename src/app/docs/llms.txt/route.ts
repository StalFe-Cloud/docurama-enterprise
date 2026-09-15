import { generateLlmsTxt } from "@/lib/docs";

export const dynamic = "force-dynamic";

export async function GET() {
  const content = generateLlmsTxt();
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
