const { retry, normalizeRegion, writeOutput } = require('./lib/common');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SOURCE_URL = 'https://www.vikingcruises.com/';

// Each fleet lives on its own domain/path but shares the same search-cruises page shape
// (an embedded "Results" route catalog) and the same DnPCruiseFullInfo sailings API.
const FLEETS = [
  {
    name: 'oceans',
    searchUrl: 'https://www.vikingcruises.com/oceans/search-cruises/index.html',
    apiBase: 'https://www.vikingcruises.com/oceans',
    urlBase: 'https://www.vikingcruises.com',
    regionFallback: 'Transatlantic',
  },
  {
    name: 'rivers',
    searchUrl: 'https://www.vikingrivercruises.com/search-cruises/index.html',
    apiBase: 'https://www.vikingrivercruises.com',
    urlBase: 'https://www.vikingrivercruises.com',
    regionFallback: 'France',
  },
  {
    name: 'expeditions',
    searchUrl: 'https://www.vikingcruises.com/expeditions/search-cruises/index.html',
    apiBase: 'https://www.vikingcruises.com/expeditions',
    urlBase: 'https://www.vikingcruises.com',
    regionFallback: 'Transatlantic',
  },
];

// The route catalog is embedded as `"Results":[...]` inside a large inline <script> blob.
// Bracket-match (skipping quoted strings) to find the array's true end, since naive
// indexOf('],"') breaks on nested arrays (Cities, ItineraryDays, etc.) inside each entry.
function extractResultsArray(html) {
  const marker = '"Results":[';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  let i = idx + marker.length - 1;
  let depth = 0;
  const start = i;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    } else if (c === '"') {
      i++;
      while (i < html.length && html[i] !== '"') {
        if (html[i] === '\\') i++;
        i++;
      }
    }
  }
  return null;
}

async function fetchRoutes(fleet) {
  const res = await fetch(fleet.searchUrl, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${fleet.searchUrl}`);
  const html = await res.text();
  const arrStr = extractResultsArray(html);
  if (!arrStr) throw new Error(`Results array not found for ${fleet.name}`);
  return JSON.parse(arrStr);
}

async function fetchSailings(fleet, route) {
  const qIdx = route.PageUrl.indexOf('?');
  const parameters = qIdx === -1 ? '' : route.PageUrl.slice(qIdx + 1);
  const res = await fetch(`${fleet.apiBase}/Core/DnPCruiseFullInfo?v=11`, {
    method: 'POST',
    headers: { 'user-agent': UA, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ cruiseId: route.TcmId, parameters, offerCode: 'EBS' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for route ${route.TcmId}`);
  const data = await res.json();
  return data.cruises || [];
}

function ymdFromDepartureDateString(s) {
  if (!s || s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function mapWithConcurrency(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

(async () => {
  const itineraries = [];

  for (const fleet of FLEETS) {
    console.log(`\n--- Fleet: ${fleet.name} ---`);
    let routes;
    try {
      routes = await retry(() => fetchRoutes(fleet));
    } catch (e) {
      console.warn(`  ERROR fetching route catalog for ${fleet.name}: ${e.message}, skipping fleet`);
      continue;
    }
    console.log(`  ${routes.length} routes found`);

    let done = 0;
    await mapWithConcurrency(routes, 5, async (route) => {
      try {
        const sailings = await retry(() => fetchSailings(fleet, route));
        const region = normalizeRegion((route.Regions || []).join(' '), fleet.regionFallback);
        for (const s of sailings) {
          if (s.soldOut) continue;
          const fecha = ymdFromDepartureDateString(s.DepartureDateString);
          if (!fecha) continue;
          const [puerto_salida, puerto_llegada] = (s.cruiseDirection || route.Direction || '')
            .split(' to ')
            .map((x) => (x || '').trim());
          itineraries.push({
            naviera: 'VIKING',
            barco: s.shipType || '',
            region,
            puerto_salida: puerto_salida || '',
            puerto_llegada: puerto_llegada || '',
            fecha,
            duracion_dias: route.Days || '',
            precio: s.lowestPrice ? String(Math.round(s.lowestPrice)) : '',
            moneda: 'USD',
            url: `${fleet.urlBase}${route.PageUrl}`,
          });
        }
      } catch (e) {
        console.warn(`  ERROR route ${route.TcmId}: ${e.message}`);
      } finally {
        done++;
        if (done % 10 === 0) console.log(`  ${done}/${routes.length} routes processed`);
      }
    });
  }

  if (!itineraries.length) {
    console.error('No itineraries extracted, aborting without overwriting existing output.');
    process.exit(1);
  }

  writeOutput('itinerarios-viking.json', 'VIKING', SOURCE_URL, itineraries);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
