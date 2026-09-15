const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../webpage_source/Interaction Messages_list_view_mode_files/main.html');
const html = fs.readFileSync(filePath, 'utf8');

const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

console.log('--- TR 9 (Header) ---');
console.log(trMatches[9]);

console.log('--- TR 10 (Header line 2 or comment head) ---');
console.log(trMatches[10]);

console.log('--- TR 11 (Data Row 1 - Main) ---');
console.log(trMatches[11]);

console.log('--- TR 12 (Data Row 1 - Sub/Comment) ---');
console.log(trMatches[12]);
