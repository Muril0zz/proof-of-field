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
import { createPublicClient, createWalletClient, http, parseEventLogs, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  chains, type NetworkName, type Deployment, explorerTx,
  ATTESTATION_TYPES, SCHEMA_ID, attestationHash, domain, fieldIdFromPolygon, serializeAttestation,
  checkDeforestation, registryAbi, usdtAbi,
  type FieldAttestation, type PaymentRequiredBody, decodePayment,
} from '@pof/core';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const NETWORK = (process.env.NETWORK || 'anvil') as NetworkName;
const PORT = Number(process.env.FARMER_PORT || 4020);
const PRICE = BigInt(process.env.PROOF_PRICE_USDT_UNITS || '5000000'); // 5 USDT
const BASELINE_YEAR = Number(process.env.BASELINE_YEAR || 2020);
const PUBLIC_URL = process.env.FARMER_PUBLIC_URL || `http://localhost:${PORT}`;

const dep: Deployment = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments', `${NETWORK}.json`), 'utf8'));
const chain = chains[NETWORK];
const rpc = NETWORK === 'anvil' ? 'http://127.0.0.1:8545' : (process.env.HSK_TESTNET_RPC || chain.rpcUrls.default.http[0]);
const account = privateKeyToAccount(process.env.FARMER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ chain, transport: http(rpc), account });

const prodes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'prodes_abuna_2020plus.json'), 'utf8'));
console.log(`[farmer] ${account.address} on ${NETWORK} (chain ${chain.id}) · registry ${dep.registry} · PRODES ${prodes.features.length} polygons`);

// --- private store (stays on the farmer's machine) ---
interface Stored {
  attestation: FieldAttestation;
  signature: Hex;
  hash: Hex;
  txHash?: Hex;
  report: { areaHa: number; deforestedHa: number; byYear: Record<string, number>; hits: number; dataYear: number; ms: number };
  geometry: any;      // PRIVATE — never served
  intersections: any; // PRIVATE — served only to the farmer's own UI
  label?: string;
  createdAt: string;
}
const STORE = path.join(ROOT, 'data', `farmer-store.${NETWORK}.${dep.registry.slice(2, 10)}.json`);
const store: Record<string, Stored> = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8'), bigintReviver) : {};
interface Payment { txHash: Hex; payer: Address; amount: string; attestationHash: Hex; label?: string; at: string; txUrl: string }
const PAYMENTS = path.join(ROOT, 'data', `farmer-payments.${NETWORK}.${dep.registry.slice(2, 10)}.json`);
const payments: Payment[] = fs.existsSync(PAYMENTS) ? JSON.parse(fs.readFileSync(PAYMENTS, 'utf8')) : [];
const usedPayments = new Set<string>(payments.map((p) => p.txHash));
const persistPayments = () => fs.writeFileSync(PAYMENTS, JSON.stringify(payments, null, 1));
const persist = () => fs.writeFileSync(STORE, JSON.stringify(store, (_, v) => (typeof v === 'bigint' ? `${v}n` : v), 1));
function bigintReviver(_: string, v: any) { return typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v; }

const app = new Hono();
app.use('*', cors());

app.get('/', (c) => c.json({ agent: 'proof-of-field/farmer', farmer: account.address, network: NETWORK, chainId: chain.id, registry: dep.registry, usdt: dep.usdt, priceUnits: PRICE.toString(), attestations: Object.keys(store).length }));

app.get('/prodes', (c) => c.json(prodes));

/** Farmer's own registered properties (CAR polygons). PRIVATE — local UI only. */
const samples = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'samples.json'), 'utf8'));
app.get('/samples', (c) => c.json(samples));

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
  return c.json({ areaHa: r.areaHa, deforestedHa: r.deforestedHa, byYear: r.byYear, hits: r.hits.length, compliant: r.compliant, dataYear: r.dataYear, ms: r.ms, intersections: r.intersections });
});

app.post('/attest', async (c) => {
  const { geometry, label } = await c.req.json();
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return c.json({ error: 'geometry must be Polygon|MultiPolygon' }, 400);
  const feature = { type: 'Feature', properties: {}, geometry } as any;
  const r = checkDeforestation(feature, prodes, BASELINE_YEAR);

  const att: FieldAttestation = {
    fieldId: fieldIdFromPolygon(geometry),
    farmer: account.address,
    areaHa100: BigInt(Math.round(r.areaHa * 100)),
    deforestedHa100: BigInt(Math.round(r.deforestedHa * 100)),
    baselineYear: BigInt(BASELINE_YEAR),
    dataYear: BigInt(r.dataYear),
    source: 'INPE/PRODES yearly_deforestation_biome (terrabrasilis WFS)',
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

  const stored: Stored = {
    attestation: att, signature, hash, txHash,
    report: { areaHa: r.areaHa, deforestedHa: r.deforestedHa, byYear: r.byYear, hits: r.hits.length, dataYear: r.dataYear, ms: r.ms },
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
  const receipt = await pub.getTransactionReceipt({ hash: tx }).catch(() => null);
  if (!receipt || receipt.status !== 'success') return c.json({ error: 'payment tx not found/failed' }, 402);
  const transfers = parseEventLogs({ abi: usdtAbi, logs: receipt.logs, eventName: 'Transfer' })
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
  });
});

function publicView(s: Stored) {
  return { hash: s.hash, label: s.label, farmer: s.attestation.farmer, compliant: s.attestation.compliant, report: s.report,
    attestation: serializeAttestation(s.attestation), signature: s.signature, txHash: s.txHash, txUrl: s.txHash ? explorerTx(NETWORK, s.txHash) : undefined, createdAt: s.createdAt, priceUnits: PRICE.toString() };
}

serve({ fetch: app.fetch, port: PORT }, () => console.log(`[farmer] listening on ${PUBLIC_URL}`));
