/**
 * The hero's motion: a 0.5× parallax on the video while the copy rises at 1×,
 * with a blur and a dim ramping across the first viewport and then releasing.
 *
 * Three things here are acceptance criteria rather than polish, and each is
 * the reason the code is shaped the way it is.
 *
 * **The blur is a crossfade, not a filter.** `#blur` is a pre-blurred still
 * (`hope-poster-blur.webp`, 8.7 KB) faded in over the playing video. A CSS
 * `filter: blur()` on a `<video>` re-blurs twenty-four frames a second, which
 * is exactly what turns this from premium into janky on the mid-range Android
 * a lot of these families are holding.
 *
 * **`prefers-reduced-motion` is a hard stop, not a dial.** The `<video>` ships
 * with no `src` and no `<source>` children, and this script is the only thing
 * that ever assigns one. Under reduced motion it never does, so not one video
 * byte is fetched — the poster still carries the hero instead. A `display:none`
 * video with a source would still cost the download, which is the whole point.
 *
 * **Phones get the video and none of the scroll work.** Below 760px the source
 * is assigned and played, and the function returns before wiring the scroll
 * listener. The parallax is a desktop affordance; on a phone it buys nothing
 * and costs the frame budget the video is already using.
 *
 * Nothing here calls `preventDefault` on anything. The ramp reads `scrollY`
 * and clamps at the end of the first viewport; scroll itself is never touched,
 * so the page cannot trap it.
 */

const SMALL = '(max-width: 760px)';
const REDUCED = '(prefers-reduced-motion: reduce)';

export function heroFx(root: ParentNode = document) {
  const hero = root.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;

  const media = hero.querySelector<HTMLElement>('[data-hero-media]');
  const blur = hero.querySelector<HTMLElement>('[data-hero-blur]');
  const deep = hero.querySelector<HTMLElement>('[data-hero-deep]');
  const copy = hero.querySelector<HTMLElement>('[data-hero-copy]');
  const video = hero.querySelector<HTMLVideoElement>('[data-hero-video]');
  if (!media || !blur || !deep || !copy || !video) return;

  const reduced = matchMedia(REDUCED);
  const small = matchMedia(SMALL);

  function apply(progress: number) {
    const height = hero!.offsetHeight || 1;
    media!.style.transform = `translate3d(0,${(progress * height * 0.5).toFixed(2)}px,0)`;
    // Slightly eased so the still arrives a touch later than linear — the
    // crossfade reads as focus pulling rather than as a dissolve.
    blur!.style.opacity = Math.pow(progress, 1.15).toFixed(3);
    deep!.style.opacity = (progress * 0.55).toFixed(3);
    /*
     * 2.2, not 1.6: the lockup has to be GONE before the dim above has darkened
     * the ground out from under it.
     *
     * At 1.6 the copy was still 28% opaque at the ramp's midpoint, by which
     * point `deep` had taken the washed sky down to a mid grey — and
     * `docs/hero-contrast.md` caught the sub-line there at 3.65:1 against a
     * 4.5:1 need, on 100% of its pixels. The line is fine where anyone reads it,
     * at the top of the ramp; it was only failing on the way out. Fading it out
     * by 0.455 rather than 0.625 means the two never overlap, which is a better
     * answer than darkening a colour that is correct where it is read.
     */
    copy!.style.opacity = Math.max(0, 1 - progress * 2.2).toFixed(3);
    copy!.style.transform = `translate3d(0,${(progress * -40).toFixed(1)}px,0)`;
  }

  function reset() {
    media!.style.transform = '';
    blur!.style.opacity = '0';
    deep!.style.opacity = '0';
    copy!.style.opacity = '';
    copy!.style.transform = '';
  }

  let frame = 0;
  function tick() {
    frame = 0;
    // Clamped to 1: past the first viewport the ramp is finished and holds,
    // which is what "the ramp releases" means. It does not keep driving.
    apply(Math.min(1, Math.max(0, scrollY / (hero!.offsetHeight || 1))));
  }
  function onScroll() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  let sourced = false;
  function wire() {
    removeEventListener('scroll', onScroll);
    reset();

    if (reduced.matches) return;

    if (!sourced) {
      sourced = true;
      // The one assignment. Everything above depends on it not happening
      // under reduced motion.
      const src = small.matches ? video!.dataset.sm : video!.dataset.lg;
      if (src) video!.src = src;
      video!.muted = true; // belt and braces for the autoplay policy
    }
    void video!.play().catch(() => {
      /* autoplay refused: the poster is already behind it and carries the hero */
    });

    if (small.matches) return; // phones: video, no scroll work

    addEventListener('scroll', onScroll, { passive: true });
    tick();
  }

  wire();
  // A rotation across the 760px line changes which half of this applies, and a
  // desktop window narrowed past it must stop parallaxing rather than keep a
  // stale transform.
  addEventListener('resize', wire);
  reduced.addEventListener('change', wire);
}

/**
 * Where the header stops being chrome-less and takes its navy band, as a
 * fraction of the hero's height.
 *
 * Halfway, not at the end, and that is a measured decision rather than a taste
 * one. Over the hero the header's type is navy, because the scrim *lightens*
 * the sky for navy ink. But the dim layer above ramps to 55% navy-deep across
 * the same viewport, so by the far end of the ramp that navy type is sitting on
 * a ground the ramp has been steadily darkening — `docs/hero-contrast.md`
 * caught the nav at 2.83:1 there, against a 4.5:1 need, on 100% of its pixels.
 *
 * The ramp and the header state now share one trigger: the header is
 * chrome-less exactly while the hero is light enough to carry navy type, and
 * takes its own navy ground the moment it is not. The band arriving as the hero
 * recedes rather than after it has gone reads, if anything, more settled.
 */
const STICK_AT = 0.5;

/**
 * The fixed header's `stuck` state: chrome-less over the hero, navy band with a
 * gold hairline once the hero is half past.
 *
 * `offsetHeight` is read live because the hero is `100dvh` and a mobile
 * browser's chrome collapsing changes it mid-scroll.
 */
export function stickyHeader(root: ParentNode = document) {
  const header = root.querySelector<HTMLElement>('[data-site-header]');
  const hero = root.querySelector<HTMLElement>('[data-hero]');
  if (!header || !hero) return;

  let frame = 0;
  function tick() {
    frame = 0;
    header!.classList.toggle('stuck', scrollY > (hero!.offsetHeight || 1) * STICK_AT);
  }
  addEventListener(
    'scroll',
    () => {
      if (!frame) frame = requestAnimationFrame(tick);
    },
    { passive: true },
  );
  tick();
}
