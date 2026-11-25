/**
 * Test harness for Document Intelligence (field detector & contract analyzer).
 * Run with: bun scripts/test-docintel.ts
 */

import { analyzeContract } from "../src/lib/docintel/contract-analyzer";
import { detectFields } from "../src/lib/docintel/field-detector";
import type { ExtractResult } from "../src/lib/docintel/types";

console.log("=== Testing Document Intelligence Pipeline ===");

// 1. Test Contract Analyzer with French NDA
const frenchNda = `
ACCORD DE CONFIDENTIALITÉ ET DE NON-DIVULGATION

ENTRE LES SOUSSIGNÉS :
La société VOIRIA SASU, immatriculée au RCS de Paris sous le numéro SIREN 131 914 012,
ci-après dénommée "La Société",

ET :
La société PARTENAIRE SARL,
ci-après dénommée "Le Bénéficiaire".

Article 1 - Objet
Le présent accord a pour objet de définir les conditions dans lesquelles les Parties s'engagent à protéger
le secret des affaires et les informations confidentielles échangées dans le cadre de leurs négociations.

Article 2 - Loi applicable et juridiction compétente
Le présent contrat est régi par le droit français. Tout litige relatif à sa validité ou son exécution sera
soumis à la compétence exclusive du Tribunal de commerce de Paris.

Article 3 - Durée et résiliation
Le présent accord prend effet à sa signature et reste en vigueur pendant une durée de deux ans, avec un
préavis de 30 jours pour toute notification de résiliation.

Fait à Paris, le 15 septembre 2026, en deux exemplaires originaux.

Pour la Société :                                  Pour le Partenaire :
Bon pour accord                                    Lu et approuvé
Signature :                                        Signature :
`;

const ndaAnalysis = analyzeContract(frenchNda, 1);
console.log("✓ French NDA Type:", ndaAnalysis.document_type);
console.log("✓ Locale:", ndaAnalysis.locale);
console.log("✓ Governing Law:", ndaAnalysis.key_commercial_terms.governing_law);
console.log("✓ Dispute Resolution:", ndaAnalysis.key_commercial_terms.dispute_resolution);
console.log("✓ Risk Badge:", ndaAnalysis.risk_badge);

if (ndaAnalysis.locale !== "fr") throw new Error("Expected French locale");
if (!ndaAnalysis.document_type.includes("confidentialité")) throw new Error("Expected NDA document type");

// 2. Test Contract Analyzer with Non-Compete Risk
const contractWithRisks = `
CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE

Article 12 - Clause de non-concurrence
Le Salarié s'engage, pendant une durée de 24 mois suivant la rupture de son contrat,
à ne pas exercer d'activité concurrente sur l'ensemble du territoire français.
Le présent contrat est soumis au droit français.

Article 15 - Données personnelles
Un transfert hors Union Européenne pourra être réalisé pour l'hébergement des données.
`;

const riskAnalysis = analyzeContract(contractWithRisks, 2);
console.log("✓ Risk Flags Count:", riskAnalysis.risk_flags.length);
console.log("✓ High Risks:", riskAnalysis.risk_flags.filter((f) => f.severity === "high").map((f) => f.title));
console.log("✓ Risk Badge:", riskAnalysis.risk_badge);

if (riskAnalysis.risk_badge !== "amber") throw new Error("Expected amber badge for non-compete without compensation");

// 3. Test Field Detector with synthetic geometry
const mockExtract: ExtractResult = {
  pageCount: 1,
  hasTextLayer: true,
  imageOnlyPages: [],
  text: frenchNda,
  pages: [
    {
      pageNumber: 1,
      width: 595.28,
      height: 841.89,
      hasText: true,
      charCount: frenchNda.length,
      text: frenchNda,
      items: [
        { text: "Fait à Paris, le 15 septembre 2026", x0: 50, y0: 680, x1: 250, y1: 694 },
        { text: "Bon pour accord", x0: 80, y0: 720, x1: 180, y1: 734 },
        { text: "Signature :", x0: 80, y0: 740, x1: 150, y1: 754 },
        { text: "Lu et approuvé", x0: 380, y0: 720, x1: 480, y1: 734 },
        { text: "Signature :", x0: 380, y0: 740, x1: 450, y1: 754 },
      ],
    },
  ],
};

async function testDetector() {
  const fields = await detectFields(mockExtract);
  console.log("✓ Detected Fields count:", fields.length);
  for (const f of fields) {
    console.log(`  - [${f.fieldType}] page ${f.pageNumber} at (${f.x}%, ${f.y}%), conf: ${f.confidence}, source: ${f.source}`);
  }
  const sigs = fields.filter((f) => f.fieldType === "signature");
  if (sigs.length < 2) throw new Error(`Expected at least 2 signatures, got ${sigs.length}`);
  console.log("\nAll Document Intelligence tests passed successfully!");
}

testDetector().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
