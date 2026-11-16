'use client';

import { useJobStatuses, type StatusDef } from '@/lib/job-statuses';
import { BackLink } from '@/components/ui/BackLink';
import { useGoBack } from '@/lib/go-back';
import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { uid } from '@/lib/uid';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency } from '@/lib/format';
import { useClient } from '@/lib/use-client';
import { ClientPicker } from '@/components/ui/ClientPicker';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { DateInput } from '@/components/ui/DateInput';
import Link from 'next/link';

interface Client { id: string; name: string; type: string; }
interface Contact { id: string; firstName: string; lastName: string; }
interface Language { id: string; code: string; name: string; isActive: boolean; }
interface Template {
  id: string; type: string; name: string; pricePerPage: number; discountedPricePerPage: number | null;
  /** Translated into (none = any). */
  languages?: { id: string; code: string }[];
  /** Translated from (none = any). */
  sourceLanguages?: { id: string; code: string }[];
}

/**
 * The languages a set of templates allows: the ones every template that sets
 * them has in common. null = no template sets them (any language).
 */
function allowedBy(list: Template[], pick: (t: Template) => { id: string }[] | undefined): string[] | null {
  let allowed: string[] | null = null;
  for (const t of list) {
    const ids = (pick(t) ?? []).map((l) => l.id);
    if (ids.length === 0) continue;
    allowed = allowed === null ? ids : allowed.filter((id) => ids.includes(id));
  }
  return allowed;
}
const fromLangs = (t: Template) => t.sourceLanguages;
const intoLangs = (t: Template) => t.languages;
/** The chosen value, or the only allowed one; '' when the choice isn't allowed. */
const settle = (allowed: string[] | null, chosen: string) =>
  allowed === null ? chosen : allowed.length === 1 ? allowed[0] : allowed.includes(chosen) ? chosen : '';
/** "Birth certificate · AR → EN" */
const pairLabel = (t: Template) => {
  const from = t.sourceLanguages?.map((l) => l.code.toUpperCase()).join('/');
  const into = t.languages?.map((l) => l.code.toUpperCase()).join('/');
  return from || into ? ` · ${from || 'any'} → ${into || 'any'}` : '';
};
interface FreeformJobType { id: string; name: string; description: string | null; pricePerPage: number; discountedPricePerPage: number | null; isActive: boolean; }

interface LineItem {
  key: string;
  description: string;
  templateId?: string;
  freeformTypeId?: string; // client-only: which freeform type pre-filled this row (not persisted)
  pageCount: number;
  pricePerPage: number;
  discountedPricePerPage: number;
  useDiscountedPrice: boolean;
}

function blankRow(): LineItem {
  return {
    key: uid('li'), description: '', templateId: undefined,
    pageCount: 1, pricePerPage: 0, discountedPricePerPage: 0, useDiscountedPrice: false,
  };
}

export default function NewJobPage() {
  const { baseCurrency } = useSettings();
  const router = useRouter();
  const back = useGoBack('/jobs', 'Jobs');
  const statusCatalogue = useJobStatuses();
  const searchParams = useSearchParams();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [freeformTypes, setFreeformTypes] = useState<FreeformJobType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { hasPermission, user } = useAuth();
  const isAdmin = user?.role?.name === 'Admin';
  // Translators of an organization that hides prices: the server prices the job from the templates.
  const pricesHidden = !!user?.tenant?.pricesHidden;
  const perPage = (price: number | undefined) => (pricesHidden || price == null ? '' : ` (${formatCurrency(Number(price), baseCurrency)}/p)`);
  // Admins hand the job to whoever does it (themselves by default).
  const [colleagues, setColleagues] = useState<{ id: string; firstName: string; lastName: string; isActive: boolean; role?: { name: string } }[]>([]);
  const [assignTo, setAssignTo] = useState('');
  useEffect(() => {
    if (isAdmin) api.get<typeof colleagues>('/users').then(setColleagues).catch(() => setColleagues([]));
  }, [isAdmin]);
  // Inline "new client" — create one without leaving the job form
  const [newClient, setNewClient] = useState<{ type: 'company' | 'person'; name: string } | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  const preselectedClientId = searchParams.get('clientId');

  const [form, setForm] = useState({
    type: 'template' as 'template' | 'freeform',
    title: '',
    description: '',
    clientId: preselectedClientId || '',
    contactId: '',
    isTranslation: true,
    sourceLanguageId: '',
    targetLanguageId: '',
    status: 'in_progress',
    deadline: '',
    isFreeOfCharge: false,
    freeOfChargeReason: '',
    notes: '',
  });

  // Most jobs are one template for one client: start with an empty row.
  const [lineItems, setLineItems] = useState<LineItem[]>(() => [blankRow()]);
  const [showDescription, setShowDescription] = useState(false);

  useEffect(() => {
    api.get<Language[]>('/settings/languages').then((langs) => setLanguages(langs.filter((l) => l.isActive)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load languages.'));
    api.get<Template[]>('/templates?isActive=true').then(setTemplates)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load templates.'));
    api.get<FreeformJobType[]>('/settings/freeform-job-types')
      .then((ts) => setFreeformTypes(ts.filter((t) => t.isActive)))
      .catch(() => setFreeformTypes([]));
  }, []);

  const selectedClient = useClient<Client>(form.clientId);

  // The client list doesn't include contacts — load them for the selected company.
  // Keyed by client so a previous client's contacts are never offered.
  const [clientContacts, setClientContacts] = useState<{ clientId: string; contacts: Contact[] }>({ clientId: '', contacts: [] });
  const contacts = clientContacts.clientId === form.clientId ? clientContacts.contacts : [];
  const isCompany = selectedClient?.type === 'company';

  useEffect(() => {
    if (!isCompany) return;
    let ignore = false;
    api.get<Contact[]>(`/clients/${form.clientId}/contacts`)
      .then((cs) => { if (!ignore) setClientContacts({ clientId: form.clientId, contacts: cs }); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [form.clientId, isCompany]);

  const addLineItem = () => setLineItems([...lineItems, blankRow()]);

  const updateLineItem = (key: string, updates: Partial<LineItem>) => {
    setLineItems(lineItems.map((li) => li.key === key ? { ...li, ...updates } : li));
  };

  const removeLineItem = (key: string) => {
    setLineItems(lineItems.filter((li) => li.key !== key));
  };

  // Filter templates based on job type
  const availableTemplates = form.type === 'freeform'
    ? templates.filter((t) => t.type === 'simple')
    : templates.filter((t) => t.type !== 'simple');

  // The templates' languages decide the job's; without them the user picks.
  const chosenTemplates = (except?: string) => lineItems
    .filter((li) => li.key !== except)
    .map((li) => templates.find((t) => t.id === li.templateId))
    .filter((t): t is Template => !!t);
  const chosen = chosenTemplates();
  const sourceAllowed = allowedBy(chosen, fromLangs);
  const targetAllowed = allowedBy(chosen, intoLangs);
  const sourceId = settle(sourceAllowed, form.sourceLanguageId);
  const isTranslation = form.isTranslation || targetAllowed !== null;
  const targetId = isTranslation ? settle(targetAllowed, form.targetLanguageId) : '';
  const languageClash = sourceAllowed?.length === 0 || targetAllowed?.length === 0;
  /** Templates a row can take: ones that share languages with the other rows' templates. */
  const templatesForRow = (key: string) => {
    const others = chosenTemplates(key);
    const from = allowedBy(others, fromLangs);
    const into = allowedBy(others, intoLangs);
    const fits = (ids: { id: string }[] | undefined, allowed: string[] | null) =>
      allowed === null || !ids?.length || ids.some((l) => allowed.includes(l.id));
    return availableTemplates.filter((t) => fits(t.sourceLanguages, from) && fits(t.languages, into));
  };

  const handleTemplateSelect = (key: string, templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      updateLineItem(key, {
        templateId,
        description: tmpl.name,
        pricePerPage: tmpl.pricePerPage,
        discountedPricePerPage: tmpl.discountedPricePerPage || 0,
      });
    }
  };

  // Freeform line-item source: a managed Freeform Type (ft:) pre-fills description
  // + price with no templateId; a Simple Template (tpl:) keeps its templateId link.
  const handleFreeformSelect = (key: string, value: string) => {
    if (value.startsWith('ft:')) {
      const ft = freeformTypes.find((t) => `ft:${t.id}` === value);
      if (ft) updateLineItem(key, {
        freeformTypeId: ft.id,
        templateId: undefined,
        description: ft.description || ft.name,
        pricePerPage: Number(ft.pricePerPage) || 0,
        discountedPricePerPage: ft.discountedPricePerPage != null ? Number(ft.discountedPricePerPage) : 0,
      });
    } else if (value.startsWith('tpl:')) {
      const tmpl = templates.find((t) => t.id === value.slice(4));
      if (tmpl) updateLineItem(key, {
        templateId: tmpl.id,
        freeformTypeId: undefined,
        description: tmpl.name,
        pricePerPage: Number(tmpl.pricePerPage) || 0,
        discountedPricePerPage: tmpl.discountedPricePerPage != null ? Number(tmpl.discountedPricePerPage) : 0,
      });
    } else {
      updateLineItem(key, { freeformTypeId: undefined, templateId: undefined });
    }
  };

  const getLineTotal = (li: LineItem) => {
    const price = li.useDiscountedPrice && li.discountedPricePerPage ? li.discountedPricePerPage : li.pricePerPage;
    return li.pageCount * price;
  };

  const grandTotal = lineItems.reduce((sum, li) => sum + getLineTotal(li), 0);

  const handleCreateClient = async () => {
    if (!newClient?.name.trim()) return;
    setCreatingClient(true);
    try {
      const created = await api.post<Client>('/clients', { type: newClient.type, name: newClient.name.trim() });
      setForm((f) => ({ ...f, clientId: created.id, contactId: '' }));
      setNewClient(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create client.');
    } finally {
      setCreatingClient(false);
    }
  };

  // Left empty, the title is made from the documents and the client:
  // "Birth certificate + Diploma — Karim Nassar".
  const documentNames = [...new Set(lineItems.map((li) => li.description.trim()).filter(Boolean))];
  const suggestedTitle = [
    documentNames.length > 2 ? `${documentNames.slice(0, 2).join(' + ')} + ${documentNames.length - 2} more` : documentNames.join(' + '),
    selectedClient?.name,
  ].filter(Boolean).join(' — ').slice(0, 255);

  // Rows nobody filled in would be saved as "Untitled" at 0 — say so instead.
  const lineItemProblem = (): string | null => {
    if (form.type === 'template' && lineItems.some((li) => !li.templateId)) {
      return 'Pick a template for every row, or remove the empty ones.';
    }
    if (form.type === 'freeform' && lineItems.some((li) => !li.description.trim() && !li.templateId)) {
      return 'Give every document row a description or type, or remove the empty ones.';
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newClient) {
      setError('Finish creating the new client (or cancel it) first.');
      return;
    }
    const problem = lineItemProblem();
    if (problem) {
      setError(problem);
      return;
    }
    if (languageClash) {
      setError('The templates you picked are for different languages. Put them in separate jobs.');
      return;
    }
    if (!sourceId || (isTranslation && !targetId)) {
      setError('Choose the job’s languages.');
      return;
    }
    const title = form.title.trim() || suggestedTitle;
    if (!title) {
      setError('Give the job a title.');
      return;
    }
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        type: form.type,
        title,
        clientId: form.clientId,
        sourceLanguageId: sourceId,
        ...(form.status.startsWith('s:') ? { statusId: form.status.slice(2) } : { status: form.status }),
        isFreeOfCharge: form.isFreeOfCharge,
        lineItems: lineItems.map((li) => ({
          description: li.description.trim(),
          templateId: li.templateId || undefined,
          pageCount: Number(li.pageCount) || 1,
          pricePerPage: Number(li.pricePerPage) || 0,
          useDiscountedPrice: li.useDiscountedPrice,
          discountedPricePerPage: li.discountedPricePerPage ? Number(li.discountedPricePerPage) : undefined,
        })),
      };

      if (isTranslation && targetId) body.targetLanguageId = targetId;
      if (form.description) body.description = form.description;
      if (form.contactId) body.contactId = form.contactId;
      if (form.deadline) body.deadline = form.deadline;
      if (form.isFreeOfCharge && form.freeOfChargeReason) body.freeOfChargeReason = form.freeOfChargeReason;
      if (form.notes) body.notes = form.notes;
      if (isAdmin && assignTo) body.assignToUserId = assignTo;

      const job = await api.post<{ id: string }>('/jobs', body);
      // replace: Back on the new job returns to where the form was opened from, not the form.
      router.replace(`/jobs/${job.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <BackLink href="/jobs" label="Jobs" />
      <h1 className="text-2xl font-bold tracking-tight text-text mb-6">New Job</h1>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {error && <Alert>{error}</Alert>}

        {/* Basic info */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-text">Job Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Type" htmlFor="job-type">
              <Select id="job-type" value={form.type} onChange={(e) => { setForm({ ...form, type: e.target.value as 'template' | 'freeform' }); setLineItems([blankRow()]); }}>
                <option value="template">Template-based</option>
                <option value="freeform">Free-form</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="job-status">
              <Select id="job-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {(statusCatalogue?.filter((st) => st.open) ?? [
                  { stage: 'quote', label: 'Quote', statuses: [] as StatusDef[] },
                  { stage: 'accepted', label: 'Accepted', statuses: [] as StatusDef[] },
                  { stage: 'in_progress', label: 'In Progress', statuses: [] as StatusDef[] },
                ]).map((st) => {
                  const own = st.statuses.filter((x) => !x.hidden);
                  return own.length ? (
                    <optgroup key={st.stage} label={st.label}>
                      <option value={st.stage}>{st.label}</option>
                      {own.map((x) => <option key={x.id} value={`s:${x.id}`}>{x.name}</option>)}
                    </optgroup>
                  ) : <option key={st.stage} value={st.stage}>{st.label}</option>;
                })}
              </Select>
            </Field>
            {isAdmin && (
              <Field label="Assign to" htmlFor="job-assignee" hint="Who works on it. You can add more people on the job page.">
                <Select id="job-assignee" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">Me</option>
                  {colleagues.filter((c) => c.isActive && c.id !== user?.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.role?.name ? ` (${c.role.name})` : ''}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Title" htmlFor="job-title"
            hint={form.title.trim() ? undefined : suggestedTitle ? 'Leave it empty to use the one shown.' : 'Leave it empty: it is made from the documents and the client.'}>
            <Input id="job-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={255}
              placeholder={suggestedTitle || 'e.g. Birth certificate — Karim Nassar'} />
          </Field>
          {showDescription || form.description ? (
            <Field label="Description" htmlFor="job-description">
              <Textarea id="job-description" autoFocus={!form.description} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </Field>
          ) : (
            <button type="button" onClick={() => setShowDescription(true)} className="text-sm font-medium text-primary-text hover:underline">
              + Add a description
            </button>
          )}
        </div>

        {/* Client & Language */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-text">Client</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor="job-client" className="text-sm font-semibold text-text">Client<span className="text-danger ml-0.5" aria-hidden="true">*</span></label>
                {hasPermission('clients:create') && !newClient && (
                  <button type="button" onClick={() => setNewClient({ type: 'person', name: '' })} className="text-xs font-medium text-primary-text hover:underline">
                    + New client
                  </button>
                )}
              </div>
              <ClientPicker id="job-client" value={form.clientId} onChange={(clientId) => setForm((f) => ({ ...f, clientId, contactId: '' }))} required disabled={Boolean(newClient)} />
            </div>
            {isCompany && contacts.length > 0 && (
              <Field label="Contact Person" htmlFor="job-contact">
                <Select id="job-contact" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
                  <option value="">None</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </Select>
              </Field>
            )}
          </div>
          {newClient && (
            <div className="rounded-lg border border-border bg-sunken p-4 space-y-3">
              <div className="text-sm font-semibold text-text">New client</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Type" htmlFor="new-client-type">
                  <Select id="new-client-type" value={newClient.type} onChange={(e) => setNewClient({ ...newClient, type: e.target.value as 'company' | 'person' })}>
                    <option value="person">Person</option>
                    <option value="company">Company</option>
                  </Select>
                </Field>
                <Field label="Name" htmlFor="new-client-name" required className="sm:col-span-2">
                  <Input id="new-client-name" autoFocus value={newClient.name} maxLength={255}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient(); } }} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={handleCreateClient} disabled={creatingClient || !newClient.name.trim()}>
                  {creatingClient ? 'Creating…' : 'Create client'}
                </Button>
                <Button size="sm" onClick={() => setNewClient(null)}>Cancel</Button>
              </div>
              <p className="text-xs text-text-muted">Add emails, phones and addresses later from the client&apos;s page.</p>
            </div>
          )}
          <Field label="Deadline" htmlFor="job-deadline">
            <DateInput id="job-deadline" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} />
          </Field>
        </div>

        {/* Line Items */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-text">
              {form.type === 'template' ? 'Templates' : 'Documents'}
            </h3>
            <Button size="sm" onClick={addLineItem}>
              + Add {form.type === 'template' ? 'Template' : 'Document'}
            </Button>
          </div>

          {form.type === 'template' && availableTemplates.length === 0 && (
            <Alert tone="info" className="mb-3">
              {'You have no active templates yet. '}
              <Link href="/templates/new" className="font-semibold underline">Create a template</Link>
              {' '}or switch the job type to Freeform.
            </Alert>
          )}
          {lineItems.length === 0 && (
            <p className="text-sm text-text-muted py-4 text-center">
              No {form.type === 'template' ? 'templates' : 'documents'} added yet.
            </p>
          )}

          <div className="space-y-3">
            {lineItems.map((li) => (
              <div key={li.key} className="border border-border rounded-lg p-4 bg-sunken">
                {/* Free-form rows get an editable description (manual or type-prefilled) */}
                {form.type === 'freeform' && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-text mb-1">Description</label>
                    <input value={li.description} onChange={(e) => updateLineItem(li.key, { description: e.target.value })}
                      placeholder="Line item description"
                      className="input h-8 px-2 w-full" />
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                  {/* Template / freeform-type selector */}
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-xs font-medium text-text mb-1">
                      {form.type === 'template' ? 'Template' : 'Type'}
                    </label>
                    {form.type === 'template' ? (
                      <select value={li.templateId || ''} onChange={(e) => handleTemplateSelect(li.key, e.target.value)}
                        className="input h-8 px-2 w-full">
                        <option value="">Select...</option>
                        {templatesForRow(li.key).map((t) => <option key={t.id} value={t.id}>{t.name}{pairLabel(t)}{perPage(t.pricePerPage)}</option>)}
                      </select>
                    ) : (
                      <select
                        value={li.freeformTypeId ? `ft:${li.freeformTypeId}` : li.templateId ? `tpl:${li.templateId}` : ''}
                        onChange={(e) => handleFreeformSelect(li.key, e.target.value)}
                        className="input h-8 px-2 w-full">
                        <option value="">Custom (manual entry)</option>
                        {freeformTypes.length > 0 && (
                          <optgroup label="Freeform Types">
                            {freeformTypes.map((t) => <option key={t.id} value={`ft:${t.id}`}>{t.name}{perPage(t.pricePerPage)}</option>)}
                          </optgroup>
                        )}
                        {availableTemplates.length > 0 && (
                          <optgroup label="Simple Templates">
                            {availableTemplates.map((t) => <option key={t.id} value={`tpl:${t.id}`}>{t.name}{perPage(t.pricePerPage)}</option>)}
                          </optgroup>
                        )}
                      </select>
                    )}
                  </div>

                  {/* Pages */}
                  <div className="col-span-1 md:col-span-1">
                    <label className="block text-xs font-medium text-text mb-1">Pages</label>
                    <input type="number" min={1} value={li.pageCount}
                      onChange={(e) => updateLineItem(li.key, { pageCount: parseInt(e.target.value) || 1 })}
                      className="input h-8 px-2 w-full" />
                  </div>

                  {pricesHidden ? (
                    <div className="col-span-1 md:col-span-7 flex items-center justify-end pb-1">
                      <button type="button" onClick={() => removeLineItem(li.key)} className="text-xs font-medium text-danger hover:underline">Remove</button>
                    </div>
                  ) : <>
                  {/* Price */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-text mb-1">Price/Page</label>
                    <input type="number" step="0.01" min={0} value={li.pricePerPage}
                      onChange={(e) => updateLineItem(li.key, { pricePerPage: parseFloat(e.target.value) || 0 })}
                      className="input h-8 px-2 w-full" />
                  </div>

                  {/* Discounted */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-text mb-1">Discounted</label>
                    <input type="number" step="0.01" min={0} value={li.discountedPricePerPage || ''}
                      onChange={(e) => updateLineItem(li.key, { discountedPricePerPage: parseFloat(e.target.value) || 0 })}
                      placeholder="—"
                      className="input h-8 px-2 w-full" />
                  </div>

                  {/* Use discount checkbox */}
                  <div className="col-span-1 flex items-center justify-center pb-1">
                    <label className="flex items-center gap-1 text-xs text-text cursor-pointer" title="Use discounted price">
                      <input type="checkbox" checked={li.useDiscountedPrice}
                        onChange={(e) => updateLineItem(li.key, { useDiscountedPrice: e.target.checked })}
                        disabled={!li.discountedPricePerPage}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary" />
                      Disc.
                    </label>
                  </div>

                  {/* Line total + delete */}
                  <div className="col-span-2 flex items-center justify-between pb-1">
                    <span className="text-sm font-semibold text-text">{formatCurrency(getLineTotal(li), baseCurrency)}</span>
                    <button type="button" onClick={() => removeLineItem(li.key)} className="text-xs font-medium text-danger hover:underline">Remove</button>
                  </div>
                  </>}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          {lineItems.length > 0 && !pricesHidden && (
            <div className="flex justify-end mt-4 pt-4 border-t border-border">
              <div className="text-right">
                <span className="text-sm text-text-secondary mr-4">Total:</span>
                <span className="text-lg font-bold text-text">{formatCurrency(grandTotal, baseCurrency)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Languages: from the templates when they set them */}
        <div className="card p-6 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-text">Languages</h3>
            {(sourceAllowed !== null || targetAllowed !== null) && !languageClash && (
              <span className="text-xs text-text-muted">Set by the template{chosen.length > 1 ? 's' : ''}</span>
            )}
          </div>
          {languageClash && (
            <Alert>The templates you picked are for different languages. Put them in separate jobs.</Alert>
          )}
          <label className={`flex items-center gap-2 text-sm text-text ${targetAllowed !== null ? 'opacity-60' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={isTranslation} disabled={targetAllowed !== null}
              onChange={(e) => setForm({ ...form, isTranslation: e.target.checked, targetLanguageId: '' })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            Translation job (has a target language)
          </label>
          <div className={`grid gap-4 ${isTranslation ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <Field label={isTranslation ? 'Source Language' : 'Language'} htmlFor="job-source" required>
              <Select id="job-source" value={sourceId} required disabled={sourceAllowed?.length === 1}
                onChange={(e) => setForm({ ...form, sourceLanguageId: e.target.value })}>
                <option value="">Select...</option>
                {languages.filter((l) => sourceAllowed === null || sourceAllowed.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
              </Select>
            </Field>
            {isTranslation && (
              <Field label="Target Language" htmlFor="job-target" required>
                <Select id="job-target" value={targetId} required disabled={targetAllowed?.length === 1}
                  onChange={(e) => setForm({ ...form, targetLanguageId: e.target.value })}>
                  <option value="">Select...</option>
                  {languages.filter((l) => targetAllowed === null || targetAllowed.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                </Select>
              </Field>
            )}
          </div>
          {languages.length === 0 && (
            <Alert tone="warning">No languages are set up yet. An admin can add them in Settings &gt; Languages.</Alert>
          )}
        </div>

        {/* Pro bono */}
        <div className="card p-6 space-y-4">
          <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
            <input type="checkbox" checked={form.isFreeOfCharge} onChange={(e) => setForm({ ...form, isFreeOfCharge: e.target.checked })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            Free of charge (pro bono)
          </label>
          {form.isFreeOfCharge && (
            <Field label="Reason" htmlFor="job-foc-reason">
              <Input id="job-foc-reason" value={form.freeOfChargeReason} onChange={(e) => setForm({ ...form, freeOfChargeReason: e.target.value })} placeholder="Optional" />
            </Field>
          )}
        </div>

        {/* Notes */}
        <div className="card p-6">
          <Field label="Notes" htmlFor="job-notes">
            <Textarea id="job-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </Field>
        </div>

        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Job'}
          </Button>
          <Button onClick={() => void back.go()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
