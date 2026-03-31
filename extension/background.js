chrome.runtime.onInstalled.addListener(() => {
  console.log('Web Scraper extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scrapeAllPages') {
    scrapeAllPages(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url?.startsWith('http')) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(() => {});
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    }).catch(() => {});
  }
});

async function scrapeAllPages({ tabId, fieldSelectors, limit, nextSelector, maxPages }) {
  const allResults = [];
  const safeLimit = Number(limit) > 0 ? Number(limit) : 20;
  const safeMaxPages = Number(maxPages) > 0 ? Number(maxPages) : 1;

  let page = 0;
  while (page < safeMaxPages && allResults.length < safeLimit) {
    await waitForTab(tabId);

    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'scrapeByFieldSelectors',
      fieldSelectors,
      limit: safeLimit - allResults.length,
      nextSelector: '',
      maxPages: 1
    });

    if (response?.error) break;
    const rows = response?.results || [];
    allResults.push(...rows);

    if (allResults.length >= safeLimit) break;
    if (!nextSelector) break;

    // If we got fewer results than expected, we might be on the last page
    if (rows.length === 0) break;

    const nextResponse = await chrome.tabs.sendMessage(tabId, {
      action: 'getNextHref',
      nextSelector
    });

    console.log('nextSelector:', nextSelector);
    console.log('nextResponse:', nextResponse);

    if (!nextResponse?.href) {
      // Check if next button is disabled or missing before assuming SPA
      const isLastPage = await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector) => {
          const el = document.querySelector(selector);
          if (!el) return true; // no button = last page
          const btn = el.closest('a, button') || el;
          return (
            btn.hasAttribute('disabled') ||
            btn.getAttribute('aria-disabled') === 'true' ||
            btn.classList.contains('disabled') ||
            btn.getAttribute('aria-label')?.toLowerCase().includes('disabled')
          );
        },
        args: [nextSelector]
      });

      if (isLastPage?.[0]?.result) {
        console.log('Last page detected, stopping.');
        break;
      }

      // SPA — get current first text BEFORE clicking
      const oldTextsResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => {
          return Array.from(document.querySelectorAll(sel))
            .map(el => el.innerText?.trim()).join('|');
        },
        args: [fieldSelectors[0]?.selector]
      });
      const oldTexts = oldTextsResult?.[0]?.result || '';

      // Click directly via executeScript
      const clicked = await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const clickable = el.closest('a, button') || el;
          clickable.click();
          return true;
        },
        args: [nextSelector]
      });

      const wasClicked = clicked?.[0]?.result;
      console.log('wasClicked:', wasClicked);
      if (!wasClicked) break;

      // Wait for DOM to actually change
      await new Promise(resolve => {
        const start = Date.now();
        const check = async () => {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: (sel) => {
              return Array.from(document.querySelectorAll(sel))
                .map(el => el.innerText?.trim()).join('|');
            },
            args: [fieldSelectors[0]?.selector]
          });
          const currentTexts = results?.[0]?.result || '';
          if (currentTexts !== oldTexts && currentTexts !== '') return resolve(true);
          if (Date.now() - start > 8000) return resolve(false);
          setTimeout(check, 300);
        };
        check();
      });

      page++;
      continue;
    }

    // Has href — normal pagination, navigate to next page
    await chrome.tabs.update(tabId, { url: nextResponse.href });
    page++;
  }

  return { results: allResults, pageCounts: Array.from({ length: page }, (_, i) => i) };
}

async function waitForTab(tabId) {
  return new Promise((resolve) => {
    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content.js']
            });
          } catch {}
          return resolve();
        }
      } catch {}
      setTimeout(check, 300);
    };
    check();
  });
}