/*!
 * AIToolsPro – script.js
 * Drop-in enhancement script for https://abdul7862626a-bit.github.io/Ai-tools-blogs/
 *
 * Add before </body>:   <script src="script.js" defer></script>
 *
 * Features
 *  1. Dark / light theme toggle (saved, respects OS preference)
 *  2. Reading-progress bar + back-to-top button
 *  3. Category chip filtering for article cards
 *  4. "Write Post" modal: open/close, word counter, validation, publish
 *     (posts are saved in localStorage and re-rendered on load)
 *  5. Newsletter form validation
 *  6. Table of contents smooth-scroll + scroll-spy
 *  7. Share buttons (X, Facebook, LinkedIn, Copy Link)
 *  8. Sortable comparison tables
 *  9. Animated stat counters + reveal-on-scroll
 * 10. Dismissible announcement banner
 *
 * The script is defensive: every module quietly skips itself if the
 * elements it needs are not found, so it can't break the page.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byText = (sel, re, root = document) =>
    $$(sel, root).find((el) => re.test(el.textContent.trim()));
  const on = (el, evt, fn, opts) => el && el.addEventListener(evt, fn, opts);
  const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

  const store = {
    get(key, fallback = null) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
  };

  const escapeHTML = (s) =>
    String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

  const stripEmoji = (s) =>
    s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim();

  const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

  const injectCSS = (css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  };

  /* Shared toast ----------------------------------------------------- */
  let toastTimer;
  function toast(message, type = 'info') {
    let el = $('#atp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'atp-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.className = `atp-toast atp-${type} atp-show`;
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('atp-show'), 3200);
  }

  /* Shared CSS (only things this script injects) ---------------------- */
  injectCSS(`
    html{scroll-behavior:smooth}
    html[data-theme="dark"]{color-scheme:dark}
    #atp-progress{position:fixed;top:0;left:0;height:3px;width:0;z-index:9999;
      background:linear-gradient(90deg,#6366f1,#a855f7);transition:width .1s linear}
    #atp-top{position:fixed;right:20px;bottom:20px;width:44px;height:44px;border:0;
      border-radius:50%;background:#6366f1;color:#fff;font-size:20px;cursor:pointer;
      opacity:0;pointer-events:none;transform:translateY(10px);
      transition:opacity .25s,transform .25s;z-index:9998;box-shadow:0 6px 18px rgba(0,0,0,.25)}
    #atp-top.atp-show{opacity:1;pointer-events:auto;transform:none}
    .atp-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);
      padding:12px 18px;border-radius:10px;background:#1f2937;color:#fff;font:500 14px/1.3 system-ui,sans-serif;
      opacity:0;pointer-events:none;transition:all .3s;z-index:10000;max-width:90vw}
    .atp-toast.atp-show{opacity:1;transform:translate(-50%,0)}
    .atp-toast.atp-success{background:#059669}
    .atp-toast.atp-error{background:#dc2626}
    .atp-reveal{opacity:0;transform:translateY(16px);transition:opacity .5s ease,transform .5s ease}
    .atp-reveal.atp-in{opacity:1;transform:none}
    .atp-hidden{display:none!important}
    .atp-empty{padding:24px;text-align:center;opacity:.7;grid-column:1/-1}
    .atp-invalid{outline:2px solid #dc2626!important}
    .atp-sortable th{cursor:pointer;user-select:none}
    .atp-sortable th[data-dir="asc"]::after{content:" ▲";font-size:.7em}
    .atp-sortable th[data-dir="desc"]::after{content:" ▼";font-size:.7em}
    .atp-toc-active{font-weight:700;color:#6366f1!important}
    .atp-close-banner{background:none;border:0;color:inherit;font-size:18px;
      cursor:pointer;margin-left:12px;opacity:.8}
    .atp-user-post{border:1px solid rgba(128,128,128,.25);border-radius:12px;padding:18px}
    @media (prefers-reduced-motion:reduce){
      html{scroll-behavior:auto}.atp-reveal{transition:none;opacity:1;transform:none}}
  `);

  /* ------------------------------------------------------------------ *
   * 1. Theme toggle
   * ------------------------------------------------------------------ */
  function initTheme() {
    const root = document.documentElement;
    const btn =
      $('#themeToggle, #theme-toggle, .theme-toggle, [data-theme-toggle]') ||
      byText('button, a, span', /^(🌙|☀️|🌞)$/);

    const saved = store.get('atp-theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    let theme = saved || (prefersDark ? 'dark' : 'light');

    const apply = (t) => {
      theme = t;
      root.setAttribute('data-theme', t);
      document.body.classList.toggle('dark', t === 'dark');
      document.body.classList.toggle('dark-mode', t === 'dark');
      if (btn) {
        btn.textContent = t === 'dark' ? '☀️' : '🌙';
        btn.setAttribute('aria-label', `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`);
        btn.setAttribute('aria-pressed', String(t === 'dark'));
      }
      store.set('atp-theme', t);
    };

    apply(theme);
    on(btn, 'click', (e) => {
      e.preventDefault();
      apply(theme === 'dark' ? 'light' : 'dark');
    });
  }

  /* ------------------------------------------------------------------ *
   * 2. Reading progress + back-to-top
   * ------------------------------------------------------------------ */
  function initScrollUI() {
    const bar = document.createElement('div');
    bar.id = 'atp-progress';
    document.body.appendChild(bar);

    const top = document.createElement('button');
    top.id = 'atp-top';
    top.type = 'button';
    top.setAttribute('aria-label', 'Back to top');
    top.textContent = '↑';
    document.body.appendChild(top);
    on(top, 'click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    let ticking = false;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? clamp((h.scrollTop / max) * 100, 0, 100) : 0) + '%';
      top.classList.toggle('atp-show', h.scrollTop > 600);
      ticking = false;
    };
    on(window, 'scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ *
   * 3. Category filter
   * ------------------------------------------------------------------ */
  const CARD_SEL = '.article-card, .post-card, .blog-card, .card, article.card';

  function getCards() {
    return $$(CARD_SEL).filter((c) => !c.closest('.featured, #featured, [class*="featured"]'));
  }

  function initCategoryFilter() {
    const allChip = byText('a, button, span, div', /^All Categories$/i);
    if (!allChip) return;

    const chipBar = allChip.parentElement;
    const chips = Array.from(chipBar.children).filter((c) => /\S/.test(c.textContent));
    if (chips.length < 2) return;

    const grid = getCards()[0]?.parentElement;
    let emptyMsg;

    const setActive = (chip) => {
      chips.forEach((c) => {
        c.classList.toggle('active', c === chip);
        c.setAttribute('aria-pressed', String(c === chip));
      });
    };

    const filter = (chip) => {
      const label = stripEmoji(chip.textContent).toLowerCase();
      const showAll = /^all/.test(label);
      let visible = 0;
      getCards().forEach((card) => {
        const match = showAll || card.textContent.toLowerCase().includes(label);
        card.classList.toggle('atp-hidden', !match);
        if (match) visible++;
      });
      if (grid) {
        emptyMsg?.remove();
        if (!visible) {
          emptyMsg = document.createElement('p');
          emptyMsg.className = 'atp-empty';
          emptyMsg.textContent = `No articles in "${stripEmoji(chip.textContent)}" yet – check back soon!`;
          grid.appendChild(emptyMsg);
        }
      }
    };

    chips.forEach((chip) => {
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      const run = (e) => { e.preventDefault(); setActive(chip); filter(chip); };
      on(chip, 'click', run);
      on(chip, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') run(e); });
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Write Post modal
   * ------------------------------------------------------------------ */
  const POSTS_KEY = 'atp-user-posts';
  const MIN_WORDS = 1500;

  function renderUserPost(post, { prepend = true } = {}) {
    const sample = getCards()[0];
    const container = sample?.parentElement;
    if (!container) return;

    const stars = '★'.repeat(Math.floor(post.rating)) + (post.rating % 1 ? '½' : '');
    const minutes = Math.max(1, Math.round(post.words / 200));
    const el = document.createElement('article');
    el.className = `${sample.className} atp-user-post`.replace('atp-reveal', '');
    el.dataset.postId = post.id;
    el.innerHTML = `
      <div class="card-tag">${escapeHTML(post.category)}</div>
      <h3>${escapeHTML(post.title)}</h3>
      <p>${escapeHTML(post.subtitle)}</p>
      <small>${stars} ${post.rating.toFixed(1)} · ${minutes} min read · by ${escapeHTML(post.author)}</small>`;
    prepend ? container.prepend(el) : container.appendChild(el);
  }

  function initWritePost() {
    const openBtn = byText('a, button', /\+\s*Write Post/i);
    const heading = byText('h1, h2, h3, h4', /Write New Blog Post/i);
    if (!heading) return;

    const modal =
      heading.closest('.modal-overlay, .modal, [role="dialog"], [class*="modal"], [class*="overlay"]') ||
      heading.parentElement;

    const fields = $$('input, textarea, select', modal);
    const textInputs = fields.filter((f) => f.matches('input:not([type]), input[type="text"]'));
    const textareas  = fields.filter((f) => f.tagName === 'TEXTAREA');
    const selects    = fields.filter((f) => f.tagName === 'SELECT');

    const f = {
      title:    textInputs[0],
      subtitle: textInputs[1] || (textareas.length > 1 ? textareas[0] : null),
      body:     textareas[textareas.length - 1],
      author:   textInputs[textInputs.length - 1],
      category: selects[0],
      rating:   selects[1],
    };

    const closeBtn  = byText('button, span, a', /^[×x✕]$/i, modal);
    const cancelBtn = byText('button, a', /^Cancel$/i, modal);
    const publish   = byText('button, a', /Publish Post/i, modal);
    const counters  = $$('*', modal).filter(
      (el) => !el.children.length && /\d+\s*(\/\s*\d+)?\s*words/i.test(el.textContent)
    );

    // Start hidden unless the page already controls visibility.
    const open = () => {
      modal.classList.add('open', 'active', 'show');
      modal.style.display = 'flex';
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      f.title?.focus();
    };
    const close = () => {
      modal.classList.remove('open', 'active', 'show');
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };
    close();

    on(openBtn, 'click', (e) => { e.preventDefault(); open(); });
    on(closeBtn, 'click', (e) => { e.preventDefault(); close(); });
    on(cancelBtn, 'click', (e) => { e.preventDefault(); close(); });
    on(modal, 'mousedown', (e) => { if (e.target === modal) close(); });
    on(document, 'keydown', (e) => { if (e.key === 'Escape') close(); });

    // Live word counter
    const updateCount = () => {
      const n = countWords(f.body?.value || '');
      counters.forEach((el) => {
        el.textContent = /\/\s*\d+/.test(el.textContent)
          ? `${n} / ${MIN_WORDS} words`
          : `${n} words  ·  Target: ${MIN_WORDS.toLocaleString()}+`;
      });
    };
    on(f.body, 'input', updateCount);
    updateCount();

    // Publish
    on(publish, 'click', (e) => {
      e.preventDefault();
      const required = [f.title, f.subtitle, f.body, f.author].filter(Boolean);
      let ok = true;
      required.forEach((el) => {
        const bad = !el.value.trim();
        el.classList.toggle('atp-invalid', bad);
        if (bad) ok = false;
      });
      if (!ok) return toast('Please fill in all required fields.', 'error');

      const words = countWords(f.body.value);
      if (words < MIN_WORDS &&
          !confirm(`Your post has ${words} words (recommended ${MIN_WORDS}+ for SEO). Publish anyway?`)) {
        return;
      }

      const post = {
        id: Date.now().toString(36),
        title: f.title.value.trim(),
        subtitle: f.subtitle.value.trim(),
        body: f.body.value.trim(),
        author: f.author.value.trim(),
        category: stripEmoji(f.category?.selectedOptions[0]?.textContent || 'General'),
        rating: parseFloat(f.rating?.value) || parseFloat(f.rating?.selectedOptions[0]?.textContent) || 5,
        words,
        date: new Date().toISOString(),
      };

      const posts = store.get(POSTS_KEY, []);
      posts.unshift(post);
      store.set(POSTS_KEY, posts);
      renderUserPost(post);

      fields.forEach((el) => { if (el.tagName !== 'SELECT') el.value = ''; });
      updateCount();
      close();
      toast('Post published! 🎉', 'success');
    });

    // Restore saved posts (oldest first so newest ends up on top)
    store.get(POSTS_KEY, []).slice().reverse().forEach((p) => renderUserPost(p));
  }

  /* ------------------------------------------------------------------ *
   * 5. Newsletter forms
   * ------------------------------------------------------------------ */
  function initNewsletter() {
    const buttons = $$('button, a, input[type="submit"]').filter((b) =>
      /subscribe/i.test(b.textContent || b.value || '')
    );
    const SUBS_KEY = 'atp-subscribers';

    buttons.forEach((btn) => {
      const scope = btn.closest('form') || btn.parentElement?.parentElement || btn.parentElement;
      const input = scope && $('input[type="email"], input[placeholder*="mail" i]', scope);
      if (!input) return;

      const submit = (e) => {
        e.preventDefault();
        const email = input.value.trim().toLowerCase();
        if (!isEmail(email)) {
          input.classList.add('atp-invalid');
          input.focus();
          return toast('Please enter a valid email address.', 'error');
        }
        input.classList.remove('atp-invalid');
        const subs = store.get(SUBS_KEY, []);
        if (subs.includes(email)) return toast('You are already subscribed 👍');
        subs.push(email);
        store.set(SUBS_KEY, subs);
        input.value = '';
        toast('Thanks for subscribing! 🎉', 'success');
        // TODO: send `email` to your backend / Formspree / Mailchimp here.
      };

      on(btn, 'click', submit);
      on(input, 'keydown', (e) => { if (e.key === 'Enter') submit(e); });
    });
  }

  /* ------------------------------------------------------------------ *
   * 6. Table of contents: smooth scroll + scroll-spy
   * ------------------------------------------------------------------ */
  function initTOC() {
    const tocHeading = byText('h1, h2, h3, h4, div, strong', /Table of Contents/i);
    const tocBox = tocHeading?.closest('aside, nav, div, section');
    if (!tocBox) return;

    const links = $$('a[href^="#"]', tocBox).filter((a) => a.getAttribute('href').length > 1);
    if (!links.length) return;

    // If target ids are missing, map links to article <h2>s by order.
    const h2s = $$('h2').filter((h) => !tocBox.contains(h));
    const targets = links.map((a, i) => {
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      let el = document.getElementById(id);
      if (!el && h2s[i]) { h2s[i].id = h2s[i].id || id; el = h2s[i]; }
      return el;
    });

    links.forEach((a, i) => {
      on(a, 'click', (e) => {
        if (!targets[i]) return;
        e.preventDefault();
        const y = targets[i].getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: y, behavior: 'smooth' });
        history.replaceState(null, '', a.getAttribute('href'));
      });
    });

    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = targets.indexOf(entry.target);
        links.forEach((l, i) => l.classList.toggle('atp-toc-active', i === idx));
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    targets.filter(Boolean).forEach((t) => io.observe(t));
  }

  /* ------------------------------------------------------------------ *
   * 7. Share buttons
   * ------------------------------------------------------------------ */
  function initShare() {
    const url = location.href.split('#')[0];
    const title = ($('h1')?.textContent || document.title).trim();
    const enc = encodeURIComponent;

    const targets = [
      [/Share on X/i,        `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`],
      [/Share on Facebook/i, `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
      [/Share on LinkedIn/i, `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`],
    ];

    targets.forEach(([re, href]) => {
      const el = byText('a, button', re);
      if (!el) return;
      on(el, 'click', (e) => {
        e.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer,width=600,height=560');
      });
    });

    const copy = byText('a, button', /^Copy Link$/i);
    on(copy, 'click', async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied to clipboard ✅', 'success');
      } catch {
        const t = document.createElement('textarea');
        t.value = url; document.body.appendChild(t); t.select();
        document.execCommand('copy'); t.remove();
        toast('Link copied ✅', 'success');
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 8. Sortable tables
   * ------------------------------------------------------------------ */
  function initSortableTables() {
    $$('table').forEach((table) => {
      const head = table.tHead?.rows[0];
      const body = table.tBodies[0];
      if (!head || !body || body.rows.length < 3) return;
      table.classList.add('atp-sortable');

      const value = (row, i) => {
        const txt = row.cells[i]?.textContent.trim() || '';
        const num = parseFloat(txt.replace(/[^0-9.\-]/g, ''));
        return Number.isNaN(num) || /[A-Za-z]{3,}/.test(txt.replace(/[★✓✗~]/g, '').replace(/free/i, ''))
          ? txt.toLowerCase() : num;
      };

      Array.from(head.cells).forEach((th, i) => {
        th.setAttribute('tabindex', '0');
        const sort = () => {
          const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
          Array.from(head.cells).forEach((c) => delete c.dataset.dir);
          th.dataset.dir = dir;
          const rows = Array.from(body.rows).sort((a, b) => {
            const A = value(a, i), B = value(b, i);
            const r = typeof A === 'number' && typeof B === 'number'
              ? A - B : String(A).localeCompare(String(B));
            return dir === 'asc' ? r : -r;
          });
          rows.forEach((r) => body.appendChild(r));
        };
        on(th, 'click', sort);
        on(th, 'keydown', (e) => { if (e.key === 'Enter') sort(); });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 9. Stat counters + reveal on scroll
   * ------------------------------------------------------------------ */
  function initAnimations() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Counters: "120+", "250K", "4.9★", "3yrs"
    const statRe = /^(\d+(?:\.\d+)?)(\+|K|★|yrs)?$/;
    const stats = $$('div, span, strong, h3').filter(
      (el) => !el.children.length && statRe.test(el.textContent.trim())
    ).filter((el) => !el.closest('table, .trending, [class*="trend"]'));

    const countIO = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        obs.unobserve(el);
        const [, num, suffix = ''] = el.textContent.trim().match(statRe);
        const end = parseFloat(num);
        const decimals = num.includes('.') ? num.split('.')[1].length : 0;
        const dur = 1200, t0 = performance.now();
        const tick = (t) => {
          const p = clamp((t - t0) / dur, 0, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (end * eased).toFixed(decimals) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    stats.forEach((s) => countIO.observe(s));

    // Reveal cards
    const revealIO = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('atp-in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    getCards().forEach((c) => { c.classList.add('atp-reveal'); revealIO.observe(c); });
  }

  /* ------------------------------------------------------------------ *
   * 10. Dismissible announcement banner
   * ------------------------------------------------------------------ */
  function initBanner() {
    const banner = byText('div, section, aside', /^🚀\s*New:/);
    if (!banner || banner.children.length > 4) return;
    const KEY = 'atp-banner-dismissed';
    if (store.get(KEY)) { banner.classList.add('atp-hidden'); return; }

    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'atp-close-banner';
    x.setAttribute('aria-label', 'Dismiss announcement');
    x.textContent = '×';
    on(x, 'click', () => { banner.classList.add('atp-hidden'); store.set(KEY, true); });
    banner.appendChild(x);
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  function init() {
    const modules = [
      initTheme, initScrollUI, initCategoryFilter, initWritePost,
      initNewsletter, initTOC, initShare, initSortableTables,
      initAnimations, initBanner,
    ];
    modules.forEach((fn) => {
      try { fn(); } catch (err) { console.warn(`[AIToolsPro] ${fn.name} failed:`, err); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
