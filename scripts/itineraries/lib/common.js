const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function launchBrowser() {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { browser, context, page };
}

async function retry(fn, times = 3, delayMs = 3000) {
  let lastErr;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`  retry ${i + 1}/${times} after error: ${err.message}`);
      if (i < times - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const MONTHS = {
  JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4,
  MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8,
  SEP: 9, SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
};

// Accepts "OCT 29, 2026", "29 Oct 2026", "October 29, 2026", "2026-10-29" and returns "YYYY-MM-DD" or null.
function parseDate(input) {
  if (!input) return null;
  const s = String(input).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${String(slash[1]).padStart(2, '0')}-${String(slash[2]).padStart(2, '0')}`;

  const monthDayYear = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (monthDayYear) {
    const month = MONTHS[monthDayYear[1].toUpperCase()];
    if (month) return `${monthDayYear[3]}-${String(month).padStart(2, '0')}-${String(monthDayYear[2]).padStart(2, '0')}`;
  }

  const dayMonthYear = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (dayMonthYear) {
    const month = MONTHS[dayMonthYear[2].toUpperCase()];
    if (month) return `${dayMonthYear[3]}-${String(month).padStart(2, '0')}-${String(dayMonthYear[1]).padStart(2, '0')}`;
  }

  return null;
}

// Extracts a numeric price string and a currency code ('USD'/'EUR'/'GBP') from free text.
function parsePrice(input) {
  if (!input) return { precio: '', moneda: 'USD' };
  const s = String(input);
  let moneda = 'USD';
  if (s.includes('€')) moneda = 'EUR';
  else if (s.includes('£')) moneda = 'GBP';
  else if (/\bUSD\b/.test(s)) moneda = 'USD';
  else if (/\bEUR\b/.test(s)) moneda = 'EUR';
  else if (/\bGBP\b/.test(s)) moneda = 'GBP';

  const numMatch = s.replace(/[.,](?=\d{3}\b)/g, '').match(/\d+(?:\.\d+)?/);
  const precio = numMatch ? numMatch[0] : '';
  return { precio, moneda };
}

const REGION_RULES = [
  [/galapagos|galápagos/i, 'Galapagos'],
  [/amazon|peru|perú|iquitos|maranon|ucayali|south america|antarctic|antarctica/i, 'South America'],
  [/mekong|vietnam|cambodia|indochina|indonesia|bali|banda sea|\basia\b/i, 'Asia'],
  [/india\b|ganges/i, 'Asia'],
  [/rhine|rhein|danube|donau|rh[oô]ne|moselle|mosel|douro|seine|sa[oô]ne|\bmain\b|elbe|garonne|dordogne|\bfrance\b/i, 'France'],
  [/egypt|nile/i, 'Africa & Indian Ocean'],
  [/mediterranean|italy|italia|greece|grecia|spain|españa|croatia|adriatic|aegean/i, 'Mediterranean'],
  [/caribbean|caribe|bahamas|antilles/i, 'Caribbean'],
  [/\balaska\b/i, 'Alaska'],
  [/norway|noruega|baltic|iceland|islandia|scandinavia|arctic|svalbard|british isles|north sea|northern europe/i, 'Northern Europe'],
  [/australia|new zealand|pacific|fiji|tahiti|polynesia/i, 'Australia & Pacific'],
  [/africa|áfrica|indian ocean|seychelles|madagascar/i, 'Africa & Indian Ocean'],
  [/transatlantic|crossing|repositioning/i, 'Transatlantic'],
];

// Maps free-text destination/region strings to the site's fixed taxonomy (see #f-region in index.html).
function normalizeRegion(input, fallback = 'Europe') {
  if (!input) return fallback;
  const s = String(input);
  for (const [re, region] of REGION_RULES) {
    if (re.test(s)) return region;
  }
  return fallback;
}

function writeOutput(fileName, naviera, sourceUrl, itineraries) {
  const output = {
    updatedAt: new Date().toISOString(),
    source: sourceUrl,
    itineraries,
  };
  const outPath = path.join(__dirname, '..', '..', '..', fileName);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`✓ Saved ${itineraries.length} itineraries for ${naviera} to ${fileName}`);
  return outPath;
}

module.exports = { launchBrowser, retry, parseDate, parsePrice, normalizeRegion, writeOutput, MONTHS };
