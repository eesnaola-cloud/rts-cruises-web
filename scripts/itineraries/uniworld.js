const { launchBrowser, retry, parseDate, normalizeRegion, writeOutput } = require('./lib/common');

const SITEMAP_URL = 'https://www.uniworld.com/sitemaps/sitemap-uniworld-us.xml';
const SOURCE_URL = 'https://www.uniworld.com/us/river-cruises';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function titleCase(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function fetchItineraryUrls() {
  const res = await fetch(SITEMAP_URL, { headers: { 'user-agent': UA } });
  const xml = await res.text();
  const locs = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map(m => m[1]);
  return locs.filter(u => /\/river-cruise\/.+\/20\d\d-[a-z0-9-]+-to-[a-z0-9-]+$/i.test(u));
}

(async () => {
  console.log('Fetching sitemap...');
  const urls = await fetchItineraryUrls();
  console.log(`Found ${urls.length} canonical itinerary pages.`);

  const { browser, page } = await launchBrowser();
  const itineraries = [];

  for (const [i, url] of urls.entries()) {
    console.log(`[${i + 1}/${urls.length}] ${url}`);
    try {
      await retry(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }));
      await page.waitForTimeout(1500);

      const extracted = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        let product = null;
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent);
            const candidate = data['@graph']?.find(g => g['@type'] === 'Product') || (data['@type'] === 'Product' ? data : null);
            if (candidate) { product = candidate; break; }
          } catch (e) { /* skip */ }
        }
        const dateOptions = Array.from(document.querySelector('#DepartureDateRAQ')?.options || [])
          .map(o => o.textContent.trim())
          .filter(t => t && !/select a date/i.test(t) && !/not sure/i.test(t));
        return { product, dateOptions };
      });

      const { product, dateOptions } = extracted;
      if (!product || !dateOptions.length) {
        console.warn('  skip: missing product data or dates');
        continue;
      }

      const name = product.name || '';
      const offers = product.offers || {};
      const precio = offers.lowPrice || offers.price || '';
      const moneda = offers.priceCurrency || 'USD';
      const days = (product.hasPart || []).map(p => p.dayNumber).filter(n => typeof n === 'number');
      const duracion_dias = days.length ? Math.max(...days) : '';

      const m = url.match(/\/river-cruise\/([a-z0-9-]+)\/(?:([a-z0-9-]+)\/)?[a-z0-9-]+\/20\d\d-([a-z0-9-]+)-to-([a-z0-9-]+)$/i);
      const regionSegment = m ? m[1] : '';
      const riverSegment = m ? m[2] : '';
      const puerto_salida = m ? titleCase(m[3]) : '';
      const puerto_llegada = m ? titleCase(m[4]) : '';
      const region = normalizeRegion(`${regionSegment} ${riverSegment} ${name}`, 'France');

      for (const dateStr of dateOptions) {
        const fecha = parseDate(dateStr);
        if (!fecha) continue;
        itineraries.push({
          naviera: 'UNIWORLD',
          barco: name,
          region,
          puerto_salida,
          puerto_llegada,
          fecha,
          duracion_dias,
          precio: String(precio),
          moneda,
          url,
        });
      }
    } catch (e) {
      console.warn(`  ERROR on ${url}: ${e.message}`);
    }
  }

  await browser.close();

  if (!itineraries.length) {
    console.error('No itineraries extracted, aborting without overwriting existing output.');
    process.exit(1);
  }

  writeOutput('itinerarios-uniworld.json', 'UNIWORLD', SOURCE_URL, itineraries);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
