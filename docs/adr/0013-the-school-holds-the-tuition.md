# The school holds the tuition

Tuition is paid to Pharos Academy, in one payment, upfront, through the same
Vanco page the registration fee goes through. It is not paid to the instructors
(#187).

This **reverses** what the site said from its first commit, which is why it is
written down rather than edited quietly. The old model came from the school's
own policy handbook — "tuition is paid directly to your instructor" — and it was
carried into copy on the Apply page, into both application emails, into the
admin, and into the domain vocabulary itself: `AmountOwed.dueToInstructors`,
`school_details.registration_url`, and a run of doc comments explaining why the
two channels were kept apart. The school has since told us the handbook is out
of date on this point.

**The name was the mechanism.** A field called `dueToInstructors` is a claim,
and a template rendering it writes that claim out. Correcting the sentences and
leaving the names would have left the site with a vocabulary that disagrees with
its own pages — and the next person to word a surface from the type would put
the old sentence back, correctly, from the code. So the rename is the fix and
not tidying after it:

| Was | Is |
| --- | --- |
| `AmountOwed.dueToInstructors` | `AmountOwed.tuitionDue` |
| `AmountOwed.dueNow` | *(dropped)* |
| `school_details.registration_url` | `school_details.pay_online_url` |

`dueNow` was registration plus deposits: the cheque a family posted with its
application. It is dropped rather than renamed because it no longer names one
channel — the registration is online and the deposits are the cheque, and a
figure spanning both is an amount nobody can pay in one act. Surfaces state the
amounts beside the way each is paid instead.

`pay_online_url` is one address covering registration *and* tuition, because
that is **one Vanco campaign and not two**. A second column for a second
campaign would give the office two boxes for a link it pastes once.

## What did not change

**The per-class deposit is still a cheque to the school**, and the deposit
credit still works exactly as it did — `depositCreditedAgainstTuition` takes the
deposits off the tuition owed, capped at the tuition. Only who that tuition is
owed to has changed, which is a wording fact and not an arithmetic one.

**The application still learns nothing from a payment.** Vanco sends the site no
confirmation, so there is still no `paid online` flag and the office still
matches a Vanco payment to an application by hand (ADR-0008 on the same theme:
the site does not record what it cannot observe).

## Consequences

The **handbook still disagrees**. `docs/mirror/pdf-text/policy-handbook.txt`
instructs families to pay their instructors directly, and until the school
reissues it the two will disagree in public. The mirror is left as it is — it is
a record of what the old site and the handbooks said, not a claim this site
makes — with a note in `docs/mirror/README.md` so nobody re-derives the old
model from it.

Fees other than tuition are now described as the school's too: the per-class
materials fee had a doc comment and an admin hint saying "paid to the
instructor", beside a neighbouring hint that already called it "a fee paid to
the school". They now agree. If the school tells us a materials fee really does
go to the instructor, that is a smaller correction than this one and it starts
from a consistent state.
