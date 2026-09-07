/* ============================================================================
   CRIDS — Demo data engine
   Deterministic, seeded synthetic climatology per location.
   Everything here is labelled DEMONSTRATION DATA — never real measurements.
   ========================================================================== */

"use strict";

var CRIDS = window.CRIDS = {};

CRIDS.VERSION = "0.1.0-demo";

/* Deterministic PRNG (mulberry32) so runs are reproducible. */
CRIDS.seededRandom = function (seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* Built-in demo gazetteer (fallback when geocoding is offline). */
CRIDS.gazetteer = [
  { name: "Delhi", country: "India (NCT)", state: "Delhi", lat: 28.6139, lon: 77.2090, clim: "semi-arid" },
  { name: "Mumbai", country: "India", state: "Maharashtra", lat: 19.0760, lon: 72.8777, clim: "tropical wet" },
  { name: "Kolkata", country: "India", state: "West Bengal", lat: 22.5726, lon: 88.3639, clim: "tropical wet-dry" },
  { name: "Chennai", country: "India", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707, clim: "tropical wet-dry" },
  { name: "Bengaluru", country: "India", state: "Karnataka", lat: 12.9716, lon: 77.5946, clim: "semi-arid highland" },
  { name: "Hyderabad", country: "India", state: "Telangana", lat: 17.3850, lon: 78.4867, clim: "semi-arid" },
  { name: "Jaipur", country: "India", state: "Rajasthan", lat: 26.9124, lon: 75.7873, clim: "arid-semi arid" },
  { name: "Pune", country: "India", state: "Maharashtra", lat: 18.5204, lon: 73.8567, clim: "tropical wet-dry" },
  { name: "Ahmedabad", country: "India", state: "Gujarat", lat: 23.0225, lon: 72.5714, clim: "semi-arid" },
  { name: "Lucknow", country: "India", state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462, clim: "humid subtropical" },
  { name: "Guwahati", country: "India", state: "Assam", lat: 26.1445, lon: 91.7362, clim: "humid subtropical" },
  { name: "Srinagar", country: "India", state: "Jammu & Kashmir", lat: 34.0837, lon: 74.7973, clim: "temperate valley" },
  { name: "Bhopal", country: "India", state: "Madhya Pradesh", lat: 23.2599, lon: 77.4126, clim: "humid subtropical" },
  { name: "Patna", country: "India", state: "Bihar", lat: 25.5941, lon: 85.1376, clim: "humid subtropical" },
  { name: "Nagpur", country: "India", state: "Maharashtra", lat: 21.1458, lon: 79.0882, clim: "tropical wet-dry" },
  { name: "Kochi", country: "India", state: "Kerala", lat: 9.9312, lon: 76.2673, clim: "tropical monsoon" },
  { name: "Surat", country: "India", state: "Gujarat", lat: 21.1702, lon: 72.8311, clim: "tropical savanna" },
  { name: "Varanasi", country: "India", state: "Uttar Pradesh", lat: 25.3176, lon: 82.9739, clim: "humid subtropical" },
  { name: "Amritsar", country: "India", state: "Punjab", lat: 31.6340, lon: 74.8723, clim: "semi-arid" },
  { name: "Visakhapatnam", country: "India", state: "Andhra Pradesh", lat: 17.6868, lon: 83.2185, clim: "tropical" },
  { name: "Tokyo", country: "Japan", state: "Kanto", lat: 35.6762, lon: 139.6503, clim: "humid subtropical" },
  { name: "London", country: "United Kingdom", state: "England", lat: 51.5074, lon: -0.1278, clim: "temperate oceanic" },
  { name: "New York", country: "United States", state: "New York", lat: 40.7128, lon: -74.0060, clim: "humid subtropical" },
  { name: "Sydney", country: "Australia", state: "New South Wales", lat: -33.8688, lon: 151.2093, clim: "humid subtropical" },
  { name: "Lagos", country: "Nigeria", state: "Lagos", lat: 6.5244, lon: 3.3792, clim: "tropical savanna" },
  { name: "Singapore", country: "Singapore", state: "Singapore", lat: 1.3521, lon: 103.8198, clim: "tropical rainforest" },
  { name: "Cairo", country: "Egypt", state: "Cairo", lat: 30.0444, lon: 31.2357, clim: "hot desert" },
  { name: "São Paulo", country: "Brazil", state: "São Paulo", lat: -23.5505, lon: -46.6333, clim: "humid subtropical" },
  { name: "Nairobi", country: "Kenya", state: "Nairobi", lat: -1.2921, lon: 36.8219, clim: "subtropical highland" },
  { name: "Paris", country: "France", state: "Île-de-France", lat: 48.8566, lon: 2.3522, clim: "oceanic" },
  { name: "Dubai", country: "United Arab Emirates", state: "Dubai", lat: 25.2048, lon: 55.2708, clim: "hot desert" },
  { name: "Bangkok", country: "Thailand", state: "Bangkok", lat: 13.7563, lon: 100.5018, clim: "tropical monsoon" }
];

/* Climate parameterisation: map a (lat, lon) to synthetic climate normals. */
CRIDS.deriveClimateParams = function (place) {
  const lat = place.lat, lon = place.lon;
  const rng = CRIDS.seededRandom(Math.round(lat * 1000) * 131 + Math.round(lon * 1000) * 17 + 7);

  const absLat = Math.abs(lat);
  const north = lat >= 0;
  const tropicFactor = Math.max(0, 1 - absLat / 23.5);
  const monsoon = lon > 60 && lon < 103 && absLat < 34;  // Asian monsoon band
  // dry belt ~17°–35° absolute latitude; strongly suppressed on monsoon coasts
  const desertFactor = Math.max(0, 1 - Math.abs(absLat - 26) / 9) * (monsoon ? 0.18 : 1);

  let annualRain = 620 + tropicFactor * 1480 - desertFactor * 480 + (rng() - 0.5) * 200;
  if (monsoon) annualRain += 390 + Math.max(0, lon - 62) * 10;
  const westCoast = lon > 71 && lon < 82 && lat > 14 && lat < 23;   // Western Ghats orography
  if (westCoast) annualRain *= 1.65;
  annualRain = Math.max(60, annualRain);

  // Rainy-season peak month (1–12)
  let peakMonth;
  if (monsoon) peakMonth = north ? 7 : 1;
  else if (tropicFactor > 0.45) peakMonth = north ? 8 : 2;
  else if (absLat > 30) peakMonth = north ? 10 : 4;
  else peakMonth = north ? 7 : 1;

  const ampRain = monsoon ? 0.6 : (tropicFactor * 0.5 + 0.14);

  // Temperature normals
  const tempPeak = north ? 7 : 1;                       // hottest month
  const annualTemp = 27.5 - absLat * 0.205 - Math.max(0, absLat - 45) * 0.55 + tropicFactor * 1.6 + (rng() - 0.5) * 2;
  // seasonal swing: oceanic/southern climates dampened, capped for continental mid-lat + high lat
  let tempSeasonalAmp = Math.min(9, 2.2 + absLat * 0.22);
  if (!north) tempSeasonalAmp *= 0.55;  // Southern Hemisphere (ocean-dominated)

  return {
    annualRain, annualTemp, ampRain, peakMonth, tempPeak, tempSeasonalAmp,
    monsoon, tropical: tropicFactor > 0.55,
    rng
  };
};

/* Generate a station's synthetic record. */
/* Returns { monthly: [...], daily: [...], annual: [...] } */
CRIDS.generateStation = function (place, startYear, endYear) {
  const p = CRIDS.deriveClimateParams(place);
  const rng = p.rng;

  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  const monthly = [];       // { t, rain, ndvi, temp, humidity, pressure, wind, index }  t=Date
  const daily = [];
  const annual = [];

  const seedOffset = CRIDS.seededRandom(Math.abs(Math.round(place.lat * 100)) + Math.abs(Math.round(place.lon * 100)));

  let spiAccum = 0;

  for (let year of years) {
    let yearRain = 0;
    const monthlyRain = [];

    // ENSO-ish oscillation
    const osc = Math.sin(year * 0.35 + Math.abs(place.lat)) * 0.22;
    const warming = (year - startYear) * 0.05; // secular warming ~0.5°C/decade

    for (let m = 0; m < 12; m++) {
      const t = new Date(Date.UTC(year, m, 15));
      const month = m + 1;
      // cosine seasonality: +1 at the peak month, −1 at the opposite month
      const seasonalRain = Math.cos((2 * Math.PI * (month - p.peakMonth)) / 12);
      const seasonalTemp = Math.cos((2 * Math.PI * (month - p.tempPeak)) / 12);

      const baseRain = p.annualRain / 12 * (1 + p.ampRain * seasonalRain);
      const noise = (rng() - 0.5) * 2.4;
      const monthlyR = Math.max(0, baseRain * (1 + 0.35 * noise + 0.55 * osc + (rng() - 0.5) * 0.4));

      const monthlyT = p.annualTemp + p.tempSeasonalAmp * seasonalTemp + warming + (rng() - 0.5) * 1.6;

      const humidity = 60 + 24 * (0.5 + 0.5 * seasonalRain) + (rng() - 0.5) * 8;
      const pressure = 1013 - 6 * (0.5 + 0.5 * seasonalRain) + (rng() - 0.5) * 3;
      const wind = 8 + 4 * (0.5 + 0.5 * seasonalRain) + (rng() - 0.5) * 2;

      yearRain += monthlyR;
      monthlyRain.push(monthlyR);

      // NDVI responds to rain (~1 month vegetation lag)
      const rainLag = monthlyRain.length >= 2 ? monthlyRain[m - 1] : monthlyR;
      const ndviBase = 0.62 * (1 + p.ampRain * 0.8 * seasonalRain) * Math.min(1, rainLag / (p.annualRain / 6));
      const ndvi = Math.max(0.08, Math.min(0.9, ndviBase + (rng() - 0.5) * 0.05 - (year - startYear) * 0.002));

      const spiContrib = (monthlyR - p.annualRain / 12) / Math.max(1, p.annualRain / 12 * 0.55);
      spiAccum = spiAccum * 0.55 + spiContrib * 0.45;

      monthly.push({
        t, year, month: m + 1,
        rain: +monthlyR.toFixed(1),
        temp: +monthlyT.toFixed(1),
        ndvi: +ndvi.toFixed(3),
        humidity: +humidity.toFixed(1),
        pressure: +pressure.toFixed(1),
        wind: +wind.toFixed(1),
        spi: +spiAccum.toFixed(2)
      });

      // daily synthetic (aggregates roughly to monthly)
      const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      let rainBudget = monthlyR;
      for (let d = 1; d <= daysInMonth; d++) {
        const wet = rng() < Math.min(0.72, 0.18 + p.ampRain * seasonalRain + 0.32);
        let rainVal = 0;
        if (wet && rainBudget > 0.2) {
          const linear = rng();
          rainVal = Math.min(rainBudget, rainBudget * (0.35 + linear * 1.6));
          rainBudget -= rainVal;
        }
        const dailyT = monthlyT + (rng() - 0.5) * 2.4;
        daily.push({
          t: new Date(Date.UTC(year, m, d)),
          rain: +rainVal.toFixed(1),
          temp: +dailyT.toFixed(1),
          ndvi: +(ndvi + (rng() - 0.5) * 0.02).toFixed(3)
        });
      }
    }

    const annualNdvi = +(monthly.filter(x => x.year === year).reduce((s, x) => s + x.ndvi, 0) / 12).toFixed(3);
    annual.push({
      year,
      rain: +yearRain.toFixed(0),
      temp: +(monthly.filter(x => x.year === year).reduce((s, x) => s + x.temp, 0) / 12).toFixed(2),
      ndvi: annualNdvi
    });
  }

  return { monthly, daily, annual, params: p, place };
};

/* Monthly climatology reference (long-term mean per month). */
CRIDS.climatology = function (station) {
  const means = [];
  for (let m = 0; m < 12; m++) {
    const set = station.monthly.filter(x => x.month === m + 1);
    const rain = set.reduce((s, x) => s + x.rain, 0) / set.length;
    const temp = set.reduce((s, x) => s + x.temp, 0) / set.length;
    const ndvi = set.reduce((s, x) => s + x.ndvi, 0) / set.length;
    means.push({ month: m + 1, rain, temp, ndvi });
  }
  return means;
};

/* Forecast future months using seasonal + model weights + noise. */
/* horizon in months. Returns array with mean & uncertainty band. */
CRIDS.forecast = function (station, endYear, endMonth, horizon) {
  const clim = CRIDS.climatology(station);
  const out = [];
  let prev = station.monthly[station.monthly.length - 1];

  for (let h = 0; h < horizon; h++) {
    const startIdx = prev.t.getUTCMonth();
    const targetIdx = startIdx + h; // index from start month
    const year = prev.t.getUTCFullYear() + Math.floor(targetIdx / 12);
    const month = (targetIdx % 12) + 1;

    const c = clim.find(x => x.month === month);
    const rng = CRIDS.seededRandom(year * 1000 + month * 31 + Math.abs(Math.round(station.place.lat * 10)));

    const mean = Math.max(0, c.rain * (0.82 + rng() * 0.36));
    const span = c.rain * 0.55;
    out.push({
      t: new Date(Date.UTC(year, month - 1, 15)),
      year, month,
      mean: +mean.toFixed(1),
      low: +Math.max(0, mean - span).toFixed(1),
      high: +(mean + span).toFixed(1),
      temp: +(c.temp + (rng() - 0.5) * 2).toFixed(1),
      ndvi: +Math.min(0.88, Math.max(0.1, c.ndvi * (0.75 + rng() * 0.5))).toFixed(3)
    });
  }
  return out;
};

/* Historical/recent vs long-term averaging helper. */
CRIDS.helper = {
  sum: arr => arr.reduce((a, b) => a + b, 0),
  mean: arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
  pct: (cur, base) => (base ? ((cur - base) / base) * 100 : 0),
  round: (v, d) => +v.toFixed(d)
};

/* Extreme-event classes with color mapping. */
CRIDS.EXTREME_CLASSES = [
  { key: "Normal", label: "Normal", color: "#34d399" },
  { key: "Extreme Heat", label: "Extreme Heat", color: "#fb7185" },
  { key: "Extreme Rainfall", label: "Extreme Rainfall", color: "#38bdf8" },
  { key: "Drought", label: "Drought", color: "#f59e0b" },
  { key: "Flood-prone rainfall", label: "Flood-prone Rainfall", color: "#818cf8" }
];

CRIDS.severityIndex = {
  "Normal": 0.12,
  "Mild": 0.32,
  "Moderate": 0.55,
  "Severe": 0.76,
  "Extreme": 0.93
};