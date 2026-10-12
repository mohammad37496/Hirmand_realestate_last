-- Phone Bridge: notification management module.
alter table phone_bridge_devices
  alter column allowed_modules set default '{"location":true,"wifi":true,"contacts":true,"calls":true,"sms":true,"calendar":true,"apps":true,"selectedFiles":true,"microphone":true,"camera":true,"notifications":true}'::jsonb;

update phone_bridge_devices
set allowed_modules = jsonb_set(coalesce(allowed_modules,'{}'::jsonb),'{"notifications"}','true'::jsonb,true)
where not (coalesce(allowed_modules,'{}'::jsonb) ? 'notifications');