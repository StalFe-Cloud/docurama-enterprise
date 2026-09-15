import type { LegalTemplateDefinition } from "./types";

export const ACCORD_CONFIDENTIALITE_UNILATERAL: LegalTemplateDefinition = {
  libraryKey: "fr-nda-unilateral",
  name: "Accord de confidentialité unilatéral (NDA)",
  description: "Modèle de protection du secret des affaires conforme aux articles L. 151-1 et suivants du Code de commerce et à l'article 1104 du Code civil.",
  category: "Propriété Intellectuelle & Secrets",
  folder: "Accords & Contrats",
  pages: 3,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Conforme aux articles L. 151-1 s. C. com. (Secret des affaires) et articles 1104, 1112 et 1231-1 du Code civil.",
  fields: [
    { name: "signature_emetteur", fieldType: "signature", pageNumber: 3, required: true, label: "Signature Partie Émettrice" },
    { name: "date_signature_emetteur", fieldType: "date", pageNumber: 3, required: true, label: "Date de signature" },
    { name: "signature_beneficiaire", fieldType: "signature", pageNumber: 3, required: true, label: "Signature Bénéficiaire" },
    { name: "date_signature_beneficiaire", fieldType: "date", pageNumber: 3, required: true, label: "Date de signature" },
  ],
  bodyMarkdown: `# ACCORD DE CONFIDENTIALITÉ UNILATÉRAL

**ENTRE LES SOUSSIGNÉS :**

**1. La Société Émettrice :**
[Dénomination sociale], société [forme juridique] au capital de [capital] euros, immatriculée au RCS de [ville] sous le numéro [numéro RCS], dont le siège social est situé [adresse], représentée par [Nom et Prénom], en sa qualité de [qualité/titre], dûment habilité(e) aux fins des présentes,

*Ci-après dénommée la « Partie Émettrice »,*

**ET :**

**2. Le Bénéficiaire :**
[Dénomination sociale ou Nom Prénom], société [forme juridique] au capital de [capital] euros, immatriculée au RCS de [ville] sous le numéro [numéro RCS], dont le siège social est situé [adresse], représentée par [Nom et Prénom], en qualité de [qualité/titre],

*Ci-après dénommé le « Bénéficiaire »,*

La Partie Émettrice et le Bénéficiaire étant individuellement désignés une « Partie » et conjointement les « Parties ».

---

### PRÉAMBULE

Dans le cadre de discussions préalables relatives à [décrire le projet ou l'opération envisagée] (ci-après le « Projet »), la Partie Émettrice sera amenée à divulguer au Bénéficiaire des informations confidentielles à caractère technique, commercial, financier ou stratégique.

Les Parties entendent par le présent accord fixer les conditions juridiques de transmission, d'utilisation et de protection de ces Informations Confidentielles conformément aux articles L. 151-1 et suivants du Code de commerce protégeant le secret des affaires.

---

### ARTICLE 1 – DÉFINITION DES INFORMATIONS CONFIDENTIELLES

Constitue une « Information Confidentielle » au sens des présentes toute information, donnée, document, savoir-faire, code source, plan commercial, modèle financier, analyse ou secret de fabrication, sous quelque forme ou support que ce soit (écrit, oral, électronique, magnétique), transmis ou porté à la connaissance du Bénéficiaire par la Partie Émettrice ou ses conseils.

Sont exclues de la présente obligation les informations :
1. Tombées dans le domaine public antérieurement à leur communication ou postérieurement sans manquement du Bénéficiaire ;
2. Déjà connues légitimement du Bénéficiaire avant leur communication, attestée par des preuves écrites antérieures ;
3. Développées de manière indépendante par le Bénéficiaire sans référence ni recours aux Informations Confidentielles de la Partie Émettrice ;
4. Reçues légitimement d'un tiers non soumis à une obligation de confidentialité.

---

### ARTICLE 2 – OBLIGATIONS DU BÉNÉFICIAIRE

Le Bénéficiaire s'engage expressément et irrévocablement à :
1. Garder les Informations Confidentielles strictement secrètes et ne les divulguer à aucun tiers sans l'accord écrit préalable de la Partie Émettrice ;
2. N'utiliser les Informations Confidentielles qu'aux seules fins exclusives de l'évaluation et de la réalisation du Projet ;
3. Ne communiquer ces informations qu'à ses salariés, mandataires sociaux et conseils professionnels ayant un strict besoin d'en connaître (« need-to-know ») et soumis à des obligations de confidentialité au moins aussi contraignantes que celles prévues aux présentes ;
4. Appliquer les mesures de protection physiques et logiques au moins équivalentes à celles qu'il applique à ses propres informations les plus sensibles, et en tout état de cause adaptées aux exigences de l'état de l'art.

---

### ARTICLE 3 – DURÉE DE CONFIDENTIALITÉ

Le présent accord entre en vigueur à la date de sa signature pour une durée de [durée, ex: 3 ans]. L'obligation de confidentialité perdurera pendant une durée de trois (3) années à compter du terme des discussions ou de l'expiration du présent accord.

Pour les informations constituant des secrets d'affaires fondamentaux ou des secrets de fabrication au sens de l'article L. 151-1 du Code de commerce, l'obligation de secret s'appliquera aussi longtemps que l'information n'est pas licitement tombée dans le domaine public.

---

### ARTICLE 4 – RESTITUTION OU DESTRUCTION DES SUPPORTS

À la première demande écrite de la Partie Émettrice ou en cas d'interruption du Projet, le Bénéficiaire s'engage à restituer sans délai ou à détruire de manière sécurisée et irréversible l'ensemble des documents, copies, notes de travail et extraits contenant des Informations Confidentielles, et à en certifier la destruction par écrit.

---

### ARTICLE 5 – LOI APPLICABLE ET JURIDICTION COMPÉTENTE

Le présent contrat est exclusivement régi et interprété conformément au droit français.

Tout différend né de la validité, de l'interprétation, de l'exécution ou de la résiliation du présent accord, qui ne ferait pas l'objet d'un règlement amiable dans un délai de trente (30) jours calendaires, sera soumis à la compétence exclusive du **Tribunal de commerce de Paris**, nonobstant pluralité de défendeurs ou appel en garantie, y compris en matière de référé d'urgence.

---

Fait à [Lieu de signature], le [Date], en deux (2) exemplaires originaux revêtus d'une signature électronique qualifiée conforme au Règlement européen eIDAS.
`,
};

export const ACCORD_CONFIDENTIALITE_RECIPROQUE: LegalTemplateDefinition = {
  libraryKey: "fr-nda-mutual",
  name: "Accord de confidentialité réciproque (Mutual NDA)",
  description: "Modèle bilatéral de protection des échanges confidentiels et secrets d'affaires partagés entre deux partenaires commerciaux.",
  category: "Propriété Intellectuelle & Secrets",
  folder: "Accords & Contrats",
  pages: 3,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Conforme aux articles L. 151-1 s. C. com. et articles 1104, 1112 et 1231-1 du Code civil.",
  fields: [
    { name: "signature_partie_a", fieldType: "signature", pageNumber: 3, required: true, label: "Signature Partie A" },
    { name: "date_signature_partie_a", fieldType: "date", pageNumber: 3, required: true, label: "Date de signature" },
    { name: "signature_partie_b", fieldType: "signature", pageNumber: 3, required: true, label: "Signature Partie B" },
    { name: "date_signature_partie_b", fieldType: "date", pageNumber: 3, required: true, label: "Date de signature" },
  ],
  bodyMarkdown: `# ACCORD DE CONFIDENTIALITÉ BILATÉRAL ET RÉCIPROQUE

**ENTRE LES SOUSSIGNÉS :**

**1. [Dénomination de la Première Partie]**, société [forme] au capital de [capital] €, immatriculée au RCS de [ville] sous le numéro [numéro], ayant son siège social à [adresse], représentée par [Nom], en qualité de [Titre],

*Ci-après dénommée « Partie A »,*

**ET :**

**2. [Dénomination de la Seconde Partie]**, société [forme] au capital de [capital] €, immatriculée au RCS de [ville] sous le numéro [numéro], ayant son siège social à [adresse], représentée par [Nom], en qualité de [Titre],

*Ci-après dénommée « Partie B »,*

Conjointement désignées les « Parties » ou individuellement une « Partie ».

---

### PRÉAMBULE

Les Parties souhaitent échanger des informations stratégiques, techniques et financières en vue d'étudier la faisabilité d'un partenariat ou d'une opération commune (l'« Objectif Commun »).
Les Parties conviennent d'assurer une protection réciproque, symétrique et rigoureuse des informations confidentielles échangées, dans le respect de l'obligation générale de bonne foi précontractuelle posée par l'article 1112-1 du Code civil.

---

### ARTICLE 1 – RÉCIPROCITÉ DU CHAMP D'APPLICATION

Chaque Partie agissant en qualité de Partie Émettrice bénéficie de la protection absolue conférée par les présentes à l'égard de l'autre Partie agissant en qualité de Partie Réceptrice.
Les Informations Confidentielles incluent l'ensemble des données commerciales, feuilles de route techniques, algorithmes, identités des clients et prospects, états financiers non publiés et méthodologies échangés, quel que soit le canal de transmission.

---

### ARTICLE 2 – ENGAGEMENTS MUTUELS DE PROTECTION

Chaque Partie s'oblige, pour les informations reçues de l'autre Partie :
1. À préserver la plus stricte confidentialité et à ne pas révéler l'existence ou la teneur des discussions en cours ;
2. À restreindre la diffusion aux seuls collaborateurs et conseillers astreints au secret professionnel ou liés par un engagement de confidentialité équivalent ;
3. À ne pas utiliser les Informations Confidentielles à des fins concurrentielles, directes ou indirectes, ou à des fins étrangères à l'Objectif Commun ;
4. À ne procéder à aucune rétro-ingénierie, décompilation ou désassemblage de tout logiciel, prototype ou matériel remis.

---

### ARTICLE 3 – DURÉE DES OBLIGATIONS

Le présent accord est conclu pour une durée de deux (2) ans à compter de sa signature. Les engagements de confidentialité demeurent en vigueur pendant une période de trois (3) ans après la fin de la validité du présent accord ou la fin des pourparlers, le délai le plus long étant retenu.

---

### ARTICLE 4 – PROTECTION DES DONNÉES PERSONNELLES (RGPD)

Dans la mesure où des données à caractère personnel seraient transmises entre les Parties, chacune s'engage à respecter les prescriptions du Règlement (UE) 2016/679 (RGPD) et de la loi Informatique et Libertés du 6 janvier 1978 modifiée, en garantissant notamment la sécurité, la confidentialité et l'intégrité de ces données.

---

### ARTICLE 5 – DROIT APPLICABLE ET TRIBUNAL COMPÉTENT

Le présent accord est soumis au droit français. À défaut de conciliation amiable dans les trente (30) jours suivant la notification d'un différend, les litiges seront déférés à la compétence exclusive du **Tribunal de commerce de Paris**.

Fait en deux exemplaires originaux scellés électroniquement selon le standard PAdES eIDAS.
`,
};
