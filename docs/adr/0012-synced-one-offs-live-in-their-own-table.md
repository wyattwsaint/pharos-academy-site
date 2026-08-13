# Synced one-offs live in their own table

The school keeps its calendar in Google and wants to go on keeping it there
(#153), so the site reads that calendar and publishes what it finds. The obvious
shape is a `source` column on `calendar_events`, and we rejected it: the
ticket's central promise is that the sync never touches what an admin typed, and
on one table that promise is a `where` clause somebody has to remember on every
insert, update and delete. Synced one-offs therefore live in `synced_events`,
keyed on Google's own UID, and the sync's only statements are against that table.

Two facts decided it rather than taste.

**A synced one-off has no [actor](../../CONTEXT.md#actor).** Every editable
record carries a **stamp** — "Last edited by X on Y" — and the stamp is
load-bearing, because permissions are flat. Nobody signs in to run a sync, so on
a shared table `last_edited_by` would become nullable for every event including
the ones Jill typed, and the admin would render a blank where the only control
on an edit is meant to be. A synced row carries `synced_at` instead, which is
when the calendar was read and is an honestly different fact.

**Deleting is the dangerous path.** An event removed in Google must be removed
here, and a one-off is already the one record on this site that is deleted rather
than kept. On a shared table that makes the sync issue `delete from
calendar_events` on a schedule, against the same rows the admin owns; a bug in
the reconcile is then a bug that loses the school's typed events.

## Consequences

Two sources have to be merged before anything can publish them, which is the
price paid. It is paid **once**: `listPublishedEvents` in
`src/lib/calendar/store.ts` is the only reader that knows there are two tables,
and the page, the ICS feed and the structured data all go through it. This
decision was taken expecting to pay it in each of those three places; the seam
turned out to sit one level below them, which is where it belongs.

Synced one-offs are **exported**. They are the school's content, and the
[export](../../CONTEXT.md#export) answers "can the school get its content back
without asking anyone" — an answer that omits half the calendar is a worse
answer. That Google also holds the original is not a reason to leave it out: the
export is restorable without Postgres, and it should be restorable without
Google too.
