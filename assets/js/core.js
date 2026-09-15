/**
 * core.js — Shared utilities for GSPN Website Tools
 */

// ── Toast Notifications ──────────────────────────────────────────────────────
function showToast(message, type) {
  type = type || 'success';
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + message + '</span>';
  container.appendChild(toast);

  requestAnimationFrame(function() { toast.classList.add('visible'); });
  setTimeout(function() {
    toast.classList.remove('visible');
    setTimeout(function() { toast.remove(); }, 350);
  }, 3500);
}

// ── Status Bar ───────────────────────────────────────────────────────────────
function setStatus(barId, textId, state, message) {
  const bar = document.getElementById(barId);
  const text = document.getElementById(textId);
  if (bar) {
    bar.className = 'status-bar status-' + state;
  }
  if (text) {
    text.textContent = message;
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function getTimestamp() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '_',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0')
  ].join('');
}

function formatTodayDate(separator, format) {
  var sep = separator !== undefined ? separator : '.';
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yyyy = d.getFullYear();
  if (format === 'mm/dd/yyyy' || format === 'mm/DD/yyyy') {
    return mm + sep + dd + sep + yyyy;
  }
  return dd + sep + mm + sep + yyyy;
}

/**
 * Parse various date formats found in GSPN data.
 * Accepts: "09.04.2026", "04/09/2026", "2026-09-04", "05/09/2026 (12:00:00)", "09.04.2026 17:58:10", "04-09-2026"
 * Returns a Date object or null.
 */
function parseGspnDate(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();

  // Remove parenthesized time portion: "05/09/2026 (12:00:00)" → "05/09/2026"
  var cleaned = str.replace(/\s*\(.*?\)\s*/g, '').trim();

  // If there's whitespace followed by time, strip time
  if (cleaned.indexOf(' ') !== -1) {
    cleaned = cleaned.split(/\s+/)[0];
  }

  // Format: DD.MM.YYYY
  var m = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));

  // Format: DD/MM/YYYY
  m = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));

  // Format: DD-MM-YYYY
  m = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));

  // Format: YYYY-MM-DD
  m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));

  return null;
}

/**
 * Calculate Aging in days from Assigned Date matching Excel =TODAY() - ASSIGNED_DATE.
 * Calculates midnight-to-midnight difference in full days.
 */
function calcAging(assignedDateStr, todayDate) {
  var assigned = parseGspnDate(assignedDateStr);
  if (!assigned) return '';
  var now = todayDate || new Date();
  var todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var assignedMidnight = new Date(assigned.getFullYear(), assigned.getMonth(), assigned.getDate());
  var diff = Math.round((todayMidnight - assignedMidnight) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

/**
 * Backward compatibility alias for calcTAT.
 */
function calcTAT(createdStr, todayDate) {
  return calcAging(createdStr, todayDate);
}

/**
 * Separate date and time from combined strings like:
 * "06/08/2026 (13:10:55)", "12/08/2026 (14:00:00)", "06.08.2026 13:10:55", etc.
 * Handles various user date formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD.MM.YYYY, etc.)
 */
function splitDateTime(val) {
  if (!val || typeof val !== 'string') return { date: '', time: '' };
  val = val.trim();
  if (!val) return { date: '', time: '' };

  var dateStr = '';
  var timeStr = '';

  // 1. Check for time in parentheses, e.g. "(13:10:55)", "( 14:00:00 )", "(01:10:55 PM)"
  var parenTimeMatch = val.match(/\(\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?)\s*\)/);
  if (parenTimeMatch) {
    timeStr = parenTimeMatch[1].trim();
    dateStr = val.replace(/\(\s*[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?\s*\)/, '').trim();
  } else {
    // 2. Check for standalone time e.g. "06/08/2026 13:10:55"
    var standaloneTimeMatch = val.match(/\b([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?)\b/);
    if (standaloneTimeMatch) {
      timeStr = standaloneTimeMatch[1].trim();
      dateStr = val.replace(/\b[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?\b/, '').trim();
    } else {
      dateStr = val;
    }
  }

  // Clean trailing punctuation or brackets from date string
  dateStr = dateStr.replace(/^[,\s\-\–\(\)]+|[,\s\-\–\(\)]+$/g, '').trim();

  return {
    date: dateStr,
    time: timeStr
  };
}

/**
 * Returns the TAT label string for a given aging number.
 * Mirrors formula:
 * =IFS(H5<=2, "0–2 Days", H5<=7, "3–7 Days", H5<=10, "8–10 Days", H5<=14, "11–14 Days", H5<=30, "15–30 Days", H5>30, ">30 Days")
 */
function getTATLabel(aging) {
  var n = parseFloat(aging);
  if (isNaN(n) || aging === '' || aging === undefined || aging === null) return '';
  if (n <= 2)  return '0\u20132 Days';
  if (n <= 7)  return '3\u20137 Days';
  if (n <= 10) return '8\u201310 Days';
  if (n <= 14) return '11\u201314 Days';
  if (n <= 30) return '15\u201330 Days';
  return '>30 Days';
}

/**
 * Returns color style metadata for TAT value matching the extension (popup.html / popup.js).
 */
function getTATStyle(aging) {
  var n = parseFloat(aging);
  if (isNaN(n) || aging === '' || aging === undefined || aging === null) {
    return { class: '', bg: '', color: '' };
  }
  if (n <= 2)  return { class: 'tat-0to2',   bg: '#c6efce', color: '#276221' };
  if (n <= 7)  return { class: 'tat-3to7',   bg: '#ffeb9c', color: '#9c6500' };
  if (n <= 10) return { class: 'tat-8to10',  bg: '#ffc7ce', color: '#9c0006' };
  if (n <= 14) return { class: 'tat-11to14', bg: '#ff0000', color: '#ffffff' };
  if (n <= 30) return { class: 'tat-15to30', bg: '#c00000', color: '#ffffff' };
  return              { class: 'tat-gt30',   bg: '#7b0000', color: '#ffffff' };
}

/**
 * Converts short service type codes (from Step 1 / Print view) to full descriptive labels.
 *   IH -> IN-HOME
 *   II -> Initial Installation
 *   SR -> Stock Repair
 *   CC -> Customer Care
 *   DM -> Demonstration
 *   PS -> PICK-UP SERVICE
 *   CI -> Carry In
 *   RH -> Return Handling
 */
function convertServiceType(code) {
  if (!code) return '';
  var c = String(code).trim().toUpperCase();
  var map = {
    'IH': 'IN-HOME',
    'II': 'Initial Installation',
    'SR': 'Stock Repair',
    'CC': 'Customer Care',
    'DM': 'Demonstration',
    'PS': 'PICK-UP SERVICE',
    'CI': 'Carry In',
    'RH': 'Return Handling'
  };
  return map[c] || String(code).trim();
}

/**
 * Product categorization logic based on Model RAW Number:
 * =IF(LEFT(G2020,1)="S","HHP",IF(LEFT(G2020,1)="A","AC",IF(LEFT(G2020,2)="HT","AUD",
 * IF(LEFT(G2020,2)="HW","AUD",IF(LEFT(G2020,1)="Q","AV",IF(LEFT(G2020,1)="U","AV",
 * IF(LEFT(G2020,1)="N","IT",IF(LEFT(G2020,2)="LH","IT",IF(LEFT(G2020,2)="LC","IT",
 * IF(LEFT(G2020,1)="M","MW",IF(LEFT(G2020,1)="R","REF",IF(LEFT(G2020,1)="W","WM",
 * IF(LEFT(G2020,1)="D","DW",IF(LEFT(G2020,2)="CE","MW",IF(LEFT(G2020,2)="LS","IT","Other"))))))))))))))))
 */
function getProductCategory(model) {
  if (!model) return 'Other';
  var m = String(model).toUpperCase().trim();
  if (!m) return 'Other';

  var first1 = m.substring(0, 1);
  var first2 = m.substring(0, 2);

  if (first1 === 'S') return 'HHP';
  if (first1 === 'A') return 'AC';
  if (first2 === 'HT' || first2 === 'HW') return 'AUD';
  if (first1 === 'Q' || first1 === 'U') return 'AV';
  if (first1 === 'N' || first2 === 'LH' || first2 === 'LC' || first2 === 'LS') return 'IT';
  if (first1 === 'M' || first2 === 'CE') return 'MW';
  if (first1 === 'R') return 'REF';
  if (first1 === 'W') return 'WM';
  if (first1 === 'D') return 'DW';

  return 'Other';
}

// ── HTML Escape ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
