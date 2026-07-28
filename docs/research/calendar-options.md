# Calendar options for the Pharos Academy site

Research note for [issue #5](https://github.com/wyattwsaint/pharos-academy-site/issues/5), part of the
map in [issue #2](https://github.com/wyattwsaint/pharos-academy-site/issues/2).

**Status:** research only. This note does not resolve issue #5; the decision follows.

**Sourcing rule.** Every factual claim below links to the party that owns the fact — vendor
documentation, official pricing pages, or the published spec. Where a primary source is silent,
that is stated explicitly rather than filled in from secondary write-ups.

There is no existing notes convention in this repo (it held only `README.md` and `.gitignore`), so
this file establishes `docs/research/` as the home for research notes.

---

## 0. The question, restated

Issue #1 committed to Google Calendar as source of truth, the site reading it at build time, and
parents getting an **ICS subscribe link** — named in the brief as the feature that actually stops
the phone calls. Two things pull against that: the school is not on Google Workspace, and George
pointed at MyChurchEvents.com as a reference.

Constraint, committed in writing to the client: **free tools and widgets only**. A paid option is
recommended only if the site genuinely cannot work without one.

### The succession fact is confirmed, not assumed

DNS for `pharosacademy.net` resolves MX to Namecheap's email-forwarding hosts, not to Google:

```
$ nslookup -type=MX pharosacademy.net 8.8.8.8
pharosacademy.net  MX preference = 10, mail exchanger = eforward1.registrar-servers.com
pharosacademy.net  MX preference = 10, mail exchanger = eforward2.registrar-servers.com
pharosacademy.net  MX preference = 10, mail exchanger = eforward3.registrar-servers.com
pharosacademy.net  MX preference = 15, mail exchanger = eforward4.registrar-servers.com
pharosacademy.net  MX preference = 20, mail exchanger = eforward5.registrar-servers.com
```

There is no Google Workspace tenancy behind the school's domain. Any Google Calendar the school uses
today is a **secondary calendar inside one individual's personal Google Account**. Section 2 works
out exactly what that costs the school.

---

## 1. MyChurchEvents.com — what it actually is

**It is a hosted calendar product, not a widget library and not merely a design reference.** It is a
paid SaaS calendar built for churches, which you embed on your own site via iframe.

**Vendor.** Not Ministry Brands and not ChurchOffice. The site's own footer and help centre credit
**Communication Resources**, and the help centre describes the product as "privately owned by a man
of faith with a doctorate in ministry"
([About My Church Events](https://help.mychurchevents.com/article/924-about-my-church-events)). The
Ministry Brands / ChurchOffice association in the ticket does not hold up against the vendor's own
pages. Treat any secondary source claiming otherwise as unreliable.

**Cost.** One tier only: **$69.95 per year**, no free tier, 30-day refund, cancel anytime
([pricing](https://www.mychurchevents.com/pricing)). Included: free customisation, **3 additional
editors at no extra cost**, unlimited locations with conflict prevention, unlimited interest groups,
unlimited visitors, free plugins.

**Machine-readable feed — yes.** This is the finding that most contradicts the first pass. The
vendor documents a public outbound **iCalendar (.ics) feed**:

- The feed is reached from the Preview Calendar page via the megaphone icon → "Subscribe to this
  Calendar", which yields a "Calendar Address" URL for All Events or for individual interest groups
  ([Using the iCalendar Links](https://help.mychurchevents.com/article/959-using-the-icalendar-links)).
- It is a **live one-way subscription, not a one-time download**: "The iCal link is a one-way sync.
  Any updates made to your My Church Events calendar will automatically appear in connected
  calendars" (same article).
- It is **unauthenticated and public**: "Since this version of the iCalendar feed is publicly
  available, your private events will not be included in the feed" (same article).
- Latency is poor and vendor-acknowledged: updates "can take up to 24 hours" to reach Google
  Calendar, and the vendor advises allowing "up to 48 hours for it to do an initial sync" (same
  article).

**Other integration surfaces.** iframe embed (with a vendor caveat that "There are issues with using
iFrames"), an iCalendar URL per calendar or per interest group, a "Featured Event List" plugin, and
direct share links
([Advanced Sharing and Integrating Calendar Options](https://help.mychurchevents.com/article/1401-advanced-sharing-calendar-options)).
**No JSON or XML API is documented** on either that page or the
[features page](https://www.mychurchevents.com/features). The product previously had an RSS feed; the
help-centre article for it is titled "Downloading the RSS Feed (no longer available)" and the article
URL now 404s, so treat RSS as retired and unsupported. The public feature list mentions Word/Excel export and adding events to personal calendars but names
no API ([features](https://www.mychurchevents.com/features)).

**Verdict.** MyChurchEvents is technically usable — a public ICS feed is exactly what a build-time
static site needs. It fails on the hard constraint: **$69.95/yr against a free-only commitment**,
for a feed Google Calendar and several genuinely free options provide at $0. Keep it as a **design
reference** for what George liked about the presentation, which is how the recap email framed it.

---

## 2. Google Calendar without Workspace

### Can a non-personal, durable calendar owner exist on consumer Google? No.

Google's model has no concept of an organisation-owned calendar outside Workspace. Every calendar
has exactly one owning **account**, and on consumer Google every account belongs to a person.

- The highest sharing permission is **"Make changes and manage sharing"**, which grants "full
  control of events or tasks with start and end time on your calendar and can share your calendar
  with others" ([Share your calendar](https://support.google.com/calendar/answer/37082)). It is
  full control **short of ownership** — Google lists it as a sharing permission, not a transfer.
- Ownership transfer exists and works on personal accounts, but it is manual and person-to-person:
  "Only the current calendar owner can do a transfer," it applies only to **secondary** calendars
  ("You can't transfer your primary calendar"), and "The new owner has 60 days to accept ownership,
  and you remain the owner until then"
  ([Transfer calendars or events](https://support.google.com/calendar/answer/78739)).

### What happens when the owning account goes away

This is the succession risk, in Google's own words:

> "If you delete your Google Account, this also deletes all calendars you own. To save the calendar,
> transfer ownership to someone else."
> — [Transfer calendars or events in Google Calendar](https://support.google.com/calendar/answer/78739)

Deleting a Google Account means you "lose all the data and content in that account, like emails,
files, calendars, and photos"
([Delete your Google Account](https://support.google.com/accounts/answer/32046)).

Abandonment is also a live failure mode, not a hypothetical: "Google reserves the right to delete an
inactive Google Account and its activity and data if you are inactive across Google for at least two
years," a policy that **applies only to personal accounts, not work or school accounts**
([Inactive Google Account policy](https://support.google.com/accounts/answer/12418290)).

**So: a calendar cannot outlive the account that owns it.** It can only be handed, by a deliberate
act of the departing owner, to another named individual — who must accept within 60 days. If the
owner leaves without doing that, or simply stops logging in, the school's calendar and its public
ICS URL both disappear. Every parent who subscribed to that link silently stops receiving updates.

### Public feed and embed — both work fine on a free account

Neither feature requires Workspace. Turn on "Make available to public" under access permissions,
then under **Integrate calendar** copy either the **"Public address in iCal format"** (the parent
subscribe link) or the "Public URL to this calendar"; note "The iCal address only works if the
calendar is public," and changes can take "up to 4 hours to take effect"
([Make a calendar public](https://support.google.com/calendar/answer/37083)). The iframe embed
likewise requires the calendar to be public
([Add a Google calendar to your website](https://support.google.com/calendar/answer/41207)).

If the site ever needs richer data than raw ICS, the Calendar API can read a public calendar, with
generous quotas — 10,000 requests/minute/project and 1,000,000/day/project
([Calendar API usage limits](https://developers.google.com/workspace/calendar/api/guides/quota)).
A static build needs one request per build, so quota is a non-issue.

### The migration path if the school later moves to Workspace

Two documented routes, both real:

1. **Transfer tool for unmanaged users.** Once `pharosacademy.net` has a Workspace tenancy, an admin
   uses the transfer tool to find personal Google Accounts on the domain and invite them to convert
   into managed accounts; the user clicks "Transfer my account" and the admin then manages it
   ([Use the transfer tool to migrate unmanaged users](https://support.google.com/a/answer/6178640),
   [Before using the transfer tool](https://support.google.com/a/answer/7062710)). This only helps if
   the calendar lives on an account whose address is at the school's domain — which today it is not,
   because the domain has no Google mail.
2. **Ordinary calendar ownership transfer** into the Workspace account
   ([answer/78739](https://support.google.com/calendar/answer/78739)). Inside Workspace there is an
   extra constraint: "For work or school accounts, the new calendar owner must be in the same
   organization."

Both routes require the current individual owner's cooperation. Neither is available if that person
is gone.

### Google Workspace for Nonprofits — checked, and it is not a clean escape

Worth ruling out explicitly, because "get free Workspace" is the obvious fix. Google for Nonprofits
requires registration "as a charitable organization" — in the US, 501(c)(3) status — and explicitly
excludes **"a school, academic institution, or university"**, while noting that "Google for Education
offers a separate program for schools"
([eligibility](https://www.google.com/nonprofits/eligibility/),
[eligibility guidelines](https://support.google.com/nonprofits/answer/3215869)). Churches are not
named as ineligible. Pharos Academy is a school operating in a church's orbit, so eligibility turns
on which legal entity applies and under whose EIN — a question for George and the school's counsel,
not one this repo can answer. **Do not plan the build around it.**

---

## 3. The other free options, judged

Criteria: genuinely free at this scale; editable by a non-technical administrator; stable public
machine-readable feed.

### Microsoft / Outlook.com published calendar

Free consumer account. In Calendar settings → Shared calendars → "Publish a calendar", Microsoft
issues both an HTML link and an ICS link, and documents the distinction precisely: recipients can
download the ICS as a one-time import, or "use the ICS link to subscribe to your calendar… They'll
see your calendar alongside their own and will automatically receive any updates"
([Share your calendar in Outlook.com](https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-com),
[Introduction to publishing Internet Calendars](https://support.microsoft.com/en-us/office/introduction-to-publishing-internet-calendars-a25e68d6-695a-41c6-a701-103d44ba151d)).
Editing is a mainstream calendar UI. **Ownership durability is identical to Google's: a personal
Microsoft account owned by one person.** It trades one succession risk for the same succession risk
in a less familiar UI. No reason to prefer it.

### Teamup

The strongest free option found, and the only one designed for exactly this shape of problem
(shared organisational calendar, several editors, no per-person accounts required).

- **Free tier is permanent, not a trial.** Teamup's own KB: it is "not a trial period: there is no
  cut-off date on using Teamup as a free service"
  ([Free calendar service](https://calendar.teamup.com/kb/how-to-use-teamup-as-a-free-calendar-service/)).
- **The free tier explicitly includes iCalendar feeds.** The KB's itemised free-plan list reads: "Up
  to 5 color-coded sub-calendars, Folders for sub-calendars, Up to 5 users, 1 custom event field, 1
  year of historical data, Notifications for changes in future events, **iCalendar feeds**, Advanced
  permissions, Branding with your logo… Multiple calendar views, Recurring events… Event signups"
  (same article). The plan comparison on the [pricing page](https://www.teamup.com/pricing/) is
  ambiguous enough on this row that it read both ways on two passes — **verify in the product before
  committing**, but the KB is unambiguous and is the vendor's own itemised list.
- **Outbound feeds are live and prompt at source:** "Teamup refreshes the feed source immediately
  after each change"; the lag is entirely in the subscribing client
  ([Managing outbound iCalendar feeds](https://calendar.teamup.com/kb/what-you-need-to-know-about-icalendar-feeds/)).
- **Window limit, and it matters:** "iCalendar feeds include event data from 6 months in the past to
  12 months in the future" (same article). Fine for a school year; it means the feed is not an
  archive.
- **Security note the vendor raises itself:** "The iCalendar feed URLs contain the secret key of the
  associated calendar link" — so the feed URL you publish to parents must be generated from a
  **read-only** share link, never an editing link
  ([Outbound iCalendar feeds](https://calendar.teamup.com/kb/subscribe-to-teamup-icalendar-feeds/)).
- **Ownership durability:** Teamup calendars are reached by shareable link with per-link permissions,
  which decouples the calendar from any one person's login better than Google does. The account
  holding the master calendar is still a single account, but the recovery story is a support
  conversation with Teamup rather than "the data is gone."
- **Cost of the free tier's visible edge:** "Powered by Teamup" branding on free calendars, removable
  only on paid tiers ([pricing](https://www.teamup.com/pricing/)). Paid starts at $12/month billed
  yearly.

### Airtable

Calendar view → Share and sync → **"Sync to an external calendar"** produces an iCal URL that
external calendar apps subscribe to, and Airtable's support docs state this is available on **"All
plan types"**, free included. It is one-way (external edits do not flow back), refresh is controlled
by the subscribing client and "can vary — taking even up to 24 hours", and event titles are locked to
the record's primary field with no way to choose another
([Integrating Airtable with external calendar applications](https://support.airtable.com/docs/integrating-airtable-with-external-calendar-applications)).
Also note: enabling share-link protections such as password or email-domain restriction causes "iCal
links [to] cease to integrate" — the feed must stay unprotected to be public. Editable by a
non-technical admin, though a grid-of-records is a less natural calendar UI than a month view.

### Notion

**Rules itself out on the feed.** Notion's help centre states you can only view a Notion database in
Notion Calendar, "not in Google or iCloud calendar," and that it is not possible to subscribe to a new
calendar from inside Notion Calendar
([Use Notion Calendar with Notion](https://www.notion.com/help/use-notion-calendar-with-notion),
[Manage calendars & events](https://www.notion.com/help/manage-your-calendars-and-events)). Notion
publishes no outbound public ICS feed for a database calendar view. The site could read the Notion
API at build time, but then **the ICS subscribe link for parents would have to be generated by us** —
see §4. Not disqualifying, but it converts a solved problem into a build task.

### Cal.com

**Wrong product category.** Cal.com is an appointment-booking and scheduling platform — free forever
for individuals, $12/user/month for Teams ([pricing](https://cal.com/pricing)). It publishes
bookable availability, not a school's event calendar, and its pricing and product pages document no
public ICS feed of an organisation's events. Rule it out on fit, not on cost.

### Nextcloud (self-hosted)

Fully capable and fully standards-based: a calendar can be published via public link, "users are able
to get the subscription link for the calendar and export the whole calendar directly," and the app
"only supports iCalendar-compatible `.ics`-files, defined in RFC 5545"
([Nextcloud Calendar user manual](https://docs.nextcloud.com/server/latest/user_manual/en/groupware/calendar.html)).
Ownership durability is the best of any option — the school would own the server. It fails hard on
the other two constraints: someone must host, patch, back up, and pay for a server, and there is no
one in this engagement to do that after handoff. **Rule out.**

### Plain ICS file committed to the repo

The most durable option imaginable and the only one with zero vendor risk: the school owns the file
outright, the format is a published standard — RFC 5545, *Internet Calendaring and Scheduling Core
Object Specification (iCalendar)*, Proposed Standard, September 2009
([RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)) — and Astro serves it from `public/` at a
stable URL that never 404s or rate-limits. It fails the editor constraint outright: a non-technical
school administrator will not hand-author `VEVENT` blocks with `RRULE` recurrence and correct
`DTSTART;TZID=America/New_York` values, and a single malformed line breaks every parent's subscription
at once. **Rule out as the authoring surface.** Keep it as the *output* format — see §5.

### Headless CMS collection / Astro content collection

Astro supports building "a custom loader using the Content Loader API to fetch remote content from
any data source, such as a CMS, a database, or an API endpoint"
([Content collections](https://docs.astro.build/en/guides/content-collections/)). This is the shape
the site will use regardless of which calendar wins. It is not itself an answer to "where does the
admin type the events," and no free CMS in scope emits a parent-subscribable ICS feed on its own.

---

## 4. The two hard tests, applied to every option

### (a) The ICS subscribe link for parents

The brief names this as the feature that stops the phone calls. The distinction that matters is the
one Microsoft's docs draw explicitly: a downloaded `.ics` file is a **one-time import that never
updates**, whereas a subscribed URL means the client "automatically receive[s] any updates"
([Introduction to publishing Internet Calendars](https://support.microsoft.com/en-us/office/introduction-to-publishing-internet-calendars-a25e68d6-695a-41c6-a701-103d44ba151d)).
Only the second one stops the phone calls.

Google, Outlook.com, Teamup, Airtable, MyChurchEvents and Nextcloud all publish a genuine subscribe
URL. Notion does not. A repo-committed ICS file does, trivially.

One shared caveat worth telling the client plainly, because it will otherwise read as a bug: **no
provider controls how fast a parent's phone refreshes.** Teamup refreshes its own feed "immediately
after each change" but notes that for "Outlook and Google Calendar: The update frequency is not
configurable… can take several hours to days to refresh"
([Teamup KB](https://calendar.teamup.com/kb/what-you-need-to-know-about-icalendar-feeds/)). Airtable
says the same — up to 24 hours, client-determined
([Airtable](https://support.airtable.com/docs/integrating-airtable-with-external-calendar-applications)).
Google's own public-address changes take "up to 4 hours to take effect"
([Google](https://support.google.com/calendar/answer/37083)). A subscribe link is the right feature;
it is not an instant one. Same-day changes still need an email or a text.

### (b) Build-time readability by Astro

Astro documents that "Your deployed Astro site will fetch data **once, at build time**"
([Data fetching](https://docs.astro.build/en/guides/data-fetching/)). CORS is irrelevant for a
build-time fetch; what matters is auth, rate limits and stability.

- **Google public ICS / Outlook published ICS / Teamup / MyChurchEvents / Nextcloud:** plain
  unauthenticated HTTPS GET returning `text/calendar`. No credentials to store in Vercel, nothing to
  rotate, nothing to expire. This is the easiest possible integration.
- **Airtable ICS:** same, provided share-link protections stay off (per Airtable's own note that
  protections break iCal links).
- **Notion:** requires an API token in build env, i.e. a credential the school must hold and rotate —
  the exact class of handoff debt issue #2 already lists as unresolved.
- **Google Calendar API (if richer data is needed):** an API key, well within quota at one request per
  build ([quota](https://developers.google.com/workspace/calendar/api/guides/quota)).

### (c) What happens when the feed is down at build time

**Astro's documentation does not specify this.** The data-fetching guide describes build-time fetching
without addressing errors; the content-collections guide describes custom loaders without addressing
loader failure; the CLI reference documents that `astro check` "will exit with a code of 1" on errors
but says nothing equivalent for `astro build`
([data fetching](https://docs.astro.build/en/guides/data-fetching/),
[content collections](https://docs.astro.build/en/guides/content-collections/),
[CLI reference](https://docs.astro.build/en/reference/cli-reference/)). Flagging this as a
documentation gap rather than asserting behaviour.

What follows from that gap is a design requirement, and it is the same requirement whichever vendor
wins: **the build must not depend on a third party being up.** Fetch inside a try/catch, and on
failure fall back to a committed snapshot of the last good feed rather than throwing. Consequences of
getting this wrong are asymmetric — an unhandled rejection during `astro build` means a Vercel
deployment fails, and the school's site does not update, because someone else's server had a bad
afternoon.

Important and easy to miss: **the already-published site is unaffected either way.** Static output is
already on Vercel's CDN; a failed build just means no new deploy. The failure mode is a stale
calendar, never a broken site. That is worth stating to the client, because it is the reassuring half.

---

## 5. Comparison table

| Option | Editable by non-technical admin | Machine-readable feed | ICS **subscribe** link for parents | Build-time readable by Astro | Cost | Ownership durability |
|---|---|---|---|---|---|---|
| **Google Calendar** (personal acct) | Yes — familiar, likely already in use | Public ICS + Calendar API | Yes ("Public address in iCal format", public calendar required) | Yes, unauthenticated GET | Free | **Weak.** One personal account. Deleting it deletes the calendar; 2-yr inactivity policy applies. Transfer is manual, 60-day accept, needs the owner's cooperation |
| **Teamup** (free tier) | Yes — purpose-built shared calendar, link-based access, no logins to hand out | Outbound ICS feed, on free tier per vendor KB | Yes; source refreshes immediately on change | Yes, unauthenticated GET | Free (perpetual, not a trial); "Powered by Teamup" branding; paid from $12/mo | **Moderate.** Link-based permissions decouple from one login; still a single account, but recovery is a vendor support path, not data loss |
| **MyChurchEvents** | Yes — church-shaped UI; 3 extra editors included | Public ICS feed; **no** JSON/XML API; RSS retired | Yes, live one-way sync | Yes, unauthenticated GET | **$69.95/yr, no free tier** | Moderate — a school-held vendor account |
| **Outlook.com published calendar** | Yes | Published ICS (+HTML link) | Yes, explicitly distinguished from one-time download | Yes, unauthenticated GET | Free | **Weak** — identical personal-account risk to Google |
| **Airtable** (free) | Partly — grid of records, not a calendar-first UI | ICS via "Sync to an external calendar", all plans | Yes; up to ~24h client refresh; breaks if share protections enabled | Yes, if share link unprotected | Free | Moderate — workspace-held |
| **Notion** | Yes | **No public outbound ICS**; API only | **No** — would have to be generated by us | Yes, but needs an API token in build env | Free | Moderate — workspace-held |
| **Cal.com** | N/A | N/A | N/A — wrong product (appointment booking, not event publishing) | — | Free individual / $12 per user/mo Teams | — |
| **Nextcloud** (self-host) | Yes, once running | Public link + RFC 5545 ICS | Yes | Yes | "Free" software, real hosting cost + admin | **Strongest** — school owns the server — but nobody will run it |
| **Plain ICS in repo** | **No** — hand-authoring VEVENT/RRULE is not viable | Yes, by construction | Yes, served from `public/` at a permanent URL | Trivially — it is a local file | Free | **Strongest** — school owns the file in git |

---

## 6. Recommendation

### The succession-risk answer, first

**No. A Google Calendar on a free consumer account cannot be given durable, non-personal ownership.**
Google's own documentation closes every door: the strongest sharing permission is still only sharing;
ownership transfer is a manual person-to-person act requiring the departing owner's cooperation and a
60-day acceptance; deleting the account deletes every calendar it owns; and two years of inactivity
is grounds for deletion under a policy that exempts work and school accounts but not personal ones.
The brief's assumption that Google Calendar simply stays does not survive contact with the school's
actual DNS.

The risk is not abstract. If it materialises, the school loses the calendar **and** every parent's
subscribe link goes quietly dead — no error, no notification, just a calendar that stops changing.
That is precisely the failure the ICS link was supposed to prevent.

### The recommendation

**Recommend Teamup (free tier) as the source of truth, with the school's own site serving the
canonical parent-facing ICS.** Two parts, and the second is what actually retires the risk.

**Part 1 — authoring moves to Teamup.** It is free in perpetuity by the vendor's own statement, its
free tier explicitly includes iCalendar feeds, it is built for shared organisational calendars rather
than one person's schedule, its five sub-calendars map naturally onto school-year phases or grade
bands, and access is by link with per-link permissions — so editing rights can be handed to a new
administrator without transferring anybody's personal login. Five users and five sub-calendars are
comfortably above what a microschool needs. Verify the free-tier iCal feed in-product before
committing; the KB and the pricing comparison table did not read identically.

**Part 2 — the site owns the parent-facing URL.** Whatever the upstream vendor, publish the parents'
subscribe link at a school-controlled address such as
`https://pharosacademy.net/calendar.ics`, generated at build time from the upstream feed and
committed as a fallback snapshot. This is the load-bearing move:

- Parents subscribe to a URL the **school** owns, on a domain the school already controls at
  Namecheap. If the calendar vendor is ever changed, the URL does not change and **no parent has to
  re-subscribe.** The vendor becomes swappable; the phone calls stay stopped.
- The committed snapshot is the answer to §4(c): a build-time fetch failure degrades to last-known-
  good rather than failing the deploy.
- The output format is RFC 5545, which no vendor owns.

This satisfies the free-only constraint exactly — $0, no credentials in the build, no server to run.

**If the client prefers to stay on Google** — a legitimate choice, since it is what he already knows —
then Part 2 alone is still mandatory, and one thing must change: the calendar must be moved to a
**generic role account** (e.g. a Google account for `office@`-style school use, whose password lives
in the school's credential store) rather than an individual's personal account, so that succession is
a password handoff rather than a 60-day transfer negotiation with someone who has left. That is a
mitigation, not a fix — Google still has no organisation-owned calendar off Workspace — but it
converts the risk from "unrecoverable" to "manageable," and it costs nothing.

**No paid solution is required.** MyChurchEvents' $69.95/yr buys nothing the free options lack except
a church-flavoured UI. Recommend it to George as a **design reference only**, which is what the recap
email promised.

---

## 7. Open items this note does not resolve

- **Verify Teamup's free tier emits an iCalendar feed in-product.** Vendor KB says yes explicitly;
  the pricing comparison table is ambiguous. Cheap to check, and the recommendation depends on it.
- **Google for Nonprofits eligibility** turns on which legal entity applies and under whose EIN.
  Schools are excluded; churches are not named. A question for George, not for this repo.
- Whether the existing Google Calendar is already on a shared/role account or on a genuinely personal
  one. Changes the size of the migration, not the direction of the recommendation.
- The decision itself. Issue #5 stays open.
