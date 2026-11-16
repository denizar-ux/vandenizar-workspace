-- Studio -> Work sync for content. One Studio post = one Work project (category Konten) with four tasks.
-- Called by a scheduled Claude task: it reads the Studio posts, passes them in as JSON, and applies the
-- returned "studioUpdates" (stage moves) back to Studio. All Work-side rules live here so every run is the same.
--   ids: project "st-<postId>", tasks "st-<postId>-script|shoot|edit|post"  (upserts, never duplicates)
--   progress only moves forward: level = number of leading steps done (Script, Shoot, Edit, Post)
--   Studio stage -> level: idea/script 0, shoot 1, edit 2, ready 3, posted 4
--   posts already posted in Studio are not added to Work (only followed if their project exists)
--   dates follow Studio only when the Studio title/dates changed since the last sync (a manual move in Work sticks)
create or replace function public.konten_sync(
  p_user uuid,
  p_posts jsonb,
  p_today date default ((now() at time zone 'Asia/Jakarta')::date)
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  steps constant text[] := array['script', 'shoot', 'edit', 'post'];
  leads constant int[] := array[4, 3, 1, 0];
  times constant text[] := array['09:00', '09:00', '09:00', '19:00'];
  labels constant text[] := array['Script', 'Shoot', 'Edit', 'Post'];
  studio_url constant text := 'https://claude.ai/artifact/NMb1oEgjEmQD6CzERq6a5R';
  ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  res jsonb := '[]'::jsonb;
  upd jsonb := '[]'::jsonb;
  post jsonb;
  cdata jsonb;
  sid text; pid text; ptitle text; sstage text;
  pdate date; sd text;
  slevel int; wlevel int; nlevel int;
  is_del boolean;
  found_p boolean; pdel boolean; pdata jsonb; pnew jsonb;
  sig jsonb; sig_changed boolean; changed boolean;
  dts date[];
  tdata jsonb; tnew jsonb; tfound boolean; tdel boolean;
  tdone boolean[]; tflag boolean;
  i int; back date; newstage text; action text;
begin
  -- the Konten category must exist for the project to show its name and colour
  select data into cdata from work_records where user_id = p_user and coll = 'meta' and id = 'pmCategories' and not deleted;
  if cdata is null then
    insert into work_records (user_id, coll, id, data, deleted, updated_at) values (p_user, 'meta', 'pmCategories', jsonb_build_object(
      'id', 'pmCategories', 'createdAt', ms, 'updatedAt', ms, 'items', jsonb_build_array(
        jsonb_build_object('id', 'in_house', 'name', 'In-house', 'color', 'butter', 'archived', false, 'order', 1),
        jsonb_build_object('id', 'freelance', 'name', 'Freelance', 'color', 'sage', 'archived', false, 'order', 2),
        jsonb_build_object('id', 'personal', 'name', 'Personal', 'color', 'cyan', 'archived', false, 'order', 3),
        jsonb_build_object('id', 'learning', 'name', 'Learning', 'color', 'lavender', 'archived', false, 'order', 4),
        jsonb_build_object('id', 'konten', 'name', 'Konten', 'color', 'peach', 'archived', false, 'order', 5))), false, now())
    on conflict (user_id, coll, id) do update set data = excluded.data, deleted = false, updated_at = now();
  elsif not exists (select 1 from jsonb_array_elements(cdata->'items') e where e->>'id' = 'konten') then
    update work_records set updated_at = now(), data = cdata || jsonb_build_object('updatedAt', ms, 'items', (cdata->'items') ||
      jsonb_build_array(jsonb_build_object('id', 'konten', 'name', 'Konten', 'color', 'peach', 'archived', false,
        'order', 1 + coalesce((select max((e->>'order')::int) from jsonb_array_elements(cdata->'items') e), 0))))
    where user_id = p_user and coll = 'meta' and id = 'pmCategories';
  end if;

  for post in select * from jsonb_array_elements(coalesce(p_posts, '[]'::jsonb)) loop
    sid := post->>'id';
    if sid is null or sid = '' then continue; end if;
    pid := 'st-' || sid;
    ptitle := coalesce(nullif(btrim(post->>'title'), ''), 'Konten tanpa judul');
    sstage := coalesce(nullif(post->>'stage', ''), 'idea');
    slevel := case sstage when 'shoot' then 1 when 'edit' then 2 when 'ready' then 3 when 'posted' then 4 else 0 end;
    is_del := coalesce(jsonb_typeof(post->'deletedAt') in ('number', 'string'), false);
    pdate := nullif(post->>'date', '')::date;

    select data, deleted into pdata, pdel from work_records where user_id = p_user and coll = 'pmProjects' and id = pid;
    found_p := found;

    if is_del then
      if found_p and not pdel then
        update work_records set deleted = true, updated_at = now(), data = data || jsonb_build_object('deletedAt', ms, 'updatedAt', ms)
         where user_id = p_user and ((coll = 'pmProjects' and id = pid) or (coll = 'pmTasks' and id in (pid || '-script', pid || '-shoot', pid || '-edit', pid || '-post')));
        res := res || jsonb_build_object('id', sid, 'title', ptitle, 'action', 'removed');
      end if;
      continue;
    end if;
    if found_p and pdel then continue; end if; -- trashed in Work on purpose: leave it
    if not found_p and (pdate is null or slevel >= 4) then
      res := res || jsonb_build_object('id', sid, 'title', ptitle, 'action', 'skipped (no posting date, or already posted)');
      continue;
    end if;

    -- dates from Studio, falling back to a plan back from the posting date
    dts := array[null, null, null, null]::date[];
    if pdate is not null then
      for i in 1..4 loop
        sd := case i when 1 then nullif(post->>'scriptDate', '') when 2 then nullif(post->>'shootDate', '') when 3 then nullif(post->>'editDate', '') else null end;
        if i = 4 then dts[i] := pdate;
        elsif sd is not null then dts[i] := sd::date;
        else
          back := pdate - leads[i];
          dts[i] := case when back < p_today then least(pdate, p_today) else back end;
        end if;
      end loop;
    end if;

    sig := jsonb_build_object('title', ptitle, 'date', pdate, 'scriptDate', nullif(post->>'scriptDate', ''), 'shootDate', nullif(post->>'shootDate', ''), 'editDate', nullif(post->>'editDate', ''));
    sig_changed := not found_p or (pdata->'studioSync') is distinct from sig;

    -- what Work already says about each step
    tdone := array[false, false, false, false];
    for i in 1..4 loop
      tflag := null;
      select (data->>'status') = 'done' into tflag from work_records
       where user_id = p_user and coll = 'pmTasks' and id = pid || '-' || steps[i] and not deleted;
      tdone[i] := coalesce(tflag, false);
    end loop;
    wlevel := 0;
    for i in 1..4 loop
      exit when not tdone[i];
      wlevel := i;
    end loop;
    nlevel := greatest(slevel, wlevel);

    -- project
    newstage := case when nlevel >= 4 then 'completed' when nlevel >= 1 and coalesce(pdata->>'stage', 'planned') = 'planned' then 'in_progress' else coalesce(pdata->>'stage', 'planned') end;
    changed := not found_p or sig_changed or newstage is distinct from (pdata->>'stage');
    if not found_p then
      pnew := jsonb_build_object(
        'id', pid, 'name', ptitle, 'categoryId', 'konten', 'workflow', 'general', 'billing', false, 'clientId', null,
        'stage', newstage, 'startDate', null, 'shootDate', null, 'deadlineDate', pdate, 'deadlineTime', null,
        'nextActionTaskId', null, 'brief', '', 'notes', 'Dari Studio (post ' || sid || ')',
        'links', jsonb_build_array(jsonb_build_object('id', 'st-link', 'label', 'Studio', 'url', studio_url, 'type', 'other')),
        'deliverables', '[]'::jsonb, 'followUpDate', null, 'previewSentAt', null, 'archived', false, 'deletedAt', null,
        'studioId', sid, 'studioSync', sig, 'createdAt', ms, 'updatedAt', ms);
      action := 'created';
    else
      pnew := pdata;
      if changed then
        pnew := pdata || jsonb_build_object('stage', newstage, 'updatedAt', ms);
        if sig_changed then pnew := pnew || jsonb_build_object('name', ptitle, 'deadlineDate', pdate, 'studioSync', sig); end if;
      end if;
      action := case when changed then 'updated' else 'unchanged' end;
    end if;
    if changed then
      insert into work_records (user_id, coll, id, data, deleted, updated_at) values (p_user, 'pmProjects', pid, pnew, false, now())
      on conflict (user_id, coll, id) do update set data = excluded.data, deleted = false, updated_at = now();
    end if;

    -- tasks
    for i in 1..4 loop
      select data, deleted into tdata, tdel from work_records where user_id = p_user and coll = 'pmTasks' and id = pid || '-' || steps[i];
      tfound := found;
      if tfound and tdel then continue; end if; -- trashed in Work on purpose
      if not tfound then
        tnew := jsonb_build_object(
          'id', pid || '-' || steps[i], 'title', labels[i] || ': ' || ptitle, 'status', case when i <= nlevel then 'done' else 'open' end,
          'workDate', dts[i], 'workTime', times[i], 'deadlineDate', null, 'deadlineTime', null, 'estimateMinutes', null,
          'priority', 'normal', 'projectId', pid, 'invoiceId', null, 'subtasks', '[]'::jsonb, 'notes', '',
          'order', ms + i, 'archived', false, 'deletedAt', null, 'completedAt', case when i <= nlevel then ms else null end,
          'pinnedOn', null, 'recurrence', null, 'focusSessions', '[]'::jsonb, 'focusStartedAt', null,
          'konten', steps[i], 'studioId', sid, 'createdAt', ms, 'updatedAt', ms);
        if dts[i] is null then continue; end if;
      else
        tnew := tdata;
        if sig_changed then
          tnew := tnew || jsonb_build_object('title', labels[i] || ': ' || ptitle);
          if (tdata->>'status') <> 'done' and dts[i] is not null then
            tnew := tnew || jsonb_build_object('workDate', dts[i], 'workTime', times[i]);
          end if;
        end if;
        if i <= nlevel and (tdata->>'status') <> 'done' then
          tnew := tnew || jsonb_build_object('status', 'done', 'completedAt', ms);
        end if;
        if tnew is not distinct from tdata then continue; end if;
        tnew := tnew || jsonb_build_object('updatedAt', ms);
        if action = 'unchanged' then action := 'updated'; end if;
      end if;
      insert into work_records (user_id, coll, id, data, deleted, updated_at) values (p_user, 'pmTasks', pid || '-' || steps[i], tnew, false, now())
      on conflict (user_id, coll, id) do update set data = excluded.data, deleted = false, updated_at = now();
    end loop;

    -- Work got ahead of Studio: tell the caller to move the Studio stage forward
    if nlevel > slevel then
      upd := upd || jsonb_build_object('id', sid, 'stage', case nlevel when 1 then 'shoot' when 2 then 'edit' when 3 then 'ready' else 'posted' end);
    end if;
    res := res || jsonb_build_object('id', sid, 'title', ptitle, 'action', action, 'studioLevel', slevel, 'workLevel', wlevel, 'level', nlevel);
  end loop;

  return jsonb_build_object('results', res, 'studioUpdates', upd);
end;
$$;

-- takes a user id as an argument, so it must never be callable from the app
revoke all on function public.konten_sync(uuid, jsonb, date) from public, anon, authenticated;
