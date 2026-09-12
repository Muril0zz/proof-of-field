/**
 * Buyer Agent — plain CLI (no LLM). Usage:
 *   pnpm buyer -- --list http://localhost:4020
 *   pnpm buyer -- <proofUrl>
 * For the LLM-driven agent see agent.ts (pnpm buyer:ai "<instruction>").
 */
import 'dotenv/config';
import pc from 'picocolors';
import { NETWORK, account, chain, dep, usdt, policyStatus, listProofs, buyProof, BuyError } from './lib/buy';

const args = process.argv.slice(2).filter((a) => a !== '--');
const fail = (s: string) => { console.log(pc.red('  ✘ ') + s); process.exit(1); };

if (args[0] === '--list') {
  const base = args[1] || 'http://localhost:4020';
  const list = await listProofs(base);
  console.log(pc.bold(`\nProofs offered by farmer agent ${base}:`));
  for (const a of list) console.log(`  ${a.compliant ? pc.green('COMPLIANT   ') : pc.red('NON-COMPLIANT')} ${a.hash}  ${a.label || ''}  ${a.areaHa.toFixed(0)} ha  ${usdt(a.priceUnits)}`);
  process.exit(0);
}
const url = args[0];
if (!url) fail('usage: buyer-agent <proofUrl> | --list <farmerBaseUrl>');

console.log(pc.bold(`\n🤖 Buyer agent ${account.address} on ${NETWORK} (chain ${chain.id})`));
const ps = await policyStatus();
console.log(pc.dim(`    AgentWallet ${dep.agentWallet} · policy budget remaining today: ${usdt(ps.remainingTodayUnits)}`));

let r;
try {
  r = await buyProof(url, {
    step: (n, s) => console.log(pc.bold(pc.cyan(`\n[${n}] ${s}`))),
    ok: (s) => console.log(pc.green('  ✔ ') + s),
    info: (s) => console.log(pc.dim('    ' + s)),
  });
} catch (e: any) { fail(e instanceof BuyError ? `${e.stage}: ${e.message}` : e.message); }

const p = r!;
console.log(pc.bold('\n📄 Proof of Field'));
console.log(`   field commitment  ${p.fieldId}`);
console.log(`   area              ${p.areaHa.toFixed(2)} ha`);
console.log(`   deforested >${p.baselineYear}  ${p.deforestedHa.toFixed(2)} ha  ${Object.keys(p.byYear).length ? JSON.stringify(Object.fromEntries(Object.entries(p.byYear).map(([y, v]: any) => [y, +v.toFixed(2)]))) : ''}`);
console.log(`   data              ${p.source} (through ${p.dataYear})`);
console.log(`   issued            ${p.issuedAt}`);
console.log(`   verdict           ${p.compliant ? pc.bgGreen(pc.black(' DEFORESTATION-FREE ')) : pc.bgRed(pc.white(' NON-COMPLIANT '))}`);
console.log(pc.dim('\n   The farm polygon was never transmitted. Only its commitment, the claim, and the signature.\n'));
