export interface ComplianceDocumentSeed {
  key: string;
  title: string;
  category: "Policy" | "Agreement" | "Register" | "Plan" | "Notice";
  owner: string;
  status: "APPROVED" | "IN_REVIEW" | "DRAFT" | "RETIRED";
  version: string;
  locale: string;
  summary: string;
  isPublic: boolean;
  controlRefs: string;
  bodyMarkdown: string;
}

export const COMPLIANCE_DOCUMENTS_SEED: ComplianceDocumentSeed[] = [
  {
    key: "pssi-socle",
    title: "Politique de Sécurité des Systèmes d'Information (PSSI)",
    category: "Policy",
    owner: "RSSI / CISO",
    status: "APPROVED",
    version: "2.4.0",
    locale: "fr",
    summary: "Socle directeur de gouvernance de la sécurité des systèmes d'information, conforme ISO/IEC 27001:2022 et aux recommandations de l'ANSSI.",
    isPublic: true,
    controlRefs: "ISO-27001-A.5.1|SOC2-CC5.3|ANSSI-PA-022",
    bodyMarkdown: `# POLITIQUE DE SÉCURITÉ DES SYSTÈMES D'INFORMATION (PSSI)

### 1. OBJET ET CHAMP D'APPLICATION
La présente Politique de Sécurité des Systèmes d'Information (« PSSI ») fixe les directives stratégiques, organisationnelles et techniques de Docurama SAS pour assurer la confidentialité, l'intégrité, la disponibilité et la traçabilité des données hébergées et traitées sur la plateforme.
Elle s'applique sans exception à l'ensemble du personnel, des prestataires, des administrateurs et des tiers accédant aux infrastructures de production.

### 2. PRINCIPES DIRECTEURS
- **Défense en profondeur :** Cloisonnement strict des réseaux, isolation multi-tenant, micro-segmentation et chiffrement de bout en bout (TLS 1.3 en transit, AES-256-GCM au repos).
- **Moindre privilège :** Tout accès aux ressources de production requiert une justification opérationnelle, une authentification multi-facteurs (FIDO2 / TOTP) et une revue trimestrielle.
- **Souveraineté des données :** L'ensemble des données clients, documents, journaux d'audit et clés cryptographiques sont exclusivement hébergés dans l'Union Européenne (Région Paris / Frankfurt).

### 3. CONTRÔLE ET AUDIT
Des tests d'intrusion (pentests) indépendants sont diligentés annuellement. Toute modification d'architecture fait l'objet d'un examen par le Comité de Sécurité.
`,
  },
  {
    key: "rgpd-protection-donnees",
    title: "Politique Générale de Protection des Données Personnelles (RGPD)",
    category: "Policy",
    owner: "DPO / Juridique",
    status: "APPROVED",
    version: "2.1.0",
    locale: "fr",
    summary: "Règles de gouvernance des traitements de données personnelles applicables en tant que Responsable de Traitement et Sous-traitant (Art. 24 & 28 RGPD).",
    isPublic: true,
    controlRefs: "GDPR-24|GDPR-28|GDPR-32|ISO-27001-A.5.34",
    bodyMarkdown: `# POLITIQUE GÉNÉRALE DE PROTECTION DES DONNÉES (RGPD)

### 1. ENGAGEMENT DE CONFORMITÉ
Docurama SAS applique scrupuleusement le Règlement (UE) 2016/679 (RGPD) et la loi Informatique et Libertés du 6 janvier 1978 modifiée.

### 2. PRINCIPES APPLIQUÉS AUX TRAITEMENTS
- **Licéité et transparence :** Chaque traitement repose sur une base légale déterminée (exécution contractuelle, obligation légale ou consentement).
- **Minimisation des données :** Seules les données strictement nécessaires à la génération, l'invitation et le scellement des signatures électroniques sont collectées.
- **Durée de conservation limitée :** Les documents sont purgés conformément aux politiques de rétention configurées par le tenant ou aux durées légales de prescription.

### 3. EXERCICE DES DROITS
Chaque personne concernée dispose des droits d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition via notre DPO dédié (dpo@docurama.eu).
`,
  },
  {
    key: "eidas-cp-cps",
    title: "Politique de Signature Électronique et de Scellement (CP/CPS eIDAS)",
    category: "Policy",
    owner: "Directeur Cryptographique",
    status: "APPROVED",
    version: "1.8.0",
    locale: "fr",
    summary: "Spécifications de conformité au Règlement européen eIDAS (UE) 910/2014 pour les signatures électroniques simples, avancées (AES) et qualifiées (QES).",
    isPublic: true,
    controlRefs: "eIDAS-Art26|eIDAS-Art32|ETSI-EN-319-411",
    bodyMarkdown: `# POLITIQUE DE SIGNATURE ÉLECTRONIQUE ET DE SCELLEMENT (CP/CPS)

### 1. CADRE NORMATIF eIDAS
Le service Docurama délivre des signatures électroniques avancées reposant sur le standard ETSI EN 319 142 (PAdES-Baseline-B/T/LT/LTA).

### 2. CRITÈRES DE VALIDITÉ DU SCEAU
- Lien univoque avec le signataire via jetons d'accès cryptographiques éphémères (32 octets d'entropie).
- Identification du signataire par OTP SMS ou e-mail vérifié.
- Détection immédiate de toute modification ultérieure du document par scellement SHA-256 et horodatage certifié RFC 3161.
`,
  },
  {
    key: "pca-pra-resilience",
    title: "Plan de Continuité et de Reprise d'Activité (PCA / PRA)",
    category: "Plan",
    owner: "Infrastructure & DevOps",
    status: "APPROVED",
    version: "3.0.0",
    locale: "fr",
    summary: "Procédures de résilience, basculement multi-zones et objectifs RTO/RPO pour garantir la continuité opérationnelle du service de signature.",
    isPublic: false,
    controlRefs: "ISO-27001-A.8.14|SOC2-A1.2|ISO-22301",
    bodyMarkdown: `# PLAN DE CONTINUITÉ ET DE REPRISE D'ACTIVITÉ (PCA/PRA)

### 1. OBJECTIFS DE RÉSILIENCE
- **RTO (Recovery Time Objective) :** Moins de 2 heures pour le rétablissement complet des services de signature et d'accès au portail.
- **RPO (Recovery Point Objective) :** Zéro perte pour les signatures scellées et les preuves cryptographiques ; moins de 15 minutes pour les brouillons non envoyés.

### 2. ARCHITECTURE DE REDONDANCE
- Réplication synchrone des bases de données et stockage distribué immuable sur 3 zones de disponibilité en Île-de-France.
- Tests d'évacuation et exercices de restauration (restore drills) automatisés chaque trimestre.
`,
  },
  {
    key: "kms-chiffrement-cles",
    title: "Politique de Gestion des Clés et Chiffrement Cryptographique",
    category: "Policy",
    owner: "Équipe Sécurité",
    status: "APPROVED",
    version: "2.0.0",
    locale: "fr",
    summary: "Cycle de vie des clés de scellement, modules HSM certifiés FIPS 140-2 Level 3 / CC EAL4+, rotation et destruction sécurisée.",
    isPublic: false,
    controlRefs: "ISO-27001-A.8.24|SOC2-CC6.6|NIST-SP-800-57",
    bodyMarkdown: `# GESTION DES CLÉS ET CHIFFREMENT (KMS / HSM)

### 1. GESTION DU CYCLE DE VIE DES CLÉS
Toutes les opérations de signature et d'horodatage qualifié s'exécutent dans des modules cryptographiques matériels (HSM) dédiés répondant aux normes FIPS 140-2 Level 3.
Les clés de chiffrement de stockage subissent une rotation automatique annuelle sans interruption de service.
`,
  },
  {
    key: "gestion-incidents-cnil",
    title: "Procédure de Gestion des Incidents et Notification de Violation CNIL",
    category: "Plan",
    owner: "RSSI / DPO",
    status: "APPROVED",
    version: "2.2.0",
    locale: "fr",
    summary: "Protocole d'alerte, de qualification SEV1-SEV3, de confinement d'incident et de notification à la CNIL dans le délai strict de 72 heures (Art. 33 RGPD).",
    isPublic: false,
    controlRefs: "GDPR-33|GDPR-34|ISO-27001-A.5.24|NIS2-Art23",
    bodyMarkdown: `# PROCÉDURE DE GESTION DES INCIDENTS ET NOTIFICATION CNIL

### 1. SEUILS DE GRAVITÉ ET DÉLAIS
- **SEV1 (Critique) :** Violation avérée de données à caractère personnel ou indisponibilité totale du cluster de scellement. Escalade immédiate, mobilisation de la cellule de crise sous 30 minutes.
- **Notification CNIL :** Conformément à l'article 33 du RGPD, toute violation présentant un risque pour les droits et libertés est notifiée à la CNIL au plus tard dans les 72 heures suivant sa constatation.
`,
  },
  {
    key: "registre-traitements-art30",
    title: "Registre des Activités de Traitement (Article 30 RGPD)",
    category: "Register",
    owner: "DPO",
    status: "APPROVED",
    version: "2.5.0",
    locale: "fr",
    summary: "Inventaire exhaustif des finalités de traitement, catégories de données, destinataires et mesures de sécurité pour chaque traitement opéré par Docurama.",
    isPublic: false,
    controlRefs: "GDPR-30|ISO-27001-A.5.34",
    bodyMarkdown: `# REGISTRE DES ACTIVITÉS DE TRAITEMENT (ART. 30 RGPD)

### 1. TRAITEMENT 1 : SERVICE DE SIGNATURE ÉLECTRONIQUE
- **Finalité :** Émission, acheminement, recueil de signature et scellement d'actes juridiques.
- **Catégories de données :** Identité des signataires, adresse e-mail, numéro de téléphone (OTP SMS), horodatages, adresse IP hachée.
- **Conservation :** Durée du compte client augmentée de la durée légale de prescription de l'acte signé (jusqu'à 10 ans).
`,
  },
  {
    key: "iam-controle-acces",
    title: "Politique de Contrôle d'Accès, IAM et Authentification MFA",
    category: "Policy",
    owner: "Sécurité & Systèmes",
    status: "APPROVED",
    version: "1.9.0",
    locale: "fr",
    summary: "Règles d'authentification robuste, politique de mots de passe, MFA obligatoire pour l'administration et séparation stricte des privilèges RBAC.",
    isPublic: false,
    controlRefs: "ISO-27001-A.5.15|ISO-27001-A.5.18|SOC2-CC6.1",
    bodyMarkdown: `# CONTRÔLE D'ACCÈS ET AUTHENTIFICATION (IAM)

### 1. PRINCIPES D'AUTHENTIFICATION
- Authentification multifacteur (MFA/TOTP) exigée pour tout compte d'administrateur ou accès aux environnements de production.
- Mots de passe de longueur minimale de 12 caractères avec règles de complexité et vérification contre les dictionnaires de compromission connus.
- Blocage automatique après 5 tentatives infructueuses et temporisation anti-brute force.
`,
  },
  {
    key: "retention-purge-donnees",
    title: "Politique de Rétention, Conservation et Purge Sécurisée",
    category: "Policy",
    owner: "DPO & Ingénierie",
    status: "APPROVED",
    version: "1.5.0",
    locale: "fr",
    summary: "Règles d'expiration des téléversements orphelins (24h), d'archivage des dossiers scellés et d'écrasement sécurisé selon la norme DoD 5220.22-M.",
    isPublic: false,
    controlRefs: "GDPR-5.1.e|ISO-27001-A.8.10|SOC2-CC6.5",
    bodyMarkdown: `# POLITIQUE DE CONSERVATION ET PURGE DES DONNÉES

### 1. CYCLES DE RÉTENTION
- **Téléversements orphelins (non scellés) :** Purge automatique après 24 heures (UPLOAD_TTL_SECONDS).
- **Enveloppes complétées :** Conservation configurable par le tenant (1 an, 5 ans, 10 ans) avec scellé intègre.
- **Effacement définitif :** Destruction cryptographique de la clé de déchiffrement et suppression irréversible du fichier physique sur le disque.
`,
  },
  {
    key: "procedure-dsar-droits",
    title: "Procédure Opérationnelle de Traitement des Demandes DSAR",
    category: "Plan",
    owner: "DPO & Équipe Support",
    status: "APPROVED",
    version: "1.7.0",
    locale: "fr",
    summary: "Guide d'exécution des demandes de droit d'accès, d'effacement et de portabilité : vérification d'identité, collecte de l'archive JSON et clôture sous 30 jours.",
    isPublic: false,
    controlRefs: "GDPR-12|GDPR-15|GDPR-17|GDPR-20",
    bodyMarkdown: `# PROCÉDURE OPÉRATIONNELLE DSAR (DROITS DES PERSONNES)

### 1. RÉCEPTION ET CONTRÔLE D'IDENTITÉ
Toute demande formulée par e-mail ou via le portale privacy fait l'objet d'un accusé de réception immédiat et d'un contrôle rigoureux de l'identité du demandeur pour empêcher toute fuite de données à un tiers imposteur.

### 2. EXTRACTION ET FORMAT D'ARCHIVE
Le workflow automatisé DSAR génère un paquet structuré au format JSON contenant :
- Les profils utilisateurs et métadonnées de compte ;
- Les enveloppes signées ou en attente associées à l'adresse e-mail ;
- L'historique des consentements et l'extrait pertinent des journaux d'audit.
`,
  },
  {
    key: "securite-fournisseurs-st",
    title: "Politique de Sécurité des Fournisseurs et Sous-Traitants",
    category: "Policy",
    owner: "Achats & Juridique",
    status: "APPROVED",
    version: "2.0.0",
    locale: "fr",
    summary: "Exigences contractuelles imposées aux sous-traitants ultérieurs (hébergeurs, passerelles SMS, horodatage) et clauses contractuelles types UE.",
    isPublic: false,
    controlRefs: "GDPR-28.2|ISO-27001-A.5.19|SOC2-CC9.2",
    bodyMarkdown: `# SÉCURITÉ DES FOURNISSEURS ET SOUS-TRAITANTS

### 1. QUALIFICATION PRÉALABLE
Tout tiers accédant à des données pour le compte de Docurama fait l'objet d'une évaluation préalable de sécurité (certification ISO 27001, attestation SOC 2 Type II ou qualification SecNumCloud requise).
Des accords DPA conformes à l'article 28 du RGPD sont systématiquement signés avant tout transfert de données.
`,
  },
  {
    key: "rapport-audit-isms-anssi",
    title: "Déclaration d'Applicabilité et Rapport d'Audit de Sécurité ISMS",
    category: "Notice",
    owner: "Comité de Sécurité",
    status: "APPROVED",
    version: "1.0.0",
    locale: "fr",
    summary: "Déclaration formelle d'applicabilité des 93 contrôles ISO 27001:2022 et synthèse de conformité du système de management de la sécurité de l'information (SMSI).",
    isPublic: true,
    controlRefs: "ISO-27001-SoA|SOC2-TypeII|ANSSI-EBIOS",
    bodyMarkdown: `# DÉCLARATION D'APPLICABILITÉ ET RAPPORT D'AUDIT ISMS

### 1. SYNTHÈSE DE CONFORMITÉ
Le Système de Management de la Sécurité de l'Information (SMSI) de Docurama SAS est documenté, mis en œuvre et audité conformément aux exigences de la norme ISO/IEC 27001:2022.
Tous les contrôles applicables des clauses 5 (Organisationnel), 6 (Personnes), 7 (Physique) et 8 (Technologique) sont déployés et monitorés en continu.
`,
  },
];
