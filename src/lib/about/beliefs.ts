/**
 * The Statement of Faith and Practice, as the school publishes it (#30).
 *
 * **Every string in this file is the school's own text, transcribed from
 * `docs/mirror/pages/statement_of_faith.txt`, and none of it is drafted here.**
 * That is the hardest content rule on the project (#18 §18): invented doctrine
 * on a Christian school's site is a real-world harm, not a placeholder. The
 * test beside this file reads the mirror and fails if a single article has
 * drifted from what the school actually published, which is what makes "never
 * drafted" a check rather than a promise.
 *
 * It lives in git as copy rather than in the store because it is not in the
 * editable set (#18 §10): the seam there is authored-by-me vs editable-by-them,
 * and the Statement is neither — it is the school board's document, changed by
 * a board decision, and a text area in the admin is the wrong shape for that.
 * A revision arrives as a pull request, which is also what gives it a version
 * history the application can record against (#18 §11).
 *
 * Two published defects are carried through verbatim rather than silently
 * corrected, and both are the school's to fix:
 *
 * - Article 8 opens a scripture citation it never closes ("the resurrection of
 *   the body 1 Corinthians 15:20-24,").
 * - The first note reads "are taken from Taken from p. 6".
 *
 * Correcting either would mean this file no longer says what the school says,
 * and the whole point of the transcription test is that it does.
 */

/** Where the Statement lives, and the address the 301 from Wix lands on. */
export const BELIEFS_PATH = '/about/beliefs';

/**
 * The eleven numbered articles, in the school's order.
 *
 * Numbering is rendered by the list, not stored in the strings, so a screen
 * reader is not told "one dot" twice.
 */
export const BELIEFS_ARTICLES: readonly string[] = [
  'We believe that the Bible is the divinely inspired Word of God, the only infallible rule of faith and practice (2 Timothy 3:15-17, 2 Peter 1:21).',
  'We believe in one God (Genesis 1:1) eternally existent in three persons—Father, Son, and Holy Spirit—one in essence and community (Matthew 28:19, John 10:30, 2 Corinthians 13:14).',
  'We believe in God the Father, the Almighty (Jeremiah 32:17) Creator of heaven and earth (Genesis 1:1).',
  'We believe that Jesus Christ our Lord is the Word made flesh—fully God and fully man. We believe he was conceived by the Holy Spirit (Luke 1:35), was born of the virgin Mary (Isaiah 7:14, Matthew 1:23, Luke 2:7), lived a sinless life (Hebrews 4:15, Hebrews 7:26), was crucified (Luke 23:33), died and was buried, rose again on the third day (1 Corinthians 15:3-4), and ascended into heaven (Mark 16:19, Acts 1:9-11).',
  'We believe in the divinity of the Holy Spirit (Acts 5:1-4), who indwells the believer (Romans 8:9, 1 Corinthians 6:19-20). The Holy Spirit convicts of sin (John 16:8), enables the believer to live a holy life (2 Timothy 1:9), comforts (John 14:16), teaches (John 14:26), and bestows spiritual gifts (Romans 12:6-8; 1 Corinthians 12:7-11, 25-31; Ephesians 4:11-13).',
  'We believe humanity is created in the image of God (Genesis 1:27), has fallen into sin (Romans 5:12), and can be born again by the Spirit (John 3:6-7), justified freely by grace, and saved through the atoning work of Jesus Christ alone (Romans 3:24-25).',
  'We believe that the Church is the body of Christ (Ephesians 1:22-23), the people of God (1 Peter 2:9-10), whose mission is to make disciples of all nations (Matthew 28:19-20) and to be salt and light in the world (Matthew 5:14-16).',
  'We believe in the return of Jesus Christ (Acts 1:10-11), the resurrection of the body 1 Corinthians 15:20-24, 1 Thessalonians 4:16-17), the final judgment (Revelation 20:11-15), everlasting life (Revelation 22:1-5), and the new heavens and new earth (Revelation 21:1).',
  'We believe that God wonderfully and immutably creates each person as male or female (Genesis 1:26), and that these two distinct, complementary genders together reflect the image and nature of God (Genesis 1:27). We believe that God created marriage to be exclusively the union of one man, born as a man, and one woman, born as a woman (Genesis 2:24, Matthew 19:5), and that intimate sexual activity is to occur exclusively within that union (1 Corinthians 7:1-3, Romans 1:26-27).',
  'We believe that all human life is sacred and created by God in His image (Genesis 1:26-27). Human life is of inestimable worth in all its dimensions, including pre-born babies, the aged, the physically or mentally challenged, and every other stage or condition from conception through natural death. We are therefore called to defend, protect, and value all human life (Deuteronomy 30:19, Psalm 139).',
  'When addressing or teaching about contemporary social issues, Pharos Academy will draw biblical guidance from and align with the principles outlined in the Churches of God, General Conference’s document, Here We Stand 2016.',
];

/** The paragraph that follows the eleven, in the school's own words. */
export const BELIEFS_CLOSING =
  'Our Statement of Faith and Practice as outlined in #1-11 is not exhaustive of all of our beliefs. The Bible, as the inspired and infallible Word of God, speaks with absolute authority regarding the proper conduct of mankind and is the unchanging foundation for all belief and behavior. The Pharos Academy School Board holds final interpretive authority on Biblical meaning and application with regard to faith, doctrine, policy, practice and discipline (Adapted from p. 160 of Herzog Foundation School Board Governance Training Manual).';

/**
 * The school's own attribution notes.
 *
 * Kept because they are permissions, not decoration: statements 1–8 and 9–10
 * are used by permission of two other bodies, and a page that reproduces the
 * text without the permission line is republishing somebody else's copyright.
 */
export const BELIEFS_NOTES: readonly string[] = [
  'Statements 1-8 are taken from Taken from p. 6 of We Believe.  Copyright 2014 by the Churches of God, General Conference.  Printed in the United States of America.  Used by permission.  Scripture passages have been added.',
  'Statements 9-10 are taken from the Constitution of the Enola First Church of God.  Used by permission.  Scripture passages have been added.',
];

/**
 * "Here We Stand 2016", which article 11 binds the school to.
 *
 * Hosted on the host church's own domain, exactly as the live Statement of
 * Faith page links it. Linked rather than copied for the obvious reason: it is
 * a fifty-page denominational document the church maintains, and a copy here
 * would be a second version of somebody else's doctrine going stale.
 */
export const HERE_WE_STAND = {
  title: 'Here We Stand 2016',
  href: 'https://www.enolacog.com/_files/ugd/cecb9d_f075221ca072474b8d6c86452e3fc557.pdf',
};
