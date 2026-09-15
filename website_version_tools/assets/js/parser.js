/**
 * parser.js — Plain-text AND HTML parsers for GSPN Management Lite & Print Command data
 *
 * Both parsers auto-detect whether the input is HTML (contains <table or <tr tags)
 * or plain text (tab/whitespace-separated values copied from the browser).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGEMENT LITE PARSER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Management Lite data has a specific two-row-per-record structure:
 *
 * HEADER LINE 1: No  Service Order No.  ASC Job No  Created  Assigned  Assigned Time  Model  Serial  Wty Status  VOC  REDO  Risk Sensing  RED  High Priority
 * HEADER LINE 2: Customer Name  City  App Date  App Time  Service Type  Status  Reason  B2B  Risk Reason
 *
 * Then for each record:
 * ROW 1: 1  4441809308 Edit  4441809308  09.04.2026  09.04.2026  17:58:10  WT70M3000UU/TL  M000  Out of Warranty  N    N  N
 * ROW 2: SUMIT KUMAR  GURGAON  09.05.2026  13:00:00  IN-HOME  Engineer Assigned  Repair in progress
 */

var ML_HEADER_ROW1 = [
  'No', 'Service Order No', 'ASC Job No', 'Created', 'Assigned',
  'Assigned Time', 'Model', 'Serial', 'Wty Status', 'VOC',
  'REDO', 'Risk Sensing', 'RED', 'High Priority'
];

var ML_HEADER_ROW2 = [
  'Customer Name', 'City', 'App Date', 'App Time', 'Service Type',
  'Status', 'Reason', 'B2B', 'Risk Reason'
];

function parseManagementLiteText(rawInput) {
  if (!rawInput || !rawInput.trim()) return { columns: [], data: [] };

  var input = rawInput.trim();

  // If it looks like HTML, try DOM parsing
  if (/<table[\s>]/i.test(input) || /<tr[\s>]/i.test(input)) {
    return parseManagementLiteHTML(input);
  }

  return parseManagementLitePlainText(input);
}

function parseManagementLitePlainText(text) {
  var lines = text.split(/\r?\n/);
  var nonEmptyLines = [];

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      nonEmptyLines.push(trimmed);
    }
  }

  if (nonEmptyLines.length === 0) return { columns: [], data: [] };

  // Find header lines — look for lines containing "Service Order No" and "Customer Name"
  var headerRow1Idx = -1;
  var headerRow2Idx = -1;

  for (var i = 0; i < Math.min(nonEmptyLines.length, 10); i++) {
    var upper = nonEmptyLines[i].toUpperCase();
    if (upper.indexOf('SERVICE ORDER NO') !== -1 && upper.indexOf('MODEL') !== -1) {
      headerRow1Idx = i;
    }
    if (upper.indexOf('CUSTOMER NAME') !== -1 && (upper.indexOf('CITY') !== -1 || upper.indexOf('SERVICE TYPE') !== -1)) {
      headerRow2Idx = i;
    }
  }

  // Data lines start after headers if headers exist, or row 0 if no headers were pasted
  var dataStartIdx = 0;
  if (headerRow1Idx !== -1 || headerRow2Idx !== -1) {
    dataStartIdx = Math.max(headerRow1Idx, headerRow2Idx) + 1;
  }

  var dataLines = nonEmptyLines.slice(dataStartIdx);

  // Merge columns
  var allColumns = ML_HEADER_ROW1.concat(ML_HEADER_ROW2);
  allColumns.push('Product');
  var records = [];

  // Process pairs of lines (row1 = primary data, row2 = secondary data)
  for (var i = 0; i < dataLines.length; i += 2) {
    var row1 = dataLines[i];
    var row2 = (i + 1 < dataLines.length) ? dataLines[i + 1] : '';

    var fields1 = splitByTabs(row1);
    var fields2 = splitByTabs(row2);

    // Validate: row1 should start with a number (sequence or SO number)
    if (fields1.length < 2) continue;
    var firstField = fields1[0].trim();
    if (!/^\d+$/.test(firstField)) {
      // Not a valid primary row start — move to next line
      i--;
      continue;
    }

    // Handle space-split artifact: if "Edit" ended up in fields1[2]
    if (fields1.length > 2 && /^edit$/i.test(fields1[2].trim())) {
      fields1.splice(2, 1);
    }

    var record = {};

    // Map row1 fields to ML_HEADER_ROW1
    for (var j = 0; j < ML_HEADER_ROW1.length; j++) {
      var val = (j < fields1.length) ? fields1[j].trim() : '';
      // Clean "Edit" suffix: "4441809308  Edit" → "4441809308"
      if (ML_HEADER_ROW1[j] === 'Service Order No') {
        val = val.replace(/\s*Edit\s*$/i, '').trim();
      }
      record[ML_HEADER_ROW1[j]] = val;
    }

    // Map row2 fields to ML_HEADER_ROW2
    for (var j = 0; j < ML_HEADER_ROW2.length; j++) {
      var r2Val = (j < fields2.length) ? fields2[j].trim() : '';
      if (ML_HEADER_ROW2[j] === 'Service Type' && typeof convertServiceType === 'function') {
        r2Val = convertServiceType(r2Val);
      }
      record[ML_HEADER_ROW2[j]] = r2Val;
    }

    if (record['Service Type']) {
      record['Service Type (Status)'] = record['Service Type'];
    }
    if (record['Status']) {
      record['Status (GSPN)'] = record['Status'];
    }
    if (record['Reason']) {
      record['Reason (GSPN)'] = record['Reason'];
    }

    // Add product category
    record['Product'] = getProductCategory(record['Model'] || '');
    record['Service Order No.'] = record['Service Order No'] || '';

    // Split Assigned and App Date if combined with time
    if (record['Assigned'] && typeof splitDateTime === 'function') {
      var sAssigned = splitDateTime(record['Assigned']);
      if (sAssigned.time && !record['Assigned Time']) {
        record['Assigned'] = sAssigned.date;
        record['Assigned Time'] = sAssigned.time;
      }
    }
    if (record['App Date'] && typeof splitDateTime === 'function') {
      var sApp = splitDateTime(record['App Date']);
      if (sApp.time && !record['App Time']) {
        record['App Date'] = sApp.date;
        record['App Time'] = sApp.time;
      }
    }

    records.push(record);
  }

  return { columns: allColumns, data: records };
}

function parseManagementLiteHTML(html) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var rows = doc.querySelectorAll('tr');
  if (!rows || rows.length < 3) return { columns: [], data: [] };

  var allColumns = ML_HEADER_ROW1.concat(ML_HEADER_ROW2);
  allColumns.push('Product');
  var records = [];

  // Skip header rows (first 2), then process pairs
  for (var i = 2; i < rows.length; i += 2) {
    var cells1 = rows[i].querySelectorAll('td');
    var cells2 = (i + 1 < rows.length) ? rows[i + 1].querySelectorAll('td') : [];

    if (cells1.length < 3) continue;

    var record = {};
    for (var j = 0; j < ML_HEADER_ROW1.length; j++) {
      var val = (j < cells1.length) ? (cells1[j].textContent || '').trim() : '';
      if (ML_HEADER_ROW1[j] === 'Service Order No') {
        val = val.replace(/\s*Edit\s*$/i, '').trim();
      }
      record[ML_HEADER_ROW1[j]] = val;
    }
    for (var j = 0; j < ML_HEADER_ROW2.length; j++) {
      var r2Val = (j < cells2.length) ? (cells2[j].textContent || '').trim() : '';
      if (ML_HEADER_ROW2[j] === 'Service Type' && typeof convertServiceType === 'function') {
        r2Val = convertServiceType(r2Val);
      }
      record[ML_HEADER_ROW2[j]] = r2Val;
    }
    if (record['Service Type']) {
      record['Service Type (Status)'] = record['Service Type'];
    }
    if (record['Status']) {
      record['Status (GSPN)'] = record['Status'];
    }
    if (record['Reason']) {
      record['Reason (GSPN)'] = record['Reason'];
    }
    record['Product'] = getProductCategory(record['Model'] || '');
    record['Service Order No.'] = record['Service Order No'] || '';

    // Split Assigned and App Date if combined with time
    if (record['Assigned'] && typeof splitDateTime === 'function') {
      var sAssigned = splitDateTime(record['Assigned']);
      if (sAssigned.time && !record['Assigned Time']) {
        record['Assigned'] = sAssigned.date;
        record['Assigned Time'] = sAssigned.time;
      }
    }
    if (record['App Date'] && typeof splitDateTime === 'function') {
      var sApp = splitDateTime(record['App Date']);
      if (sApp.time && !record['App Time']) {
        record['App Date'] = sApp.date;
        record['App Time'] = sApp.time;
      }
    }

    records.push(record);
  }

  return { columns: allColumns, data: records };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PRINT COMMAND PARSER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Print Command data is structured as repeated key-value blocks per customer.
 * Each block looks like tab-separated label/value pairs:
 *
 * Customer Name\tPankaj Ahlawat\tService Order No\t4441813170\tCustomer No\t6874593500
 * Address\t...\tModel Name\tWA80F08S2CTL
 * ...
 * Symptom 1\t...\tSymptom 2\t...\tSymptom 3\t...
 * 1st Service Comment\t...
 * Remark\t...
 */

var PC_KNOWN_FIELDS = [
  'Customer Name', 'Service Order No', 'Customer No',
  'Address', 'Model Name',
  'E-Mail', 'Engineer',
  'Telephone(Home)', 'Customer Preferred Date', 'Service Type',
  'Telephone(Office)', 'Purchase Date', 'Appointment Date',
  'Telephone(Mobile)', 'ASC Assigned',
  'Symptom 1', 'Symptom 2', 'Symptom 3',
  '1st Service Comment', 'Remark'
];

var PC_OUTPUT_COLUMNS = [
  'Service Order No', 'Customer Name', 'Customer No', 'Address',
  'Model Name', 'Product', 'Engineer',
  'Telephone(Home)', 'Telephone(Office)', 'Telephone(Mobile)', 'E-Mail',
  'Service Type', 'Customer Preferred Date', 'Purchase Date',
  'Appointment Date', 'App Date', 'App Time',
  'ASC Assigned', 'Assigned', 'Assigned Time',
  'Symptom 1', 'Symptom 2', 'Symptom 3',
  '1st Service Comment', 'Remark'
];

function parsePrintCommandText(rawInput) {
  if (!rawInput || !rawInput.trim()) return { columns: [], data: [] };

  var input = rawInput.trim();

  // If it looks like HTML, try DOM parsing
  if (/<table[\s>]/i.test(input) || /<tr[\s>]/i.test(input)) {
    return parsePrintCommandHTML(input);
  }

  return parsePrintCommandPlainText(input);
}

function parsePrintCommandPlainText(text) {
  var lines = text.split(/\r?\n/);

  // Filter out noise lines (print header/footer, notes, empty lines at very top)
  var filteredLines = [];
  var foundFirstBlock = false;
  var isBlockStartRegex = /^Customer\s+Name(?:\t|\s{2,}|\s*:|\s*$)/i;

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (!foundFirstBlock) {
      if (isBlockStartRegex.test(trimmed)) {
        foundFirstBlock = true;
      } else if (/^\*Note/i.test(trimmed) || /^Print$/i.test(trimmed) || /^Close$/i.test(trimmed) || trimmed === '') {
        continue;
      }
    }
    if (foundFirstBlock) {
      filteredLines.push(lines[i]);
    }
  }

  if (filteredLines.length === 0) return { columns: [], data: [] };

  // Split into blocks: each block starts with "Customer Name"
  var blocks = [];
  var currentBlock = [];

  for (var i = 0; i < filteredLines.length; i++) {
    var trimmed = filteredLines[i].trim();
    if (isBlockStartRegex.test(trimmed) && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [];
    }
    if (trimmed.length > 0) {
      currentBlock.push(trimmed);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  var records = [];

  for (var b = 0; b < blocks.length; b++) {
    var record = parseOneBlock(blocks[b]);
    if (record && record['Service Order No']) {
      // Split ASC Assigned into Date and Time
      if (record['ASC Assigned']) {
        var sAssigned = splitDateTime(record['ASC Assigned']);
        record['Assigned'] = sAssigned.date;
        record['Assigned Time'] = sAssigned.time;
      }
      // Split Appointment Date into Date and Time
      if (record['Appointment Date']) {
        var sApp = splitDateTime(record['Appointment Date']);
        record['App Date'] = sApp.date;
        record['App Time'] = sApp.time;
      }

      record['No'] = b + 1;
      record['Service Order No.'] = record['Service Order No'] || '';
      record['ASC Job No'] = record['Customer No'] || '';
      record['Model'] = record['Model Name'] || '';
      record['Product'] = getProductCategory(record['Model Name'] || '');
      record['Serial'] = record['Serial'] || '';
      record['Wty Status'] = record['Wty Status'] || '';
      record['VOC'] = record['Symptom 1'] || '';

      if (record['Service Type'] && typeof convertServiceType === 'function') {
        record['Service Type'] = convertServiceType(record['Service Type']);
      }
      if (record['Service Type']) {
        record['Service Type (Status)'] = record['Service Type'];
      }

      if (!record['City'] && record['Address']) {
        var cityMatch = record['Address'].match(/\b(GURGAON|GURUGRAM|DELHI|NEW DELHI|NOIDA|FARIDABAD|GHAZIABAD|MANESAR)\b/i);
        if (cityMatch) record['City'] = cityMatch[1].toUpperCase();
      }

      records.push(record);
    }
  }

  return { columns: PC_OUTPUT_COLUMNS, data: records };
}

/**
 * Parse a single customer block (array of lines) into a record object.
 * Handles tab-separated, space-separated, and colon-separated label-value pairs.
 */
function parseOneBlock(lines) {
  var record = {};

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var parts = splitByTabs(line);

    // Walk through parts looking for known field names
    var j = 0;
    while (j < parts.length) {
      var candidateLabel = parts[j].trim();

      // Also handle "Label: Value" within a single token
      var colonIdx = candidateLabel.indexOf(':');
      if (colonIdx !== -1) {
        var beforeColon = candidateLabel.substring(0, colonIdx).trim();
        var afterColon = candidateLabel.substring(colonIdx + 1).trim();
        var matchedColonField = matchKnownField(beforeColon);
        if (matchedColonField) {
          if (matchedColonField === 'Service Type' && typeof convertServiceType === 'function') {
            afterColon = convertServiceType(afterColon);
          }
          record[matchedColonField] = afterColon;
          j++;
          continue;
        }
      }

      var matchedField = matchKnownField(candidateLabel);

      if (matchedField) {
        // Collect value parts until we hit another known field
        j++;
        var valueParts = [];
        while (j < parts.length) {
          var nextLabel = parts[j].trim();
          // Check colon format in next token as well
          var nextColonIdx = nextLabel.indexOf(':');
          if (nextColonIdx !== -1 && matchKnownField(nextLabel.substring(0, nextColonIdx).trim())) {
            break;
          }
          if (matchKnownField(nextLabel)) break;
          valueParts.push(parts[j]);
          j++;
        }
        var value = valueParts.join(' ').trim();
        // Remove leading colon if present
        value = value.replace(/^:\s*/, '');
        if (matchedField === 'Service Type' && typeof convertServiceType === 'function') {
          value = convertServiceType(value);
        }
        record[matchedField] = value;
      } else {
        j++;
      }
    }
  }

  return record;
}

/**
 * Match a candidate string against known GSPN field labels (case-insensitive).
 * Strips punctuation like trailing colons.
 * Returns the canonical field name or null.
 */
function matchKnownField(candidate) {
  if (!candidate) return null;
  var c = candidate.trim().replace(/:$/, '').trim();
  if (!c) return null;

  for (var i = 0; i < PC_KNOWN_FIELDS.length; i++) {
    if (c.toLowerCase() === PC_KNOWN_FIELDS[i].toLowerCase()) {
      return PC_KNOWN_FIELDS[i];
    }
  }
  return null;
}

function parsePrintCommandHTML(html) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var tables = doc.querySelectorAll('table');
  var records = [];

  for (var t = 0; t < tables.length; t++) {
    var rows = tables[t].querySelectorAll('tr');
    var record = {};
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('td, th');
      for (var c = 0; c < cells.length - 1; c++) {
        var label = (cells[c].textContent || '').trim();
        var matched = matchKnownField(label);
        if (matched) {
          record[matched] = (cells[c + 1].textContent || '').trim();
          c++; // skip value cell
        }
      }
    }
    if (record['Service Order No']) {
      // Split ASC Assigned into Date and Time
      if (record['ASC Assigned']) {
        var sAssigned = splitDateTime(record['ASC Assigned']);
        record['Assigned'] = sAssigned.date;
        record['Assigned Time'] = sAssigned.time;
      }
      // Split Appointment Date into Date and Time
      if (record['Appointment Date']) {
        var sApp = splitDateTime(record['Appointment Date']);
        record['App Date'] = sApp.date;
        record['App Time'] = sApp.time;
      }

      record['No'] = records.length + 1;
      record['Service Order No.'] = record['Service Order No'] || '';
      record['ASC Job No'] = record['Customer No'] || '';
      record['Model'] = record['Model Name'] || '';
      record['Product'] = getProductCategory(record['Model Name'] || '');
      record['Serial'] = record['Serial'] || '';
      record['Wty Status'] = record['Wty Status'] || '';
      record['VOC'] = record['Symptom 1'] || '';

      if (record['Service Type'] && typeof convertServiceType === 'function') {
        record['Service Type'] = convertServiceType(record['Service Type']);
      }
      if (record['Service Type']) {
        record['Service Type (Status)'] = record['Service Type'];
      }

      if (!record['City'] && record['Address']) {
        var cityMatch = record['Address'].match(/\b(GURGAON|GURUGRAM|DELHI|NEW DELHI|NOIDA|FARIDABAD|GHAZIABAD|MANESAR)\b/i);
        if (cityMatch) record['City'] = cityMatch[1].toUpperCase();
      }

      records.push(record);
    }
  }

  return { columns: PC_OUTPUT_COLUMNS, data: records };
}


// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Split a line by tab characters. If no tabs found, try multi-space splitting.
 */
function splitByTabs(line) {
  if (!line) return [];

  // If line contains tabs, split by tab
  if (line.indexOf('\t') !== -1) {
    return line.split('\t');
  }

  // Fallback: split by 2+ spaces (common in copy-pasted text)
  return line.split(/\s{2,}/);
}
