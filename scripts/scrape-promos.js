const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROMO_URL = 'https://www.silversea.com/best-luxury-cruise-deals/save-up-to-40-percent.html';

// Parse "OCT 29 → NOV 8, 2026" → "2026-10-29"
const MONTHS = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 };
function parseDepartureDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/([A-Z]{3})\s+(\d+).*?(\d{4})/);
  if (!m) return null;
  const [, mon, day, year] = m;
  const month = MONTHS[mon];
  if (!month) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Navigating to Silversea promos page...');
  await page.goto(PROMO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for cruise cards to render
  await page.waitForSelector('.EmotionalCruiseCard-module_card__hDV80', { timeout: 30000 });

  const promos = await page.evaluate(() => {
    const cards = document.querySelectorAll('.EmotionalCruiseCard-module_card__hDV80');
    return Array.from(cards).map(card => {
      const lines = card.innerText.split('\n').map(l => l.trim()).filter(Boolean);
      const discounts = lines.filter(l => /SAVE \d+%/.test(l));
      const maxDiscount = discounts.reduce((max, d) => {
        const n = parseInt(d.match(/\d+/)?.[0] || '0');
        return n > max ? n : max;
      }, 0);
      const dateLine = lines.find(l => /\d{4}/.test(l) && l.includes('→'));
      const ship = lines.find(l => /^SILVER /.test(l));
      const routeLine = lines[1] || '';
      const [origin] = routeLine.split(' to ');
      return {
        region: lines[0] || '',
        route: routeLine,
        origin: (origin || '').trim(),
        dates: dateLine || '',
        ship: ship || '',
        discounts,
        maxDiscount,
        label: `OFERTA · AHORRÁ ${maxDiscount}%`,
      };
    });
  });

  // Enrich with parsed departure date for matching
  const enriched = promos.map(p => ({
    ...p,
    departureDate: parseDepartureDate(p.dates),
  }));

  const output = {
    updatedAt: new Date().toISOString(),
    source: PROMO_URL,
    promos: enriched,
  };

  const outPath = path.join(__dirname, '..', 'silversea-promos.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`✓ Saved ${enriched.length} promos to silversea-promos.json`);

  await browser.close();
})();
