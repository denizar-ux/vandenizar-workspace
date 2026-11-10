-- NOT APPLIED YET, and not a migration (it holds a secret placeholder). Run by hand in the SQL editor
-- after work-push is deployed and the user approves (Task 20).
--
-- Order: 1) unschedule the old jobs, 2) schedule 'work-push'. Both steps are in this file.
-- Before step 1, copy the headers from the old job so the secret is not lost:
--   select command from cron.job where jobname = 'push-reminders';
-- The x-cron-secret value there is push_config.cron_secret. Do not commit the real secret.

-- 1) Unschedule the old jobs. A job that does not exist is skipped, no error.
select cron.unschedule(jobid) from cron.job where jobname in ('push-reminders', 'content-push');

-- 2) Schedule work-push every minute, same shape as the old 'push-reminders' job.
-- select cron.schedule(
--   'work-push',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := 'https://ngdsdkqimosiiqzdacci.supabase.co/functions/v1/work-push',
--     headers := '{"Content-Type":"application/json","x-cron-secret":"<copy from job push-reminders>"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- Check: select count(*) from cron.job where jobname = 'work-push';  -- expect 1
--        select jobname from cron.job where jobname in ('push-reminders', 'content-push');  -- expect no rows
