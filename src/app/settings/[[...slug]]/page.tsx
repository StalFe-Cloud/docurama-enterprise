import { PortalRoot } from "@/components/portal/portal-root";

// /settings, /settings/account, /settings/profile, /settings/users,
// /settings/esign, /settings/notifications, /settings/sms, /settings/api,
// /settings/mcp - all render the portal; the client root derives the tab.
export default function SettingsPage() {
  return <PortalRoot />;
}
