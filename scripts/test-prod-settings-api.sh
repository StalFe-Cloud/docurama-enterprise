#!/usr/bin/env bash
# Production-settings API test suite (run against the dev server on :3000)
set -u
# The inline python helpers print check marks. Windows consoles default to
# cp1252, which cannot encode them, and the traceback was being counted as a
# product failure. Harmless everywhere else.
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"
BASE="${BASE:-http://localhost:3000}"
PASS=0; FAIL=0

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1";
  else FAIL=$((FAIL+1)); echo "FAIL  $1 (expected=$2 got=$3)"; fi
}

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1], {'d': d}))" "$2" 2>/dev/null; }

# ── 1. Login (session) ──
LOGIN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"alex@stalfe.example","password":"demo1234"}')
TOKEN=$(echo "$LOGIN" | json - "d['token']")
[ -n "$TOKEN" ] && PASS=$((PASS+1)) && echo "PASS  login returns session token" || { FAIL=$((FAIL+1)); echo "FAIL  login token"; }

AUTH="Authorization: Bearer $TOKEN"

# ── 2. /api/auth/me with orgs ──
ME=$(curl -s $BASE/api/auth/me -H "$AUTH")
ORGS=$(echo "$ME" | json - "len(d['user']['orgs'])")
check "me returns 2 organizations for Alex" "2" "$ORGS"
ACTIVE=$(echo "$ME" | json - "d['user']['tenantName']")
check "active org is StålFe" "StålFe" "$ACTIVE"
SESSIONS=$(echo "$ME" | json - "d['user']['sessionId'] != None")
check "me exposes sessionId" "True" "$SESSIONS"

# ── 3. Settings sections ──
for SEC in settings settings-account settings-esign settings-notifications settings-sms settings-mcp; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/workspace/$SEC -H "$AUTH")
  check "GET /api/workspace/$SEC → 200" "200" "$CODE"
done

SIGS=$(curl -s $BASE/api/workspace/settings -H "$AUTH" | json - "len(d['signatures'])")
check "settings returns saved signatures array" "0" "$SIGS"
ADMINS=$(curl -s $BASE/api/workspace/settings-account -H "$AUTH" | json - "d['isAdmin']")
check "account section isAdmin=true" "True" "$ADMINS"
SESSCOUNT=$(curl -s $BASE/api/workspace/settings-account -H "$AUTH" | json - "len(d['sessions']) >= 1")
check "account section lists active sessions" "True" "$SESSCOUNT"
CERTS=$(curl -s $BASE/api/workspace/settings-esign -H "$AUTH" | json - "len(d['certificates'])")
check "esign section shows the demo certificate" "1" "$CERTS"
CERTSTATUS=$(curl -s $BASE/api/workspace/settings-esign -H "$AUTH" | json - "d['certificates'][0]['status']")
check "demo certificate is ACTIVE" "ACTIVE" "$CERTSTATUS"
NOTIFMODE=$(curl -s $BASE/api/workspace/settings-notifications -H "$AUTH" | json - "d['settings']['reminderMode'] in ('manual','user_job','platform_job')")
check "notifications reminderMode is a valid mode" "True" "$NOTIFMODE"
MCPTOOLS=$(curl -s $BASE/api/workspace/settings-mcp -H "$AUTH" | json - "len(d['tools'])")
check "mcp section lists 4 tools" "4" "$MCPTOOLS"

# ── 4. TOTP: start → verify fails with wrong code (honest 401) ──
TWOFA=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"2fa.start"}')
HASQR=$(echo "$TWOFA" | json - "'qrSvg' in d and 'secret' in d")
check "2fa.start returns QR svg + secret" "True" "$HASQR"
WRONG=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"2fa.enable","data":{"code":"000000"}}')
check "2fa.enable with wrong code → 401" "401" "$WRONG"

# ── 5. Certificates: create + provision with real OpenSSL ──
CERTCREATE=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"cert.create","data":{"commonName":"QA Test Cert","organization":"StålFe AB","days":90,"purpose":"signing"}}')
CERTID=$(echo "$CERTCREATE" | json - "d.get('id','')")
[ -n "$CERTID" ] && PASS=$((PASS+1)) && echo "PASS  cert.create returns id" || { FAIL=$((FAIL+1)); echo "FAIL  cert.create id"; }
CERTPROV=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d "{\"op\":\"cert.provision\",\"id\":\"$CERTID\",\"data\":{\"passphrase\":\"qa-test-passphrase-123\"}}")
PROVOK=$(echo "$CERTPROV" | json - "d.get('ok', False)")
check "cert.provision issues real OpenSSL certificate" "True" "$PROVOK"
P12=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/workspace/certificate/$CERTID/download -H "$AUTH")
check "certificate .p12 download → 200" "200" "$P12"
# revoke then delete to clean up
curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d "{\"op\":\"cert.revoke\",\"id\":\"$CERTID\"}" > /dev/null
curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d "{\"op\":\"cert.delete\",\"id\":\"$CERTID\"}" > /dev/null

# ── 6. Domain: add + verify (DoH will honestly report no TXT for .example) ──
DOMADD=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"domain.add","data":{"domain":"qa-check.example"}}')
DOMID=$(echo "$DOMADD" | json - "d.get('id','')")
[ -n "$DOMID" ] && PASS=$((PASS+1)) && echo "PASS  domain.add returns id" || { FAIL=$((FAIL+1)); echo "FAIL  domain.add"; }
DOMVERIFY=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d "{\"op\":\"domain.verify\",\"id\":\"$DOMID\"}")
DOMOK=$(echo "$DOMVERIFY" | json - "d.get('ok', None) is False")
check "domain.verify honestly reports unverified (.example has no TXT)" "True" "$DOMOK"
curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d "{\"op\":\"domain.delete\",\"id\":\"$DOMID\"}" > /dev/null

# ── 7. Notifications: save + reminder dry run ──
NSAVE=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"notifications.save","data":{"smtpFrom":"Docurama Sign <notifications@docurama.eu>","reminderMode":"platform_job","reminderIntervalDays":3,"reminderMaxCount":5,"digestTime":"09:00","quietHoursStart":"21:00","quietHoursEnd":"08:00","escalateAfterDays":7,"smtpPort":587}}')
NSAVEOK=$(echo "$NSAVE" | json - "d.get('ok', False)")
check "notifications.save persists reminder policy" "True" "$NSAVEOK"
DRYRUN=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"reminders.run"}')
DRYOK=$(echo "$DRYRUN" | json - "'due' in d and 'stats' in d")
check "reminders.run dry-run returns scan results" "True" "$DRYOK"

# ── 8. SMS: save + validate ──
SMSAVE=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"sms.save","data":{"provider":"telnyx","apiKey":"KEY_TEST_123","apiSecret":"secret-x","senderId":"DOCURAMA","lowCostMode":true,"whatsappEnabled":false}}')
SMSOK=$(echo "$SMSAVE" | json - "d.get('ok', False)")
check "sms.save stores Telnyx gateway config" "True" "$SMSOK"
SMSTEST=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"sms.test","data":{"to":"+33612345678"}}')
SMSTESTOK=$(echo "$SMSTEST" | json - "d.get('ok', False)")
check "sms.test validates configuration" "True" "$SMSTESTOK"
# reset gateway to twilio default
curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"sms.save","data":{"provider":"twilio","senderId":"DOCURAMA"}}' > /dev/null

# ── 9. API key → v1 API + MCP ──
KEYCREATE=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"create-key","data":{"name":"QA test key","scope":"FULL"}}')
FULLKEY=$(echo "$KEYCREATE" | json - "d.get('key','')")
[ -n "$FULLKEY" ] && PASS=$((PASS+1)) && echo "PASS  create-key returns full secret once" || { FAIL=$((FAIL+1)); echo "FAIL  create-key full secret"; }
V1LIST=$(curl -s $BASE/api/v1/envelopes?perPage=5 -H "X-API-Key: $FULLKEY")
V1TOTAL=$(echo "$V1LIST" | json - "d['total'] > 0")
check "GET /api/v1/envelopes with X-API-Key works" "True" "$V1TOTAL"
V1NOKEY=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/v1/envelopes)
check "GET /api/v1/envelopes without key → 401" "401" "$V1NOKEY"
V1VERIFY=$(curl -s $BASE/api/v1/verify/DOC-00HPE553)
V1VRES=$(echo "$V1VERIFY" | json - "d['result'] in ('VERIFIED','NOT_SEALED','VOIDED','NOT_FOUND')")
check "public GET /api/v1/verify/{code} works" "True" "$V1VRES"

# MCP: save enabled → initialize → tools/list → tools/call
MCPSAVE=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"mcp.save","data":{"enabled":true,"transport":"streamable-http","allowedTools":["envelope_list","document_verify","template_list","envelope_detail"],"rateLimitPerMin":60}}')
MCPEN=$(echo "$MCPSAVE" | json - "d.get('ok', False)")
check "mcp.save enables the server" "True" "$MCPEN"
MCPINIT=$(curl -s -X POST $BASE/api/mcp -H "X-API-Key: $FULLKEY" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}')
MCPPROTO=$(echo "$MCPINIT" | json - "d['result']['serverInfo']['name']")
check "MCP initialize handshake" "docurama" "$MCPPROTO"
MCPTOOLSLIST=$(curl -s -X POST $BASE/api/mcp -H "X-API-Key: $FULLKEY" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
MCPCOUNT=$(echo "$MCPTOOLSLIST" | json - "len(d['result']['tools'])")
check "MCP tools/list exposes 4 tools" "4" "$MCPCOUNT"
MCPCALL=$(curl -s -X POST $BASE/api/mcp -H "X-API-Key: $FULLKEY" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"document_verify","arguments":{"code":"DOC-00HPE553"}}}')
MCPTEXT=$(echo "$MCPCALL" | json - "d['result']['content'][0]['text'][:5]")
check "MCP tools/call document_verify executes" "NOT_S" "$MCPTEXT"
MCPNOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}')
check "MCP without key → 401" "401" "$MCPNOAUTH"

# ── 10. Org switch + password guard ──
# (reset reminder mode to manual first so re-runs start from the default)
curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"notifications.save","data":{"smtpFrom":"Docurama Sign <notifications@docurama.eu>","reminderMode":"manual","reminderIntervalDays":3,"reminderMaxCount":5,"digestTime":"09:00","quietHoursStart":"21:00","quietHoursEnd":"08:00","escalateAfterDays":7,"smtpPort":587}}' > /dev/null
AURORA_ID=$(echo "$ME" | json - "d['user']['orgs'][1]['id']")
SWITCH=$(curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d "{\"op\":\"org.switch\",\"data\":{\"tenantId\":\"$AURORA_ID\"}}")
SWITCHOK=$(echo "$SWITCH" | json - "d.get('ok', False)")
check "org.switch to Aurora Legal" "True" "$SWITCHOK"
AFTER=$(curl -s $BASE/api/auth/me -H "$AUTH" | json - "d['user']['tenantName']")
check "active org is now Aurora Legal" "Aurora Legal LLP" "$AFTER"
NWDATA=$(curl -s $BASE/api/workspace/overview -H "$AUTH" | json - "d['tenant']['name']")
check "workspace data re-scoped to Aurora" "Aurora Legal LLP" "$NWDATA"
# switch back
curl -s -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d "{\"op\":\"org.switch\",\"data\":{\"tenantId\":\"$(echo "$ME" | json - "d['user']['orgs'][0]['id']")\"}}" > /dev/null
BADPW=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/workspace/settings -H "$AUTH" -H "Content-Type: application/json" -d '{"op":"password.change","data":{"current":"wrong-password","next":"newpassword123"}}')
check "password.change with wrong current → 401" "401" "$BADPW"

# ── 11. Logout revokes the session ──
LOGOUT=$(curl -s -X POST $BASE/api/auth/logout -H "$AUTH")
AFTERLOGOUT=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/workspace/settings -H "$AUTH")
check "session revoked after logout → 401" "401" "$AFTERLOGOUT"

echo ""
echo "════ RESULT: $PASS passed, $FAIL failed ════"
[ "$FAIL" -eq 0 ]
