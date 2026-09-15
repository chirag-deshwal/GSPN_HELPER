/**
 * closerContent.js — Closer Helper content script
 * Injects a centered three-button bar on the GSPN Service Order Details page:
 *   [Product ▸]  [Work Type ▸]  [➤ Fill]
 * When the user selects Product + Work Type and clicks Fill, it auto-fills
 * text fields and auto-selects dropdown values on the page (works across iframes).
 */
(function () {
  'use strict';

  const LOG_SOURCE = 'closerContent';

  function formatLogValue(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function publishExtensionLog(level, args) {
    const message = args.map(formatLogValue).join(' ');
    if (!message) return;
    chrome.runtime.sendMessage({
      action: 'extensionLog',
      entry: {
        source: LOG_SOURCE,
        level,
        message,
        timestamp: new Date().toISOString()
      }
    }).catch(() => { });
  }

  ['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
    const original = console[method];
    console[method] = (...args) => {
      publishExtensionLog(method, args);
      if (original) {
        original.apply(console, args);
      }
    };
  });

  const isTopFrame = (window === window.top);
  const NEW_TAB_PREF_KEY = 'openRequestsInNewTab';
  const PAGE_PREF_KEY = '__gspnOpenNewTabEnabled';
  let useNewTabForPopups = false;
  let isGhostModeActive = false;

  function updatePopupRedirectPreference(enabled) {
    useNewTabForPopups = !!enabled;
    try {
      if (typeof window !== 'undefined') {
        window[PAGE_PREF_KEY] = useNewTabForPopups;
        if (typeof window.__gspnSetPopupOpenMode === 'function') {
          window.__gspnSetPopupOpenMode(useNewTabForPopups);
        }
      }
    } catch (error) {
      console.warn('[CloserHelper] Failed to update popup redirect preference', error);
    }
  }

  function installPopupRedirect() {
    if (window.__gspnPopupRedirectInstalled) return;

    const script = document.createElement('script');
    script.textContent = `
      (function() {
        const prefKey = '__gspnOpenNewTabEnabled';
        const originalOpen = window.open.bind(window);

        window.__gspnSetPopupOpenMode = function(enabled) {
          window[prefKey] = !!enabled;
        };

        window.__gspnSetGhostMode = function(enabled) {
          window['__gspnGhostModeEnabled'] = !!enabled;
        };

        window.__gspnSetPopupOpenMode(false);
        window.__gspnSetGhostMode(false);

        function getDialogTitle(url, target) {
          const u = (url || '').toLowerCase();
          const t = (target || '').toLowerCase();
          if (u.includes('customer') || t.includes('customer')) return 'Customer Search';
          if (u.includes('print') || t.includes('print')) return 'Print Service Order Request';
          if (u.includes('detail') || u.includes('svcmain') || t.includes('so_popup')) return 'Service Order Details';
          if (u.includes('serial') || t.includes('serial')) return 'Serial Number Search';
          return 'GSPN Dialog';
        }

        function createInPageModal(url, targetName) {
          const safeTarget = targetName || ('gspn_modal_' + Date.now());
          const existingOverlay = document.getElementById('gspnInPageModalOverlay_' + safeTarget);
          if (existingOverlay) {
            const iframe = existingOverlay.querySelector('iframe');
            if (iframe && url) iframe.src = url;
            existingOverlay.style.display = 'flex';
            return existingOverlay.__fakeWin;
          }

          const isPrint = (url || '').toLowerCase().includes('print') || (targetName || '').toLowerCase().includes('printpop');
          const initialWidth = isPrint ? '95vw' : '90vw';
          const initialMaxWidth = isPrint ? '1240px' : '1040px';
          const initialHeight = isPrint ? '90vh' : '85vh';
          const initialMaxHeight = isPrint ? '860px' : '780px';

          const overlay = document.createElement('div');
          overlay.id = 'gspnInPageModalOverlay_' + safeTarget;
          overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px); z-index: 2147483645; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; font-family: "Segoe UI", Inter, Arial, sans-serif;';

          const modalContainer = document.createElement('div');
          modalContainer.style.cssText = 'width: ' + initialWidth + '; max-width: ' + initialMaxWidth + '; height: ' + initialHeight + '; max-height: ' + initialMaxHeight + '; background: #ffffff; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #cbd5e1; transition: all 0.2s ease;';

          const headerTitle = getDialogTitle(url, targetName);

          modalContainer.innerHTML =
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #ffffff; font-size: 13px; font-weight: 700; user-select: none;">' +
              '<div style="display: flex; align-items: center; gap: 8px;">' +
                '<span style="font-size: 15px;">📋</span>' +
                '<span>' + headerTitle + '</span>' +
              '</div>' +
              '<div style="display: flex; align-items: center; gap: 6px;">' +
                '<button type="button" class="gspn-modal-max-btn" style="background: rgba(255,255,255,0.15); border: none; color: white; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center;" title="Maximize/Restore">🗖</button>' +
                '<button type="button" class="gspn-modal-close-btn" style="background: rgba(239,68,68,0.85); border: none; color: white; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px; display: flex; align-items: center; justify-content: center;" title="Close">×</button>' +
              '</div>' +
            '</div>' +
            '<div style="flex: 1; width: 100%; height: 100%; position: relative; background: #f8fafc;">' +
              '<iframe name="' + safeTarget + '" id="gspnModalIframe_' + safeTarget + '" style="width: 100%; height: 100%; border: none; display: block;"' + (url ? ' src="' + url + '"' : '') + '></iframe>' +
            '</div>';

          overlay.appendChild(modalContainer);
          document.body.appendChild(overlay);

          let isMaximized = false;
          const maxBtn = modalContainer.querySelector('.gspn-modal-max-btn');
          maxBtn.addEventListener('click', () => {
            if (isMaximized) {
              modalContainer.style.width = initialWidth;
              modalContainer.style.height = initialHeight;
              modalContainer.style.maxWidth = initialMaxWidth;
              modalContainer.style.maxHeight = initialMaxHeight;
              modalContainer.style.borderRadius = '14px';
              isMaximized = false;
            } else {
              modalContainer.style.width = '100vw';
              modalContainer.style.height = '100vh';
              modalContainer.style.maxWidth = '100vw';
              modalContainer.style.maxHeight = '100vh';
              modalContainer.style.borderRadius = '0px';
              isMaximized = true;
            }
          });

          let fakeWin = {
            closed: false,
            focus: function() {
              overlay.style.display = 'flex';
            },
            close: function() {
              this.closed = true;
              overlay.remove();
            },
            location: {
              set href(v) {
                const iframe = modalContainer.querySelector('iframe');
                if (iframe) iframe.src = v;
              },
              get href() {
                const iframe = modalContainer.querySelector('iframe');
                return iframe ? iframe.src : '';
              }
            }
          };

          const closeBtn = modalContainer.querySelector('.gspn-modal-close-btn');
          closeBtn.addEventListener('click', () => fakeWin.close());

          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) fakeWin.close();
          });

          overlay.__fakeWin = fakeWin;
          return fakeWin;
        }

        window.open = function(url, target, features) {
          const normalizedTarget = (target || '').toString().toLowerCase();
          const normalizedUrl = (url || '').toString();
          const looksLikePopup = !!features ||
            normalizedTarget === '_popup' ||
            normalizedTarget.includes('popup') ||
            normalizedTarget.includes('request') ||
            normalizedTarget.includes('new') ||
            normalizedTarget.includes('so_popup') ||
            normalizedTarget.includes('printpop') ||
            normalizedTarget.includes('customer') ||
            normalizedUrl.includes('request') ||
            normalizedUrl.includes('customer') ||
            normalizedUrl.includes('print') ||
            normalizedUrl.includes('detail');

          if (window['__gspnGhostModeEnabled'] || window[prefKey]) {
            return originalOpen(url, target, features);
          }

          if (looksLikePopup || normalizedTarget === '_blank') {
            return createInPageModal(url, target);
          }

          return originalOpen(url, target, features);
        };

        window.__gspnPopupRedirectInstalledInPage = true;
      })();
    `;

    const parentNode = document.head || document.documentElement || document.body;
    if (parentNode) {
      parentNode.appendChild(script);
      script.remove();
    }

    window.__gspnPopupRedirectInstalled = true;
  }

  function syncPopupTabPreference() {
    chrome.storage.local.get(NEW_TAB_PREF_KEY, (data) => {
      updatePopupRedirectPreference(data[NEW_TAB_PREF_KEY]);
    });
  }

  installPopupRedirect();
  syncPopupTabPreference();

  // Inject a small page stylesheet so the injected button matches extension theme
  function injectConsumerButtonStyle() {
    try {
      if (document.getElementById('gspnCustomBtnStyle')) return;
      const style = document.createElement('style');
      style.id = 'gspnCustomBtnStyle';
      style.textContent = `
        .gspn-helper-panel {
          display: inline-flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px 12px;
          margin-left: 8px;
          background: rgba(79, 70, 229, 0.12);
          border: 1px solid rgba(124, 58, 237, 0.2);
          border-radius: 14px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
          color: #eef2ff;
          font-size: 12px;
          min-width: 180px;
        }
        .gspn-helper-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .gspn-helper-title {
          font-weight: 700;
          color: #eef2ff;
          letter-spacing: 0.15px;
        }
        .gspn-toggle-group {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }
        .gspn-toggle-group input {
          opacity: 0;
          width: 0;
          height: 0;
          position: absolute;
        }
        .gspn-toggle-slider {
          width: 36px;
          height: 18px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.22);
          position: relative;
          transition: background 0.25s;
        }
        .gspn-toggle-slider::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: #fff;
          transition: transform 0.25s;
        }
        .gspn-toggle-group input:checked + .gspn-toggle-slider {
          background: linear-gradient(135deg, #7c3aed, #6366f1);
        }
        .gspn-toggle-group input:checked + .gspn-toggle-slider::after {
          transform: translateX(18px);
        }
        .gspn-toggle-text {
          color: #c7d2fe;
          font-size: 11px;
          font-weight: 600;
        }
        .gspn-button-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .gspn-btn {
          flex: 1 1 auto;
          min-width: 70px;
          border: none;
          border-radius: 999px;
          padding: 8px 12px;
          color: #ffffff;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          font-weight: 700;
          letter-spacing: 0.1px;
          cursor: pointer;
          transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
        }
        .gspn-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }
        .gspn-btn:active {
          transform: translateY(0);
        }
        .gspn-secondary-btn {
          background: rgba(255, 255, 255, 0.12);
          color: #e0e7ff;
          box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.18);
        }
        .gspn-helper-fragment {
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          color: #c7d2fe;
          font-size: 11px;
          line-height: 1.4;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch (err) {
      console.warn('[CloserHelper] Failed to inject button style', err);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (Object.prototype.hasOwnProperty.call(changes, NEW_TAB_PREF_KEY)) {
        updatePopupRedirectPreference(changes[NEW_TAB_PREF_KEY].newValue);
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'ghostModeEnabled')) {
        updateGhostMode(!!changes.ghostModeEnabled.newValue);
      }
    }
  });

  function updateGhostMode(isGhost) {
    isGhostModeActive = !!isGhost;
    try {
      if (typeof window !== 'undefined') {
        window['__gspnGhostModeEnabled'] = isGhostModeActive;
        if (typeof window.__gspnSetGhostMode === 'function') {
          window.__gspnSetGhostMode(isGhostModeActive);
        }
      }
    } catch (e) {}

    if (isGhostModeActive) {
      const panel = document.getElementById('closerHelperPanel');
      if (panel) panel.remove();
      const styleEl = document.getElementById('closerHelperStyle');
      if (styleEl) styleEl.remove();

      const gspnPanel = document.getElementById('gspnHelperPanel');
      if (gspnPanel) gspnPanel.remove();

      document.querySelectorAll('[id^="gspnInPageModalOverlay_"]').forEach(el => el.remove());
      document.querySelectorAll('.gspn-open-new-tab-cell').forEach(el => el.remove());
    } else {
      if (isTopFrame) {
        chrome.storage.local.get(['closerHelperEnabled'], (d) => {
          if (d.closerHelperEnabled !== false) {
            injectPanel();
          }
        });
      }
      injectConsumerChangeButton();
      injectOpenNewTabPrintButton();
    }
  }

  /* ========================================================================
   *  PART 1 — INJECT CUSTOMER SEARCH PANEL (run before top-frame return)
   * ======================================================================== */
  function injectConsumerChangeButton() {
    if (isGhostModeActive) return;
    injectConsumerButtonStyle();
    const consumerInput = document.getElementById('CONSUMER')
      || document.querySelector('input[name="CONSUMER"]')
      || document.querySelector('input[id*="CONSUMER" i]')
      || document.querySelector('input[name*="consumer" i]')
      || document.querySelector('input[placeholder*="customer" i]')
      || document.querySelector('input[id*="customer" i]')
      || document.querySelector('input[aria-label*="customer" i]');
    if (!consumerInput) return;

    if (document.getElementById('gspnHelperPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'gspnHelperPanel';
    panel.className = 'gspn-helper-panel';
    panel.innerHTML = `
      <div class="gspn-helper-top">
        <span class="gspn-helper-title">Search Tools</span>
        <label class="gspn-toggle-group">
          <input type="checkbox" id="gspnFeatureToggle" />
          <span class="gspn-toggle-slider"></span>
          <span class="gspn-toggle-text">Feature</span>
        </label>
      </div>
      <div class="gspn-button-row">
        <button type="button" class="gspn-btn" id="customConsumerSearchBtn">[search]</button>
        <button type="button" class="gspn-btn gspn-secondary-btn" id="customConsumerMoveBtn">Move</button>
      </div>
      <div class="gspn-helper-fragment" id="gspnHelperFragment">Ready to search customer.</div>
    `;

    function setFragment(text) {
      const frag = panel.querySelector('#gspnHelperFragment');
      if (frag) frag.textContent = text;
    }

    panel.addEventListener('click', (event) => {
      if (event.target.id === 'customConsumerSearchBtn') {
        setFragment('Opening customer search...');
        try {
          if (typeof openCustomerSearchPop === 'function') {
            openCustomerSearchPop();
          } else if (typeof window.openCustomerSearchPop === 'function') {
            window.openCustomerSearchPop();
          } else {
            throw new Error('openCustomerSearchPop not defined');
          }
        } catch (err) {
          console.warn('[CloserHelper] openCustomerSearchPop unavailable', err);
          setFragment('Search action failed.');
        }
      }
      if (event.target.id === 'customConsumerMoveBtn') {
        setFragment('Moving focus to customer field...');
        consumerInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
        consumerInput.focus({ preventScroll: true });
      }
    });

    panel.querySelector('#gspnFeatureToggle')?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      setFragment(enabled ? 'Advanced feature enabled.' : 'Feature disabled.');
    });

    const attachTarget = consumerInput.closest('td, th, tr, div, form') || consumerInput.parentNode || document.body;
    if (attachTarget && attachTarget.parentNode) {
      attachTarget.parentNode.insertBefore(panel, attachTarget.nextSibling);
    } else {
      document.body.appendChild(panel);
    }
  }

  function injectOpenNewTabPrintButton() {
    if (isGhostModeActive) return;
    if (!document.getElementById('gspnOpenNewTabScriptInjected')) {
      const script = document.createElement('script');
      script.id = 'gspnOpenNewTabScriptInjected';
      script.textContent = `
        if (typeof window.siel_eng_print_new_tab !== 'function') {
          window.siel_eng_print_new_tab = function() {
            var sheetNo = document.getElementsByName('print_id');
            var paramSoNo = "";
            for (var i = 0; i < sheetNo.length; i++) {
              if (sheetNo[i].checked) paramSoNo += "&objectId=" + sheetNo[i].value;
            }
            window.openSvcRequestPrintNewTab(paramSoNo);
          };
        }
        if (typeof window.openSvcRequestPrintNewTab !== 'function') {
          window.openSvcRequestPrintNewTab = function(paramSoNo) {
            var url = "";
            var targetId = "_blank";
            var print_type = "SIEL_ENG";
            var ascCodeEl = document.getElementById('asc_code');
            var ascCode = ascCodeEl ? ascCodeEl.value : '';
            var pattern = (typeof urlPatternGZIP !== 'undefined') ? urlPatternGZIP : '/gspn/operate.do';
            url = pattern + "?print_type=" + print_type + "&ascCode=" + ascCode;
            url += "&cmd=ServiceRequestMultiPrintCmd";
            url += paramSoNo;
            var w = window.open(url, targetId);
            if (w) w.focus();
          };
        }
      `;
      const parentNode = document.head || document.documentElement || document.body;
      if (parentNode) {
        parentNode.appendChild(script);
        script.remove();
      }
    }

    const printLinks = document.querySelectorAll('a[href*="siel_eng_print"], a[href*="openSvcRequestPrintPop"]');
    printLinks.forEach((link) => {
      if (link.textContent.includes('OPEN NEW TAB') || (link.href && link.href.includes('siel_eng_print_new_tab'))) return;
      const printTd = link.closest('td.btn_pad') || link.closest('td');
      if (!printTd || !printTd.parentNode) return;
      if (printTd.parentNode.querySelector('.gspn-open-new-tab-cell')) return;

      const newTd = printTd.cloneNode(true);
      newTd.classList.add('gspn-open-new-tab-cell');
      const newLink = newTd.querySelector('a');
      if (newLink) {
        newLink.textContent = 'OPEN NEW TAB';
        newLink.href = 'javascript:siel_eng_print_new_tab();';
      }
      printTd.parentNode.insertBefore(newTd, printTd);
    });
  }

  chrome.storage.local.get(['ghostModeEnabled', NEW_TAB_PREF_KEY], (data) => {
    isGhostModeActive = !!data.ghostModeEnabled;
    updatePopupRedirectPreference(data[NEW_TAB_PREF_KEY]);
    if (isGhostModeActive) {
      updateGhostMode(true);
    } else {
      injectConsumerChangeButton();
      injectOpenNewTabPrintButton();
    }
  });

  if (document.body) {
    const observer = new MutationObserver(() => {
      if (isGhostModeActive) return;
      if (document.getElementById('CONSUMER') && !document.getElementById('gspnHelperPanel')) {
        injectConsumerChangeButton();
      }
      injectOpenNewTabPrintButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ========================================================================
   *  PART 2 — TOP FRAME: inject floating Closer Helper bar (if enabled)
   * ======================================================================== */
  if (isTopFrame) {
    const initPanel = () => {
      chrome.storage.local.get(['closerHelperEnabled', 'ghostModeEnabled'], (data) => {
        isGhostModeActive = !!data.ghostModeEnabled;
        if (isGhostModeActive) return;
        const enabled = data.closerHelperEnabled !== false;
        if (enabled) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectPanel);
          } else {
            injectPanel();
          }
          setTimeout(injectPanel, 500);
          setTimeout(injectPanel, 1500);
        }
      });
    };

    initPanel();

    // Listen for toggle changes from popup (live enable/disable)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (Object.prototype.hasOwnProperty.call(changes, 'ghostModeEnabled')) {
          updateGhostMode(!!changes.ghostModeEnabled.newValue);
        }
        if (changes.closerHelperEnabled) {
          if (isGhostModeActive) return;
          const enabled = changes.closerHelperEnabled.newValue !== false;
          const existing = document.getElementById('closerHelperPanel');
          if (enabled && !existing) {
            injectPanel();
          } else if (!enabled && existing) {
            existing.remove();
            const styleEl = document.getElementById('closerHelperStyle');
            if (styleEl) styleEl.remove();
          }
        }
      }
    });
    return;
  }

  /* ========================================================================
   *  PART 3 — INNER FRAME: listen for fill commands from the top frame
   * ======================================================================== */
  window.addEventListener('message', (e) => {
    if (isGhostModeActive) return;
    if (e.data && e.data.type === 'CLOSER_HELPER_FILL') {
      applyPreset(e.data.preset);
    }
  });

  function applyPreset(preset) {
    if (!preset) return;
    const LOG = '[CloserHelper:IFRAME]';
    console.log(`${LOG} ▶ applyPreset called in frame: ${window.location.href}`);
    const fm = preset.fieldMap || {};

    function findEl(idOrName) {
      const el = document.getElementById(idOrName)
        || document.querySelector(`[name="${idOrName}"]`)
        || document.querySelector(`[id*="${idOrName}" i]`)
        || document.querySelector(`[name*="${idOrName}" i]`);
      console.log(`${LOG}   findEl('${idOrName}') → ${el ? `FOUND <${el.tagName} id=${el.id}>` : 'NOT FOUND'}`);
      return el;
    }

    /* ── Inject script into PAGE context ── */
    function firePageScript(code) {
      const s = document.createElement('script');
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    }

    /* ── Simulate real user typing into text/textarea ── */
    function setTextValue(fieldKey, value) {
      if (!value) return false;
      const el = findEl(fieldKey);
      if (!el) return false;
      const wasRO = el.readOnly;
      if (wasRO) el.readOnly = false;

      el.focus();
      el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      el.value = '';
      if (el.tagName === 'TEXTAREA') el.textContent = value;
      el.value = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      el.blur();

      if (wasRO) el.readOnly = true;
      console.log(`${LOG}   ✅ TEXT '${fieldKey}' = '${value.substring(0, 40)}...'`);
      return true;
    }

    /* ── Simulate real user selecting from dropdown ── */
    function setSelectValue(fieldKey, code) {
      if (!code) return false;
      const el = findEl(fieldKey);
      if (!el || el.tagName !== 'SELECT') return false;
      const codeLower = code.toLowerCase().trim();
      console.log(`${LOG}   SELECT '${fieldKey}' searching '${code}' in ${el.options.length} opts`);

      // Helper to select and fire events
      function pickOption(idx) {
        const opt = el.options[idx];
        el.focus();
        el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.selectedIndex = idx;
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        el.blur();
        firePageScript(`(function(){
          var el=document.getElementById('${el.id}');
          if(el && el.onchange) { el.onchange(); console.log('[CloserHelper:PAGE] ✅ #${el.id} onchange fired'); }
        })()`);
        console.log(`${LOG}   ✅ SELECT '${fieldKey}' → opt[${idx}] val='${opt.value}'`);
        return true;
      }

      // Pass 1: Exact match on value or text
      for (let i = 0; i < el.options.length; i++) {
        const v = el.options[i].value.toLowerCase().trim();
        const t = el.options[i].text.toLowerCase().trim();
        if (v === codeLower || t === codeLower) return pickOption(i);
      }
      // Pass 2: Partial includes match (only for codes >= 3 chars to avoid false positives)
      if (codeLower.length >= 3) {
        for (let i = 0; i < el.options.length; i++) {
          const v = el.options[i].value.toLowerCase();
          const t = el.options[i].text.toLowerCase();
          if (v.includes(codeLower) || t.includes(codeLower)) return pickOption(i);
        }
      }
      console.log(`${LOG}   ❌ SELECT '${fieldKey}' — NO MATCH for '${code}'`);
      return false;
    }

    function tryText(m, g, v) { if (!m || !setTextValue(m, v)) setTextValue(g, v); }
    function trySelect(m, g, c) { if (!m || !setSelectValue(m, c)) setSelectValue(g, c); }

    /* ══ Queue operations with human-like staggered delays ══ */
    const ops = [];
    function q(fn) { ops.push(fn); }

    q(() => tryText(fm.repairDetail, 'REPAIRDESC_L', preset.repairDetailDesc));
    q(() => setTextValue('REPAIR_DESC', preset.repairDetailDesc));
    q(() => tryText(fm.defectDetail, 'DEFECTDESC_L', preset.defectDetailDesc));
    q(() => setTextValue('DEFECT_DESC', preset.defectDetailDesc));
    q(() => tryText(fm.statusComment, 'STATUS_COMMENT', preset.statusComment));
    q(() => tryText(fm.remark, 'REMARK', preset.remark));
    q(() => tryText(fm.editText, 'EDITEXT', preset.editText || preset.repairDetailDesc));
    q(() => trySelect(fm.defectBlock, 'DEF_BLK', preset.defectBlock));
    q(() => trySelect(fm.condition, 'IRIS_CONDI', preset.conditionCode));
    q(() => trySelect(fm.defectType, 'LAB_TYPE', preset.defectType));
    q(() => trySelect(fm.reasonCode, 'REASON', preset.reasonCode));
    q(() => trySelect(fm.defectCode, 'IRIS_DEFECT', preset.defectCode));
    q(() => { if (preset.symptomQCode) setSelectValue('IRIS_SYMPT_QCODE', preset.symptomQCode); });
    q(() => { if (preset.repairQCode) setSelectValue('IRIS_REPAIR_QCODE', preset.repairQCode); });

    console.log(`${LOG} ── Running ${ops.length} ops...`);
    let delay = 0;
    ops.forEach((fn, i) => {
      setTimeout(() => { console.log(`${LOG} step ${i + 1}/${ops.length}`); fn(); }, delay);
      delay += 30 + Math.floor(Math.random() * 50);
    });

    // After all + AJAX wait → set dependent sub-codes
    setTimeout(() => {
      console.log(`${LOG} ── Sub-codes after AJAX...`);
      trySelect(fm.symptom, 'IRIS_SYMPT', preset.symptomCode);
      setTimeout(() => {
        trySelect(fm.repairCode, 'IRIS_REPAIR', preset.repairCode);
        console.log(`${LOG} ✅ COMPLETE`);
        window.top.postMessage({ type: 'CLOSER_HELPER_DONE', success: true }, '*');
      }, 80 + Math.floor(Math.random() * 50));
    }, delay + 800);
  }


  /* ========================================================================
   *  PANEL INJECTION (top frame only) — Three-Button Centered Bar
   * ======================================================================== */
  function injectPanel() {
    const headEl = document.head || document.documentElement;
    const bodyEl = document.body || document.documentElement;

    if (!headEl || !bodyEl) {
      setTimeout(injectPanel, 100);
      return;
    }

    /* ─── Styles ─── */
    if (!document.getElementById('closerHelperStyle')) {
      const style = document.createElement('style');
      style.id = 'closerHelperStyle';
      style.textContent = `
        /* ── Main floating dock bar container (White/Light Theme) ── */
        #closerHelperPanel {
          position: fixed;
          bottom: 22px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483640;
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', Roboto, sans-serif;
          font-size: 13.5px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 999px;
          box-shadow: 
            0 16px 40px rgba(15, 23, 42, 0.14),
            0 4px 12px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 1);
          animation: chBarSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes chBarSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(28px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }

        /* ── Shared button base (White Theme) ── */
        .ch-bar-btn {
          all: unset;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 18px;
          height: 38px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #1e293b;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.15px;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          white-space: nowrap;
          position: relative;
          box-sizing: border-box;
          justify-content: center;
        }
        .ch-bar-btn:hover {
          background: #ffffff;
          border-color: #cbd5e1;
          color: #0f172a;
          transform: translateY(-1.5px);
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
        }
        .ch-bar-btn:active {
          transform: translateY(0) scale(0.98);
        }
        .ch-bar-btn.ch-selected {
          background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%);
          border-color: #818cf8;
          color: #3730a3;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.18);
        }

        /* Fill Button Styling */
        #chBtnFill {
          min-width: 44px;
          padding: 9px 16px;
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #64748b;
        }
        .ch-bar-btn.ch-fill-ready {
          background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
          border-color: #2563eb;
          color: #ffffff;
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35);
        }
        .ch-bar-btn.ch-fill-ready:hover {
          background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.48);
          transform: translateY(-2px) scale(1.03);
        }
        .ch-bar-btn.ch-fill-success {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          border-color: #059669;
          color: #ffffff;
          box-shadow: 0 6px 22px rgba(16, 185, 129, 0.4);
          animation: chPulse 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes chPulse {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }

        /* ── Icon inside button ── */
        .ch-bar-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          color: inherit;
          opacity: 0.85;
          transition: opacity 0.18s ease;
        }
        .ch-bar-btn:hover .ch-bar-icon {
          opacity: 1;
        }
        .ch-bar-icon svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
        }

        /* ── Dropdown menu (White Theme) ── */
        .ch-dropdown {
          position: absolute;
          bottom: calc(100% + 12px);
          left: 50%;
          transform: translateX(-50%);
          min-width: 250px;
          max-width: 330px;
          max-height: 340px;
          overflow-y: auto;
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 18px;
          box-shadow: 
            0 20px 48px rgba(15, 23, 42, 0.16),
            0 8px 24px rgba(15, 23, 42, 0.08);
          z-index: 2147483641;
          animation: chDropOpen 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          padding: 6px;
          box-sizing: border-box;
        }
        @keyframes chDropOpen {
          from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.94); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        .ch-dropdown-item {
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          transition: all 0.18s ease;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 2px;
        }
        .ch-dropdown-item:last-child {
          margin-bottom: 0;
        }
        .ch-dropdown-item:hover {
          background: #f1f5f9;
          color: #0f172a;
          transform: translateX(3px);
        }
        .ch-dropdown-item.ch-active {
          background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%);
          color: #3730a3;
          font-weight: 700;
          border: 1px solid #a5b4fc;
        }
        .ch-dropdown-item .ch-check {
          width: 16px;
          text-align: center;
          font-size: 13px;
          font-weight: bold;
        }
        .ch-dropdown-empty {
          padding: 16px;
          color: #64748b;
          font-size: 12.5px;
          text-align: center;
        }
        .ch-dropdown-settings {
          padding: 10px 12px;
          border-top: 1px solid #e2e8f0;
          margin-top: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .ch-dropdown-settings a {
          color: #4f46e5;
          font-size: 12px;
          text-decoration: none;
          font-weight: 600;
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .ch-dropdown-settings a:hover {
          color: #3730a3;
        }

        /* ── Toast ── */
        .ch-toast-msg {
          position: fixed;
          bottom: 84px;
          left: 50%;
          transform: translateX(-50%);
          background: #059669;
          color: #ffffff;
          padding: 11px 24px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.15px;
          box-shadow: 0 10px 30px rgba(5, 150, 105, 0.35);
          z-index: 2147483641;
          animation: chToastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', Roboto, sans-serif;
        }
        @keyframes chToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(14px) scale(0.9); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }

        /* ── Click-away overlay ── */
        .ch-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483639;
          background: transparent;
        }
      `;
      headEl.appendChild(style);
    }

    /* ─── Panel container ─── */
    let panel = document.getElementById('closerHelperPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'closerHelperPanel';
      bodyEl.appendChild(panel);
    }
    if (panel.dataset.chInitialized === 'true') return;
    panel.dataset.chInitialized = 'true';

    let presets = [];
    let productConfig = {};       // loaded from products_keys.json
    let selectedProduct = null;   // product key e.g. 'AC'
    let selectedWorkType = null;  // work type key e.g. 'installation'
    let selectedPreset = null;    // active user preset object
    let activeDropdown = null;    // 'product' | 'work' | 'preset' | null

    buildBar();
    loadProductConfig();
    loadPresets();

    /* ─── Load product config from JSON ─── */
    function loadProductConfig() {
      const url = chrome.runtime.getURL('webpage_source/src/products_keys.json');
      fetch(url).then(r => r.json()).then(data => {
        productConfig = data.products || {};
        console.log('[CloserHelper] Loaded product config:', Object.keys(productConfig));
        buildBar();
      }).catch(e => console.error('[CloserHelper] Failed to load products_keys.json:', e));
    }

    function loadPresets() {
      chrome.storage.local.get('closerPresets', (data) => {
        presets = data.closerPresets || [];
        buildBar();
      });
    }

    function getWorkTypeLabel(code, defaultLabel) {
      const codeUpper = (code || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (codeUpper === 'INSTALLATION' || defaultLabel === 'Installation') return 'Installation (II)';
      if (codeUpper === 'REPAIR' || defaultLabel === 'Repair') return 'Repair (IH)';
      if (codeUpper.includes('CUSTOMERCARE') || defaultLabel === 'Customer Care') return 'Customer Care (CC)';
      if (codeUpper.includes('DEMONSTRATION') || codeUpper === 'DEMO' || defaultLabel === 'Demonstration') return 'Demonstration (DM)';
      if (codeUpper.includes('STOCKREPAIR') || defaultLabel === 'Stock Repair') return 'Stock Repair (SR)';
      return defaultLabel || code;
    }

    const UNIVERSAL_WORK_TYPES = [
      { code: 'installation', label: 'Installation (II)' },
      { code: 'repair', label: 'Repair (IH)' },
      { code: 'customer_care', label: 'Customer Care (CC)' },
      { code: 'demonstration', label: 'Demonstration (DM)' },
      { code: 'stock_repair', label: 'Stock Repair (SR)' }
    ];

    /* ─── Get work types for selected product ─── */
    function getWorkTypes() {
      if (!selectedProduct) return [];
      const wt = (productConfig[selectedProduct] && productConfig[selectedProduct].workTypes) ? productConfig[selectedProduct].workTypes : {};

      const list = UNIVERSAL_WORK_TYPES.map(item => ({ ...item }));

      // Append any additional product-specific work types from JSON if not present
      Object.keys(wt).forEach(key => {
        if (!list.some(item => item.code === key)) {
          list.push({
            code: key,
            label: getWorkTypeLabel(key, wt[key].label)
          });
        }
      });
      return list;
    }

    /* ─── Build the four-button bar ─── */
    function buildBar() {
      closeDropdowns();

      const productDef = productConfig[selectedProduct];
      const productLabel = productDef ? `${selectedProduct} — ${productDef.label}` : 'Product';
      const workTypes = getWorkTypes();
      const workObj = workTypes.find(w => w.code === selectedWorkType);
      const workLabel = workObj ? workObj.label : 'Work Type';
      const presetLabel = selectedPreset ? selectedPreset.name : 'Presets';

      const isFillReady = selectedProduct && selectedWorkType;

      panel.innerHTML = `
        <button class="ch-bar-btn ${selectedProduct ? 'ch-selected' : ''}" id="chBtnProduct" title="Select Product">
          <span>${escapeHtml(productLabel)}</span>
          <span class="ch-bar-icon">
            <svg viewBox="0 0 24 24"><path d="M13.6 4.2c-.2-.5-.4-.7-.7-.7-.3 0-.5.2-.7.7L9.8 9.5l-5.6.5c-.5 0-.8.2-.9.5-.1.3 0 .6.4.9l4.2 3.6-1.3 5.5c-.1.5 0 .8.3 1 .2.1.5.1.9-.1l4.8-2.9 4.8 2.9c.4.2.7.2.9.1.3-.2.4-.5.3-1l-1.3-5.5 4.2-3.6c.4-.3.5-.6.4-.9-.1-.3-.4-.5-.9-.5l-5.6-.5-2.4-5.3z"/></svg>
          </span>
        </button>
        <button class="ch-bar-btn ${selectedWorkType ? 'ch-selected' : ''}" id="chBtnWork" title="Select Work Type">
          <span>${escapeHtml(workLabel)}</span>
          <span class="ch-bar-icon">
            <svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.03 7.03 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.05.24.26.42.49.42h4c.24 0 .44-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1a.5.5 0 0 0 .61-.22l2-3.46a.49.49 0 0 0-.12-.64l-2.11-1.65z"/></svg>
          </span>
        </button>
        <button class="ch-bar-btn ${selectedPreset ? 'ch-selected' : ''}" id="chBtnPreset" title="Select Saved Preset">
          <span>${escapeHtml(presetLabel)}</span>
          <span class="ch-bar-icon">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          </span>
        </button>
        <button class="ch-bar-btn ${isFillReady ? 'ch-fill-ready' : ''}" id="chBtnFill" title="Apply Autofill">
          <span class="ch-bar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 6 15 12 9 18"/>
            </svg>
          </span>
        </button>
      `;

      // Event listeners
      document.getElementById('chBtnProduct').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('product');
      });
      document.getElementById('chBtnWork').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('work');
      });
      document.getElementById('chBtnPreset').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('preset');
      });
      document.getElementById('chBtnFill').addEventListener('click', (e) => {
        e.stopPropagation();
        handleFill();
      });
    }

    /* ─── Toggle dropdown ─── */
    function toggleDropdown(which) {
      if (activeDropdown === which) {
        closeDropdowns();
        return;
      }
      closeDropdowns();
      activeDropdown = which;

      let btn = document.getElementById('chBtnProduct');
      if (which === 'work') btn = document.getElementById('chBtnWork');
      if (which === 'preset') btn = document.getElementById('chBtnPreset');

      const dropdown = document.createElement('div');
      dropdown.className = 'ch-dropdown';
      dropdown.id = 'chActiveDropdown';

      if (which === 'product') {
        const productKeys = Object.keys(productConfig);
        if (productKeys.length === 0) {
          dropdown.innerHTML = `
            <div class="ch-dropdown-empty">No products loaded.<br>Check products_keys.json</div>
            <div class="ch-dropdown-settings">
              <a id="chDdSettings">⚙ Manage</a>
            </div>
          `;
        } else {
          dropdown.innerHTML = productKeys.map(key => {
            const p = productConfig[key];
            return `
            <div class="ch-dropdown-item ${key === selectedProduct ? 'ch-active' : ''}" data-id="${key}">
              <span class="ch-check">${key === selectedProduct ? '✓' : ''}</span>
              ${escapeHtml(key)} — ${escapeHtml(p.label)}
            </div>`;
          }).join('') + `
            <div class="ch-dropdown-settings">
              <a id="chDdSettings">⚙ Manage</a>
            </div>
          `;
        }
      } else if (which === 'work') {
        const workTypes = getWorkTypes();
        if (workTypes.length === 0) {
          dropdown.innerHTML = `
            <div class="ch-dropdown-empty">Select a Product first</div>
          `;
        } else {
          dropdown.innerHTML = workTypes.map(w => `
            <div class="ch-dropdown-item ${w.code === selectedWorkType ? 'ch-active' : ''}" data-code="${w.code}">
              <span class="ch-check">${w.code === selectedWorkType ? '✓' : ''}</span>
              ${escapeHtml(w.label)}
            </div>
          `).join('') + `
            <div class="ch-dropdown-settings">
              <a id="chDdSettings">⚙ Manage</a>
            </div>
          `;
        }
      } else if (which === 'preset') {
        let matchingPresets = presets;
        if (selectedProduct) {
          matchingPresets = presets.filter(p => p.product === selectedProduct);
        }
        if (matchingPresets.length === 0) {
          dropdown.innerHTML = `
            <div class="ch-dropdown-empty">
              ${selectedProduct ? `No presets for ${escapeHtml(selectedProduct)}` : 'No presets created yet'}<br>
              <span style="font-size:11px; color:#64748b;">Create presets in Settings</span>
            </div>
            <div class="ch-dropdown-settings">
              <a id="chDdSettings">⚙ Manage</a>
              <span style="opacity:0.35; color:#94a3b8; margin:0 4px;">|</span>
              <a id="chDdCopyJson" title="Extract and download focused SO details as Preset JSON">📋 COPY</a>
            </div>
          `;
        } else {
          dropdown.innerHTML = matchingPresets.map(p => {
            const isAct = selectedPreset && selectedPreset.id === p.id;
            return `
            <div class="ch-dropdown-item ${isAct ? 'ch-active' : ''}" data-preset-id="${p.id}">
              <span class="ch-check">${isAct ? '✓' : ''}</span>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-weight:600; color:#0f172a;">${escapeHtml(p.name)}</span>
                <span style="font-size:11px; color:#64748b;">${escapeHtml(p.product || 'All')} • ${escapeHtml(getWorkTypeLabel(p.workType, p.workType))}</span>
              </div>
            </div>`;
          }).join('') + `
            <div class="ch-dropdown-settings">
              <a id="chDdSettings">⚙ Manage</a>
              <span style="opacity:0.35; color:#94a3b8; margin:0 4px;">|</span>
              <a id="chDdCopyJson" title="Extract and download focused SO details as Preset JSON">📋 COPY</a>
            </div>
          `;
        }
      }

      btn.style.position = 'relative';
      btn.appendChild(dropdown);

      // Click-away overlay
      const overlay = document.createElement('div');
      overlay.className = 'ch-overlay';
      overlay.id = 'chOverlay';
      overlay.addEventListener('click', () => closeDropdowns());
      document.body.appendChild(overlay);

      // Item click handlers
      dropdown.querySelectorAll('.ch-dropdown-item').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (which === 'product') {
            selectedProduct = el.dataset.id;
            selectedWorkType = null; // reset work type when product changes
            selectedPreset = null;
          } else if (which === 'work') {
            selectedWorkType = el.dataset.code;
            selectedPreset = null;
          } else if (which === 'preset') {
            const presetId = el.dataset.presetId;
            const foundPreset = presets.find(p => p.id === presetId);
            if (foundPreset) {
              selectedPreset = foundPreset;
              selectedProduct = foundPreset.product || selectedProduct;
              selectedWorkType = foundPreset.workType || selectedWorkType;
              closeDropdowns();
              buildBar();
              handleFill(foundPreset);
              return;
            }
          }
          closeDropdowns();
          buildBar();
        });
      });

      // Settings link
      const settingsLink = dropdown.querySelector('#chDdSettings');
      if (settingsLink) {
        settingsLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          chrome.runtime.sendMessage({ action: 'openCloserSettings' });
        });
      }

      // Copy JSON link
      const copyJsonLink = dropdown.querySelector('#chDdCopyJson');
      if (copyJsonLink) {
        copyJsonLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeDropdowns();
          extractCurrentSoPreset();
        });
      }
    }

    /* ─── Close dropdowns ─── */
    function closeDropdowns() {
      activeDropdown = null;
      const dd = document.getElementById('chActiveDropdown');
      if (dd) dd.remove();
      const ov = document.getElementById('chOverlay');
      if (ov) ov.remove();
    }

    /* ─── Handle Fill ─── */
    function handleFill(explicitPreset) {
      const targetProduct = explicitPreset?.product || selectedProduct;
      const targetWorkType = explicitPreset?.workType || selectedWorkType;

      if (!targetProduct) {
        showToast('⚠ Select a Product first!', true);
        return;
      }
      if (!targetWorkType) {
        showToast('⚠ Select a Work Type first!', true);
        return;
      }

      // Priority 1: Explicitly passed preset or active selectedPreset matching criteria
      let preset = explicitPreset;
      if (!preset && selectedPreset && selectedPreset.product === targetProduct && selectedPreset.workType === targetWorkType) {
        preset = selectedPreset;
      }

      // Priority 2: Find preset created in settings matching product + workType
      if (!preset) {
        preset = presets.find(p => p.product === targetProduct && p.workType === targetWorkType);
      }

      // Strict check: If preset is NOT available, show "Preset is NA" error toast!
      if (!preset) {
        const wtLabel = getWorkTypeLabel(targetWorkType, targetWorkType);
        showToast(`⚠ Preset is NA — No preset found for ${targetProduct} → ${wtLabel}`, true);
        return;
      }

      // Apply to all frames
      applyToAllFrames(preset);

      // Animate button
      const fillBtn = document.getElementById('chBtnFill');
      if (fillBtn) {
        fillBtn.classList.add('ch-fill-success');
        setTimeout(() => fillBtn.classList.remove('ch-fill-success'), 600);
      }
    }

    /* ─── Apply to all frames ─── */
    function applyToAllFrames(preset) {
      const LOG = '[CloserHelper:TOP]';
      console.log(`${LOG} ▶ applyToAllFrames — preset: '${preset.name}' (${preset.product}/${preset.workType})`);
      fillDocument(document, preset);

      const frames = document.querySelectorAll('iframe');
      console.log(`${LOG}   Found ${frames.length} iframes to send fill command`);
      frames.forEach((fr, idx) => {
        try {
          console.log(`${LOG}   → Posting CLOSER_HELPER_FILL to iframe[${idx}] id=${fr.id || '(none)'}`);
          fr.contentWindow.postMessage({ type: 'CLOSER_HELPER_FILL', preset }, '*');
        } catch (e) {
          console.log(`${LOG}   ❌ iframe[${idx}] cross-origin blocked: ${e.message}`);
        }
      });

      // Toast shows AFTER all queued ops + AJAX wait complete
      const workLabel = getWorkTypeLabel(preset.workType, preset.workType);
      setTimeout(() => {
        showToast(`✓ "${preset.name}" — ${workLabel} applied!`);
        console.log(`${LOG} ✅ Toast shown — all fills complete`);
      }, 2500);
    }

    /* ─── Fill in a specific document ─── */
    function fillDocument(doc, preset) {
      const LOG = '[CloserHelper:fillDoc]';
      console.log(`${LOG} ▶ fillDocument on: ${doc.location?.href || '(same)'}`);
      const fm = preset.fieldMap || {};

      function findEl(idOrName) {
        const el = doc.getElementById(idOrName)
          || doc.querySelector(`[name="${idOrName}"]`)
          || doc.querySelector(`[id*="${idOrName}" i]`)
          || doc.querySelector(`[name*="${idOrName}" i]`);
        console.log(`${LOG}   findEl('${idOrName}') → ${el ? `FOUND <${el.tagName} id=${el.id}>` : 'NOT FOUND'}`);
        return el;
      }

      function firePageScript(targetDoc, code) {
        const s = targetDoc.createElement('script');
        s.textContent = code;
        (targetDoc.head || targetDoc.documentElement).appendChild(s);
        s.remove();
      }

      /* ── Simulate real user typing ── */
      function setTextValue(fieldKey, value) {
        if (!value) return false;
        const el = findEl(fieldKey);
        if (!el) return false;
        const wasRO = el.readOnly;
        if (wasRO) el.readOnly = false;

        el.focus();
        el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        el.value = '';
        if (el.tagName === 'TEXTAREA') el.textContent = value;
        el.value = value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        el.blur();

        if (wasRO) el.readOnly = true;
        console.log(`${LOG}   ✅ TEXT '${fieldKey}' = '${value.substring(0, 40)}...'`);
        return true;
      }

      /* ── Simulate real user selecting dropdown ── */
      function setSelectValue(fieldKey, code) {
        if (!code) return false;
        const el = findEl(fieldKey);
        if (!el || el.tagName !== 'SELECT') return false;
        const codeLower = code.toLowerCase().trim();
        console.log(`${LOG}   SELECT '${fieldKey}' searching '${code}' in ${el.options.length} opts`);

        // Helper to select and fire events
        function pickOption(idx) {
          const opt = el.options[idx];
          el.focus();
          el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.selectedIndex = idx;
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
          el.blur();
          firePageScript(doc, `(function(){
            var el=document.getElementById('${el.id}');
            if(el && el.onchange) { el.onchange(); console.log('[CloserHelper:PAGE] ✅ #${el.id} onchange fired'); }
          })()`);
          console.log(`${LOG}   ✅ SELECT '${fieldKey}' → opt[${idx}] val='${opt.value}'`);
          return true;
        }

        // Pass 1: Exact match on value or text
        for (let i = 0; i < el.options.length; i++) {
          const v = el.options[i].value.toLowerCase().trim();
          const t = el.options[i].text.toLowerCase().trim();
          if (v === codeLower || t === codeLower) return pickOption(i);
        }
        // Pass 2: Partial includes match (only for codes >= 3 chars to avoid false positives)
        if (codeLower.length >= 3) {
          for (let i = 0; i < el.options.length; i++) {
            const v = el.options[i].value.toLowerCase();
            const t = el.options[i].text.toLowerCase();
            if (v.includes(codeLower) || t.includes(codeLower)) return pickOption(i);
          }
        }
        console.log(`${LOG}   ❌ SELECT '${fieldKey}' — NO MATCH for '${code}'`);
        return false;
      }

      function tryText(m, g, v) { if (!m || !setTextValue(m, v)) setTextValue(g, v); }
      function trySelect(m, g, c) { if (!m || !setSelectValue(m, c)) setSelectValue(g, c); }

      /* ══ Queue with human-like delays ══ */
      const ops = [];
      function q(fn) { ops.push(fn); }

      q(() => tryText(fm.repairDetail, 'REPAIRDESC_L', preset.repairDetailDesc));
      q(() => setTextValue('REPAIR_DESC', preset.repairDetailDesc));
      q(() => tryText(fm.defectDetail, 'DEFECTDESC_L', preset.defectDetailDesc));
      q(() => setTextValue('DEFECT_DESC', preset.defectDetailDesc));
      q(() => tryText(fm.statusComment, 'STATUS_COMMENT', preset.statusComment));
      q(() => tryText(fm.remark, 'REMARK', preset.remark));
      q(() => tryText(fm.editText, 'EDITEXT', preset.editText || preset.repairDetailDesc));
      q(() => trySelect(fm.defectBlock, 'DEF_BLK', preset.defectBlock));
      q(() => trySelect(fm.condition, 'IRIS_CONDI', preset.conditionCode));
      q(() => trySelect(fm.defectType, 'LAB_TYPE', preset.defectType));
      q(() => trySelect(fm.reasonCode, 'REASON', preset.reasonCode));
      q(() => trySelect(fm.defectCode, 'IRIS_DEFECT', preset.defectCode));
      q(() => { if (preset.symptomQCode) setSelectValue('IRIS_SYMPT_QCODE', preset.symptomQCode); });
      q(() => { if (preset.repairQCode) setSelectValue('IRIS_REPAIR_QCODE', preset.repairQCode); });

      let delay = 0;
      ops.forEach((fn, i) => {
        setTimeout(() => { console.log(`${LOG} step ${i + 1}/${ops.length}`); fn(); }, delay);
        delay += 30 + Math.floor(Math.random() * 50);
      });

      setTimeout(() => {
        console.log(`${LOG} ── Sub-codes after AJAX...`);
        trySelect(fm.symptom, 'IRIS_SYMPT', preset.symptomCode);
        setTimeout(() => {
          trySelect(fm.repairCode, 'IRIS_REPAIR', preset.repairCode);
          console.log(`${LOG} ✅ fillDocument COMPLETE`);
        }, 80 + Math.floor(Math.random() * 50));
      }, delay + 800);
    }

    /* ─── Local & child iframe DOM scraper for extraction ─── */
    function findLiveFieldValue(rootDoc, fieldKeys) {
      for (const key of fieldKeys) {
        const el = rootDoc.getElementById(key)
          || rootDoc.querySelector(`[name="${key}"]`)
          || rootDoc.querySelector(`[id*="${key}" i]`)
          || rootDoc.querySelector(`[name*="${key}" i]`);
        if (el) {
          if (el.tagName === 'SELECT') {
            if (el.selectedIndex >= 0 && el.options[el.selectedIndex]) {
              const opt = el.options[el.selectedIndex];
              const val = (opt.value || opt.text || '').trim();
              if (val && val !== 'Select' && val !== '0' && val !== '--' && val !== 'NONE') return val;
            }
            const val = (el.value || '').trim();
            if (val && val !== 'Select' && val !== '0' && val !== '--' && val !== 'NONE') return val;
          } else {
            const val = (el.value || el.textContent || '').trim();
            if (val) return val;
          }
        }
      }
      return '';
    }

    function findLiveSoId(rootDoc) {
      const keys = ['OBJECT_ID', 'objectID', 'OBJECTID', 'soNo', 'SO_NO', 'so_no', 'jobNo', 'JOB_NO'];
      for (const key of keys) {
        const el = rootDoc.getElementById(key)
          || rootDoc.querySelector(`[name="${key}"]`)
          || rootDoc.querySelector(`[id*="${key}" i]`);
        if (el && el.value && el.value.trim()) return el.value.trim();
      }
      return '';
    }

    function scrapeDocumentTree(rootDoc) {
      let soId = findLiveSoId(rootDoc);
      const scrapedFields = {};

      const fieldMapConfig = {
        'REPAIRDESC_L': ['REPAIRDESC_L', 'REPAIR_DESC', 'repairDetailDesc', 'repair_detail'],
        'DEFECTDESC_L': ['DEFECTDESC_L', 'DEFECT_DESC', 'defectDetailDesc', 'defect_detail'],
        'STATUS_COMMENT': ['STATUS_COMMENT', 'statusComment', 'status_comment'],
        'REMARK': ['REMARK', 'remark'],
        'EDITEXT': ['EDITEXT', 'editText', 'edit_text'],
        'IRIS_CONDI': ['IRIS_CONDI', 'IRIS_CONDI_CD', 'conditionCode', 'condition'],
        'LAB_TYPE': ['LAB_TYPE', 'defectType', 'defect_type'],
        'DEF_BLK': ['DEF_BLK', 'DEF_BLK_CD', 'defectBlock', 'defect_block'],
        'REASON': ['REASON', 'REASON_CD', 'reasonCode', 'reason_code'],
        'IRIS_DEFECT': ['IRIS_DEFECT', 'IRIS_DEFECT_CD', 'defectCode', 'defect_code'],
        'IRIS_SYMPT_QCODE': ['IRIS_SYMPT_QCODE', 'symptomQCode', 'symptom_qcode'],
        'IRIS_SYMPT': ['IRIS_SYMPT', 'symptomCode', 'symptom_code', 'symptom'],
        'IRIS_REPAIR_QCODE': ['IRIS_REPAIR_QCODE', 'repairQCode', 'repair_qcode'],
        'IRIS_REPAIR': ['IRIS_REPAIR', 'repairCode', 'repair_code', 'repair']
      };

      Object.keys(fieldMapConfig).forEach(fid => {
        const val = findLiveFieldValue(rootDoc, fieldMapConfig[fid]);
        if (val) scrapedFields[fid] = val;
      });

      // Recursive scan of accessible same-origin child frames
      try {
        const iframes = rootDoc.querySelectorAll('iframe');
        iframes.forEach(fr => {
          try {
            if (fr.contentDocument) {
              const childRes = scrapeDocumentTree(fr.contentDocument);
              if (!soId && childRes.soId) soId = childRes.soId;
              Object.assign(scrapedFields, childRes.scrapedFields);
            }
          } catch (e) { }
        });
      } catch (e) { }

      // Mirror text fields
      if (scrapedFields['REPAIRDESC_L'] && !scrapedFields['REPAIR_DESC']) {
        scrapedFields['REPAIR_DESC'] = scrapedFields['REPAIRDESC_L'];
      }
      if (scrapedFields['DEFECTDESC_L'] && !scrapedFields['DEFECT_DESC']) {
        scrapedFields['DEFECT_DESC'] = scrapedFields['DEFECTDESC_L'];
      }

      return { soId, scrapedFields, count: Object.keys(scrapedFields).length };
    }

    /* ─── Extract focused SO details and copy/download as Preset JSON ─── */
    function extractCurrentSoPreset() {
      console.log('[CloserHelper] Extracting live SO details for Preset JSON...');
      const responses = [];

      // 1. Scrape local document & same-origin child frames
      const localRes = scrapeDocumentTree(document);
      if (localRes.count > 0 || localRes.soId) {
        responses.push(localRes);
      }

      // 2. Broadcast extract request to all cross-origin iframes
      const frames = document.querySelectorAll('iframe');
      frames.forEach(fr => {
        try {
          fr.contentWindow.postMessage({ type: 'CLOSER_HELPER_EXTRACT_REQUEST' }, '*');
        } catch (e) { }
      });

      function onExtractResponse(e) {
        if (e.data && e.data.type === 'CLOSER_HELPER_EXTRACT_RESPONSE') {
          responses.push(e.data);
        }
      }

      window.addEventListener('message', onExtractResponse);

      // Wait 500ms for all nested subframes to report scraped data
      setTimeout(() => {
        window.removeEventListener('message', onExtractResponse);

        let soId = '';
        const mergedFields = {};

        responses.forEach(r => {
          if (!soId && r.soId) soId = r.soId;
          if (r.scrapedFields) {
            Object.assign(mergedFields, r.scrapedFields);
          }
        });

        if (!soId) {
          try {
            const params = new URLSearchParams(window.location.search);
            soId = params.get('objectID') || params.get('objectId') || params.get('soNo') || params.get('SO_NO') || '';
          } catch (e) { }
        }

        if (!soId) {
          soId = '41' + Date.now().toString().slice(-8);
        }

        const prod = selectedProduct || 'AC';
        const wt = selectedWorkType || 'installation';

        const presetObj = {
          id: Date.now().toString(),
          name: `Preset_SO_${soId}`,
          team: 'Installation-AC',
          product: prod,
          workType: wt,
          fields: mergedFields,
          repairDetailDesc: mergedFields['REPAIRDESC_L'] || mergedFields['REPAIR_DESC'] || '',
          defectDetailDesc: mergedFields['DEFECTDESC_L'] || mergedFields['DEFECT_DESC'] || '',
          statusComment: mergedFields['STATUS_COMMENT'] || '',
          remark: mergedFields['REMARK'] || '',
          editText: mergedFields['EDITEXT'] || mergedFields['REPAIRDESC_L'] || '',
          conditionCode: mergedFields['IRIS_CONDI'] || '',
          defectType: mergedFields['LAB_TYPE'] || '',
          defectBlock: mergedFields['DEF_BLK'] || '',
          reasonCode: mergedFields['REASON'] || '',
          defectCode: mergedFields['IRIS_DEFECT'] || '',
          symptomQCode: mergedFields['IRIS_SYMPT_QCODE'] || '',
          symptomCode: mergedFields['IRIS_SYMPT'] || '',
          repairQCode: mergedFields['IRIS_REPAIR_QCODE'] || '',
          repairCode: mergedFields['IRIS_REPAIR'] || '',
          fieldMap: {
            repairDetail: 'REPAIRDESC_L',
            defectDetail: 'DEFECTDESC_L',
            statusComment: 'STATUS_COMMENT',
            remark: 'REMARK',
            editText: 'EDITEXT',
            symptom: 'IRIS_SYMPT',
            defectBlock: 'DEF_BLK',
            repairCode: 'IRIS_REPAIR',
            condition: 'IRIS_CONDI',
            defectType: 'LAB_TYPE',
            defectCode: 'IRIS_DEFECT'
          }
        };

        const jsonStr = JSON.stringify(presetObj, null, 2);

        // Copy to clipboard (with fallback)
        copyTextToClipboard(jsonStr);

        // Download as JSON file
        try {
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `preset_SO_${soId}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('[CloserHelper] Failed to download JSON file:', err);
        }

        showToast(`✓ Preset SO #${soId} copied & downloaded!`);
      }, 500);
    }

    function copyTextToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
      } else {
        fallbackCopyText(text);
      }
    }

    function fallbackCopyText(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      ta.remove();
    }

    /* ─── Show toast ─── */
    function showToast(msg, isError = false) {
      const existing = document.querySelector('.ch-toast-msg');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'ch-toast-msg';
      if (isError) {
        toast.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        toast.style.boxShadow = '0 10px 30px rgba(239, 68, 68, 0.4)';
      }
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    /* ─── Listen for frame messages & forward recursively ─── */
    window.addEventListener('message', (e) => {
      if (!e.data) return;
      if (e.data.type === 'CLOSER_HELPER_EXTRACT_REQUEST') {
        const res = scrapeDocumentTree(document);

        // Forward to any child iframes inside this frame
        try {
          const childIframes = document.querySelectorAll('iframe');
          childIframes.forEach(fr => {
            try {
              fr.contentWindow.postMessage({ type: 'CLOSER_HELPER_EXTRACT_REQUEST' }, '*');
            } catch (err) { }
          });
        } catch (err) { }

        // Send response back to top window
        if (window.top) {
          window.top.postMessage({
            type: 'CLOSER_HELPER_EXTRACT_RESPONSE',
            soId: res.soId,
            scrapedFields: res.scrapedFields,
            count: res.count
          }, '*');
        }
      }
    });
  }
})();
