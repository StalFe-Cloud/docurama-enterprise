import { db } from "@/lib/db";

async function main() {
  console.log("=== Testing Domain Auto-Join Logic ===");

  const stalfeTenant = await db.tenant.findFirst({ where: { slug: "stalfe" } });
  if (!stalfeTenant) throw new Error("Stalfe tenant not found");
  console.log("Found tenant:", stalfeTenant.name, `(${stalfeTenant.id})`);

  // Add or update singa.fr for testing
  let singa = await db.domain.findFirst({ where: { domain: "singa.fr" } });
  if (!singa) {
    singa = await db.domain.create({
      data: {
        tenantId: stalfeTenant.id,
        domain: "singa.fr",
        method: "TXT",
        status: "VERIFIED",
        token: "docu-verify-singa",
        purpose: "AUTO_JOIN",
        verifiedAt: new Date(),
      },
    });
    console.log("Created singa.fr domain mapped to StålFe!");
  } else {
    console.log("Found existing singa.fr domain:", singa.domain, singa.status, singa.purpose);
  }

  // Simulate auto-join lookup as done in check-domain route and signup route
  const testEmail = "charlotte.dupont@singa.fr";
  const domainPart = testEmail.split("@")[1].toLowerCase();

  const match = await db.domain.findFirst({
    where: {
      domain: domainPart,
      status: "VERIFIED",
      purpose: { in: ["AUTO_JOIN", "JOIN"] },
    },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true, planCode: true },
      },
    },
  });

  if (!match) {
    throw new Error("Failed to match corporate domain for " + testEmail);
  }

  console.log("SUCCESS! Matched domain:", match.domain);
  console.log("Target workspace to auto-enroll:", match.tenant.name);
  console.log("Plan code:", match.tenant.planCode);
  console.log("Auto-join status: VERIFIED & ACTIVE without billing!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
