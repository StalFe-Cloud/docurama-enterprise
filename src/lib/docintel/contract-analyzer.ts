/**
 * Contract analyzer for document intelligence.
 *
 * Evaluates contracts under French statutory frameworks (Code civil, Code du travail,
 * Code de commerce, RGPD, eIDAS) and English commercial contract norms.
 * Extracts key commercial terms, classifies document typology, and detects risk flags.
 */

import type { ContractAnalysis, Locale, RiskFlag } from "./types";

/**
 * Detect language locale from contract vocabulary distribution.
 */
function detectLocale(text: string): Locale {
  const lower = text.toLowerCase();
  const frWords = [
    "contrat", "article", "société", "soussigné", "accord", "droit",
    "stipulations", "résiliation", "présent", "prestation", "responsabilité",
    "confidentialité", "salarié", "fait à", "loi",
  ];
  const enWords = [
    "agreement", "section", "company", "undersigned", "party", "parties",
    "shall", "termination", "services", "liability", "confidentiality",
    "employee", "governed", "warranties", "indemnification",
  ];

  let frScore = 0;
  for (const w of frWords) {
    const m = lower.match(new RegExp(`\\b${w}\\b`, "g"));
    if (m) frScore += m.length;
  }

  let enScore = 0;
  for (const w of enWords) {
    const m = lower.match(new RegExp(`\\b${w}\\b`, "g"));
    if (m) enScore += m.length;
  }

  if (frScore > 10 && enScore > 10 && Math.abs(frScore - enScore) / (frScore + enScore) < 0.3) {
    return "mixed";
  }
  return frScore >= enScore ? "fr" : "en";
}

/**
 * Classify document typology from textual markers.
 */
function detectDocumentType(text: string, locale: Locale): string {
  const lower = text.toLowerCase();

  if (locale === "fr" || locale === "mixed") {
    if (/confidentialit[eé]|secret\s+des\s+affaires|non-divulgation/i.test(lower)) {
      return "Accord de confidentialité (NDA)";
    }
    if (/contrat\s+de\s+travail|c\.d\.i|c\.d\.d|salari[eé]|convention\s+collective/i.test(lower)) {
      return "Contrat de travail (CDI / CDD)";
    }
    if (/prestation\s+de\s+services?|cahier\s+des\s+charges|prestataire/i.test(lower)) {
      return "Contrat de prestation de services";
    }
    if (/bail\s+(?:commercial|professionnel)|bailleur|preneur/i.test(lower)) {
      return "Bail commercial";
    }
    if (/conditions\s+g[eé]n[eé]rales\s+de\s+vente|c\.g\.v|cgv/i.test(lower)) {
      return "Conditions Générales de Vente (CGV)";
    }
    if (/pacte\s+d['’]actionnaires|pacte\s+d['’]associ[eé]s/i.test(lower)) {
      return "Pacte d'actionnaires";
    }
    if (/cession\s+de\s+droits?|propri[eé]t[eé]\s+intellectuelle/i.test(lower)) {
      return "Cession de droits de propriété intellectuelle";
    }
    return "Contrat commercial de droit français";
  }

  // English types
  if (/non-disclosure|confidentiality\s+agreement/i.test(lower)) {
    return "Non-Disclosure Agreement (NDA)";
  }
  if (/employment\s+agreement|employment\s+contract/i.test(lower)) {
    return "Employment Agreement";
  }
  if (/master\s+services\s+agreement|statement\s+of\s+work|msa/i.test(lower)) {
    return "Master Services Agreement (MSA)";
  }
  if (/lease\s+agreement|commercial\s+lease/i.test(lower)) {
    return "Commercial Lease";
  }
  if (/terms\s+and\s+conditions|terms\s+of\s+service/i.test(lower)) {
    return "Terms of Service";
  }

  return "Commercial Agreement";
}

/**
 * Extract key commercial terms using targeted regex patterns.
 */
function extractCommercialTerms(text: string, locale: Locale) {
  const lower = text.toLowerCase();

  // Governing law
  let governing_law = locale === "fr" ? "Droit français (Code civil)" : "Laws of England and Wales / Delaware";
  const govLawFr = text.match(/(?:soumis|r[eé]gi)\s+(?:au|par\s+le)\s+droit\s+([^,;\.\n]+)/i) ||
    text.match(/loi\s+applicable\s*:\s*([^,;\.\n]+)/i);
  if (govLawFr) {
    governing_law = govLawFr[1].trim();
  } else {
    const govLawEn = text.match(/governed\s+by\s+(?:the\s+)?laws\s+of\s+([^,;\.\n]+)/i);
    if (govLawEn) governing_law = govLawEn[1].trim();
  }

  // Termination notice
  let termination_notice = locale === "fr" ? "30 jours de préavis écrit" : "30 days prior written notice";
  const termFr = text.match(/pr[eé]avis\s+de\s*(\d+\s*(?:mois|jours|semaines))/i) ||
    text.match(/notification\s+(?:de\s+)?(\d+\s*(?:mois|jours|semaines))\s+(?:avant|pr[eé]alable)/i);
  if (termFr) {
    termination_notice = `${termFr[1].trim()} de préavis`;
  } else {
    const termEn = text.match(/(\d+\s*(?:days|months|weeks))\s*(?:prior\s*)?(?:written\s*)?notice/i);
    if (termEn) termination_notice = `${termEn[1].trim()} notice`;
  }

  // Payment terms
  let payment_terms = locale === "fr" ? "30 jours net (Art. L. 441-10 C. com.)" : "Net 30 days from invoice date";
  const payFr = text.match(/(\d+\s*jours(?:\s+fin\s+de\s+mois)?)/i) ||
    text.match(/d[eé]lai\s+de\s+paiement\s*(?:de)?\s*([^,;\.\n]+)/i);
  if (payFr && /jour|mois/i.test(payFr[1])) {
    payment_terms = payFr[1].trim();
  } else {
    const payEn = text.match(/net\s*(\d+)/i) || text.match(/within\s*(\d+\s*days)/i);
    if (payEn) payment_terms = payEn[0].trim();
  }

  // Dispute resolution
  let dispute_resolution = locale === "fr" ? "Tribunaux compétents du ressort de la Cour d'appel" : "Competent courts / Arbitration";
  const dispFr = text.match(/(tribunal\s+de\s+commerce\s+de\s+[^,;\.\n]+)/i) ||
    text.match(/(tribunaux\s+(?:de|du\s+ressort\s+de)\s+[^,;\.\n]+)/i) ||
    text.match(/(m[eé]diation\s+pr[eé]alable|arbitrage\s+[^,;\.\n]+)/i);
  if (dispFr) {
    dispute_resolution = dispFr[1].trim();
  } else {
    const dispEn = text.match(/exclusive\s+jurisdiction\s+of\s+the\s+courts\s+of\s+([^,;\.\n]+)/i);
    if (dispEn) dispute_resolution = dispEn[1].trim();
  }

  return {
    governing_law,
    termination_notice,
    payment_terms,
    dispute_resolution,
  };
}

/**
 * Audit contract text for compliance and commercial risk flags.
 */
function evaluateRiskFlags(text: string, locale: Locale): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const lower = text.toLowerCase();

  if (locale === "fr" || locale === "mixed") {
    // 1. Non-compete without financial compensation check
    if (/non-concurrence/i.test(lower)) {
      if (!/contrepartie\s+financi[eè]re|indemnit[eé]\s+(?:sp[eé]ciale|compensatrice)/i.test(lower)) {
        flags.push({
          category: "Droit social / Travail",
          severity: "high",
          title: "Clause de non-concurrence sans contrepartie financière",
          summary: "En droit français (Cass. Soc.), toute clause de non-concurrence dépourvue de contrepartie pécuniaire réelle est entachée de nullité d'ordre public.",
        });
      }
    }

    // 2. Penalty clause moderation
    if (/clause\s+p[eé]nale|indemnit[eé]\s+forfaitaire\s+de\s+r[eé]siliation/i.test(lower)) {
      flags.push({
        category: "Droit des obligations",
        severity: "medium",
        title: "Clause pénale conventionnelle",
        summary: "Conformément à l'article 1231-5 du Code civil, le juge dispose du pouvoir modérateur d'augmenter ou réduire une indemnité manifestement dérisoire ou excessive.",
      });
    }

    // 3. GDPR / RGPD processing and transfer
    if (/donn[eé]es\s+(?:personnelles|[aà]\s+caract[eè]re\s+personnel)/i.test(lower)) {
      if (/transfert\s+(?:hors\s+ue|hors\s+union\s+europ[eé]enne|international)/i.test(lower) && !/clauses\s+contractuelles\s+types|cct|dpa/i.test(lower)) {
        flags.push({
          category: "Conformité RGPD",
          severity: "high",
          title: "Transfert de données personnelles hors UE",
          summary: "Les transferts internationaux doivent être encadrés par des Clauses Contractuelles Types (CCT) de la Commission européenne ou une décision d'adéquation (Art. 44+ RGPD).",
        });
      } else {
        flags.push({
          category: "Conformité RGPD",
          severity: "low",
          title: "Stipulations relatives aux données personnelles",
          summary: "Traitement de données personnelles mentionné. Vérifier l'adjonction d'un DPA ou l'accord de sous-traitance conforme à l'article 28 du RGPD.",
        });
      }
    }

    // 4. Limitation of liability
    if (/limitation\s+de\s+responsabilit[eé]|plafond\s+de\s+responsabilit[eé]/i.test(lower)) {
      flags.push({
        category: "Responsabilité civile",
        severity: "low",
        title: "Plafond conventionnel de responsabilité",
        summary: "Stipulation licite sous réserve de l'article 1231-3 du Code civil (inapplicable en cas de dol ou de faute lourde, ou si elle vide l'obligation essentielle de sa substance - jurisprudence Chronopost).",
      });
    }
  } else {
    // English risk checks
    if (/non-compete|covenant\s+not\s+to\s+compete/i.test(lower)) {
      flags.push({
        category: "Employment & Restrictive Covenants",
        severity: "medium",
        title: "Restrictive covenant / Non-compete",
        summary: "Ensure geographical scope and duration are reasonably tailored to avoid invalidation under applicable competition law.",
      });
    }

    if (/limitation\s+of\s+liability/i.test(lower) && !/gross\s+negligence|willful\s+misconduct/i.test(lower)) {
      flags.push({
        category: "Commercial Liability",
        severity: "medium",
        title: "Broad limitation of liability without standard carve-outs",
        summary: "Liability cap does not explicitly carve out gross negligence, fraud, or willful misconduct.",
      });
    }
  }

  return flags;
}

/**
 * Analyze full contract text and return comprehensive audit report.
 */
export function analyzeContract(text: string, pageCount = 1): ContractAnalysis {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 50) {
    return {
      is_analyzed: false,
      locale: "fr",
      document_type: "Document non analysé",
      page_count: pageCount,
      word_count: 0,
      estimated_read_minutes: 0,
      overall_risk_assessment: "Texte insuffisant pour analyse automatique.",
      risk_badge: "blue",
      key_commercial_terms: {
        governing_law: "Non spécifié",
        termination_notice: "Non spécifié",
        payment_terms: "Non spécifié",
        dispute_resolution: "Non spécifié",
      },
      risk_flags: [],
    };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const estimatedReadMinutes = Math.max(1, Math.round(wordCount / 200));

  const locale = detectLocale(trimmed);
  const documentType = detectDocumentType(trimmed, locale);
  const keyTerms = extractCommercialTerms(trimmed, locale);
  const riskFlags = evaluateRiskFlags(trimmed, locale);

  const hasHighRisk = riskFlags.some((f) => f.severity === "high");
  const hasMediumRisk = riskFlags.some((f) => f.severity === "medium");

  let riskBadge: "amber" | "blue" | "emerald" = "emerald";
  let overallRiskAssessment = "";

  if (hasHighRisk) {
    riskBadge = "amber";
    overallRiskAssessment = locale === "fr"
      ? "Attention requise : Présence de clauses à haut risque juridique nécessitant révision par un conseil juridique."
      : "High vigilance required: Potential legal compliance risks detected.";
  } else if (hasMediumRisk) {
    riskBadge = "blue";
    overallRiskAssessment = locale === "fr"
      ? "Contrat standard présentant des points d'attention modérés à valider avant signature."
      : "Standard commercial agreement with moderate terms to review.";
  } else {
    riskBadge = "emerald";
    overallRiskAssessment = locale === "fr"
      ? "Contrat équilibré avec stipulations habituelles conformes aux standards du marché."
      : "Balanced agreement consistent with standard commercial practices.";
  }

  return {
    is_analyzed: true,
    locale,
    document_type: documentType,
    page_count: pageCount,
    word_count: wordCount,
    estimated_read_minutes: estimatedReadMinutes,
    overall_risk_assessment: overallRiskAssessment,
    risk_badge: riskBadge,
    key_commercial_terms: keyTerms,
    risk_flags: riskFlags,
  };
}
