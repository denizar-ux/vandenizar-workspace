// Resources: a short list of links you open often (name + link).
import { useState } from 'preact/hooks';
import { Icon } from '../ui/Icon.jsx';
import { Field, TextInput, Empty } from '../ui/kit.jsx';
import { PageHeader, AddBtn, BackBar } from '../ui/parts.jsx';
import { openOverlay, SheetHead, SheetBody, SheetFoot, toast } from '../ui/overlay.jsx';
import { back } from '../lib/router.js';
import { get, useStore } from '../lib/db.js';
import * as C from '../content/model.js';

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } };

export function ResourcesPage() {
  useStore();
  const list = C.links();
  return (
    <div class="page narrow">
      <BackBar onBack={() => back('/more')} />
      <PageHeader title="Resources." actions={<AddBtn label="Add resource" onClick={() => openResource(null)} />} />
      {list.length ? (
        <div class="plist">
          {list.map((l) => {
            const name = l.title || C.linkLabel(l.url || '');
            return (
              <div class="prow res-row" key={l.id}>
                <a class="res-open" href={l.url} target="_blank" rel="noopener noreferrer">
                  <span class="res-ic" aria-hidden="true">{name.charAt(0).toUpperCase() || '#'}</span>
                  <span class="prow-main"><span class="prow-title">{name}</span><span class="prow-sub">{host(l.url)}</span></span>
                  <Icon name="external" size={16} />
                </a>
                <button type="button" class="icon-btn ghost sm" aria-label={'Edit ' + name} onClick={() => openResource(l.id)}><Icon name="edit" size={17} /></button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon="link" title="No resources yet" action={<button type="button" class="btn primary sm" onClick={() => openResource(null)}><Icon name="plus" size={16} />Add resource</button>}>Drive folders, Raindrop, your other web apps. Anything you open often, one tap away.</Empty>
      )}
    </div>
  );
}

function openResource(id) { openOverlay((close) => <ResourceSheet id={id} close={close} />, { kind: 'sheet' }); }
function ResourceSheet({ id, close }) {
  const old = id && get('cItems', id);
  const [name, setName] = useState(old ? old.title || '' : '');
  const [url, setUrl] = useState(old ? old.url || '' : '');
  const ok = !!C.normalizeUrl(url);
  const save = () => {
    if (!ok) return;
    if (old) C.updateLink(id, name, url); else C.addLink(name, url);
    close();
    toast(old ? 'Resource saved' : 'Resource added');
  };
  const del = () => {
    C.trashItem(id);
    close();
    toast('Resource deleted', { action: { label: 'Undo', run: () => C.restoreItem(id) } });
  };
  return (
    <>
      <SheetHead title={old ? 'Edit resource' : 'Add resource'} onClose={close} />
      <SheetBody>
        <div class="form">
          <Field label="Link" htmlFor="rs-url" hint={url.trim() && !ok ? "That doesn't look like a link." : null}>
            <TextInput id="rs-url" value={url} onInput={setUrl} inputMode="url" placeholder="drive.google.com/..." autoFocus={!old} onEnter={save} />
          </Field>
          <Field label="Name (optional)" htmlFor="rs-name"><TextInput id="rs-name" value={name} onInput={setName} placeholder={ok ? C.linkLabel(C.normalizeUrl(url)) : 'Brand folder'} onEnter={save} /></Field>
        </div>
      </SheetBody>
      <SheetFoot>
        {old && <button type="button" class="btn danger-soft" onClick={del}>Delete</button>}
        <button type="button" class="btn ghost" onClick={close}>Cancel</button>
        <button type="button" class="btn primary" disabled={!ok} onClick={save}>Save</button>
      </SheetFoot>
    </>
  );
}
