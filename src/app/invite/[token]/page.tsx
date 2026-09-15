import type { Metadata } from "next";
import { AcceptInvite } from "@/components/onboarding/accept-invite";

export const metadata: Metadata = {
  title: "Join your team on Docurama",
  description: "Accept your workspace invitation and start signing.",
};

/** /invite/[token] - public invitation landing page. */
export default function InvitePage() {
  return <AcceptInvite />;
}
