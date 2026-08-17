# Search presence

How Pharos gets found. This is the human half — the accounts, the listing and
the submissions — and it is written to be worked through in order, on a phone if
need be. The machine half is already done and is not repeated here: the site
answers `Allow: /`, advertises `/sitemap.xml`, redirects every old Wix address,
and publishes a `School` node with the address, the three counties served and
what the school teaches.

The decision behind the listing’s shape is
[ADR-0023](adr/0023-the-school-is-a-service-area-not-a-place-on-the-map.md).

## Before anything

**Sign in as the school Google account.** Not `jkilker@enolacog.com`, and not a
personal address. Everything below — the Business Profile, Search Console, Bing
— is owned by that one account, and retrofitting ownership later means
re-verifying from the start.

Add a second owner (Wyatt) to each property as soon as it exists, so no single
sign-in is the school’s only way back in.

## 1. Google Business Profile

### The fields, verbatim

| Field | Value |
| --- | --- |
| Business name | `Pharos Academy` — nothing after it. Google strips taglines and a stuffed name is a suspension reason. |
| Primary category | **Private educational institution** |
| Additional categories | **Christian school**, **Educational institution** |
| Business type | Service-area business — enter `9 Sherwood Drive, Enola, PA 17025`, then **hide the address** |
| Service areas | Cumberland County, PA · Dauphin County, PA · Perry County, PA |
| Phone | `717-497-0896` — the school’s number, never the church’s |
| Website | `https://www.pharosacademy.net` |
| Appointment link | `https://www.pharosacademy.net/inquire` |
| Hours | Mon, Wed, Thu 9:00 a.m. – 12:30 p.m. Closed Tue, Fri, Sat, Sun. |
| Social link | the school’s Facebook page |

Do **not** pick a “Homeschool” category. Pharos serves homeschooling families
and is not a homeschool; the site is careful about that distinction everywhere
else and the listing has to match.

If the category picker does not offer one of the strings above word for word,
take the closest and note which — the picker’s list changes and the site’s
markup should be told about it.

### The description

Paste as one paragraph (Google allows 750 characters; this is well inside):

> Pharos Academy is a Christian, classical hybrid microschool in Enola,
> Pennsylvania, serving homeschooling families across Cumberland, Dauphin and
> Perry counties. Students attend classes on campus Monday, Wednesday and
> Thursday mornings and learn at home the rest of the week, so families keep the
> shape of their week while their children get real instruction in the great
> books, Latin, mathematics, science and the arts. Classes are small, taught by
> teachers who know each student by name. Families in Enola, Camp Hill,
> Mechanicsburg, New Cumberland, Marysville and the greater Harrisburg area are
> welcome to visit a class morning and see the school at work.

No phone number, no URL and no all-caps inside the description — all three are
rejected.

### Photos

Upload from the site’s own imagery, which is already published and cleared:

- Logo: `public/mark.svg`
- Cover: `public/imagery/vista-path.webp`
- Interior: `public/imagery/reading-table.webp`, `public/imagery/still-desk.webp`
- Team: the four portraits in `public/portraits/`

**No student faces.** Not from the site, not from a phone, not with a parent’s
verbal yes. If fresh photos are wanted — and four to six shots of a real class
morning would help the listing — they are shot with no identifiable children in
frame.

### Verification

A service-area business verifies by **live video**, recorded inside the Business
Profile flow. It cannot be filmed in advance and uploaded, must run at least
thirty seconds, and Google takes up to five business days to review it.

Shoot it **on a class morning, at the church**, and capture in this order:

1. **Where you are.** The street sign at Sherwood Drive, the building number, the
   church building from outside. Not a blank wall and not a car park.
2. **That the school exists.** Walk inside to the room in use — students at work
   is fine as long as the camera stays off faces — and show printed Pharos
   materials: a schedule, a handbook, a folder, a name tag, whatever is to hand.
3. **That you run it.** On camera, unlock a phone or laptop, sign in to the
   admin at `pharosacademy.net/admin`, and show the space-use agreement with the
   church if there is a paper copy.

Do not stop recording between steps; one continuous take is what passes.

**If it fails twice**, stop retrying and read ADR-0023’s second consequence: the
fix is a permanent Pharos sign on the room plus the church’s written permission,
which makes the stronger storefront listing available instead.

### After it verifies

- Paste the profile URL into the repo issue tracking the `sameAs` change.
- Ask about ten current families for a review, by name, with a plain link. No
  incentives of any kind — a gift, a discount or a raffle is a policy violation
  and grounds for suspension.
- Reply to every review. That is the school’s job, ongoing, not an agent’s.

## 2. Google Search Console

The sitemap is advertised but has never been submitted, and nothing is watching
coverage. Both are fixed here.

1. Add a **Domain property** for `pharosacademy.net` — not a URL-prefix property.
   The domain property covers the apex, `www`, and any future subdomain, and
   survives a change of host.
2. Google gives a TXT record. DNS is at **Namecheap** (`dns1.registrar-servers.com`
   / `dns2.registrar-servers.com`): Domain List → Manage → Advanced DNS → Add New
   Record → TXT, host `@`, value as given.
3. Wait for propagation before pressing Verify. There is currently no
   `google-site-verification` TXT on the apex, so the check is unambiguous:
   `Resolve-DnsName pharosacademy.net -Type TXT -Server 8.8.8.8`.
4. Submit the sitemap: Sitemaps → `sitemap.xml` → Submit.
5. Request indexing on the eight pages that matter, one at a time, through URL
   Inspection: `/`, `/about`, `/about/beliefs`, `/admissions`, `/classes`,
   `/classes/by-day`, `/inquire`, `/teach`.

### What “indexed” means, and when we look

Success is every sitemap URL sitting in Coverage as **Indexed**, and
`site:pharosacademy.net` in Google returning the real pages.

Check at **7 days** and again at **21 days**. Paste any Coverage error into the
repo issue rather than acting on it in the console — several of them are things
the site would have to change.

## 3. Bing Webmaster Tools

Sign in with the same school account, choose **Import from Google Search
Console**, authorize, done. It carries the verification and the sitemap across.
It is worth the two minutes because Bing’s index is what ChatGPT and Copilot
search, and a parent asking an assistant about schools near Harrisburg is now a
real referral path.

## 4. Apple Business Connect

**After** the Google listing verifies, not before — Apple’s review looks for a
matching presence elsewhere. Same name, same phone, same three counties, address
hidden. This puts the school on Maps on every iPhone in Cumberland County.

## Not doing

Paid directories, GreatSchools, Niche, and any service offering to “fix” the
listing. None of them move category searches for a school this size, and several
create duplicate listings that then have to be fought.
