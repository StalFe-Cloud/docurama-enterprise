import type { LegalTemplateDefinition } from "./types";

export const BAIL_COMMERCIAL: LegalTemplateDefinition = {
  libraryKey: "fr-commercial-lease",
  name: "Bail commercial (Statut des baux commerciaux 3-6-9)",
  description: "Contrat de bail commercial régi par les articles L. 145-1 et suivants du Code de commerce, avec clause résolutoire, indexation ILC et état des lieux.",
  category: "Immobilier & Locatif",
  folder: "Accords & Contrats",
  pages: 5,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Régie par le décret n° 53-960 du 30 septembre 1953 codifié aux articles L. 145-1 s. et R. 145-1 s. du Code de commerce (Loi Pinel).",
  fields: [
    { name: "signature_bailleur", fieldType: "signature", pageNumber: 5, required: true, label: "Signature du Bailleur" },
    { name: "date_bailleur", fieldType: "date", pageNumber: 5, required: true, label: "Date signature bailleur" },
    { name: "signature_preneur", fieldType: "signature", pageNumber: 5, required: true, label: "Signature du Preneur" },
    { name: "date_preneur", fieldType: "date", pageNumber: 5, required: true, label: "Date signature preneur" },
  ],
  bodyMarkdown: `# CONTRAT DE BAIL COMMERCIAL (3-6-9 ANS)

**ENTRE LES SOUSSIGNÉS :**

**Le Bailleur :**
[Nom, Prénom ou Dénomination de la Société], [forme juridique], immatriculée au RCS de [ville] sous le numéro [numéro], dont le siège est situé à [adresse], représentée par [Nom], agissant en qualité de [fonction],

*Ci-après dénommé le « Bailleur »,*

**ET :**

**Le Preneur :**
[Dénomination sociale du Preneur], [forme juridique] au capital de [capital] €, immatriculée au RCS de [ville] sous le numéro [numéro], représentée par [Nom], agissant en qualité de [qualité],

*Ci-après dénommé le « Preneur »,*

---

### ARTICLE 1 – DÉSIGNATION DES LIEUX LOUÉS ET DESTINATION

Le Bailleur donne à bail à loyer commercial au Preneur, qui accepte, les locaux désignés ci-après : [Adresse exacte, étage, surface en m², dépendances, parkings].
Les locaux sont loués exclusivement pour l'exercice de l'activité commerciale suivante : **[décrire l'activité autorisée, ex: bureaux, prestations informatiques, conseil]**, à l'exclusion formelle de toute autre activité sans accord exprès du Bailleur, sous réserve des dispositions de déspécialisation prévues aux articles L. 145-47 et suivants du Code de commerce.

---

### ARTICLE 2 – DURÉE DU BAIL

Le présent bail est consenti et accepté pour une durée de **neuf (9) années entières et consécutives**, qui commenceront à courir le [date de prise d'effet] pour se terminer le [date de fin].
Conformément à l'article L. 145-4 du Code de commerce, le Preneur a la faculté de donner congé à l'expiration de chaque période triennale (au bout de 3 ans et 6 ans), en notifiant son congé au Bailleur au moins six (6) mois à l'avance par acte de commissaire de justice ou lettre recommandée avec demande d'avis de réception.

---

### ARTICLE 3 – LOYER, DÉPÔT DE GARANTIE ET INDEXATION

Le bail est consenti moyennant un loyer annuel principal hors taxes et hors charges de [montant en chiffres] euros ([montant en lettres] €), payable d'avance par trimestre échu au domicile du Bailleur.
Le loyer sera révisé annuellement à la date anniversaire du contrat en fonction de la variation de l'Indice des Loyers Commerciaux (ILC) publié trimestriellement par l'INSEE, conformément à l'article L. 145-38 du Code de commerce.
À titre de garantie de l'exécution de ses obligations, le Preneur verse ce jour au Bailleur la somme de [montant] euros, correspondant à un terme trimestriel de loyer hors taxes.

---

### ARTICLE 4 – CHARGES, IMPÔTS ET TRAVAUX (LOI PINEL)

En application des articles L. 145-40-2 et R. 145-35 du Code de commerce :
1. Les grosses réparations visées à l'article 606 du Code civil demeurent à la charge exclusive du Bailleur ;
2. Les réparations locatives et d'entretien courant (article 605 du Code civil) incombent au Preneur ;
3. Un état récapitulatif annuel de l'inventaire des charges, impôts, taxes et redevances est communiqué au Preneur au plus tard le 30 septembre de l'année suivant celle au titre de laquelle il est établi.

---

### ARTICLE 5 – CLAUSE RÉSOLUTOIRE

Il est expressément convenu qu'à défaut de paiement d'un seul terme de loyer ou de charges à son échéance, ou en cas d'inexécution d'une seule des conditions du présent bail, et un (1) mois après un commandement de payer ou une sommation d'exécuter demeuré infructueux et contenant déclaration par le Bailleur de son intention d'user du bénéfice de la présente clause, le présent bail sera résilié de plein droit, sans qu'il soit besoin de former une demande judiciaire.

---

### ARTICLE 6 – ATTRIBUTION DE COMPÉTENCE

Pour l'exécution des présentes et de leurs suites, les parties font élection de domicile : le Bailleur à son siège social, le Preneur dans les lieux loués. Tout litige relatif au présent bail relève de la compétence exclusive du **Tribunal judiciaire** du lieu de situation de l'immeuble.
`,
};

export const CONDITIONS_GENERALES_VENTE: LegalTemplateDefinition = {
  libraryKey: "fr-cgv-b2b",
  name: "Conditions Générales de Vente B2B (CGV)",
  description: "Socle de la négociation commerciale conforme à l'article L. 441-1 du Code de commerce pour les relations interentreprises.",
  category: "Commercial & Vente",
  folder: "Accords & Contrats",
  pages: 3,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Conforme aux articles L. 441-1 s., L. 441-10 s., L. 442-1 s. du Code de commerce et articles 1101 s. du Code civil.",
  fields: [
    { name: "signature_client", fieldType: "signature", pageNumber: 3, required: true, label: "Bon pour accord et acceptation des CGV" },
    { name: "date_acceptation", fieldType: "date", pageNumber: 3, required: true, label: "Date d'acceptation" },
  ],
  bodyMarkdown: `# CONDITIONS GÉNÉRALES DE VENTE (B2B)

### PRÉAMBULE ET CHAMP D'APPLICATION

Les présentes Conditions Générales de Vente (« CGV ») constituent le socle unique de la négociation commerciale au sens de l'article L. 441-1 du Code de commerce entre la société [Dénomination de l'Entreprise Vendeuse] (le « Vendeur ») et ses clients professionnels (le « Client »).
Toute commande de produits ou de prestations de services implique l'adhésion entière, préalable et sans réserve du Client aux présentes CGV, qui prévalent sur tout document émanant du Client, notamment sur toutes conditions générales d'achat.

---

### ARTICLE 1 – COMMANDES ET TARIFS

Les commandes ne deviennent définitives qu'après acceptation écrite du devis ou validation en ligne de la commande par le Vendeur. Les prix sont stipulés en euros, hors taxes (HT), les taxes en vigueur au jour de la facturation étant appliquées en sus.

---

### ARTICLE 2 – DÉLAIS ET MODALITÉS DE PAIEMENT

Sauf accord particulier validé sur le devis, les factures sont payables à trente (30) jours fin de mois à compter de leur date d'émission, conformément à l'article L. 441-10 du Code de commerce. Aucun escompte n'est consenti pour paiement anticipé.
Tout retard de paiement entraîne de plein droit et sans mise en demeure préalable :
1. L'application de pénalités de retard calculées sur la base du taux directeur semestriel de la BCE majoré de 10 points de pourcentage ;
2. L'exigibilité immédiate d'une indemnité forfaitaire pour frais de recouvrement de quarante (40) euros (Art. D. 441-5 C. com.) ;
3. La suspension de toute livraison ou prestation en cours jusqu'à apurement complet des sommes échues.

---

### ARTICLE 3 – RÉSERVE DE PROPRIÉTÉ

Le Vendeur conserve la propriété pleine et entière des biens vendus jusqu'au complet paiement du prix en principal, frais et accessoires, conformément aux articles 2367 et suivants du Code civil.

---

### ARTICLE 4 – RESPONSABILITÉ ET FORCE MAJEURE

Le Vendeur ne saurait être tenu pour responsable des dommages indirects, pertes d'exploitation, préjudices d'image ou gains manqués subis par le Client. La responsabilité totale du Vendeur est strictement limitée au montant hors taxes perçu au titre de la commande litigieuse. Aucune Partie ne pourra être tenue responsable de l'inexécution de ses obligations en cas d'événement de force majeure au sens de l'article 1218 du Code civil.

---

### ARTICLE 5 – LOI APPLICABLE ET TRIBUNAL COMPÉTENT

Les présentes CGV sont soumises au droit français. À défaut de règlement amiable sous 30 jours, tout différend relatif à leur validité, interprétation ou exécution sera porté devant le **Tribunal de commerce du ressort du siège social du Vendeur**.
`,
};

export const PACTE_ASSOCIES: LegalTemplateDefinition = {
  libraryKey: "fr-shareholders-agreement",
  name: "Pacte d'associés / d'actionnaires (SAS)",
  description: "Pacte extrastatutaire de gouvernance, préemption, agrément, sortie conjointe (tag-along / drag-along) et bad leaver pour société par actions simplifiée (SAS).",
  category: "Droit des Sociétés & Gouvernance",
  folder: "Accords & Contrats",
  pages: 6,
  locale: "fr",
  jurisdiction: "FR",
  version: "1.0.0",
  sourceNotes: "Conforme aux articles 1101 s. du Code civil et L. 227-1 s. du Code de commerce.",
  fields: [
    { name: "signature_fondateur_1", fieldType: "signature", pageNumber: 6, required: true, label: "Signature Associé Fondateur 1" },
    { name: "date_fondateur_1", fieldType: "date", pageNumber: 6, required: true, label: "Date signature" },
    { name: "signature_fondateur_2", fieldType: "signature", pageNumber: 6, required: true, label: "Signature Associé Fondateur 2" },
    { name: "date_fondateur_2", fieldType: "date", pageNumber: 6, required: true, label: "Date signature" },
    { name: "signature_investisseur", fieldType: "signature", pageNumber: 6, required: true, label: "Signature Investisseur" },
    { name: "date_investisseur", fieldType: "date", pageNumber: 6, required: true, label: "Date signature" },
  ],
  bodyMarkdown: `# PACTE D'ASSOCIÉS EXTRASOCIÉTAIRE (SAS)

**ENTRE LES SOUSSIGNÉS :**

Les Associés Fondateurs et les Investisseurs de la société **[Nom de la SAS]**, société par actions simplifiée au capital de [capital] €, immatriculée au RCS de [ville] sous le numéro [numéro], dont le siège social est situé [adresse] (la « Société »).

---

### PRÉAMBULE

Les Parties sont associées au sein de la Société et détiennent ensemble 100 % du capital social et des droits de vote.
Le présent Pacte a pour objet d'organiser leurs relations d'associés, la gouvernance de la Société, les conditions de transfert de leurs titres et la préservation de l'affectio societatis.

---

### ARTICLE 1 – GOUVERNANCE ET COMITÉ STRATÉGIQUE

La direction générale de la Société est assurée par le Président assisté d'un Directeur Général.
Il est institué un Comité Stratégique composé de [nombre] membres, dont la mission est d'éclairer la direction et d'autoriser préalablement les décisions majeures suivantes :
1. L'adoption du budget annuel et du plan d'affaires (« Business Plan ») ;
2. Tout investissement ou emprunt unitaire supérieur à [montant] euros ;
3. La conclusion de toute convention réglementée entre la Société et un associé ou dirigeant ;
4. Toute émission de titres financiers ou opération sur le capital social.

---

### ARTICLE 2 – DROIT DE PRÉEMPTION

Tout transfert de titres par un Associé à un tiers est subordonné au respect d'un droit de préemption au bénéfice des autres associés proportionnellement à leur participation au capital. L'associé cédant notifie son projet de cession au Président et aux associés en précisant le prix et les conditions. Les associés disposent d'un délai de trente (30) jours pour exercer leur droit de préemption.

---

### ARTICLE 3 – DROIT DE SORTIE CONJOINTE TOTALE ET PROPORTIONNELLE

**Sortie conjointe proportionnelle (Tag-Along) :** Si un ou plusieurs associés envisagent de céder à un tiers un bloc conférant le contrôle de la Société, les autres associés ont le droit d'exiger le rachat de leurs propres titres aux mêmes conditions de prix et de paiement.
**Obligation de sortie conjointe (Drag-Along) :** En cas d'offre ferme d'acquisition portant sur 100 % du capital formulée par un tiers de bonne foi et acceptée par des associés représentant au moins 75 % du capital, tous les autres associés s'obligent irrévocablement à céder l'intégralité de leurs titres aux mêmes conditions.

---

### ARTICLE 4 – CLAUSE DE « GOOD LEAVER » ET « BAD LEAVER »

Tout Associé Opérationnel qui viendrait à cesser ses fonctions au sein de la Société pour faute grave, faute lourde, ou démission volontaire non agréée (« Bad Leaver »), s'engage irrévocablement à céder ses titres non acquis (« unvested ») à leur valeur nominale, et ses titres acquis avec une décote de 50 % par rapport à la valeur de marché fixée à dire d'expert (Art. 1843-4 du Code civil).

---

### ARTICLE 5 – LOI APPLICABLE ET ATTRIBUTION DE COMPÉTENCE

Le présent Pacte est soumis exclusivement au droit français. Tout différend relatif à sa conclusion, validité ou exécution sera soumis au **Tribunal de commerce de Paris**.
`,
};
