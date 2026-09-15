#!/usr/bin/env bash
# Task 7 — onboarding + signup + invitations API flow test.
# Exercises: signup, session, onboarding state/ops, email verification
# (demo + rate-limit), signature, org, invites, security skip, complete,
# invitation accept (new user via inviteToken), email-mismatch rejection,
# and the outbox/audit ledgers.
set -u
# The inline python helpers print check marks. Windows consoles default to
# cp1252, which cannot encode them, and the traceback was being counted as a
# product failure. Harmless everywhere else.
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"
BASE="${BASE:-http://localhost:3000}"
TS=$(date +%s)
EMAIL="onboard.$TS@example.com"
TEAMMATE="teammate.$TS@example.com"
OTHER="other.$TS@example.com"
PASS="Testpass1234"
PASS_COUNT=0; FAIL_COUNT=0

ok()   { PASS_COUNT=$((PASS_COUNT+1)); echo "  ✓ $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT+1)); echo "  ✗ $1"; }
check() { # check <desc> <expected-substr> <actual>
  if echo "$3" | grep -q "$2"; then ok "$1"; else fail "$1 — got: $(echo "$3" | head -c 220)"; fi
}
dbq() { python3 scripts/db-lookup.py "$1" "${2:-}"; }

echo "── 1. Signup (fresh account + org + session + verification email) ──"
R=$(curl -s -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d "{\"firstName\":\"Camille\",\"lastName\":\"Moreau\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"organization\":\"Moreau Consulting\",\"consent\":true}")
check "signup returns token" '"token"' "$R"
TOKEN=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[ -n "$TOKEN" ] && ok "session token extracted" || fail "no token"

R=$(curl -s -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d "{\"firstName\":\"Dup\",\"lastName\":\"Dup\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"organization\":\"X\",\"consent\":true}")
check "duplicate email rejected (409)" 'already exists' "$R"
R=$(curl -s -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d '{"firstName":"A","lastName":"B","email":"bad","password":"short","consent":true}')
check "validation errors" 'valid email' "$R"
R=$(curl -s -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d '{"firstName":"A","lastName":"B","email":"a@b.co","password":"x","consent":true}')
check "weak password rejected" 'at least 10 characters' "$R"

echo "── 2. Onboarding state (auth via Bearer) ──"
R=$(curl -s "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN")
check "authenticated state" '"authenticated":true' "$R"
check "email not yet verified" '"emailVerified":false' "$R"
check "org named (Moreau Consulting)" 'Moreau Consulting' "$R"
check "steps incomplete" '"completed":false' "$R"
R=$(curl -s "$BASE/api/onboarding")
check "unauth state" '"authenticated":false' "$R"

echo "── 3. Verification: demo verify + resend rate-limit ──"
# Signup itself issued a verification email seconds ago, so an immediate
# resend is correctly inside the 60s rate-limit window.
R=$(curl -s -X POST "$BASE/api/auth/resend-verification" -H "Authorization: Bearer $TOKEN")
check "resend rate-limited right after signup" 'wait a minute' "$R"
R=$(curl -s -X POST "$BASE/api/auth/resend-verification" -H "Authorization: Bearer $TOKEN")
check "resend still rate-limited (429)" 'wait a minute' "$R"
# demo verify (SMTP transport not configured — in-session shortcut)
R=$(curl -s -X POST "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"op":"verify.demo"}')
check "demo verify ok" 'verified' "$R"
R=$(curl -s "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN")
check "emailVerified now true" '"emailVerified":true' "$R"
# invalid verify token rejected
R=$(curl -s -X POST "$BASE/api/auth/verify-email" -H "Content-Type: application/json" -d '{"token":"deadbeefdeadbeefdeadbeef"}')
check "invalid verify token (410)" 'invalid' "$R"
# GET link flow with a real token from the DB (raw link is in the outbox)
LINK=$(dbq "SELECT linkUrl FROM MailOutbox WHERE toEmail='$EMAIL' AND template='SIGNUP_VERIFICATION' ORDER BY createdAt DESC LIMIT 1" "")
VTOKEN=$(echo "$LINK" | sed 's/.*verify=//')
R=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$BASE/api/auth/verify-email?token=$VTOKEN")
check "GET verify link redirects" '303' "$R"

echo "── 4. Org profile + signature ──"
R=$(curl -s -X POST "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"op":"org.update","data":{"name":"Moreau & Partners","industry":"Legal & Notary","companySize":"1-10"}}')
check "org update" 'Moreau & Partners' "$R"
R=$(curl -s -X POST "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"op":"signature.save","data":{"kind":"signature","method":"type","value":"Camille Moreau","font":"signature-font-caveat"}}')
check "signature save" 'Signature saved' "$R"
R=$(curl -s "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN")
check "signature step done" '"signature":true' "$R"

echo "── 5. Invitations ──"
R=$(curl -s -X POST "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"op\":\"invite.send\",\"data\":{\"email\":\"$TEAMMATE\",\"role\":\"ADMIN\"}}")
check "invite send" 'Invitation sent' "$R"
INV_TOKEN=$(dbq "SELECT token FROM Invitation WHERE email='$TEAMMATE' AND status='PENDING' ORDER BY createdAt DESC LIMIT 1" "")
[ -n "$INV_TOKEN" ] && ok "invitation token found in DB" || fail "invitation token missing"
R=$(curl -s "$BASE/api/invitations/$INV_TOKEN")
check "public invitation info" 'Moreau' "$R"
check "invited email shown" "$TEAMMATE" "$R"
R=$(curl -s -X POST "$BASE/api/invitations/$INV_TOKEN")
check "accept requires auth (401)" 'Sign in' "$R"
R=$(curl -s "$BASE/api/invitations/inv_doesnotexist123")
check "unknown invitation 404" 'not found' "$R"

echo "── 6. Security skip + complete ──"
R=$(curl -s -X POST "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"op":"security.skip"}')
check "security skip" 'Skipped for now' "$R"
R=$(curl -s -X POST "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"op":"complete"}')
check "complete" 'all set' "$R"
R=$(curl -s "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN")
check "completed flag" '"completed":true' "$R"

echo "── 7. Invitee signup via /welcome?invite=<token> ──"
R=$(curl -s -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d "{\"firstName\":\"Théo\",\"lastName\":\"Bernard\",\"email\":\"$TEAMMATE\",\"password\":\"$PASS\",\"consent\":true,\"inviteToken\":\"$INV_TOKEN\"}")
check "invitee signup joins org" '"token"' "$R"
ACCEPTED=$(dbq "SELECT COUNT(*) FROM Invitation WHERE email='$TEAMMATE' AND status='ACCEPTED'" "0")
[ "$ACCEPTED" = "1" ] && ok "invitation marked ACCEPTED" || fail "invitation not accepted"
R=$(curl -s "$BASE/api/invitations/$INV_TOKEN")
check "accepted invitation no longer PENDING" 'ACCEPTED' "$R"
MEMBER_COUNT=$(dbq "SELECT COUNT(*) FROM Member m JOIN User u ON u.id=m.userId JOIN Tenant t ON t.id=m.tenantId WHERE u.email='$TEAMMATE' AND t.name='Moreau & Partners'" "0")
[ "$MEMBER_COUNT" = "1" ] && ok "invitee is a member of the org" || fail "invitee membership missing ($MEMBER_COUNT)"

echo "── 8. Email-mismatch invitation rejection (fresh invite) ──"
R=$(curl -s -X POST "$BASE/api/onboarding" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"op\":\"invite.send\",\"data\":{\"email\":\"$OTHER\",\"role\":\"MEMBER\"}}")
check "fresh invite queued" 'Invitation sent' "$R"
INV_TOKEN3=$(dbq "SELECT token FROM Invitation WHERE email='$OTHER' AND status='PENDING' ORDER BY createdAt DESC LIMIT 1" "")
R=$(curl -s -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d "{\"firstName\":\"X\",\"lastName\":\"Y\",\"email\":\"wrong-$TS@example.com\",\"password\":\"$PASS\",\"consent\":true,\"inviteToken\":\"$INV_TOKEN3\"}")
check "mismatched invite email rejected" "sent to $OTHER" "$R"

echo "── 9. Settings API: pending invitations in GET + invite-member op ──"
R=$(curl -s "$BASE/api/workspace/settings" -H "Authorization: Bearer $TOKEN")
check "settings lists pending invitations" "$OTHER" "$R"
R=$(curl -s -X POST "$BASE/api/workspace/settings" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"op\":\"invite-member\",\"data\":{\"email\":\"hire.$TS@example.com\",\"role\":\"MEMBER\"}}")
check "settings invite-member uses real invitations" 'they create their own password' "$R"
R=$(curl -s "$BASE/api/workspace/settings" -H "Authorization: Bearer $TOKEN")
check "new invite visible in settings" "hire.$TS@example.com" "$R"

echo "── 10. Outbox ledger + audit trail ──"
python3 - << PYEOF
import sqlite3
con = sqlite3.connect('db/custom.db')
mails = con.execute("SELECT template, COUNT(*) FROM MailOutbox WHERE toEmail LIKE '%$TS%' GROUP BY template").fetchall()
print('outbox:', mails)
assert any(t == 'SIGNUP_VERIFICATION' for t, _ in mails), 'no verification emails'
assert any(t == 'TEAM_INVITE' for t, _ in mails), 'no invite emails'
audits = [a[0] for a in con.execute("SELECT action FROM AuditEvent ORDER BY at DESC LIMIT 12").fetchall()]
print('audit tail:', audits)
assert 'user.onboarding.completed' in audits
assert 'invite.sent' in audits
assert any(a.startswith('user.signup') for a in audits)
consents = con.execute("SELECT COUNT(*) FROM Consent WHERE subjectEmail='$EMAIL' AND purpose='tos_privacy_signup'").fetchone()[0]
assert consents == 1, 'GDPR consent row missing'
print('  ✓ outbox + audit + consent rows verified')
PYEOF
[ $? -eq 0 ] && PASS_COUNT=$((PASS_COUNT+1)) || fail "outbox/audit verification"

echo ""
echo "══ RESULT: $PASS_COUNT passed, $FAIL_COUNT failed ══"
exit $([ "$FAIL_COUNT" -eq 0 ] && echo 0 || echo 1)
