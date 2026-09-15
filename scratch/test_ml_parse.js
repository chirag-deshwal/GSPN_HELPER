const fs = require('fs');

const html = fs.readFileSync('webpage_source/manegement_lite_html_data_files/main.html', 'utf8');

const tbodyMatch = html.match(/<tbody id="searchContentTableBody">([\s\S]*?)<\/tbody>/i);
if (!tbodyMatch) {
  console.log('tbody not found');
  process.exit(1);
}

const tbodyContent = tbodyMatch[1];
const trMatches = tbodyContent.match(/<tr[\s\S]*?<\/tr>/gi) || [];
console.log('Total tr tags found:', trMatches.length);

function getCells(trHtml) {
  const cells = [];
  const tdMatches = trHtml.match(/<td[\s\S]*?<\/td>/gi) || [];
  for (const td of tdMatches) {
    const text = td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    cells.push(text);
  }
  return cells;
}

const records = [];
for (let i = 0; i < trMatches.length; i += 2) {
  const tr1 = trMatches[i];
  const tr2 = trMatches[i + 1];
  if (!tr2) break;

  const cells1 = getCells(tr1);
  const cells2 = getCells(tr2);

  const mCheck = tr1.match(/value="([^"]+)"/i);
  const soNo = mCheck ? mCheck[1] : '';

  records.push({
    'No': cells1[0],
    'Service Order No.': soNo,
    'ASC Job No': cells1[2],
    'Created': cells1[3],
    'Assigned': cells1[4],
    'Assigned Time': cells1[5],
    'Model': cells1[6],
    'Serial': cells1[7],
    'Wty Status': cells1[8],
    'VOC': cells1[9],
    'REDO': cells1[10],
    'Risk Sensing': cells1[11],
    'RED': cells1[12],
    'High Priority': cells1[13],
    'Customer Name': cells2[0],
    'City': cells2[1],
    'App Date': cells2[2],
    'App Time': cells2[3],
    'Service Type': cells2[4],
    'Status': cells2[5],
    'Reason': cells2[6],
    'B2B': cells2[7],
    'Risk Reason': cells2[8]
  });
}

console.log('Parsed records count:', records.length);
if (records.length > 0) {
  console.log('First Record:');
  console.log(JSON.stringify(records[0], null, 2));
  console.log('\nLast Record:');
  console.log(JSON.stringify(records[records.length - 1], null, 2));
}
