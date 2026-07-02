const { normalizeRegion, writeOutput } = require('./lib/common');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const API_URL = 'https://api.ritzcarltonyachtcollection.com/rcyc-yachtsearch/api/criteria-result?countryCode=AR&page=0&size=500';
const SOURCE_URL = 'https://www.ritzcarltonyachtcollection.com/plan-your-voyage';

const REGION_MAP = {
  ALAS: 'Alaska',
  ASIA: 'Asia',
  CARB: 'Caribbean',
  MEDD: 'Mediterranean',
  NEUR: 'Northern Europe',
  SPAC: 'Australia & Pacific',
  TRAN: 'Transatlantic',
};

(async () => {
  console.log('Fetching Ritz-Carlton Yacht Collection voyages...');
  const res = await fetch(API_URL, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const voyages = data.data?.voyages || [];
  console.log(`Fetched ${voyages.length} of ${data.data?.totalCount ?? '?'} total voyages.`);

  const itineraries = voyages
    .map(v => ({
      naviera: 'RITZ CARLTON',
      barco: v.yachtName || '',
      region: REGION_MAP[v.voyageRegion] || normalizeRegion(v.voyageRegionExpansion, 'Europe'),
      puerto_salida: v.voyageEmbarkPort || '',
      puerto_llegada: v.voyageDisembarkPort || '',
      fecha: (v.voyageStartDate || '').slice(0, 10),
      duracion_dias: v.nights || '',
      precio: v.startingPriceMap?.USD ? String(Math.round(v.startingPriceMap.USD)) : (v.startingPrice ? String(Math.round(v.startingPrice)) : ''),
      moneda: 'USD',
      url: SOURCE_URL,
    }))
    .filter(it => it.fecha && it.barco);

  if (!itineraries.length) {
    console.error('No itineraries extracted, aborting without overwriting existing output.');
    process.exit(1);
  }

  writeOutput('itinerarios-ritzcarlton.json', 'RITZ CARLTON', SOURCE_URL, itineraries);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
