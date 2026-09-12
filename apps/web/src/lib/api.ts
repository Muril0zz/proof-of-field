export interface Report { areaHa: number; deforestedHa: number; byYear: Record<string, number>; hits: number; dataYear: number; ms: number; compliant?: boolean; intersections?: GeoJSON.FeatureCollection }
export interface Attestation {
  hash: string; label?: string; farmer: string; compliant: boolean; report: Report;
  attestation: Record<string, string | boolean>; signature: string; txHash?: string; txUrl?: string; createdAt: string; priceUnits: string;
}
export interface AgentInfo { agent: string; farmer: string; network: string; chainId: number; registry: string; usdt: string; priceUnits: string; attestations: number }

const j = async <T,>(r: Response): Promise<T> => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };
export const api = {
  info: () => fetch('/api/').then(j<AgentInfo>),
  prodes: () => fetch('/api/prodes').then(j<GeoJSON.FeatureCollection>),
  list: () => fetch('/api/attestations').then(j<Attestation[]>),
  privateDetail: (hash: string) => fetch(`/api/attestations/${hash}/private`).then(j<Attestation & { geometry: GeoJSON.Geometry; intersections: GeoJSON.FeatureCollection }>),
  check: (geometry: GeoJSON.Geometry) => fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ geometry }) }).then(j<Report>),
  attest: (geometry: GeoJSON.Geometry, label?: string) => fetch('/api/attest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ geometry, label }) }).then(j<Attestation & { proofUrl: string; intersections: GeoJSON.FeatureCollection }>),
};

export const fmtHa = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 }) + ' ha';
export const short = (h: string, n = 6) => `${h.slice(0, n + 2)}…${h.slice(-4)}`;
export const usdt = (u: string | number) => `${(Number(u) / 1e6).toFixed(2)} USDT`;
