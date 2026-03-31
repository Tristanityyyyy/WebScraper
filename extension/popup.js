const {
  useState,
  useEffect
} = React;
const SERVER = 'http://localhost:3000';
const TYPE_OPTIONS = [{
  id: 'text',
  label: '📝 Text'
}, {
  id: 'image',
  label: '🖼️ Image'
}, {
  id: 'price',
  label: '💰 Price'
}, {
  id: 'availability',
  label: '✅ Availability'
}, {
  id: 'html',
  label: '📄 HTML'
}, {
  id: 'link',
  label: '🔗 Link'
}, {
  id: 'title',
  label: '📌 Title'
}, {
  id: 'container',
  label: '📦 Container'
}];

// Required checkbox component
function RequiredCheckbox({
  checked,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    onChange: e => onChange(e.target.checked),
    style: {
      width: 14,
      height: 14
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#64748b'
    }
  }, "Required"));
}

// ── Tiny UI components ───────────────────────────────────────────────────────

function FieldIcon({
  type
}) {
  const icons = {
    text: '📝',
    image: '🖼️',
    price: '💰',
    link: '🔗',
    html: '📄',
    title: '📌',
    availability: '✅'
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      marginRight: 4
    }
  }, icons[type] || '📋');
}
function Badge({
  count
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      background: '#6366f1',
      color: '#fff',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      padding: '1px 7px',
      marginLeft: 6
    }
  }, count);
}
function StatusBar({
  msg,
  type
}) {
  const colors = {
    error: '#ef4444',
    success: '#10b981',
    loading: '#6366f1',
    '': '#94a3b8'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      padding: '6px 12px',
      color: colors[type] || colors[''],
      borderTop: '1px solid #1e2433',
      background: '#0a0d14'
    }
  }, msg);
}
function ResultCard({
  row,
  index
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#1a1f2e',
      border: '1px solid #2d3748',
      borderRadius: 8,
      padding: '8px 12px',
      marginBottom: 6,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#6366f1',
      fontSize: 10,
      marginBottom: 4
    }
  }, "#", index + 1), Object.entries(row).map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#64748b',
      minWidth: 38
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#e2e8f0',
      wordBreak: 'break-all'
    }
  }, String(v)))));
}

// ── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const isMounted = React.useRef(false);
  const isScrapingRef = React.useRef(false);
  const nextSelectorInitialized = React.useRef(false);
  const nextSelectorLoaded = React.useRef(false);
  const [fields, setFields] = useState(() => {
    const now = Date.now();
    return [{
      id: String(now) + '_name',
      name: 'Name',
      type: 'text',
      selector: '',
      preview: '',
      required: true
    }, {
      id: String(now) + '_price',
      name: 'Price',
      type: 'price',
      selector: '',
      preview: '',
      required: false
    }, {
      id: String(now) + '_image',
      name: 'Image',
      type: 'image',
      selector: '',
      preview: '',
      required: false
    }];
  });
  const [limit, setLimit] = useState(20);
  const [nextSelector, setNextSelector] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [pickingNext, setPickingNext] = useState(false);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({
    msg: 'Start by picking field elements on the page',
    type: ''
  });
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
          chrome.tabs.query({
            active: true,
            currentWindow: true
          }, ([tab]) => {
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
          setStatus({
            msg: 'Next page selector picked',
            type: 'success'
          });
          chrome.storage.local.remove(['pickedNextSelector', 'pickedFieldSelector']);
          chrome.storage.local.set({
            nextSelectorState: {
              selector: res.pickedNextSelector.selector
            }
          });
          if (poll) clearInterval(poll);
        }
        if (res.pickedFieldSelector?.fieldId && !isScrapingRef.current) {
          const p = res.pickedFieldSelector;
          chrome.storage.local.remove(['pickedFieldSelector']);
          setFields(prev => prev.map(f => f.id === p.fieldId ? {
            ...f,
            selector: p.selector || '',
            preview: p.previewText || '',
            type: p.autoType || f.type
          } : f));
          setStatus({
            msg: `Picked "${p.fieldId}" selector`,
            type: 'success'
          });
        }
      });
    };

    // Run once immediately on mount
    loadStorage();

    // Then keep polling every 500ms
    poll = setInterval(loadStorage, 500);
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, ([tab]) => {
      if (tab?.url) setCurrentUrl(tab.url);
    });
    return () => {
      if (poll) clearInterval(poll);
    };
  }, []);
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, ([tab]) => {
      const host = tab?.url ? new URL(tab.url).hostname : '';
      chrome.storage.local.set({
        scraperState: {
          fields,
          limit,
          maxPages,
          host
        }
      });
    });
  }, [fields, limit, maxPages]);
  useEffect(() => {
    if (!isMounted.current) return;
    if (!nextSelectorInitialized.current) {
      nextSelectorInitialized.current = true;
      return;
    }
    chrome.storage.local.set({
      nextSelectorState: {
        selector: nextSelector
      }
    });
  }, [nextSelector]);
  useEffect(() => {
    const handler = message => {
      if (message.action !== 'fieldSelectorPicked' || !message.fieldId) return;
      setFields(prev => {
        const next = prev.map(f => f.id === message.fieldId ? {
          ...f,
          selector: message.selector || '',
          preview: message.previewText || '',
          type: message.autoType || f.type
        } : f);
        const picked = next.find(f => f.id === message.fieldId);
        if (picked) {
          setStatus({
            msg: `Picked "${picked.name}" selector`,
            type: 'success'
          });
        }
        return next;
      });
      chrome.storage.local.remove(['pickedFieldSelector']);
    };
    const handler2 = message => {
      if (message.action !== 'elementPicked') return;
      if (!pickingNext) return;
      setNextSelector(message.selector || '');
      setPickingNext(false);
      setStatus({
        msg: 'Next page selector picked',
        type: 'success'
      });
    };
    chrome.runtime.onMessage.addListener(handler);
    chrome.runtime.onMessage.addListener(handler2);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
      chrome.runtime.onMessage.removeListener(handler2);
    };
  }, [pickingNext]);
  const updateField = (fieldId, patch) => {
    setFields(prev => prev.map(f => f.id === fieldId ? {
      ...f,
      ...patch
    } : f));
  };
  const removeField = fieldId => setFields(prev => prev.filter(f => f.id !== fieldId));
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    const id = String(Date.now()) + '_' + Math.random().toString(16).slice(2);
    setFields(prev => [...prev, {
      id,
      name: newFieldName.trim(),
      type: newFieldType,
      selector: '',
      preview: '',
      required: false
    }]);
    setNewFieldName('');
    setNewFieldType('text');
    setShowAddField(false);
  };
  const addField = () => {
    const name = prompt('Field name (output key):');
    if (!name) return;
    const type = prompt('Type: text, image, price, availability, html, link, title', 'text') || 'text';
    const id = String(Date.now()) + '_' + Math.random().toString(16).slice(2);
    setFields(prev => [...prev, {
      id,
      name: name.trim(),
      type: type.trim(),
      selector: '',
      preview: ''
    }]);
  };
  const addHotelPreset = () => {
    const now = Date.now();
    setFields(prev => {
      const hasName = prev.some(f => f.name.toLowerCase() === 'name');
      const hasPrice = prev.some(f => f.name.toLowerCase() === 'price');
      const hasImage = prev.some(f => f.name.toLowerCase() === 'image');
      const out = [...prev];
      if (!hasName) out.push({
        id: String(now) + '_name',
        name: 'Name',
        type: 'text',
        selector: '',
        preview: ''
      });
      if (!hasPrice) out.push({
        id: String(now) + '_price',
        name: 'Price',
        type: 'price',
        selector: '',
        preview: ''
      });
      if (!hasImage) out.push({
        id: String(now) + '_image',
        name: 'Image',
        type: 'image',
        selector: '',
        preview: ''
      });
      return out;
    });
  };
  const pickField = async fieldId => {
    const field = fields.find(f => f.id === fieldId);
    setStatus({
      msg: `Click an element on the page for "${field?.name || 'field'}"…`,
      type: 'loading'
    });
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!tab?.id) return setStatus({
      msg: 'Cannot access current tab',
      type: 'error'
    });
    setCurrentUrl(tab.url || '');
    try {
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        files: ['content.js']
      });
    } catch {}
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'activateFieldPicker',
        fieldId
      });
    } catch {
      setStatus({
        msg: 'Cannot connect to page — try refreshing the tab',
        type: 'error'
      });
    }
  };
  const pickNextPage = async () => {
    setPickingNext(true);
    chrome.storage.local.remove(['pickedFieldSelector', 'pickedElement']);
    setStatus({
      msg: 'Click the Next page button on the website…',
      type: 'loading'
    });
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!tab?.id) {
      setPickingNext(false);
      setStatus({
        msg: 'Cannot access current tab',
        type: 'error'
      });
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        files: ['content.js']
      });
    } catch {}
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'activatePicker'
      });
    } catch {
      setPickingNext(false);
      setStatus({
        msg: 'Cannot connect to page — try refreshing the tab',
        type: 'error'
      });
    }
  };
  const clearResults = () => {
    setResults([]);
    setSaved(false);
    setStatus({
      msg: 'Pick fields and scrape again',
      type: ''
    });
  };
  const scrape = async () => {
    const fieldSelectors = fields.map(f => ({
      name: (f.name || '').trim(),
      type: f.type || 'text',
      selector: (f.selector || '').trim()
    })).filter(f => f.name && f.selector);
    if (!fieldSelectors.length) {
      return setStatus({
        msg: 'Add at least one field with a selector',
        type: 'error'
      });
    }
    setStatus({
      msg: 'Scraping…',
      type: 'loading'
    });
    setSaved(false);
    isScrapingRef.current = true;
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (!tab?.id) throw new Error('No active tab');
      setCurrentUrl(tab.url || '');
      const response = nextSelector ? await chrome.runtime.sendMessage({
        action: 'scrapeAllPages',
        tabId: tab.id,
        fieldSelectors,
        limit,
        nextSelector,
        maxPages
      }) : await chrome.tabs.sendMessage(tab.id, {
        action: 'scrapeByFieldSelectors',
        fieldSelectors,
        limit,
        nextSelector: '',
        maxPages: 1
      });
      if (response?.error) {
        setStatus({
          msg: 'Error: ' + response.error,
          type: 'error'
        });
        return;
      }
      const res = response?.results || [];
      setResults(res);
      if (!res.length) {
        const counts = response?.counts;
        const countMsg = Array.isArray(counts) && counts.length ? ` Selector matches: ${fieldSelectors.map((f, i) => `${f.name}=${counts[i] ?? 0}`).slice(0, 5).join(', ')}.` : '';
        setStatus({
          msg: 'Scrape returned 0 rows. Check your picked selectors.' + countMsg,
          type: 'error'
        });
      } else {
        const pages = Array.isArray(response?.pageCounts) ? response.pageCounts.length : 1;
        setStatus({
          msg: `Found ${res.length} result(s) across ${pages} page(s)`,
          type: 'success'
        });
      }
    } catch (err) {
      setStatus({
        msg: 'Cannot connect to page — try refreshing',
        type: 'error'
      });
    } finally {
      isScrapingRef.current = false;
    }
  };
  const save = async () => {
    if (!results.length) return setStatus({
      msg: 'Nothing to save',
      type: 'error'
    });
    const fieldSelectors = fields.map(f => ({
      name: (f.name || '').trim(),
      selector: (f.selector || '').trim()
    })).filter(f => f.name && f.selector);
    const selectorSummary = fieldSelectors.map(f => `${f.name}:${f.selector}`).join(' | ');
    setStatus({
      msg: 'Saving…',
      type: 'loading'
    });
    try {
      const res = await fetch(`${SERVER}/api/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: currentUrl,
          selector: selectorSummary || 'custom_fields',
          results
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setStatus({
          msg: `Saved ${results.length} rows (job #${data.jobId})`,
          type: 'success'
        });
      } else {
        setStatus({
          msg: 'Save failed: ' + data.error,
          type: 'error'
        });
      }
    } catch {
      setStatus({
        msg: 'Cannot reach server — is Node running?',
        type: 'error'
      });
    }
  };
  const reset = () => {
    const now = Date.now();
    setFields([{
      id: String(now) + '_name',
      name: 'Name',
      type: 'text',
      selector: '',
      preview: ''
    }, {
      id: String(now) + '_price',
      name: 'Price',
      type: 'price',
      selector: '',
      preview: ''
    }, {
      id: String(now) + '_image',
      name: 'Image',
      type: 'image',
      selector: '',
      preview: ''
    }]);
    setLimit(20);
    setNextSelector('');
    setMaxPages(50);
    setResults([]);
    setSaved(false);
    setCurrentUrl('');
    nextSelectorLoaded.current = false;
    nextSelectorInitialized.current = false;
    setStatus({
      msg: 'Start by picking field elements on the page',
      type: ''
    });
    chrome.storage.local.remove(['scraperState', 'pickedFieldSelector', 'pickedNextSelector', 'nextSelectorState']);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0f1117',
      color: '#e2e8f0',
      fontFamily: '-apple-system, sans-serif'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 14px',
      background: '#0a0d14',
      borderBottom: '1px solid #1e2433',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: '#6366f1'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 14
    }
  }, "Visual Scraper")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, results.length > 0 && /*#__PURE__*/React.createElement(Badge, {
    count: results.length
  }), /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    style: {
      background: 'transparent',
      border: '1px solid #2d3748',
      color: '#64748b',
      borderRadius: 6,
      padding: '3px 10px',
      fontSize: 11,
      cursor: 'pointer'
    }
  }, "Reset"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: addHotelPreset,
    style: {
      flex: 1,
      padding: '8px 10px',
      background: 'transparent',
      border: '1px dashed #2d3748',
      borderRadius: 8,
      color: '#6366f1',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "+ Preset"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAddField(true),
    style: {
      padding: '8px 10px',
      background: 'transparent',
      border: '1px solid #2d3748',
      borderRadius: 8,
      color: '#64748b',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "+ Add Field")), showAddField && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#1a1f2e',
      border: '1px solid #6366f1',
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: newFieldName,
    onChange: e => setNewFieldName(e.target.value),
    placeholder: "Field name",
    autoFocus: true,
    style: {
      width: '100%',
      padding: '8px',
      background: '#0a0d14',
      border: '1px solid #2d3748',
      borderRadius: 6,
      color: '#e2e8f0',
      fontSize: 12,
      marginBottom: 8,
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: newFieldType,
    onChange: e => setNewFieldType(e.target.value),
    style: {
      flex: 1,
      padding: '6px 8px',
      background: '#0a0d14',
      border: '1px solid #2d3748',
      borderRadius: 6,
      color: '#e2e8f0',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "text"
  }, "\uD83D\uDCDD Text"), /*#__PURE__*/React.createElement("option", {
    value: "image"
  }, "\uD83D\uDDBC\uFE0F Image"), /*#__PURE__*/React.createElement("option", {
    value: "price"
  }, "\uD83D\uDCB0 Price"), /*#__PURE__*/React.createElement("option", {
    value: "link"
  }, "\uD83D\uDD17 Link"), /*#__PURE__*/React.createElement("option", {
    value: "html"
  }, "\uD83D\uDCC4 HTML"), /*#__PURE__*/React.createElement("option", {
    value: "title"
  }, "\uD83D\uDCCC Title"), /*#__PURE__*/React.createElement("option", {
    value: "availability"
  }, "\u2705 Availability"), /*#__PURE__*/React.createElement("option", {
    value: "container"
  }, "\uD83D\uDCE6 Container")), /*#__PURE__*/React.createElement("button", {
    onClick: handleAddField,
    style: {
      flex: 1,
      padding: '6px 12px',
      background: '#6366f1',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "Add"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShowAddField(false);
      setNewFieldName('');
      setNewFieldType('text');
    },
    style: {
      flex: 1,
      padding: '6px 12px',
      background: 'transparent',
      color: '#64748b',
      border: '1px solid #2d3748',
      borderRadius: 6,
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "Cancel"))), fields.map((f, idx) => /*#__PURE__*/React.createElement("div", {
    key: f.id,
    style: {
      background: '#1a1f2e',
      border: '1px solid #2d3748',
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#818cf8',
      fontSize: 12,
      fontWeight: 700
    }
  }, idx + 1), /*#__PURE__*/React.createElement("input", {
    value: f.name,
    onChange: e => updateField(f.id, {
      name: e.target.value
    }),
    style: {
      background: '#0a0d14',
      border: '1px solid #2d3748',
      borderRadius: 6,
      padding: '6px 8px',
      color: '#e2e8f0',
      fontSize: 12,
      width: 160,
      outline: 'none'
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => removeField(f.id),
    style: {
      background: 'transparent',
      border: 'none',
      color: '#ef4444',
      cursor: 'pointer',
      fontSize: 16,
      padding: '0 4px'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 140
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 11,
      color: '#64748b',
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement(FieldIcon, {
    type: f.type
  }), " Type"), /*#__PURE__*/React.createElement("select", {
    value: f.type,
    onChange: e => updateField(f.id, {
      type: e.target.value
    }),
    style: {
      width: '100%',
      background: '#0a0d14',
      border: '1px solid #2d3748',
      borderRadius: 6,
      padding: '6px 8px',
      color: '#e2e8f0',
      fontSize: 12,
      outline: 'none'
    }
  }, TYPE_OPTIONS.map(t => /*#__PURE__*/React.createElement("option", {
    key: t.id,
    value: t.id
  }, t.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: f.required || false,
    onChange: e => updateField(f.id, {
      required: e.target.checked
    }),
    style: {
      width: 14,
      height: 14
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#64748b'
    }
  }, "Required")))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 11,
      color: '#64748b',
      marginBottom: 4
    }
  }, "CSS selector"), /*#__PURE__*/React.createElement("input", {
    value: f.selector,
    onChange: e => updateField(f.id, {
      selector: e.target.value
    }),
    placeholder: "e.g. img, .hotel-name, .price",
    style: {
      width: '100%',
      padding: '8px 10px',
      background: '#1a1f2e',
      border: '1px solid #2d3748',
      borderRadius: 6,
      color: '#e2e8f0',
      fontSize: 12,
      fontFamily: 'monospace',
      outline: 'none'
    }
  }))), f.preview && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#64748b',
      marginBottom: 8,
      wordBreak: 'break-word'
    }
  }, "Preview: \"", f.preview, "\""), /*#__PURE__*/React.createElement("button", {
    onClick: () => pickField(f.id),
    style: {
      width: '100%',
      padding: '9px',
      background: '#0d1a14',
      border: '1px solid #10b981',
      borderRadius: 8,
      color: '#10b981',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Pick element")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: '#64748b',
      whiteSpace: 'nowrap'
    }
  }, "Max results"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: limit,
    min: 1,
    max: 500,
    onChange: e => setLimit(parseInt(e.target.value) || 20),
    style: {
      width: 70,
      padding: '6px 8px',
      background: '#1a1f2e',
      border: '1px solid #2d3748',
      borderRadius: 6,
      color: '#e2e8f0',
      fontSize: 12,
      outline: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: pickNextPage,
    style: {
      flex: 1,
      padding: '9px 10px',
      background: pickingNext ? '#1e2433' : 'transparent',
      border: '1px solid #2d3748',
      color: pickingNext ? '#94a3b8' : '#64748b',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Pick Next page"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      color: '#64748b',
      whiteSpace: 'nowrap'
    }
  }, "Max pages"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: maxPages,
    min: 1,
    max: 200,
    onChange: e => setMaxPages(parseInt(e.target.value) || 50),
    style: {
      width: 70,
      padding: '6px 8px',
      background: '#1a1f2e',
      border: '1px solid #2d3748',
      borderRadius: 6,
      color: '#e2e8f0',
      fontSize: 12,
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 11,
      color: '#64748b',
      marginBottom: 4
    }
  }, "Next page CSS selector (optional)"), /*#__PURE__*/React.createElement("input", {
    value: nextSelector,
    onChange: e => setNextSelector(e.target.value),
    placeholder: "e.g. a.next, button.next",
    style: {
      width: '100%',
      padding: '8px 10px',
      background: '#1a1f2e',
      border: '1px solid #2d3748',
      borderRadius: 6,
      color: '#e2e8f0',
      fontSize: 12,
      fontFamily: 'monospace',
      outline: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: scrape,
    style: {
      flex: 1,
      padding: '9px',
      background: '#10b981',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Scrape"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    disabled: !results.length || saved,
    style: {
      flex: 1,
      padding: '9px',
      background: saved ? '#1a2a1a' : results.length ? '#1e3a2f' : '#1a1f2e',
      color: saved ? '#10b981' : results.length ? '#34d399' : '#4a5568',
      border: `1px solid ${saved ? '#10b981' : results.length ? '#10b981' : '#2d3748'}`,
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: results.length ? 'pointer' : 'default'
    }
  }, saved ? 'Saved ✓' : 'Save to DB'), /*#__PURE__*/React.createElement("button", {
    onClick: clearResults,
    style: {
      padding: '9px 14px',
      background: 'transparent',
      color: '#64748b',
      border: '1px solid #2d3748',
      borderRadius: 8,
      fontSize: 12,
      cursor: 'pointer'
    }
  }, "Clear")), results.length > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#64748b',
      marginBottom: 8
    }
  }, "Results (", results.length, ")"), results.map((row, i) => /*#__PURE__*/React.createElement(ResultCard, {
    key: i,
    row: row,
    index: i
  })))), /*#__PURE__*/React.createElement(StatusBar, {
    msg: status.msg,
    type: status.type
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
