const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../webpage_source/Interaction Messages_list_view_mode_files/main.html');
const html = fs.readFileSync(filePath, 'utf8');

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

function cleanTdText(tdHtml) {
  if (!tdHtml) return '';
  return tdHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTicketIdentity(ticket) {
  const serviceOrderNo = (ticket?.['Service Order No'] || ticket?.['SO'] || '').toString().trim();

  if (ticket?.['Interaction Code'] !== undefined || ticket?.['Comment'] !== undefined) {
    const code = (ticket['Interaction Code'] || '').toString().trim();
    const created = (ticket['Created Date'] || '').toString().trim();
    const commentSnippet = (ticket['Comment'] || '').toString().trim().substring(0, 30);
    return `im:${serviceOrderNo}:${code}:${created}:${commentSnippet}`.toLowerCase();
  }

  const customerName = (ticket?.['Customer Name'] || ticket?.['CX Name'] || '').toString().trim();

  if (serviceOrderNo) {
    return `so:${serviceOrderNo.toLowerCase()}`;
  }

  if (customerName) {
    return `name:${customerName.toLowerCase()}`;
  }

  return null;
}

function deduplicateRecords(records) {
  if (!Array.isArray(records)) return [];
  const deduplicated = [];
  const seen = new Set();

  for (const item of records) {
    const identity = getTicketIdentity(item);
    if (identity) {
      if (seen.has(identity)) continue;
      seen.add(identity);
    }
    deduplicated.push(item);
  }

  return deduplicated;
}

function parseInteractionMessagesHtml(htmlContent) {
  const records = [];
  const trMatches = htmlContent.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (let i = 0; i < trMatches.length; i++) {
    const tr = trMatches[i];
    if (!tr.includes('td_ac') && !tr.includes('td_al')) continue;

    const rawTds = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (rawTds.length < 5) continue;

    const tds = rawTds.map(cleanTdText);
    const firstColVal = parseInt(tds[0], 10);
    if (isNaN(firstColVal)) continue;

    let serviceOrderNo = tds[1].replace('Edit', '').trim();
    let rawProduct = tds[2] || '';
    let product = getSamsungCategory(rawProduct);

    let interactionCode = '';
    let status = '';
    let createdDate = '';
    let createdBy = '';
    let changedDate = '';
    let changedBy = '';
    let comment = '';
    let feedback = '';

    if (rawTds.length >= 11) {
      comment = tds[3] || '';
      interactionCode = tds[4] || '';
      feedback = tds[5] || '';
      status = tds[6] || '';
      createdDate = tds[7] || '';
      createdBy = tds[8] || '';
      changedDate = tds[9] || '';
      changedBy = tds[10] || '';
    } else {
      interactionCode = tds[3] || '';
      status = tds[4] || '';
      createdDate = tds[5] || '';
      createdBy = tds[6] || '';
      changedDate = tds[7] || '';
      changedBy = tds[8] || '';

      const trSub = trMatches[i + 1];
      if (trSub && trSub.includes('colspan')) {
        const tdsSub = (trSub.match(/<td[\s\S]*?<\/td>/gi) || []).map(cleanTdText);
        if (tdsSub.length >= 1) comment = tdsSub[0] || '';
        if (tdsSub.length >= 2) feedback = tdsSub[1] || '';
        i++;
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

  return records;
}

const rawParsed = parseInteractionMessagesHtml(html);
// Simulate receiving duplicated array from top frame + iframe response
const duplicatedArray = [...rawParsed, ...rawParsed];
console.log('Raw Parsed Count:', rawParsed.length);
console.log('Duplicated Array Count:', duplicatedArray.length);

const cleaned = deduplicateRecords(duplicatedArray);
console.log('Deduplicated Array Count:', cleaned.length);
