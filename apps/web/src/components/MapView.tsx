import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import * as turf from '@turf/turf';

export interface MapViewProps {
  prodes: GeoJSON.FeatureCollection | null;
  field: GeoJSON.Geometry | null;
  intersections: GeoJSON.FeatureCollection | null;
  drawing: boolean;
  onDrawn: (g: GeoJSON.Polygon) => void;
}

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    esri: {
      type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics · Deforestation © INPE/PRODES',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};

export function MapView({ prodes, field, intersections, drawing, onDrawn }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const ready = useRef(false);
  const onDrawnRef = useRef(onDrawn); onDrawnRef.current = onDrawn;

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: SATELLITE_STYLE, center: [-65.16, -9.75], zoom: 10.6, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    m.on('load', () => {
      m.addSource('prodes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'prodes-fill', type: 'fill', source: 'prodes', paint: { 'fill-color': ['case', ['>', ['get', 'year'], 2020], '#d6453a', '#8a8f9c'], 'fill-opacity': ['case', ['>', ['get', 'year'], 2020], 0.42, 0.28] } });
      m.addLayer({ id: 'prodes-line', type: 'line', source: 'prodes', paint: { 'line-color': ['case', ['>', ['get', 'year'], 2020], '#b3261e', '#6b7080'], 'line-width': 0.6, 'line-opacity': 0.8 } });
      m.addSource('field', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'field-fill', type: 'fill', source: 'field', paint: { 'fill-color': '#3b3fb6', 'fill-opacity': 0.12 } });
      m.addLayer({ id: 'field-line', type: 'line', source: 'field', paint: { 'line-color': '#ffffff', 'line-width': 2.2 } });
      m.addLayer({ id: 'field-line-2', type: 'line', source: 'field', paint: { 'line-color': '#3b3fb6', 'line-width': 1.2 } });
      m.addSource('hits', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'hits-fill', type: 'fill', source: 'hits', paint: { 'fill-color': '#ff3b2f', 'fill-opacity': 0.75 } });
      m.addLayer({ id: 'hits-line', type: 'line', source: 'hits', paint: { 'line-color': '#fff', 'line-width': 1.5 } });

      const d = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: m }),
        modes: [
          new TerraDrawPolygonMode({ styles: { fillColor: '#3b3fb6', fillOpacity: 0.15, outlineColor: '#ffffff', outlineWidth: 2, closingPointColor: '#ffffff', closingPointOutlineColor: '#3b3fb6', closingPointWidth: 6, closingPointOutlineWidth: 2 } }),
          new TerraDrawSelectMode(),
        ],
      });
      d.start();
      d.on('finish', (id) => {
        const f = d.getSnapshot().find((x) => x.id === id);
        if (f && f.geometry.type === 'Polygon') { onDrawnRef.current(f.geometry as GeoJSON.Polygon); d.clear(); d.setMode('select'); }
      });
      draw.current = d;
      ready.current = true;
      m.fire('pof:ready');
    });
    map.current = m;
    if (import.meta.env.DEV) (window as any).__pofMap = m;
    return () => { draw.current?.stop(); m.remove(); };
  }, []);

  const whenReady = (fn: (m: maplibregl.Map) => void) => {
    const m = map.current; if (!m) return;
    if (ready.current) fn(m); else m.once('pof:ready', () => fn(m));
  };

  useEffect(() => { if (prodes) whenReady((m) => (m.getSource('prodes') as maplibregl.GeoJSONSource).setData(prodes)); }, [prodes]);
  useEffect(() => whenReady((m) => {
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: field ? [{ type: 'Feature', properties: {}, geometry: field }] : [] };
    (m.getSource('field') as maplibregl.GeoJSONSource).setData(fc);
    if (field) { const b = turf.bbox(fc as any); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 700, maxZoom: 14 }); }
  }), [field]);
  useEffect(() => whenReady((m) => (m.getSource('hits') as maplibregl.GeoJSONSource).setData(intersections ?? { type: 'FeatureCollection', features: [] })), [intersections]);
  useEffect(() => { const d = draw.current; if (!d) return; d.setMode(drawing ? 'polygon' : 'select'); if (!drawing) d.clear(); }, [drawing]);

  return <div ref={el} className="map" />;
}
