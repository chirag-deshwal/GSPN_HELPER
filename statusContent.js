/**
 * GSPN Data Scraper - Status Content Script
 * Parses the Service Order Management Light page
 * (ServiceOrderListLite.jsp) to extract status data.
 *
 * Table structure: dual-row per ticket inside <tbody id="searchContentTableBody">
 * Row 1: [No] [SO No + checkbox] [ASC Job No] [Created] [Assigned] [Assigned Time] [Model] [Serial] [Wty Status] [VOC] [REDO*] [Risk Sensing] [RED*] [High Priority*]
 * Row 2: [Customer Name (colspan=2)] [City] [App Date] [App Time] [Service Type] [Status] [Reason] [B2B] [Risk Reason]
 * (* = rowspan=2, these are in Row 1 only)
 */

/**
 * Clean text: trim, collapse whitespace, remove &nbsp;
 */
function cleanStatusText(text) {
  if (!text) return '';
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse the status table and return an array of status records.
 * Each record is keyed by Service Order No.
 */
function scrapeStatusData(targetDoc = document) {
  const records = [];

  // 1. Try to find the table body directly by ID
  let tbody = targetDoc.getElementById('searchContentTableBody');

  // 2. Fallback: Search for any checkbox input with name="print_id" and get its container tbody/table
  if (!tbody) {
    const firstCheckbox = targetDoc.querySelector('input[name="print_id"]');
    if (firstCheckbox) {
      tbody = firstCheckbox.closest('tbody') || firstCheckbox.closest('table');
    }
  }

  // 3. Fallback: If not found directly, search inside child frames/iframes
  if (!tbody) {
    const frames = targetDoc.querySelectorAll('iframe, frame');
    for (const frame of frames) {
      try {
        const frameDoc = frame.contentDocument || frame.contentWindow.document;
        if (!frameDoc) continue;
        const subRes = scrapeStatusData(frameDoc);
        if (subRes && subRes.records && subRes.records.length > 0) {
          return subRes;
        }
      } catch (e) {
        // Cross-origin frame access blocked, skip
      }
    }
  }

  if (!tbody) {
    return { records: [], error: 'Status table not found. Make sure you are on the Service Order Management Light page with data loaded.' };
  }

  const rows = tbody.querySelectorAll('tr');

  // Process rows in pairs (Row 1 = data row, Row 2 = detail row)
  let i = 0;
  while (i < rows.length) {
    const row1 = rows[i];
    const row2 = (i + 1 < rows.length) ? rows[i + 1] : null;

    // Row 1 should contain a checkbox with the Service Order No
    const checkbox = row1.querySelector('input[name="print_id"]');
    if (!checkbox) {
      i++;
      continue;
    }

    const serviceOrderNo = checkbox.value;
    if (!serviceOrderNo) {
      i += 2;
      continue;
    }

    // Parse Row 1 cells (skip the first cell which is the row number with rowspan=2)
    const cells1 = row1.querySelectorAll('td');
    // Cell indices in Row 1 (0-based):
    // 0: No (rowspan=2)
    // 1: SO No + checkbox + Edit link
    // 2: ASC Job No
    // 3: Created Date
    // 4: Assigned Date
    // 5: Assigned Time
    // 6: Model
    // 7: Serial
    // 8: Wty Status
    // 9: VOC
    // 10: REDO (rowspan=2)
    // 11: Risk Sensing
    // 12: RED (rowspan=2)
    // 13: High Priority (rowspan=2)

    const record = {
      'Service Order No': serviceOrderNo,
      'ASC Job No (Status)': cleanStatusText(cells1[2]?.textContent),
      'Created Date': cleanStatusText(cells1[3]?.textContent),
      'Assigned Date': cleanStatusText(cells1[4]?.textContent),
      'Assigned Time': cleanStatusText(cells1[5]?.textContent),
      'Model (Status)': cleanStatusText(cells1[6]?.textContent),
      'Serial (Status)': cleanStatusText(cells1[7]?.textContent),
      // SR. = Serial Number from management lite page
      'SR.': cleanStatusText(cells1[7]?.textContent),
      'Wty Status': cleanStatusText(cells1[8]?.textContent),
      'VOC': cleanStatusText(cells1[9]?.textContent),
      'REDO': cleanStatusText(cells1[10]?.textContent),
    };

    // Parse Row 2 cells
    if (row2) {
      const cells2 = row2.querySelectorAll('td');
      // Row 2 doesn't have the No/REDO/RED/High Priority cells (they're rowspan=2)
      // Cell indices in Row 2 (0-based):
      // 0: Customer Name (colspan=2)
      // 1: City
      // 2: App Date
      // 3: App Time
      // 4: Service Type
      // 5: Status
      // 6: Reason
      // 7: B2B
      // 8: Risk Reason

      record['Customer Name (Status)'] = cleanStatusText(cells2[0]?.textContent);
      record['City'] = cleanStatusText(cells2[1]?.textContent);
      record['App Date'] = cleanStatusText(cells2[2]?.textContent);
      record['App Time'] = cleanStatusText(cells2[3]?.textContent);
      record['Service Type (Status)'] = cleanStatusText(cells2[4]?.textContent);
      record['Status (GSPN)'] = cleanStatusText(cells2[5]?.textContent);
      record['Reason (GSPN)'] = cleanStatusText(cells2[6]?.textContent);
      record['B2B'] = cleanStatusText(cells2[7]?.textContent);
    }

    records.push(record);
    i += 2; // Move to next ticket pair
  }

  return { records, error: null };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeStatus') {
    try {
      const result = scrapeStatusData();
      if (result.error) {
        sendResponse({
          success: false,
          error: result.error
        });
      } else {
        sendResponse({
          success: true,
          data: result.records,
          count: result.records.length
        });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }
  return true;
});
