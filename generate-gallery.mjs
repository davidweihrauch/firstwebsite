
// generate-gallery.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve('./images'); // adjust if needed
const outFile = path.resolve('./gallery.json');
const allowed = new Set(['.jpg','.jpeg','.png','.gif','.webp','.avif']);

async function listImages(dir, baseUrl) {
  const out = [];
  async function walk(p) {
    const entries = await fs.readdir(p, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) await walk(full);
      else {
        const ext = path.extname(ent.name).toLowerCase();
        if (!allowed.has(ext)) continue;
        const rel = path.relative(rootDir, full).split(path.sep).join('/');
        out.push(`${baseUrl}/${rel}`);
      }
    }
  }
  await walk(dir);
  out.sort();
  return out;
}

// baseUrl should be the public URL to your images folder:
const baseUrl = './images'; // e.g., if uploaded to site root

const urls = await listImages(rootDir, baseUrl);
await fs.writeFile(outFile, JSON.stringify(urls, null, 2), 'utf8');
console.log(`Wrote ${urls.length} images to ${outFile}`);
