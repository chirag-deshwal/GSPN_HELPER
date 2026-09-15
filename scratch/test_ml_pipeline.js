const fs = require('fs');

// 1. Read main.html which represents the actual Management Lite webpage
const html = fs.readFileSync('webpage_source/manegement_lite_html_data_files/main.html', 'utf8');

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

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

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

console.log('Total scraped:', tickets.length);

// Verify GGN_TRIM_DATA_ML generation
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

console.log('\nTesting First Record mapping to GGN_TRIM_DATA_ML:');
const r0 = tickets[0];
const mapped0 = {};
for (const c of GGN_TRIM_DATA_ML_COLUMNS) {
  mapped0[c] = r0[c];
}
console.log(JSON.stringify(mapped0, null, 2));

console.log('\nColumn Count in GGN_TRIM_DATA_ML:', GGN_TRIM_DATA_ML_COLUMNS.length);
console.log('Columns match user specification:', JSON.stringify(GGN_TRIM_DATA_ML_COLUMNS));
