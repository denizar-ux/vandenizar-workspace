import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, TextArea, Select, DateInput, MoneyInput, NumberInput, Chips, Empty, Segmented } from '../ui/kit.jsx';
import { openOverlay, openMenu, toast, confirmDialog, SheetHead, SheetBody, SheetFoot, useMedia, DESKTOP_Q } from '../ui/overlay.jsx';
import { PageHeader, BackBar, AddBtn, InvoicePill } from '../ui/parts.jsx';
import { navigate, back } from '../lib/router.js';
import { get, all, put, patch, remove, uid, useStore } from '../lib/db.js';
import { today, addDays, fmtShort, fmtFull, isoOf } from '../lib/date.js';
import { fmtMoney, CURRENCIES } from '../lib/money.js';
import { saveFile, saveMessage, loadJsPdf } from '../lib/files.js';
import * as M from '../lib/model.js';

const CUR_OPTS = Object.keys(CURRENCIES);

export function createInvoiceAndOpen(preset = {}) {
  const inv = M.newInvoice(preset);
  navigate('/invoices/' + inv.id);
  return inv;
}

export function InvoicesPage({ query }) {
  useStore();
  const desktop = useMedia(DESKTOP_Q);
  const [filter, setFilter] = useState(query.status || 'all');
  const [q, setQ] = useState('');
  const [arch, setArch] = useState(false);
  useEffect(() => { if (query.status) setFilter(query.status); }, [query.status]);
  const cur = M.settings().defaultCurrency;
  const f = M.invoiceSummary(cur);
  const rows = M.liveInvoices().filter((i) => !!i.archived === arch).map((i) => ({ i, c: M.calcInvoice(i) }));
  const match = (r, st) => (st === 'open' ? r.c.balance > 0 && r.c.status !== 'draft' : r.c.status === st);
  const count = (st) => rows.filter((r) => match(r, st)).length;
  let list = filter === 'all' ? rows : rows.filter((r) => match(r, filter));
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter(({ i }) => [i.number, M.clientName(i.clientId), get('pmProjects', i.projectId)?.name].some((x) => (x || '').toLowerCase().includes(t))); }
  list.sort((a, b) => (b.i.date || '').localeCompare(a.i.date || '') || b.i.number.localeCompare(a.i.number));
  return (
    <div class="page">
      <PageHeader title="Invoices." actions={<AddBtn label="New invoice" onClick={() => createInvoiceAndOpen({})} />} />
      <div class="sum-grid four">
        <div><span>Invoiced</span><b class="tnum">{fmtMoney(f.invoiced, cur, { compact: true })}</b></div>
        <div><span>Received</span><b class="tnum">{fmtMoney(f.received, cur, { compact: true })}</b></div>
        <div><span>Outstanding</span><b class="tnum">{fmtMoney(f.outstanding, cur, { compact: true })}</b></div>
        <div class={f.overdue ? 'bad' : ''}><span>Overdue</span><b class="tnum">{fmtMoney(f.overdue, cur, { compact: true })}</b></div>
      </div>
      <div class="chips scroll">
        {[['all', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['partial', 'Partial'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['open', 'Unpaid']].map(([id, label]) => <button class={'chip ' + (filter === id ? 'on' : '')} onClick={() => setFilter(id)}>{label}{id !== 'all' && count(id) > 0 && <span class="chip-count">{count(id)}</span>}</button>)}
      </div>
      <div class="row gap-8">
        <div class="search-box grow"><Icon name="search" size={17} /><input id="inv-q" value={q} placeholder="Search number, client, project" onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <Segmented options={[{ id: false, label: 'Current' }, { id: true, label: 'Archived' }]} value={arch} onChange={setArch} />
      </div>
      {!list.length ? <Empty icon="file" title="No invoices here" action={!arch && <button class="btn sm primary" onClick={() => createInvoiceAndOpen({})}>Create invoice</button>} /> : desktop ? (
        <section class="sheet-surface flush"><div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Number</th><th>Client</th><th>Project</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead>
          <tbody>{list.map(({ i, c }) => (
            <tr class="clickable" onClick={() => navigate('/invoices/' + i.id)}>
              <td class="tnum strong">{i.number}</td><td>{M.clientName(i.clientId)}</td><td class="muted">{get('pmProjects', i.projectId)?.name || '—'}</td>
              <td class="muted">{fmtShort(i.date)}</td><td class={c.status === 'overdue' ? 'bad strong' : 'muted'}>{fmtShort(i.dueDate)}</td>
              <td class="num">{fmtMoney(c.total, i.currency)}</td><td class="num strong">{c.status === 'draft' ? '—' : fmtMoney(Math.max(0, c.balance), i.currency)}</td><td><InvoicePill status={c.status} /></td>
            </tr>))}</tbody>
        </table></div></section>
      ) : (
        <section class="sheet-surface"><div class="list">{list.map(({ i, c }) => (
          <a class="list-row clickable" href={'#/invoices/' + i.id}>
            <div class="row-main"><div class="row-title tnum">{i.number}</div><div class="row-meta">{M.clientName(i.clientId)} · due {fmtShort(i.dueDate)}</div></div>
            <div class="col" style={{ alignItems: 'flex-end', gap: 4 }}><span class="tnum strong">{fmtMoney(c.status === 'draft' || c.status === 'paid' ? c.total : c.balance, i.currency, { compact: true })}</span><InvoicePill status={c.status} /></div>
          </a>))}</div></section>
      )}
    </div>
  );
}

function openPaymentSheet(inv, payment) { openOverlay((close) => <PaymentSheet inv={inv} payment={payment} close={close} />, { kind: 'sheet' }); }
function PaymentSheet({ inv, payment, close }) {
  const c = M.calcInvoice(inv);
  const maxAllowed = c.balance + (payment ? payment.amount : 0);
  const first = !payment && c.paid === 0;
  const [p, setP] = useState(() => (payment ? { ...payment } : { amount: maxAllowed, date: today(), method: 'Bank transfer', kind: first ? 'Full payment' : 'Final payment', reference: '', notes: '' }));
  const set = (ch) => setP({ ...p, ...ch });
  const save = () => {
    const amt = Math.round(+p.amount || 0);
    if (amt <= 0) return toast('Enter an amount above zero.', { tone: 'warn' });
    if (amt > maxAllowed) return toast('That is more than the ' + fmtMoney(maxAllowed, inv.currency) + ' still owed.', { tone: 'warn' });
    if (!p.date) return toast('Add the date you received it.', { tone: 'warn' });
    if (payment) { put('payments', { ...payment, ...p, amount: amt, history: [...(payment.history || []), { at: Date.now(), before: { amount: payment.amount, date: payment.date, method: payment.method, kind: payment.kind } }] }); toast('Payment updated'); }
    else { M.recordPayment(inv, { ...p, amount: amt }); const after = M.calcInvoice(get('invoices', inv.id)); toast(after.status === 'paid' ? 'Paid in full' : 'Recorded. ' + fmtMoney(after.balance, inv.currency) + ' left.'); }
    close();
  };
  const dp = Math.round(c.total / 2);
  return (
    <>
      <SheetHead title={payment ? 'Edit payment' : 'Record payment'} sub={inv.number + ' · ' + fmtMoney(c.balance, inv.currency) + ' outstanding'} onClose={close} />
      <SheetBody><div class="form">
        <Field label="Type"><Chips options={M.PAYMENT_KINDS} value={p.kind} onChange={(v) => set({ kind: v, ...(v === 'Full payment' || v === 'Final payment' ? { amount: maxAllowed } : v === 'DP / deposit' && !payment ? { amount: Math.min(dp, maxAllowed) } : {}) })} /></Field>
        <Field label="Amount" htmlFor="pay-amt" hint={!payment && c.paid === 0 ? '50% DP would be ' + fmtMoney(dp, inv.currency) : null}><MoneyInput id="pay-amt" value={p.amount} currency={inv.currency} onChange={(v) => set({ amount: v })} /></Field>
        <div class="form-row">
          <Field label="Date received" htmlFor="pay-date"><DateInput id="pay-date" value={p.date} onChange={(v) => set({ date: v })} clearable={false} /></Field>
          <Field label="Method" htmlFor="pay-method"><Select id="pay-method" value={p.method} onChange={(v) => set({ method: v })} options={M.PAYMENT_METHODS} /></Field>
        </div>
        <Field label="Reference" htmlFor="pay-ref"><TextInput id="pay-ref" value={p.reference} onInput={(v) => set({ reference: v })} placeholder="Transfer ID, bank, sender" /></Field>
        <Field label="Notes" htmlFor="pay-notes"><TextArea id="pay-notes" value={p.notes} onInput={(v) => set({ notes: v })} minRows={1} /></Field>
        {!inv.sentAt && <div class="field-hint">This invoice is a draft. Recording a payment marks it as sent.</div>}
      </div></SheetBody>
      <SheetFoot><button class="btn ghost" onClick={close}>Cancel</button><button class="btn primary" onClick={save}>{payment ? 'Save' : 'Record payment'}</button></SheetFoot>
    </>
  );
}

export function InvoiceEditor({ id }) {
  useStore();
  const inv = get('invoices', id);
  const s = M.settings();
  useEffect(() => { if (inv) M.touchRecent('invoice', id); }, [id]);
  const [numDraft, setNumDraft] = useState(inv?.number || '');
  useEffect(() => { setNumDraft(inv?.number || ''); }, [inv?.number]);
  if (!inv || inv.deletedAt) return <div class="page narrow"><BackBar onBack={() => back('/invoices')} /><Empty icon="file" title="Invoice not found" /></div>;
  const c = M.calcInvoice(inv);
  const set = (ch) => { const n = { ...inv, ...ch }; if (ch.clientId !== undefined && !inv.sentAt) n.clientSnapshot = M.clientSnapshot(ch.clientId); patch('invoices', id, n); };
  const setItem = (iid, ch) => set({ items: inv.items.map((it) => (it.id === iid ? { ...it, ...ch } : it)) });
  const project = get('pmProjects', inv.projectId);
  const clients = M.liveClients().filter((x) => !x.archived || x.id === inv.clientId);
  const projects = M.liveProjects().filter((p) => (!p.archived || p.id === inv.projectId) && (!inv.clientId || p.clientId === inv.clientId || p.id === inv.projectId));
  const itemTpls = all('templates').filter((t) => t.kind === 'items' && !t.archived);
  const termTpls = all('templates').filter((t) => t.kind === 'terms' && !t.archived);
  const payments = all('payments').filter((p) => p.invoiceId === id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const commitNumber = () => {
    const n = numDraft.trim();
    if (!n || n === inv.number) return setNumDraft(inv.number);
    if (M.numberTaken(n, id)) { toast(n + ' is already used. Invoice numbers are never reused.', { tone: 'warn' }); return setNumDraft(inv.number); }
    M.reserveInvoiceNumber(n);
    set({ number: n });
  };
  const del = async () => {
    const pc = payments.length;
    if (!(await confirmDialog({ title: 'Delete ' + inv.number + '?', body: pc ? 'This also deletes ' + pc + ' payment record(s). Archiving keeps the history instead.' : 'This cannot be undone. The number stays reserved and is never reused.', confirmLabel: 'Delete invoice', danger: true }))) return;
    payments.forEach((p) => remove('payments', p.id));
    all('pmTasks').filter((t) => t.invoiceId === id).forEach((t) => patch('pmTasks', t.id, { invoiceId: null }));
    remove('invoices', id);
    toast('Invoice deleted');
    back('/invoices');
  };
  const duplicate = () => {
    const { num, key, seq } = M.nextInvoiceNumber();
    M.reserveInvoiceNumber(num, key, seq);
    const d = put('invoices', { ...inv, id: uid(), number: num, date: today(), dueDate: addDays(today(), +inv.termsDays || s.defaultTermsDays), sentAt: null, archived: false, items: inv.items.map((it) => ({ ...it, id: uid() })), clientSnapshot: M.clientSnapshot(inv.clientId), issuer: null, createdAt: undefined, sample: undefined });
    toast('Duplicated as ' + num);
    navigate('/invoices/' + d.id);
  };
  const locked = !!inv.sentAt;
  return (
    <div class="page">
      <BackBar onBack={() => back('/invoices')} right={<button class="icon-btn ghost" aria-label="Invoice actions" onClick={(e) => openMenu(e, [
        { label: 'Preview', icon: 'file', onSelect: () => openPreview(inv) },
        { label: 'Download PDF', icon: 'download', onSelect: () => downloadPdf(inv) },
        { label: 'Duplicate', icon: 'copy', onSelect: duplicate },
        { label: 'Add follow-up task', icon: 'tasks', onSelect: () => { const t = M.newTask({ title: 'Follow up ' + inv.number + ' with ' + M.clientName(inv.clientId), invoiceId: id, projectId: inv.projectId || null, workDate: today() }); toast('Follow-up added for today', { action: { label: 'Open', run: () => navigate('/tasks/' + t.id) } }); } },
        inv.sentAt && c.paid === 0 && { label: 'Move back to draft', icon: 'restore', onSelect: () => set({ sentAt: null }) },
        inv.archived ? { label: 'Restore from archive', icon: 'restore', onSelect: () => set({ archived: false }) } : { label: 'Archive', icon: 'archive', onSelect: () => { set({ archived: true }); toast('Archived'); } },
        { label: 'Delete', icon: 'trash', danger: true, onSelect: del },
      ])}><Icon name="more" size={22} /></button>} />
      <div class="row gap-8 wrap"><span class="eyebrow">Invoice</span><InvoicePill status={c.status} />{inv.archived && <span class="pill sm t-plain">Archived</span>}</div>
      <h1 class="ph-title tnum">{inv.number}</h1>
      <div class="row gap-8 wrap">
        {c.status === 'draft' && <button class="btn primary" onClick={() => { M.markSent(inv); toast('Marked as sent. Recipient details are locked in.'); }}><Icon name="send" size={16} />Mark sent</button>}
        {c.status !== 'draft' && c.balance > 0 && <button class="btn primary" onClick={() => openPaymentSheet(inv)}><Icon name="money" size={16} />Record payment</button>}
        {c.status !== 'draft' && c.balance > 0 && <button class="btn outline" onClick={() => { M.recordPayment(inv, { amount: c.balance, date: today(), method: 'Bank transfer', kind: c.paid ? 'Final payment' : 'Full payment' }); toast('Marked paid'); }}><Icon name="check" size={16} />Mark paid</button>}
        <button class="btn outline" onClick={() => openPreview(inv)}><Icon name="file" size={16} />Preview</button>
        <button class="btn outline" onClick={() => downloadPdf(inv)}><Icon name="download" size={16} />PDF</button>
      </div>
      <div class="two-col">
        <div class="stack">
          <section class="block">
            <div class="form">
              <Field label="Invoice number" htmlFor="inv-number" hint="Filled in automatically. Numbers already used are blocked.">
                <div class="row gap-6">
                  <input class="input tnum grow" id="inv-number" value={numDraft} onInput={(e) => setNumDraft(e.currentTarget.value)} onBlur={commitNumber} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                  <button class="btn outline" title="Use the next automatic number" onClick={() => { const { num, key, seq } = M.nextInvoiceNumber(); M.reserveInvoiceNumber(num, key, seq); set({ number: num }); setNumDraft(num); }}>Auto</button>
                </div>
              </Field>
              <div class="form-row">
                <Field label="Client" htmlFor="inv-client"><Select id="inv-client" value={inv.clientId} onChange={(v) => set({ clientId: v, projectId: get('pmProjects', inv.projectId)?.clientId === v ? inv.projectId : '' })} placeholder="Choose client" options={clients.map((x) => ({ id: x.id, label: x.name }))} /></Field>
                <Field label="Project (optional)" htmlFor="inv-project"><Select id="inv-project" value={inv.projectId} onChange={(v) => { const p = get('pmProjects', v); set({ projectId: v, ...(p && !inv.clientId && p.clientId ? { clientId: p.clientId } : {}) }); }} placeholder="None" options={projects.map((p) => ({ id: p.id, label: p.name }))} /></Field>
              </div>
              {locked && <div class="field-hint">Sent {fmtShort(isoOf(inv.sentAt))}. The PDF keeps the recipient as it was then: {M.invoiceRecipient(inv)?.name || '—'}.</div>}
              <div class="form-row three">
                <Field label="Invoice date" htmlFor="inv-date"><DateInput id="inv-date" value={inv.date} clearable={false} onChange={(v) => set({ date: v, dueDate: addDays(v, +inv.termsDays || 0) })} /></Field>
                <Field label="Terms (days)" htmlFor="inv-terms"><NumberInput id="inv-terms" value={inv.termsDays} onChange={(v) => set({ termsDays: v, dueDate: addDays(inv.date, +v || 0) })} /></Field>
                <Field label="Due date" htmlFor="inv-due"><DateInput id="inv-due" value={inv.dueDate} clearable={false} onChange={(v) => set({ dueDate: v })} /></Field>
              </div>
              <Field label="Currency" htmlFor="inv-cur"><Select id="inv-cur" value={inv.currency} onChange={(v) => set({ currency: v })} options={CUR_OPTS} /></Field>
            </div>
          </section>
          <section class="block">
            <div class="block-head"><h2 class="block-title">Line items</h2>{itemTpls.length > 0 && <button class="btn xs outline" onClick={(e) => openMenu(e, itemTpls.map((t) => ({ label: t.name, onSelect: () => { set({ items: [...inv.items.filter((it) => it.desc || it.rate), ...(t.data?.items || []).map((x) => ({ ...x, id: uid() }))] }); toast('Items added'); } })))}>Add preset</button>}</div>
            <div class="inv-items">
              {inv.items.map((it, n) => (
                <div class="inv-item">
                  <span class="muted tnum strong" style={{ paddingTop: 12 }}>{n + 1}</span>
                  <div class="inv-item-fields">
                    <input class="input" id={'ii-d-' + it.id} value={it.desc} placeholder="Description" onInput={(e) => setItem(it.id, { desc: e.currentTarget.value })} aria-label="Description" />
                    <div class="inv-item-nums">
                      <input class="input tnum" id={'ii-q-' + it.id} type="number" inputMode="decimal" min="0" step="0.5" value={it.qty} onInput={(e) => setItem(it.id, { qty: e.currentTarget.value === '' ? '' : Math.max(0, +e.currentTarget.value) })} aria-label="Quantity" />
                      <MoneyInput id={'ii-r-' + it.id} value={it.rate} currency={inv.currency} onChange={(v) => setItem(it.id, { rate: v })} />
                      <span class="inv-amount tnum">{fmtMoney(Math.round((+it.qty || 0) * (+it.rate || 0)), inv.currency)}</span>
                    </div>
                  </div>
                  <button class="icon-btn ghost sm" aria-label="Remove item" disabled={inv.items.length <= 1} onClick={() => set({ items: inv.items.filter((x) => x.id !== it.id) })}><Icon name="x" size={15} /></button>
                </div>
              ))}
            </div>
            <button class="btn sm outline" style={{ marginTop: 10 }} onClick={() => set({ items: [...inv.items, { id: uid(), desc: '', qty: 1, rate: 0 }] })}><Icon name="plus" size={15} />Add item</button>
            <div class="form-row" style={{ margin: '18px 0 12px' }}>
              <Field label="Discount" htmlFor="inv-dtype"><Select id="inv-dtype" value={inv.discountType} onChange={(v) => set({ discountType: v, discountValue: 0 })} options={[{ id: 'none', label: 'No discount' }, { id: 'percent', label: 'Percent' }, { id: 'amount', label: 'Fixed amount' }]} /></Field>
              {inv.discountType === 'percent' && <Field label="Percent" htmlFor="inv-dval"><NumberInput id="inv-dval" value={inv.discountValue} onChange={(v) => set({ discountValue: Math.min(100, Math.max(0, +v || 0)) })} /></Field>}
              {inv.discountType === 'amount' && <Field label="Amount" htmlFor="inv-dval"><MoneyInput id="inv-dval" value={inv.discountValue} currency={inv.currency} onChange={(v) => set({ discountValue: Math.max(0, v) })} /></Field>}
            </div>
            <div class="totals">
              <div class="tr"><span>Subtotal</span><span>{fmtMoney(c.subtotal, inv.currency)}</span></div>
              {c.discount > 0 && <div class="tr"><span>Discount{inv.discountType === 'percent' ? ` (${inv.discountValue}%)` : ''}</span><span>− {fmtMoney(c.discount, inv.currency)}</span></div>}
              <div class="tr big"><span>Total</span><span>{fmtMoney(c.total, inv.currency)}</span></div>
              <div class="tr"><span>Paid</span><span>{fmtMoney(c.paid, inv.currency)}</span></div>
              <div class="tr bal"><span>Balance due</span><span>{fmtMoney(Math.max(0, c.balance), inv.currency)}</span></div>
            </div>
          </section>
          <section class="block">
            <div class="block-head"><h2 class="block-title">Terms & payment details</h2>{termTpls.length > 0 && <button class="btn xs outline" onClick={(e) => openMenu(e, termTpls.map((t) => ({ label: t.name, onSelect: () => set({ terms: t.data?.terms ?? inv.terms, notes: t.data?.notes ?? inv.notes }) })))}>Use template</button>}</div>
            <div class="form">
              <Field label="Payment instructions" htmlFor="inv-pay" hint={!inv.paymentInstructions && !s.paymentInstructions ? 'Save your bank details once in Settings → Freelance & invoices.' : null}><TextArea id="inv-pay" value={inv.paymentInstructions} onInput={(v) => set({ paymentInstructions: v })} placeholder="Bank, account name and number" /></Field>
              <Field label="Terms" htmlFor="inv-termtext"><TextArea id="inv-termtext" value={inv.terms} onInput={(v) => set({ terms: v })} /></Field>
              <Field label="Notes" htmlFor="inv-notes"><TextArea id="inv-notes" value={inv.notes} onInput={(v) => set({ notes: v })} placeholder="Thank-you note, PO number, scope" /></Field>
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="block">
            <div class="block-head"><h2 class="block-title">Payments <span class="count">{payments.filter((p) => !p.voided).length}</span></h2>{c.balance > 0 && <button class="btn xs outline" onClick={() => openPaymentSheet(inv)}><Icon name="plus" size={14} />Payment</button>}</div>
            {payments.length ? <div class="list">{payments.map((p) => (
              <div class={'list-row' + (p.voided ? ' voided' : '')}>
                <span class="swatch t-sage" />
                <div class="row-main"><div class="row-title tnum">{fmtMoney(p.amount, inv.currency)}</div><div class="row-meta">{p.kind || 'Payment'} · {fmtShort(p.date)} · {p.method}{p.reference ? ' · ' + p.reference : ''}{p.voided ? ' · Voided' : ''}</div></div>
                <button class="icon-btn ghost sm" aria-label="Payment actions" onClick={(e) => openMenu(e, p.voided ? [
                  { label: 'Restore payment', icon: 'restore', onSelect: () => { if (p.amount > c.balance) return toast('Restoring would overpay this invoice.', { tone: 'warn' }); patch('payments', p.id, { voided: false, voidedAt: null }); toast('Payment restored'); } },
                ] : [
                  { label: 'Edit', icon: 'edit', onSelect: () => openPaymentSheet(inv, p) },
                  { label: 'Void payment', icon: 'x', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Void this payment?', body: fmtMoney(p.amount, inv.currency) + ' stops counting toward the balance. The record stays in the history.', confirmLabel: 'Void', danger: true })) { patch('payments', p.id, { voided: true, voidedAt: Date.now() }); toast('Payment voided'); } } },
                ])}><Icon name="more" /></button>
              </div>))}</div> : <div class="quiet-note">{c.status === 'draft' ? 'Mark the invoice as sent, then record DP, partial or full payments here.' : 'No payments yet.'}</div>}
          </section>
          {project && <a class={'pcard t-' + M.stageOf(project.stage).tone} href={'#/projects/' + project.id}><div class="eyebrow">Project</div><div class="pcard-title">{project.name}</div><div class="pcard-sub">{M.stageOf(project.stage).label}</div></a>}
          <div class="quiet-note">Created {fmtFull(isoOf(inv.createdAt))}{inv.sentAt ? ' · sent ' + fmtFull(isoOf(inv.sentAt)) : ''}. Changes save automatically.</div>
        </div>
      </div>
    </div>
  );
}

// ---------- preview & PDF (always English) ----------
function openPreview(inv) { openOverlay((close) => <PreviewSheet id={inv.id} close={close} />, { kind: 'sheet', wide: true }); }
function PreviewSheet({ id, close }) {
  const inv = get('invoices', id);
  const c = M.calcInvoice(inv);
  const from = M.invoiceIssuer(inv);
  const to = M.invoiceRecipient(inv) || {};
  const project = inv.projectSnapshot?.name || get('pmProjects', inv.projectId)?.name;
  const m = (v) => fmtMoney(v, inv.currency);
  const Label = ({ children }) => <div class="paper-label">{children}</div>;
  return (
    <>
      <SheetHead title="Preview" sub="This is what the PDF contains" onClose={close} right={<button class="btn sm primary" onClick={() => downloadPdf(inv)}><Icon name="download" size={15} />PDF</button>} />
      <SheetBody>
        <div class="paper">
          <div class="row between" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div><div class="strong" style={{ fontSize: 18 }}>{from.name}</div><div class="muted" style={{ whiteSpace: 'pre-wrap' }}>{[from.owner, from.address, from.email, from.phone, from.website].filter(Boolean).join('\n')}</div></div>
            <div style={{ textAlign: 'right' }}><div class="paper-h">Invoice</div><div class="strong tnum">{inv.number}</div><div class="muted">Date: {fmtFull(inv.date)}</div><div class="muted">Due: {fmtFull(inv.dueDate)}</div></div>
          </div>
          <div class="paper-grid">
            <div><Label>Bill to</Label><div class="strong">{to.name || '—'}</div><div class="muted" style={{ whiteSpace: 'pre-wrap' }}>{[to.pic, to.email, to.phone, to.address].filter(Boolean).join('\n')}</div></div>
            {project && <div><Label>Project</Label><div class="strong">{project}</div></div>}
          </div>
          <table>
            <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
            <tbody>{c.items.map((it) => <tr><td style={{ whiteSpace: 'pre-wrap' }}>{it.desc || '—'}</td><td class="num">{it.qty}</td><td class="num">{m(it.rate)}</td><td class="num">{m(it.amount)}</td></tr>)}</tbody>
          </table>
          <div class="totals" style={{ marginLeft: 'auto', maxWidth: 320, marginTop: 14 }}>
            <div class="tr"><span>Subtotal</span><span>{m(c.subtotal)}</span></div>
            {c.discount > 0 && <div class="tr"><span>Discount</span><span>− {m(c.discount)}</span></div>}
            <div class="tr big"><span>Total</span><span>{m(c.total)}</span></div>
            {c.paid > 0 && <div class="tr"><span>Paid</span><span>− {m(c.paid)}</span></div>}
            <div class="tr bal"><span>Balance due</span><span>{m(Math.max(0, c.balance))}</span></div>
          </div>
          {c.payments.length > 0 && <div style={{ marginTop: 18 }}><Label>Payments received</Label>{c.payments.map((p) => <div class="row between"><span>{fmtFull(p.date)} · {p.kind || p.method}</span><span class="tnum">{m(p.amount)}</span></div>)}</div>}
          {[['Payment instructions', inv.paymentInstructions], ['Terms', inv.terms], ['Notes', inv.notes]].filter(([, v]) => v).map(([k, v]) => <div style={{ marginTop: 16 }}><Label>{k}</Label><div style={{ whiteSpace: 'pre-wrap' }}>{v}</div></div>)}
        </div>
      </SheetBody>
    </>
  );
}
export async function buildInvoicePdf(inv) {
  const jsPDF = await loadJsPdf();
  const c = M.calcInvoice(inv);
  const from = M.invoiceIssuer(inv);
  const to = M.invoiceRecipient(inv) || {};
  const project = inv.projectSnapshot?.name || get('pmProjects', inv.projectId)?.name;
  const m = (v) => fmtMoney(v, inv.currency);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, L = 18, R = W - 18;
  const ink = [17, 17, 15], muted = [110, 111, 105], line = [226, 224, 216];
  let y = 18;
  doc.setFillColor(...ink); doc.rect(L, 12, R - L, 0.8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ink);
  doc.text(from.name || 'Invoice', L, y + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  let fy = y + 14;
  for (const l of [from.owner, from.address, from.email, from.phone, from.website].filter(Boolean)) for (const part of doc.splitTextToSize(String(l), 85)) { doc.text(part, L, fy); fy += 4.4; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(26); doc.setTextColor(...ink);
  doc.text('Invoice', R, y + 9, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(inv.number, R, y + 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text(`Invoice date: ${fmtFull(inv.date)}`, R, y + 22, { align: 'right' });
  doc.text(`Due date: ${fmtFull(inv.dueDate)}`, R, y + 26.5, { align: 'right' });
  y = Math.max(fy, y + 32) + 6;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.text('BILL TO', L, y);
  if (project) doc.text('PROJECT', 112, y);
  y += 5;
  doc.setFontSize(10.5); doc.setTextColor(...ink); doc.text(to.name || '-', L, y);
  if (project) doc.text(doc.splitTextToSize(project, 80), 112, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
  let ty = y + 5;
  for (const l of [to.pic, to.email, to.phone, to.address].filter(Boolean)) for (const part of doc.splitTextToSize(String(l), 85)) { doc.text(part, L, ty); ty += 4.4; }
  y = ty + 8;
  const cols = { d: L, q: 122, r: 152, a: R };
  const head = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...muted);
    doc.text('DESCRIPTION', cols.d, y); doc.text('QTY', cols.q, y, { align: 'right' }); doc.text('RATE', cols.r + 12, y, { align: 'right' }); doc.text('AMOUNT', cols.a, y, { align: 'right' });
    y += 2.5; doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(L, y, R, y); y += 5.5;
  };
  const pageBreak = (need) => { if (y + need > 275) { doc.addPage(); y = 20; head(); } };
  head();
  doc.setFontSize(9.5);
  for (const it of c.items) {
    const lines = doc.splitTextToSize(it.desc || '-', 95);
    pageBreak(lines.length * 4.6 + 4);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink);
    doc.text(lines, cols.d, y);
    doc.text(String(it.qty), cols.q, y, { align: 'right' });
    doc.text(m(it.rate), cols.r + 12, y, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.text(m(it.amount), cols.a, y, { align: 'right' });
    y += lines.length * 4.6 + 2; doc.setDrawColor(238, 236, 230); doc.line(L, y, R, y); y += 5;
  }
  pageBreak(40);
  const row = (label, val, bold, color) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9.5); doc.setTextColor(...(color || (bold ? ink : muted))); doc.text(label, 132, y); doc.setTextColor(...(color || ink)); doc.text(val, R, y, { align: 'right' }); y += bold ? 7 : 5.5; };
  y += 2;
  row('Subtotal', m(c.subtotal));
  if (c.discount > 0) row(`Discount${inv.discountType === 'percent' ? ` (${inv.discountValue}%)` : ''}`, '- ' + m(c.discount));
  doc.setDrawColor(...line); doc.line(132, y - 2.5, R, y - 2.5); y += 2;
  row('Total', m(c.total), true);
  if (c.paid > 0) row('Paid', '- ' + m(c.paid));
  row('Balance due', m(Math.max(0, c.balance)), true, [196, 62, 57]);
  y += 4;
  const block = (title, text) => {
    if (!text) return;
    const lines = doc.splitTextToSize(String(text), R - L);
    pageBreak(lines.length * 4.4 + 10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...muted); doc.text(title.toUpperCase(), L, y); y += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink); doc.text(lines, L, y); y += lines.length * 4.4 + 5;
  };
  if (c.payments.length) block('Payments received', c.payments.map((p) => `${fmtFull(p.date)}  ·  ${p.kind || 'Payment'}  ·  ${p.method}${p.reference ? '  ·  ' + p.reference : ''}  ·  ${m(p.amount)}`).join('\n'));
  block('Payment instructions', inv.paymentInstructions);
  block('Terms', inv.terms);
  block('Notes', inv.notes);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.text(`${inv.number}  ·  Page ${i} of ${pages}`, R, 288, { align: 'right' }); doc.text(from.name || '', L, 288); }
  return doc;
}
async function downloadPdf(inv) {
  try {
    const doc = await buildInvoicePdf(inv);
    const name = `${inv.number}${M.clientName(inv.clientId) !== 'No client' ? ' - ' + M.clientName(inv.clientId) : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    const r = await saveFile(name, doc.output('blob'), 'application/pdf');
    const [msg, tone] = saveMessage(r, 'PDF saved: ' + name);
    toast(msg, { tone, duration: tone ? 5000 : 2600 });
  } catch (e) { toast('Could not create the PDF: ' + e.message, { tone: 'warn' }); }
}
