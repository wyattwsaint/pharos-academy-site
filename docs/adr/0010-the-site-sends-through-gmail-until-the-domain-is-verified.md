# ADR-0010 — The site sends through Gmail until the school's domain is verified

**Status:** accepted
**Date:** 2026-08-11
**Context:** [#64](https://github.com/wyattwsaint/pharos-academy-site/issues/64), carried over from
[#25](https://github.com/wyattwsaint/pharos-academy-site/issues/25)

## Context

Four things on this site send email: the inquiry form (#25), the application (#32), the
volunteer form (#30) and the monthly [export](../../CONTEXT.md#export) (#33). All four read the
same credentials, and none of them were set. Every one of the four had been silently doing
nothing since it shipped.

The consequence is not evenly spread. The monthly export not arriving is a backup nobody has;
an inquiry not arriving is a family who wrote to the school and heard nothing back, and an
application not arriving takes its [conversation flag](../../CONTEXT.md#conversation-flag) with
it — the one line that changes what a person does about that application. The school's only
remaining sight of any of it is `/admin/inquiries`, read by hand, by somebody who remembers to.

Resend was the supplier in the plan, and the plan was correct: a verified sender on
`pharosacademy.net` is what the school should send from. It was also not done, and the reason it
was not done is the third step. Verifying the domain means editing DNS at Namecheap, and those
same records carry the school's mail forwarding and the Wix site still live at that address. It
is a careful sitting with a person who has the passwords, and it had not happened in six days
while every form stayed silent.

Three ways forward were available:

- **Wait for Resend.** Correct destination, and it keeps the four surfaces switched off for
  however long it takes to get the right people at a keyboard together. The cost is measured in
  families, not in days.
- **Send through the school's Gmail over SMTP.** No DNS, so the dangerous step disappears
  entirely. An app password on the existing account is the whole of the setup.
- **Something in between** — Gmail for the three forms, export email left off. It avoids the
  smaller attachment ceiling and leaves the school with no monthly copy, which is trading the
  problem that is costing nothing for the one that is.

## Decision

**The site sends through Gmail, and the route is a runtime choice rather than a code path.**

`configuredMailer(env)` in `src/lib/backup/monthly.ts` resolves one `Mailer` — a sender, the
`From` address and the attachment ceiling — from four variables, and is the only thing any of
the four surfaces knows about how mail leaves. Gmail wins where both routes are configured,
because a deployment carrying both is one mid-move: the domain sender is the one being added,
and it should be proven by somebody sending through it on purpose rather than by the next
family's inquiry.

`MAIL_FROM` is optional on the Gmail route and defaults to `GMAIL_USER`. Gmail rewrites `From`
to the authenticated account unless the address is one the mailbox has verified under "Send mail
as", so defaulting to it is not a missing configuration — it is what the family will see.

The ceiling travels on the mailer. Gmail's limit is 25 MB for the whole encoded message rather
than for the file, so base64's extra third comes out of the same allowance instead of sitting on
top of it, and the export ceiling on this route is 17 MB against Resend's 25 MB.

`nodemailer` is a dependency, which is a departure from the reasoning above `resendSender` and
is written out beside it. That reasoning holds where the whole of the API is one POST. SMTP is a
conversation and an attached export is a multipart MIME document; a monthly job is the wrong
place to discover a hand-written one folded base64 at the wrong column. The package has no
dependencies of its own.

## Consequences

**Good.**

- The four surfaces send. A family who inquires is answered, and an application's conversation
  flag reaches a person on the day it is raised rather than whenever somebody next opens the
  admin.
- Nobody edits DNS, so the live site and the school's mail forwarding are not at risk on the day
  this is switched on. The remaining human step is an app password on an account the school
  already has.
- Moving to Resend later is setting two variables and removing two. No code changes, and the
  four call sites cannot drift apart because there is one resolver.
- A deployment with no credentials is still an absent sender, which every form already handles
  honestly and which the e2e suite asserts. Preview deployments stay mailer-less on purpose: one
  that emails real families is worse than one that emails nobody.

**Bad, and accepted.**

- **The email comes from a `gmail.com` address.** Families see it, and it is the cost being
  paid. A "Send mail as" alias for `admissions@pharosacademy.net` would fix the appearance
  without the DNS work, and still depends on Namecheap forwarding delivering one confirmation
  message.
- **The app password is full send access to the school's mailbox**, where a Resend key can only
  send. If it leaks, somebody can send as the school — a wider blast than the credential it
  replaces, held in the same Vercel project.
- **The export ceiling is lower and will be reached sooner.** The archive grows with every
  retained policy version, forever. It is nowhere near 17 MB now; when it gets there the cron
  fails loudly and names the size, which is the behaviour ADR-style failures are supposed to
  have, but it arrives earlier than it would have.
- **No delivery log and no bounces.** Resend has a dashboard and webhooks; Gmail has a Sent
  folder. A bounced notification is discoverable by a person looking, not by the site.
- **SMTP costs a connection per send.** One TLS handshake on a form submission rather than one
  HTTPS request, and no pool, because a serverless instance is reused between requests and a
  held socket is one Gmail has already dropped.
- Gmail's daily send limit is far below Resend's. At this school's volume that is not a real
  constraint, and it would become one if the site ever mailed every family at once.
