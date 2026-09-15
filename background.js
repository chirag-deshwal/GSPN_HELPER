/**
 * background.js — Service Worker for GSPN Data Scraper extension
 * Handles opening the Closer Helper settings page in a new tab,
 * stores runtime debug logs, and performs background 10-minute login credential verification.
 */
const MAX_LOG_ENTRIES = 250;
const REMOTE_LOGIN_URL = 'https://raw.githubusercontent.com/chirag-deshwal/gspn-helper/refs/heads/main/risk_zone/api_data.json';
const LOGIN_ALARM_NAME = 'checkLoginStatusAlarm';
const LOGIN_CHECK_INTERVAL_MINUTES = 10;

// Allow content scripts to access chrome.storage.session
if (chrome.storage && chrome.storage.session && typeof chrome.storage.session.setAccessLevel === 'function') {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch((err) => {
    console.warn('Failed to set storage access level:', err);
  });
}

function normalizeLogEntry(entry) {
  return {
    id: entry?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source: entry?.source || 'unknown',
    level: entry?.level || 'log',
    message: entry?.message || '',
    timestamp: entry?.timestamp || new Date().toISOString(),
    url: entry?.url || ''
  };
}

function storeLog(entry) {
  const normalized = normalizeLogEntry(entry);
  chrome.storage.local.get({ extensionLogs: [] }, (result) => {
    const logs = Array.isArray(result.extensionLogs) ? result.extensionLogs : [];
    logs.push(normalized);
    if (logs.length > MAX_LOG_ENTRIES) {
      logs.splice(0, logs.length - MAX_LOG_ENTRIES);
    }
    chrome.storage.local.set({ extensionLogs: logs });
  });
}

// ==================== Remote Login Verification Helpers ====================

function normalizeLoginValue(value) {
  return String(value || '').trim().toLowerCase();
}

function readLoginField(source, keys) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && source[key] !== undefined && String(source[key]).trim() !== '') {
      return source[key];
    }
  }
  return null;
}

function collectLoginEntries(source, results) {
  if (Array.isArray(source)) {
    source.forEach(item => collectLoginEntries(item, results));
    return;
  }

  if (!source || typeof source !== 'object') {
    return;
  }

  const idValue = readLoginField(source, ['id', 'userId', 'user_id', 'username', 'employeeId', 'employee_id', 'loginId', 'login_id']);
  const passwordValue = readLoginField(source, ['password', 'pass', 'pwd', 'secret']);

  if (idValue !== null && passwordValue !== null) {
    results.push({
      userId: String(idValue),
      password: String(passwordValue)
    });
  }

  const nestedKeys = ['users', 'data', 'records', 'items', 'employees', 'accounts', 'logins', 'result'];
  nestedKeys.forEach((key) => {
    if (source[key]) {
      collectLoginEntries(source[key], results);
    }
  });

  Object.values(source).forEach((value) => {
    if (value && typeof value === 'object') {
      collectLoginEntries(value, results);
    }
  });
}

function findMatchingLogin(payload, enteredUserId, enteredPassword) {
  const normalizedUserId = normalizeLoginValue(enteredUserId);
  const normalizedPassword = normalizeLoginValue(enteredPassword);
  const entries = [];

  collectLoginEntries(payload, entries);

  return entries.some((entry) => normalizeLoginValue(entry.userId) === normalizedUserId && normalizeLoginValue(entry.password) === normalizedPassword);
}

/**
 * Verifies stored login credentials against remote API.
 * Updates chrome.storage.local with latest status.
 */
async function verifySavedCredentials() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['savedLoginUserId', 'savedLoginPassword'], async (result) => {
      const { savedLoginUserId, savedLoginPassword } = result;
      if (!savedLoginUserId || !savedLoginPassword) {
        chrome.storage.local.set({ lastLoginStatus: 'unauthenticated' });
        resolve({ success: false, reason: 'no_credentials' });
        return;
      }

      try {
        const response = await fetch(REMOTE_LOGIN_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP status ${response.status}`);
        }
        const payload = await response.json();
        const isValid = findMatchingLogin(payload, savedLoginUserId, savedLoginPassword);

        if (isValid) {
          chrome.storage.local.set({
            lastLoginStatus: 'success',
            lastLoginCheck: new Date().toISOString()
          });
          storeLog({
            source: 'background',
            level: 'info',
            message: `10-min login re-verification passed for ${savedLoginUserId}`
          });
          resolve({ success: true });
        } else {
          // Password was updated remotely or credentials revoked
          chrome.storage.local.set({
            lastLoginStatus: 'invalid',
            lastLoginCheck: new Date().toISOString()
          });
          storeLog({
            source: 'background',
            level: 'warn',
            message: `10-min login re-verification FAILED (Password/ID updated remotely) for ${savedLoginUserId}`
          });
          resolve({ success: false, reason: 'invalid_credentials' });
        }
      } catch (err) {
        storeLog({
          source: 'background',
          level: 'error',
          message: `10-min login re-verification network error: ${err.message}`
        });
        resolve({ success: false, reason: 'network_error' });
      }
    });
  });
}

// ==================== 10-Minute Alarm Setup ====================

function setupLoginCheckAlarm() {
  if (chrome.alarms) {
    chrome.alarms.get(LOGIN_ALARM_NAME, (existingAlarm) => {
      if (!existingAlarm) {
        chrome.alarms.create(LOGIN_ALARM_NAME, {
          delayInMinutes: LOGIN_CHECK_INTERVAL_MINUTES,
          periodInMinutes: LOGIN_CHECK_INTERVAL_MINUTES
        });
        storeLog({ source: 'background', level: 'info', message: 'Created 10-minute login check alarm' });
      }
    });
  }
}

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === LOGIN_ALARM_NAME) {
      verifySavedCredentials();
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupLoginCheckAlarm();
  verifySavedCredentials();
});

chrome.runtime.onStartup.addListener(() => {
  setupLoginCheckAlarm();
  verifySavedCredentials();
});

setupLoginCheckAlarm();

// ==================== Message Listeners ====================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openMainPopup' || msg.action === 'openPopup') {
    if (chrome.action && typeof chrome.action.openPopup === 'function') {
      chrome.action.openPopup().then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        console.warn('chrome.action.openPopup failed:', err);
        sendResponse({ ok: false, error: err.message });
      });
      return true;
    } else {
      sendResponse({ ok: false, error: 'chrome.action.openPopup not supported' });
      return true;
    }
  }

  if (msg.action === 'openCloserSettings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('closer_helper_settings.html') });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'extensionLog') {
    storeLog({
      ...msg.entry,
      url: sender?.url || ''
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'getExtensionLogs') {
    chrome.storage.local.get({ extensionLogs: [] }, (result) => {
      const logs = Array.isArray(result.extensionLogs) ? result.extensionLogs : [];
      sendResponse({ logs });
    });
    return true;
  }

  if (msg.action === 'clearExtensionLogs') {
    chrome.storage.local.set({ extensionLogs: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'verifyLoginNow') {
    verifySavedCredentials().then((res) => {
      sendResponse(res);
    });
    return true;
  }

  if (msg.action === 'startLoginAlarm') {
    setupLoginCheckAlarm();
    sendResponse({ ok: true });
    return true;
  }
});

// ==================== Ghost Mode Toolbar Icon Handler ====================
function updateExtensionGhostIcon(isGhost) {
  if (!chrome.action || typeof chrome.action.setIcon !== 'function') return;
  const paths = isGhost ? {
    16: 'icons/transparent16.png',
    32: 'icons/transparent32.png',
    48: 'icons/transparent48.png',
    128: 'icons/transparent128.png'
  } : {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  };

  chrome.action.setIcon({ path: paths }).catch((err) => {
    console.warn('Failed to set extension icon:', err);
  });
}

// Initial sync on service worker load
chrome.storage.local.get(['ghostModeEnabled'], (data) => {
  updateExtensionGhostIcon(!!data.ghostModeEnabled);
});

// Storage listener to update icon whenever ghostModeEnabled changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, 'ghostModeEnabled')) {
    updateExtensionGhostIcon(!!changes.ghostModeEnabled.newValue);
  }
});

// Also on browser startup and extension install
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['ghostModeEnabled'], (data) => {
    updateExtensionGhostIcon(!!data.ghostModeEnabled);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['ghostModeEnabled'], (data) => {
    updateExtensionGhostIcon(!!data.ghostModeEnabled);
  });
});

