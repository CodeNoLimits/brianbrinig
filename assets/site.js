(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;

  /* smooth scroll on mouse/trackpad only; touch keeps native scrolling */
  let lenis = null;
  if (!reduced && finePointer && window.Lenis) {
    lenis = new window.Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  }
  /* Lenis only gets frames while something scrolls: at rest the main thread stays idle */
  let lenisOn = false, lenisLast = 0;
  const lenisLoop = t => {
    lenis.raf(t);
    if (lenis.isScrolling || t - lenisLast < 300) requestAnimationFrame(lenisLoop); else lenisOn = false;
  };
  const kick = () => { if (!lenis) return; lenisLast = performance.now(); if (!lenisOn) { lenisOn = true; requestAnimationFrame(lenisLoop); } };
  if (lenis) { ['wheel', 'pointerdown', 'keydown'].forEach(ev => addEventListener(ev, kick, { passive: true })); lenis.on('scroll', kick); kick(); }
  const scrollToEl = el => { if (lenis) { kick(); lenis.scrollTo(el, { offset: -20 }); } else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); };
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const el = id.length > 1 && document.getElementById(id.slice(1));
    if (!el) return;
    e.preventDefault(); closeMenu(false); scrollToEl(el);
    history.replaceState(null, '', id);
  }));

  /* reveal on enter */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -2% 0px', threshold: 0 });
  $$('[data-reveal]').forEach(el => io.observe(el));

  /* quote: split into words for the scrub */
  const quote = $('[data-words]');
  const words = [];
  if (quote) {
    const walk = (node, hot) => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span'); s.className = 'w'; s.textContent = part;
            if (hot) s.classList.add('hot');
            frag.appendChild(s); words.push(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n, hot || n.hasAttribute('data-hot'));
      });
    };
    walk(quote, false);
  }

  /* scroll-driven scenes (one rAF per scroll, transform/opacity only) */
  const hero = $('[data-scrub="hero"]'), heroImg = hero && $('.hero__media img', hero), heroContent = hero && $('.hero__content', hero), heroScroll = $('[data-hero-scroll]');
  const said = $('[data-scrub="said"]'); const saidWrap = said && $('.said__wrap', said);
  const opening = $('[data-scrub="opening"]'), book = $('[data-book]'), caps = $$('[data-cap]'), cta = $('.opening__cta'), ctaLinks = $$('[data-opening-cta]');
  const tocItems = book ? $$('.book__parts li', book) : [];
  const pool = $('[data-pool]'), shadow = $('[data-shadow]'), caps0 = $('.opening__captions');
  const chapter = $('[data-scrub="chapter"]'), bar = $('[data-chapter-bar]');
  const timeline = $('[data-timeline]'), tlItems = timeline ? $$('li', timeline) : [];
  const mobile = matchMedia('(max-width: 767px)');
  /* one caption per page: open the book / cover and contents / Part I / Chapter 1 */
  /* each caption switches when its page turn is half done (ease-out: eased 0.5 is reached at 20.6% of the turn) */
  const mid = (start, len) => start + 0.206 * len;
  const capWin = [[0, mid(0.12, 0.24)], [2, 2], [mid(0.12, 0.24), mid(0.5, 0.2)], [mid(0.5, 0.2), 1]];   // desktop: closed / (no title-only state) / title + contents / Part I + Chapter 1
  const capWinM = [[0, mid(0.12, 0.18)], [mid(0.12, 0.18), mid(0.36, 0.14)], [mid(0.36, 0.14), mid(0.58, 0.14)], [mid(0.58, 0.14), 1]];   // phones: cover / title page / contents / Chapter 1
  let ctaOn = null, bw = 0;

  function setBook(p, exit = 1, arrived = true) {
    const m = mobile.matches;
    const a = ease(clamp(p / 0.12));                 // closed book turns to face the reader
    const b = m ? ease(clamp((p - 0.12) / 0.18)) : ease(clamp((p - 0.12) / 0.24));   // cover opens (desktop: onto the title page and the contents)
    /* phones: one full-frame page that turns onto the next: cover, title page, contents, Chapter 1.
       A turned page fades out once past ~100°, so nothing ever hangs half off the screen. */
    const t = m ? ease(clamp((p - 0.36) / 0.14)) : 0;                      // title page turns
    const d = m ? ease(clamp((p - 0.58) / 0.14)) : ease(clamp((p - 0.5) / 0.2));   // the contents leaf turns
    /* phones: a turned page is gone by ~95°, before its free edge can reach the screen edge */
    const gone = x => (m ? 1 - clamp((x - 0.47) / 0.06) : 1);   // fades only while nearly edge-on (84°–95°), so it never ghosts
    const e = ease(clamp((p - 0.86) / 0.07));       // end: dolly back so the CTA sits under the book
    /* camera dolly, plus a slow continuous push-in so no stretch of scroll is ever a still frame */
    const s = (0.86 + 0.06 * a + 0.08 * b) * (1 + 0.05 * clamp((p - 0.12) / 0.74)) * (1 - (m ? 0.16 : 0.14) * e);
    const ty = -(m ? 40 : 38) * e;
    const tx = m ? 0 : (bw / 2) * b * s;            // desktop centres the open spread; phones keep the page centred
    book.style.setProperty('--ry', `${-28 * (1 - a)}deg`);
    book.style.setProperty('--rx', `${10 * (1 - a) + 4 * b * (1 - b) + 3 * t * (1 - t) + 3 * d * (1 - d)}deg`);
    book.style.setProperty('--s', s.toFixed(4));
    /* the leaf lifts 3px as it turns so it always lands above the cover's back */
    book.style.setProperty('--open', `${-179 * b}deg`);
    book.style.setProperty('--tleaf', `${-178 * t}deg`);
    book.style.setProperty('--leaf', `${-178 * d}deg`);
    book.style.setProperty('--lz', `${-1 + 3 * d}px`);
    book.style.setProperty('--co', gone(b).toFixed(3));
    book.style.setProperty('--to', gone(t).toFixed(3));
    book.style.setProperty('--lo', gone(d).toFixed(3));
    /* the turning page darkens toward its free edge (it reads as curved, never a flat grey slab),
       and the page underneath takes the shadow it casts */
    book.style.setProperty('--leaf-shade', (Math.sin(Math.PI * d) * 0.9).toFixed(3));
    book.style.setProperty('--under-shade', (Math.sin(Math.PI * d) * (m ? 0.7 : 0.6)).toFixed(3));
    book.style.setProperty('--cover-shade', (Math.sin(Math.PI * (m ? t : b)) * (m ? 0.7 : 0.6)).toFixed(3));
    book.style.setProperty('--title-shade', (m ? Math.max(Math.sin(Math.PI * b) * 0.7, Math.sin(Math.PI * t) * 0.9) : 0).toFixed(3));
    book.style.setProperty('--front-shade', (Math.sin(Math.PI * b) * (m ? 0.8 : 0.5)).toFixed(3));
    book.style.setProperty('--tx', `${tx}px`); book.style.setProperty('--ty', `${ty}px`);
    /* desktop: the leaf's shadow sweeps over the left page as it lands, so the page it hides reads as covered, not cut */
    const th = Math.PI * d;
    book.style.setProperty('--l-shade', (!m && d > 0.5 ? Math.sin(th) * 0.95 : 0).toFixed(3));
    book.style.setProperty('--lw', (d > 0.5 ? -Math.cos(th) * 100 : 0).toFixed(1));
    if (pool) { pool.style.setProperty('--pool', clamp(0.35 * a + 0.65 * b).toFixed(3)); pool.style.setProperty('--tx', `${tx}px`); pool.style.setProperty('--ty', `${ty}px`); }
    if (shadow) shadow.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${(m ? 1 + 0.15 * b : 1 + 1.15 * b).toFixed(3)},${(1 + 0.35 * b).toFixed(3)})`;
    /* the contents are printed as soon as the cover lifts: no blank page */
    /* the contents lines come up one by one while the reader looks at them */
    const toc = m ? clamp((p - 0.4) / 0.14) : clamp((p - 0.22) / 0.24);
    /* Chapter 1 sets line by line while it is on screen, so its stretch of scroll is never a still frame */
    book.style.setProperty('--rd', clamp((p - (m ? 0.62 : 0.56)) / 0.26).toFixed(3));
    tocItems.forEach((li, i) => li.style.setProperty('--toc-o', ease(clamp(toc * 2.2 - i * 0.32)).toFixed(3)));
    /* captions switch on/off by class (CSS fades them); the first waits until the book is fully on screen */
    const win = m ? capWinM : capWin;
    caps.forEach((el, i) => {
      const [s0, s1] = win[i];
      const on = (i === 0 ? arrived : p >= s0) && (i === caps.length - 1 || p < s1);
      el.classList.toggle('is-on', on);
    });
    if (caps0) caps0.style.opacity = clamp(exit * 6 - 5).toFixed(3);   // captions leave before the scene does
    /* the closing buttons are either off or fully on (CSS fades between the two), never parked half-transparent */
    const on = p > 0.9;
    if (on !== ctaOn) { cta.classList.toggle('is-on', on); ctaLinks.forEach(l => (l.tabIndex = on ? 0 : -1)); ctaOn = on; }
  }

  /* layout cache: absolute tops/heights, measured on load and resize, never while scrolling */
  const absTop = el => { let t = 0; for (; el; el = el.offsetParent) t += el.offsetTop; return t; };
  const box = el => (el ? { top: absTop(el), h: el.offsetHeight } : null);
  const rect = (b, y) => ({ top: b.top - y, bottom: b.top + b.h - y, height: b.h });
  let L = {}, vh = innerHeight;
  function measure() {
    vh = innerHeight;
    if (book) bw = book.offsetWidth;
    L = { hero: box(hero), said: box(said), opening: box(opening), timeline: box(timeline), chapter: box(chapter),
      papers: papers.map(box), secs: secs.map(box), shelf: box(shelf) };
  }
  let lastN = 0;

  function frame() {
    ticking = false;
    const y = scrollY;
    if (hero) {
      const r = rect(L.hero, y);
      if (r.bottom > 0) {
        const p = clamp(-r.top / r.height);
        if (!reduced) {
          heroImg.style.transform = `translate3d(0,${p * 14}%,0) scale(${(mobile.matches ? 1 : 1.08) + p * 0.06})`;
          heroContent.style.transform = `translate3d(0,${p * -60}px,0)`;
          heroContent.style.opacity = `${1 - p * 1.4}`;
          if (heroScroll) heroScroll.style.opacity = `${clamp(1 - p * 10)}`;   // gone by 10% of the hero
        }
      }
    }
    if (said && words.length) {
      const r = rect(L.said, y);
      const p = clamp((vh * 0.82 - r.top) / (r.height * 0.72));
      const n = Math.round(p * words.length);
      for (let i = Math.min(n, lastN); i < Math.max(n, lastN); i++) words[i].classList.toggle('on', i < n);   // only the words that changed
      lastN = n;
    }
    if (opening && book) {
      const r = rect(L.opening, y);
      if (saidWrap && !reduced) saidWrap.style.opacity = clamp((r.top - vh * 0.35) / (vh * 0.35)).toFixed(3);   // the quote is gone before the book pins
      /* the first caption is up as soon as the book comes into view, not once it is pinned */
      if (r.top < vh && r.bottom > 0) setBook(clamp(-r.top / (r.height - vh)), clamp((r.bottom - vh * 0.55) / (vh * 0.4)), r.top < vh * 0.7);
    }
    if (timeline && !reduced) {
      const r = rect(L.timeline, y);
      const p = clamp((vh * 0.78 - r.top) / r.height);
      timeline.style.setProperty('--tl', p.toFixed(4));
      tlItems.forEach((li, i) => li.classList.toggle('on', p * tlItems.length > i + 0.15));
    }
    if (chapter && bar) {
      const r = rect(L.chapter, y);
      bar.parentElement.style.setProperty('--p', clamp((vh * 0.5 - r.top) / r.height).toFixed(4));
    }
    navState();
  }
  let ticking = false;
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  if (reduced) {
    words.forEach(w => w.classList.add('on'));
    tlItems.forEach(li => li.classList.add('on'));
    if (timeline) timeline.style.setProperty('--tl', 1);
    if (book) { bw = book.offsetWidth; setBook(1); }
  } else {
    addEventListener('scroll', onScroll, { passive: true });
  }

  /* nav: hide on scroll down, show on scroll up; active section */
  const nav = $('[data-nav]');
  let lastY = scrollY;
  const links = $$('.nav__links a');
  const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
  const dockEl = $('[data-dock]');
  const papers = $$('.paper'), shelf = $('#books');
  function navState() {
    const y = scrollY, down = y > 300 && y > lastY + 4;
    let inBook = false;
    if (opening) { const r = rect(L.opening, y); inBook = r.top <= vh * 0.35 && r.bottom > 0; }   // the bar stays away for the whole sequence, entry and exit
    /* a re-measure (late image, font) is not a scroll: keep the bar where the last real scroll put it */
    const moved = Math.abs(y - lastY) > 4;
    if (!document.body.classList.contains('menu-open') && (moved || inBook)) nav.classList.toggle('is-hidden', down || inBook);
    nav.classList.toggle('is-light', L.papers.some(b => { const r = rect(b, y); return r.top < 48 && r.bottom > 48; }));
    nav.classList.toggle('is-top', y < vh * 0.55);
    /* mobile buy bar: out of the way while reading down, back when scrolling up */
    if (dockEl && Math.abs(y - lastY) > 4) dockEl.classList.toggle('is-off', down);
    if (Math.abs(y - lastY) > 4) lastY = y;
    let cur = -1;
    L.secs.forEach((b, i) => { if (b && b.top - y < vh * 0.4) cur = i; });
    if (L.shelf && L.shelf.top - y < vh * 0.4) cur = -1;
    links.forEach((a, i) => a.classList.toggle('is-active', i === cur));
  }
  if (reduced) addEventListener('scroll', () => requestAnimationFrame(navState), { passive: true });
  const remeasure = () => { measure(); onScroll(); };
  measure(); frame();
  addEventListener('resize', remeasure, { passive: true });
  addEventListener('load', remeasure);
  document.fonts && document.fonts.ready.then(remeasure);
  new ResizeObserver(remeasure).observe(document.body);   // late layout changes (fonts, images) refresh the cache

  /* phones: the full contents fold under one line (desktop keeps it open beside the endorsement) */
  const tocAll = $('[data-toc-all]');
  if (tocAll && mobile.matches) tocAll.open = false;

  /* mobile menu */
  const burger = $('.nav__burger'), menu = $('#menu');
  const behindMenu = [$('main'), $('[data-foot]'), $('[data-dock]'), $('.nav__brand')].filter(Boolean);
  function openMenu() {
    menu.hidden = false; menu.inert = false; requestAnimationFrame(() => menu.classList.add('is-open'));
    burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open'); lenis && lenis.stop();
    behindMenu.forEach(el => (el.inert = true));
    const first = $('a', menu); first && first.focus();
  }
  function closeMenu(restore = true) {
    if (menu.hidden) return;
    menu.classList.remove('is-open'); menu.inert = true; burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open'); lenis && lenis.start();
    behindMenu.forEach(el => (el.inert = false));
    if (restore) burger.focus();
    setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 500);
  }
  burger.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  /* mobile dock: hidden whenever another "Get the book" button (or the hero, the sequence, the footer) is on screen */
  const dock = $('[data-dock]');
  if (dock) {
    const seen = new Set();
    const dimg = $('img[data-src]', dock);
    const upd = () => {
      const on = seen.size === 0;
      if (on && dimg && !dimg.src) dimg.src = dimg.dataset.src;   // cover thumbnail is fetched on first show only
      dock.classList.toggle('is-on', on); dock.tabIndex = on ? 0 : -1; dock.setAttribute('aria-hidden', on ? 'false' : 'true');
    };
    const dio = new IntersectionObserver(es => { es.forEach(e => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target))); upd(); });
    $$('[data-dock-hide]').forEach(el => dio.observe(el));
  }

  /* cover tilt (pointer only) */
  const tilt = $('[data-tilt]');
  if (tilt && finePointer && !reduced) {
    const img = tilt.firstElementChild;
    tilt.addEventListener('pointermove', e => {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      img.style.setProperty('--ty', `${x * 16}deg`); img.style.setProperty('--tx', `${-y * 12}deg`);
    });
    tilt.addEventListener('pointerleave', () => { img.style.removeProperty('--ty'); img.style.removeProperty('--tx'); });
  }

  /* shorts rail arrows */
  const rail = $('[data-rail-track]');
  $$('[data-rail]').forEach(b => b.addEventListener('click', () => rail.scrollBy({ left: Number(b.dataset.rail) * rail.clientWidth * 0.8, behavior: 'smooth' })));
  if (rail && lenis) rail.setAttribute('data-lenis-prevent', '');

  /* video player: the YouTube iframe only exists after a click */
  const dlg = $('#player'), frameBox = $('[data-frame]');
  let opener = null;
  function play(src, short, title, from) {
    opener = from || document.activeElement;
    dlg.classList.toggle('is-short', !!short);
    const f = document.createElement('iframe');
    f.src = src; f.title = title || 'YouTube video player';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
    frameBox.replaceChildren(f);
    dlg.showModal(); lenis && lenis.stop();
  }
  const params = 'autoplay=1&rel=0&modestbranding=1&playsinline=1';
  const vTitle = b => { const t = $('.vcard__title, .lesson__title', b); return t ? t.textContent.trim() : 'YouTube video player'; };
  $$('[data-yt]').forEach(b => b.addEventListener('click', () => play(`https://www.youtube-nocookie.com/embed/${b.dataset.yt}?${params}`, b.dataset.kind === 'short', vTitle(b), b)));
  $$('[data-yt-list]').forEach(b => b.addEventListener('click', () => play(`https://www.youtube-nocookie.com/embed/videoseries?list=${b.dataset.ytList}&rel=0&modestbranding=1&playsinline=1`, false, 'Brian Brinig: full lessons', b)));
  dlg.addEventListener('close', () => { frameBox.replaceChildren(); lenis && lenis.start(); opener && opener.focus && opener.focus(); });
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  /* featured lesson: on hover (mouse only), one silent 5 s pass, then back to the still. Nothing moves on its own. */
  const pv = $('[data-preview]');
  const saveData = navigator.connection && navigator.connection.saveData;
  if (pv && finePointer && !reduced && !saveData) {
    let loaded = false;
    const card = pv.closest('.vcard');
    const load = () => { if (loaded) return; if (pv.dataset.poster) pv.poster = pv.dataset.poster; $$('source', pv).forEach(src => (src.src = src.dataset.src)); pv.load(); loaded = true; };
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) load(); }), { rootMargin: '400px 0px' }).observe(card);
    pv.addEventListener('playing', () => pv.classList.add('is-on'));
    pv.addEventListener('ended', () => pv.classList.remove('is-on'));
    card.addEventListener('pointerenter', () => { load(); if (pv.ended) pv.currentTime = 0; const pr = pv.play(); pr && pr.catch(() => {}); });
    card.addEventListener('pointerleave', () => { pv.pause(); pv.classList.remove('is-on'); });
  }

  /* social slots (Instagram, TikTok): shown only once a URL is filled in */
  $$('[data-social-slot]').forEach(li => { const u = li.dataset.url; if (u) { li.querySelector('a').href = u; li.hidden = false; } });
})();
