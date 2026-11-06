-- A stable first-submission ID is used as design_requests.id. Keep a payload hash
-- to reject changed content under that ID without trusting client-side storage.
alter table public.design_requests add column initial_payload_hash text;
