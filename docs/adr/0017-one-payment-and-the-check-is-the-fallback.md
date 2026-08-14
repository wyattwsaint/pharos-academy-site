# One payment, and the check is the fallback

A family pays **one lump sum** — registration, deposits and tuition together —
online, through the church's Vanco page. A check is the fallback and never a
peer of it (#219).

This **reverses the channel split** [ADR-0013](0013-the-school-holds-the-tuition.md)
recorded five days before it, and it is written down for the same reason that
one was: the split reached into the copy on the Apply page, into both emails, and
into a helper named after it. ADR-0013 moved *who is owed* the tuition and left
*how it is paid* as two channels — registration and tuition through Vanco, the
per-class deposit by check. The school has since said the deposit goes the same
way as the rest.

What survives from ADR-0013 unchanged: all three amounts are the school's money,
`pay_online_url` is one address because it is one Vanco campaign, and the deposit
credit is untouched arithmetic. What does not: `postedByCheck`, the function that
answered "how much of this is an envelope". There is no longer a fraction to
compute. `total` already was the whole sum; the page now shows it in bold under
the itemisation and the emails quote the same figure.

## The family says which way they are paying, and the row records it

The giving page is a plain link. It carries no amount, it takes no reference, and
Vanco sends the site nothing back — so the site cannot see a payment in either
channel, and the office matches money to applications by hand. What it *can* know
is what the family said they would do, and that is worth recording: it is the
difference between an office watching the post tray and an office not.

So the Apply page asks, and the answer lands in `payment_mode`, the column that
has held `cheque` on every row since #32 because a deployment-wide constant put it
there. The constant is gone; the mode is the family's answer.

**The status does not move with it.** `paymentOnSubmission` used to read the mode
and open an `online` application at `paid_online`; it now opens both at
`awaiting`. A family ticking a radio button has stated an intention, and a status
saying they paid would be exactly the claim ADR-0013 refused to store and
[ADR-0008](0008-an-overdue-cheque-is-read-from-the-clock.md) refuses to compute —
a fact about money nobody observed. `paid_online` stays named and stays
unwritable, the fourth of `lifecycle.ts`'s deliberately unreachable states,
against the day Vanco reports back.

The three-week grace period runs the same way in both modes, because the office is
waiting for money either way. What the mode changes is the words: "Awaiting
check" over a family who said they were paying online sends somebody to the post
tray for an envelope that is not coming, so `paymentStatusLabel` and
`paymentEventLabel` are keyed by mode.

## Consequences

**A stated method must never gate the application.** The rule in
`validation.ts` asks whether the question was answered and never which answer it
was — the same construction [ADR-0009](0009-the-application-gates-on-answers-not-agreement.md)
uses for the Statement of Faith and the two agreements. Choosing the check
delays nothing: the application is written, both emails go, and the school reads
it exactly as it reads any other.

**A deployment with no giving page asks nothing.** There is one way to pay, so
the page states `check` on the family's behalf rather than putting a question
with one answer on screen — and it states it *before* the gate reads it, because
a still-needed line about a control the page never renders is a family stuck at a
greyed button with nothing on screen that could ungrey it. A hidden field carries
the same word through the POST, so the browser's rule and the server's are still
reading one form.

**The form says `check` and the column says `cheque`.** `paymentModeOf` is the
one line where the two vocabularies meet, which is what keeps CONTEXT.md's rule —
prose is American, `cheque` survives as a column value — true of a word that now
appears in both halves at once.
