'use strict';

// Progressive enhancement only. The page is fully readable without this script, and every
// motion effect is skipped when the visitor asks for reduced motion.
// Only textContent, classList and CSSOM properties are used; no HTML is built from strings.
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  // ---------- Headline: give each word its own rise-in delay ----------
  document.querySelectorAll('[data-split]').forEach((line) => {
    const words = line.textContent.trim().split(/\s+/);
    line.textContent = '';
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = word;
      span.style.setProperty('--i', String(i));
      line.append(span);
      if (i < words.length - 1) line.append(' ');
    });
    line.classList.add('is-ready');
  });

  // ---------- Scroll reveal ----------
  const revealTargets = document.querySelectorAll('.reveal, .steps, .steps .step');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  }

  // ---------- Scroll progress bar ----------
  const bar = document.querySelector('.scroll-progress');
  if (bar && !reduceMotion) {
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? window.scrollY / max : 0;
      bar.style.transform = `scaleX(${ratio.toFixed(4)})`;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  // ---------- Cursor glow in the hero ----------
  const hero = document.getElementById('hero');
  if (hero && finePointer && !reduceMotion) {
    hero.addEventListener('pointermove', (e) => {
      const rect = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      hero.style.setProperty('--my', `${e.clientY - rect.top}px`);
    }, { passive: true });
  }

  // ---------- Tilt on feature cards ----------
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.tilt').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--rx', `${(-py * 6).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(px * 8).toFixed(2)}deg`);
        card.style.setProperty('--gx', `${(e.clientX - r.left).toFixed(0)}px`);
        card.style.setProperty('--gy', `${(e.clientY - r.top).toFixed(0)}px`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // ---------- Device mock: cycle through goals ----------
  const goals = [
    { title: 'Recommended path', body: 'Starts with retrieval over your documents. Fine-tuning is added only when it measurably helps.' },
    { title: 'Ticket triage', body: 'Learns from labelled past tickets, then checks its results on tickets it has never seen.' },
    { title: 'Command assistant', body: 'Suggests the right command for a request. Nothing runs without your approval.' },
  ];
  const rows = document.querySelectorAll('#mock-goals .mock-row');
  const titleEl = document.getElementById('mock-title');
  const bodyEl = document.getElementById('mock-body');
  const fill = document.getElementById('mock-bar-fill');
  if (rows.length && titleEl && bodyEl && fill && !reduceMotion) {
    let index = 0;
    let timer = null;
    const show = (i) => {
      rows.forEach((row, j) => {
        const on = j === i;
        row.classList.toggle('mock-row-on', on);
        row.querySelector('.check').textContent = on ? '✓' : '';
      });
      titleEl.textContent = goals[i].title;
      bodyEl.textContent = goals[i].body;
      fill.style.transform = 'scaleX(0)';
      void fill.offsetWidth; // restart the bar animation
      fill.style.transform = 'scaleX(1)';
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        index = (index + 1) % goals.length;
        show(index);
      }, 2800);
    };
    const stop = () => { clearInterval(timer); timer = null; };
    show(0);
    start();
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  } else if (fill) {
    fill.style.transform = 'scaleX(1)';
  }

  // ---------- Anchor links: scroll with an offset so the sticky nav does not cover headings ----------
  const nav = document.querySelector('.site-nav');
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href').slice(1);
      const target = id === 'top' ? document.body : document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      const offset = nav ? nav.offsetHeight + 12 : 12;
      const top = id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
      history.replaceState(null, '', `#${id}`);
    });
  });
})();
