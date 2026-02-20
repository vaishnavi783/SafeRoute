/**
 * zones.js – Static safety zone data for SafeRoute
 *
 * Each zone has:
 *   id       – unique identifier
 *   name     – display name
 *   type     – 'safe' | 'moderate' | 'unsafe'
 *   lat/lng  – centre coordinates
 *   radius   – radius in metres
 *   desc     – short description
 */

const ZONE_DATA = [
  /* ── Safe Zones ── */
  {
    id: 'z1', name: 'City Center Plaza', type: 'safe',
    lat: 40.7580, lng: -73.9855, radius: 400,
    desc: 'Well-lit, high footfall, regular police patrols. CCTV coverage.'
  },
  {
    id: 'z2', name: 'Riverside Park North', type: 'safe',
    lat: 40.7950, lng: -73.9715, radius: 500,
    desc: 'Popular park with security guards and emergency call boxes.'
  },
  {
    id: 'z3', name: 'University District', type: 'safe',
    lat: 40.7290, lng: -73.9965, radius: 350,
    desc: 'Campus security, well-lit streets, high pedestrian activity.'
  },
  {
    id: 'z4', name: 'Shopping Mall Area', type: 'safe',
    lat: 40.7510, lng: -73.9960, radius: 300,
    desc: 'Active commercial zone with security personnel.'
  },
  {
    id: 'z5', name: 'Central Station', type: 'safe',
    lat: 40.7527, lng: -73.9772, radius: 280,
    desc: 'Transit hub with constant activity and police presence.'
  },

  /* ── Moderate Zones ── */
  {
    id: 'z6', name: 'East Market Street', type: 'moderate',
    lat: 40.7440, lng: -73.9770, radius: 380,
    desc: 'Mixed commercial and residential. Stay alert at night.'
  },
  {
    id: 'z7', name: 'Harbour Bridge Area', type: 'moderate',
    lat: 40.7061, lng: -73.9969, radius: 350,
    desc: 'Tourist area, but watch for pickpockets in crowds.'
  },
  {
    id: 'z8', name: 'North Residential Quarter', type: 'moderate',
    lat: 40.7850, lng: -73.9490, radius: 420,
    desc: 'Generally safe neighbourhood. Fewer lights after midnight.'
  },
  {
    id: 'z9', name: 'Old Town District', type: 'moderate',
    lat: 40.7215, lng: -74.0050, radius: 310,
    desc: 'Historic area; be cautious on narrow side streets.'
  },

  /* ── Unsafe Zones ── */
  {
    id: 'z10', name: 'South Industrial Belt', type: 'unsafe',
    lat: 40.7050, lng: -74.0150, radius: 450,
    desc: 'Isolated warehouses. High theft incidents reported. Avoid at night.'
  },
  {
    id: 'z11', name: 'West End Alleyways', type: 'unsafe',
    lat: 40.7620, lng: -74.0100, radius: 300,
    desc: 'Multiple muggings reported. Poor lighting. Use main streets instead.'
  },
  {
    id: 'z12', name: 'Abandoned Rail Yard', type: 'unsafe',
    lat: 40.7820, lng: -73.9880, radius: 380,
    desc: 'Trespassing hazards. Criminal activity reported. Avoid this area.'
  }
];

/* Severity score per zone type (lower = safer, for routing avoidance) */
const ZONE_WEIGHT = { safe: 0, moderate: 0.5, unsafe: 1 };
