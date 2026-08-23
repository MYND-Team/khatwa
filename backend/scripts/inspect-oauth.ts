import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('secrets');
console.log('Files in secrets/:', files);

for (const file of files) {
  if (file.endsWith('.json')) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join('secrets', file), 'utf-8'));
      const topKeys = Object.keys(data);
      console.log('File:', file);
      console.log('  Top-level keys:', topKeys);
      if (data.web) {
        console.log('  OAuth type: WEB APPLICATION');
        console.log('  Redirect URIs:', data.web.redirect_uris);
      } else if (data.installed) {
        console.log('  OAuth type: INSTALLED / DESKTOP');
        console.log('  Redirect URIs:', data.installed.redirect_uris);
      } else if (data.type === 'service_account') {
        console.log('  Type: Service Account');
      }
    } catch (e: any) {
      console.error('  Error parsing file:', file, e?.message);
    }
  }
}
