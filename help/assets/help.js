// PixelForge Help Center: search, mobile navigation, "On this page" highlight
// and screenshot zoom. Pages are complete without this script.
(() => {
  'use strict';

  let index;
  let loading;
  function loadIndex() {
    if (index) return Promise.resolve(index);
    loading ??= fetch('/help/search-index.json', { cache: 'no-cache' })
      .then((response) => response.json())
      .then((data) => (index = data.articles))
      .catch(() => (index = []));
    return loading;
  }

  function normalise(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  function highlight(text, terms) {
    let html = escapeHtml(text);
    for (const term of terms) {
      if (term.length < 2) continue;
      html = html.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
    }
    return html;
  }

  /** Rank articles for a query; returns [{ article, score, heading, snippet }]. */
  function search(query) {
    const terms = normalise(query).split(/[^a-z0-9]+/).filter(Boolean);
    if (!terms.length || !index) return [];
    const results = [];
    for (const article of index) {
      const title = normalise(article.title);
      const summary = normalise(article.summary);
      const keywords = normalise(article.keywords.join(' '));
      const text = normalise(article.text);
      let score = 0;
      let heading;
      let matchedAll = true;
      for (const term of terms) {
        let termScore = 0;
        if (title.split(/\W+/).some((word) => word.startsWith(term))) termScore += 12;
        else if (title.includes(term)) termScore += 8;
        if (keywords.includes(term)) termScore += 7;
        if (summary.includes(term)) termScore += 3;
        for (const h of article.headings) {
          if (normalise(h.text).includes(term)) {
            termScore += 4;
            heading ??= h;
            break;
          }
        }
        if (text.includes(term)) termScore += 1;
        if (!termScore) matchedAll = false;
        score += termScore;
      }
      if (!matchedAll || !score) continue;
      if (title.includes(normalise(query).trim())) score += 10;
      let snippet = article.summary;
      const at = text.indexOf(terms[0]);
      if (at > -1 && !summary.includes(terms[0])) {
        const start = Math.max(0, at - 60);
        snippet = (start ? '…' : '') + article.text.slice(start, start + 150).trim() + '…';
      }
      results.push({ article, score, heading, snippet });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  const headerInput = document.getElementById('kb-search-input');
  const panel = document.getElementById('kb-search-results');
  let active = -1;

  function render(query) {
    const results = search(query);
    const terms = normalise(query).split(/[^a-z0-9]+/).filter(Boolean);
    active = -1;
    if (!query.trim()) {
      panel.hidden = true;
      headerInput.setAttribute('aria-expanded', 'false');
      return;
    }
    panel.innerHTML = results.length
      ? results
          .map(({ article, heading, snippet }, i) => {
            const href = `/help/${article.slug}${heading ? `#${heading.id}` : ''}`;
            const where = heading ? `${article.category} › ${heading.text}` : article.category;
            return `<a id="kb-result-${i}" role="option" aria-selected="false" href="${href}"><small>${escapeHtml(where)}</small><strong>${highlight(article.title, terms)}</strong><span>${highlight(snippet, terms)}</span></a>`;
          })
          .join('')
      : `<p class="kb-search-empty">No articles match “${escapeHtml(query)}”. Try another word, or browse the topics.</p>`;
    panel.hidden = false;
    headerInput.setAttribute('aria-expanded', 'true');
  }

  function move(step) {
    const items = [...panel.querySelectorAll('a')];
    if (!items.length) return;
    items[active]?.setAttribute('aria-selected', 'false');
    active = (active + step + items.length) % items.length;
    items[active].setAttribute('aria-selected', 'true');
    items[active].scrollIntoView({ block: 'nearest' });
    headerInput.setAttribute('aria-activedescendant', items[active].id);
  }

  if (headerInput && panel) {
    headerInput.addEventListener('focus', () => void loadIndex());
    headerInput.addEventListener('input', () => void loadIndex().then(() => render(headerInput.value)));
    headerInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      else if (event.key === 'Enter') {
        const target = panel.querySelectorAll('a')[Math.max(0, active)];
        if (target) { event.preventDefault(); location.href = target.href; }
      } else if (event.key === 'Escape') {
        headerInput.value = '';
        render('');
        headerInput.blur();
      }
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.kb-search')) { panel.hidden = true; headerInput.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if (event.key === '/' && !typing) { event.preventDefault(); headerInput.focus(); }
    });
    // The home page's large search box drives the header search.
    for (const hero of document.querySelectorAll('[data-kb-search]')) {
      hero.addEventListener('input', () => {
        headerInput.value = hero.value;
        void loadIndex().then(() => render(hero.value));
      });
      hero.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === 'ArrowDown') {
          event.preventDefault();
          headerInput.focus();
          if (event.key === 'ArrowDown') move(1);
          else {
            const first = panel.querySelector('a');
            if (first) location.href = first.href;
          }
        }
      });
    }
    const query = new URLSearchParams(location.search).get('q');
    if (query) {
      headerInput.value = query;
      void loadIndex().then(() => render(query));
    }
  }

  // Mobile navigation drawer.
  const toggle = document.querySelector('.kb-menu-toggle');
  toggle?.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (document.body.classList.contains('nav-open') && !event.target.closest('.kb-nav, .kb-menu-toggle')) {
      document.body.classList.remove('nav-open');
      toggle?.setAttribute('aria-expanded', 'false');
    }
  });
  document.querySelector('.kb-nav [aria-current="page"]')?.scrollIntoView({ block: 'center' });

  // "On this page" highlight.
  const tocLinks = [...document.querySelectorAll('.kb-toc a')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((link) => [decodeURIComponent(link.hash.slice(1)), link]));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          tocLinks.forEach((link) => link.classList.remove('is-active'));
          byId.get(entry.target.id)?.classList.add('is-active');
        }
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    for (const id of byId.keys()) {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    }
  }

  // Screenshot zoom.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a.zoomable');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const box = document.createElement('div');
    box.className = 'kb-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Screenshot');
    const image = document.createElement('img');
    image.src = link.href;
    image.alt = link.querySelector('img')?.alt || '';
    box.append(image);
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); link.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.append(box);
  });
})();
