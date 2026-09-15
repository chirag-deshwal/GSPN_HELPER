const fs = require('fs');

// Read main.html which represents the actual Management Lite webpage
const html = fs.readFileSync('webpage_source/manegement_lite_html_data_files/main.html', 'utf8');

function getSamsungCategory(model) {
  if (!model) return "Other";
  const m = String(model).toUpperCase().trim();
  if (!m) return "Other";

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
  if (str.includes('00.00.0000') || str.includes('00/00/0000') || str.includes('00-00-0000')) {
    return null;
  }
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

function formatDateDDMMYYYY(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '';
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const GGN_TRIM_DATA_ML_COLUMNS = [
  'No',
  'ASC Job No',
  'Date',
  'Model',
  'Serial',
  'Wty Status',
  'Customer Name',
  'City',
  'App Date',
  'App Time',
  'Service Type',
  'Status',
  'Reason',
  'Age',
  'TAT',
  'Product',
  'Eng Name',
  'TL Name'
];

function generateExcelHTMLTrimDataML(data) {
  const cols = GGN_TRIM_DATA_ML_COLUMNS;
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let html = `
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
          <x:Name>GGN_TRIM_DATA_ML</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table { border-collapse: collapse; }
    th {
      background-color: #334155;
      color: #ffffff;
      font-weight: bold;
      font-size: 10pt;
      padding: 8px 12px;
      border: 1px solid #475569;
      text-align: center;
      white-space: nowrap;
    }
    td {
      font-size: 10pt;
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    .num { mso-number-format:\\@; }
    .center { text-align: center; }
    .tat-0to2  { background-color: #c6efce; color: #276221; font-weight: bold; text-align: center; }
    .tat-3to7  { background-color: #ffeb9c; color: #9c6500; font-weight: bold; text-align: center; }
    .tat-8to10 { background-color: #ffc7ce; color: #9c0006; font-weight: bold; text-align: center; }
    .tat-11to14{ background-color: #ff0000; color: #ffffff; font-weight: bold; text-align: center; }
    .tat-15to30{ background-color: #c00000; color: #ffffff; font-weight: bold; text-align: center; }
    .tat-gt30  { background-color: #7b0000; color: #ffffff; font-weight: bold; text-align: center; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>`;

  for (const col of cols) {
    html += `\n        <th>${escapeHtml(col)}</th>`;
  }
  html += `
      </tr>
    </thead>
    <tbody>`;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    html += `\n      <tr>`;

    // 1. No
    const noVal = String(i + 1);
    html += `\n        <td class="center">${escapeHtml(noVal)}</td>`;

    // 2. ASC Job No
    const ascJobVal = (row['ASC Job No'] || row['Service Order No.'] || row['Service Order No'] || row['SO'] || '').toString().trim();
    html += `\n        <td class="num">${escapeHtml(ascJobVal)}</td>`;

    // 3. Date
    const dateVal = (row['Date'] || row['Created'] || row['Created Date'] || row['Assigned'] || formatDateDDMMYYYY(today)).toString().trim();
    html += `\n        <td class="center">${escapeHtml(dateVal)}</td>`;

    // 4. Model
    const modelVal = (row['Model'] || row['Model Name'] || '').toString().trim();
    html += `\n        <td class="num">${escapeHtml(modelVal)}</td>`;

    // 5. Serial
    const serialVal = (row['Serial'] || row['SR.'] || '').toString().trim();
    html += `\n        <td class="num">${escapeHtml(serialVal)}</td>`;

    // 6. Wty Status
    const wtyVal = (row['Wty Status'] || '').toString().trim();
    html += `\n        <td class="center">${escapeHtml(wtyVal)}</td>`;

    // 7. Customer Name
    const custVal = (row['Customer Name'] || row['CX Name'] || '').toString().trim();
    html += `\n        <td>${escapeHtml(custVal)}</td>`;

    // 8. City
    const cityVal = (row['City'] || '').toString().trim();
    html += `\n        <td>${escapeHtml(cityVal)}</td>`;

    // 9. App Date
    const appDateVal = (row['App Date'] || '').toString().trim();
    html += `\n        <td class="center">${escapeHtml(appDateVal)}</td>`;

    // 10. App Time
    const appTimeVal = (row['App Time'] || '').toString().trim();
    html += `\n        <td class="center">${escapeHtml(appTimeVal)}</td>`;

    // 11. Service Type
    const svcTypeVal = (row['Service Type'] || row['Service Type (Status)'] || '').toString().trim();
    html += `\n        <td>${escapeHtml(svcTypeVal)}</td>`;

    // 12. Status
    const statusVal = (row['Status'] || row['Status (GSPN)'] || '').toString().trim();
    html += `\n        <td>${escapeHtml(statusVal)}</td>`;

    // 13. Reason
    const reasonVal = (row['Reason'] || row['Reason (GSPN)'] || '').toString().trim();
    html += `\n        <td>${escapeHtml(reasonVal)}</td>`;

    // 14. Age
    let ageVal = row['Age'] !== undefined && row['Age'] !== '' ? row['Age'] : (row['Aging'] !== undefined ? row['Aging'] : '');
    if (ageVal === '' || ageVal === undefined || isNaN(ageVal)) {
      const dateForAging = parseDateForAging(row['Assigned'] || row['Created'] || row['Date']);
      if (dateForAging && !isNaN(dateForAging.getTime())) {
        const pMid = new Date(dateForAging.getFullYear(), dateForAging.getMonth(), dateForAging.getDate());
        ageVal = Math.max(0, Math.floor((todayMid - pMid) / (1000 * 60 * 60 * 24)));
      } else {
        ageVal = '';
      }
    }
    html += `\n        <td class="center">${escapeHtml(String(ageVal))}</td>`;

    // 15. TAT
    const tatLabel = row['TAT'] || getTATLabel(ageVal);
    let tatClass = '';
    const n = parseFloat(ageVal);
    if (!isNaN(n)) {
      if (n <= 2)  tatClass = 'tat-0to2';
      else if (n <= 7)  tatClass = 'tat-3to7';
      else if (n <= 10) tatClass = 'tat-8to10';
      else if (n <= 14) tatClass = 'tat-11to14';
      else if (n <= 30) tatClass = 'tat-15to30';
      else              tatClass = 'tat-gt30';
    }
    html += `\n        <td class="${tatClass}">${escapeHtml(tatLabel)}</td>`;

    // 16. Product
    const prodVal = row['Product'] || getSamsungCategory(modelVal);
    html += `\n        <td class="center">${escapeHtml(prodVal)}</td>`;

    // 17. Eng Name
    const engVal = (row['Eng Name'] || row['Engineer'] || '').toString().trim();
    html += `\n        <td>${escapeHtml(engVal)}</td>`;

    // 18. TL Name
    const tlVal = (row['TL Name'] || '').toString().trim();
    html += `\n        <td>${escapeHtml(tlVal)}</td>`;

    html += `\n      </tr>`;
  }

  html += `
    </tbody>
  </table>
</body>
</html>`;

  return html;
}

// Parse
const tbodyMatch = html.match(/<tbody id="searchContentTableBody">([\s\S]*?)<\/tbody>/i);
const tbodyContent = tbodyMatch[1];
const trMatches = tbodyContent.match(/<tr[\s\S]*?<\/tr>/gi) || [];

function getCells(trHtml) {
  const cells = [];
  const tdMatches = trHtml.match(/<td[\s\S]*?<\/td>/gi) || [];
  for (const td of tdMatches) {
    const text = td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    cells.push(text);
  }
  return cells;
}

const tickets = [];
const today = new Date();
const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

for (let i = 0; i < trMatches.length; i += 2) {
  const tr1 = trMatches[i];
  const tr2 = trMatches[i + 1];
  if (!tr2) break;

  const cells1 = getCells(tr1);
  const cells2 = getCells(tr2);

  const mCheck = tr1.match(/value="([^"]+)"/i);
  const serviceOrderNo = mCheck ? mCheck[1] : '';

  const noVal = cells1[0] || String(tickets.length + 1);
  const ascJobNo = cells1[2] || serviceOrderNo;
  const createdVal = cells1[3];
  const assignedVal = cells1[4];
  const assignedTime = cells1[5];
  const modelVal = cells1[6];
  const serialVal = cells1[7];
  const wtyVal = cells1[8];
  const vocVal = cells1[9];
  const redoVal = cells1[10];
  const riskSensingVal = cells1[11];
  const redVal = cells1[12];
  const highPriorityVal = cells1[13];

  const custName = cells2[0];
  const cityVal = cells2[1];
  const appDateVal = cells2[2];
  const appTimeVal = cells2[3];
  const rawSvcType = cells2[4];
  const svcType = convertServiceType(rawSvcType);
  const statusVal = cells2[5];
  const reasonVal = cells2[6];
  const b2bVal = cells2[7];
  const riskReasonVal = cells2[8];

  const product = getSamsungCategory(modelVal);

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
}

const excel = generateExcelHTMLTrimDataML(tickets);
fs.writeFileSync('scratch/test_output_ml.xls', excel, 'utf8');
console.log('Successfully written test_output_ml.xls with size:', excel.length, 'bytes');

// Check that all 18 headers are in the html
for (const h of GGN_TRIM_DATA_ML_COLUMNS) {
  if (!excel.includes(`<th>${h}</th>`)) {
    console.error('Missing header in Excel HTML:', h);
    process.exit(1);
  }
}
console.log('All 18 headers verified in generated Excel HTML!');
console.log('Sheet name verified:', excel.includes('<x:Name>GGN_TRIM_DATA_ML</x:Name>'));
