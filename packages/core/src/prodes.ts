import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

export interface DeforestationHit { year: number; areaHa: number; imageDate?: string; uuid?: string }
export interface DeforestationReport {
  areaHa: number;
  deforestedHa: number;          // after baseline (year > baselineYear)
  baselineYear: number;
  dataYear: number;              // latest PRODES year in dataset
  hits: DeforestationHit[];
  byYear: Record<string, number>;
  compliant: boolean;
  intersections: FeatureCollection; // geometry of the overlaps (for the map)
  ms: number;
}

/**
 * Intersects a farm/field polygon with PRODES yearly deforestation polygons.
 * Pure geometry, runs in ~100ms for a 7,000 ha farm against 3,500 polygons.
 */
export function checkDeforestation(
  field: Feature<Polygon | MultiPolygon>,
  prodes: FeatureCollection,
  baselineYear = 2020,
  toleranceHa = 0,
): DeforestationReport {
  const t0 = Date.now();
  const areaHa = turf.area(field) / 1e4;
  const bbox = turf.bbox(field);
  const hits: DeforestationHit[] = [];
  const byYear: Record<string, number> = {};
  const inters: Feature[] = [];
  let dataYear = baselineYear;
  for (const f of prodes.features) {
    const year = Number((f.properties as any)?.year);
    if (year > dataYear) dataYear = year;
    if (!(year > baselineYear)) continue;
    const fb = turf.bbox(f as any);
    if (fb[0] > bbox[2] || fb[2] < bbox[0] || fb[1] > bbox[3] || fb[3] < bbox[1]) continue;
    let inter: Feature | null = null;
    try { inter = turf.intersect(turf.featureCollection([field as any, f as any])); } catch { continue; }
    if (!inter) continue;
    const ha = turf.area(inter) / 1e4;
    if (ha < 1e-4) continue;
    hits.push({ year, areaHa: ha, imageDate: (f.properties as any)?.image_date, uuid: (f.properties as any)?.uuid });
    byYear[year] = (byYear[year] || 0) + ha;
    inter.properties = { year, areaHa: ha };
    inters.push(inter);
  }
  const deforestedHa = hits.reduce((s, h) => s + h.areaHa, 0);
  return {
    areaHa, deforestedHa, baselineYear, dataYear, hits, byYear,
    compliant: deforestedHa <= toleranceHa,
    intersections: turf.featureCollection(inters),
    ms: Date.now() - t0,
  };
}
