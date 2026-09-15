/** Analyze the hero animation recording with the VLM via video_url + base64. */
import ZAI from "z-ai-web-dev-sdk";
import { readFileSync } from "node:fs";

async function main() {
  const zai = await ZAI.create();
  const b64 = readFileSync("download/hero-qa/hero-loop.mp4").toString("base64");
  // The SDK's CreateChatCompletionVisionBody type models neither video_url
  // content parts nor the `thinking` switch, though the endpoint accepts both.
  // Cast at the call boundary rather than reshaping a request that works.
  const visionBody = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `This is a screen recording of a marketing hero product-demo animation for an eSignature SaaS (Notion-homepage style). Watch the full loop and evaluate:
1) Describe the sequence of events you observe (cursor movements, clicks, typing, modal, signature drawing, stamps, drawer).
2) Does the cursor movement look natural and human-like (acceleration, easing, not linear/robotic)?
3) Does the signature drawing look like a real pen stroke?
4) Any visual glitches, flashing elements, misalignments, or animation bugs?
5) Does the loop restart cleanly?
6) Overall: does this feel like a premium, realistic product movie? Grade A-F.`,
          },
          { type: "video_url", video_url: { url: `data:video/mp4;base64,${b64}` } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  };
  const response = await zai.chat.completions.createVision(
    visionBody as unknown as Parameters<typeof zai.chat.completions.createVision>[0],
  );
  console.log(response.choices[0]?.message?.content ?? "NO CONTENT");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
