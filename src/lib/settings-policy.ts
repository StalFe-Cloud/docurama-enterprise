import type { SessionUser } from "@/lib/auth";
type Policy = "personal" | "admin" | "certificate";
export const SETTINGS_POLICY: Readonly<Record<string, Policy>> = Object.freeze({
  "save-profile":"personal", "save-signature":"personal", "signature.add":"personal",
  "signature.delete":"personal", "signature.default":"personal", "org.switch":"personal",
  "org.create":"personal", "password.change":"personal", "session.revoke":"personal",
  "session.revoke-others":"personal", "2fa.start":"personal", "2fa.enable":"personal", "2fa.disable":"personal",
  "save-org":"admin", "enforce-2fa":"admin", "domain.add":"admin", "domain.posture":"admin",
  "domain.verify":"admin", "domain.delete":"admin", "member.role":"admin", "invite-member":"admin",
  "invite-revoke":"admin", "remove-member":"admin", "team.create":"admin", "team.rename":"admin",
  "team.delete":"admin", "member.team":"admin", "tsa.save":"admin", "tsa.test":"admin",
  "part11.save":"admin", "esign.save":"admin", "notifications.save":"admin", "smtp.test":"admin",
  "reminders.run":"admin", "envelope.auto-remind":"admin", "sms.save":"admin", "sms.test":"admin",
  "create-key":"admin", "revoke-key":"admin", "webhook.create":"admin", "webhook.delete":"admin",
  "webhook.toggle":"admin", "mcp.save":"admin", "cert.create":"certificate", "cert.provision":"certificate",
  "cert.activate":"certificate", "cert.revoke":"certificate", "cert.delete":"certificate",
});
export function isWorkspaceAdmin(me: SessionUser): boolean {
  return me.workspaceRole === "OWNER" || me.workspaceRole === "ADMIN" || me.role === "PLATFORM_ADMIN";
}
/** Certificate handlers must additionally authorize the target resource. */
export function settingsOperationAllowed(me: SessionUser, operation: string): boolean {
  if (!Object.hasOwn(SETTINGS_POLICY, operation)) return false;
  return SETTINGS_POLICY[operation] !== "admin" || isWorkspaceAdmin(me);
}
