export * from "./types";
export * from "./accords-confidentialite";
export * from "./contrats-travail-et-services";
export * from "./contrats-commerciaux-et-societes";

import { ACCORD_CONFIDENTIALITE_UNILATERAL, ACCORD_CONFIDENTIALITE_RECIPROQUE } from "./accords-confidentialite";
import { CONTRAT_PRESTATION_SERVICES, CONTRAT_TRAVAIL_CDI, CONTRAT_TRAVAIL_CDD } from "./contrats-travail-et-services";
import { BAIL_COMMERCIAL, CONDITIONS_GENERALES_VENTE, PACTE_ASSOCIES } from "./contrats-commerciaux-et-societes";
import type { LegalTemplateDefinition } from "./types";

export const FRENCH_LEGAL_TEMPLATES: LegalTemplateDefinition[] = [
  ACCORD_CONFIDENTIALITE_UNILATERAL,
  ACCORD_CONFIDENTIALITE_RECIPROQUE,
  CONTRAT_PRESTATION_SERVICES,
  CONTRAT_TRAVAIL_CDI,
  CONTRAT_TRAVAIL_CDD,
  BAIL_COMMERCIAL,
  CONDITIONS_GENERALES_VENTE,
  PACTE_ASSOCIES,
];
