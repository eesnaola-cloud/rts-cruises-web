const { normalizeRegion, writeOutput } = require('./lib/common');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SOURCE_URL = 'https://www.aquaexpeditions.com/';

// Destination-page "region" codes discovered from the site's event API calls.
// Seychelles & Tanzania has no scheduled departures (private charter only), so it's excluded.
const REGIONS = {
  GALAP: 'Galapagos',
  MEKONG: 'Asia',
  AMAZON: 'South America',
  KOMODO: 'Australia & Pacific',
  SPICE: 'Australia & Pacific',
  RAJA: 'Australia & Pacific',
  ASMAT: 'Australia & Pacific',
  DUAL: 'Australia & Pacific',
  ARCTIC: 'Northern Europe',
};

const LOCATIONS = {
  AYO: 'Puerto Ayora',
  BALTRA: 'Baltra Island',
  MYTHO: 'My Tho',
  PHNOM: 'Phnom Penh',
  SIEMREAP: 'Siem Reap',
  IQT: 'Iquitos',
  NAUTA: 'Nauta',
  'BALI-DEN': 'Bali',
  'KOM-LAB': 'Komodo (Labuan Bajo)',
  'SPI-AMB': 'Ambon (Spice Islands)',
  'RAJ-SOR': 'Raja Ampat (Sorong)',
  SUB: 'Surabaya',
  LONG: 'Longyearbyen',
  TROM: 'Tromso',
  GLAS: 'Glasgow',
};

function locationName(code) {
  return LOCATIONS[code] || code;
}

async function fetchRegionEvents(regionCode) {
  const url = `https://api.aquaexpeditions.com/api/v0/events?region=${regionCode}&start_date[]=2026-07-02&end_date[]=2028-12-31&promo_cabin_check=false`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for region ${regionCode}`);
  const data = await res.json();
  return data.EventList || [];
}

(async () => {
  const seen = new Map();

  for (const [code, region] of Object.entries(REGIONS)) {
    console.log(`Fetching region ${code}...`);
    try {
      const events = await fetchRegionEvents(code);
      console.log(`  ${events.length} events`);
      for (const e of events) {
        if (seen.has(e.EventId)) continue;
        seen.set(e.EventId, { event: e, region });
      }
    } catch (err) {
      console.warn(`  ERROR fetching ${code}: ${err.message}`);
    }
  }

  const itineraries = Array.from(seen.values()).map(({ event: e, region }) => ({
    naviera: 'AQUA EXPEDITIONS',
    barco: e.FacilityName || '',
    region: normalizeRegion(e.Name, region),
    puerto_salida: locationName(e.BegLocation),
    puerto_llegada: locationName(e.EndLocation),
    fecha: e.BegDate || '',
    duracion_dias: parseInt(e.Duration, 10) || '',
    precio: e.InfoPrice ? String(Math.round(parseFloat(e.InfoPrice))) : '',
    moneda: 'USD',
    url: SOURCE_URL,
  })).filter(it => it.fecha && it.barco);

  if (!itineraries.length) {
    console.error('No itineraries extracted, aborting without overwriting existing output.');
    process.exit(1);
  }

  writeOutput('itinerarios-aqua.json', 'AQUA EXPEDITIONS', SOURCE_URL, itineraries);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
