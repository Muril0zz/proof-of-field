// Builds data/prodes/regions_*.json: the state × biome polygons that the loaded PRODES extracts cover.
import fs from 'fs';
const dir = 'data/prodes';
const want = { amazon: ['RO', 'MT'], cerrado: ['GO', 'MT'] };
for (const [biome, siglas] of Object.entries(want)) {
  const src = `${dir}/states_${biome}.json`;
  if (!fs.existsSync(src)) { console.log('skip', biome, '(no states layer)'); continue; }
  const st = JSON.parse(fs.readFileSync(src, 'utf8'));
  const feats = st.features.filter((f) => siglas.includes(f.properties.sigla) && fs.existsSync(`${dir}/${biome}_${f.properties.sigla}_2021plus.json`))
    .map((f) => ({ type: 'Feature', properties: { label: `${f.properties.nome} · ${biome === 'amazon' ? 'Amazon biome' : 'Cerrado biome'}`, sigla: f.properties.sigla, biome }, geometry: f.geometry }));
  fs.writeFileSync(`${dir}/regions_${biome}.json`, JSON.stringify({ type: 'FeatureCollection', features: feats }));
  console.log(biome, feats.map((f) => f.properties.label));
}
