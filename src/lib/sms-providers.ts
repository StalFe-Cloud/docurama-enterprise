/**
 * SMS / WhatsApp gateway provider catalogue.
 *
 * Research notes (2026): free tiers & low-cost options for a EU (FR) SaaS.
 * "free"  = a genuinely usable free allowance (WhatsApp Cloud API service
 *           conversations, Twilio sandbox testing, …)
 * "trial" = one-off signup/trial credit, enough for QA
 * "paid"  = no meaningful free allowance, but among the cheapest per message
 *
 * The catalogue is data-only: the workspace settings UI renders credential
 * fields from `fields`, and the gateway test validates the shape of the
 * configuration without ever echoing secrets back.
 */

export type ProviderField = {
  key: "apiKey" | "apiSecret" | "senderId" | "whatsappApiKey";
  label: string;
  hint?: string;
};

export type SmsProvider = {
  key: string;
  name: string;
  channels: ("sms" | "whatsapp")[];
  tier: "free" | "trial" | "paid";
  lowCost: boolean;
  regions: string;
  freeTier: string;
  priceHint: string;
  docsUrl: string;
  fields: ProviderField[];
  notes?: string;
};

export const SMS_PROVIDERS: SmsProvider[] = [
  {
    key: "whatsapp-cloud",
    name: "Meta WhatsApp Cloud API",
    channels: ["whatsapp"],
    tier: "free",
    lowCost: true,
    regions: "Global",
    freeTier: "1,000 free service (user-initiated) conversations / month",
    priceHint: "Business-initiated templates from ~€0.01-0.08 / conversation by country",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    fields: [{ key: "whatsappApiKey", label: "Permanent access token", hint: "Meta for Developers → WhatsApp → Configuration" }],
    notes: "The best free channel: replies from signers (service conversations) are free. Ideal for OTP delivery to signers who message you first.",
  },
  {
    key: "twilio",
    name: "Twilio",
    channels: ["sms", "whatsapp"],
    tier: "trial",
    lowCost: false,
    regions: "Global",
    freeTier: "~$15.50 trial credit + free WhatsApp sandbox for testing",
    priceHint: "≈ €0.07-0.11 / SMS (FR)",
    docsUrl: "https://www.twilio.com/docs/messaging",
    fields: [
      { key: "apiKey", label: "Account SID", hint: "Starts with AC…" },
      { key: "apiSecret", label: "Auth token" },
    ],
    notes: "Gold standard for reliability; WhatsApp sandbox is free while you develop.",
  },
  {
    key: "telnyx",
    name: "Telnyx",
    channels: ["sms", "whatsapp"],
    tier: "trial",
    lowCost: true,
    regions: "EU + Global",
    freeTier: "$10 trial credit",
    priceHint: "≈ €0.005-0.045 / SMS - among the cheapest for FR/DE/UK",
    docsUrl: "https://developers.telnyx.com/docs/messaging",
    fields: [
      { key: "apiKey", label: "API key v2" },
      { key: "apiSecret", label: "API secret" },
    ],
    notes: "Strong EU coverage at roughly half Twilio's price; WhatsApp BSP too.",
  },
  {
    key: "vonage",
    name: "Vonage",
    channels: ["sms", "whatsapp"],
    tier: "trial",
    lowCost: false,
    regions: "Global",
    freeTier: "€2 trial credit",
    priceHint: "≈ €0.06-0.09 / SMS (FR)",
    docsUrl: "https://developer.vonage.com/en/messaging/sms/overview",
    fields: [
      { key: "apiKey", label: "API key" },
      { key: "apiSecret", label: "API secret" },
    ],
    notes: "Mature EU deliverability, French number inventory.",
  },
  {
    key: "messagebird",
    name: "Bird (MessageBird)",
    channels: ["sms", "whatsapp"],
    tier: "trial",
    lowCost: true,
    regions: "EU HQ (Amsterdam) + Global",
    freeTier: "Free test messages in sandbox",
    priceHint: "≈ €0.04-0.075 / SMS (FR)",
    docsUrl: "https://docs.bird.com",
    fields: [
      { key: "apiKey", label: "Access key" },
    ],
    notes: "EU-hosted, modern API, WhatsApp BSP. Good balance of price and deliverability.",
  },
  {
    key: "plivo",
    name: "Plivo",
    channels: ["sms"],
    tier: "trial",
    lowCost: true,
    regions: "US/EU",
    freeTier: "$25 trial credit (US numbers)",
    priceHint: "≈ €0.035-0.065 / SMS",
    docsUrl: "https://www.plivo.com/docs/sms/",
    fields: [
      { key: "apiKey", label: "Auth ID" },
      { key: "apiSecret", label: "Auth token" },
    ],
  },
  {
    key: "clicksend",
    name: "ClickSend",
    channels: ["sms", "whatsapp"],
    tier: "trial",
    lowCost: true,
    regions: "UK/AU/EU",
    freeTier: "Trial credit on signup",
    priceHint: "≈ €0.04-0.07 / SMS",
    docsUrl: "https://developers.clicksend.com/docs/rest/v3/",
    fields: [
      { key: "apiKey", label: "Username" },
      { key: "apiSecret", label: "API key" },
    ],
  },
  {
    key: "brevo",
    name: "Brevo",
    channels: ["sms"],
    tier: "paid",
    lowCost: true,
    regions: "EU HQ (Paris)",
    freeTier: "Free email plan (300/day); SMS is prepaid credits",
    priceHint: "≈ €0.045 / SMS (FR)",
    docsUrl: "https://developers.brevo.com/docs/send-sms",
    fields: [
      { key: "apiKey", label: "API key v3", hint: "xkeysib-…" },
    ],
    notes: "French vendor - pairs well with VOIRIA SASU (Docurama) for invoicing and DPD.",
  },
  {
    key: "smsmode",
    name: "Smsmode",
    channels: ["sms"],
    tier: "trial",
    lowCost: true,
    regions: "FR / UK / ES",
    freeTier: "10 free test SMS",
    priceHint: "≈ €0.045-0.065 / SMS (FR)",
    docsUrl: "https://api.smsmode.com/documentation",
    fields: [
      { key: "apiKey", label: "Access token" },
    ],
    notes: "French carrier-grade route (Obtengo), handy for FR sender IDs.",
  },
  {
    key: "textlocal",
    name: "Textlocal (MSG91)",
    channels: ["sms"],
    tier: "trial",
    lowCost: true,
    regions: "UK / IN / EU",
    freeTier: "Free trial credits",
    priceHint: "≈ €0.02-0.05 / SMS (UK/IN routes)",
    docsUrl: "https://www.textlocal.com/developers",
    fields: [
      { key: "apiKey", label: "API key" },
    ],
  },
  {
    key: "amazon-sns",
    name: "Amazon SNS",
    channels: ["sms"],
    tier: "paid",
    lowCost: true,
    regions: "AWS eu-west-3 (Paris)",
    freeTier: "No free SMS; pay-as-you-go",
    priceHint: "≈ €0.05 / SMS (FR sender-paid routes)",
    docsUrl: "https://docs.aws.amazon.com/sns/latest/dg/sms_publish-to-phone.html",
    fields: [
      { key: "apiKey", label: "Access key ID" },
      { key: "apiSecret", label: "Secret access key" },
    ],
    notes: "Cheapest if you already run on AWS - same bill, Paris region available.",
  },
  {
    key: "360dialog",
    name: "360dialog",
    channels: ["whatsapp"],
    tier: "paid",
    lowCost: false,
    regions: "Global (DE HQ)",
    freeTier: "No free tier - flat monthly plan per number",
    priceHint: "Flat plan ~€49+/mo incl. conversations",
    docsUrl: "https://docs.360dialog.com",
    fields: [{ key: "whatsappApiKey", label: "D360 API key" }],
    notes: "WhatsApp-only BSP; pick when you outgrow the Cloud API free tier and need a managed number.",
  },
  {
    key: "infobip",
    name: "Infobip",
    channels: ["sms", "whatsapp"],
    tier: "trial",
    lowCost: false,
    regions: "EU HQ (Croatia) + Global",
    freeTier: "Demo account with test credit",
    priceHint: "Volume-based, ≈ €0.05-0.08 / SMS (FR)",
    docsUrl: "https://www.infobip.com/docs",
    fields: [
      { key: "apiKey", label: "API key" },
    ],
    notes: "Enterprise-grade routes and WhatsApp BSP; strong SLAs.",
  },
  {
    key: "sinch",
    name: "Sinch",
    channels: ["sms", "whatsapp"],
    tier: "trial",
    lowCost: false,
    regions: "Global",
    freeTier: "Trial credit on signup",
    priceHint: "≈ €0.05-0.09 / SMS (FR)",
    docsUrl: "https://developers.sinch.com/docs/sms",
    fields: [
      { key: "apiKey", label: "Service plan ID" },
      { key: "apiSecret", label: "API token" },
    ],
  },
];

export const providerByKey = (key: string) => SMS_PROVIDERS.find((p) => p.key === key);

/** Recommended shortlist surfaced first in the settings UI. */
export const RECOMMENDED_PROVIDERS = ["whatsapp-cloud", "telnyx", "twilio", "brevo", "messagebird"];
