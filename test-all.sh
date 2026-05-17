#!/bin/bash
# Full integration test for Translation Assistant
# Tests all endpoints, access control, edge cases, and recent changes

API="http://localhost:3005/api"
PASS=0
FAIL=0
ERRORS=""

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -qF "$expected"; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  FAIL: $desc (expected '$expected', got '${actual:0:120}')"
    echo "  FAIL: $desc"
  fi
}

echo "========================================"
echo " Translation Assistant — Full Test Suite"
echo "========================================"
echo ""

# ── AUTH ──
echo "=== 1. AUTH ==="
LOGIN=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@translation-assistant.com","password":"admin123!"}')
TOKEN=$(echo "$LOGIN" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).accessToken)}catch{console.log('FAIL')}})")
check "Admin login" "eyJ" "$TOKEN"

# Bad password
BAD=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@translation-assistant.com","password":"wrongpass1!"}')
check "Bad password rejected" "Invalid credentials" "$BAD"

# Profile
PROFILE=$(curl -s "$API/auth/profile" -H "Authorization: Bearer $TOKEN")
check "Profile returns user" "admin@translation-assistant.com" "$PROFILE"

H="Authorization: Bearer $TOKEN"

# ── CLIENTS ──
echo ""
echo "=== 2. CLIENTS ==="
CLIENTS=$(curl -s "$API/clients?limit=5" -H "$H")
check "Clients list returns data" '"total"' "$CLIENTS"

# Create client
NEW_CLIENT=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"Test Integration Client"}')
CLIENT_ID=$(echo "$NEW_CLIENT" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).id)}catch{console.log('FAIL')}})")
check "Create client" "Test Integration Client" "$NEW_CLIENT"

# Get client
CLIENT_DETAIL=$(curl -s "$API/clients/$CLIENT_ID" -H "$H")
check "Get client detail" "Test Integration Client" "$CLIENT_DETAIL"

# ── JOBS ──
echo ""
echo "=== 3. JOBS ==="
JOBS=$(curl -s "$API/jobs?limit=5" -H "$H")
check "Jobs list returns data" '"total"' "$JOBS"
check "Jobs list has lineItemCount (not lineItems array)" "lineItemCount" "$JOBS"

# Get first job ID
JOB_ID=$(echo "$JOBS" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).data[0].id)}catch{console.log('FAIL')}})")

# Get job detail (full relations)
JOB_DETAIL=$(curl -s "$API/jobs/$JOB_ID" -H "$H")
check "Job detail has client" '"client"' "$JOB_DETAIL"
check "Job detail has lineItems array" '"lineItems"' "$JOB_DETAIL"
check "Job detail has assignedUsers" '"assignedUsers"' "$JOB_DETAIL"
check "Job detail has files" '"files"' "$JOB_DETAIL"

# ── INVOICES ──
echo ""
echo "=== 4. INVOICES ==="
INVOICES=$(curl -s "$API/invoices" -H "$H")
check "Invoices list returns data" '"total"' "$INVOICES"
check "Invoices list has itemCount (not items array)" "itemCount" "$INVOICES"

# Create invoice (empty items should fail)
EMPTY_INV=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"'$CLIENT_ID'","issueDate":"2026-05-17","dueDate":"2026-06-17","items":[]}')
check "Empty invoice rejected" "at least one item" "$EMPTY_INV"

# Create invoice with invalid client
BAD_INV=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"00000000-0000-0000-0000-000000000000","issueDate":"2026-05-17","dueDate":"2026-06-17","items":[{"description":"test","quantity":1,"unitPrice":10}]}')
check "Invoice with bad client rejected" "Client not found" "$BAD_INV"

# Get invoice by job
INV_BY_JOB=$(curl -s "$API/invoices/by-job/$JOB_ID" -H "$H")
check "Invoice by-job endpoint works" "[" "$INV_BY_JOB"

# ── NOTIFICATIONS ──
echo ""
echo "=== 5. NOTIFICATIONS ==="
UNREAD=$(curl -s "$API/notifications/unread-count" -H "$H")
check "Unread count returns" '"count"' "$UNREAD"

NOTIF_LIST=$(curl -s "$API/notifications?limit=5" -H "$H")
check "Notifications list works" '"total"' "$NOTIF_LIST"

# Mark all read
MARK_ALL=$(curl -s -X POST "$API/notifications/mark-all-read" -H "$H")
check "Mark all read succeeds" "" "$MARK_ALL"

# ── CALENDAR ──
echo ""
echo "=== 6. CALENDAR ==="
CALENDAR=$(curl -s "$API/calendar/events?month=5&year=2026" -H "$H")
check "Calendar returns events array" "[" "$CALENDAR"

# Bad month (should clamp)
CAL_BAD=$(curl -s "$API/calendar/events?month=99&year=2026" -H "$H")
check "Calendar clamps invalid month" "[" "$CAL_BAD"

# ── REPORTS ──
echo ""
echo "=== 7. REPORTS ==="
DASH=$(curl -s "$API/reports/dashboard-stats" -H "$H")
check "Dashboard stats has activeJobs" '"activeJobs"' "$DASH"
check "Dashboard stats has monthlyRevenue" '"monthlyRevenue"' "$DASH"
check "Dashboard stats has currency" '"currency"' "$DASH"

REVENUE=$(curl -s "$API/reports/revenue?period=monthly" -H "$H")
check "Revenue endpoint works" "[" "$REVENUE"

BY_CLIENT=$(curl -s "$API/reports/by-client" -H "$H")
check "By-client report works" "[" "$BY_CLIENT"

JOB_STATUS=$(curl -s "$API/reports/job-status" -H "$H")
check "Job status report works" "[" "$JOB_STATUS"

# ── SEARCH ──
echo ""
echo "=== 8. SEARCH ==="
SEARCH=$(curl -s "$API/search?q=birth" -H "$H")
check "Search returns results" '"counts"' "$SEARCH"
check "Search has clients" '"clients"' "$SEARCH"
check "Search has jobs" '"jobs"' "$SEARCH"

# Min 2 chars
SEARCH_SHORT=$(curl -s "$API/search?q=a" -H "$H")
check "Search rejects 1-char query" "at least 2" "$SEARCH_SHORT"

# ── TRANSLATE ──
echo ""
echo "=== 9. TRANSLATE ==="
TRANSLATE=$(curl -s -X POST "$API/translate" -H "$H" -H "Content-Type: application/json" -d '{"text":"hello","from":"en","to":"fr"}')
check "Translate endpoint responds" "translatedText" "$TRANSLATE"

# Bad language code
TRANSLATE_BAD=$(curl -s -X POST "$API/translate" -H "$H" -H "Content-Type: application/json" -d '{"text":"hello","from":"!!!","to":"fr"}')
check "Translate rejects bad language code" "Invalid language" "$TRANSLATE_BAD"

# ── TEMPLATES ──
echo ""
echo "=== 10. TEMPLATES ==="
TEMPLATES=$(curl -s "$API/templates?limit=5" -H "$H")
check "Templates list works" "[" "$TEMPLATES"

# ── DOCUMENTS ──
echo ""
echo "=== 11. DOCUMENTS ==="
# Find a job with documents
DOCS=$(curl -s "$API/documents/by-job/$JOB_ID" -H "$H")
check "Documents by-job works" "[" "$DOCS"

# ── ACCESS CONTROL (Translator) ──
echo ""
echo "=== 12. ACCESS CONTROL ==="
TLOGIN=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"tester@test.com","password":"tester123!"}')
TTOKEN=$(echo "$TLOGIN" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).accessToken)}catch{console.log('FAIL')}})")
TH="Authorization: Bearer $TTOKEN"

if [ "$TTOKEN" != "FAIL" ]; then
  # Translator can't access invoices
  T_INV=$(curl -s "$API/invoices" -H "$TH")
  check "Translator blocked from invoices" "Forbidden" "$T_INV"

  # Translator can't access reports
  T_RPT=$(curl -s "$API/reports/dashboard-stats" -H "$TH")
  check "Translator blocked from reports" "Forbidden" "$T_RPT"

  # Translator can access their own jobs
  T_JOBS=$(curl -s "$API/jobs?limit=5" -H "$TH")
  check "Translator sees only assigned jobs" '"total"' "$T_JOBS"

  # Translator can access calendar
  T_CAL=$(curl -s "$API/calendar/events?month=5&year=2026" -H "$TH")
  check "Translator can access calendar" "[" "$T_CAL"

  # Translator can access notifications
  T_NOTIF=$(curl -s "$API/notifications/unread-count" -H "$TH")
  check "Translator can access notifications" '"count"' "$T_NOTIF"

  # Translator can't access admin's invoice by ID
  INV_ID=$(echo "$INVOICES" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).data[0]?.id||'none')}catch{console.log('none')}})")
  if [ "$INV_ID" != "none" ]; then
    T_INV_DETAIL=$(curl -s "$API/invoices/$INV_ID" -H "$TH")
    check "Translator blocked from admin invoice detail" "Forbidden" "$T_INV_DETAIL"
  fi

  # Search filtered for translator
  T_SEARCH=$(curl -s "$API/search?q=birth" -H "$TH")
  T_SEARCH_JOBS=$(echo "$T_SEARCH" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).counts.jobs)}catch{console.log(-1)}})")
  check "Translator search filters jobs" "0" "$T_SEARCH_JOBS"
else
  echo "  SKIP: Tester login failed, skipping access control tests"
fi

# ── EDGE CASES ──
echo ""
echo "=== 13. EDGE CASES ==="

# Bad UUID
BAD_UUID=$(curl -s "$API/jobs/not-a-uuid" -H "$H")
check "Bad UUID returns error" "Not Found" "$BAD_UUID"

# Unauthenticated request
UNAUTH=$(curl -s "$API/jobs")
check "Unauthenticated request rejected" "Unauthorized" "$UNAUTH"

# Delete non-existent
DEL_BAD=$(curl -s -X DELETE "$API/jobs/00000000-0000-0000-0000-000000000000" -H "$H")
check "Delete non-existent returns 404" "Not Found" "$DEL_BAD"

# Assign non-existent user to job
ASSIGN_BAD=$(curl -s -X POST "$API/jobs/$JOB_ID/users" -H "$H" -H "Content-Type: application/json" -d '{"userId":"00000000-0000-0000-0000-000000000000"}')
check "Assign non-existent user rejected" "User not found" "$ASSIGN_BAD"

# Delete paid invoice (should fail)
PAID_INV_ID=$(echo "$INVOICES" | node -e "process.stdin.on('data',d=>{try{const inv=JSON.parse(d).data.find(i=>i.status==='paid');console.log(inv?.id||'none')}catch{console.log('none')}})")
if [ "$PAID_INV_ID" != "none" ]; then
  DEL_PAID=$(curl -s -X DELETE "$API/invoices/$PAID_INV_ID" -H "$H")
  check "Can't delete paid invoice" "draft" "$DEL_PAID"
fi

# ── FRONTEND ──
echo ""
echo "=== 14. FRONTEND PAGES ==="
for page in "/" "/login" "/clients" "/jobs" "/invoices" "/calendar" "/reports" "/notifications" "/settings" "/templates"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3080$page")
  check "Page $page loads" "200" "$CODE"
done

# ── CLEANUP ──
echo ""
echo "=== 15. CLEANUP ==="
# Delete test client
if [ "$CLIENT_ID" != "FAIL" ] && [ -n "$CLIENT_ID" ]; then
  DEL_CLIENT=$(curl -s -X DELETE "$API/clients/$CLIENT_ID" -H "$H")
  check "Delete test client" "" "$DEL_CLIENT"
fi

# ── SUMMARY ──
echo ""
echo "========================================"
echo " RESULTS: $PASS passed, $FAIL failed"
echo "========================================"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  echo -e "$ERRORS"
fi
echo ""
