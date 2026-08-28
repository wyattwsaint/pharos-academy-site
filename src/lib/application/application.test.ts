import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BELIEFS_ARTICLES, BELIEFS_CLOSING } from "../about/beliefs.js";
import { SEEDED_SCHOOL_YEAR } from "../calendar/year.js";
import { CATALOGUE } from "../courses/catalogue.js";
import { SEEDED_MONEY_SETTINGS } from "../money/settings.js";
import {
  applicationCost,
  FAITH_QUESTIONS,
  FAITH_RESPONDENTS,
  faithKey,
  familyClashes,
  firstError,
  isFlagged,
  MAX_CHILDREN,
  parseApplication,
  prefillFrom,
  priceUnit,
  statementVersion,
  validateApplication,
  type ApplicationErrors,
  type ApplicationFields,
} from "./application.js";
import type { AskableAgreement } from "./agreements.js";
import { offeringsOf } from "./offerings.js";

/**
 * #31 AC 1, AC 6, AC 8 and AC 9 — the pure half of the family's application,
 * over the real catalogue and the real seeded money settings.
 */

const OFFERINGS = offeringsOf(CATALOGUE);

/** A form, from the field names the page actually posts. */
function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    for (const one of Array.isArray(value) ? value : [value])
      data.append(name, one);
  }
  return data;
}

/** One respondent's whole column of the Statement of Faith grid, answered. */
function column(
  respondent: (typeof FAITH_RESPONDENTS)[number],
  answer: "yes" | "no" = "yes",
): Record<string, string> {
  return Object.fromEntries(
    FAITH_QUESTIONS.map((question) => [
      faithKey(respondent, question.id),
      answer,
    ]),
  );
}

/**
 * A complete, valid submission. Individual tests spoil one field of it.
 *
 * One full column since #85: an application nobody answered the Statement of
 * Faith questions on is no longer a sendable one, so a fixture without a column
 * would be testing a form the school does not accept. A stated payment method
 * since #219, for the same reason.
 */
function goodForm(over: Record<string, string | string[]> = {}): FormData {
  return form({
    familyName: "Okonkwo",
    email: "okonkwo@example.com",
    phone: "717-555-0142",
    street: "12 Oak Lane",
    city: "Gettysburg",
    state: "PA",
    zip: "17325",
    "child-0-name": "Ada",
    "child-0-age": "13",
    "child-0-classes": ["algebra-1:year"],
    "payment-method": "online",
    ...column("Father"),
    ...over,
  });
}

/** That submission, read back as the fields the page holds. */
const applied = (
  over: Record<string, string | string[]> = {},
): ApplicationFields => parseApplication(goodForm(over), OFFERINGS).values;

describe("pre-filling from an inquiry (#31 AC 1, #313)", () => {
  it("carries the name, the email, the phone and one child per age", () => {
    const values = prefillFrom({
      name: "Okonkwo",
      email: "o@example.com",
      phone: "555-123-4567",
      ages: "6, 9 and 13",
    });

    expect(values.familyName).toBe("Okonkwo");
    expect(values.email).toBe("o@example.com");
    expect(values.phone).toBe("555-123-4567");
    // The address still opens blank on Pennsylvania (#312): nothing on an
    // inquiry carries a postal address.
    expect(values.address).toEqual({
      street: "",
      street2: "",
      city: "",
      state: "PA",
      zip: "",
    });
    expect(values.children.map((child) => child.age)).toEqual(["6", "9", "13"]);
    // Names are the school's guess to make, and it does not have one — the
    // inquiry never asked for the children's names.
    expect(values.children.every((child) => child.name === "")).toBe(true);
  });

  it("leaves the phone blank for an inquiry sent before the field existed (#311)", () => {
    // Nullable column, mandatory field: a row from before #311 has no number,
    // so the family is asked for one exactly as if they had no inquiry at all.
    const values = prefillFrom({
      name: "Ruth",
      email: "r@example.com",
      phone: null,
      ages: "7",
    });
    expect(values.phone).toBe("");
  });

  it("works from a clean slate, with one blank child row", () => {
    const values = prefillFrom(null);

    expect(values.familyName).toBe("");
    expect(values.email).toBe("");
    expect(values.phone).toBe("");
    expect(values.children).toEqual([{ name: "", age: "", offeringKeys: [] }]);
    expect(values.objections).toBe("");
  });

  it("gives one blank row when the ages are words rather than numbers", () => {
    const values = prefillFrom({
      name: "Ruth",
      email: "r@example.com",
      phone: "555-123-4567",
      ages: "twins, nearly five",
    });
    expect(values.children).toEqual([{ name: "", age: "", offeringKeys: [] }]);
  });

  it("never opens more rows than the form has", () => {
    const values = prefillFrom({
      name: "Ruth",
      email: "r@example.com",
      phone: "555-123-4567",
      ages: "4 5 6 7 8 9 10 11 12 13 14",
    });
    expect(values.children).toHaveLength(MAX_CHILDREN);
  });
});

describe("reading a submitted application", () => {
  it("takes a good one with no errors", () => {
    const { values, errors, flagged } = parseApplication(goodForm(), OFFERINGS);

    expect(errors).toEqual({});
    expect(flagged).toBe(false);
    expect(values.children).toEqual([
      { name: "Ada", age: "13", offeringKeys: ["algebra-1:year"] },
    ]);
  });

  it("ignores the blank rows nobody typed in", () => {
    const { values } = parseApplication(
      goodForm({ "child-3-name": "  " }),
      OFFERINGS,
    );
    expect(values.children).toHaveLength(1);
  });

  it("drops a class that is no longer on sale", () => {
    // A form can be stale by a republish. The rest of the selection survives.
    const { values } = parseApplication(
      goodForm({ "child-0-classes": ["algebra-1:year", "algebra-1:spring"] }),
      OFFERINGS,
    );
    expect(values.children[0]!.offeringKeys).toEqual(["algebra-1:year"]);
  });

  it("names who is applying, how to reach them, and asks for a class", () => {
    const { errors } = parseApplication(
      form({ "child-0-name": "Ada", "child-0-age": "13" }),
      OFFERINGS,
    );

    expect(errors.familyName).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.classes).toBeTruthy();
  });

  it("refuses an address that is not one", () => {
    const { errors } = parseApplication(
      goodForm({ email: "okonkwo at example" }),
      OFFERINGS,
    );
    expect(errors.email).toContain("does not look like");
  });

  /*
   * The household's own contact details (#312, ADR-0024). The rules are
   * `forms.ts`'s and `address.ts`'s and are proved there; what these assert is
   * that the application actually runs them, on the fields it posts under.
   */
  it("reads the phone and the address off the form", () => {
    const { values } = parseApplication(
      goodForm({ street2: "Apt 3" }),
      OFFERINGS,
    );

    expect(values.phone).toBe("717-555-0142");
    expect(values.address).toEqual({
      street: "12 Oak Lane",
      street2: "Apt 3",
      city: "Gettysburg",
      state: "PA",
      zip: "17325",
    });
  });

  it("asks for a phone number, in the shape the inquiry asks for it in", () => {
    expect(
      parseApplication(goodForm({ phone: "" }), OFFERINGS).errors.phone,
    ).toBeTruthy();
    expect(
      parseApplication(goodForm({ phone: "7175550142" }), OFFERINGS).errors
        .phone,
    ).toContain("ten digits");
  });

  it("asks for somewhere to post to, and takes an apartment as optional", () => {
    expect(
      parseApplication(goodForm({ street: "" }), OFFERINGS).errors.address,
    ).toBeTruthy();
    expect(
      parseApplication(goodForm({ zip: "173" }), OFFERINGS).errors.address,
    ).toBeTruthy();
    expect(
      parseApplication(goodForm({ street2: "" }), OFFERINGS).errors.address,
    ).toBeUndefined();
  });

  it("refuses a state that is not one, however it was posted", () => {
    // The dropdown can only produce one of the fifty-one. A hand-built POST is
    // not a dropdown, and the server's rule is the one that decides.
    expect(
      parseApplication(goodForm({ state: "ZZ" }), OFFERINGS).errors.address,
    ).toBeTruthy();
  });

  it("asks for an age beside a name", () => {
    const { errors } = parseApplication(
      goodForm({ "child-0-age": "" }),
      OFFERINGS,
    );
    expect(errors.children).toBeTruthy();
  });

  it("says whose row is short of an age", () => {
    // "A child needs an age" is not actionable on an eight-row form (#85).
    const { errors } = parseApplication(
      goodForm({ "child-1-name": "Obi", "child-1-age": "" }),
      OFFERINGS,
    );

    expect(errors.children).toContain("Obi");
  });
});

/**
 * The gate (#85). Answered, never agreed — every case below asks whether a
 * question has an answer, and none of them asks which answer it is.
 */
describe("what an application must carry before it can be sent (#85)", () => {
  const ASKABLE: AskableAgreement[] = [
    {
      slug: "code-of-conduct",
      title: "Code of Conduct",
      question: "Does your family agree to the Pharos Academy Code of Conduct?",
      version: 2,
    },
    {
      slug: "handbook",
      title: "Handbook",
      question: "Does your family agree to the Pharos Academy Handbook?",
      version: 5,
    },
  ];

  /** Both published documents answered, so a case can be about one thing.  */
  const AGREED = {
    "agreement-code-of-conduct": "yes",
    "agreement-handbook": "yes",
  };

  const errorsOf = (
    over: Record<string, string | string[]>,
    askable: AskableAgreement[] = [],
  ): ApplicationErrors =>
    parseApplication(goodForm(over), OFFERINGS, askable).errors;

  describe("one column of the Statement of Faith grid", () => {
    it.each(FAITH_RESPONDENTS)(
      "is enough when %s answers all three",
      (respondent) => {
        // A single-parent household, a household with no parent on the form: no
        // respondent is privileged over another, and one column is the whole rule.
        const bare = Object.fromEntries(
          FAITH_QUESTIONS.map((question) => [
            faithKey("Father", question.id),
            "",
          ]),
        );

        expect(
          errorsOf({ ...bare, ...column(respondent) }).faith,
        ).toBeUndefined();
      },
    );

    it("is not met by a column with a gap in it", () => {
      expect(
        errorsOf({ [faithKey("Father", "comfortable")]: "" }).faith,
      ).toBeTruthy();
    });

    it("is not met by three columns with a gap in each", () => {
      // Nine answers, none of them a complete column. The rule is one
      // respondent's whole answer, not a count of cells.
      const scattered: Record<string, string> = {};
      for (const [index, respondent] of FAITH_RESPONDENTS.entries()) {
        for (const [at, question] of FAITH_QUESTIONS.entries()) {
          scattered[faithKey(respondent, question.id)] =
            at === index ? "" : "yes";
        }
      }

      expect(errorsOf(scattered).faith).toBeTruthy();
    });

    it("is met by a complete column of “No”", () => {
      // The distinction the whole ticket turns on: answered, never agreed.
      const { errors, flagged } = parseApplication(
        goodForm(column("Father", "no")),
        OFFERINGS,
      );

      expect(errors).toEqual({});
      expect(flagged).toBe(true);
    });

    it("takes a partly-filled second column as information, not as a defect", () => {
      expect(errorsOf({ [faithKey("Mother", "read")]: "yes" })).toEqual({});
    });

    it("never asks for the objections box", () => {
      // Optional, and writing in it costs a family nothing.
      expect(errorsOf({})).toEqual({});
      expect(errorsOf({ objections: "We disagree with article 9." })).toEqual(
        {},
      );
    });
  });

  describe("an answer to every published document", () => {
    it("asks for one when the school has published one", () => {
      expect(errorsOf({}, ASKABLE).agreements).toBeTruthy();
    });

    it.each(["yes", "no"])("takes “%s” as the answer it is", (answer) => {
      const answered = {
        "agreement-code-of-conduct": answer,
        "agreement-handbook": answer,
      };

      expect(errorsOf(answered, ASKABLE)).toEqual({});
    });

    it("drops the requirement entirely when neither document is published", () => {
      expect(errorsOf({}, [])).toEqual({});
    });

    it("asks only about the one that is published", () => {
      const onlyHandbook = ASKABLE.filter(
        (document) => document.slug === "handbook",
      );

      expect(errorsOf({ "agreement-handbook": "no" }, onlyHandbook)).toEqual(
        {},
      );
      expect(
        errorsOf({ "agreement-code-of-conduct": "no" }, onlyHandbook)
          .agreements,
      ).toBeTruthy();
    });

    it("still refuses when one of the two is left alone", () => {
      expect(
        errorsOf({ "agreement-handbook": "yes" }, ASKABLE).agreements,
      ).toBeTruthy();
    });
  });

  describe("how the family says they are paying (#219)", () => {
    it("asks for an answer, and takes either one", () => {
      expect(errorsOf({ "payment-method": "" }).paymentMethod).toBeTruthy();
      // Answered, never approved of. Choosing the check must not cost a family
      // so much as a round trip: it sends exactly as "online" does.
      expect(errorsOf({ "payment-method": "online" })).toEqual({});
      expect(errorsOf({ "payment-method": "check" })).toEqual({});
    });

    it("reads a word it does not know as no answer at all", () => {
      // A hand-typed POST, or a value from a form a republish has since moved
      // on from. It is unanswered rather than recorded, for `faith`'s reason.
      const { values, errors } = parseApplication(
        goodForm({ "payment-method": "venmo" }),
        OFFERINGS,
      );

      expect(values.paymentMethod).toBe("");
      expect(errors.paymentMethod).toBeTruthy();
    });
  });

  it("names the first outstanding thing in the order the page reads", () => {
    // Where focus goes when a send is refused. Reading order, not the order the
    // rules happen to be written in.
    expect(firstError(validateApplication(prefillFrom(null), ASKABLE))).toBe(
      "faith",
    );
    expect(firstError(errorsOf({ familyName: "" }, ASKABLE))).toBe(
      "familyName",
    );
    expect(firstError(errorsOf(AGREED, ASKABLE))).toBeNull();
  });

  it("reads a class list as being inside the child row it belongs to (#88)", () => {
    // The classes are not a section of their own: each child's list sits inside
    // that child's fieldset, so the first child's classes are *above* the second
    // child's name. A family whose first child is complete but classless and
    // whose second child has no age is short of a class first, however the two
    // rules are ordered among themselves.
    const errors = { children: "needs an age", classes: "choose one" };

    expect(firstError(errors, 1)).toBe("classes");
    // And on the first row there is nothing to step over: that child's own name
    // and age come before their class list.
    expect(firstError(errors, 0)).toBe("children");
  });

  it("passes a whole application, with both documents answered", () => {
    expect(errorsOf(AGREED, ASKABLE)).toEqual({});
  });
});

describe("the Statement of Faith is disclose-and-discuss (#31 AC 6)", () => {
  const yes = (): Record<string, string> => {
    const answers: Record<string, string> = {};
    for (const respondent of FAITH_RESPONDENTS) {
      for (const question of FAITH_QUESTIONS)
        answers[faithKey(respondent, question.id)] = "yes";
    }
    return answers;
  };

  it("does not block submission on an objection", () => {
    const { errors, flagged } = parseApplication(
      goodForm({
        ...yes(),
        objections: "We disagree with the wording of article 9.",
      }),
      OFFERINGS,
    );

    expect(errors).toEqual({});
    expect(flagged).toBe(true);
  });

  it("does not block submission on a “No”", () => {
    const { errors, flagged } = parseApplication(
      goodForm({ ...yes(), [faithKey("Mother", "agree")]: "no" }),
      OFFERINGS,
    );

    expect(errors).toEqual({});
    expect(flagged).toBe(true);
  });

  it("never puts an error on the Statement, whatever is answered", () => {
    // The property, not one case: no combination of answers may produce an
    // error key, because an error is a refusal and this is a conversation.
    const answers: Record<string, string> = {};
    for (const respondent of FAITH_RESPONDENTS) {
      for (const question of FAITH_QUESTIONS)
        answers[faithKey(respondent, question.id)] = "no";
    }
    const { errors } = parseApplication(
      goodForm({ ...answers, objections: "All of it." }),
      OFFERINGS,
    );

    expect(Object.keys(errors)).toEqual([]);
  });

  it("treats an unanswered question as unanswered, not as a “No”", () => {
    // A household with no legal guardian leaves that column alone. Flagging it
    // would flag the whole intake and make the flag mean nothing.
    const { values, flagged } = parseApplication(goodForm(yes()), OFFERINGS);
    const partial: ApplicationFields = {
      ...values,
      faith: { ...values.faith, [faithKey("Legal guardian", "agree")]: "" },
    };

    expect(flagged).toBe(false);
    expect(isFlagged(partial)).toBe(false);
  });

  it("asks all three questions of all three people", () => {
    const { values } = parseApplication(goodForm(), OFFERINGS);
    expect(Object.keys(values.faith)).toHaveLength(
      FAITH_RESPONDENTS.length * FAITH_QUESTIONS.length,
    );
  });

  it("records the version of the Statement that was shown", () => {
    const version = statementVersion();

    expect(version).toMatch(/^sof-[0-9a-f]{8}$/);
    // Stable across calls, and different the moment the text is.
    expect(statementVersion()).toBe(version);
    expect(
      statementVersion(
        [...BELIEFS_ARTICLES, "a twelfth article"],
        BELIEFS_CLOSING,
      ),
    ).not.toBe(version);
    expect(
      statementVersion(
        BELIEFS_ARTICLES,
        `${BELIEFS_CLOSING} And one more sentence.`,
      ),
    ).not.toBe(version);
  });
});

describe("what the family owes (#31 AC 8)", () => {
  it("prices every enrolment unit through the rate card", () => {
    expect(priceUnit("year")).toBe("year");
    expect(priceUnit("fall")).toBe("semester");
    expect(priceUnit("spring")).toBe("semester");
    expect(priceUnit("block")).toBe("flat");
  });

  it("totals registration, deposits and tuition from the settings", () => {
    const cost = applicationCost(applied(), OFFERINGS, SEEDED_MONEY_SETTINGS);

    expect(cost.total.registration).toBe(SEEDED_MONEY_SETTINGS.registrationFee);
    expect(cost.total.deposits).toBe(SEEDED_MONEY_SETTINGS.classDeposit);
    expect(cost.total.total).toBe(
      SEEDED_MONEY_SETTINGS.registrationFee +
        SEEDED_MONEY_SETTINGS.classDeposit +
        cost.total.tuitionDue,
    );
  });

  it("changes when a setting changes — every figure, not just one", () => {
    const before = applicationCost(
      applied(),
      OFFERINGS,
      SEEDED_MONEY_SETTINGS,
    ).total;
    const dearer = applicationCost(applied(), OFFERINGS, {
      ...SEEDED_MONEY_SETTINGS,
      registrationFee: SEEDED_MONEY_SETTINGS.registrationFee + 10,
      classDeposit: SEEDED_MONEY_SETTINGS.classDeposit + 25,
      rates: { standard: 20, highSchoolCredit: 30 },
    }).total;

    expect(dearer.registration).toBe(before.registration + 10);
    expect(dearer.deposits).toBe(before.deposits + 25);
    expect(dearer.tuition).toBe(before.tuition * 2);
    expect(dearer.total).toBeGreaterThan(before.total);
  });

  it("credits the deposit against tuition when the flag says so, and not when it does not", () => {
    const values = applied();
    const credited = applicationCost(
      values,
      OFFERINGS,
      SEEDED_MONEY_SETTINGS,
    ).total;
    const onTop = applicationCost(values, OFFERINGS, {
      ...SEEDED_MONEY_SETTINGS,
      depositCreditedAgainstTuition: false,
    }).total;

    expect(credited.creditedAgainstTuition).toBe(
      SEEDED_MONEY_SETTINGS.classDeposit,
    );
    expect(onTop.creditedAgainstTuition).toBe(0);
    expect(onTop.total).toBe(
      credited.total + SEEDED_MONEY_SETTINGS.classDeposit,
    );
  });

  it("charges the registration fee once per student, not once per family", () => {
    // "Once per student per year, however many classes" — a family of two pays
    // it twice, and totalling one flat list of selections would understate the
    // cheque by a whole fee.
    const twoChildren = applied({
      "child-1-name": "Obi",
      "child-1-age": "9",
      "child-1-classes": ["kingdom-math:year"],
    });
    const cost = applicationCost(twoChildren, OFFERINGS, SEEDED_MONEY_SETTINGS);

    expect(cost.perChild).toHaveLength(2);
    expect(cost.total.registration).toBe(
      SEEDED_MONEY_SETTINGS.registrationFee * 2,
    );
  });

  it("charges a child who chose nothing nothing at all", () => {
    const cost = applicationCost(
      applied({ "child-1-name": "Obi", "child-1-age": "9" }),
      OFFERINGS,
      SEEDED_MONEY_SETTINGS,
    );

    expect(cost.perChild[1]!.owed.registration).toBe(0);
    expect(cost.perChild[1]!.owed.total).toBe(0);
  });
});

/**
 * #31 AC 3, 4 and 5 across a *family*. `offerings.test.ts` proves the clash
 * rule itself over one timetable; this proves the page asks it the right
 * question — once per child, never once per family.
 */
describe("whose timetable a clash belongs to (#31 AC 5)", () => {
  const MONDAY_1120 = ["algebra-1:year", "beginner-latin-grades-5-6:year"];

  it("warns about one child who chose two classes at one time", () => {
    const clashing = familyClashes(
      applied({ "child-0-classes": MONDAY_1120 }),
      OFFERINGS,
      SEEDED_SCHOOL_YEAR,
    );

    expect(clashing).toHaveLength(1);
    expect(clashing[0]!.child.name).toBe("Ada");
    expect(clashing[0]!.index).toBe(0);
    expect(clashing[0]!.clashes[0]!.severity).toBe("clash");
  });

  it("says nothing when two children hold the same slot between them", () => {
    // Two children can sit in two rooms at 11:20 on a Monday. The family
    // selection pooled would call this a clash and be plainly wrong.
    const clashing = familyClashes(
      applied({
        "child-0-classes": ["algebra-1:year"],
        "child-1-name": "Obi",
        "child-1-age": "9",
        "child-1-classes": ["beginner-latin-grades-5-6:year"],
      }),
      OFFERINGS,
      SEEDED_SCHOOL_YEAR,
    );

    expect(clashing).toEqual([]);
  });

  it("says nothing when two children pick one class in different units", () => {
    // Pooled, this reads as the same course clashing with itself — the "nobody
    // buys the year and the fall" mistake, attributed to a family who made it.
    const clashing = familyClashes(
      applied({
        "child-0-classes": ["algebra-1:year"],
        "child-1-name": "Obi",
        "child-1-age": "9",
        "child-1-classes": ["algebra-1:fall"],
      }),
      OFFERINGS,
      SEEDED_SCHOOL_YEAR,
    );

    expect(clashing).toEqual([]);
  });

  it("names each child who has a clash of their own", () => {
    const clashing = familyClashes(
      applied({
        "child-0-classes": MONDAY_1120,
        "child-1-name": "Obi",
        "child-1-age": "9",
        "child-1-classes": MONDAY_1120,
      }),
      OFFERINGS,
      SEEDED_SCHOOL_YEAR,
    );

    expect(clashing.map((one) => one.child.name)).toEqual(["Ada", "Obi"]);
    expect(clashing.map((one) => one.index)).toEqual([0, 1]);
  });
});

describe("the children’s sensitive data does not enter the site (#31 AC 9)", () => {
  it("knows a name, an age and the classes, and nothing else", () => {
    // The acceptance criterion as a property of the type. A field added to
    // `ApplicationChild` fails here before it can reach a form.
    const { values } = parseApplication(goodForm(), OFFERINGS);
    expect(Object.keys(values.children[0]!).sort()).toEqual([
      "age",
      "name",
      "offeringKeys",
    ]);
  });

  it("holds a family name, an email, the children and the Statement, and nothing else", () => {
    // `agreements` is the one field added since (#71), and it is met here
    // deliberately rather than edited around: an agreement to the Code of
    // Conduct or the Handbook is a position the *family* takes about two
    // published documents, not a fact about a child's person. ADR-0007 excludes
    // the second and has nothing to say about the first. `paymentMethod` (#219)
    // is the same kind of fact one step further out: it is how the family says
    // they will pay the school, and it says nothing about any child at all.
    //
    // `phone` and `address` are the two ADR-0024 adds (#312), and they are met
    // here on the same argument: a household's contact details are the class of
    // fact the email address beside them always was. They sit on the
    // application and never on a child, which the test above is what proves.
    const { values } = parseApplication(goodForm(), OFFERINGS);
    expect(Object.keys(values).sort()).toEqual(
      [
        "address",
        "agreements",
        "children",
        "email",
        "familyName",
        "faith",
        "objections",
        "paymentMethod",
        "phone",
      ].sort(),
    );
  });

  /*
   * The same criterion against the form itself.
   *
   * The types above cannot be the whole test: a field on the page that posts
   * to a name the parser ignores still *collects* a date of birth, and the
   * harm the criterion is about is the collecting. So this reads the page off
   * disk and looks at what it asks for.
   *
   * **Attribute names, not prose.** The doc comments in `application.ts`,
   * `schema.ts`, `migrations.ts` and the page itself deliberately use every one
   * of these words to explain why the fields are absent, so a plain text grep
   * over any of them fails on its own explanation.
   */
  /*
   * The same criterion against the modules that hold the rules.
   *
   * `validateApplication` moved to `validation.ts` (ADR-0009), and `#85` moved
   * `ApplicationChild` after it. A criterion enforced only over the file the
   * code used to be in is a criterion a move can quietly repeal, so both
   * modules are read, and a rule naming one of these fields fails here wherever
   * it is written.
   *
   * **Names, not prose.** Comments and string literals come out first: the doc
   * comments in both files use every one of these words to explain why the
   * fields are absent, and "we need an email address to reply to" is a message
   * about a grown-up. What is left is the names the code actually declares,
   * which is where a new field would have to appear.
   */
  it.each(["application.ts", "validation.ts"])(
    "declares no %s field",
    (module) => {
      const names = readFileSync(
        fileURLToPath(new URL(module, import.meta.url)),
        "utf8",
      )
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ")
        .replace(
          /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g,
          " ",
        )
        .toLowerCase();
      expect(names.length).toBeGreaterThan(0);

      expect(names).not.toMatch(FORBIDDEN);
    },
  );

  it("declares the household address only on the application, never on a child", () => {
    // ADR-0024's line, at the type. `ApplicationChild` is read on its own —
    // the file around it now legitimately declares `address`, `street`, `city`
    // and `zip` on `ApplicationFields`, and the criterion this guards was never
    // about the file: it is about what the site records against a student.
    const validation = readFileSync(
      fileURLToPath(new URL("validation.ts", import.meta.url)),
      "utf8",
    );
    const child =
      /export type ApplicationChild = \{[\s\S]*?\n\};/.exec(validation)?.[0] ??
      "";
    expect(child.length).toBeGreaterThan(0);

    expect(child.toLowerCase()).not.toMatch(PER_CHILD_FORBIDDEN);
  });

  it("asks for no date of birth, medical, evaluation or custody field", () => {
    for (const field of asksFor()) {
      expect(field, `the form asks for ${field}`).not.toMatch(FORBIDDEN);
    }
  });

  it("asks for no address, street or zip against a child (#312)", () => {
    // The household address is asked for once, as `street`, `city`, `state`
    // and `zip` (ADR-0024). What stays barred is the same question asked *per
    // child* — every control inside a child row posts under `child-<n>-`, so
    // that prefix is exactly the criterion.
    // The row index is a template hole in the markup rather than a number,
    // which is why the pattern accepts one.
    const perChild = asksFor().filter((field) =>
      /^(apply-)?child-(\d+|\$\{)/.test(field),
    );
    expect(perChild.length).toBeGreaterThan(0);

    for (const field of perChild) {
      expect(field, `the form asks a child for ${field}`).not.toMatch(
        PER_CHILD_FORBIDDEN,
      );
    }
  });
});

/** Every name, id and label target the Apply page asks for, lowercased. */
function asksFor(): string[] {
  const page = readFileSync(
    fileURLToPath(
      new URL("../../pages/admissions/apply.astro", import.meta.url),
    ),
    "utf8",
  );

  const asked = [
    ...page.matchAll(/(?:name|id|for)=(?:"([^"]*)"|\{`([^`]*)`\})/g),
  ].map((match) => (match[1] ?? match[2] ?? "").toLowerCase());
  expect(asked.length).toBeGreaterThan(0);
  return asked;
}

/**
 * What the site does not collect, anywhere (#31 AC 9).
 *
 * Date of birth, allergies, medical conditions, evaluation history and custody
 * arrangements are all on the school's live Google Form and are all
 * deliberately absent here — they move to paper signed at enrolment. This is
 * what deletes the stricter storage tier rather than building it, and it is not
 * a shortcut to be quietly reversed.
 */
const FORBIDDEN =
  /\b(dob|birth|allerg|medical|medicat|diagnos|custody|iep|adhd|evaluation)/;

/**
 * And what it does not collect **about a child** (#312, ADR-0024).
 *
 * The home address was on the list above until the school found it could not
 * post paperwork to a family. ADR-0024 reopens ADR-0007 exactly this far: one
 * household address on the application, in the same class of fact as the email
 * address beside it — and not one word of it against a student. Every rule
 * above still applies to both.
 *
 * The two lists are the decision. Deleting this one would be removing the wall
 * rather than opening a door, and is a reversal that needs its own ADR.
 */
const PER_CHILD_FORBIDDEN =
  /\b(address|street|zip|postcode|dob|birth|allerg|medical|medicat|diagnos|custody|iep|adhd|evaluation)/;
