const { launchBrowser, retry, parseDate, normalizeRegion, writeOutput } = require('./lib/common');

const URL = 'https://riverside-cruises.com/en/routen';

(async () => {
  const { browser, page } = await launchBrowser();

  console.log('Navigating to Riverside routes page...');
  await retry(() => page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }));
  await page.waitForSelector('.routeStartDate', { timeout: 30000 });

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table tr')).filter(tr => !tr.classList.contains('month-row')).map(tr => {
      const text = sel => tr.querySelector(sel)?.textContent.trim().replace(/\s+/g, ' ') || '';
      return {
        startDate: text('.routeStartDate'),
        days: text('.routeDays'),
        river: text('.riverName'),
        ship: text('.shipName'),
        departure: text('.departureCity').replace(/^from\s*/i, ''),
        arrival: text('.arrivalCity').replace(/^to\s*/i, ''),
        url: tr.querySelector('.route-link a')?.href || '',
      };
    });
  });

  const itineraries = rows
    .map(r => ({
      naviera: 'RIVERSIDE',
      barco: r.ship,
      region: normalizeRegion(r.river, 'France'),
      puerto_salida: r.departure,
      puerto_llegada: r.arrival,
      fecha: parseDate(r.startDate),
      duracion_dias: parseInt(r.days, 10) || '',
      precio: '',
      moneda: 'EUR',
      url: r.url,
    }))
    .filter(it => it.barco && it.fecha);

  writeOutput('itinerarios-riverside.json', 'RIVERSIDE', URL, itineraries);

  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
