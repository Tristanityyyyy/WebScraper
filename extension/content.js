if (!window.__scraperInjected) {
  window.__scraperInjected = true;

  let pickerActive = false;
  let lastHovered = null;
  let lastSelected = null;
  let pickerMode = 'element';
  let activeFieldId = null;
  // Generate a stable CSS selector for any element
  function getCssSelector(el) {
    if (!el) return '';

    const isInjectedClass = (c) => c && c.startsWith('scraper-');
    const escapeId = (s) => {
      try { return (window.CSS && CSS.escape) ? CSS.escape(s) : s; } catch { return s; }
    };

    const trySelector = (sel) => {
      try {
        const matches = document.querySelectorAll(sel);
        return matches.length >= 1 ? sel : null;
      } catch { return null; }
    };

    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).filter(c => !isInjectedClass(c) && c.length < 50);

    const dataAttrs = ['data-automation', 'data-testid', 'data-cy', 'data-id', 'data-key'];
    for (const attr of dataAttrs) {
      const val = el.getAttribute(attr);
      if (val) {
        const s = trySelector(`[${attr}="${val}"]`);
        if (s) return s;
      }
    }
    if (el.getAttribute('aria-label')) {
      const val = el.getAttribute('aria-label');
      const s = trySelector(`${tag}[aria-label="${val}"]`);
      // Only use aria-label if it uniquely identifies ONE element
      if (s && document.querySelectorAll(s).length === 1) return s;
    }
    if (el.getAttribute('rel')) {
      const s = trySelector(`${tag}[rel="${el.getAttribute('rel')}"]`);
      if (s) return s;
    }
    if (el.id) return '#' + escapeId(String(el.id));
    

    const getRepeatingAncestor = (element) => {
      const PREFERRED_TAGS = ['article', 'li', 'tr'];
      let best = null;
      let cur = element.parentElement;
      while (cur && cur !== document.body) {
        const curTag = cur.tagName.toLowerCase();
        const curClasses = Array.from(cur.classList).filter(c => !isInjectedClass(c) && c.length < 50);
        if (curClasses.length) {
          const anchorSel = `${curTag}.${curClasses[0]}`;
          const siblings = document.querySelectorAll(anchorSel);
          if (siblings.length > 1) {
            best = { ancestor: cur, ancestorSel: anchorSel };
            if (PREFERRED_TAGS.indexOf(curTag) !== -1) break;
          }
        }
        cur = cur.parentElement;
      }
      return best;
    };

    const buildPathFromAncestor = (ancestor, target) => {
      const parts = [];
      let cur = target;
      while (cur && cur !== ancestor) {
        const curTag = cur.tagName.toLowerCase();
        const curClasses = Array.from(cur.classList).filter(c => !isInjectedClass(c) && c.length < 50);
        let seg = curTag;
        if (curClasses.length) seg += '.' + curClasses[0];
        parts.unshift(seg);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    };

    const repeating = getRepeatingAncestor(el);
    if (repeating) {
      const { ancestorSel, ancestor } = repeating;
      const path = buildPathFromAncestor(ancestor, el);
      if (path) {
        const combined = `${ancestorSel} ${path}`;
        const s = trySelector(combined);
        if (s) return s;
      }
    }

    if (classes.length) {
      const s = trySelector(`${tag}.${classes[0]}`);
      if (s) return s;
    }

    const parent = el.parentElement;
    if (parent) {
      const parentTag = parent.tagName.toLowerCase();
      const parentClasses = Array.from(parent.classList).filter(c => !isInjectedClass(c) && c.length < 50);

      if (parentClasses.length) {
        const s = trySelector(`${parentTag}.${parentClasses[0]} > ${tag}`);
        if (s) return s;
        const s2 = trySelector(`${parentTag}.${parentClasses[0]} ${tag}`);
        if (s2) return s2;
      }

      if (parent.id) {
        const s = trySelector(`#${escapeId(parent.id)} > ${tag}`);
        if (s) return s;
      }
    }

    if (el.getAttribute('rel')) {
      const s = trySelector(`${tag}[rel="${el.getAttribute('rel')}"]`);
      if (s) return s;
    }
    if (el.getAttribute('aria-label')) {
      const s = trySelector(`${tag}[aria-label="${el.getAttribute('aria-label')}"]`);
      if (s) return s;
    }

    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let seg = current.tagName.toLowerCase();
      const good = Array.from(current.classList || []).filter(c => !isInjectedClass(c) && c.length < 50);
      if (good.length) seg += '.' + good[0];
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(s => s.tagName === current.tagName)
        : [];
      if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(seg);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

   function injectStyle() {
    if (document.getElementById('scraper-style')) return;
    const style = document.createElement('style');
    style.id = 'scraper-style';
    style.textContent = `
      .scraper-hover { … }
      .scraper-selected { … }
      #scraper-tooltip {
       position: fixed;
       z-index: 2147483647;
       pointer-events: none;
       background: #1e1e2e;
       color: #e2e8f0;
       font: 12px/1.4 monospace;
       padding: 5px 9px;
       border-radius: 6px;
       max-width: 280px;
       white-space: nowrap;
       overflow: hidden;
       text-overflow: ellipsis;
       box-shadow: 0 2px 8px rgba(0,0,0,.35);
       display: none;
     }
    `;
    document.head.appendChild(style);
   const tip = document.createElement('div');
   tip.id = 'scraper-tooltip';
   document.body.appendChild(tip);
  }

  function onMouseOver(e) {
    e.stopPropagation();
    if (lastHovered) lastHovered.classList.remove('scraper-hover');
    // Only highlight leaf-level or small elements, not big containers
    const el = e.target;
    const rect = el.getBoundingClientRect();
    const isTooBig = rect.width > window.innerWidth * 0.6 || rect.height > 300;
    if (isTooBig) return;
    lastHovered = el;
    lastHovered.classList.add('scraper-hover');

    const imgEl = el.tagName?.toLowerCase() === 'img' ? el : el.querySelector('img');
    const resolved = imgEl || el;
    const tag = resolved.tagName?.toLowerCase?.() || '';
    const preview = tag === 'img'
      ? (resolved.getAttribute('src') || resolved.getAttribute('data-src') || '(no src)')
      : (el.innerText?.trim().slice(0, 80) || resolved.getAttribute('href') || '(empty)');

    const tip = document.getElementById('scraper-tooltip');
    if (tip) {
      tip.textContent = preview || '(empty)';
      tip.style.display = 'block';
      // position just below the cursor; flip up if near bottom edge
      const GAP = 14;
      const tx = Math.min(e.clientX + 12, window.innerWidth - 300);
      const ty = e.clientY + GAP + 28 > window.innerHeight
        ? e.clientY - GAP - 28
        : e.clientY + GAP;
      tip.style.left = tx + 'px';
      tip.style.top  = ty + 'px';
    }
  }
  
  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    el.classList.remove('scraper-hover');
    el.classList.add('scraper-selected');
    lastSelected = el;

    // ✅ Resolve to actual <img> if clicked element contains one
    const imgEl = el.tagName?.toLowerCase() === 'img' ? el : el.querySelector('img');
    const svgEl = el.tagName?.toLowerCase() === 'svg' ? el.closest('a, button') : null;
    // Never resolve up to <a> for text elements — only resolve for svg and img
    const resolvedEl = svgEl || imgEl || el;
    const tagName = resolvedEl.tagName?.toLowerCase?.() || '';

    const autoType =
      tagName === 'img' ? 'image' :
      tagName === 'svg' ? 'link' :
      'text';

    const previewText = tagName === 'img'
      ? (resolvedEl.getAttribute('src') || resolvedEl.getAttribute('data-src') || '')
      : (el.innerText?.trim().slice(0, 60) || resolvedEl.getAttribute('src') || '');

    // ✅ Use resolvedEl for selector so it targets <img> directly
    const selector = getCssSelector(resolvedEl);
    const allMatches = document.querySelectorAll(selector);

    if (pickerMode === 'field') {
      chrome.storage.local.set({
        pickedFieldSelector: { fieldId: activeFieldId, selector, previewText, tagName },
      });
      chrome.runtime.sendMessage({
        action: 'fieldSelectorPicked',
        fieldId: activeFieldId,
        selector,
        previewText,
        tagName,
        autoType,
      }).catch(() => {});
      deactivatePicker();
      return;
    }

    chrome.storage.local.set({
      pickedElement: { selector, count: allMatches.length, previewText, tagName },
      pickedNextSelector: { selector },
    });
    chrome.runtime.sendMessage({
      action: 'elementPicked',
      selector,
      count: allMatches.length,
      previewText,
      tagName,
    }).catch(() => {});
      deactivatePicker(); // ← ADD THIS

  }

  function activateElementPicker() {
    pickerMode = 'element';
    activeFieldId = null;
    injectStyle();
    pickerActive = true;
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
  }

  function activateFieldPicker(fieldId) {
    pickerMode = 'field';
    activeFieldId = fieldId;
    injectStyle();
    pickerActive = true;
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
  }

  function deactivatePicker() {
    pickerActive = false;
    pickerMode = 'element';
    activeFieldId = null;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('click', onClick, true);
    if (lastHovered) lastHovered.classList.remove('scraper-hover');
    lastHovered = null;
    if (lastSelected) lastSelected.classList.remove('scraper-selected');
    lastSelected = null;
    const tip = document.getElementById('scraper-tooltip');
    if (tip) { tip.style.display = 'none'; tip.remove(); }
    const s = document.getElementById('scraper-style');
    if (s) s.remove();  // reset injection guard so next activation re-creates tooltip
  }
  

  async function handleMessage(message, sender, sendResponse) {
    if (message.action === 'activatePicker') {
      activateElementPicker();
      sendResponse({ ok: true });
      return;
    }

    if (message.action === 'activateFieldPicker') {
      activateFieldPicker(message.fieldId);
      sendResponse({ ok: true });
      return;
    }

    if (message.action === 'deactivatePicker') {
      deactivatePicker();
      sendResponse({ ok: true });
      return;
    }

    if (message.action === 'scrape') {
      try {
        const { selector, limit, fields } = message;
        let elements = Array.from(document.querySelectorAll(selector));
        if (limit) elements = elements.slice(0, limit);

        const results = elements.map(el => {
          if (!fields || fields.length === 0) {
            return { text: el.innerText?.trim() || '' };
          }
          const row = {};
          fields.forEach(f => {
            if (f === 'text')  row.text  = el.innerText?.trim() || '';
            if (f === 'html')  row.html  = el.innerHTML?.trim() || '';
            if (f === 'href')  row.href  = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || '';
            if (f === 'src')   row.src   = el.getAttribute('src') || el.querySelector('img')?.getAttribute('src') || '';
            if (f === 'title') row.title = el.getAttribute('title') || el.querySelector('[title]')?.getAttribute('title') || '';
            if (f === 'price') row.price = el.innerText?.trim() || '';

          });
          return row;
        }).filter(r => Object.values(r).some(v => v));

        sendResponse({ results });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return true;
    }

    if (message.action === 'getNextHref') {
      try {
        let el = document.querySelector(message.nextSelector);
        // Walk up to find the closest <a> tag if we landed on a child element
        if (el && el.tagName.toLowerCase() !== 'a') {
          el = el.closest('a');
        }
        sendResponse({ href: el?.href || null });
      } catch {
        sendResponse({ href: null });
      }
      return;
    }
    if (message.action === 'scrapeByFieldSelectors') {
      try {
        const {
          fieldSelectors,
          limit,
          nextSelector,
          maxPages,
          waitMs = 1200,
        } = message;

        const safeLimit = Number(limit) > 0 ? Number(limit) : 20;
        const safeMaxPages = Number(maxPages) > 0 ? Number(maxPages) : 1;
        const nextSel = nextSelector ? String(nextSelector) : '';
        const fields = Array.isArray(fieldSelectors) ? fieldSelectors : [];

        const counts = [];
        const pageCounts = [];

        function extractValue(el, type) {
          if (!el) return '';
          const t = String(type || 'text');

          // ← ADD: escape svg/path elements before anything else
          const tagLow = el.tagName?.toLowerCase?.() || '';
          if (tagLow === 'path' || tagLow === 'svg') {
            const svgEl = tagLow === 'path' ? el.closest('svg') : el;
            if (!svgEl) return '';

            // aria-label first
            const ariaLabel = svgEl.getAttribute('aria-label');
            if (ariaLabel) return ariaLabel.trim();

            // Walk up to the badges container (parent of all badge pills)
            const badgeContainer = svgEl.parentElement?.parentElement;
            if (!badgeContainer) return '';

            // Collect text from ALL badge pills in this container
            const allBadgeTexts = Array.from(badgeContainer.children)
              .map(child => {
                // Get text nodes only, skip svg icons
                return Array.from(child.childNodes)
                  .filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
                  .map(n => n.textContent.trim())
                  .join('') 
                  || Array.from(child.children)
                      .filter(c => c.tagName?.toLowerCase() !== 'svg')
                      .map(c => c.innerText?.trim())
                      .filter(Boolean)
                      .join('');
              })
              .filter(Boolean);

            return allBadgeTexts.join(', '); // "Open to fresh grads, Remote"
          }
          // ← END

          if (t === 'image' || t === 'src') {
            const raw = (
              el.getAttribute('src') ||
              el.getAttribute('data-src') ||
              el.querySelector('img')?.getAttribute('src') ||
              ''
            ).trim();
            try { return raw ? new URL(raw, location.href).href : ''; } catch { return raw; }
          }
          if (t === 'link' || t === 'href') {
            const text = el.innerText?.trim();
            if (text) return text;
            const raw = (
              el.getAttribute('href') ||
              el.querySelector('a')?.getAttribute('href') ||
              ''
            ).trim();
            try { return raw ? new URL(raw, location.href).href : ''; } catch { return raw; }
          }
          if (t === 'html') return el.innerHTML?.trim() || '';
          if (t === 'title') {
            return (
              el.getAttribute('title') ||
              el.querySelector('[title]')?.getAttribute('title') ||
              ''
            ).trim();
          }
          return (el.innerText || el.textContent || '').trim();
        }

        // Wait until all field selectors return at least 1 element
        function waitForElements(timeoutMs) {
          const start = Date.now();
          return new Promise((resolve) => {
            const tick = () => {
              const allFound = fields.every(f => {
                if (!f?.selector) return true;
                try { return document.querySelectorAll(f.selector).length > 0; }
                catch { return false; }
              });
              if (allFound) return resolve(true);
              if (Date.now() - start > timeoutMs) return resolve(false);
              setTimeout(tick, 150);
            };
            tick();
          });
        }

        const results = [];
        let page = 0;

        // Wait for first page to be ready before scraping
        await waitForElements(3000);

        while (page < safeMaxPages && results.length < safeLimit) {
          const arrays = fields.map((f) => {
            const sels = f && f.selector ? String(f.selector) : '';
            if (!sels) return [];
            try { return Array.from(document.querySelectorAll(sels)); }
            catch { return []; }
          });

          const pageCountsNow = arrays.map(a => a.length || 0);
          if (page === 0) {
            for (let i = 0; i < pageCountsNow.length; i++) counts[i] = pageCountsNow[i];
          }
          pageCounts.push(pageCountsNow);

          const remaining = safeLimit - results.length;
          const maxCount = Math.max(...pageCountsNow);
          const maxLen = Math.min(remaining, maxCount);

          for (let i = 0; i < maxLen; i++) {
            const row = {};
            let anyValue = false;
            for (let j = 0; j < fields.length; j++) {
              const f = fields[j] || {};
              const key = String(f.name || '').trim() || `field_${j}`;
              const el = arrays[j]?.[i] || null;
              const val = extractValue(el, f.type);
              row[key] = val;
              if (String(val || '').trim() !== '') anyValue = true;
            }
            const firstKey = String(fields[0]?.name || '').trim() || 'field_0';
              if (String(row[firstKey] || '').trim() !== '') results.push(row);
              if (results.length >= safeLimit) break;
            }

          if (results.length >= safeLimit) break;
          break; // navigation handled by background.js
        }

        sendResponse({ results, counts, pageCounts });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return;
    }
    if (message.action === 'clickNext') {
      try {
        let el = document.querySelector(message.nextSelector);
        if (!el) return sendResponse({ clicked: false });
        const clickable = el.closest('a, button') || el;
        clickable.click();
        sendResponse({ clicked: true });
      } catch {
        sendResponse({ clicked: false });
      }
      return;
    }
    if (message.action === 'waitForDomChange') {
      try {
        const selector = message.selector;
        const start = Date.now();
        // Collect ALL current texts, not just first
        const getTexts = () => Array.from(document.querySelectorAll(selector))
          .map(el => el.innerText?.trim())
          .join('|');
        const oldTexts = message.oldFirstText; // reusing field, now contains all texts
        const wait = () => {
          const newTexts = getTexts();
          if (newTexts !== oldTexts && newTexts !== '') {
            return sendResponse({ changed: true });
          }
          if (Date.now() - start > 8000) return sendResponse({ changed: false });
          setTimeout(wait, 300);
        };
        wait();
      } catch {
        sendResponse({ changed: false });
      }
      return;
    }
    if (message.action === 'getFirstText') {
      try {
        const texts = Array.from(document.querySelectorAll(message.selector))
          .map(el => el.innerText?.trim())
          .join('|');
        sendResponse({ text: texts });
      } catch {
        sendResponse({ text: '' });
      }
      return;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true;
  });
}