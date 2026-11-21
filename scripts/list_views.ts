import * as fs from 'fs';
const js = fs.readFileSync('src/public/app.js', 'utf8');
const lines = js.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('switchView') || l.includes('setActiveView') || l.includes('showView') || l.includes('view-dashboard')) {
    console.log(`Line ${idx + 1}: ${l.trim()}`);
  }
});
