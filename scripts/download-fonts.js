import fs from 'fs';
import https from 'https';
import path from 'path';

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts');

if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

const fontsToDownload = [
  {
    name: 'Inter-Regular.ttf',
    url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Regular.ttf'
  },
  {
    name: 'Inter-Medium.ttf',
    url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Medium.ttf'
  },
  {
    name: 'Inter-Bold.ttf',
    url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Bold.ttf'
  }
];

console.log('Downloading Inter fonts for PDF generation...');

fontsToDownload.forEach(font => {
  const dest = path.join(FONTS_DIR, font.name);
  const file = fs.createWriteStream(dest);
  
  https.get(font.url, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log(`Downloaded: ${font.name}`);
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    console.error(`Error downloading ${font.name}:`, err.message);
  });
});
