import { combine, parseShp, parseDbf } from 'shpjs';
import fs from 'fs';
import path from 'path';
const root = path.resolve('../data/car');
const out = {};
for (const id of fs.readdirSync(root)) {
  const dir = path.join(root, id, 'Area_do_Imovel');
  if (!fs.existsSync(dir)) continue;
  const shpBuf = fs.readFileSync(path.join(dir, 'Area_do_Imovel.shp'));
  const dbfBuf = fs.readFileSync(path.join(dir, 'Area_do_Imovel.dbf'));
  const prj = fs.readFileSync(path.join(dir, 'Area_do_Imovel.prj'), 'utf8');
  const gj = combine([parseShp(shpBuf, prj), parseDbf(dbfBuf)]);
  out[id] = gj;
  fs.writeFileSync(path.join(root, id, 'imovel.geojson'), JSON.stringify(gj));
  for (const f of gj.features) {
    const c = JSON.stringify(f.geometry.coordinates).slice(0, 80);
    console.log(id, f.properties, c);
  }
}
