import type { LegalTemplateDefinition } from "./types";

export const CONTRAT_PRESTATION_SERVICES: LegalTemplateDefinition = {
  libraryKey: "fr-services-agreement",
  name: "Contrat de prestation de services intellectuels",
  description: "Contrat cadre de prestation informatique, conseil et services intellectuels avec clauses de livrables, SLA, propriété intellectuelle et conformité RGPD.",
  category: "Services & Commercial",
  folder: "Accords & Contrats",
  pages: 4,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Conforme aux articles 1101 s. C. civ., L. 441-10 C. com. (délais de paiement), et L. 111-1 s. CPI (Propriété intellectuelle).",
  fields: [
    { name: "signature_client", fieldType: "signature", pageNumber: 4, required: true, label: "Signature du Client" },
    { name: "date_client", fieldType: "date", pageNumber: 4, required: true, label: "Date signature client" },
    { name: "signature_prestataire", fieldType: "signature", pageNumber: 4, required: true, label: "Signature du Prestataire" },
    { name: "date_prestataire", fieldType: "date", pageNumber: 4, required: true, label: "Date signature prestataire" },
  ],
  bodyMarkdown: `# CONTRAT DE PRESTATION DE SERVICES INTELLECTUELS

**ENTRE LES SOUSSIGNÉS :**

**Le Client :**
[Dénomination sociale], société [forme juridique] au capital de [capital] €, immatriculée au RCS de [ville] sous le numéro [numéro RCS], ayant son siège social à [adresse], représentée par [Nom et Prénom], en qualité de [titre],

*Ci-après le « Client »,*

**ET :**

**Le Prestataire :**
[Dénomination sociale], société [forme juridique] au capital de [capital] €, immatriculée au RCS de [ville] sous le numéro [numéro RCS], ayant son siège social à [adresse], représentée par [Nom et Prénom], en qualité de [titre],

*Ci-après le « Prestataire »,*

---

### ARTICLE 1 – OBJET DU CONTRAT ET DOCUMENTS CONTRACTUELS

Le présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire s'engage à exécuter au bénéfice du Client les prestations d'ingénierie, de conseil et d'assistance technique décrites dans les Ordres de Mission ou le Cahier des Charges annexé.
Le Prestataire est tenu à une obligation de moyens renforcée, apportant tout le soin d'un professionnel diligent et expérimenté dans son domaine de compétence.

---

### ARTICLE 2 – DURÉE, COMMANDES ET MODALITÉS D'EXÉCUTION

Le contrat est conclu pour une durée initiale d'une (1) année à compter de sa signature, renouvelable par tacite reconduction par périodes successives d'un (1) an, sauf dénonciation par l'une des Parties notifiée par lettre recommandée avec accusé de réception avec un préavis écrit de deux (2) mois.
Chaque mission fera l'objet d'un Ordre de Mission signé détaillant le périmètre, le calendrier d'exécution, les jalons de validation et les critères d'acceptation des livrables.

---

### ARTICLE 3 – CONDITIONS FINANCIÈRES ET RÈGLEMENTS

En contrepartie des prestations réalisées, le Client versera au Prestataire les honoraires fixés selon le barème convenu (au forfait ou en régie journalière).
Les factures sont émises mensuellement à terme échu.
Conformément à l'article L. 441-10 du Code de commerce, le délai de paiement des factures est fixé à trente (30) jours fin de mois à compter de la date d'émission de la facture. Tout retard de paiement donnera lieu de plein droit et sans mise en demeure préalable à des pénalités au taux de refinancement de la BCE majoré de 10 points de pourcentage, ainsi qu'à une indemnité forfaitaire pour frais de recouvrement de 40 euros.

---

### ARTICLE 4 – PROPRIÉTÉ INTELLECTUELLE

Conformément à l'article L. 111-1 du Code de la propriété intellectuelle, le Prestataire reste seul titulaire des droits moraux et patrimoniaux sur ses méthodologies, outils préexistants, progiciels et savoir-faire développés antérieurement ou indépendamment du présent contrat.
Sous réserve du paiement intégral des factures correspondantes, le Prestataire cède au Client, à titre exclusif pour le monde entier et pour toute la durée légale de protection des droits d'auteur, les droits de reproduction, de représentation, d'adaptation et d'exploitation sur les livrables spécifiquement développés pour le Client dans le cadre du contrat.

---

### ARTICLE 5 – PROTECTION DES DONNÉES PERSONNELLES (RGPD)

Dans le cadre de l'exécution des prestations, le Prestataire peut être amené à traiter des données à caractère personnel pour le compte du Client. Les Parties s'engagent à respecter l'ensemble des obligations découlant du Règlement (UE) 2016/679 (RGPD). Les stipulations détaillées de sous-traitance au sens de l'article 28 du RGPD sont formalisées dans l'Annexe DPA (« Data Processing Agreement ») jointe aux présentes.

---

### ARTICLE 6 – RESPONSABILITÉ ET LIMITATION

Chaque Partie assume la responsabilité des dommages directs et prévisibles résultant d'un manquement prouvé à ses obligations contractuelles. En application de l'article 1231-3 du Code civil, et sauf faute lourde ou dol, le montant total des indemnités dues par le Prestataire au titre du présent contrat est expressément plafonné au montant hors taxes perçu par le Prestataire au cours des douze (12) derniers mois précédant le fait générateur.

---

### ARTICLE 7 – LOI APPLICABLE ET ATTRIBUTION DE JURIDICTION

Le présent contrat est soumis exclusivement au droit français. Tout litige relatif à sa validité, son interprétation ou son exécution sera soumis, à défaut d'accord amiable intervenu dans les trente (30) jours de sa survenance, à la compétence exclusive du **Tribunal de commerce de Paris**.
`,
};

export const CONTRAT_TRAVAIL_CDI: LegalTemplateDefinition = {
  libraryKey: "fr-employment-cdi",
  name: "Contrat de travail à durée indéterminée (CDI)",
  description: "Contrat de travail CDI cadre conforme au Code du travail français (L. 1221-1 s.), convention collective Syntec ou nationale, période d'essai et clause de propriété intellectuelle.",
  category: "Ressources Humaines & Travail",
  folder: "Accords & Contrats",
  pages: 4,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Conforme aux articles L. 1221-1 s., L. 1221-19 s. et L. 1231-1 s. du Code du travail, et L. 611-7 du Code de la propriété intellectuelle.",
  fields: [
    { name: "signature_employeur", fieldType: "signature", pageNumber: 4, required: true, label: "Signature de l'Employeur" },
    { name: "date_employeur", fieldType: "date", pageNumber: 4, required: true, label: "Date signature employeur" },
    { name: "signature_salarie", fieldType: "signature", pageNumber: 4, required: true, label: "Signature du Salarié" },
    { name: "date_salarie", fieldType: "date", pageNumber: 4, required: true, label: "Date signature salarié" },
  ],
  bodyMarkdown: `# CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE (CDI)

**ENTRE LES SOUSSIGNÉS :**

**La Société :**
[Dénomination sociale de l'entreprise], société [forme juridique] au capital de [capital] €, immatriculée au RCS de [ville] sous le numéro [numéro], code NAF/APE [code], dont le siège social est situé [adresse], cotisant auprès de l'URSSAF de [organisme], représentée par [Nom et Prénom], agissant en qualité de [fonction],

*D'une part, ci-après dénommée l'« Employeur » ou la « Société »,*

**ET :**

**Le Salarié :**
Madame / Monsieur [Nom et Prénom], né(e) le [date de naissance] à [lieu de naissance], de nationalité [nationalité], demeurant à [adresse], immatriculé(e) à la Sécurité Sociale sous le numéro [numéro NIR],

*D'autre part, ci-après dénommé(e) le « Salarié »,*

---

### ARTICLE 1 – ENGAGEMENT ET FONCTIONS

La Société engage le Salarié sous contrat de travail à durée indéterminée à compter du [date d'embauche], sous réserve des résultats de la visite médicale d'information et de prévention.
Le Salarié est engagé en qualité de [Intitulé du poste], statut Cadre, coefficient [coefficient], position [position] de la Convention Collective Nationale applicable : [Intitulé de la CCN, ex: Syntec - Bureaux d'études techniques].

---

### ARTICLE 2 – PÉRIODE D'ESSAI

Conformément à l'article L. 1221-19 du Code du travail et aux dispositions de la convention collective applicable, le présent contrat est conclu sous réserve d'une période d'essai de quatre (4) mois effectifs.
Cette période d'essai pourra être renouvelée une fois pour une durée maximale de quatre (4) mois supplémentaires, sous réserve d'un accord exprès et écrit des deux parties avant le terme de la période initiale.
Durant cette période d'essai et son éventuel renouvellement, chaque partie pourra mettre fin au contrat sous réserve du respect du délai de prévenance légal prévu aux articles L. 1221-25 et L. 1221-26 du Code du travail.

---

### ARTICLE 3 – LIEU DE TRAVAIL ET TÉLÉTRAVAIL

Le Salarié exercera ses fonctions dans les locaux de la Société situés à [adresse du siège ou établissement]. Le Salarié pourra être amené à effectuer des déplacements professionnels occasionnels nécessités par ses missions.
Le Salarié bénéficie du dispositif de télétravail mis en place au sein de l'entreprise conformément à la charte interne ou à l'accord d'entreprise en vigueur.

---

### ARTICLE 4 – DURÉE DU TRAVAIL ET RÉMUNÉRATION

La durée du travail du Salarié est fixée sous la forme d'un forfait annuel en jours de deux cent dix-huit (218) jours par an (journée de solidarité incluse), conformément à l'accord collectif en vigueur et à l'article L. 3121-58 du Code du travail.
En contrepartie, le Salarié percevra une rémunération brute annuelle forfaitaire de [montant] euros, versée en douze mensualités égales de [montant mensuel] euros bruts.

---

### ARTICLE 5 – LOYAUTÉ, CONFIDENTIALITÉ ET SECRETS PROFESSIONNELS

Pendant toute la durée de son contrat, le Salarié est tenu à une obligation stricte de loyauté et de fidélité envers la Société. Il s'interdit d'exercer, directement ou indirectement, toute autre activité professionnelle concurrente ou susceptible de nuire aux intérêts de la Société.
Le Salarié s'engage à la confidentialité absolue concernant l'ensemble des projets, logiciels, codes sources, méthodes et informations sensibles dont il aura connaissance dans l'exercice de ses fonctions.

---

### ARTICLE 6 – INVENTIONS DE SALARIÉS ET LOGICIELS

En application des articles L. 611-7 et L. 113-9 du Code de la propriété intellectuelle, les inventions, logiciels et documentations créés par le Salarié dans l'exercice de ses fonctions ou dans le domaine des activités de l'entreprise appartiennent de plein droit à la Société.

---

### ARTICLE 7 – CLAUSE DE NON-CONCURRENCE AVEC CONTREPARTIE FINANCIÈRE

Compte tenu de la nature des fonctions exercées et des connaissances hautement stratégiques acquises, le Salarié s'interdit, en cas de rupture du présent contrat pour quelque cause que ce soit, d'entrer au service d'une entreprise concurrente ou de créer une activité concurrente sur le territoire métropolitain français pendant une durée de douze (12) mois à compter de son départ effectif.
En contrepartie de cette obligation de non-concurrence, la Société versera au Salarié, pendant toute la durée d'application de l'interdiction, une indemnité pécuniaire mensuelle spéciale égale à 33 % de sa moyenne mensuelle de rémunération brute des douze derniers mois précédant la rupture.
La Société se réserve expressément la faculté de renoncer unilatéralement à cette clause de non-concurrence par lettre recommandée avec avis de réception notifiée dans les quinze (15) jours suivant la notification de la rupture du contrat.

---

### ARTICLE 8 – DROIT APPLICABLE ET JURIDICTION

Le présent contrat est régi par le Code du travail français et les conventions collectives applicables. Tout litige relatif à sa validité, son exécution ou sa résiliation relève de la compétence exclusive du **Conseil de Prud'hommes** territorialement compétent.
`,
};

export const CONTRAT_TRAVAIL_CDD: LegalTemplateDefinition = {
  libraryKey: "fr-employment-cdd",
  name: "Contrat de travail à durée déterminée (CDD)",
  description: "Contrat à durée déterminée pour surcroît temporaire d'activité ou remplacement, conforme aux articles L. 1242-1 et suivants du Code du travail.",
  category: "Ressources Humaines & Travail",
  folder: "Accords & Contrats",
  pages: 3,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Conforme aux articles L. 1242-1 s. et L. 1243-1 s. du Code du travail.",
  fields: [
    { name: "signature_employeur", fieldType: "signature", pageNumber: 3, required: true, label: "Signature de l'Employeur" },
    { name: "date_employeur", fieldType: "date", pageNumber: 3, required: true, label: "Date signature employeur" },
    { name: "signature_salarie", fieldType: "signature", pageNumber: 3, required: true, label: "Signature du Salarié" },
    { name: "date_salarie", fieldType: "date", pageNumber: 3, required: true, label: "Date signature salarié" },
  ],
  bodyMarkdown: `# CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE (CDD)

**ENTRE LES SOUSSIGNÉS :**

**L'Employeur :** [Dénomination sociale], société [forme] au capital de [capital] €, RCS [ville] n° [numéro], siège social [adresse], représentée par [Nom], en qualité de [fonction],

**ET :**

**Le Salarié :** Madame / Monsieur [Nom et Prénom], né(e) le [date] à [lieu], de nationalité [nationalité], demeurant [adresse], n° Sécurité Sociale [NIR],

---

### ARTICLE 1 – MOTIF DU RECOURS AU CONTRAT À DURÉE DÉTERMINÉE

Conformément aux dispositions de l'article L. 1242-2 du Code du travail, le présent contrat est conclu en raison du motif impérieux suivant :
**Accroissement temporaire d'activité**, caractérisé par [décrire précisément la surcharge ponctuelle, le projet exceptionnel ou le pic de production nécessitant ce renfort].
Le présent contrat ne peut avoir pour objet ni pour effet de pourvoir durablement un emploi lié à l'activité normale et permanente de l'entreprise.

---

### ARTICLE 2 – DURÉE DU CONTRAT ET TERME

Le présent contrat est conclu pour une durée déterminée à terme précis. Il prend effet le [date de début] à [heure] et se terminera de plein droit sans formalité le [date de fin] au soir.
La durée totale du contrat est de [nombre de mois ou semaines]. Il pourra faire l'objet de deux renouvellements dans les limites posées par l'article L. 1242-8-1 du Code du travail.

---

### ARTICLE 3 – PÉRIODE D'ESSAI

Conformément à l'article L. 1242-10 du Code du travail, une période d'essai de [durée calculée selon la durée du contrat : 1 jour par semaine dans la limite de 2 semaines ou 1 mois] est prévue.

---

### ARTICLE 4 – FONCTIONS ET RÉMUNÉRATION

Le Salarié est affecté au poste de [intitulé du poste], classification [niveau/échelon], moyennant un salaire mensuel brut de [montant] € pour un horaire hebdomadaire de 35 heures.
Au terme du contrat, le Salarié percevra l'indemnité de fin de contrat (prime de précarité) égale à 10 % de la rémunération brute totale versée, sous réserve des exclusions légales prévues par l'article L. 1243-10 du Code du travail, ainsi que l'indemnité compensatrice de congés payés.

---

### ARTICLE 5 – LOI APPLICABLE

Le contrat est soumis au Code du travail français et relève de la compétence exclusive du Conseil de Prud'hommes du ressort du siège social.
`,
};
