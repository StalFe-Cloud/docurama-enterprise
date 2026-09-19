import type { Metadata } from "next";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export const metadata: Metadata = {
  alternates: { canonical: "/welcome" },
  title: "Welcome - Docurama",
  description: "Create your account and set up your compliant eSignature workspace.",
};

export default function WelcomePage() {
  return <WelcomeWizard />;
}
