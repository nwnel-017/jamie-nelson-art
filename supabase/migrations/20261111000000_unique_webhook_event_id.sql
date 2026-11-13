-- Prevent repeated Stripe deliveries from creating duplicate webhook records.
do $$
begin
  if exists (
    select event_id from public.webhook_event
    group by event_id having count(*) > 1
  ) then
    raise exception 'Reconcile duplicate webhook_event.event_id records before applying this migration';
  end if;
end $$;

alter table public.webhook_event
  add constraint webhook_event_event_id_key unique (event_id);
