const { useState, useEffect } = React;
const SERVER = 'http://localhost:3000';

const TYPE_OPTIONS = [
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Image (src)' },
  { id: 'price', label: 'Price (text)' },
  { id: 'availability', label: 'Availability (text)' },
  { id: 'html', label: 'Raw HTML' },
  { id: 'link', label: 'Link (href)' },
  { id: 'title', label: 'Title attr' },
];

// ── Tiny UI components ───────────────────────────────────────────────────────

function Badge({ count }) {
  return (
    <span style={{
      background: '#6366f1', color: '#fff', borderRadius: 99,
      fontSize: 11, fontWeight: 600, padding: '1px 7px', marginLeft: 6
    }}>{count}</span>
  );
}

function StatusBar({ msg, type }) {
  const colors = { error: '#ef4444', success: '#10b981', loading: '#6366f1', '': '#94a3b8' };
  return (
    <div style={{
      fontSize: 12, padding: '6px 12px',
      color: colors[type] || colors[''],
      borderTop: '1px solid #1e2433',
      background: '#0a0d14'
    }}>{msg}</div>
  );
}

function ResultCard({ row, index }) {
  return (
    <div style={{
      background: '#1a1f2e', border: '1px solid #2d3748',
      borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 12
    }}>
      <div style={{ color: '#6366f1', fontSize: 10, marginBottom: 4 }}>#{index + 1}</div>
      {Object.entries(row).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: '#64748b', minWidth: 38 }}>{k}</span>
          <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>
            {String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const isMounted = React.useRef(false);

  const isScrapingRef = React.useRef(false);
  const nextSelectorInitialized = React.useRef(false);
  const nextSelectorLoaded = React.useRef(false);

  const [fields, setFields] = useState(() => {
    const now = Date.now();
    return [
      { id: String(now) + '_name', name: 'Name', type: 'text', selector: '', preview: '' },
      { id: String(now) + '_price', name: 'Price', type: 'price', selector: '', preview: '' },
      { id: String(now) + '_image', name: 'Image', type: 'image', selector: '', preview: '' },
    ];
  });
  const [limit, setLimit] = useState(20);
  const [nextSelector, setNextSelector] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [pickingNext, setPickingNext] = useState(false);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({ msg: 'Start by picking field elements on the page', type: '' });
  const [saved, setSaved] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  useEffect(() => {
    let poll = null;
    let initialLoadDone = false;  

    const loadStorage = () => {
      chrome.storage.local.get(['scraperState', 'pickedFieldSelector', 'pickedNextSelector', 'nextSelectorState'], res => {
        if (!initialLoadDone) {
          initialLoadDone = true;
          const s = res.scraperState;
          chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            const currentHost = tab?.url ? new URL(tab.url).hostname : '';
            const savedHost = s?.host || '';
            if (s && Array.isArray(s.fields) && s.fields.length && currentHost === savedHost) {
              setFields(s.fields);
            }
            if (s && typeof s.limit === 'number') setLimit(s.limit);
            if (s && typeof s.maxPages === 'number') setMaxPages(s.maxPages);
          });
        }

        if (!nextSelectorLoaded.current && res.nextSelectorState?.selector !== undefined) {
          nextSelectorLoaded.current = true;
          nextSelectorInitialized.current = true;
          setNextSelector(res.nextSelectorState.selector);
        }

        if (res.pickedNextSelector?.selector) {
          setNextSelector(res.pickedNextSelector.selector);
          setStatus({ msg: 'Next page selector picked', type: 'success' });
          chrome.storage.local.remove(['pickedNextSelector', 'pickedFieldSelector']);
          chrome.storage.local.set({ nextSelectorState: { selector: res.pickedNextSelector.selector } });
          if (poll) clearInterval(poll);
        }

        if (res.pickedFieldSelector?.fieldId && !isScrapingRef.current) {
          const p = res.pickedFieldSelector;
          chrome.storage.local.remove(['pickedFieldSelector']);
          setFields(prev => prev.map(f =>
            f.id === p.fieldId ? { ...f, selector: p.selector || '', preview: p.previewText || '', type: p.autoType || f.type } : f
          ));
          setStatus({ msg: `Picked "${p.fieldId}" selector`, type: 'success' });
        }
      });
    };

  // Run once immediately on mount
  loadStorage();

  // Then keep polling every 500ms
  poll = setInterval(loadStorage, 500);

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url) setCurrentUrl(tab.url);
  });

  return () => { if (poll) clearInterval(poll); };
}, []);

  

useEffect(() => {
  if (!isMounted.current) { isMounted.current = true; return; }
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const host = tab?.url ? new URL(tab.url).hostname : '';
    chrome.storage.local.set({ scraperState: { fields, limit, maxPages, host } });
  });
}, [fields, limit, maxPages]);

useEffect(() => {
  if (!isMounted.current) return;
  if (!nextSelectorInitialized.current) {
    nextSelectorInitialized.current = true;
    return;
  }
  chrome.storage.local.set({ nextSelectorState: { selector: nextSelector } });
}, [nextSelector]);

  useEffect(() => {
    const handler = (message) => {
      if (message.action !== 'fieldSelectorPicked' || !message.fieldId) return;
      setFields(prev => {
        const next = prev.map(f =>
          f.id === message.fieldId
            ? { ...f, selector: message.selector || '', preview: message.previewText || '', type: message.autoType || f.type }
            : f
        );
        const picked = next.find(f => f.id === message.fieldId);
        if (picked) {
          setStatus({ msg: `Picked "${picked.name}" selector`, type: 'success' });
        }
        return next;
      });
      chrome.storage.local.remove(['pickedFieldSelector']);
    };
    const handler2 = (message) => {
      if (message.action !== 'elementPicked') return;
      if (!pickingNext) return;
      setNextSelector(message.selector || '');
      setPickingNext(false);
      setStatus({ msg: 'Next page selector picked', type: 'success' });
    };
    chrome.runtime.onMessage.addListener(handler);
    chrome.runtime.onMessage.addListener(handler2);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
      chrome.runtime.onMessage.removeListener(handler2);
    };
  }, [pickingNext]);

  const updateField = (fieldId, patch) => {
    setFields(prev => prev.map(f => (f.id === fieldId ? { ...f, ...patch } : f)));
  };

  const removeField = (fieldId) => setFields(prev => prev.filter(f => f.id !== fieldId));

  const addField = () => {
    const name = prompt('Field name (output key):');
    if (!name) return;
    const type = prompt('Type: text, image, price, availability, html, link, title', 'text') || 'text';
    const id = String(Date.now()) + '_' + Math.random().toString(16).slice(2);
    setFields(prev => [...prev, { id, name: name.trim(), type: type.trim(), selector: '', preview: '' }]);
  };

  const addHotelPreset = () => {
    const now = Date.now();
    setFields(prev => {
      const hasName = prev.some(f => f.name.toLowerCase() === 'name');
      const hasPrice = prev.some(f => f.name.toLowerCase() === 'price');
      const hasImage = prev.some(f => f.name.toLowerCase() === 'image');
      const out = [...prev];
      if (!hasName) out.push({ id: String(now) + '_name', name: 'Name', type: 'text', selector: '', preview: '' });
      if (!hasPrice) out.push({ id: String(now) + '_price', name: 'Price', type: 'price', selector: '', preview: '' });
      if (!hasImage) out.push({ id: String(now) + '_image', name: 'Image', type: 'image', selector: '', preview: '' });
      return out;
    });
  };

  const pickField = async (fieldId) => {
  const field = fields.find(f => f.id === fieldId);
  setStatus({ msg: `Click an element on the page for "${field?.name || 'field'}"…`, type: 'loading' });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return setStatus({ msg: 'Cannot access current tab', type: 'error' });
    setCurrentUrl(tab.url || '');
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {}
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'activateFieldPicker', fieldId });
    } catch {
      setStatus({ msg: 'Cannot connect to page — try refreshing the tab', type: 'error' });
    }
  };

  const pickNextPage = async () => {
    setPickingNext(true);
    chrome.storage.local.remove(['pickedFieldSelector', 'pickedElement']); 
    setStatus({ msg: 'Click the Next page button on the website…', type: 'loading' });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setPickingNext(false);
      setStatus({ msg: 'Cannot access current tab', type: 'error' });
      return;
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {}
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'activatePicker' });
    } catch {
      setPickingNext(false);
      setStatus({ msg: 'Cannot connect to page — try refreshing the tab', type: 'error' });
    }
  };

  const clearResults = () => {
    setResults([]);
    setSaved(false);
    setStatus({ msg: 'Pick fields and scrape again', type: '' });
  };

  const scrape = async () => {
    const fieldSelectors = fields
      .map(f => ({
        name: (f.name || '').trim(),
        type: f.type || 'text',
        selector: (f.selector || '').trim()
      }))
      .filter(f => f.name && f.selector);

    if (!fieldSelectors.length) {
      return setStatus({ msg: 'Add at least one field with a selector', type: 'error' });
    }

    setStatus({ msg: 'Scraping…', type: 'loading' });
    setSaved(false);
    isScrapingRef.current = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      setCurrentUrl(tab.url || '');

      const response = nextSelector
        ? await chrome.runtime.sendMessage({
            action: 'scrapeAllPages',
            tabId: tab.id,
            fieldSelectors,
            limit,
            nextSelector,
            maxPages
          })
        : await chrome.tabs.sendMessage(tab.id, {
            action: 'scrapeByFieldSelectors',
            fieldSelectors,
            limit,
            nextSelector: '',
            maxPages: 1
          });

      if (response?.error) {
        setStatus({ msg: 'Error: ' + response.error, type: 'error' });
        return;
      }

      const res = response?.results || [];
      setResults(res);
      if (!res.length) {
        const counts = response?.counts;
        const countMsg =
          Array.isArray(counts) && counts.length
            ? ` Selector matches: ${fieldSelectors.map((f, i) => `${f.name}=${counts[i] ?? 0}`).slice(0, 5).join(', ')}.`
            : '';
        setStatus({ msg: 'Scrape returned 0 rows. Check your picked selectors.' + countMsg, type: 'error' });
      } else {
        const pages = Array.isArray(response?.pageCounts) ? response.pageCounts.length : 1;
        setStatus({ msg: `Found ${res.length} result(s) across ${pages} page(s)`, type: 'success' });
      }
    }  catch (err) {
      setStatus({ msg: 'Cannot connect to page — try refreshing', type: 'error' });
    } finally {
      isScrapingRef.current = false;
    }
  };

  const save = async () => {
    if (!results.length) return setStatus({ msg: 'Nothing to save', type: 'error' });

    const fieldSelectors = fields
      .map(f => ({ name: (f.name || '').trim(), selector: (f.selector || '').trim() }))
      .filter(f => f.name && f.selector);
    const selectorSummary = fieldSelectors.map(f => `${f.name}:${f.selector}`).join(' | ');

    setStatus({ msg: 'Saving…', type: 'loading' });

    try {
      const res = await fetch(`${SERVER}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentUrl,
          selector: selectorSummary || 'custom_fields',
          results
        })
      });

      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setStatus({ msg: `Saved ${results.length} rows (job #${data.jobId})`, type: 'success' });
      } else {
        setStatus({ msg: 'Save failed: ' + data.error, type: 'error' });
      }
    } catch {
      setStatus({ msg: 'Cannot reach server — is Node running?', type: 'error' });
    }
  };

  const reset = () => {
    const now = Date.now();
    setFields([
      { id: String(now) + '_name', name: 'Name', type: 'text', selector: '', preview: '' },
      { id: String(now) + '_price', name: 'Price', type: 'price', selector: '', preview: '' },
      { id: String(now) + '_image', name: 'Image', type: 'image', selector: '', preview: '' },
    ]);
    setLimit(20);
    setNextSelector('');
    setMaxPages(50);
    setResults([]);
    setSaved(false);
    setCurrentUrl('');

    nextSelectorLoaded.current = false;
    nextSelectorInitialized.current = false;

    setStatus({ msg: 'Start by picking field elements on the page', type: '' });
    chrome.storage.local.remove(['scraperState', 'pickedFieldSelector', 'pickedNextSelector', 'nextSelectorState']);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0f1117',
      color: '#e2e8f0',
      fontFamily: '-apple-system, sans-serif'
    }}>

      {/* Header */}
      <div style={{
        padding: '12px 14px', background: '#0a0d14',
        borderBottom: '1px solid #1e2433',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }}/>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Visual Scraper</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {results.length > 0 && <Badge count={results.length} />}
          <button onClick={reset} style={{
            background: 'transparent',
            border: '1px solid #2d3748',
            color: '#64748b',
            borderRadius: 6,
            padding: '3px 10px',
            fontSize: 11,
            cursor: 'pointer'
          }}>
            Reset
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={addHotelPreset} style={{
              flex: 1,
              padding: '8px 10px',
              background: 'transparent',
              border: '1px dashed #2d3748',
              borderRadius: 8,
              color: '#6366f1',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              + Preset
            </button>
            <button onClick={addField} style={{
              padding: '8px 10px',
              background: 'transparent',
              border: '1px solid #2d3748',
              borderRadius: 8,
              color: '#64748b',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              + Add Field
            </button>
          </div>

          {fields.map((f, idx) => (
            <div key={f.id} style={{
              background: '#1a1f2e',
              border: '1px solid #2d3748',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ color: '#818cf8', fontSize: 12, fontWeight: 700 }}>{idx + 1}</div>
                  <input
                    value={f.name}
                    onChange={e => updateField(f.id, { name: e.target.value })}
                    style={{
                      background: '#0a0d14',
                      border: '1px solid #2d3748',
                      borderRadius: 6,
                      padding: '6px 8px',
                      color: '#e2e8f0',
                      fontSize: 12,
                      width: 160,
                      outline: 'none'
                    }}
                  />
                </div>
                <button onClick={() => removeField(f.id)} style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '0 4px'
                }}>
                  ×
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 140 }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Type</label>
                  <select
                    value={f.type}
                    onChange={e => updateField(f.id, { type: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#0a0d14',
                      border: '1px solid #2d3748',
                      borderRadius: 6,
                      padding: '6px 8px',
                      color: '#e2e8f0',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  >
                    {TYPE_OPTIONS.map(t => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>CSS selector</label>
                  <input
                    value={f.selector}
                    onChange={e => updateField(f.id, { selector: e.target.value })}
                    placeholder="e.g. img, .hotel-name, .price"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#1a1f2e',
                      border: '1px solid #2d3748',
                      borderRadius: 6,
                      color: '#e2e8f0',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {f.preview && (
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, wordBreak: 'break-word' }}>
                  Preview: "{f.preview}"
                </div>
              )}

              <button onClick={() => pickField(f.id)} style={{
                width: '100%',
                padding: '9px',
                background: '#0d1a14',
                border: '1px solid #10b981',
                borderRadius: 8,
                color: '#10b981',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}>
                Pick element
              </button>
            </div>
          ))}
        </div>

        {/* Limit */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>Max results</label>
          <input
            type="number" value={limit} min={1} max={500}
            onChange={e => setLimit(parseInt(e.target.value) || 20)}
            style={{
              width: 70, padding: '6px 8px',
              background: '#1a1f2e', border: '1px solid #2d3748',
              borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none'
            }}
          />
        </div>

        {/* Pagination */}
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={pickNextPage} style={{
              flex: 1,
              padding: '9px 10px',
              background: pickingNext ? '#1e2433' : 'transparent',
              border: '1px solid #2d3748',
              color: pickingNext ? '#94a3b8' : '#64748b',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Pick Next page
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>Max pages</label>
              <input
                type="number"
                value={maxPages}
                min={1}
                max={200}
                onChange={e => setMaxPages(parseInt(e.target.value) || 50)}
                style={{
                  width: 70, padding: '6px 8px',
                  background: '#1a1f2e', border: '1px solid #2d3748',
                  borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
              Next page CSS selector (optional)
            </label>
            <input
              value={nextSelector}
              onChange={e => setNextSelector(e.target.value)}
              placeholder="e.g. a.next, button.next"
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#1a1f2e', border: '1px solid #2d3748',
                borderRadius: 6, color: '#e2e8f0', fontSize: 12,
                fontFamily: 'monospace', outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={scrape} style={{
            flex: 1, padding: '9px', background: '#10b981',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
            Scrape
          </button>
          <button onClick={save} disabled={!results.length || saved} style={{
            flex: 1, padding: '9px',
            background: saved ? '#1a2a1a' : results.length ? '#1e3a2f' : '#1a1f2e',
            color: saved ? '#10b981' : results.length ? '#34d399' : '#4a5568',
            border: `1px solid ${saved ? '#10b981' : results.length ? '#10b981' : '#2d3748'}`,
            borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: results.length ? 'pointer' : 'default'
          }}>
            {saved ? 'Saved ✓' : 'Save to DB'}
          </button>
          <button onClick={clearResults} style={{
            padding: '9px 14px', background: 'transparent',
            color: '#64748b', border: '1px solid #2d3748',
            borderRadius: 8, fontSize: 12, cursor: 'pointer'
          }}>
            Clear
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
              Results ({results.length})
            </div>
            {results.map((row, i) => <ResultCard key={i} row={row} index={i} />)}
          </div>
        )}
      </div>

      <StatusBar msg={status.msg} type={status.type} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);