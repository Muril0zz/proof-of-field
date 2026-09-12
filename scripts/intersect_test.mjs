import fs from 'fs';
import * as turf from '@turf/turf';
const prodes = JSON.parse(fs.readFileSync('../data/prodes_abuna_2020plus.json'));
console.log('PRODES features:', prodes.features.length, 'years:', [...new Set(prodes.features.map(f=>f.properties.year))].sort());
for (const id of ['0A28442F','4C8EDDBB','9C62FD55']) {
  const gj = JSON.parse(fs.readFileSync(`../data/car/${id}/imovel.geojson`));
  const farm = gj.features.find(f=>f.properties.tema==='Área do Imovel');
  const farmHa = turf.area(farm)/1e4;
  const bbox = turf.bbox(farm);
  let hits = 0, hitHa = 0; const byYear = {};
  const t0 = Date.now();
  for (const f of prodes.features) {
    const fb = turf.bbox(f);
    if (fb[0]>bbox[2]||fb[2]<bbox[0]||fb[1]>bbox[3]||fb[3]<bbox[1]) continue;
    let inter = null;
    try { inter = turf.intersect(turf.featureCollection([farm, f])); } catch(e){ continue; }
    if (inter) { hits++; const ha = turf.area(inter)/1e4; hitHa += ha; byYear[f.properties.year]=(byYear[f.properties.year]||0)+ha; }
  }
  console.log(`\n${id}: farm ${farmHa.toFixed(0)} ha (CAR says ${farm.properties.area}), PRODES hits ${hits}, deforested since 2020: ${hitHa.toFixed(2)} ha (${(100*hitHa/farmHa).toFixed(2)}%)`, Object.fromEntries(Object.entries(byYear).map(([y,h])=>[y,h.toFixed(2)])), `${Date.now()-t0}ms`);
}
