import { PortalRoot } from "@/components/portal/portal-root";

// /admin/{section} - the platform console. All sections render the portal;
// the client root derives the active admin section from the path.
export default function AdminPage() {
  return <PortalRoot />;
}
