export interface ProtectedHit { kind: string; name: string; areaHa: number; blocking: boolean }
export interface Report { coverage?: { bbox: number[]; covered: boolean }; protectedHits?: ProtectedHit[]; protectedBlockingHa?: number; protectedWarningHa?: number; areaHa: number; deforestedHa: number; byYear: Record<string, number>; hits: number; dataYear: number; ms: number; compliant?: boolean; intersections?: GeoJSON.FeatureCollection }
export interface Attestation {
  hash: string; label?: string; farmer: string; compliant: boolean; report: Report;
  attestation: Record<string, string | boolean>; signature: string; txHash?: string; txUrl?: string; createdAt: string; priceUnits: string;
}
export interface Payment { txHash: string; payer: string; amount: string; attestationHash: string; label?: string; at: string; txUrl: string }
export interface AgentInfo { agent: string; name?: string; farmer: string; network: string; chainId: number; registry: string; usdt: string; priceUnits: string; attestations: number }

const j = async <T,>(r: Response): Promise<T> => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };

/** Which farmer agent this console talks to. Each farm (or its co-op) runs its own agent with its own key. */
export const FARMERS: { name: string; url: string }[] = [
  { name: 'João Silva', url: 'http://localhost:4020' },
  { name: 'Maria Souza', url: 'http://localhost:4021' },
];
let base = (() => { try { return localStorage.getItem('pof.farmer') || FARMERS[0].url; } catch { return FARMERS[0].url; } })();
export const getFarmerUrl = () => base;
export const setFarmerUrl = (u: string) => { base = u; try { localStorage.setItem('pof.farmer', u); } catch {} };
const u = (path: string) => `${base}${path}`;
export const api = {
  info: () => fetch(u('/')).then(j<AgentInfo>),
  prodes: (bbox?: number[]) => fetch(bbox ? u(`/prodes?bbox=${bbox.join(',')}`) : u('/prodes')).then(j<GeoJSON.FeatureCollection & { total?: number }>),
  coverage: () => fetch(u('/coverage')).then(j<{ regions: string[]; extent: number[]; polygons: number }>),
  list: () => fetch(u('/attestations')).then(j<Attestation[]>),
  payments: () => fetch(u('/payments')).then(j<{ payments: Payment[]; totalUnits: string }>),
  samples: () => fetch(u('/samples')).then(j<any[]>),
  privateDetail: (hash: string) => fetch(u(`/attestations/${hash}/private`)).then(j<Attestation & { geometry: GeoJSON.Geometry; intersections: GeoJSON.FeatureCollection }>),
  check: (geometry: GeoJSON.Geometry) => fetch(u('/check'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ geometry }) }).then(j<Report>),
  attest: (geometry: GeoJSON.Geometry, label?: string) => fetch(u('/attest'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ geometry, label }) }).then(j<Attestation & { proofUrl: string; intersections: GeoJSON.FeatureCollection }>),
};

export const fmtHa = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 }) + ' ha';
export const short = (h: string, n = 6) => `${h.slice(0, n + 2)}…${h.slice(-4)}`;
export const usdt = (u: string | number) => `${(Number(u) / 1e6).toFixed(2)} USDT`;
