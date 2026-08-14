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
held `cheque` on every row since #32 because a deployment-wide constant put it
there. #220 retired the constant and left the mode as a seam on the submission;
this is the change that fills it with the family's answer.

**The status does not move with it.** Both modes open `awaiting` (#220). A
family ticking a radio button has stated an intention, and a status saying they
paid would be exactly the claim ADR-0013 refused to store and
[ADR-0008](0008-an-overdue-cheque-is-read-from-the-clock.md) refuses to compute —
a fact about money nobody observed. `paid_online` is written by the office and
by nothing else, through the match action #220 added, after somebody has held a
payment against the reference by hand.

The grace period stays a fact about the post (#220): only a cheque row can run
overdue, and an online row reads `awaiting` however long it waits, with the
screen saying beside it that nothing tells the site whether the family paid.
What the mode changes here is the words: "Awaiting check" over a family who said
they were paying online sends somebody to the post tray for an envelope that is
not coming, so the status and button labels are worded by mode.

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
