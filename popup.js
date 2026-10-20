/* Popup controller. */
(function () {
  'use strict';

  /** Look up a localized message; falls back to the key for easier debugging. */
  function t(key, substitutions) {
    try {
      if (chrome.i18n && chrome.i18n.getMessage) {
        return chrome.i18n.getMessage(key, substitutions) || key;
      }
    } catch (err) {
      /* ignore */
    }
    return key;
  }

  function applyI18n() {
    for (const el of document.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n);
    }
    try {
      document.documentElement.lang = (chrome.i18n.getUILanguage() || 'en').replace('_', '-');
    } catch (err) {
      /* ignore */
    }
    document.title = t('appName');
  }

  applyI18n();

  const els = {
    platform: document.getElementById('platform'),
    title: document.getElementById('title'),
    meta: document.getElementById('meta'),
    md: document.getElementById('export-md'),
    json: document.getElementById('export-json'),
    sources: document.getElementById('include-sources'),
    time: document.getElementById('include-time'),
    model: document.getElementById('include-model'),
    roleUser: document.getElementById('role-user'),
    roleAssistant: document.getElementById('role-assistant'),
    status: document.getElementById('status')
  };

  const PREFS = {
    includeSources: true,
    includeTimestamps: true,
    includeModel: true,
    roleUser: 'User',
    roleAssistant: 'Assistant'
  };

  function readMarkdownOptions() {
    return {
      includeSources: els.sources.checked,
      includeTimestamps: els.time.checked,
      includeModel: els.model.checked,
      roleUser: els.roleUser.value.trim() || 'User',
      roleAssistant: els.roleAssistant.value.trim() || 'Assistant'
    };
  }

  function saveMarkdownOptions() {
    try {
      const pending = chrome.storage.local.set(readMarkdownOptions());
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch (err) {
      /* Preferences are best-effort; an export can still proceed. */
    }
  }

  let activeTab = null;
  let busy = false;

  function setStatus(text, kind) {
    els.status.textContent = text || '';
    els.status.className = 'status' + (text ? ` show ${kind || 'info'}` : '');
  }

  function setBusy(value) {
    busy = value;
    els.md.disabled = value || !els.md.dataset.ready;
    els.json.disabled = value || !els.json.dataset.ready;
  }

  function setActiveFormat(format) {
    for (const [name, button] of [['md', els.md], ['json', els.json]]) {
      const active = name === format;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function markReady(ready) {
    els.md.dataset.ready = ready ? '1' : '';
    els.json.dataset.ready = ready ? '1' : '';
    els.md.disabled = !ready || busy;
    els.json.disabled = !ready || busy;
  }

  function setConversation(info) {
    els.platform.hidden = false;
    els.platform.textContent = info.label || info.platform || 'AI';
    els.title.textContent = info.title || t('untitledConversation');
    els.meta.textContent = '';
  }

  function notReady(reason) {
    markReady(false);
    els.platform.hidden = true;
    els.title.textContent = t('notReadyTitle');
    els.meta.textContent = reason || t('notReadyHint');
  }

  async function sendToTab(message) {
    if (!activeTab || typeof activeTab.id !== 'number') {
      throw new Error(t('errorNoTab'));
    }
    try {
      return await chrome.tabs.sendMessage(activeTab.id, message);
    } catch (err) {
      const text = String(err && err.message ? err.message : err);
      if (/Receiving end does not exist|Could not establish connection|message port closed|Cannot access contents|extensions gallery cannot be scripted/i.test(text)) {
        throw new Error(t('errorNoContentScript'));
      }
      throw err;
    }
  }

  async function init() {
    let stored = PREFS;
    try {
      stored = Object.assign({}, PREFS, (await chrome.storage.local.get(PREFS)) || {});
    } catch (err) {
      /* Use defaults when storage is unavailable. */
    }
    els.sources.checked = stored.includeSources !== false;
    els.time.checked = stored.includeTimestamps !== false;
    els.model.checked = stored.includeModel !== false;
    els.roleUser.value = stored.roleUser || PREFS.roleUser;
    els.roleAssistant.value = stored.roleAssistant || PREFS.roleAssistant;

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tabs && tabs[0];
    } catch (err) {
      notReady(err.message || t('errorNoTab'));
      return;
    }

    if (!activeTab) {
      notReady(t('errorNoTab'));
      return;
    }

    try {
      const info = await sendToTab({ type: 'AICE_INFO' });
      if (!info || !info.ok || !info.supported) {
        notReady((info && (info.reason || info.error)) || t('errorUnsupported'));
        return;
      }
      setConversation(info);
      markReady(true);
      setStatus('');
    } catch (err) {
      notReady(err.message);
    }
  }

  async function run(format) {
    if (busy || !els.md.dataset.ready) return;

    setActiveFormat(format);
    setBusy(true);
    setStatus(t('statusReading'), 'info');

    try {
      const result = await sendToTab({
        type: 'AICE_EXPORT',
        format,
        ...readMarkdownOptions()
      });

      if (!result || !result.ok) {
        setStatus((result && (result.error || result.reason)) || t('errorExportFailed'), 'err');
        return;
      }

      const sourceLabel = result.source === 'api' ? t('sourceApi') : t('sourceDom');
      const lines = [
        t('statusExported', [String(result.messageCount), sourceLabel]),
        result.filename
      ];
      if (result.warnings && result.warnings.length) lines.push(result.warnings[0]);

      setStatus(lines.join('\n'), result.source === 'api' ? 'ok' : 'warn');
    } catch (err) {
      setStatus(err.message || String(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  els.md.addEventListener('click', () => run('md'));
  els.json.addEventListener('click', () => run('json'));

  for (const input of [els.sources, els.time, els.model]) {
    input.addEventListener('change', saveMarkdownOptions);
  }

  for (const input of [els.roleUser, els.roleAssistant]) {
    input.addEventListener('change', saveMarkdownOptions);
    input.addEventListener('blur', saveMarkdownOptions);
  }

  init();
})();
