#!/usr/bin/env bash
# Downloads INPE/PRODES yearly deforestation polygons (2021+) for the states we cover, per biome,
# plus the state×biome polygons used for coverage checks. ~150 MB. Source: TerraBrasilis WFS.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/prodes
WFS="https://terrabrasilis.dpi.inpe.br/geoserver"
get() { # workspace typeName cql outfile
  curl -sS -m 1200 --get "$WFS/$1/ows" --data-urlencode "service=WFS" --data-urlencode "version=1.0.0" --data-urlencode "request=GetFeature" \
    --data-urlencode "typeName=$2" --data-urlencode "outputFormat=application/json" ${3:+--data-urlencode "CQL_FILTER=$3"} -o "$4"
  echo "✔ $4 ($(du -h "$4" | cut -f1))"
}
# Amazon biome (state field uses the 2-letter code)
for st in RO MT; do get prodes-amazon-nb prodes-amazon-nb:yearly_deforestation_biome "state='$st' AND year>=2021" data/prodes/amazon_${st}_2021plus.json; done
get prodes-amazon-nb prodes-amazon-nb:states_amazon_biome "" data/prodes/states_amazon.json
# Cerrado biome (state field uses the full name)
get prodes-cerrado-nb prodes-cerrado-nb:yearly_deforestation "state='GOIÁS' AND year>=2021" data/prodes/cerrado_GO_2021plus.json
get prodes-cerrado-nb prodes-cerrado-nb:yearly_deforestation "state='MATO GROSSO' AND year>=2021" data/prodes/cerrado_MT_2021plus.json
get prodes-cerrado-nb prodes-cerrado-nb:states_cerrado_biome "" data/prodes/states_cerrado.json
node scripts/build-regions.mjs
echo "done — the farmer agent loads data/prodes/*_2021plus.json on start"
