/**
 * excel.js — Excel export utilities for GSPN Website Tools
 */

/**
 * Convert 0-indexed column number to Excel column letter (e.g. 0 -> A, 4 -> E, 26 -> AA).
 */
function getColumnLetter(colIndex) {
  var letter = '';
  var temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Build an HTML table string from columns and data arrays.
 * @param {string[]} columns - Column headers
 * @param {Object[]} data - Array of row objects
 * @param {string} [templateName] - Template identifier
 * @returns {string} HTML table markup
 */
function buildExcelHTML(columns, data, templateName) {
  var html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; font-family:Calibri, Arial, sans-serif;">';

  var isGgnTemplate = templateName === 'GGN_STANDARD' || templateName === 'GGN_OPEN_PENDING' || templateName === 'GGN Standerd';
  var headerBg = isGgnTemplate ? '#1a56db' : '#4472C4';

  // Find key column letters for formula generation
  var assignedDateIdx = columns.indexOf('Assigned Date');
  if (assignedDateIdx === -1) assignedDateIdx = columns.indexOf('Assigned');
  var agingIdx = columns.indexOf('Aging');
  var modelIdx = columns.indexOf('Model Name');
  if (modelIdx === -1) modelIdx = columns.indexOf('Model');

  var assignedColLetter = assignedDateIdx !== -1 ? getColumnLetter(assignedDateIdx) : '';
  var agingColLetter = agingIdx !== -1 ? getColumnLetter(agingIdx) : '';
  var modelColLetter = modelIdx !== -1 ? getColumnLetter(modelIdx) : '';

  // Header row
  html += '<thead><tr>';
  for (var c = 0; c < columns.length; c++) {
    html += '<th style="background:' + headerBg + ';color:#fff;font-weight:bold;font-size:11pt;padding:6px 10px;white-space:nowrap;border:1px solid #999999;text-align:center;">';
    html += escapeHtml(columns[c]);
    html += '</th>';
  }
  html += '</tr></thead>';

  // Data rows
  html += '<tbody>';
  for (var r = 0; r < data.length; r++) {
    var excelRow = r + 2; // Row 1 is header
    var bgColor = r % 2 === 0 ? '#ffffff' : '#f0f4ff';
    html += '<tr style="background:' + bgColor + ';">';

    for (var c = 0; c < columns.length; c++) {
      var colName = columns[c];
      var val = (data[r][colName] !== undefined && data[r][colName] !== null) ? String(data[r][colName]) : '';

      // Rule 6: Remarks, Sub Remarks, Pending At, Pending Reason must be strictly blank
      if (colName === 'Remarks' || colName === 'Sub Remarks' || colName === 'Pending At' || colName === 'Pending Reason') {
        html += '<td style="padding:4px 8px;font-size:10pt;white-space:nowrap;border:1px solid #cccccc;"></td>';
        continue;
      }

      // Aging column with Excel formula: =TODAY() - AssignedDate
      if (colName === 'Aging') {
        var agingFormula = assignedColLetter ? ('x:f="=TODAY()-' + assignedColLetter + excelRow + '" ') : '';
        html += '<td ' + agingFormula + 'class="num" style="padding:4px 8px;font-size:10pt;white-space:nowrap;border:1px solid #cccccc;text-align:center;">' + escapeHtml(val) + '</td>';
        continue;
      }

      // TAT column with filled colors and Excel IFS formula matching extension (popup.html)
      if (colName === 'TAT') {
        var agingVal = data[r]['Aging'];
        var style = typeof getTATStyle === 'function' ? getTATStyle(agingVal) : { class: '', bg: '', color: '' };
        var tatFormula = agingColLetter
          ? ('x:f="=IFS(' + agingColLetter + excelRow + '<=2,&quot;0–2 Days&quot;,' +
                         agingColLetter + excelRow + '<=7,&quot;3–7 Days&quot;,' +
                         agingColLetter + excelRow + '<=10,&quot;8–10 Days&quot;,' +
                         agingColLetter + excelRow + '<=14,&quot;11–14 Days&quot;,' +
                         agingColLetter + excelRow + '<=30,&quot;15–30 Days&quot;,' +
                         agingColLetter + excelRow + '>30,&quot;>30 Days&quot;)" ')
          : '';
        var inlineStyle = style.bg
          ? ('background-color:' + style.bg + ';color:' + style.color + ';font-weight:bold;')
          : '';
        html += '<td ' + tatFormula + 'class="' + (style.class || '') + '" style="padding:4px 8px;font-size:10pt;white-space:nowrap;border:1px solid #cccccc;text-align:center;' + inlineStyle + '">' + escapeHtml(val) + '</td>';
        continue;
      }

      // Product column with 15-branch nested IF Excel formula
      if (colName === 'Product') {
        var prodFormula = '';
        if (modelColLetter) {
          var mc = modelColLetter + excelRow;
          prodFormula = 'x:f="=IF(LEFT(' + mc + ',1)=&quot;S&quot;,&quot;HHP&quot;,IF(LEFT(' + mc + ',1)=&quot;A&quot;,&quot;AC&quot;,IF(LEFT(' + mc + ',2)=&quot;HT&quot;,&quot;AUD&quot;,IF(LEFT(' + mc + ',2)=&quot;HW&quot;,&quot;AUD&quot;,IF(LEFT(' + mc + ',1)=&quot;Q&quot;,&quot;AV&quot;,IF(LEFT(' + mc + ',1)=&quot;U&quot;,&quot;AV&quot;,IF(LEFT(' + mc + ',1)=&quot;N&quot;,&quot;IT&quot;,IF(LEFT(' + mc + ',2)=&quot;LH&quot;,&quot;IT&quot;,IF(LEFT(' + mc + ',2)=&quot;LC&quot;,&quot;IT&quot;,IF(LEFT(' + mc + ',1)=&quot;M&quot;,&quot;MW&quot;,IF(LEFT(' + mc + ',1)=&quot;R&quot;,&quot;REF&quot;,IF(LEFT(' + mc + ',1)=&quot;W&quot;,&quot;WM&quot;,IF(LEFT(' + mc + ',1)=&quot;D&quot;,&quot;DW&quot;,IF(LEFT(' + mc + ',2)=&quot;CE&quot;,&quot;MW&quot;,IF(LEFT(' + mc + ',2)=&quot;LS&quot;,&quot;IT&quot;,&quot;Other&quot;)))))))))))))))" ';
        }
        html += '<td ' + prodFormula + 'style="padding:4px 8px;font-size:10pt;white-space:nowrap;border:1px solid #cccccc;text-align:center;">' + escapeHtml(val) + '</td>';
        continue;
      }

      var isNumericField = colName.includes('No') || colName.includes('Serial') || colName.includes('Telephone') || colName.includes('Order') || colName === 'SR.';
      var numStyle = isNumericField ? 'mso-number-format:\\@;' : '';
      var alignStyle = (colName === 'S. No' || colName === 'No' || colName === 'No.') ? 'text-align:center;' : '';
      html += '<td style="padding:4px 8px;font-size:10pt;white-space:nowrap;border:1px solid #cccccc;' + numStyle + alignStyle + '">' + escapeHtml(val) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody>';

  html += '</table>';
  return html;
}

/**
 * Download data as an .xls file.
 * @param {string[]} columns
 * @param {Object[]} data
 * @param {string} filenamePrefix
 * @param {string} [templateName]
 */
function downloadExcel(columns, data, filenamePrefix, templateName) {
  var tableHTML = buildExcelHTML(columns, data, templateName);
  var isGgn = templateName === 'GGN_STANDARD' || templateName === 'GGN_OPEN_PENDING' || templateName === 'GGN Standerd';
  var sheetName = isGgn ? 'GGN Standerd' : 'Data';

  var fullHTML = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
    '<x:Name>' + escapeHtml(sheetName) + '</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>' +
    '</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
    '<style>' +
    '  table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; }' +
    '  th { background-color: #1a56db; color: #ffffff; font-weight: bold; font-size: 11pt; padding: 8px 12px; border: 1px solid #999999; text-align: center; white-space: nowrap; }' +
    '  td { font-size: 10pt; padding: 6px 10px; border: 1px solid #cccccc; vertical-align: top; }' +
    '  tr:nth-child(even) td { background-color: #f0f4ff; }' +
    '  .num { mso-number-format:\\@; }' +
    '  .tat-0to2  { background-color: #c6efce !important; color: #276221 !important; font-weight: bold; text-align: center; }' +
    '  .tat-3to7  { background-color: #ffeb9c !important; color: #9c6500 !important; font-weight: bold; text-align: center; }' +
    '  .tat-8to10 { background-color: #ffc7ce !important; color: #9c0006 !important; font-weight: bold; text-align: center; }' +
    '  .tat-11to14{ background-color: #ff0000 !important; color: #ffffff !important; font-weight: bold; text-align: center; }' +
    '  .tat-15to30{ background-color: #c00000 !important; color: #ffffff !important; font-weight: bold; text-align: center; }' +
    '  .tat-gt30  { background-color: #7b0000 !important; color: #ffffff !important; font-weight: bold; text-align: center; }' +
    '</style>' +
    '</head><body>' + tableHTML + '</body></html>';

  var blob = new Blob(['\ufeff' + fullHTML], { type: 'application/vnd.ms-excel;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;

  var baseName = filenamePrefix || 'GSPN_Data';
  if (isGgn && baseName.indexOf('GGN') === -1) {
    baseName += '_GGN_Standerd';
  }
  var fileName = baseName.replace(/__+/g, '_') + '_' + getTimestamp() + '.xls';

  a.download = fileName;
  a.setAttribute('download', fileName);
  document.body.appendChild(a);
  a.click();

  // Allow browser download manager sufficient time to complete before revoking.
  // 100ms was revoking before the download manager started, causing Chrome/Edge
  // to save the file as a raw blob UUID without the .xls extension.
  setTimeout(function() {
    try {
      if (a.parentNode) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch(e) {}
  }, 60000);
}

/**
 * Copy data as tab-separated text to clipboard.
 * @param {string[]} columns
 * @param {Object[]} data
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(columns, data) {
  var lines = [];

  // Header
  lines.push(columns.join('\t'));

  // Data rows
  for (var r = 0; r < data.length; r++) {
    var row = [];
    for (var c = 0; c < columns.length; c++) {
      var col = columns[c];
      // Rule 6: keep blank fields blank on copy
      if (col === 'Remarks' || col === 'Sub Remarks' || col === 'Pending At' || col === 'Pending Reason') {
        row.push('');
      } else {
        row.push(data[r][col] !== undefined && data[r][col] !== null ? data[r][col] : '');
      }
    }
    lines.push(row.join('\t'));
  }

  var text = lines.join('\n');

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback: textarea approach
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
    return ok;
  }
}
