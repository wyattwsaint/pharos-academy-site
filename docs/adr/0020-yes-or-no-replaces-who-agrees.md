# ADR-0020 — An agreement is Yes or No, not who agrees

**Status:** accepted
**Date:** 2026-08-15
**Context:** [#71](https://github.com/wyattwsaint/pharos-academy-site/issues/71),
[#85](https://github.com/wyattwsaint/pharos-academy-site/issues/85); agreed in
conversation on 2026-08-15, tickets to follow
**Supersedes:** the answer vocabulary of
[ADR-0009](0009-the-application-gates-on-answers-not-agreement.md)'s agreement
questions — not its gate

## Context

The Apply page asks "Who agrees to the Pharos Academy Code of Conduct?" and
offers **Student agrees**, **Parent agrees**, **Neither agrees**. Those three
were transcribed rather than drafted — they are the school's own words from its
live form, and `agreements.ts` defends the transcription as a rule: "what a
school asks a family to agree to is the school's sentence".

Transcription was the right default while nobody had asked. The school has now
asked. Three answers pose a question the school does not act on — no part of the
site behaves differently for **Student agrees** than for **Parent agrees** — and
they pose it in a form that invites a family to work out who, in a household,
counts as agreeing to a Handbook.

## Decision

**Each document is one Yes-or-No question, asked once of the family.**

- The question becomes "Does your family agree to the Pharos Academy Code of
  Conduct?" — not "Do you agree", which reintroduces the who-is-answering
  ambiguity the three-way wording existed to avoid.
- The stored answers are `yes` and `no`.
- **The "Not answered" radio is removed.** Two radios, and an answer once given
  cannot be taken back without a reload. This is a deliberate loss: it makes the
  gate's "still needed" entry unreachable after a first answer, and a mis-click
  is corrected by choosing the other answer rather than by clearing both.
- The lead-in paragraph is replaced by one line — "Read each one, then tell us
  whether you agree. Either answer sends your application." The old paragraph is
  deleted, but not that sentence's job: it is the only place the page says No is
  safe to answer.

**Old answers are read, never rewritten.** `decodeAgreements` keeps accepting
`student`, `parent` and `neither`; `student`/`parent` read back as "Agreed" and
`neither` as "Did not agree". Only `yes` and `no` can be written from now on.
There is no migration. A migration would claim a parent's "Student agrees" was a
family "Yes", which it was not, and the record of what a family was actually
shown is the point of storing the policy version alongside it.

The admin list and the notification email read an answer as **Family agrees** /
**Family does not agree** — never a bare "No", which beside a document title in
a scanned list says nothing about which way it points.

## What changes behaviourally

**"No" now raises the [conversation flag](../../CONTEXT.md#conversation-flag).**
`neither` did not: `agreements.ts` argued that flagging every family who left the
Handbook question alone would bury the Statement of Faith signal under routine
noise, and predicted this would be Jill's call and one line when she made it.
Under three answers, "Neither agrees" was often a family declining to nominate a
person. A blunt **No** is not that — it is a family saying they do not agree to a
document the school requires, which is a conversation.

**The gate is unchanged.** ADR-0009 stands whole: the application gates on having
*answered*, never on having *agreed*. **No** is a
[complete application](../../CONTEXT.md#complete-application) and sends like any
other. A document the school has not published is still not asked about and
still creates no requirement.

## Consequences

- `AGREEMENT_CHOICES`, `AgreementAnswer`, `agreementLabel` and the questions on
  `AGREEMENT_DOCUMENTS` all change; `encodeAgreements`/`decodeAgreements` keep
  their `slug=answer@version` cell format unchanged, so no column and no stored
  row moves.
- `isFlagged` in `application.ts` gains the agreements — the one line the
  earlier comment anticipated.
- The site's questions now differ from the school's live form. That divergence
  is deliberate and this ADR is where it is recorded; the transcription rule in
  `agreements.ts` should be rewritten to point here rather than deleted.
- Anyone reversing this needs to answer what the third and fourth answers were
  for, since the record will by then contain rows in both vocabularies.
