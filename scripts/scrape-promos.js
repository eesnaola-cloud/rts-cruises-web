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

  // Wait for cruise cards to render. Silversea renamed the component and its
  // webpack build hash on 2026-09-09 (EmotionalCruiseCard-module_card__hDV80 ->
  // EmotionalCruiseCardSmall-module_card__qxSBz), breaking the exact-class selector.
  // These hashes change on every Silversea deploy, so match on the stable
  // "EmotionalCruiseCard...-module_card__" prefix instead of the full class.
  await page.waitForSelector('[class*="EmotionalCruiseCard"][class*="-module_card__"]', { timeout: 30000 });

  const promos = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="EmotionalCruiseCard"][class*="-module_card__"]');
    return Array.from(cards).map(card => {
      const lines = card.innerText.split('\n').map(l => l.trim()).filter(Boolean);
      // Card layout as of 2026-09-09 (no "region" line, no "SAVE X%" text):
      //   {origin} to {destination}
      //   {MON DD} → {[MON] DD, YYYY}
      //    • {N} DAYS
      //   {SHIP NAME}
      //   [EXPEDITION CRUISE]         (optional)
      //   FROM
      //   [$was-price]                (optional, only when discounted)
      //   $now-price
      //   PER GUEST, WITH ... FARE
      const routeLine = lines.find(l => l.includes(' to ')) || lines[0] || '';
      const [origin] = routeLine.split(' to ');
      const dateLine = lines.find(l => /\d{4}/.test(l) && l.includes('→')) || '';
      const ship = lines.find(l => /^SILVER /.test(l)) || '';
      const prices = lines.filter(l => /^\$[\d,]+$/.test(l)).map(l => parseInt(l.replace(/[$,]/g, ''), 10));
      const [wasPrice, nowPrice] = prices.length === 2 ? prices : [null, prices[0] ?? null];
      const maxDiscount = (wasPrice && nowPrice) ? Math.round((1 - nowPrice / wasPrice) * 100) : 0;
      return {
        route: routeLine,
        origin: (origin || '').trim(),
        dates: dateLine,
        ship,
        priceFrom: wasPrice,
        priceNow: nowPrice,
        maxDiscount,
        label: maxDiscount > 0 ? `OFERTA · AHORRÁ ${maxDiscount}%` : 'OFERTA',
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
