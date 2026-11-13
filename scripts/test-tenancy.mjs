#!/usr/bin/env node
/**
 * Tenant-isolation suite (live). Builds two organizations with real data, then
 * calls every endpoint as organization A with organization B's ids and checks
 * nothing of B ever comes back. Also: platform admin vs tenant boundaries,
 * per-tenant numbering/settings, suspension, sign-up + approval.
 *
 *   node scripts/test-tenancy.mjs            (backend on :3005, NODE_ENV != production)
 *   API=http://host:3005/api node scripts/test-tenancy.mjs
 *
 * Needs the seeded platform admin (ADMIN_EMAIL / ADMIN_PASSWORD env, default
 * admin@translation-assistant.com / admin123!) and non-production mode (sign-up
 * returns its verification token). Writes test organizations; does not clean up
 * (run it against a scratch database).
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@translation-assistant.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123!';
const PW = 'Tenancy-Check#2026';
const RUN = Date.now().toString(36);

let pass = 0;
let fail = 0;
const failures = [];
function check(desc, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${desc} ${extra}`);
  }
  console.log(cond ? '  PASS' : '  FAIL', desc, cond ? '' : `→ ${extra}`);
}

// Rotate the client IP per request (X-Forwarded-For is trusted from loopback)
// so the per-IP rate limits don't interfere with a burst of test calls.
let ipn = 1;
const nextIp = () => `10.66.${(ipn >> 8) & 255}.${ipn++ & 255}`;

async function req(token, method, path, body, { form } = {}) {
  const headers = { 'X-Forwarded-For': nextIp() };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, text };
}
const show = (r) => `${r.status} ${String(r.text).slice(0, 160)}`;
const ok = (r) => r.status >= 200 && r.status < 300;
const login = async (email, password) =>
  (await req(null, 'POST', '/auth/login', { email, password })).data
    ?.accessToken;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
function fileForm(fields, name, buf, type) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append('file', new Blob([buf], { type }), name);
  return f;
}

// ── Platform admin ──
const P = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
if (!P) {
  console.error('Platform admin login failed — is the backend up and seeded?');
  process.exit(2);
}

/** Creates an organization, its admin (via the invite), a translator and data. */
async function buildTenant(label) {
  const adminEmail = `admin-${label}-${RUN}@tenancy.test`;
  const created = await req(P, 'POST', '/platform/tenants', {
    name: `Org ${label} ${RUN}`,
    adminEmail,
  });
  if (!ok(created)) throw new Error(`create tenant ${label}: ${show(created)}`);
  const reg = await req(null, 'POST', '/auth/register', {
    email: adminEmail,
    password: PW,
    firstName: 'Admin',
    lastName: label,
    inviteToken: created.data.invite.token,
  });
  if (!ok(reg)) throw new Error(`register ${label}: ${show(reg)}`);
  const A = reg.data.accessToken;
  const roles = (await req(A, 'GET', '/roles')).data;
  const tRole = roles.find((r) => r.name === 'Translator');
  const trEmail = `tr-${label}-${RUN}@tenancy.test`;
  const translator = (
    await req(A, 'POST', '/users', {
      email: trEmail,
      password: PW,
      firstName: 'Tr',
      lastName: label,
      roleId: tRole.id,
    })
  ).data;
  const T = await login(trEmail, PW);
  const langs = (await req(A, 'GET', '/settings/languages')).data;
  const en = langs.find((l) => l.code === 'en').id;
  const ar = langs.find((l) => l.code === 'ar').id;
  const client = (
    await req(A, 'POST', '/clients', {
      type: 'company',
      name: `Client ${label} ${RUN}`,
    })
  ).data;
  const email = (
    await req(A, 'POST', `/clients/${client.id}/emails`, {
      email: `c-${label}@tenancy.test`,
      label: 'Work',
      isPrimary: true,
    })
  ).data;
  const contact = (
    await req(A, 'POST', `/clients/${client.id}/contacts`, {
      firstName: 'Con',
      lastName: label,
    })
  ).data;
  const passport = (
    await req(A, 'POST', `/clients/${client.id}/passports`, undefined, {
      form: fileForm({ label: 'Passport' }, 'p.png', PNG, 'image/png'),
    })
  ).data;
  const template = (
    await req(A, 'POST', '/templates', {
      type: 'designer',
      name: `Tpl ${label} ${RUN}`,
      pricePerPage: 10,
    })
  ).data;
  const field = (
    await req(A, 'POST', `/templates/${template.id}/fields`, {
      fieldKey: 'full_name',
      fieldType: 'text',
      labels: [{ languageId: en, label: 'Full name' }],
    })
  ).data;
  const job = (
    await req(A, 'POST', '/jobs', {
      title: `Job ${label}`,
      clientId: client.id,
      contactId: contact.id,
      sourceLanguageId: ar,
      targetLanguageId: en,
      lineItems: [
        {
          description: 'page',
          pageCount: 1,
          pricePerPage: 10,
          templateId: template.id,
        },
      ],
    })
  ).data;
  await req(A, 'POST', `/jobs/${job.id}/users`, {
    userId: translator.id,
    permissionLevel: 'edit',
  });
  const jobFull = (await req(A, 'GET', `/jobs/${job.id}`)).data;
  const lineItem = jobFull.lineItems[0];
  const file = (
    await req(A, 'POST', `/jobs/${job.id}/files`, undefined, {
      form: fileForm({ category: 'source' }, 's.pdf', Buffer.from('%PDF-1.4\n%x\n'), 'application/pdf'),
    })
  ).data;
  const docs = (await req(A, 'GET', `/documents/by-job/${job.id}`)).data;
  const doc = docs[0];
  await req(A, 'POST', `/documents/${doc.id}/save-values`, {
    values: [{ templateFieldId: field.id, value: `Name ${label}`, entryIndex: 0 }],
  });
  await req(A, 'PATCH', `/documents/${doc.id}/status`, { status: 'completed' });
  const invoice = (
    await req(A, 'POST', '/invoices', {
      clientId: client.id,
      issueDate: '2026-11-01',
      dueDate: '2026-11-30',
      items: [{ description: 'Translation', quantity: 1, unitPrice: 10, jobId: job.id }],
    })
  ).data;
  await req(A, 'PATCH', `/invoices/${invoice.id}/status`, { status: 'sent' });
  const paid = (
    await req(A, 'POST', `/invoices/${invoice.id}/record-payment`, {
      paidAmount: 4,
      paidAt: '2026-11-05',
    })
  ).data;
  const freeform = (
    await req(A, 'POST', '/settings/freeform-job-types', {
      name: `Type ${label}`,
      pricePerPage: 5,
    })
  ).data;
  const ids = {
    tenant: created.data.tenant.id,
    client: client.id,
    email: email?.id,
    contact: contact?.id,
    passport: passport?.id,
    template: template.id,
    field: field?.id,
    job: job.id,
    jobNumber: job.jobNumber,
    lineItem: lineItem?.id,
    file: file?.id,
    doc: doc?.id,
    invoice: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    payment: paid?.payments?.[0]?.id,
    freeform: freeform?.id,
    admin: reg.data.user.id,
    translator: translator.id,
  };
  const missing = Object.entries(ids).filter(([, v]) => !v);
  if (missing.length) throw new Error(`${label} setup incomplete: ${missing.map(([k]) => k)}`);
  return { A, T, adminEmail, trEmail, ids, en, ar };
}

console.log('== setup: two organizations ==');
const a = await buildTenant('A');
const b = await buildTenant('B');
console.log('   built A and B');

console.log('== per-tenant numbering ==');
check('both organizations start at JOB-0001', a.ids.jobNumber === 'JOB-0001' && b.ids.jobNumber === 'JOB-0001', `${a.ids.jobNumber}/${b.ids.jobNumber}`);
check('both organizations start at INV-0001', a.ids.invoiceNumber === 'INV-0001' && b.ids.invoiceNumber === 'INV-0001', `${a.ids.invoiceNumber}/${b.ids.invoiceNumber}`);

// ── Every endpoint, as A (admin and translator), with B's ids ──
const B = b.ids;
const probes = [
  ['GET', `/clients/${B.client}`],
  ['PATCH', `/clients/${B.client}`, { name: 'hijack' }],
  ['DELETE', `/clients/${B.client}`],
  ['POST', `/clients/${B.client}/emails`, { email: 'x@x.test', label: 'Work' }],
  ['PATCH', `/clients/${B.client}/emails/${B.email}`, { email: 'x@x.test', label: 'Work' }],
  ['DELETE', `/clients/${B.client}/emails/${B.email}`],
  ['POST', `/clients/${B.client}/phones`, { phone: '123', label: 'Work' }],
  ['POST', `/clients/${B.client}/addresses`, { address: 'x', label: 'Work' }],
  ['GET', `/clients/${B.client}/contacts`],
  ['POST', `/clients/${B.client}/contacts`, { firstName: 'x', lastName: 'y' }],
  ['PATCH', `/clients/${B.client}/contacts/${B.contact}`, { firstName: 'x' }],
  ['DELETE', `/clients/${B.client}/contacts/${B.contact}`],
  ['GET', `/clients/${B.client}/passports`],
  ['DELETE', `/clients/${B.client}/passports/${B.passport}`],
  ['GET', `/templates/${B.template}`],
  ['PATCH', `/templates/${B.template}`, { name: 'hijack' }],
  ['DELETE', `/templates/${B.template}`],
  ['GET', `/templates/${B.template}/word-preview`],
  ['POST', `/templates/${B.template}/fields`, { fieldKey: 'x', fieldType: 'text' }],
  ['PATCH', `/templates/${B.template}/fields/${B.field}`, { fieldKey: 'hijack' }],
  ['DELETE', `/templates/${B.template}/fields/${B.field}`],
  ['PATCH', `/templates/${B.template}/fields/reorder`, { fieldIds: [B.field] }],
  ['GET', `/jobs/${B.job}`],
  ['PATCH', `/jobs/${B.job}`, { title: 'hijack' }],
  ['DELETE', `/jobs/${B.job}`],
  ['PATCH', `/jobs/${B.job}/status`, { status: 'delivered' }],
  ['POST', `/jobs/${B.job}/reopen`],
  ['POST', `/jobs/${B.job}/line-items`, { description: 'x', pageCount: 1, pricePerPage: 1 }],
  ['PATCH', `/jobs/${B.job}/line-items/${B.lineItem}`, { pageCount: 9 }],
  ['DELETE', `/jobs/${B.job}/line-items/${B.lineItem}`],
  ['POST', `/jobs/${B.job}/users`, { userId: B.translator }],
  ['DELETE', `/jobs/${B.job}/users/${B.translator}`],
  ['GET', `/jobs/${B.job}/files/${B.file}/download`],
  ['DELETE', `/jobs/${B.job}/files/${B.file}`],
  ['GET', `/documents/by-job/${B.job}`],
  ['GET', `/documents/${B.doc}`],
  ['POST', `/documents/${B.doc}/save-values`, { values: [] }],
  ['PATCH', `/documents/${B.doc}/status`, { status: 'draft' }],
  ['POST', `/documents/${B.doc}/export`],
  ['DELETE', `/documents/${B.doc}`],
  ['GET', `/invoices/${B.invoice}`],
  ['GET', `/invoices/by-job/${B.job}`],
  ['PATCH', `/invoices/${B.invoice}`, { notes: 'hijack' }],
  ['PATCH', `/invoices/${B.invoice}/status`, { status: 'cancelled' }],
  ['POST', `/invoices/${B.invoice}/record-payment`, { paidAmount: 1 }],
  ['DELETE', `/invoices/${B.invoice}/payments/${B.payment}`],
  ['POST', `/invoices/${B.invoice}/export-pdf`],
  ['POST', `/invoices/${B.invoice}/export-word`],
  ['POST', `/invoices/${B.invoice}/email`, { email: 'x@x.test' }],
  ['DELETE', `/invoices/${B.invoice}`],
  ['GET', `/users/${B.admin}`],
  ['PATCH', `/users/${B.translator}`, { firstName: 'hijack' }],
  ['PATCH', `/users/${B.translator}/deactivate`],
  ['PATCH', `/users/${B.translator}/activate`],
  ['POST', `/users/${B.translator}/reset-password`],
  ['DELETE', `/users/${B.translator}`],
  ['PATCH', `/settings/freeform-job-types/${B.freeform}`, { name: 'hijack' }],
  ['DELETE', `/settings/freeform-job-types/${B.freeform}`],
];
const bSecrets = [`Client B ${RUN}`, `Tpl B ${RUN}`, 'Name B', `c-B@tenancy.test`, b.trEmail, b.adminEmail];
for (const [who, token] of [['A admin', a.A], ['A translator', a.T]]) {
  console.log(`== ${who} with B's ids (${probes.length} endpoints) ==`);
  for (const [m, path, body] of probes) {
    const r = await req(token, m, path, body);
    const leaked = bSecrets.find((sec) => r.text.includes(sec));
    check(`${who}: ${m} ${path.replace(RUN, '')} refused`, !ok(r) && !leaked && r.status < 500, `${show(r)}${leaked ? ` LEAK:${leaked}` : ''}`);
  }
}

console.log('== B data untouched after the attempts ==');
const bClient = await req(b.A, 'GET', `/clients/${B.client}`);
check("B's client still there, unrenamed", ok(bClient) && bClient.data.name === `Client B ${RUN}`, show(bClient));
const bJob = await req(b.A, 'GET', `/jobs/${B.job}`);
check("B's job intact", ok(bJob) && bJob.data.title === 'Job B' && bJob.data.lineItems.length === 1, show(bJob));
const bInv = await req(b.A, 'GET', `/invoices/${B.invoice}`);
check("B's invoice intact (still sent, payment kept)", ok(bInv) && bInv.data.status === 'sent' && bInv.data.payments.length === 1, show(bInv));
const bTr = await login(b.trEmail, PW);
check("B's translator still active with the same password", !!bTr);

console.log('== lists and search show only own data ==');
const lists = [
  ['/clients?limit=100', (d) => d.data],
  ['/jobs?limit=100', (d) => d.data],
  ['/invoices?limit=100', (d) => d.data],
  ['/templates', (d) => d],
  ['/users', (d) => d],
  ['/settings/freeform-job-types', (d) => d],
  ['/documents/search-clone', (d) => d],
  ['/calendar/events?month=11&year=2026', (d) => d],
  ['/reports/by-client', (d) => d],
  ['/reports/job-status', (d) => d],
];
// Job / invoice numbers repeat across tenants by design (JOB-0001 in each) — compare ids only.
const { jobNumber: _jn, invoiceNumber: _in, ...bIdOnly } = B;
const bIds = new Set(Object.values(bIdOnly));
for (const [path, rows] of lists) {
  const r = await req(a.A, 'GET', path);
  const text = r.text;
  const leaked = [...bIds].find((id) => text.includes(id)) || bSecrets.find((s) => text.includes(s));
  check(`A admin ${path}: no B rows`, ok(r) && Array.isArray(rows(r.data)) && !leaked, leaked ? `LEAK ${leaked}` : show(r));
}
const s = await req(a.A, 'GET', `/search?q=${encodeURIComponent(RUN)}`);
check('global search: no B results', ok(s) && !s.text.includes(`B ${RUN}`) && s.text.includes(`A ${RUN}`), show(s));
const jobStatus = await req(a.A, 'GET', '/reports/job-status');
check('report counts only A jobs', ok(jobStatus) && jobStatus.data.reduce((n, r) => n + r.count, 0) === 1, show(jobStatus));
const rev = await req(a.A, 'GET', '/reports/revenue?period=monthly&from=2026-11&to=2026-11');
check('revenue counts only A payments', ok(rev) && rev.data[0]?.revenue === 4, show(rev));

console.log('== referencing B records from A ==');
const xJob = await req(a.A, 'POST', '/jobs', { title: 'x', clientId: B.client, sourceLanguageId: a.ar, targetLanguageId: a.en });
check("job for B's client refused", xJob.status === 400, show(xJob));
const xJobTpl = await req(a.A, 'POST', '/jobs', {
  title: 'x', clientId: a.ids.client, sourceLanguageId: a.ar, targetLanguageId: a.en,
  lineItems: [{ description: 'x', pageCount: 1, pricePerPage: 1, templateId: B.template }],
});
check("job with B's template refused", xJobTpl.status === 400, show(xJobTpl));
const xContact = await req(a.A, 'POST', '/jobs', { title: 'x', clientId: a.ids.client, contactId: B.contact, sourceLanguageId: a.ar, targetLanguageId: a.en });
check("job with B's contact refused", xContact.status === 400, show(xContact));
const xContactUpd = await req(a.A, 'PATCH', `/jobs/${a.ids.job}`, { contactId: B.contact });
check("setting B's contact on A's job refused", xContactUpd.status === 400, show(xContactUpd));
const xLine = await req(a.A, 'POST', `/jobs/${a.ids.job}/line-items`, { description: 'x', pageCount: 1, pricePerPage: 1, templateId: B.template });
check("line item with B's template refused", xLine.status === 400, show(xLine));
const xAssign = await req(a.A, 'POST', `/jobs/${a.ids.job}/users`, { userId: B.translator });
check("assigning B's user to A's job refused", xAssign.status === 400, show(xAssign));
const xLink = await req(a.A, 'POST', `/jobs/${a.ids.job}/files/link`, { sourceJobId: B.job, fileId: B.file });
check("linking B's file refused", !ok(xLink) && xLink.status < 500, show(xLink));
const xDoc = await req(a.A, 'POST', '/documents', { jobId: a.ids.job, templateId: B.template });
check("document from B's template refused", xDoc.status === 400, show(xDoc));
const xClone = await req(a.A, 'POST', '/documents', { jobId: a.ids.job, templateId: a.ids.template, clonedFromId: B.doc });
check("cloning B's document refused", !ok(xClone) && xClone.status < 500, show(xClone));
const xClone2 = await req(a.A, 'POST', `/documents/${a.ids.doc}/clone`, { jobId: B.job });
check("cloning into B's job refused", !ok(xClone2) && xClone2.status < 500, show(xClone2));
const xInv = await req(a.A, 'POST', '/invoices', { clientId: B.client, issueDate: '2026-11-01', dueDate: '2026-11-30', items: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
check("invoice for B's client refused", xInv.status === 400, show(xInv));
const xInvJob = await req(a.A, 'POST', '/invoices', { clientId: a.ids.client, issueDate: '2026-11-01', dueDate: '2026-11-30', items: [{ description: 'x', quantity: 1, unitPrice: 1, jobId: B.job }] });
check("invoice linking B's job refused", xInvJob.status === 400, show(xInvJob));

console.log('== roles stay inside the tenant ==');
const pProfile = (await req(P, 'GET', '/auth/profile')).data;
const platformRoleId = pProfile.role.id;
check('platform admin profile says isPlatformAdmin, no tenant', pProfile.isPlatformAdmin === true && pProfile.tenant === null, JSON.stringify(pProfile).slice(0, 120));
const aRoles = (await req(a.A, 'GET', '/roles')).data;
check('tenant role list excludes Platform Admin', !aRoles.some((r) => r.name === 'Platform Admin') && aRoles.length === 3, aRoles.map((r) => r.name).join(','));
const escalate = await req(a.A, 'PATCH', `/users/${a.ids.translator}`, { roleId: platformRoleId });
check('tenant admin cannot give the Platform Admin role', escalate.status === 400, show(escalate));
const escalateNew = await req(a.A, 'POST', '/users', { email: `esc-${RUN}@tenancy.test`, password: PW, firstName: 'E', lastName: 'E', roleId: platformRoleId });
check('…nor create a user with it', escalateNew.status === 400, show(escalateNew));
const escalateInvite = await req(a.A, 'POST', '/auth/invite', { email: `esc2-${RUN}@tenancy.test`, roleId: platformRoleId });
check('…nor invite with it', escalateInvite.status === 400, show(escalateInvite));
const roleWrite = await req(a.A, 'POST', '/roles', { name: 'Custom' });
check('roles are fixed (no create)', roleWrite.status === 404, show(roleWrite));

console.log('== platform admin vs tenant endpoints ==');
for (const path of ['/clients', '/jobs', '/invoices', '/templates', '/users', '/settings', '/reports/dashboard-stats', '/search?q=Client', '/calendar/events?month=11&year=2026']) {
  const r = await req(P, 'GET', path);
  check(`platform admin GET ${path} → 403`, r.status === 403, show(r));
}
const pTenantClient = await req(P, 'GET', `/clients/${B.client}`);
check("platform admin can't open a tenant's client", pTenantClient.status === 403, show(pTenantClient));
for (const [m, path, body] of [['GET', '/platform/tenants'], ['GET', `/platform/tenants/${B.tenant}`], ['POST', `/platform/tenants/${B.tenant}/suspend`], ['GET', '/platform/settings'], ['POST', `/platform/users/${B.translator}/reset-password`], ['POST', '/platform/languages', { code: 'de', name: 'German', direction: 'ltr' }]]) {
  const r = await req(a.A, m, path, body);
  check(`tenant admin ${m} ${path} → 403`, r.status === 403, show(r));
}
const tenantView = await req(P, 'GET', `/platform/tenants/${B.tenant}`);
check('platform tenant detail lists users, no business data', ok(tenantView) && tenantView.data.users.length === 2 && !tenantView.text.includes(`Client B ${RUN}`), show(tenantView));

console.log('== settings are per tenant ==');
await req(a.A, 'PATCH', '/settings', { companyName: `A Company ${RUN}`, baseCurrency: 'EUR', googleTranslateApiKey: 'test-key-a' });
const bSettings = (await req(b.A, 'GET', '/settings')).data;
check("A's settings change doesn't touch B", bSettings.companyName !== `A Company ${RUN}` && bSettings.baseCurrency === 'USD' && bSettings.googleTranslateKeySet === false, JSON.stringify(bSettings).slice(0, 160));
const aGt = (await req(a.A, 'GET', '/translate/status')).data;
const bGt = (await req(b.A, 'GET', '/translate/status')).data;
check('Translate key per tenant (A set, B not)', aGt.configured === true && bGt.configured === false, `${JSON.stringify(aGt)} ${JSON.stringify(bGt)}`);
const aSettings = await req(a.A, 'GET', '/settings');
check('settings response never contains the key or tenant id', !aSettings.text.includes('test-key-a') && !aSettings.text.includes(a.ids.tenant), show(aSettings));
const aLangs = (await req(a.A, 'GET', '/settings/languages')).data;
check('tenant sees the global languages', aLangs.length >= 3, String(aLangs.length));

console.log("== upload limits follow the uploader's tenant (request tenant context) ==");
await req(a.A, 'PATCH', '/settings', { maxUploadSizeMb: 1 });
const big = Buffer.concat([Buffer.from('%PDF-1.4' + String.fromCharCode(10)), Buffer.alloc(1.5 * 1024 * 1024, 32)]);
const aBig = await req(a.A, 'POST', `/jobs/${a.ids.job}/files`, undefined, { form: fileForm({ category: 'source' }, 'big.pdf', big, 'application/pdf') });
check("A's 1 MB limit rejects a 1.5 MB file", aBig.status === 400 && /exceeds/.test(aBig.text), show(aBig));
const bBig = await req(b.A, 'POST', `/jobs/${B.job}/files`, undefined, { form: fileForm({ category: 'source' }, 'big.pdf', big, 'application/pdf') });
check("B (default 5 MB) accepts the same file", ok(bBig), show(bBig));

console.log("== passport file token can't cross tenants ==");
const ft = (await req(a.A, 'POST', '/auth/file-token')).data.token;
const own = await fetch(`${API}/clients/${a.ids.client}/passports/${a.ids.passport}/file?token=${ft}`, { headers: { 'X-Forwarded-For': nextIp() } });
check("A's file token opens A's passport", own.status === 200, String(own.status));
const cross = await fetch(`${API}/clients/${B.client}/passports/${B.passport}/file?token=${ft}`, { headers: { 'X-Forwarded-For': nextIp() } });
check("A's file token cannot open B's passport", cross.status === 403, String(cross.status));
const mixed = await fetch(`${API}/clients/${a.ids.client}/passports/${B.passport}/file?token=${ft}`, { headers: { 'X-Forwarded-For': nextIp() } });
check("A's client id + B's passport id → not found", mixed.status === 404, String(mixed.status));

console.log('== suspension ==');
const susp = await req(P, 'POST', `/platform/tenants/${B.tenant}/suspend`);
check('platform admin suspends B', ok(susp) && susp.data.status === 'suspended', show(susp));
const afterSusp = await req(b.A, 'GET', '/clients');
check("B's existing access token stops working", afterSusp.status === 401, show(afterSusp));
const loginSusp = await req(null, 'POST', '/auth/login', { email: b.adminEmail, password: PW });
check('B login refused with a "suspended" message', loginSusp.status === 403 && /suspended/i.test(loginSusp.data.message), show(loginSusp));
const aStill = await req(a.A, 'GET', '/clients');
check('A unaffected', ok(aStill), show(aStill));
await req(P, 'POST', `/platform/tenants/${B.tenant}/reactivate`);
check('B can log in again after reactivation', !!(await login(b.adminEmail, PW)));

console.log('== sign-up, verification, approval ==');
const suEmail = `signup-${RUN}@tenancy.test`;
const su = await req(null, 'POST', '/auth/signup', { organizationName: `Signup Org ${RUN}`, firstName: 'Sign', lastName: 'Up', email: suEmail, password: PW, acceptTerms: true });
check('sign-up accepted (dev returns the verification token)', ok(su) && su.data.token?.length === 64, show(su));
const noTerms = await req(null, 'POST', '/auth/signup', { organizationName: 'x', firstName: 'x', lastName: 'x', email: `x-${RUN}@tenancy.test`, password: PW, acceptTerms: false });
check('sign-up without accepting terms refused', noTerms.status === 400, show(noTerms));
const dup = await req(null, 'POST', '/auth/signup', { organizationName: 'Dup', firstName: 'x', lastName: 'x', email: suEmail, password: PW, acceptTerms: true });
check('duplicate email gets the same answer (no account oracle)', ok(dup) && dup.data.message === su.data.message && !dup.data.token, show(dup));
const preVerify = await req(null, 'POST', '/auth/login', { email: suEmail, password: PW });
check('login before confirming the email refused', preVerify.status === 403 && /confirm/i.test(preVerify.data.message), show(preVerify));
const ver = await req(null, 'POST', '/auth/verify-email', { token: su.data.token });
check('email confirmed, organization pending', ok(ver) && ver.data.organizationStatus === 'pending', show(ver));
const reuse = await req(null, 'POST', '/auth/verify-email', { token: su.data.token });
check('verification link is single-use', reuse.status === 400, show(reuse));
const pending = await req(null, 'POST', '/auth/login', { email: suEmail, password: PW });
check('login while pending refused with "waiting for approval"', pending.status === 403 && /approval/i.test(pending.data.message), show(pending));
const notif = (await req(P, 'GET', '/notifications?limit=5')).data;
check('platform admin notified of the sign-up', notif.data.some((n) => n.type === 'tenant_signup' && n.message.includes(`Signup Org ${RUN}`)), JSON.stringify(notif).slice(0, 160));
const list = (await req(P, 'GET', '/platform/tenants?status=pending')).data;
const pendingOrg = list.data.find((t) => t.name === `Signup Org ${RUN}`);
check('pending organization listed with its admin', !!pendingOrg && pendingOrg.admins[0]?.email === suEmail, JSON.stringify(list).slice(0, 160));
const appr = await req(P, 'POST', `/platform/tenants/${pendingOrg.id}/approve`);
check('approve → active', ok(appr) && appr.data.status === 'active', show(appr));
const suToken = await login(suEmail, PW);
check('approved admin logs in', !!suToken);
const suJobs = await req(suToken, 'GET', '/jobs');
check('new organization starts empty', ok(suJobs) && suJobs.data.total === 0, show(suJobs));
const suStart = await req(suToken, 'POST', '/clients', { type: 'person', name: 'First' });
check('new organization can work straight away', ok(suStart), show(suStart));

const rej = await req(null, 'POST', '/auth/signup', { organizationName: `Reject Org ${RUN}`, firstName: 'R', lastName: 'J', email: `reject-${RUN}@tenancy.test`, password: PW, acceptTerms: true });
const rejList = (await req(P, 'GET', '/platform/tenants?status=pending')).data.data.find((t) => t.name === `Reject Org ${RUN}`);
const rejR = await req(P, 'POST', `/platform/tenants/${rejList?.id}/reject`);
check('reject removes the pending sign-up', ok(rej) && ok(rejR) && (await req(P, 'GET', `/platform/tenants/${rejList.id}`)).status === 404, show(rejR));
const rejActive = await req(P, 'POST', `/platform/tenants/${a.ids.tenant}/reject`);
check('an active organization cannot be rejected', rejActive.status === 400, show(rejActive));

console.log('== template setup wizard (Word) ==');
{
  const { createRequire } = await import('node:module');
  const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
  const PizZip = requireBackend('pizzip');
  const rawReq = async (token, method, path, body) => {
    const headers = { 'X-Forwarded-For': nextIp(), Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, type: res.headers.get('content-type') || '', buf: Buffer.from(await res.arrayBuffer()) };
  };
  const docText = (buf) => new PizZip(buf).file('word/document.xml').asText().replace(/<[^>]+>/g, '');

  const ex = await rawReq(a.A, 'GET', '/templates/example-docx');
  check('example .docx downloads', ex.status === 200 && ex.type.includes('wordprocessingml') && ex.buf.length > 1000, `${ex.status} ${ex.type}`);
  const created = await req(a.A, 'POST', '/templates', { type: 'word', name: `Wizard ${RUN}`, pricePerPage: 12, isActive: false, languageIds: [a.en] });
  check('wizard creates a draft with its document language', ok(created) && created.data.isActive === false && created.data.languages?.map((l) => l.id).join() === a.en, show(created));
  const tid = created.data.id;
  const up = await req(a.A, 'POST', `/templates/${tid}/upload-word`, undefined, { form: fileForm({}, 'example.docx', ex.buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') });
  check('the example file uploads as a Word template', ok(up), show(up));
  const pv = (await req(a.A, 'GET', `/templates/${tid}/word-preview`)).data;
  const found = [...(pv.valid ?? []), ...(pv.unlinked ?? [])];
  check('preview finds the placeholders and the loop', found.includes('full_name') && found.includes('child_name') && pv.groups?.child_name === 'children' && pv.malformed?.length === 0, JSON.stringify(pv).slice(0, 200));
  const sync = await req(a.A, 'POST', `/templates/${tid}/word-placeholders`, { placeholders: pv.unlinked.map((k) => ({ find: k, fieldKey: k })) });
  const byKey = Object.fromEntries((sync.data.fields ?? []).map((f) => [f.fieldKey, f]));
  check('fields created: loop fields grouped, types guessed', ok(sync) && byKey.child_name?.groupKey === 'children' && byKey.date_of_birth?.fieldType === 'date' && byKey.notes?.fieldType === 'textarea' && byKey.full_name?.fieldType === 'text', show(sync));
  await req(a.A, 'POST', `/templates/${tid}/fields`, { fieldKey: 'old_one', fieldType: 'text' });
  const pv2 = (await req(a.A, 'GET', `/templates/${tid}/word-preview`)).data;
  check('a field missing from the file is reported as orphan', pv2.orphans?.includes('old_one') && !pv2.orphans.includes('full_name'), JSON.stringify(pv2.orphans));
  const exp = await rawReq(a.A, 'POST', `/templates/${tid}/test-export`, {
    languageId: a.en,
    values: [
      { templateFieldId: byKey.full_name.id, value: 'Rana Test' },
      { templateFieldId: byKey.child_name.id, value: 'Kid One', entryIndex: 0 },
      { templateFieldId: byKey.child_name.id, value: 'Kid Two', entryIndex: 1 },
    ],
  });
  const text = exp.status === 200 ? docText(exp.buf) : '';
  check('test export renders values and repeats the row', exp.status === 200 && text.includes('Rana Test') && text.includes('Kid One') && text.includes('Kid Two') && !text.includes('{full_name}'), `${exp.status} ${text.slice(0, 120)}`);
  const expB = await rawReq(a.A, 'POST', `/templates/${b.ids.template}/test-export`, { values: [] });
  check("test export of another organization's template → 404", expB.status === 404, String(expB.status));
  const expT = await rawReq(a.T, 'POST', `/templates/${tid}/test-export`, { values: [] });
  check('a translator cannot run a test export', expT.status === 403, String(expT.status));
  const badLang = await req(a.A, 'PATCH', `/templates/${tid}`, { languageIds: ['00000000-0000-4000-8000-000000000000'] });
  check('unknown document language refused', badLang.status === 400, show(badLang));
  await req(a.A, 'PATCH', `/templates/${tid}`, { isActive: true });
  const clientId = a.ids.client;
  const wrongLang = await req(a.A, 'POST', '/jobs', { title: 'Lang check', clientId, sourceLanguageId: a.en, targetLanguageId: a.ar, lineItems: [{ description: 'p', pageCount: 1, pricePerPage: 12, templateId: tid }] });
  check('job refused when the template is not in the target language', wrongLang.status === 400 && /target language/i.test(wrongLang.data.message), show(wrongLang));
  const rightLang = await req(a.A, 'POST', '/jobs', { title: 'Lang ok', clientId, sourceLanguageId: a.ar, targetLanguageId: a.en, lineItems: [{ description: 'p', pageCount: 1, pricePerPage: 12, templateId: tid }] });
  check('job accepted in a document language', ok(rightLang), show(rightLang));
  const noLangTpl = await req(a.A, 'POST', '/jobs', { title: 'Any lang', clientId, sourceLanguageId: a.en, targetLanguageId: a.ar, lineItems: [{ description: 'p', pageCount: 1, pricePerPage: 10, templateId: a.ids.template }] });
  check('a template without document languages works for any language', ok(noLangTpl), show(noLangTpl));
}

console.log('== invite pre-fill ==');
const ipEmail = `prefill-${RUN}@tenancy.test`;
const ipOrg = await req(P, 'POST', '/platform/tenants', { name: `Prefill Org ${RUN}`, adminEmail: ipEmail, adminFirstName: 'Rana', adminLastName: 'Haddad' });
check('organization created with the admin name', ok(ipOrg), show(ipOrg));
const ipTok = ipOrg.data.invite?.token;
const det = await req(null, 'POST', '/auth/invite-details', { token: ipTok });
check('invite details: email, names, organization, role', ok(det) && det.data.email === ipEmail && det.data.firstName === 'Rana' && det.data.lastName === 'Haddad' && det.data.organizationName === `Prefill Org ${RUN}` && det.data.roleName === 'Admin', show(det));
const detBad = await req(null, 'POST', '/auth/invite-details', { token: 'f'.repeat(64) });
check('unknown invite token → 400', detBad.status === 400, show(detBad));
const wrongMail = await req(null, 'POST', '/auth/register', { email: `other-${RUN}@tenancy.test`, password: PW, firstName: 'R', lastName: 'H', inviteToken: ipTok });
check('registering with another email refused', wrongMail.status === 400, show(wrongMail));
const ipReg = await req(null, 'POST', '/auth/register', { email: ipEmail, password: PW, firstName: 'Rana', lastName: 'H.', inviteToken: ipTok });
check('invitee can change the pre-filled name', ok(ipReg) && ipReg.data.user.lastName === 'H.', show(ipReg));
const detUsed = await req(null, 'POST', '/auth/invite-details', { token: ipTok });
check('used invite → 400', detUsed.status === 400, show(detUsed));
const trInv = await req(a.A, 'POST', '/auth/invite', { email: `inv-${RUN}@tenancy.test`, firstName: 'Tina' });
const trDet = await req(null, 'POST', '/auth/invite-details', { token: trInv.data?.token });
check("organization admin's invite carries the name, default role Translator", ok(trDet) && trDet.data.firstName === 'Tina' && trDet.data.lastName === '' && trDet.data.roleName === 'Translator', show(trDet));

console.log('== organization deletion: request / decline / approve (empty) ==');
const E = ipReg.data.accessToken;
const eId = ipOrg.data.tenant.id;
const eName = `Prefill Org ${RUN}`;
const delNone = (await req(E, 'GET', '/organization/deletion-request')).data;
check('no deletion request at first', delNone.requested === false, JSON.stringify(delNone));
const badName = await req(E, 'POST', '/organization/deletion-request', { confirmName: 'nope', password: PW });
check('request with the wrong organization name refused', badName.status === 400, show(badName));
const badPw = await req(E, 'POST', '/organization/deletion-request', { confirmName: eName, password: 'Wrong-pass#1' });
check('request with the wrong password refused', badPw.status === 401, show(badPw));
const trReq = await req(a.T, 'POST', '/organization/deletion-request', { confirmName: 'x', password: PW });
check('a translator cannot request deletion', trReq.status === 403, show(trReq));
const platReq = await req(P, 'GET', '/organization/deletion-request');
check('the platform admin has no organization to delete', platReq.status === 403, show(platReq));
const req1 = await req(E, 'POST', '/organization/deletion-request', { confirmName: eName, password: PW, reason: 'Testing' });
check('admin requests deletion', ok(req1) && req1.data.requested === true && req1.data.reason === 'Testing', show(req1));
const again = await req(E, 'POST', '/organization/deletion-request', { confirmName: eName, password: PW });
check('a second request is refused', again.status === 400, show(again));
check('organization still works while the request waits', ok(await req(E, 'GET', '/clients')));
const pn = (await req(P, 'GET', '/notifications?limit=5')).data;
check('platform admin notified of the request', pn.data.some((n) => n.type === 'tenant_deletion_request' && n.message.includes(eName)), JSON.stringify(pn).slice(0, 160));
const pl = (await req(P, 'GET', '/platform/tenants')).data;
check('organization list counts open deletion requests', pl.deletionRequests >= 1 && !!pl.data.find((t) => t.id === eId)?.deletionRequestedAt, JSON.stringify(pl).slice(0, 160));
const wd = await req(E, 'DELETE', '/organization/deletion-request');
check('admin withdraws the request', ok(wd) && wd.data.requested === false, show(wd));
await req(E, 'POST', '/organization/deletion-request', { confirmName: eName, password: PW });
const dec = await req(P, 'POST', `/platform/tenants/${eId}/decline-deletion`, { message: 'Talk to me first' });
check('platform admin declines the request', ok(dec) && dec.data.deletionRequestedAt === null && dec.data.status === 'active', show(dec));
const eDet = (await req(P, 'GET', `/platform/tenants/${eId}`)).data;
check('platform sees counts only: empty organization', eDet.dataCounts && Object.values(eDet.dataCounts).every((n) => n === 0) && typeof eDet.deletionGraceDays === 'number', JSON.stringify(eDet).slice(0, 200));
const eDel = await req(P, 'POST', `/platform/tenants/${eId}/delete`);
check('approving an empty organization deletes it at once', ok(eDel) && eDel.data.deleted === true, show(eDel));
check('deleted organization is gone', (await req(P, 'GET', `/platform/tenants/${eId}`)).status === 404);
check("its admin's token stops working", (await req(E, 'GET', '/clients')).status === 401);
const eLogin = await req(null, 'POST', '/auth/login', { email: ipEmail, password: PW });
check('its admin account is gone', eLogin.status === 401, show(eLogin));

console.log('== organization deletion: grace period, restore, purge ==');
const c = await buildTenant('C');
const cId = c.ids.tenant;
const cDet = (await req(P, 'GET', `/platform/tenants/${cId}`)).data;
check('organization with data reports its counts', cDet.dataCounts.clients === 1 && cDet.dataCounts.jobs === 1 && cDet.dataCounts.invoices === 1, JSON.stringify(cDet.dataCounts));
const g0 = await req(P, 'PATCH', '/platform/settings', { deletionGraceDays: 0 });
check('grace period below 1 day refused', g0.status === 400, show(g0));
const g10 = await req(P, 'PATCH', '/platform/settings', { deletionGraceDays: 10 });
check('grace period is configurable', ok(g10) && g10.data.deletionGraceDays === 10, show(g10));
const notClosing = await req(P, 'POST', `/platform/tenants/${cId}/purge`);
check('purge refused unless scheduled for deletion', notClosing.status === 400, show(notClosing));
const cDel = await req(P, 'POST', `/platform/tenants/${cId}/delete`);
const days = cDel.data?.tenant?.deleteAfter ? (new Date(cDel.data.tenant.deleteAfter) - Date.now()) / 86_400_000 : -1;
check('approving one with data schedules it (closing, grace period)', ok(cDel) && cDel.data.deleted === false && cDel.data.tenant.status === 'closing' && days > 9.9 && days <= 10.01, show(cDel));
check("closing: its users' tokens stop working", (await req(c.A, 'GET', '/clients')).status === 401);
const cLogin = await req(null, 'POST', '/auth/login', { email: c.adminEmail, password: PW });
check('closing: login refused with a clear message', cLogin.status === 403 && /deletion/i.test(cLogin.data.message), show(cLogin));
const twice = await req(P, 'POST', `/platform/tenants/${cId}/delete`);
check('approving twice refused', twice.status === 400, show(twice));
const rest = await req(P, 'POST', `/platform/tenants/${cId}/restore`);
check('restore → active', ok(rest) && rest.data.status === 'active' && rest.data.deleteAfter === null, show(rest));
const cTok = await login(c.adminEmail, PW);
check('restored: data intact', ok(await req(cTok, 'GET', `/clients/${c.ids.client}`)));
await req(P, 'POST', `/platform/tenants/${cId}/delete`);
const pur = await req(P, 'POST', `/platform/tenants/${cId}/purge`);
check('purge now deletes it', ok(pur) && pur.data.deleted === true, show(pur));
check('purged organization is gone', (await req(P, 'GET', `/platform/tenants/${cId}`)).status === 404);
const { existsSync } = await import('node:fs');
const { join: pjoin } = await import('node:path');
check('its upload folder is removed', !existsSync(pjoin('backend', 'uploads', cId)));
check('other organizations unaffected', ok(await req(a.A, 'GET', `/clients/${a.ids.client}`)) && ok(await req(b.A, 'GET', `/jobs/${b.ids.job}`)));
const pend = (await req(null, 'POST', '/auth/signup', { organizationName: `Pend Del ${RUN}`, firstName: 'P', lastName: 'D', email: `penddel-${RUN}@tenancy.test`, password: PW, acceptTerms: true }));
const pendOrg = (await req(P, 'GET', '/platform/tenants?status=pending')).data.data.find((t) => t.name === `Pend Del ${RUN}`);
const pendDel = await req(P, 'POST', `/platform/tenants/${pendOrg?.id}/delete`);
check('a pending sign-up is rejected, not deleted', ok(pend) && pendDel.status === 400, show(pendDel));
await req(P, 'PATCH', '/platform/settings', { deletionGraceDays: 30 });

console.log(`\nTENANCY: ${pass} pass, ${fail} fail`);
if (fail) {
  console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
