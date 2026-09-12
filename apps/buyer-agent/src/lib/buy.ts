/**
 * The x402 buy flow as a reusable function: 402 → AgentWallet.pay → X-PAYMENT → verify.
 * Used by both the plain CLI (index.ts) and the LLM agent (agent.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  chains, type NetworkName, type Deployment, explorerTx, agentWalletAbi, registryAbi, usdtAbi,
  deserializeAttestation, verifyAttestationSignature, attestationHash, encodePayment, type PaymentRequiredBody,
} from '@pof/core';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const NETWORK = (process.env.NETWORK || 'anvil') as NetworkName;
export const dep: Deployment = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments', `${NETWORK}.json`), 'utf8'));
export const chain: Chain = chains[NETWORK] as Chain;
const rpc = NETWORK === 'anvil' ? 'http://127.0.0.1:8545' : (process.env.HSK_TESTNET_RPC || chain.rpcUrls.default.http[0]);
export const account = privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as Hex);
export const pub = createPublicClient({ chain, transport: http(rpc) });
export const wallet = createWalletClient({ chain, transport: http(rpc), account });

export const usdt = (u: bigint | string | number) => `${(Number(u) / 1e6).toFixed(2)} USDT`;

export interface PolicyStatus { agentWallet: string; remainingTodayUnits: string; perPaymentLimitUnits: string; dailyLimitUnits: string; balanceUnits: string }
export async function policyStatus(): Promise<PolicyStatus> {
  const [remaining, per, daily, bal] = await Promise.all([
    pub.readContract({ address: dep.agentWallet, abi: agentWalletAbi, functionName: 'remainingToday' }) as Promise<bigint>,
    pub.readContract({ address: dep.agentWallet, abi: agentWalletAbi, functionName: 'perPaymentLimit' }) as Promise<bigint>,
    pub.readContract({ address: dep.agentWallet, abi: agentWalletAbi, functionName: 'dailyLimit' }) as Promise<bigint>,
    pub.readContract({ address: dep.usdt, abi: usdtAbi, functionName: 'balanceOf', args: [dep.agentWallet] }) as Promise<bigint>,
  ]);
  return { agentWallet: dep.agentWallet, remainingTodayUnits: remaining.toString(), perPaymentLimitUnits: per.toString(), dailyLimitUnits: daily.toString(), balanceUnits: bal.toString() };
}

export interface ProofListing { hash: string; label?: string; car: string | null; registered: boolean; farmer: string; farmerName: string; farmerAgent: string; compliant: boolean; areaHa: number; deforestedHa: number; byYear: Record<string, number>; priceUnits: string; proofUrl: string; anchored: boolean }
export async function listProofs(farmerBaseUrl: string): Promise<ProofListing[]> {
  const base = farmerBaseUrl.replace(/\/$/, '');
  const [info, list] = await Promise.all([
    fetch(`${base}/`).then((r) => r.json()).catch(() => ({})) as Promise<any>,
    fetch(`${base}/attestations`).then((r) => r.json()) as Promise<any[]>,
  ]);
  return list.map((a) => ({ hash: a.hash, label: a.label, car: a.car ?? null, registered: !!a.registered, farmer: a.farmer, farmerName: info.name || 'Farmer agent', farmerAgent: base, compliant: a.compliant, areaHa: +a.report.areaHa.toFixed(2), deforestedHa: +a.report.deforestedHa.toFixed(2), byYear: a.report.byYear, priceUnits: a.priceUnits, proofUrl: `${base}/proof/${a.hash}`, anchored: !!a.txHash }));
}

/** Lot = several farmer agents. Unreachable agents are reported, not fatal. */
export async function listLot(farmerUrls: string[]): Promise<{ proofs: ProofListing[]; unreachable: string[] }> {
  const proofs: ProofListing[] = []; const unreachable: string[] = [];
  await Promise.all(farmerUrls.map(async (u) => { try { proofs.push(...(await listProofs(u))); } catch { unreachable.push(u); } }));
  return { proofs, unreachable };
}

/** Global on-chain index: every attestation ever anchored in the registry, by any farmer. */
export async function registryStats(): Promise<{ totalAttestations: string; farmers: number; compliant: number; nonCompliant: number; registry: string }> {
  const total = await pub.readContract({ address: dep.registry, abi: registryAbi, functionName: 'totalAttestations' }) as bigint;
  // Public RPCs cap eth_getLogs ranges, so scan in chunks from the deployment block.
  const latest = await pub.getBlockNumber();
  const logs: any[] = [];
  const CHUNK = 2000n;
  for (let from = BigInt(dep.deployBlock ?? 0); from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    try { logs.push(...(await pub.getContractEvents({ address: dep.registry, abi: registryAbi as any, eventName: 'Attested', fromBlock: from, toBlock: to }))); } catch { /* skip chunk */ }
  }
  const farmers = new Set<string>(); let compliant = 0, nonCompliant = 0;
  for (const l of logs as any[]) { farmers.add(String(l.args.farmer).toLowerCase()); if (l.args.compliant) compliant++; else nonCompliant++; }
  return { totalAttestations: total.toString(), farmers: farmers.size, compliant, nonCompliant, registry: dep.registry };
}

export type Step = (n: number, s: string) => void;
export type Log = { step: Step; ok: (s: string) => void; info: (s: string) => void };
export const silentLog: Log = { step: () => {}, ok: () => {}, info: () => {} };

export interface BuyResult {
  ok: true; proofUrl: string; paidUnits: string; payTx: string; payTxUrl: string;
  attestationHash: string; farmer: string; anchorTx?: string; anchorTxUrl?: string; anchoredAt: string;
  areaHa: number; deforestedHa: number; byYear: Record<string, number>; baselineYear: number; dataYear: number; source: string; issuedAt: string;
  compliant: boolean; fieldId: string; checks: string[]; car: string | null; registered: boolean;
}
export class BuyError extends Error { constructor(public stage: string, msg: string) { super(msg); } }

export async function buyProof(url: string, log: Log = silentLog): Promise<BuyResult> {
  const checks: string[] = [];
  log.step(1, `Requesting ${url}`);
  const r1 = await fetch(url);
  if (r1.status !== 402) throw new BuyError('request', `expected 402, got ${r1.status}`);
  const req = (await r1.json()) as PaymentRequiredBody;
  const offer = req.accepts.find((a) => a.network === NETWORK && a.scheme === 'exact');
  if (!offer) throw new BuyError('offer', `no acceptable payment option for ${NETWORK}`);
  log.ok(`402 Payment Required · ${offer.description}`);
  log.info(`pay ${usdt(offer.maxAmountRequired)} to ${offer.payTo} in asset ${offer.asset}`);
  if (offer.asset.toLowerCase() !== dep.usdt.toLowerCase()) throw new BuyError('offer', 'farmer asks for an asset our policy does not hold');

  log.step(2, 'Paying through the company AgentWallet (policy-enforced)');
  const resourceId = keccak256(toHex(offer.resource));
  let payTx: Hex;
  try {
    payTx = await wallet.writeContract({ address: dep.agentWallet, abi: agentWalletAbi, functionName: 'pay', args: [offer.payTo, BigInt(offer.maxAmountRequired), resourceId] });
  } catch (e: any) { throw new BuyError('policy', `policy rejected the payment: ${e.shortMessage || e.message}`); }
  const rec = await pub.waitForTransactionReceipt({ hash: payTx });
  if (rec.status !== 'success') throw new BuyError('payment', 'payment tx reverted');
  log.ok(`paid ${usdt(offer.maxAmountRequired)} · tx ${payTx}`);
  log.info(explorerTx(NETWORK, payTx));

  log.step(3, 'Retrying with X-PAYMENT');
  const r2 = await fetch(url, { headers: { 'X-PAYMENT': encodePayment({ x402Version: 1, scheme: 'exact', network: NETWORK, payload: { txHash: payTx, payer: account.address } }) } });
  if (r2.status !== 200) throw new BuyError('delivery', `farmer refused: ${r2.status} ${await r2.text()}`);
  const { proof, report, car: carRef, registered: isRegistered } = await r2.json();
  log.ok('proof received');

  log.step(4, 'Verifying the proof independently');
  const att = deserializeAttestation(proof.attestation);
  const sigOk = await verifyAttestationSignature(att, proof.signature, chain.id, dep.registry);
  if (!sigOk) throw new BuyError('verify', 'signature INVALID');
  checks.push(`EIP-712 signature valid, signed by farmer ${att.farmer}`); log.ok(checks.at(-1)!);
  const h = attestationHash(att, chain.id, dep.registry);
  if (h.toLowerCase() !== proof.attestationHash.toLowerCase()) throw new BuyError('verify', 'hash mismatch');
  checks.push(`attestation hash matches ${h}`); log.ok(checks.at(-1)!);
  const onchain = await pub.readContract({ address: dep.registry, abi: registryAbi, functionName: 'get', args: [h] }) as any;
  if (onchain.farmer === '0x0000000000000000000000000000000000000000') throw new BuyError('verify', 'attestation NOT anchored on-chain');
  if (onchain.farmer.toLowerCase() !== att.farmer.toLowerCase()) throw new BuyError('verify', 'on-chain farmer differs from signer');
  const anchoredAt = new Date(Number(onchain.anchoredAt) * 1000).toISOString();
  checks.push(`anchored on-chain by the same farmer at ${anchoredAt}`); log.ok(checks.at(-1)!);
  if (onchain.revoked) throw new BuyError('verify', 'attestation was REVOKED');
  checks.push('not revoked'); log.ok('not revoked');
  if (proof.anchorTxUrl) log.info(proof.anchorTxUrl);

  return {
    ok: true, proofUrl: url, paidUnits: offer.maxAmountRequired, payTx, payTxUrl: explorerTx(NETWORK, payTx),
    attestationHash: h, farmer: att.farmer, anchorTx: proof.anchorTx, anchorTxUrl: proof.anchorTxUrl, anchoredAt,
    areaHa: Number(att.areaHa100) / 100, deforestedHa: Number(att.deforestedHa100) / 100, byYear: report.byYear || {},
    baselineYear: Number(att.baselineYear), dataYear: Number(att.dataYear), source: att.source, issuedAt: new Date(Number(att.issuedAt) * 1000).toISOString(),
    compliant: att.compliant, fieldId: att.fieldId, checks, car: carRef ?? null, registered: !!isRegistered,
  };
}
