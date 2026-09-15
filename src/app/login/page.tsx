import type { Metadata } from "next";
import { PortalRoot } from "@/components/portal/portal-root";

export const metadata: Metadata = {
  title: "Sign in - Docurama",
  description: "Sign in to the Docurama portal.",
};

/**
 * Explicit sign-in URL (app.docurama.eu/login in production). Renders the
 * portal root - which shows the sign-in screen for unauthenticated visitors
 * and the workspace for signed-in ones.
 */
export default function LoginPage() {
  return <PortalRoot />;
}
