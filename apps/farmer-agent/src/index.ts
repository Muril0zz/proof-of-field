/**
 * Farmer Agent — runs on the farmer's machine.
 *  - Holds the farmer's key and the private field polygons (never leave this process).
 *  - POST /attest        : intersects a polygon with PRODES, signs an EIP-712 attestation, anchors its hash on-chain.
 *  - GET  /proof/:hash   : x402 flow — replies 402 with payment requirements; with a valid X-PAYMENT (on-chain USDT
 *                          transfer to the farmer) it releases the signed proof.
 *  - GET  /attestations  : public index (hash, compliant, tx) — no geometry.
 *  - GET  /prodes        : PRODES overlay for the farmer's own map UI.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { createPublicClient, createWalletClient, http, parseEventLogs, type Address, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  chains, type NetworkName, type Deployment, explorerTx,
  ATTESTATION_TYPES, SCHEMA_ID, attestationHash, domain, fieldIdFromPolygon, serializeAttestation,
  checkDeforestation, buildProdesIndex, registryAbi, usdtAbi,
  type FieldAttestation, type PaymentRequiredBody, decodePayment,
} from '@pof/core';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const NETWORK = (process.env.NETWORK || 'anvil') as NetworkName;
const PORT = Number(process.env.FARMER_PORT || 4020);
const PRICE = BigInt(process.env.PROOF_PRICE_USDT_UNITS || '5000000'); // 5 USDT
const BASELINE_YEAR = Number(process.env.BASELINE_YEAR || 2020);
const PUBLIC_URL = process.env.FARMER_PUBLIC_URL || `http://localhost:${PORT}`;

const dep: Deployment = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments', `${NETWORK}.json`), 'utf8'));
const chain: Chain = chains[NETWORK] as Chain;
const rpc = NETWORK === 'anvil' ? 'http://127.0.0.1:8545' : (process.env.HSK_TESTNET_RPC || chain.rpcUrls.default.http[0]);
const account = privateKeyToAccount(process.env.FARMER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ chain, transport: http(rpc), account });

// PRODES extracts: every data/prodes/*_2021plus.json (state × biome) + region polygons for coverage; falls back to the Abunã extract.
const PRODES_DIR = path.join(ROOT, 'data', 'prodes');
const extractFiles = fs.existsSync(PRODES_DIR) ? fs.readdirSync(PRODES_DIR).filter((f) => /_20\d\dplus\.json$/.test(f)).map((f) => path.join(PRODES_DIR, f)) : [];
const collections = (extractFiles.length ? extractFiles : [path.join(ROOT, 'data', 'prodes_abuna_2020plus.json')]).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const regionFiles = fs.existsSync(PRODES_DIR) ? fs.readdirSync(PRODES_DIR).filter((f) => /^regions_.*\.json$/.test(f)).map((f) => path.join(PRODES_DIR, f)) : [];
const regions = regionFiles.length ? { type: 'FeatureCollection', features: regionFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).features) } as any : null;
const protectedFiles = fs.existsSync(PRODES_DIR) ? fs.readdirSync(PRODES_DIR).filter((f) => /^protected_.*\.json$/.test(f)) : [];
const protectedLayers = protectedFiles.map((f) => ({ kind: (f.startsWith('protected_indigenous') ? 'indigenous' : 'conservation') as 'indigenous' | 'conservation', collection: JSON.parse(fs.readFileSync(path.join(PRODES_DIR, f), 'utf8')) }));
const prodes = buildProdesIndex(collections, regions, protectedLayers);
console.log(`[farmer] ${account.address} on ${NETWORK} (chain ${chain.id}) · registry ${dep.registry} · PRODES ${prodes.features.length.toLocaleString()} polygons from ${collections.length} extract(s) · ${prodes.protected.length} protected areas${regions ? ` · coverage: ${prodes.regionNames.join(', ')}` : ''}`);

// --- private store (stays on the farmer's machine) ---
interface Stored {
  attestation: FieldAttestation;
  signature: Hex;
  hash: Hex;
  txHash?: Hex;
  report: { areaHa: number; deforestedHa: number; byYear: Record<string, number>; hits: number; dataYear: number; ms: number; protectedHits?: any[]; protectedBlockingHa?: number; protectedWarningHa?: number };
  geometry: any;      // PRIVATE — never served
  intersections: any; // PRIVATE — served only to the farmer's own UI
  label?: string;
  car?: string;       // CAR receipt when the polygon is the registered property (public registry)
  createdAt: string;
}
const STORE = path.join(ROOT, 'data', `farmer-store.${NETWORK}.${dep.registry.slice(2, 10)}.${account.address.slice(2, 8).toLowerCase()}.json`);
const store: Record<string, Stored> = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8'), bigintReviver) : {};
interface Payment { txHash: Hex; payer: Address; amount: string; attestationHash: Hex; label?: string; at: string; txUrl: string }
const PAYMENTS = path.join(ROOT, 'data', `farmer-payments.${NETWORK}.${dep.registry.slice(2, 10)}.${account.address.slice(2, 8).toLowerCase()}.json`);
const payments: Payment[] = fs.existsSync(PAYMENTS) ? JSON.parse(fs.readFileSync(PAYMENTS, 'utf8')) : [];
const usedPayments = new Set<string>(payments.map((p) => p.txHash));
const persistPayments = () => fs.writeFileSync(PAYMENTS, JSON.stringify(payments, null, 1));
const persist = () => fs.writeFileSync(STORE, JSON.stringify(store, (_, v) => (typeof v === 'bigint' ? `${v}n` : v), 1));
function bigintReviver(_: string, v: any) { return typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v; }

const app = new Hono();
app.use('*', cors());

app.get('/', (c) => c.json({ agent: 'proof-of-field/farmer', name: process.env.FARMER_NAME || 'Farmer agent', farmer: account.address, network: NETWORK, chainId: chain.id, registry: dep.registry, usdt: dep.usdt, priceUnits: PRICE.toString(), attestations: Object.keys(store).length }));

/** PRODES overlay for the map. Pass ?bbox=minx,miny,maxx,maxy to get only what's in view (the full set can be tens of MB). */
app.get('/prodes', (c) => {
  const q = c.req.query('bbox');
  if (!q) return c.json({ type: 'FeatureCollection', features: prodes.features.length > 8000 ? [] : prodes.features, total: prodes.features.length });
  const [x0, y0, x1, y1] = q.split(',').map(Number);
  const out: any[] = [];
  for (let i = 0; i < prodes.features.length; i++) { const b = prodes.bboxes[i]; if (b[0] <= x1 && b[2] >= x0 && b[1] <= y1 && b[3] >= y0) out.push(prodes.features[i]); }
  return c.json({ type: 'FeatureCollection', features: out, total: prodes.features.length });
});
app.get('/coverage', (c) => c.json({ regions: prodes.regionNames, extent: prodes.extent, polygons: prodes.features.length }));

/** Farmer's own registered properties (CAR polygons). PRIVATE — local UI only. */
const SAMPLE_IDS = (process.env.FARMER_SAMPLES || '').split(',').map((x) => x.trim()).filter(Boolean);
const samples = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'samples.json'), 'utf8')) as any[])
  .filter((s) => SAMPLE_IDS.length === 0 || SAMPLE_IDS.includes(s.id));
app.get('/samples', (c) => c.json(samples));
/** fieldId → CAR receipt, so attestations of registered properties carry the registry reference. */
const carByFieldId = new Map<string, string>(samples.map((s: any) => [fieldIdFromPolygon(s.geometry).toLowerCase(), s.car]));

app.get('/attestations', (c) => c.json(Object.values(store).map(publicView)));

/** Sales ledger: payments received for proofs (farmer's own view). */
app.get('/payments', (c) => c.json({ payments, totalUnits: payments.reduce((t, p) => t + BigInt(p.amount), 0n).toString() }));

/** Farmer's own UI needs the private detail (geometry + overlaps). Local only. */
app.get('/attestations/:hash/private', (c) => {
  const s = store[c.req.param('hash').toLowerCase()];
  return s ? c.json({ ...publicView(s), geometry: s.geometry, intersections: s.intersections }) : c.json({ error: 'not found' }, 404);
});

/** Dry run: check a polygon without signing. */
app.post('/check', async (c) => {
  const { geometry } = await c.req.json();
  const feature = { type: 'Feature', properties: {}, geometry } as any;
  const r = checkDeforestation(feature, prodes, BASELINE_YEAR);
  return c.json({ areaHa: r.areaHa, deforestedHa: r.deforestedHa, byYear: r.byYear, hits: r.hits.length, compliant: r.compliant, dataYear: r.dataYear, ms: r.ms, intersections: r.intersections, coverage: r.coverage, protectedHits: r.protectedHits, protectedBlockingHa: r.protectedBlockingHa, protectedWarningHa: r.protectedWarningHa });
});

app.post('/attest', async (c) => {
  const { geometry, label } = await c.req.json();
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return c.json({ error: 'geometry must be Polygon|MultiPolygon' }, 400);
  const feature = { type: 'Feature', properties: {}, geometry } as any;
  const r = checkDeforestation(feature, prodes, BASELINE_YEAR);
  if (!r.coverage.covered) {
    console.log(`[farmer] refused to attest ${label || ''}: field outside PRODES coverage bbox ${r.coverage.bbox.map((n) => n.toFixed(2)).join(',')}`);
    return c.json({ error: 'no_coverage', message: `This field is not fully inside the loaded PRODES coverage (${prodes.regionNames.length ? prodes.regionNames.join(', ') : 'bbox ' + r.coverage.bbox.map((n) => n.toFixed(2)).join(', ')}). No attestation issued: absence of data is not absence of deforestation.`, coverage: r.coverage }, 422);
  }

  const att: FieldAttestation = {
    fieldId: fieldIdFromPolygon(geometry),
    farmer: account.address,
    areaHa100: BigInt(Math.round(r.areaHa * 100)),
    deforestedHa100: BigInt(Math.round(r.deforestedHa * 100)),
    protectedHa100: BigInt(Math.round(r.protectedBlockingHa * 100)),
    baselineYear: BigInt(BASELINE_YEAR),
    dataYear: BigInt(r.dataYear),
    source: 'INPE/PRODES yearly deforestation + FUNAI indigenous lands + ICMBio/MMA conservation units (TerraBrasilis WFS)',
    issuedAt: BigInt(Math.floor(Date.now() / 1000)),
    compliant: r.compliant,
  };
  const signature = await wallet.signTypedData({ domain: domain(chain.id, dep.registry), types: ATTESTATION_TYPES, primaryType: 'FieldAttestation', message: att });
  const hash = attestationHash(att, chain.id, dep.registry);

  let txHash: Hex | undefined;
  try {
    txHash = await wallet.writeContract({ address: dep.registry, abi: registryAbi, functionName: 'attest', args: [hash, att.fieldId, SCHEMA_ID, att.issuedAt, att.compliant] });
    await pub.waitForTransactionReceipt({ hash: txHash });
  } catch (e: any) {
    console.error('[farmer] anchor failed:', e.shortMessage || e.message);
  }

  const car = carByFieldId.get(att.fieldId.toLowerCase());
  const stored: Stored = {
    attestation: att, signature, hash, txHash, car,
    report: { areaHa: r.areaHa, deforestedHa: r.deforestedHa, byYear: r.byYear, hits: r.hits.length, dataYear: r.dataYear, ms: r.ms, protectedHits: r.protectedHits, protectedBlockingHa: r.protectedBlockingHa, protectedWarningHa: r.protectedWarningHa },
    geometry, intersections: r.intersections, label, createdAt: new Date().toISOString(),
  };
  store[hash.toLowerCase()] = stored; persist();
  console.log(`[farmer] attested ${label || ''} ${hash} compliant=${att.compliant} deforested=${r.deforestedHa.toFixed(2)}ha tx=${txHash}`);
  return c.json({ ...publicView(stored), intersections: r.intersections, proofUrl: `${PUBLIC_URL}/proof/${hash}` });
});

/** x402: pay to receive the signed proof. */
app.get('/proof/:hash', async (c) => {
  const hash = c.req.param('hash').toLowerCase() as Hex;
  const s = store[hash];
  if (!s) return c.json({ error: 'unknown attestation' }, 404);
  const resource = `${PUBLIC_URL}/proof/${hash}`;

  const header = c.req.header('X-PAYMENT');
  if (!header) {
    const body: PaymentRequiredBody = {
      x402Version: 1,
      error: 'Payment required to access this Proof of Field',
      accepts: [{
        scheme: 'exact', network: NETWORK, maxAmountRequired: PRICE.toString(), resource,
        description: `Proof of Field ${hash.slice(0, 10)}… — deforestation-free attestation signed by farmer ${account.address}`,
        mimeType: 'application/json', payTo: account.address, maxTimeoutSeconds: 120, asset: dep.usdt,
        extra: { name: 'Mock USDT', decimals: 6, settlement: 'onchain-transfer', chainId: chain.id },
      }],
    };
    return c.json(body, 402);
  }

  // verify payment: an ERC-20 Transfer(to=farmer, value>=PRICE) in the referenced tx, not reused
  let payment; try { payment = decodePayment(header); } catch { return c.json({ error: 'bad X-PAYMENT' }, 400); }
  const tx = payment.payload.txHash;
  if (usedPayments.has(tx)) return c.json({ error: 'payment already used' }, 402);
  // Public RPCs are load-balanced: a tx the buyer just saw mined may not be visible on the node we hit. Retry briefly.
  let receipt: any = null;
  for (let i = 0; i < 12 && !receipt; i++) {
    receipt = await pub.getTransactionReceipt({ hash: tx }).catch(() => null);
    if (!receipt) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!receipt) return c.json({ error: 'payment tx not found (yet)', retry: true }, 402);
  if (receipt.status !== 'success') return c.json({ error: 'payment tx failed' }, 402);
  const transfers = (parseEventLogs({ abi: usdtAbi as any, logs: receipt.logs, eventName: 'Transfer' }) as any[])
    .filter((l) => l.address.toLowerCase() === dep.usdt.toLowerCase() && (l.args as any).to.toLowerCase() === account.address.toLowerCase());
  const paid = transfers.reduce((s, l) => s + BigInt((l.args as any).value), 0n);
  if (paid < PRICE) return c.json({ error: `insufficient payment: got ${paid}, need ${PRICE}` }, 402);
  usedPayments.add(tx);
  payments.unshift({ txHash: tx, payer: payment.payload.payer as Address, amount: paid.toString(), attestationHash: hash, label: s.label, at: new Date().toISOString(), txUrl: explorerTx(NETWORK, tx) });
  persistPayments();
  console.log(`[farmer] 💰 paid ${Number(paid) / 1e6} USDT by ${payment.payload.payer} in ${tx} → releasing proof ${hash.slice(0, 10)}…`);

  c.header('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify({ success: true, txHash: tx, network: NETWORK })).toString('base64'));
  return c.json({
    proof: {
      attestation: serializeAttestation(s.attestation), signature: s.signature, attestationHash: s.hash,
      domain: domain(chain.id, dep.registry), schemaId: SCHEMA_ID, anchorTx: s.txHash, anchorTxUrl: s.txHash ? explorerTx(NETWORK, s.txHash) : undefined,
      registry: dep.registry, chainId: chain.id,
    },
    report: s.report, // aggregate numbers only — no geometry
    car: s.car ?? carByFieldId.get(s.attestation.fieldId.toLowerCase()) ?? null, registered: !!(s.car ?? carByFieldId.get(s.attestation.fieldId.toLowerCase())),
  });
});

function publicView(s: Stored) {
  const car = s.car ?? carByFieldId.get(s.attestation.fieldId.toLowerCase()) ?? null;
  return { hash: s.hash, label: s.label, car, registered: !!car, farmer: s.attestation.farmer, compliant: s.attestation.compliant, report: s.report,
    attestation: serializeAttestation(s.attestation), signature: s.signature, txHash: s.txHash, txUrl: s.txHash ? explorerTx(NETWORK, s.txHash) : undefined, createdAt: s.createdAt, priceUnits: PRICE.toString() };
}

serve({ fetch: app.fetch, port: PORT }, () => console.log(`[farmer] listening on ${PUBLIC_URL}`));
