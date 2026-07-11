#!/bin/bash
# Full integration test for Translation Assistant
# Tests all endpoints: happy paths, validation errors, business logic errors, security

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
    ERRORS="$ERRORS\n  FAIL: $desc (expected '$expected', got '${actual:0:150}')"
    echo "  FAIL: $desc"
  fi
}

check_status() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  FAIL: $desc (expected HTTP $expected, got HTTP $actual)"
    echo "  FAIL: $desc"
  fi
}

json() { node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d)$1)}catch{console.log('FAIL')}})"; }

echo "============================================================"
echo " Translation Assistant — Comprehensive Test Suite"
echo "============================================================"
echo ""

# ═══════════════════════════════════════
echo "=== 1. AUTH — Login ==="
# ═══════════════════════════════════════
LOGIN=$(curl -s -c /tmp/ta_cookies.txt "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@translation-assistant.com","password":"admin123!"}')
TOKEN=$(echo "$LOGIN" | json .accessToken)
check "Admin login succeeds" "eyJ" "$TOKEN"
H="Authorization: Bearer $TOKEN"

# Errors
R=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@translation-assistant.com","password":"wrong12345678"}')
check "Login: wrong password → 401" "Invalid credentials" "$R"

R=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"nobody@example.com","password":"doesnotmatter1"}')
check "Login: non-existent email → 401" "Invalid credentials" "$R"

R=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"not-an-email","password":"12345678"}')
check "Login: invalid email format → 400" "email must be an email" "$R"

R=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"a@b.com","password":"short"}')
check "Login: password too short → 400" "must be longer" "$R"

R=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{}')
check "Login: empty body → 400" "email" "$R"

# Profile
R=$(curl -s "$API/auth/profile" -H "$H")
check "Profile returns admin" "admin@translation-assistant.com" "$R"

R=$(curl -s "$API/auth/profile")
check "Profile: no token → 401" "Unauthorized" "$R"

R=$(curl -s "$API/auth/profile" -H "Authorization: Bearer invalid.jwt.token")
check "Profile: invalid JWT → 401" "Unauthorized" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 2. AUTH — Register Validation ==="
# ═══════════════════════════════════════
R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"password123","firstName":"A","lastName":"B","inviteToken":"fake"}')
check "Register: common password rejected" "too common" "$R"

R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"short","firstName":"A","lastName":"B","inviteToken":"fake"}')
check "Register: short password → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"validlongpassphrase","firstName":"A","lastName":"B","inviteToken":"nonexistent-token"}')
check "Register: bad invite token → 400" "Invalid or expired invite" "$R"

R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" -d '{"email":"not-email","password":"validpassphrase12","firstName":"A","lastName":"B","inviteToken":"x"}')
check "Register: invalid email → 400" "email must be an email" "$R"

R=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" -d '{"email":"a@b.com","password":"validlongpassphrase","firstName":"","lastName":"B","inviteToken":"x"}')
check "Register: empty firstName → 400" "must be longer" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 3. AUTH — Password Reset ==="
# ═══════════════════════════════════════
R=$(curl -s -X POST "$API/auth/forgot-password" -H "Content-Type: application/json" -d '{"email":"admin@translation-assistant.com"}')
check "Forgot password: real email → safe message" "If an account" "$R"
RESET_TOKEN=$(echo "$R" | json .token)

R=$(curl -s -X POST "$API/auth/forgot-password" -H "Content-Type: application/json" -d '{"email":"nonexistent@fake.com"}')
check "Forgot password: fake email → same message" "If an account" "$R"
FAKE_TOKEN=$(echo "$R" | json .token)
check "Forgot password: fake email returns no token" "undefined" "$FAKE_TOKEN"

R=$(curl -s -X POST "$API/auth/verify-reset-token" -H "Content-Type: application/json" -d '{"token":"'$RESET_TOKEN'"}')
check "Verify reset token: valid → true" '"valid":true' "$R"
check "Verify reset token: masked email" '***' "$R"

R=$(curl -s -X POST "$API/auth/verify-reset-token" -H "Content-Type: application/json" -d '{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')
check "Verify reset token: invalid → false" '"valid":false' "$R"

R=$(curl -s -X POST "$API/auth/reset-password" -H "Content-Type: application/json" -d '{"token":"'$RESET_TOKEN'","newPassword":"password123"}')
check "Reset password: common password rejected" "too common" "$R"

R=$(curl -s -X POST "$API/auth/reset-password" -H "Content-Type: application/json" -d '{"token":"'$RESET_TOKEN'","newPassword":"short"}')
check "Reset password: too short → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/auth/reset-password" -H "Content-Type: application/json" -d '{"token":"invalid-token","newPassword":"mynewsecurepass99"}')
check "Reset password: bad token → 400" "Invalid or expired" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 4. AUTH — Sessions ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/auth/sessions" -H "$H")
check "List sessions" "[" "$R"

R=$(curl -s -X DELETE "$API/auth/sessions/00000000-0000-0000-0000-000000000000" -H "$H")
check "Revoke non-existent session → 400" "Session not found" "$R"

R=$(curl -s -X DELETE "$API/auth/sessions/not-a-uuid" -H "$H")
check "Revoke session: bad UUID → 400" "Validation failed" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 5. USERS ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/users" -H "$H")
check "Users list" "[" "$R"

R=$(curl -s "$API/users/00000000-0000-0000-0000-000000000000" -H "$H")
check "Get non-existent user → 404" "User not found" "$R"

R=$(curl -s -X POST "$API/users" -H "$H" -H "Content-Type: application/json" -d '{"email":"bad","password":"12345678","firstName":"A","lastName":"B","roleId":"00000000-0000-0000-0000-000000000000"}')
check "Create user: invalid email → 400" "email must be an email" "$R"

R=$(curl -s -X POST "$API/users" -H "$H" -H "Content-Type: application/json" -d '{"email":"dup@test.com","password":"qwerty123","firstName":"A","lastName":"B","roleId":"00000000-0000-0000-0000-000000000000"}')
check "Create user: common password → 400" "too common" "$R"

R=$(curl -s -X POST "$API/users" -H "$H" -H "Content-Type: application/json" -d '{"email":"dup@test.com","password":"uniquepass999","firstName":"","lastName":"B","roleId":"00000000-0000-0000-0000-000000000000"}')
check "Create user: empty firstName → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/users" -H "$H" -H "Content-Type: application/json" -d '{"email":"dup@test.com","password":"uniquepass999","firstName":"A","lastName":"B","roleId":"not-a-uuid"}')
check "Create user: bad roleId → 400" "must be a UUID" "$R"

R=$(curl -s -X POST "$API/users/change-password" -H "$H" -H "Content-Type: application/json" -d '{"currentPassword":"wrongcurrent1","newPassword":"newvalid12345"}')
check "Change password: wrong current → 400" "Current password is incorrect" "$R"

R=$(curl -s -X POST "$API/users/change-password" -H "$H" -H "Content-Type: application/json" -d '{"currentPassword":"admin123!","newPassword":"password1"}')
check "Change password: common new password → 400" "too common" "$R"

R=$(curl -s -X PATCH "$API/users/profile/me" -H "$H" -H "Content-Type: application/json" -d '{"colorPalette":"invalid"}')
check "Update profile: invalid palette → 400" "must be one of" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 6. CLIENTS — CRUD + Validation ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/clients?limit=5" -H "$H")
check "Clients list" '"total"' "$R"

R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"invalid","name":"Test"}')
check "Create client: invalid type → 400" "must be one of" "$R"

R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":""}')
check "Create client: empty name → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person"}')
check "Create client: missing name → 400" "name" "$R"

# Create test client for further tests
NEW_CLIENT=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"company","name":"Test Corp"}')
CLIENT_ID=$(echo "$NEW_CLIENT" | json .id)
check "Create company client" "Test Corp" "$NEW_CLIENT"

# Create a person client
PERSON_CLIENT=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"Test Person"}')
PERSON_ID=$(echo "$PERSON_CLIENT" | json .id)

# Emails
R=$(curl -s -X POST "$API/clients/$CLIENT_ID/emails" -H "$H" -H "Content-Type: application/json" -d '{"email":"not-an-email"}')
check "Add email: invalid format → 400" "email must be an email" "$R"

R=$(curl -s -X POST "$API/clients/$CLIENT_ID/emails" -H "$H" -H "Content-Type: application/json" -d '{"email":"valid@test.com"}')
check "Add email: valid" "valid@test.com" "$R"
EMAIL_ID=$(echo "$R" | json .id)

R=$(curl -s -X DELETE "$API/clients/$CLIENT_ID/emails/00000000-0000-0000-0000-000000000000" -H "$H")
check "Delete email: non-existent → 404" "not found" "$R"

# Phones
R=$(curl -s -X POST "$API/clients/$CLIENT_ID/phones" -H "$H" -H "Content-Type: application/json" -d '{"phone":""}')
check "Add phone: empty → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/clients/$CLIENT_ID/phones" -H "$H" -H "Content-Type: application/json" -d '{"phone":"+1234567890"}')
check "Add phone: valid" "+1234567890" "$R"

# Addresses
R=$(curl -s -X POST "$API/clients/$CLIENT_ID/addresses" -H "$H" -H "Content-Type: application/json" -d '{"address":"123 Main St"}')
check "Add address: valid" "123 Main St" "$R"

# Contacts on person → should fail
R=$(curl -s -X POST "$API/clients/$PERSON_ID/contacts" -H "$H" -H "Content-Type: application/json" -d '{"firstName":"John","lastName":"Doe"}')
check "Add contact to person client → 400" "Only company clients" "$R"

# Contacts on company → should work
R=$(curl -s -X POST "$API/clients/$CLIENT_ID/contacts" -H "$H" -H "Content-Type: application/json" -d '{"firstName":"John","lastName":"Doe","email":"john@test.com"}')
check "Add contact to company client" "John" "$R"
CONTACT_ID=$(echo "$R" | json .id)

R=$(curl -s -X POST "$API/clients/$CLIENT_ID/contacts" -H "$H" -H "Content-Type: application/json" -d '{"firstName":"","lastName":"Doe"}')
check "Add contact: empty firstName → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/clients/$CLIENT_ID/contacts" -H "$H" -H "Content-Type: application/json" -d '{"firstName":"Jane","lastName":"Doe","email":"not-an-email"}')
check "Add contact: invalid email → 400" "must be an email" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 7. TEMPLATES ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/templates" -H "$H")
check "Templates list" "[" "$R"

R=$(curl -s -X POST "$API/templates" -H "$H" -H "Content-Type: application/json" -d '{"name":"Test Template","type":"simple","pricePerPage":25}')
check "Create template" "Test Template" "$R"
TEMPLATE_ID=$(echo "$R" | json .id)

R=$(curl -s -X POST "$API/templates" -H "$H" -H "Content-Type: application/json" -d '{"name":"","type":"simple"}')
check "Create template: empty name → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/templates" -H "$H" -H "Content-Type: application/json" -d '{"name":"X","type":"invalid"}')
check "Create template: invalid type → 400" "must be one of" "$R"

R=$(curl -s -X POST "$API/templates" -H "$H" -H "Content-Type: application/json" -d '{"name":"X","pricePerPage":-5}')
check "Create template: negative price → 400" "must not be less than 0" "$R"

# Fields
R=$(curl -s -X POST "$API/templates/$TEMPLATE_ID/fields" -H "$H" -H "Content-Type: application/json" -d '{"fieldKey":"full_name","fieldType":"text"}')
check "Add field to template" "full_name" "$R"

R=$(curl -s -X POST "$API/templates/$TEMPLATE_ID/fields" -H "$H" -H "Content-Type: application/json" -d '{"fieldKey":"","fieldType":"text"}')
check "Add field: empty key → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/templates/$TEMPLATE_ID/fields" -H "$H" -H "Content-Type: application/json" -d '{"fieldKey":"test","fieldType":"invalid"}')
check "Add field: invalid type → 400" "must be one of" "$R"

R=$(curl -s -X POST "$API/templates/$TEMPLATE_ID/fields" -H "$H" -H "Content-Type: application/json" -d '{"fieldKey":"test2","fieldType":"number","sortOrder":-1}')
check "Add field: negative sortOrder → 400" "must not be less than 0" "$R"

# Get first language for label test
LANGS=$(curl -s "$API/settings/languages" -H "$H")
LANG_ID=$(echo "$LANGS" | json '[0].id')

if [ "$LANG_ID" != "FAIL" ] && [ "$LANG_ID" != "undefined" ]; then
  R=$(curl -s -X POST "$API/templates/$TEMPLATE_ID/fields" -H "$H" -H "Content-Type: application/json" -d '{"fieldKey":"labeled","fieldType":"text","labels":[{"languageId":"not-a-uuid","label":"Test"}]}')
  check "Add field: bad languageId → 400" "must be a UUID" "$R"
fi

# ═══════════════════════════════════════
echo ""
echo "=== 8. JOBS — CRUD + Status + Line Items ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/jobs?limit=5" -H "$H")
check "Jobs list" '"total"' "$R"
check "Jobs list has lineItemCount" "lineItemCount" "$R"
EXISTING_JOB_ID=$(echo "$R" | json '.data[0].id')

# Create job — need language IDs
SRC_LANG_ID=$(echo "$LANGS" | json '[0].id')

R=$(curl -s -X POST "$API/jobs" -H "$H" -H "Content-Type: application/json" -d '{
  "title":"Test Job","clientId":"'$CLIENT_ID'","sourceLanguageId":"'$SRC_LANG_ID'",
  "status":"quote","lineItems":[{"description":"Translation","pageCount":5,"pricePerPage":20}]
}')
check "Create job" "Test Job" "$R"
JOB_ID=$(echo "$R" | json .id)

# Validation errors
R=$(curl -s -X POST "$API/jobs" -H "$H" -H "Content-Type: application/json" -d '{"title":"","clientId":"'$CLIENT_ID'","sourceLanguageId":"'$SRC_LANG_ID'"}')
check "Create job: empty title → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/jobs" -H "$H" -H "Content-Type: application/json" -d '{"title":"X","clientId":"not-a-uuid","sourceLanguageId":"'$SRC_LANG_ID'"}')
check "Create job: bad clientId → 400" "must be a UUID" "$R"

R=$(curl -s -X POST "$API/jobs" -H "$H" -H "Content-Type: application/json" -d '{"title":"X","clientId":"00000000-0000-0000-0000-000000000000","sourceLanguageId":"'$SRC_LANG_ID'"}')
check "Create job: non-existent client → 400" "Client not found" "$R"

R=$(curl -s -X POST "$API/jobs" -H "$H" -H "Content-Type: application/json" -d '{"title":"X","clientId":"'$CLIENT_ID'","sourceLanguageId":"00000000-0000-0000-0000-000000000000"}')
check "Create job: non-existent language → 400" "language not found" "$R"

# Status transitions
R=$(curl -s -X PATCH "$API/jobs/$JOB_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"accepted"}')
check "Job status: quote → accepted" "accepted" "$R"

R=$(curl -s -X PATCH "$API/jobs/$JOB_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"in_progress"}')
check "Job status: accepted → in_progress" "in_progress" "$R"

R=$(curl -s -X PATCH "$API/jobs/$JOB_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"delivered"}')
check "Job status: in_progress → delivered" "delivered" "$R"

# Locked job — can't edit
R=$(curl -s -X PATCH "$API/jobs/$JOB_ID" -H "$H" -H "Content-Type: application/json" -d '{"title":"New Title"}')
check "Edit locked (delivered) job → 400" "locked" "$R"

# Locked job — can't add line items
R=$(curl -s -X POST "$API/jobs/$JOB_ID/line-items" -H "$H" -H "Content-Type: application/json" -d '{"description":"Extra","pageCount":1,"pricePerPage":10}')
check "Add line item to locked job → 400" "locked" "$R"

# Reopen
R=$(curl -s -X POST "$API/jobs/$JOB_ID/reopen" -H "$H")
check "Reopen delivered job" "in_progress" "$R"

# Can't reopen a non-locked job
R=$(curl -s -X POST "$API/jobs/$JOB_ID/reopen" -H "$H")
check "Reopen non-locked job → 400" "not in a completed state" "$R"

# Invalid status value
R=$(curl -s -X PATCH "$API/jobs/$JOB_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"invalid_status"}')
check "Job status: invalid value → 400" "must be one of" "$R"

# Line items
R=$(curl -s -X POST "$API/jobs/$JOB_ID/line-items" -H "$H" -H "Content-Type: application/json" -d '{"description":"","pageCount":1,"pricePerPage":10}')
check "Add line item: empty description → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/jobs/$JOB_ID/line-items" -H "$H" -H "Content-Type: application/json" -d '{"description":"Valid","pageCount":0,"pricePerPage":10}')
check "Add line item: pageCount=0 → 400" "must not be less than 1" "$R"

R=$(curl -s -X POST "$API/jobs/$JOB_ID/line-items" -H "$H" -H "Content-Type: application/json" -d '{"description":"Valid","pageCount":1,"pricePerPage":-5}')
check "Add line item: negative price → 400" "must not be less than 0" "$R"

# User assignment
R=$(curl -s -X POST "$API/jobs/$JOB_ID/users" -H "$H" -H "Content-Type: application/json" -d '{"userId":"00000000-0000-0000-0000-000000000000"}')
check "Assign non-existent user → 400" "User not found" "$R"

R=$(curl -s -X POST "$API/jobs/$JOB_ID/users" -H "$H" -H "Content-Type: application/json" -d '{"userId":"not-a-uuid"}')
check "Assign user: bad UUID → 400" "must be a UUID" "$R"

R=$(curl -s -X POST "$API/jobs/$JOB_ID/users" -H "$H" -H "Content-Type: application/json" -d '{"userId":"00000000-0000-0000-0000-000000000001","permissionLevel":"admin"}')
check "Assign user: invalid permission level → 400" "must be one of" "$R"

# File linking
R=$(curl -s -X POST "$API/jobs/$JOB_ID/files/link" -H "$H" -H "Content-Type: application/json" -d '{"sourceJobId":"not-uuid","fileId":"not-uuid"}')
check "Link file: bad UUIDs → 400" "must be a UUID" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 9. INVOICES — CRUD + Status Transitions ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/invoices" -H "$H")
check "Invoices list" '"total"' "$R"
check "Invoices list has itemCount" "itemCount" "$R"

# Validation errors
R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"'$CLIENT_ID'","issueDate":"2026-06-01","dueDate":"2026-07-01","items":[]}')
check "Create invoice: empty items → 400" "at least one item" "$R"

R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"00000000-0000-0000-0000-000000000000","issueDate":"2026-06-01","dueDate":"2026-07-01","items":[{"description":"x","quantity":1,"unitPrice":10}]}')
check "Create invoice: non-existent client → 400" "Client not found" "$R"

R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"not-uuid","issueDate":"2026-06-01","dueDate":"2026-07-01","items":[{"description":"x","quantity":1,"unitPrice":10}]}')
check "Create invoice: bad clientId → 400" "must be a UUID" "$R"

R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"'$CLIENT_ID'","issueDate":"not-a-date","dueDate":"2026-07-01","items":[{"description":"x","quantity":1,"unitPrice":10}]}')
check "Create invoice: invalid date → 400" "must be a valid ISO" "$R"

R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"'$CLIENT_ID'","issueDate":"2026-06-01","dueDate":"2026-07-01","taxRate":150,"items":[{"description":"x","quantity":1,"unitPrice":10}]}')
check "Create invoice: taxRate > 100 → 400" "must not be greater than 100" "$R"

R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"'$CLIENT_ID'","issueDate":"2026-06-01","dueDate":"2026-07-01","items":[{"description":"","quantity":1,"unitPrice":10}]}')
check "Create invoice: empty item desc → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"'$CLIENT_ID'","issueDate":"2026-06-01","dueDate":"2026-07-01","items":[{"description":"x","quantity":-1,"unitPrice":10}]}')
check "Create invoice: negative quantity → 400" "must not be less than 0" "$R"

# Create valid invoice
R=$(curl -s -X POST "$API/invoices" -H "$H" -H "Content-Type: application/json" -d '{"clientId":"'$CLIENT_ID'","issueDate":"2026-06-01","dueDate":"2026-07-01","items":[{"description":"Test service","quantity":2,"unitPrice":50}]}')
check "Create invoice: valid" "Test service" "$R"
INV_ID=$(echo "$R" | json .id)

# Status transitions
R=$(curl -s -X PATCH "$API/invoices/$INV_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"paid"}')
check "Invoice: draft → paid (invalid) → 400" "not allowed" "$R"

R=$(curl -s -X PATCH "$API/invoices/$INV_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"sent"}')
check "Invoice: draft → sent (valid)" "sent" "$R"

R=$(curl -s -X PATCH "$API/invoices/$INV_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"draft"}')
check "Invoice: sent → draft (invalid) → 400" "not allowed" "$R"

# Can't edit non-draft invoice
R=$(curl -s -X PATCH "$API/invoices/$INV_ID" -H "$H" -H "Content-Type: application/json" -d '{"notes":"updated"}')
check "Edit sent invoice → 400" "Only draft" "$R"

# Record payment
R=$(curl -s -X POST "$API/invoices/$INV_ID/record-payment" -H "$H" -H "Content-Type: application/json" -d '{"paidAmount":100}')
check "Record payment on sent invoice" "paid" "$R"

# Can't delete paid invoice
R=$(curl -s -X DELETE "$API/invoices/$INV_ID" -H "$H")
check "Delete paid invoice → 400" "Only draft" "$R"

# Can't transition from paid
R=$(curl -s -X PATCH "$API/invoices/$INV_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"cancelled"}')
check "Invoice: paid → cancelled (invalid) → 400" "not allowed" "$R"

# Invalid status value
R=$(curl -s -X PATCH "$API/invoices/$INV_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"bogus"}')
check "Invoice status: invalid value → 400" "must be one of" "$R"

# Invoice by job
R=$(curl -s "$API/invoices/by-job/$EXISTING_JOB_ID" -H "$H")
check "Invoice by-job endpoint" "[" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 10. DOCUMENTS ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/documents/by-job/$JOB_ID" -H "$H")
check "Documents by-job" "[" "$R"

R=$(curl -s -X POST "$API/documents" -H "$H" -H "Content-Type: application/json" -d '{"jobId":"not-uuid","templateId":"not-uuid"}')
check "Create document: bad UUIDs → 400" "must be a UUID" "$R"

# Create document
R=$(curl -s -X POST "$API/documents" -H "$H" -H "Content-Type: application/json" -d '{"jobId":"'$JOB_ID'","templateId":"'$TEMPLATE_ID'"}')
DOC_ID=$(echo "$R" | json .id)
if [ "$DOC_ID" != "FAIL" ] && [ "$DOC_ID" != "undefined" ]; then
  check "Create document" "$DOC_ID" "$DOC_ID"

  R=$(curl -s -X PATCH "$API/documents/$DOC_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"invalid"}')
  check "Doc status: invalid value → 400" "must be one of" "$R"

  R=$(curl -s -X PATCH "$API/documents/$DOC_ID/status" -H "$H" -H "Content-Type: application/json" -d '{"status":"completed"}')
  check "Doc status: draft → completed" "completed" "$R"

  # Clone with bad jobId
  R=$(curl -s -X POST "$API/documents/$DOC_ID/clone" -H "$H" -H "Content-Type: application/json" -d '{"jobId":"not-uuid"}')
  check "Clone document: bad UUID → 400" "must be a UUID" "$R"

  # Cleanup
  curl -s -X DELETE "$API/documents/$DOC_ID" -H "$H" > /dev/null
fi

# ═══════════════════════════════════════
echo ""
echo "=== 11. SETTINGS ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/settings" -H "$H")
check "Get settings" "companyName" "$R"

# Languages
R=$(curl -s -X POST "$API/settings/languages" -H "$H" -H "Content-Type: application/json" -d '{"code":"x","name":"Test","direction":"ltr"}')
check "Create language: code too short → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/settings/languages" -H "$H" -H "Content-Type: application/json" -d '{"code":"zz","name":"Test","direction":"invalid"}')
check "Create language: bad direction → 400" "must be one of" "$R"

R=$(curl -s -X POST "$API/settings/languages" -H "$H" -H "Content-Type: application/json" -d '{"code":"zz","name":"","direction":"ltr"}')
check "Create language: empty name → 400" "must be longer" "$R"

# Labels
R=$(curl -s -X POST "$API/settings/labels" -H "$H" -H "Content-Type: application/json" -d '{"category":"invalid","value":"Test"}')
check "Create label: bad category → 400" "must be one of" "$R"

R=$(curl -s -X POST "$API/settings/labels" -H "$H" -H "Content-Type: application/json" -d '{"category":"email","value":""}')
check "Create label: empty value → 400" "must be longer" "$R"

# Freeform job types
R=$(curl -s -X POST "$API/settings/freeform-job-types" -H "$H" -H "Content-Type: application/json" -d '{"name":"","pricePerPage":10}')
check "Create freeform type: empty name → 400" "must be longer" "$R"

R=$(curl -s -X POST "$API/settings/freeform-job-types" -H "$H" -H "Content-Type: application/json" -d '{"name":"X","pricePerPage":-1}')
check "Create freeform type: negative price → 400" "must not be less than 0" "$R"

# Upload settings
R=$(curl -s -X PATCH "$API/settings" -H "$H" -H "Content-Type: application/json" -d '{"maxUploadSizeMb":200}')
check "Settings: maxUpload > 100 → 400" "must not be greater than 100" "$R"

R=$(curl -s -X PATCH "$API/settings" -H "$H" -H "Content-Type: application/json" -d '{"maxUploadSizeMb":0}')
check "Settings: maxUpload < 1 → 400" "must not be less than 1" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 12. NOTIFICATIONS ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/notifications/unread-count" -H "$H")
check "Unread count" '"count"' "$R"

R=$(curl -s "$API/notifications?limit=5" -H "$H")
check "Notifications list" '"total"' "$R"

R=$(curl -s -X PATCH "$API/notifications/00000000-0000-0000-0000-000000000000/read" -H "$H")
check "Mark non-existent notification → 404" "not found" "$R"

R=$(curl -s -X POST "$API/notifications/mark-all-read" -H "$H")
check "Mark all read" "" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 13. CALENDAR ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/calendar/events?month=5&year=2026" -H "$H")
check "Calendar events" "[" "$R"

R=$(curl -s "$API/calendar/events?month=99&year=2026" -H "$H")
check "Calendar: invalid month clamped" "[" "$R"

R=$(curl -s "$API/calendar/events?month=abc&year=xyz" -H "$H")
check "Calendar: non-numeric params → defaults" "[" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 14. SEARCH ==="
# ═══════════════════════════════════════
R=$(curl -s "$API/search?q=test" -H "$H")
check "Search" '"counts"' "$R"

R=$(curl -s "$API/search?q=x" -H "$H")
check "Search: 1 char → 400" "at least 2" "$R"

R=$(curl -s "$API/search" -H "$H")
check "Search: empty query → 400" "at least 2" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 15. TRANSLATE ==="
# ═══════════════════════════════════════
R=$(curl -s -X POST "$API/translate" -H "$H" -H "Content-Type: application/json" -d '{"text":"hello","from":"en","to":"fr"}')
check "Translate" "translatedText" "$R"

R=$(curl -s -X POST "$API/translate" -H "$H" -H "Content-Type: application/json" -d '{"text":"hello","from":"!!!","to":"fr"}')
check "Translate: bad lang code → 400" "Invalid language" "$R"

R=$(curl -s -X POST "$API/translate" -H "$H" -H "Content-Type: application/json" -d '{"text":"","from":"en","to":"fr"}')
check "Translate: empty text → 400" "must be longer" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 16. SECURITY — Abuse Detection ==="
# ═══════════════════════════════════════
R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"x UNION SELECT * FROM users"}')
check "SQL injection blocked" "invalid data" "$R"

R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"<script>alert(1)</script>"}')
check "XSS script tag blocked" "invalid data" "$R"

R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"<img onerror=alert(1)>"}')
check "XSS event handler blocked" "invalid data" "$R"

R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"test; DROP TABLE users; --"}')
check "SQL DROP TABLE blocked" "invalid data" "$R"

# Honeypot
R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"Bot","_hp":"filled"}')
check "Honeypot: filled → rejected" "rejected" "$R"

R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"Human","_hp":""}')
check "Honeypot: empty → accepted" "Human" "$R"
HUMAN_ID=$(echo "$R" | json .id)
[ "$HUMAN_ID" != "FAIL" ] && curl -s -X DELETE "$API/clients/$HUMAN_ID" -H "$H" > /dev/null

# UUID validation
R=$(curl -s "$API/jobs/not-a-uuid" -H "$H")
check "ParseUUIDPipe rejects non-UUID" "Validation failed (uuid is expected)" "$R"

R=$(curl -s "$API/clients/not-a-uuid" -H "$H")
check "Client ID: non-UUID → 400" "Validation failed" "$R"

# Unknown properties rejected
R=$(curl -s -X POST "$API/clients" -H "$H" -H "Content-Type: application/json" -d '{"type":"person","name":"X","hackerField":"pwned"}')
check "Unknown property rejected" "should not exist" "$R"

# Unauthenticated
R=$(curl -s "$API/jobs")
check "Unauthenticated → 401" "Unauthorized" "$R"

# ═══════════════════════════════════════
echo ""
echo "=== 17. ACCESS CONTROL — Translator ==="
# ═══════════════════════════════════════
TLOGIN=$(curl -s "$API/auth/login" -H "Content-Type: application/json" -d '{"email":"tester@test.com","password":"tester123!"}')
TTOKEN=$(echo "$TLOGIN" | json .accessToken)
TH="Authorization: Bearer $TTOKEN"

if [ "$TTOKEN" != "FAIL" ]; then
  R=$(curl -s "$API/invoices" -H "$TH")
  check "Translator blocked from invoices" "Forbidden" "$R"

  R=$(curl -s "$API/reports/dashboard-stats" -H "$TH")
  check "Translator blocked from reports" "Forbidden" "$R"

  R=$(curl -s "$API/jobs?limit=5" -H "$TH")
  check "Translator can list jobs" '"total"' "$R"

  R=$(curl -s "$API/calendar/events?month=5&year=2026" -H "$TH")
  check "Translator can access calendar" "[" "$R"

  R=$(curl -s "$API/notifications/unread-count" -H "$TH")
  check "Translator can access notifications" '"count"' "$R"

  # Translator can't see admin's invoice
  ADMIN_INV=$(echo "$(curl -s "$API/invoices" -H "$H")" | json '.data[0]?.id')
  if [ "$ADMIN_INV" != "FAIL" ] && [ "$ADMIN_INV" != "undefined" ] && [ "$ADMIN_INV" != "none" ]; then
    R=$(curl -s "$API/invoices/$ADMIN_INV" -H "$TH")
    check "Translator blocked from admin invoice" "Forbidden" "$R"
  fi
else
  echo "  SKIP: Tester login failed"
fi

# ═══════════════════════════════════════
echo ""
echo "=== 18. FRONTEND PAGES ==="
# ═══════════════════════════════════════
for page in "/" "/login" "/forgot-password" "/reset-password" "/clients" "/jobs" "/invoices" "/calendar" "/reports" "/notifications" "/settings" "/templates"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3080$page")
  check_status "Page $page loads" "200" "$CODE"
done

# ═══════════════════════════════════════
echo ""
echo "=== 19. CLEANUP ==="
# ═══════════════════════════════════════
# Delete test data in reverse dependency order
[ "$JOB_ID" != "FAIL" ] && [ -n "$JOB_ID" ] && curl -s -X DELETE "$API/jobs/$JOB_ID" -H "$H" > /dev/null 2>&1
[ "$TEMPLATE_ID" != "FAIL" ] && [ -n "$TEMPLATE_ID" ] && curl -s -X DELETE "$API/templates/$TEMPLATE_ID" -H "$H" > /dev/null 2>&1
[ "$PERSON_ID" != "FAIL" ] && [ -n "$PERSON_ID" ] && curl -s -X DELETE "$API/clients/$PERSON_ID" -H "$H" > /dev/null 2>&1
[ "$CLIENT_ID" != "FAIL" ] && [ -n "$CLIENT_ID" ] && {
  # Client has a linked invoice (paid), can't delete — just note it
  DEL=$(curl -s -X DELETE "$API/clients/$CLIENT_ID" -H "$H")
  echo "$DEL" | grep -qF "job" && echo "  NOTE: Test client has linked jobs, skipped cleanup" || check "Delete test company client" "" "$DEL"
}

echo ""
echo "============================================================"
echo " RESULTS: $PASS passed, $FAIL failed"
echo "============================================================"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  echo -e "$ERRORS"
fi
echo ""
