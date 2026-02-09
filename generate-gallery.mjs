
// generate-gallery.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// exifr is CommonJS → import default, then grab parse
import exifrPkg from 'exifr';
const { parse: exifParse } = exifrPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve('./images');        // adjust if needed
const outFile  = path.resolve('./gallery.json');  // will write objects with takenAt
const baseUrl  = './images';                      // public URL prefix in your site

const allowed = new Set(['.jpg','.jpeg','.png','.gif','.webp','.avif']);

async function listImageFiles(dir) {
  const files = [];
  async function walk(p) {
    const entries = await fs.readdir(p, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else {
        const ext = path.extname(ent.name).toLowerCase();
        if (allowed.has(ext)) files.push(full);
      }
    }
  }
  await walk(dir);
  files.sort(); // deterministic order
  return files;
}

function toPublicUrl(fullPath) {
  const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
  return `${baseUrl}/${rel}`;
}

function guessDateFromFilename(filename) {
  // Supports common camera patterns:
  // 2024-09-05, 20240905, 2024_09_05, 2024-09-05_14-22-31, IMG_20240905_142231, PXL_20240905_142231
  const s = filename;

  // YYYY[-_]MM[-_]DD[T _-]HH[:_-]MM[:_-]SS
  let m = s.match(/\b(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[T _-]?(\d{2})[:_-]?(\d{2})[:_-]?(\d{2})\b/);
  if (m) {
    const [, y, mo, d, hh, mm, ss] = m.map(Number);
    const dt = new Date(y, mo - 1, d, hh, mm, ss);
    return isNaN(+dt) ? null : dt;
  }

  // YYYYMMDD (no time)
  m = s.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    const dt = new Date(y, mo - 1, d, 12, 0, 0);
    return isNaN(+dt) ? null : dt;
  }

  // YYYY[-_]MM[-_]DD (no time)
  m = s.match(/\b(20\d{2})[-_](\d{2})[-_](\d{2})\b/);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    const dt = new Date(y, mo - 1, d, 12, 0, 0);
    return isNaN(+dt) ? null : dt;
  }

  return null;
}

function toIsoUTC(date) {
  // Normalize to UTC (EXIF often has no TZ)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 19) + 'Z';
}

async function exifDate(fullPath) {
  try {
    const buf = await fs.readFile(fullPath);
    // exifr parses images; pick only what we need for speed
    const data = await exifParse(buf, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] });
    const dt = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
    if (dt instanceof Date && !isNaN(+dt)) return { date: dt, source: 'exif' };
  } catch {
    // ignore errors; we'll fall back
  }
  return null;
}

async function statMtime(fullPath) {
  try {
    const st = await fs.stat(fullPath);
    if (st.mtime && !isNaN(+st.mtime)) return { date: st.mtime, source: 'mtime' };
  } catch {
    // ignore
  }
  return null;
}

async function getTakenAt(fullPath) {
  // 1) EXIF timestamp
  const ex = await exifDate(fullPath);
  if (ex) return ex;

  // 2) Filesystem mtime
  const mt = await statMtime(fullPath);
  if (mt) return mt;

  // 3) Filename guess
  const fnGuess = guessDateFromFilename(path.basename(fullPath));
  if (fnGuess) return { date: fnGuess, source: 'filename' };

  return { date: null, source: 'none' };
}

// Simple concurrency limiter (avoid reading too many files at once)
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0, active = 0;
  return new Promise((resolve) => {
    const next = () => {
      while (active < limit && idx < items.length) {
        const i = idx++, item = items[i];
        active++;
        Promise.resolve(worker(item, i))
          .then(res => { results[i] = res; })
          .catch(() => { results[i] = null; })
          .finally(() => { active--; (idx >= items.length && active === 0) ? resolve(results) : next(); });
      }
    };
    next();
  });
}

async function main() {
  const files = await listImageFiles(rootDir);

  const meta = await mapLimit(files, 8, async (fullPath) => {
    const { date, source } = await getTakenAt(fullPath);
    const takenAt = date ? toIsoUTC(date) : null;
    return {
      src: toPublicUrl(fullPath),
      takenAt,
      takenAtSource: source
    };
  });

  const list = meta.filter(Boolean);

  // Sort newest first (reverse chronological; nulls last)
  list.sort((a, b) => {
    const da = a.takenAt ? new Date(a.takenAt) : null;
    const db = b.takenAt ? new Date(b.takenAt) : null;
    if (da && db) return db - da;
    if (da) return -1;
    if (db) return 1;
    // tie-breaker: path descending
    return a.src < b.src ? 1 : (a.src > b.src ? -1 : 0);
  });

  await fs.writeFile(outFile, JSON.stringify(list, null, 2), 'utf8');
  console.log(`Wrote ${list.length} images to ${path.relative(process.cwd(), outFile)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
