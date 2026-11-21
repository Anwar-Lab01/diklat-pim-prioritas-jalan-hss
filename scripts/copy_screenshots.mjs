import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('reports', 'screenshots');
const dest = 'C:\\Users\\Windows 10\\.gemini\\antigravity\\brain\\095cfaf7-c2c0-49da-9cea-74ede958fd94\\screenshots';

if (!fs.existsSync(dest)) {
  fs.mkdirSync(dest, { recursive: true });
}

for (const file of fs.readdirSync(src)) {
  if (file.endsWith('.png')) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
    console.log(`Copied ${file} to artifact dir`);
  }
}
