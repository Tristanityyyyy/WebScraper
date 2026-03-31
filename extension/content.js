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
      .scraper-hover {
        outline: 2px solid #10b981 !important;
        outline-offset: 2px !important;
        cursor: crosshair !important;
      }
      .scraper-selected {
        outline: 2px solid #6366f1 !important;
        outline-offset: 2px !important;
      }
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
      const GAP = 14;
      const tx = Math.min(e.clientX + 12, window.innerWidth - 300);
      const ty = e.clientY + GAP + 28 > window.innerHeight
        ? e.clientY - GAP - 28
        : e.clientY + GAP;
      tip.style.left = tx + 'px';
      tip.style.top = ty + 'px';
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    el.classList.remove('scraper-hover');
    el.classList.add('scraper-selected');
    lastSelected = el;

    const imgEl = el.tagName?.toLowerCase() === 'img' ? el : el.querySelector('img');
    const svgEl = el.tagName?.toLowerCase() === 'svg' ? el.closest('a, button') : null;
    const resolvedEl = svgEl || imgEl || el;
    const tagName = resolvedEl.tagName?.toLowerCase?.() || '';

    const autoType =
      tagName === 'img' ? 'image' :
      tagName === 'svg' ? 'link' :
      'text';

    const previewText = tagName === 'img'
      ? (resolvedEl.getAttribute('src') || resolvedEl.getAttribute('data-src') || '')
      : (el.innerText?.trim().slice(0, 60) || resolvedEl.getAttribute('src') || '');

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
    deactivatePicker();
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
    if (s) s.remove();
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
          waitMs = 2000,
        } = message;

        const safeLimit = Number(limit) > 0 ? Number(limit) : 20;
        const safeMaxPages = Number(maxPages) > 0 ? Number(maxPages) : 1;
        const nextSel = nextSelector ? String(nextSelector) : '';
        const fields = Array.isArray(fieldSelectors) ? fieldSelectors : [];

        const counts = [];
        const pageCounts = [];

        // ─── extractValue ────────────────────────────────────────────────────
        function extractValue(el, type) {
          // GUARD: if no element found in this card, return empty immediately
          if (!el) return '';

          const t = String(type || 'text');
          const tagLow = el.tagName?.toLowerCase?.() || '';

          // SVG / path handler
          if (tagLow === 'path' || tagLow === 'svg') {
            const svgEl = tagLow === 'path' ? el.closest('svg') : el;
            if (!svgEl) return '';
            const ariaLabel = svgEl.getAttribute('aria-label');
            if (ariaLabel) return ariaLabel.trim();
            const badgeContainer = svgEl.parentElement?.parentElement;
            if (!badgeContainer) return '';
            const allBadgeTexts = Array.from(badgeContainer.children)
              .map(child => {
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
            return allBadgeTexts.join(', ');
          }

          // Image / src
          if (t === 'image' || t === 'src') {
            const raw = (
              el.getAttribute('src') ||
              el.getAttribute('data-src') ||
              el.querySelector('img')?.getAttribute('src') ||
              ''
            ).trim();
            try { return raw ? new URL(raw, location.href).href : ''; } catch { return raw; }
          }

          // Link / href
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

          // HTML
          if (t === 'html') return el.innerHTML?.trim() || '';

          // Title
          if (t === 'title') {
            return (
              el.getAttribute('title') ||
              el.querySelector('[title]')?.getAttribute('title') ||
              ''
            ).trim();
          }

          // Price — smart extraction with scoring
          if (t === 'price') {
            const direct = el.innerText?.trim() || '';

            // Check for free entry text anywhere in the element
            if (/free entry/i.test(direct)) return 'Free entry';
            if (/free/i.test(direct) && direct.length < 20) return direct;

            const pricePattern = /[\d,.]+/;
            const currencyPattern = /php|₱|\$|€|£|¥|rm|sgd|usd|from/i;

            const scoreText = (s) => {
              if (!s || s.length > 80) return -1;
              if (/off\b/i.test(s)) return -1;        // skip "48% off"
              if (/discount/i.test(s)) return -1;      // skip "Trip.com discount"
              let score = 0;
              if (currencyPattern.test(s)) score += 2; // has currency = prefer
              if (pricePattern.test(s)) score += 1;    // has number = ok
              return score;
            };

            const extractNumber = (s) => {
              const match = s.replace(/,/g, '').match(/[\d.]+/);
              return match ? parseFloat(match[0]) : 0;
            };

            const candidates = [];

            // Score the direct element text
            const ds = scoreText(direct);
            if (ds > 0) candidates.push({ text: direct, score: ds, num: extractNumber(direct) });

            // Walk ALL children and score each
            for (const child of el.querySelectorAll('*')) {
              // Only look at leaf nodes (no children) to avoid duplicates
              if (child.children.length === 0) {
                const t2 = child.innerText?.trim() || '';
                const sc = scoreText(t2);
                if (sc > 0) candidates.push({ text: t2, score: sc, num: extractNumber(t2) });
              }
            }

            // Sort: highest score first, then highest numeric value as tiebreaker
            candidates.sort((a, b) => b.score - a.score || b.num - a.num);
            return candidates[0]?.text || direct || '';
          }

          // Availability
          if (t === 'availability') {
            const text = el.innerText?.trim() || '';
            if (/out of stock|unavailable|sold out/i.test(text)) return 'Out of stock';
            if (/in stock|available|in-stock/i.test(text)) return 'In stock';
            return text;
          }

          // Default: plain text
          return (el.innerText || el.textContent || '').trim();
        }
        // ─── end extractValue ─────────────────────────────────────────────────

        function waitForNetworkIdle(timeoutMs = 5000) {
          return new Promise((resolve) => {
            let requests = 0;
            let settled = false;
            let lastRequestTime = Date.now();

            const checkDone = () => {
              if (settled) return;
              if (requests === 0 && Date.now() - lastRequestTime > 300) {
                settled = true;
                return resolve(true);
              }
            };

            try {
              const obs = new PerformanceObserver((list) => {
                requests += list.getEntries().length;
                lastRequestTime = Date.now();
                setTimeout(() => { requests--; checkDone(); }, 100);
              });
              obs.observe({ entryTypes: ['resource'] });
            } catch (e) {
              return resolve(true);
            }

            setTimeout(() => { settled = true; resolve(false); }, timeoutMs);
          });
        }

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

        async function scrollToLoadAll(containerSelector, maxScrolls = 50, scrollDelay = 1000) {
          let lastCount = 0;
          let sameCount = 0;
          for (let i = 0; i < maxScrolls; i++) {
            window.scrollBy(400, 0);
            await new Promise(r => setTimeout(r, scrollDelay));
            try {
              const currentCount = document.querySelectorAll(containerSelector).length;
              if (currentCount > lastCount) {
                lastCount = currentCount;
                sameCount = 0;
              } else {
                sameCount++;
              }
              if (sameCount >= 3) break;
            } catch {}
          }
          window.scrollTo(0, 0);
          await new Promise(r => setTimeout(r, 500));
        }

        async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
          let lastError;
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              return await fn();
            } catch (err) {
              lastError = err;
              if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
              }
            }
          }
          throw lastError;
        }

        function logError(context, err, details = {}) {
          const logEntry = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            context,
            error: err.message || String(err),
            ...details
          };
          console.error('[Scraper Error]', logEntry);
          return logEntry;
        }

        const results = [];
        const seenUrls = new Set();
        let page = 0;

        const containerField = fields.find(f => f.type === 'container');

        try {
          await withRetry(async () => {
            await waitForNetworkIdle(5000);
            await waitForElements(5000);
            if (containerField && containerField.selector) {
              await scrollToLoadAll(containerField.selector);
            }
          }, 3, 1000);
        } catch (err) {
          logError('initialPageLoad', err);
          return sendResponse({ error: err.message });
        }

        while (page < safeMaxPages && results.length < safeLimit) {
          page++;

          let containerElements = [];
          let arrays;

          if (containerField) {
            // ── Container-based scraping ──────────────────────────────────────
            try {
              containerElements = Array.from(document.querySelectorAll(containerField.selector));
            } catch { containerElements = []; }

            arrays = fields.map((f) => {
              if (f.type === 'container') return containerElements;
              return containerElements.map(container => {
                try {
                  const found = Array.from(container.querySelectorAll(f.selector));
                  return found.length > 0 ? found : [null];
                } catch { return [null]; }
              }).flat();
            });
          } else {
            // ── Non-container scraping ────────────────────────────────────────
            arrays = fields.map((f) => {
              const sels = f && f.selector ? String(f.selector) : '';
              if (!sels) return [];
              try { return Array.from(document.querySelectorAll(sels)); }
              catch { return []; }
            });
          }

          const pageCountsNow = arrays.map(a => a.length || 0);
          if (page === 1) {
            for (let i = 0; i < pageCountsNow.length; i++) counts[i] = pageCountsNow[i];
          }
          pageCounts.push(pageCountsNow);

          if (containerField && containerElements.length > 0) {
            // ── Iterate by container (card) ───────────────────────────────────
            const remaining = safeLimit - results.length;
            const maxLen = Math.min(remaining, containerElements.length);

            for (let i = 0; i < maxLen; i++) {
              const container = containerElements[i];
              const row = {};
              let anyValue = false;
              let rowUrl = '';
              let hasAllFields = true;

              for (let j = 0; j < fields.length; j++) {
                const f = fields[j] || {};
                if (f.type === 'container') continue;

                const key = String(f.name || '').trim() || `field_${j}`;
                let val = null;

                if (container && f.selector) {
                  try {
                    // FIX: query anywhere inside container, not just direct children
                    const allEls = container.querySelectorAll(f.selector);
                    val = allEls[0] || null;
                  } catch { val = null; }
                }

                const extractedVal = extractValue(val, f.type);
                row[key] = extractedVal;

                if (f.required && !String(extractedVal || '').trim()) {
                  hasAllFields = false;
                }
                if (f.type === 'href' || f.type === 'link' || f.type === 'src') {
                  rowUrl = extractedVal;
                }
                if (String(extractedVal || '').trim() !== '') anyValue = true;
              }

              if (!hasAllFields) continue;
              if (rowUrl && seenUrls.has(rowUrl)) continue;
              if (rowUrl) seenUrls.add(rowUrl);

              const firstKey = String(fields.find(f => f.type !== 'container')?.name || '').trim() || 'field_0';
              if (anyValue) results.push(row);
              if (results.length >= safeLimit) break;
            }

          } else {
            // ── Iterate without container ─────────────────────────────────────
            const remaining = safeLimit - results.length;
            const maxCount = Math.max(...pageCountsNow, 0);
            const maxLen = Math.min(remaining, maxCount);

            for (let i = 0; i < maxLen; i++) {
              const row = {};
              let anyValue = false;
              let rowUrl = '';
              let hasAllFields = true;

              for (let j = 0; j < fields.length; j++) {
                const f = fields[j] || {};
                const key = String(f.name || '').trim() || `field_${j}`;
                const el = arrays[j]?.[i] || null;
                const val = extractValue(el, f.type);
                row[key] = val;

                if (f.required && !String(val || '').trim()) {
                  hasAllFields = false;
                }
                if (f.type === 'href' || f.type === 'link' || f.type === 'src') {
                  rowUrl = val;
                }
                if (String(val || '').trim() !== '') anyValue = true;
              }

              if (!hasAllFields) continue;
              if (rowUrl && seenUrls.has(rowUrl)) continue;
              if (rowUrl) seenUrls.add(rowUrl);

              const firstKey = String(fields[0]?.name || '').trim() || 'field_0';
              if (String(row[firstKey] || '').trim() !== '') results.push(row);
              if (results.length >= safeLimit) break;
            }
          }

          if (results.length >= safeLimit) break;

          if (nextSel && page < safeMaxPages) {
            const nextBtn = document.querySelector(nextSel);
            if (nextBtn) {
              const clickable = nextBtn.closest('a, button') || nextBtn;
              try {
                await withRetry(async () => {
                  clickable.click();
                  const randomDelay = Math.floor(Math.random() * 1500) + 500;
                  await new Promise(r => setTimeout(r, randomDelay));
                  await waitForNetworkIdle(5000);
                  await waitForElements(5000);
                }, 3, 1000);
              } catch (err) {
                logError('nextPageNavigation', err, { page });
                break;
              }
            }
          }
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
        const getTexts = () => Array.from(document.querySelectorAll(selector))
          .map(el => el.innerText?.trim())
          .join('|');
        const oldTexts = message.oldFirstText;
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