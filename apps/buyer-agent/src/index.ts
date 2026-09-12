/**
 * Buyer Agent — runs at the trading company / bank.
 * Usage: pnpm buyer <proofUrl>      (or: pnpm buyer --list http://farmer:4020)
 *
 * 1. GET proof → 402 Payment Required (x402)
 * 2. Pay through the company's AgentWallet (policy-enforced: daily & per-payment limits, allow-listed payees)
 * 3. Retry with X-PAYMENT → receive signed proof
 * 4. Verify: EIP-712 signature by farmer, hash anchored in registry by the same farmer, not revoked
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  chains, type NetworkName, type Deployment, explorerTx, agentWalletAbi, registryAbi,
  deserializeAttestation, verifyAttestationSignature, attestationHash, encodePayment, type PaymentRequiredBody,
} from '@pof/core';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const NETWORK = (process.env.NETWORK || 'anvil') as NetworkName;
const dep: Deployment = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments', `${NETWORK}.json`), 'utf8'));
const chain: Chain = chains[NETWORK] as Chain;
const rpc = NETWORK === 'anvil' ? 'http://127.0.0.1:8545' : (process.env.HSK_TESTNET_RPC || chain.rpcUrls.default.http[0]);
const account = privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ chain, transport: http(rpc), account });

const step = (n: number, s: string) => console.log(pc.bold(pc.cyan(`\n[${n}] ${s}`)));
const ok = (s: string) => console.log(pc.green('  ✔ ') + s);
const info = (s: string) => console.log(pc.dim('    ' + s));
const fail = (s: string) => { console.log(pc.red('  ✘ ') + s); process.exit(1); };
const usdt = (u: bigint | string) => `${(Number(u) / 1e6).toFixed(2)} USDT`;

const args = process.argv.slice(2).filter((a) => a !== '--');
if (args[0] === '--list') {
  const base = args[1] || 'http://localhost:4020';
  const list = await fetch(`${base}/attestations`).then((r) => r.json());
  console.log(pc.bold(`\nProofs offered by farmer agent ${base}:`));
  for (const a of list) console.log(`  ${a.compliant ? pc.green('COMPLIANT   ') : pc.red('NON-COMPLIANT')} ${a.hash}  ${a.label || ''}  ${a.report.areaHa.toFixed(0)} ha  ${usdt(a.priceUnits)}`);
  process.exit(0);
}
const url = args[0];
if (!url) fail('usage: buyer-agent <proofUrl> | --list <farmerBaseUrl>');

console.log(pc.bold(`\n🤖 Buyer agent ${account.address} on ${NETWORK} (chain ${chain.id})`));
const remaining = await pub.readContract({ address: dep.agentWallet, abi: agentWalletAbi, functionName: 'remainingToday' }) as bigint;
info(`AgentWallet ${dep.agentWallet} · policy budget remaining today: ${usdt(remaining)}`);

step(1, `Requesting ${url}`);
const r1 = await fetch(url);
if (r1.status !== 402) fail(`expected 402, got ${r1.status}`);
const req = (await r1.json()) as PaymentRequiredBody;
const offer = req.accepts.find((a) => a.network === NETWORK && a.scheme === 'exact');
if (!offer) fail(`no acceptable payment option for ${NETWORK}: ${JSON.stringify(req.accepts.map((a) => a.network))}`);
ok(`402 Payment Required · ${offer!.description}`);
info(`pay ${usdt(offer!.maxAmountRequired)} to ${offer!.payTo} in asset ${offer!.asset}`);
if (offer!.asset.toLowerCase() !== dep.usdt.toLowerCase()) fail('farmer asks for an asset our policy does not hold');

step(2, 'Paying through the company AgentWallet (policy-enforced)');
const resourceId = keccak256(toHex(offer!.resource));
let payTx: Hex;
try {
  payTx = await wallet.writeContract({ address: dep.agentWallet, abi: agentWalletAbi, functionName: 'pay', args: [offer!.payTo, BigInt(offer!.maxAmountRequired), resourceId] });
} catch (e: any) {
  fail(`policy rejected the payment: ${e.shortMessage || e.message}`);
}
const rec = await pub.waitForTransactionReceipt({ hash: payTx! });
if (rec.status !== 'success') fail('payment tx reverted');
ok(`paid ${usdt(offer!.maxAmountRequired)} · tx ${payTx!}`);
info(explorerTx(NETWORK, payTx!));

step(3, 'Retrying with X-PAYMENT');
const r2 = await fetch(url, { headers: { 'X-PAYMENT': encodePayment({ x402Version: 1, scheme: 'exact', network: NETWORK, payload: { txHash: payTx!, payer: account.address } }) } });
if (r2.status !== 200) fail(`farmer refused: ${r2.status} ${await r2.text()}`);
const { proof, report } = await r2.json();
ok('proof received');

step(4, 'Verifying the proof independently');
const att = deserializeAttestation(proof.attestation);
const sigOk = await verifyAttestationSignature(att, proof.signature, chain.id, dep.registry);
sigOk ? ok(`EIP-712 signature valid, signed by farmer ${att.farmer}`) : fail('signature INVALID');
const h = attestationHash(att, chain.id, dep.registry);
h.toLowerCase() === proof.attestationHash.toLowerCase() ? ok(`attestation hash matches ${h}`) : fail('hash mismatch');
const onchain = await pub.readContract({ address: dep.registry, abi: registryAbi, functionName: 'get', args: [h] }) as any;
if (onchain.farmer === '0x0000000000000000000000000000000000000000') fail('attestation NOT anchored on-chain');
onchain.farmer.toLowerCase() === att.farmer.toLowerCase() ? ok(`anchored on-chain by the same farmer at block time ${new Date(Number(onchain.anchoredAt) * 1000).toISOString()}`) : fail('on-chain farmer differs from signer');
onchain.revoked ? fail('attestation was REVOKED') : ok('not revoked');
if (proof.anchorTxUrl) info(proof.anchorTxUrl);

console.log(pc.bold('\n📄 Proof of Field'));
console.log(`   field commitment  ${att.fieldId}`);
console.log(`   area              ${(Number(att.areaHa100) / 100).toFixed(2)} ha`);
console.log(`   deforested >${att.baselineYear}  ${(Number(att.deforestedHa100) / 100).toFixed(2)} ha  ${report.byYear && Object.keys(report.byYear).length ? JSON.stringify(Object.fromEntries(Object.entries(report.byYear).map(([y, v]: any) => [y, +v.toFixed(2)]))) : ''}`);
console.log(`   data              ${att.source} (through ${att.dataYear})`);
console.log(`   issued            ${new Date(Number(att.issuedAt) * 1000).toISOString()}`);
console.log(`   verdict           ${att.compliant ? pc.bgGreen(pc.black(' DEFORESTATION-FREE ')) : pc.bgRed(pc.white(' NON-COMPLIANT '))}`);
console.log(pc.dim('\n   The farm polygon was never transmitted. Only its commitment, the claim, and the signature.\n'));
