import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

export interface DeforestationHit { year: number; areaHa: number; imageDate?: string; uuid?: string }
export type ProtectedKind = 'indigenous' | 'conservation_strict' | 'conservation_sustainable';
export interface ProtectedHit { kind: ProtectedKind; name: string; areaHa: number; blocking: boolean }
export interface Coverage { bbox: [number, number, number, number]; covered: boolean; regions?: string[] }

/** A PRODES dataset with a per-feature bbox index and the region polygons it covers. */
export interface ProtectedArea { feature: Feature; bbox: [number, number, number, number]; kind: ProtectedKind; name: string }
export interface ProdesIndex {
  features: Feature[];
  bboxes: [number, number, number, number][];
  protected: ProtectedArea[];
  regions: Feature[];            // polygons (e.g. state × biome) the data covers
  regionNames: string[];
  extent: [number, number, number, number];
}
export function buildProdesIndex(collections: FeatureCollection[], regions: FeatureCollection | null, protectedLayers: { kind: 'indigenous' | 'conservation'; collection: FeatureCollection }[] = []): ProdesIndex {
  const features: Feature[] = []; const bboxes: [number, number, number, number][] = [];
  for (const c of collections) for (const f of c.features) { features.push(f); bboxes.push(turf.bbox(f as any) as any); }
  const prot: ProtectedArea[] = [];
  for (const { kind, collection } of protectedLayers) for (const f of collection.features) {
    const pr = (f.properties as any) || {};
    if (kind === 'indigenous') prot.push({ feature: f, bbox: turf.bbox(f as any) as any, kind: 'indigenous', name: `TI ${pr.terrai_nom ?? pr.nome ?? '?'}` });
    else {
      const strict = String(pr.grupo ?? '').toUpperCase().startsWith('P'); // PI = proteção integral; US = uso sustentável
      prot.push({ feature: f, bbox: turf.bbox(f as any) as any, kind: strict ? 'conservation_strict' : 'conservation_sustainable', name: `${pr.categoria ?? 'UC'} ${pr.nome ?? '?'}` });
    }
  }
  const regionFeatures = regions?.features ?? [];
  const extent = features.length ? (turf.bbox(turf.featureCollection(features as any)) as any) : [0, 0, 0, 0];
  return { features, bboxes, protected: prot, regions: regionFeatures, regionNames: regionFeatures.map((r) => { const pr = (r.properties as any) || {}; return String(pr.label ?? pr.nome ?? pr.name ?? pr.state ?? ''); }), extent };
}
/** Is the field inside the loaded coverage? With region polygons: fully inside their union. Without: inside the data extent. */
export function coverageOf(field: Feature<Polygon | MultiPolygon>, idx: ProdesIndex): Coverage {
  const bbox = turf.bbox(field as any);
  if (idx.regions.length === 0) {
    const e = idx.extent;
    return { bbox: e, covered: bbox[0] >= e[0] && bbox[2] <= e[2] && bbox[1] >= e[1] && bbox[3] <= e[3] };
  }
  const hits: string[] = [];
  let remaining: Feature<any> | null = field as any;
  for (let i = 0; i < idx.regions.length && remaining; i++) {
    const r = idx.regions[i];
    const rb = turf.bbox(r as any);
    if (rb[0] > bbox[2] || rb[2] < bbox[0] || rb[1] > bbox[3] || rb[3] < bbox[1]) continue;
    // Fast path: the whole field sits inside this region → covered, done.
    try { if (turf.booleanWithin(remaining as any, r as any)) { hits.push(idx.regionNames[i]); remaining = null; break; } } catch { /* fall through */ }
    let inter: Feature | null = null;
    try { inter = turf.intersect(turf.featureCollection([remaining as any, r as any])); } catch { continue; }
    if (!inter) continue;
    hits.push(idx.regionNames[i]);
    try { remaining = turf.difference(turf.featureCollection([remaining as any, r as any])) as any; } catch { remaining = null; }
    if (remaining && turf.area(remaining) < 1) remaining = null;
  }
  return { bbox: idx.extent, covered: hits.length > 0 && remaining === null, regions: hits };
}
export interface DeforestationReport {
  coverage: Coverage;
  protectedHits: ProtectedHit[];   // overlaps with indigenous lands / conservation units
  protectedBlockingHa: number;     // ha inside indigenous land or strict-protection units (fails compliance)
  protectedWarningHa: number;      // ha inside sustainable-use units (APA etc.; farming allowed, flagged)
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
  prodes: FeatureCollection | ProdesIndex,
  baselineYear = 2020,
  toleranceHa = 0,
): DeforestationReport {
  const t0 = Date.now();
  const idx: ProdesIndex = 'bboxes' in prodes ? prodes : buildProdesIndex([prodes], null, []);
  const areaHa = turf.area(field) / 1e4;
  const bbox = turf.bbox(field);
  // Coverage: outside the loaded data, "no hits" would mean "no data", not "no deforestation" — so we refuse to conclude.
  const coverage = coverageOf(field, idx);
  const hits: DeforestationHit[] = [];
  const byYear: Record<string, number> = {};
  const inters: Feature[] = [];
  let dataYear = baselineYear;
  for (let i = 0; i < idx.features.length; i++) {
    const f = idx.features[i];
    const year = Number((f.properties as any)?.year);
    if (year > dataYear) dataYear = year;
    if (!(year > baselineYear)) continue;
    const fb = idx.bboxes[i];
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
  // Protected areas: indigenous lands and strict-protection units block; sustainable-use units (APA…) only warn.
  const protectedHits: ProtectedHit[] = [];
  for (const pa of idx.protected) {
    const b = pa.bbox;
    if (b[0] > bbox[2] || b[2] < bbox[0] || b[1] > bbox[3] || b[3] < bbox[1]) continue;
    // Cheap rejection before the (expensive) polygon intersection with large protected-area geometries.
    try { if (turf.booleanDisjoint(field as any, pa.feature as any)) continue; } catch { /* fall through */ }
    let inter: Feature | null = null;
    try { inter = turf.intersect(turf.featureCollection([field as any, pa.feature as any])); } catch { continue; }
    if (!inter) continue;
    const ha = turf.area(inter) / 1e4;
    if (ha < 0.01) continue;
    protectedHits.push({ kind: pa.kind, name: pa.name, areaHa: ha, blocking: pa.kind !== 'conservation_sustainable' });
  }
  const protectedBlockingHa = protectedHits.filter((h) => h.blocking).reduce((s, h) => s + h.areaHa, 0);
  const protectedWarningHa = protectedHits.filter((h) => !h.blocking).reduce((s, h) => s + h.areaHa, 0);
  return {
    coverage, protectedHits, protectedBlockingHa, protectedWarningHa,
    areaHa, deforestedHa, baselineYear, dataYear, hits, byYear,
    compliant: coverage.covered && deforestedHa <= toleranceHa && protectedBlockingHa === 0,
    intersections: turf.featureCollection(inters),
    ms: Date.now() - t0,
  };
}
