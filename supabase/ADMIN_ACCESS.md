# Database admin access

`20261031000000_restrict_admin_access.sql` replaces the old authenticated-user
policies with a private allowlist of Supabase Auth user IDs. Public portfolio
reads remain available. Orders are visible/modifiable only to allowlisted admins;
order creation and service-role operations remain available to trusted servers.

The initial admin ID was verified read-only against the account matching this
worktree's `ADMIN_EMAIL`. It is inserted only if that user exists in `auth.users`.
Fresh projects with different users start with an empty allowlist (access denied).
Before using the dashboard there, enroll the intended admin as `postgres` via a
trusted SQL session, using a verified UUID rather than user-provided metadata:

```sql
insert into private.artist_admins (user_id) values ('<verified-auth-user-uuid>');
```

Keep that account's email aligned with the app's existing `ADMIN_EMAIL` server
check. Ordinary users cannot view or modify the allowlist. To revoke database
admin access, delete that user's row as `postgres`. Do not expose the `private`
schema through the Data API. `is_artist_admin()` only reports the caller's status.

The uncommitted baseline no longer drops optional extensions. A later migration
cannot repair an earlier failure, so this baseline correction is required for
fresh databases. Applying to an existing database requires checking migration
history first; do not rerun the baseline's table creation against existing tables.

## Local verification

In an isolated disposable PostgreSQL database with no pre-existing application
roles or tables, run:

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/admin_access.sql
```

The test builds a minimal Supabase Auth model, replays the baseline and new
migrations, and verifies public reads, non-admin denial, blocked self-enrollment,
admin updates/deletes, sequence-backed inserts, service-role order creation, and
revocation. Everything is rolled back. It does not contact or alter Supabase.

Creating these files does not apply the migrations to any live database.
