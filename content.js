/**
 * GSPN Data Scraper - Content Script
 * Parses service ticket data from the Samsung GSPN multi-print page.
 * Each ticket block is a <table width="100%" height="980"> containing
 * a nested data table with CSS classes PboxV_T_bold / PboxV_B_bold for labels
 * and PboxV_T / PboxV_B / PboxV_TR / PboxV_BR for values.
 */

// Field mapping: label text -> clean key name
const FIELD_MAP = {
  'Customer Name': 'Customer Name',
  'Service Order No': 'Service Order No',
  'Customer No': 'Customer No',
  'Address': 'Address',
  'Model Name': 'Model Name',
  'Engineer': 'Engineer',
  'Telephone(Home)': 'Telephone (Home)',
  'Customer Preferred Date': 'Customer Preferred Date',
  'Service Type': 'Service Type',
  'Telephone(Office)': 'Telephone (Office)',
  'Purchase Date': 'Purchase Date',
  'Appointment Date': 'Appointment Date',
  'Telephone(Mobile)': 'Telephone (Mobile)',
  'ASC Assigned': 'ASC Assigned',
  'Symptom 1': 'Symptom 1',
  'Symptom 2': 'Symptom 2',
  'Symptom 3': 'Symptom 3',
  '1st Service Comment': '1st Service Comment',
  'Remark': 'Remark'
};

// Ordered columns for the Excel export
const COLUMN_ORDER = [
  'Service Order No',
  'Customer Name',
  'Customer No',
  'Address',
  'City',
  'Model Name',
  'Engineer',
  'Telephone (Home)',
  'Telephone (Office)',
  'Telephone (Mobile)',
  'Customer Preferred Date',
  'Purchase Date',
  'Appointment Date',
  'App Date',
  'App Time',
  'Service Type',
  'Service Type (Status)',
  'ASC Assigned',
  'Symptom 1',
  'Symptom 2',
  'Symptom 3',
  '1st Service Comment',
  'Remark'
];

/**
 * Converts short service type codes to full descriptive labels:
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
  const c = String(code).trim().toUpperCase();
  const map = {
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
 * Separate date and time from combined strings like:
 * "06/08/2026 (13:10:55)", "12/08/2026 (14:00:00)", etc.
 */
function splitDateTime(val) {
  if (!val) return { date: '', time: '' };
  const str = String(val).trim();
  if (!str) return { date: '', time: '' };

  let dateStr = '';
  let timeStr = '';

  const parenTimeMatch = str.match(/\(\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?)\s*\)/);
  if (parenTimeMatch) {
    timeStr = parenTimeMatch[1].trim();
    dateStr = str.replace(/\(\s*[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?\s*\)/, '').trim();
  } else {
    const standaloneTimeMatch = str.match(/\b([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?)\b/);
    if (standaloneTimeMatch) {
      timeStr = standaloneTimeMatch[1].trim();
      dateStr = str.replace(/\b[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?:\s*[AaPp][Mm])?\b/, '').trim();
    } else {
      dateStr = str;
    }
  }

  dateStr = dateStr.replace(/^[,\s\-\–\(\)]+|[,\s\-\–\(\)]+$/g, '').trim();
  return { date: dateStr, time: timeStr };
}

const LOG_SOURCE = 'content';

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
  }).catch(() => {});
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

/**
 * Clean extracted text: trim whitespace, collapse multiple spaces,
 * remove &nbsp; remnants.
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\u00A0/g, ' ')   // Replace &nbsp;
    .replace(/\s+/g, ' ')       // Collapse whitespace
    .trim();
}

/**
 * Parse a single ticket table block and return a data object.
 */
function parseTicketBlock(tableEl) {
  const data = {};

  // Find all rows in the innermost data table (the one with PboxV_* classes)
  const rows = tableEl.querySelectorAll('tr');

  for (const row of rows) {
    const cells = row.querySelectorAll('td');

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const className = cell.className || '';

      // Check if this cell is a label cell (bold class)
      const isLabel = className.includes('PboxV_T_bold') ||
                      className.includes('PboxV_B_bold') ||
                      className.includes('Pboxv_B_bold') ||
                      className.includes('Pboxv_T_bold');

      if (isLabel) {
        const labelText = cleanText(cell.textContent);

        // Find the mapped field name
        let fieldName = null;
        for (const [key, value] of Object.entries(FIELD_MAP)) {
          if (labelText.includes(key)) {
            fieldName = value;
            break;
          }
        }

        if (fieldName) {
          // The value is in the next cell(s)
          let valueCell = cells[i + 1];
          if (valueCell) {
            const valueClassName = valueCell.className || '';
            // Only grab value from non-label cells
            if (!valueClassName.includes('bold')) {
              // For address, the colspan=3 cell contains the full address
              // For 1st Service Comment and Remark, colspan=5
              const colSpan = parseInt(valueCell.getAttribute('colspan') || '1');
              data[fieldName] = cleanText(valueCell.textContent);
            }
          }
        }
      }
    }
  }

  if (data['Service Order No']) {
    data['SO'] = data['Service Order No'];
  }
  if (data['Customer Name']) {
    data['CX Name'] = data['Customer Name'];
  }

  // Extract City from Address if available
  if (!data['City'] && data['Address']) {
    const cityMatch = data['Address'].match(/\b(GURGAON|GURUGRAM|DELHI|NEW DELHI|NOIDA|FARIDABAD|GHAZIABAD|MANESAR)\b/i);
    if (cityMatch) data['City'] = cityMatch[1].toUpperCase();
  }

  // Convert Service Type (e.g. IH -> IN-HOME) and populate Service Type (Status)
  if (data['Service Type']) {
    const converted = convertServiceType(data['Service Type']);
    data['Service Type'] = converted;
    data['Service Type (Status)'] = converted;
  }

  // Split Appointment Date into App Date and App Time
  if (data['Appointment Date']) {
    const sApp = splitDateTime(data['Appointment Date']);
    if (sApp.date) data['App Date'] = sApp.date;
    if (sApp.time) data['App Time'] = sApp.time;
  }

  return data;
}
const VIEW_MODE_LABEL_MAP = [
  ['Service Order No.', 'Service Order No'],
  ['Service Order No', 'Service Order No'],
  ['ASC Job No', 'ASC Job No'],
  ['Customer Preferred Date', 'Customer Preferred Date'],
  ['Customer', 'Customer Name'],
  ['Customer No', 'Customer No'],
  ['Phone No', 'Telephone'],
  ['ASC Assigned', 'ASC Assigned'],
  ['Call Received', 'Call Received'],
  ['ASC 1st App', 'ASC 1st App'],
  ['1st Visit', '1st Visit'],
  ['Repair Completed', 'Repair Completed'],
  ['Status Comment', 'Status Comment'],
  ['Service Type', 'Service Type'],
  ['Engineer', 'Engineer'],
  ['Remark', 'Remark'],
  ['Purchase Date', 'Purchase Date'],
  ['Model', 'Model Name'],
  ['Service Branch', 'Service Branch'],
  ['Job Information(Date)', 'Job Information(Date)'],
  ['Customer Symptom', 'Customer Symptom']
];

function mapViewLabelToField(labelText) {
  const normalized = labelText.replace(/\s+/g, ' ').trim();
  for (const [match, field] of VIEW_MODE_LABEL_MAP) {
    if (normalized.includes(match)) {
      return field;
    }
  }
  return null;
}

function parseViewModePhoneValues(rawValue) {
  const result = {};
  const homeMatch = rawValue.match(/\[Home\]\s*([0-9+\-\s]+)/i);
  const officeMatch = rawValue.match(/\[Office\]\s*([0-9+\-\s]+)/i);
  const mobileMatch = rawValue.match(/\[Mobile\]\s*([0-9+\-\s]+)/i);

  if (homeMatch) {
    result['Telephone (Home)'] = cleanText(homeMatch[1]);
  }
  if (officeMatch) {
    result['Telephone (Office)'] = cleanText(officeMatch[1]);
  }
  if (mobileMatch) {
    result['Telephone (Mobile)'] = cleanText(mobileMatch[1]);
  }

  if (!homeMatch && !officeMatch && !mobileMatch) {
    result['Telephone'] = cleanText(rawValue);
  }

  return result;
}

function parseViewModeTicket() {
  const ticket = {};

  const inputObjectId = document.querySelector('input#OBJECT_ID');
  const spanObjectId = document.querySelector('span#OBJECT_ID');
  const rawObjectId = inputObjectId?.value || spanObjectId?.textContent;

  if (rawObjectId) {
    ticket['Service Order No'] = cleanText(rawObjectId);
  }

  const rows = document.querySelectorAll('table.sertb_brdr tr');
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td'));
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      if (!cell.className || !cell.className.includes('ser_ti')) continue;

      const labelText = cleanText(cell.textContent);
      if (!labelText) continue;

      const valueCell = cells[i + 1];
      if (!valueCell) continue;

      const rawValue = cleanText(valueCell.textContent);
      if (!rawValue) continue;

      if (labelText.includes('Phone No')) {
        Object.assign(ticket, parseViewModePhoneValues(rawValue));
        continue;
      }

      if (labelText === 'Customer') {
        const phoneMatch = rawValue.match(/([0-9]{5,})\s*$/);
        if (phoneMatch) {
          ticket['Customer No'] = phoneMatch[1];
        }
        const customerName = rawValue.replace(/([0-9]{5,})\s*$/, '').trim();
        ticket['Customer Name'] = cleanText(customerName);
        continue;
      }

      const fieldName = mapViewLabelToField(labelText);
      if (fieldName) {
        if (!ticket[fieldName]) {
          ticket[fieldName] = rawValue;
        }
      } else {
        ticket[labelText] = rawValue;
      }
    }
  }

  if (!ticket['Service Order No'] && !ticket['Customer Name']) {
    return null;
  }

  return ticket;
}

function getColumnsForTicket(ticket) {
  const columns = [...COLUMN_ORDER];
  for (const field of Object.keys(ticket)) {
    if (!columns.includes(field)) {
      columns.push(field);
    }
  }
  return columns;
}
/**
 * Scrape all ticket blocks from the page.
 */
function scrapeAllTickets(targetDoc = document) {
  const tickets = [];

  // Each ticket is wrapped in a <table width="100%" height="980">
  // Inside there's a nested table with the actual data (PboxV_* classes)
  const outerTables = targetDoc.querySelectorAll('table[width="100%"][height="980"]');

  for (const outerTable of outerTables) {
    // Find the data table inside (with PboxV_T_bold cells)
    const dataTables = outerTable.querySelectorAll('table[width="100%"][border="0"][cellspacing="0"][cellpadding="0"]');

    for (const dataTable of dataTables) {
      // Check if this table has PboxV_T_bold cells (it's a data table)
      const boldCells = dataTable.querySelectorAll('td.PboxV_T_bold');
      if (boldCells.length > 0) {
        const ticketData = parseTicketBlock(dataTable);
        // Only add if we got meaningful data
        if (ticketData['Service Order No'] || ticketData['Customer Name']) {
          tickets.push(ticketData);
        }
        break; // Only process the first data table per outer block
      }
    }
  }

  // Fallback: If no tickets found in targetDoc, search inside child iframes
  if (tickets.length === 0) {
    const iframes = Array.from(targetDoc.querySelectorAll('iframe'));
    for (const frame of iframes) {
      try {
        const frameDoc = frame.contentDocument || frame.contentWindow.document;
        if (!frameDoc) continue;
        const subRes = scrapeAllTickets(frameDoc);
        if (subRes && subRes.tickets && subRes.tickets.length > 0) {
          return subRes;
        }
      } catch (e) {
        // Cross-origin blocked
      }
    }
  }

  return { tickets, columns: COLUMN_ORDER };
}

function scrapeFieldsFromPage(doc = document) {
  const fields = {};
  const fieldIds = [
    'STATUS_COMMENT', 'REMARK', 'DEFECTDESC_L', 'REPAIRDESC_L', 'EDITEXT',
    'LAB_TYPE', 'DEF_BLK', 'IRIS_CONDI', 'IRIS_SYMPT_QCODE', 'IRIS_SYMPT',
    'IRIS_DEFECT', 'IRIS_REPAIR_QCODE', 'IRIS_REPAIR', 'REASON'
  ];

  function getVal(id, currentDoc) {
    const el = currentDoc.getElementById(id)
        || currentDoc.querySelector(`[name="${id}"]`)
        || currentDoc.querySelector(`[id*="${id}" i]`)
        || currentDoc.querySelector(`[name*="${id}" i]`);

    if (el) {
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        return el.value ? el.value.trim() : '';
      }
      return el.textContent ? el.textContent.trim() : '';
    }

    const iframes = Array.from(currentDoc.querySelectorAll('iframe'));
    for (const iframe of iframes) {
      try {
        const frameDoc = iframe.contentDocument || iframe.contentWindow.document;
        const val = getVal(id, frameDoc);
        if (val) return val;
      } catch (e) {
        // Ignore cross-origin frames
      }
    }
    return '';
  }

  for (const id of fieldIds) {
    const val = getVal(id, doc);
    if (val) {
      fields[id] = val;
    }
  }

  return fields;
}

const INTERACTION_COLUMNS = [
  'Service Order No',
  'Product',
  'Interaction Code',
  'Status',
  'Created Date',
  'Created By',
  'Changed Date',
  'Changed By',
  'Comment',
  'Feedback'
];

function cleanTdText(td) {
  if (!td) return '';
  return cleanText(td.textContent);
}

function scrapeInteractionMessages(targetDoc = document) {
  const records = [];
  const tables = targetDoc.querySelectorAll('table');

  for (const table of tables) {
    const trs = Array.from(table.querySelectorAll('tr'));
    if (trs.length === 0) continue;

    const tableText = table.textContent || '';
    if (!tableText.includes('Interaction Code') && !tableText.includes('Service Order No')) {
      continue;
    }

    for (let i = 0; i < trs.length; i++) {
      const tr = trs[i];
      const rawTds = Array.from(tr.querySelectorAll('td'));
      if (rawTds.length < 5) continue;

      const tds = rawTds.map(cleanTdText);
      const firstColVal = parseInt(tds[0], 10);
      if (isNaN(firstColVal)) continue;

      const serviceOrderNo = tds[1].replace(/Edit$/i, '').trim();
      const rawProduct = tds[2] || '';
      const product = getSamsungCategory(rawProduct);

      let interactionCode = '';
      let status = '';
      let createdDate = '';
      let createdBy = '';
      let changedDate = '';
      let changedBy = '';
      let comment = '';
      let feedback = '';

      if (rawTds.length >= 11) {
        // Layout Variation B (Single row with 11 cells)
        comment = tds[3] || '';
        interactionCode = tds[4] || '';
        feedback = tds[5] || '';
        status = tds[6] || '';
        createdDate = tds[7] || '';
        createdBy = tds[8] || '';
        changedDate = tds[9] || '';
        changedBy = tds[10] || '';
      } else {
        // Layout Variation A (2-row item: main row 9 cells, sub row comment & feedback)
        interactionCode = tds[3] || '';
        status = tds[4] || '';
        createdDate = tds[5] || '';
        createdBy = tds[6] || '';
        changedDate = tds[7] || '';
        changedBy = tds[8] || '';

        const trSub = trs[i + 1];
        if (trSub) {
          const rawSubTds = Array.from(trSub.querySelectorAll('td'));
          if (rawSubTds.length >= 1 && trSub.innerHTML.includes('colspan')) {
            const tdsSub = rawSubTds.map(cleanTdText);
            if (tdsSub.length >= 1) comment = tdsSub[0] || '';
            if (tdsSub.length >= 2) feedback = tdsSub[1] || '';
            i++; // skip sub row
          }
        }
      }

      records.push({
        'Service Order No': serviceOrderNo,
        'Product': product,
        'Interaction Code': interactionCode,
        'Status': status,
        'Created Date': createdDate,
        'Created By': createdBy,
        'Changed Date': changedDate,
        'Changed By': changedBy,
        'Comment': comment,
        'Feedback': feedback
      });
    }
  }

  // Fallback: If no records found in targetDoc, search inside child iframes
  if (records.length === 0) {
    const iframes = Array.from(targetDoc.querySelectorAll('iframe'));
    for (const frame of iframes) {
      try {
        const frameDoc = frame.contentDocument || frame.contentWindow.document;
        if (!frameDoc) continue;
        const subRes = scrapeInteractionMessages(frameDoc);
        if (subRes && subRes.records && subRes.records.length > 0) {
          return subRes;
        }
      } catch (e) {
        // Cross-origin iframe
      }
    }
  }

  return { records, columns: INTERACTION_COLUMNS };
}

function getSamsungCategory(model) {
  if (!model) return 'Other';
  const m = String(model).toUpperCase().trim();
  if (!m) return 'Other';

  const first1 = m.substring(0, 1);
  const first2 = m.substring(0, 2);

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

function parseDateForAging(value) {
  if (!value) return null;
  const str = value.toString().trim();
  if (str.includes('00.00.0000') || str.includes('00/00/0000') || str.includes('00-00-0000')) return null;
  const dateMatch = str.match(/(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4})/);
  if (!dateMatch) return null;
  const d = dateMatch[1];
  let parts;
  if (d.includes('-')) parts = d.split('-');
  else if (d.includes('.')) parts = d.split('.');
  else if (d.includes('/')) parts = d.split('/');
  else return null;

  if (parts.length !== 3) return null;
  if (parts[0].length === 4) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  } else if (parts[2] && parts[2].length === 4) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return null;
}

function getTATLabel(aging) {
  const n = parseFloat(aging);
  if (isNaN(n) || aging === '' || aging === undefined || aging === null) return '';
  if (n <= 2)  return '0\u20132 Days';
  if (n <= 7)  return '3\u20137 Days';
  if (n <= 10) return '8\u201310 Days';
  if (n <= 14) return '11\u201314 Days';
  if (n <= 30) return '15\u201330 Days';
  return '>30 Days';
}

const MANAGEMENT_LITE_COLUMNS = [
  'No',
  'Service Order No.',
  'ASC Job No',
  'Created',
  'Assigned',
  'Assigned Time',
  'Model',
  'Serial',
  'Wty Status',
  'VOC',
  'REDO',
  'Risk Sensing',
  'RED',
  'High Priority',
  'Customer Name',
  'City',
  'App Date',
  'App Time',
  'Service Type',
  'Status',
  'Reason',
  'B2B',
  'Risk Reason'
];

function scrapeManagementLite(targetDoc = document) {
  const tickets = [];

  let tbody = targetDoc.getElementById('searchContentTableBody');

  if (!tbody) {
    const firstCheckbox = targetDoc.querySelector('input[name="print_id"]');
    if (firstCheckbox) {
      tbody = firstCheckbox.closest('tbody') || firstCheckbox.closest('table');
    }
  }

  // Recursive search in child iframes/frames
  if (!tbody) {
    const iframes = Array.from(targetDoc.querySelectorAll('iframe, frame'));
    for (const frame of iframes) {
      try {
        const frameDoc = frame.contentDocument || frame.contentWindow.document;
        if (!frameDoc) continue;
        const subRes = scrapeManagementLite(frameDoc);
        if (subRes && subRes.tickets && subRes.tickets.length > 0) {
          return subRes;
        }
      } catch (e) {
        // Cross-origin iframe
      }
    }
  }

  if (!tbody) {
    return { tickets: [], columns: MANAGEMENT_LITE_COLUMNS, error: 'Management Lite table not found.' };
  }

  const rows = Array.from(tbody.querySelectorAll('tr'));
  let i = 0;
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  while (i < rows.length) {
    const row1 = rows[i];
    const row2 = (i + 1 < rows.length) ? rows[i + 1] : null;

    const checkbox = row1.querySelector('input[name="print_id"]');
    if (!checkbox) {
      i++;
      continue;
    }

    const cells1 = Array.from(row1.querySelectorAll('td'));
    let serviceOrderNo = checkbox.value ? checkbox.value.trim() : '';
    if (!serviceOrderNo && cells1[1]) {
      serviceOrderNo = cleanText(cells1[1].textContent).replace(/\bEdit\b/gi, '').trim();
    }

    const cells2 = row2 ? Array.from(row2.querySelectorAll('td')) : [];

    const noVal = cleanText(cells1[0]?.textContent) || String(tickets.length + 1);
    const ascJobNo = cleanText(cells1[2]?.textContent) || serviceOrderNo;
    const createdVal = cleanText(cells1[3]?.textContent);
    const assignedVal = cleanText(cells1[4]?.textContent);
    const assignedTime = cleanText(cells1[5]?.textContent);
    const modelVal = cleanText(cells1[6]?.textContent);
    const serialVal = cleanText(cells1[7]?.textContent);
    const wtyVal = cleanText(cells1[8]?.textContent);
    const vocVal = cleanText(cells1[9]?.textContent);
    const redoVal = cleanText(cells1[10]?.textContent);
    const riskSensingVal = cleanText(cells1[11]?.textContent);
    const redVal = cleanText(cells1[12]?.textContent);
    const highPriorityVal = cleanText(cells1[13]?.textContent);

    const custName = cleanText(cells2[0]?.textContent);
    const cityVal = cleanText(cells2[1]?.textContent);
    const appDateVal = cleanText(cells2[2]?.textContent);
    const appTimeVal = cleanText(cells2[3]?.textContent);
    const rawSvcType = cleanText(cells2[4]?.textContent);
    const svcType = convertServiceType(rawSvcType);
    const statusVal = cleanText(cells2[5]?.textContent);
    const reasonVal = cleanText(cells2[6]?.textContent);
    const b2bVal = cleanText(cells2[7]?.textContent);
    const riskReasonVal = cleanText(cells2[8]?.textContent);

    const product = getSamsungCategory(modelVal);

    // Calculate Age / TAT
    let age = '';
    let tat = '';
    const dateForAging = parseDateForAging(assignedVal || createdVal);
    if (dateForAging && !isNaN(dateForAging.getTime())) {
      const pMid = new Date(dateForAging.getFullYear(), dateForAging.getMonth(), dateForAging.getDate());
      age = Math.max(0, Math.floor((todayMid - pMid) / (1000 * 60 * 60 * 24)));
      tat = getTATLabel(age);
    }

    const record = {
      'No': noVal,
      'Service Order No.': serviceOrderNo,
      'Service Order No': serviceOrderNo,
      'SO': serviceOrderNo,
      'ASC Job No': ascJobNo,
      'Created': createdVal,
      'Created Date': createdVal,
      'Date': createdVal || assignedVal || '',
      'Assigned': assignedVal,
      'Assigned Date': assignedVal,
      'Assigned Time': assignedTime,
      'Model': modelVal,
      'Model Name': modelVal,
      'Serial': serialVal,
      'SR.': serialVal,
      'Wty Status': wtyVal,
      'VOC': vocVal,
      'REDO': redoVal,
      'Risk Sensing': riskSensingVal,
      'RED': redVal,
      'High Priority': highPriorityVal,
      'Customer Name': custName,
      'CX Name': custName,
      'City': cityVal,
      'App Date': appDateVal,
      'App Time': appTimeVal,
      'Service Type': svcType,
      'Service Type (Status)': svcType,
      'Status': statusVal,
      'Status (GSPN)': statusVal,
      'Reason': reasonVal,
      'Reason (GSPN)': reasonVal,
      'B2B': b2bVal,
      'Risk Reason': riskReasonVal,
      'Product': product,
      'Age': age,
      'Aging': age,
      'TAT': tat,
      'Eng Name': '',
      'TL Name': ''
    };

    tickets.push(record);
    i += 2;
  }

  return { tickets, columns: MANAGEMENT_LITE_COLUMNS };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeViewMode') {
    try {
      const ticket = parseViewModeTicket();
      if (!ticket) {
        sendResponse({ success: false, error: 'No view-mode ticket found on this page.' });
      } else {
        sendResponse({
          success: true,
          data: [ticket],
          fields: scrapeFieldsFromPage(document),
          columns: getColumnsForTicket(ticket),
          count: 1
        });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (request.action === 'scrapeData') {
    try {
      const result = scrapeAllTickets();
      sendResponse({
        success: true,
        data: result.tickets,
        columns: result.columns,
        count: result.tickets.length
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  if (request.action === 'scrapeInteractionMessages') {
    try {
      const result = scrapeInteractionMessages();
      sendResponse({
        success: true,
        data: result.records,
        columns: result.columns,
        count: result.records.length
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  if (request.action === 'scrapeManagementLite') {
    try {
      const result = scrapeManagementLite();
      if (result.error && (!result.tickets || result.tickets.length === 0)) {
        sendResponse({
          success: false,
          error: result.error
        });
      } else {
        sendResponse({
          success: true,
          data: result.tickets,
          columns: result.columns,
          count: result.tickets.length
        });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  return true; // Keep message channel open for async response
});

/* ========================================================================
 *  SEPARATE DATA EXTRACTION DIALOG (Active Exclusively on Multi-Print URLs)
 *  Target URL: https://biz2.samsungcsportal.com/gspn/operate.do?print_type=SIEL_ENG&ascCode=...
 * ======================================================================== */

const PRODUCT_PREFIX = {
  RR: "REF", RT: "REF", RF: "REF", RS: "REF", RA: "REF", RB: "REF", REF: "REF",
  WA: "WM", WT: "WM", WW: "WM", WD: "WM", WF: "WM", WM: "WM", "W/M": "WM",
  AR: "RAC", AC: "RAC", AJ: "RAC", AM: "RAC", ACN: "RAC", RAC: "RAC",
  CTV: "CTV", UA: "CTV", QA: "CTV", HG: "CTV", PS: "CTV", PN: "CTV", UN: "CTV", UE: "CTV", GU: "CTV", TV: "CTV",
  LH: "DISPLAY", LS: "DISPLAY", DISPLAY: "DISPLAY",
  MC: "MWO", MG: "MWO", MS: "MWO", CE: "MWO", CM: "MWO", MWO: "MWO",
  DW: "DW", DV: "DRYER", DRYER: "DRYER",
  VS: "VACUUM", VR: "VACUUM", VACUUM: "VACUUM",
  AX: "AIR PURIFIER",
  HW: "AUDIO", MX: "AUDIO", HT: "AUDIO", AUDIO: "AUDIO",
  LC: "MONITOR", LSM: "MONITOR", MONITOR: "MONITOR",
  NV: "OVEN", NQ: "OVEN", OVEN: "OVEN",
  NA: "HOB", NZ: "HOB", HOB: "HOB"
};

function getSamsungCategory(model) {
  if (!model) return "UNKNOWN";
  model = model.toUpperCase().trim();
  const prefixes = Object.keys(PRODUCT_PREFIX).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (model.startsWith(prefix)) {
      return PRODUCT_PREFIX[prefix];
    }
  }
  return model;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureProductField(dataArray, columnsArray) {
  if (!Array.isArray(dataArray) || !Array.isArray(columnsArray)) return;
  if (!columnsArray.includes('Product')) {
    const modelIdx = columnsArray.indexOf('Model Name');
    if (modelIdx >= 0) {
      columnsArray.splice(modelIdx + 1, 0, 'Product');
    } else {
      columnsArray.push('Product');
    }
  }
  for (const rec of dataArray) {
    const modelVal = (rec['Model Name'] || rec['Model'] || '').toString();
    rec['Product'] = getSamsungCategory(modelVal);
  }
}

function cleanColumnsAndData(data, columns) {
  if (!Array.isArray(data) || !Array.isArray(columns)) return;
  const keysToDelete = [
    'Remark', 'ASC Job No', 'Created By', 'Service Branch',
    'Date', 'CP/Dealer Ref. No', 'Data Origin', 'Contact Permission'
  ];
  for (let i = columns.length - 1; i >= 0; i--) {
    if (keysToDelete.includes(columns[i])) {
      columns.splice(i, 1);
    }
  }
  for (const rec of data) {
    for (const key of keysToDelete) {
      delete rec[key];
    }
  }
}

function generateExcelHTML(data, columns) {
  return `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>GSPN Data</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    td { mso-number-format:"\\@"; }
    .header { font-weight: bold; background-color: #4f46e5; color: #ffffff; text-align: center; }
  </style>
</head>
<body>
  <table border="1">
    <thead>
      <tr>
        ${columns.map(col => `<th class="header">${escapeHtml(col)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr>
          ${columns.map(col => `<td>${escapeHtml((row[col] || '').toString())}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;
}

function isTargetPrintUrl() {
  const url = window.location.href || '';
  return url.includes('print_type=SIEL_ENG') ||
         url.includes('ServiceRequestMultiPrintCmd') ||
         url.includes('print_data_calls details_html_data') ||
         (url.includes('/gspn/operate.do') && url.includes('print_type='));
}

function initExtractionDialog() {
  if (!isTargetPrintUrl()) return;

  // Attempt to trigger extension action popup via background script
  try {
    chrome.runtime.sendMessage({ action: 'openMainPopup' }).catch(() => {});
  } catch (e) {}

  if (document.getElementById('gspn-extract-dialog-host')) return;

  const host = document.createElement('div');
  host.id = 'gspn-extract-dialog-host';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      display: block !important;
      position: fixed !important;
      top: 16px !important;
      right: 16px !important;
      z-index: 2147483647 !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
      pointer-events: none !important;
    }

    .dialog-container {
      width: 468px;
      height: 645px;
      max-height: 92vh;
      background: #0f172a;
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto !important;
      transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease;
      animation: dialogIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    @keyframes dialogIn {
      from { opacity: 0; transform: translateY(-20px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .dialog-container.minimized {
      height: 46px !important;
      overflow: hidden !important;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      user-select: none;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-icon {
      width: 26px;
      height: 26px;
      background: linear-gradient(135deg, #0056c6 0%, #2563eb 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0, 86, 198, 0.4);
    }

    .header-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.2px;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .ctrl-btn {
      all: unset;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .ctrl-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
    }

    .popup-frame {
      flex: 1;
      width: 100%;
      height: 595px;
      border: none;
      background: #ffffff;
    }
  `;

  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'dialog-container';
  container.innerHTML = `
    <div class="dialog-header">
      <div class="header-left">
        <div class="header-icon">G</div>
        <span class="header-title">GSPN Scraper — Main POPUP</span>
      </div>
      <div class="header-controls">
        <button class="ctrl-btn" id="btnMin" title="Minimize">—</button>
        <button class="ctrl-btn" id="btnClose" title="Close">✕</button>
      </div>
    </div>
    <iframe class="popup-frame" src="${chrome.runtime.getURL('popup.html')}" allow="clipboard-read; clipboard-write"></iframe>
  `;

  shadow.appendChild(container);

  shadow.getElementById('btnMin').addEventListener('click', () => {
    container.classList.toggle('minimized');
    shadow.getElementById('btnMin').textContent = container.classList.contains('minimized') ? '▢' : '—';
  });

  shadow.getElementById('btnClose').addEventListener('click', () => {
    host.remove();
  });
}

// Auto-run dialog initialization on target print URLs
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initExtractionDialog);
} else {
  initExtractionDialog();
}
