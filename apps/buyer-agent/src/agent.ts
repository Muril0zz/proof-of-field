/**
 * LLM Buyer Agent — a procurement/compliance agent for a trading company or bank.
 *
 *   NETWORK=anvil pnpm buyer:ai "Buy proofs for every farm in this lot, budget 30 USDT, reject anything with deforestation." [farmerUrl]
 *
 * The model gets four tools and a policy-enforced wallet. It decides what to buy, pays over x402,
 * verifies each proof independently, and writes a compliance report. Every payment goes through
 * the on-chain AgentWallet, so even a misbehaving model cannot exceed the company's limits.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import pc from 'picocolors';
import { NETWORK, account, chain, dep, usdt, policyStatus, listLot, registryStats, buyProof, BuyError, type BuyResult, type Log } from './lib/buy';

const args = process.argv.slice(2).filter((a) => a !== '--');
const instruction = args[0];
const lot = (args.length > 1 ? args.slice(1) : (process.env.FARMER_URLS || 'http://localhost:4020').split(',')).map((u) => u.trim()).filter(Boolean);
if (!instruction) { console.error('usage: buyer:ai "<instruction in natural language>" [farmerAgentUrl ...]'); process.exit(1); }

const ROOT = path.resolve(import.meta.dirname, '../../..');
const client = new Anthropic();
const MODEL = process.env.BUYER_MODEL || 'claude-opus-5';

const dim = (s: string) => console.log(pc.dim(s));
const tool = (name: string, s: string) => console.log(pc.cyan(`  ⚙ ${name}`) + pc.dim(` ${s}`));
const log: Log = { step: (n, s) => console.log(pc.dim(`      [${n}] ${s}`)), ok: (s) => console.log(pc.green('      ✔ ') + pc.dim(s)), info: () => {} };

const purchases: BuyResult[] = [];
const rejections: { proofUrl: string; reason: string }[] = [];

const tools = [
  betaZodTool({
    name: 'list_lot',
    description: 'List every Proof of Field attestation offered by the farmer agents in the lot (one call covers all farmers): farmer name and address, hash, label, CAR registry number, area, hectares deforested after 2020, verdict, price, and the proof URL to buy it. Call this first.',
    inputSchema: z.object({ farmerAgentUrls: z.array(z.string()).describe('Base URLs of the farmer agents in the lot') }),
    run: async ({ farmerAgentUrls }) => {
      tool('list_lot', `${farmerAgentUrls.length} farmer agent(s)`);
      let { proofs, unreachable } = await listLot(farmerAgentUrls);
      const only = (process.env.ONLY_PROOFS || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (only.length) proofs = proofs.filter((p) => only.includes(p.proofUrl));
      proofs.forEach((p) => dim(`      ${p.compliant ? 'COMPLIANT    ' : 'NON-COMPLIANT'} ${p.knownSupplier ? 'known   ' : 'UNKNOWN '}${p.carConflict ? 'CAR-CONFLICT ' : ''}${p.farmerName} · ${p.registered ? '' : 'unregistered '}${p.label || p.hash.slice(0, 12)}  ${p.areaHa} ha  ${p.deforestedHa} ha deforested  ${usdt(p.priceUnits)}`));
      unreachable.forEach((u) => console.log(pc.red(`      ✘ unreachable: ${u}`)));
      return JSON.stringify({ proofs: proofs.map((p) => ({ ...p, price: usdt(p.priceUnits) })), unreachable });
    },
  }),
  betaZodTool({
    name: 'registry_stats',
    description: 'Read the public on-chain registry: how many attestations exist in total, from how many distinct farmers, and how many are compliant. This is the global index every buyer shares; use it for context in the report.',
    inputSchema: z.object({}),
    run: async () => {
      const s = await registryStats();
      tool('registry_stats', `${s.totalAttestations} attestations · ${s.farmers} farmers · ${s.compliant} compliant / ${s.nonCompliant} non-compliant`);
      return JSON.stringify(s);
    },
  }),
  betaZodTool({
    name: 'policy_status',
    description: "Read the company's on-chain AgentWallet spending policy: remaining daily budget, per-payment limit, and USDT balance. Payments outside the policy revert on-chain, so check before buying.",
    inputSchema: z.object({}),
    run: async () => {
      tool('policy_status', dep.agentWallet);
      const s = await policyStatus();
      dim(`      remaining today ${usdt(s.remainingTodayUnits)} · per payment ≤ ${usdt(s.perPaymentLimitUnits)} · balance ${usdt(s.balanceUnits)}`);
      return JSON.stringify({ ...s, remainingToday: usdt(s.remainingTodayUnits), perPaymentLimit: usdt(s.perPaymentLimitUnits), balance: usdt(s.balanceUnits) });
    },
  }),
  betaZodTool({
    name: 'buy_proof',
    description: 'Buy one Proof of Field over x402: request the URL, receive HTTP 402, pay the asked price in USDT through the AgentWallet, retry with X-PAYMENT, and independently verify the signature and on-chain anchoring. Returns the verified attestation data, or an error if the policy rejected the payment or verification failed. Costs real budget: only call for proofs you have decided to buy.',
    inputSchema: z.object({ proofUrl: z.string().url().describe('The proof URL from list_proofs'), reason: z.string().describe('One sentence: why this proof is being bought') }),
    run: async ({ proofUrl, reason }) => {
      tool('buy_proof', `${proofUrl}\n      ${pc.italic(reason)}`);
      try {
        const r = await buyProof(proofUrl, log);
        purchases.push(r);
        return JSON.stringify(r);
      } catch (e: any) {
        const stage = e instanceof BuyError ? e.stage : 'unknown';
        console.log(pc.red(`      ✘ ${stage}: ${e.message}`));
        return JSON.stringify({ ok: false, stage, error: e.message });
      }
    },
  }),
  betaZodTool({
    name: 'skip_proof',
    description: 'Record that a listed proof was deliberately NOT bought, with the reason (non-compliant, over budget, not in this lot, ...). Use this so the compliance report is complete.',
    inputSchema: z.object({ proofUrl: z.string(), reason: z.string() }),
    run: async ({ proofUrl, reason }) => { tool('skip_proof', `${proofUrl}\n      ${pc.italic(reason)}`); rejections.push({ proofUrl, reason }); return 'recorded'; },
  }),
  betaZodTool({
    name: 'write_report',
    description: 'Write the final compliance report (Markdown) to disk. Call exactly once, at the end, after all buy/skip decisions. Include: instruction received, policy budget before/after, a table of every proof considered with decision and reason, on-chain evidence (payment tx, anchor tx, attestation hash) for each purchase, and a one-paragraph conclusion for the procurement team.',
    inputSchema: z.object({ markdown: z.string() }),
    run: async ({ markdown }) => {
      const file = path.join(ROOT, 'docs', 'reports', `compliance-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, markdown);
      tool('write_report', file);
      return `saved to ${file}`;
    },
  }),
];

const system = `You are the autonomous procurement compliance agent of a commodity trading company that buys soy and beef from farms in Brazil.
Your job: obtain Proofs of Field from the farmer agents of a supplier group BEFORE the company contracts volume from them (supplier onboarding and per-season re-verification). The same proofs are later reused in the export dossier. A group spans several farmers and properties.

Facts about your environment:
- You pay with the company's on-chain AgentWallet (${dep.agentWallet}) on ${chain.name}. The wallet enforces a daily limit, a per-payment limit and an allow-list of payees. Any payment outside the policy reverts; you cannot override it.
- Proofs are sold over x402: an HTTP 402 with the price, paid in USDT, then the signed proof is delivered. buy_proof does the whole flow and verifies the proof cryptographically and on-chain. Trust its verification result, not the farmer's claims.
- A proof marked NON-COMPLIANT is still a valid, verifiable proof. Whether to buy it depends on the operator's instruction (some operators want the evidence, most want to skip it).
- Prices are what the farmer asks. You never negotiate; you decide buy or skip.
- "knownSupplier: true" means the seller's address is allow-listed in the company's AgentWallet: the supplier was onboarded (contract, CNPJ, CAR ownership checked). The CAR registry is public, so anyone could compute a true-looking proof for someone else's farm and sign it with their own key. A seller with "knownSupplier: false" is an unknown counterparty: never buy from it (the wallet would refuse the payment anyway) and say so. "carConflict: true" means the same CAR is offered by two different keys. If one of them is an onboarded supplier (knownSupplier: true) and the other is not, buy from the onboarded supplier as normal and flag the unknown one as a likely impersonation. Only when both are onboarded should you refuse both pending investigation.
- Compliance also covers protected areas: "protectedHa" is hectares of the property inside indigenous lands or strict-protection conservation units (blocking). Sustainable-use units (APA) are flagged in protectedHits but do not block.
- A proof is "registered: true" when its polygon is the farmer's official CAR property (Brazil's rural environmental registry, public). Compliance for a lot is judged on registered properties. A proof with "registered: false" is a hand-drawn sub-field: it may be useful for traceability but does NOT clear a lot on its own. Default: skip unregistered proofs and say why, unless the operator explicitly asks for sub-field proofs.

How to work:
1. Read the operator instruction carefully. Extract: which farms/lot, budget, and the compliance rule.
2. Call list_lot (all farmer agents at once), policy_status, and registry_stats.
3. Decide per proof. Never exceed the operator's budget or the wallet policy. If the instruction is ambiguous about a proof, skip it and say why.
4. Buy with buy_proof, one at a time. Skip with skip_proof. Every listed proof must end up in exactly one of the two.
5. Call write_report once, then answer the operator in plain English: what you bought, what you skipped, total spent, and whether the lot is cleared for purchase. Be concise and specific; cite hashes and tx hashes in short form.`;

console.log(pc.bold(`\n🤖 Buyer agent (${MODEL}) · ${account.address} · ${NETWORK}`));
console.log(pc.dim(`   operator: "${instruction}"`));
console.log(pc.dim(`   lot: ${lot.length} farmer agent(s) · ${lot.join(', ')}\n`));

const runner = client.beta.messages.toolRunner({
  model: MODEL,
  max_tokens: 16000,
  system,
  tools,
  messages: [{ role: 'user', content: `Operator instruction: ${instruction}\n\nThe suppliers under review run these farmer agents:\n${lot.map((u) => `- ${u}`).join('\n')}${process.env.ONLY_PROOFS ? `\n\nThe operator pre-selected specific properties; list_lot returns only those. Do not look for others.` : ''}` }],
  max_iterations: 20,
});

for await (const message of runner) {
  for (const block of message.content) {
    if (block.type === 'text' && block.text.trim()) console.log(pc.white(block.text.trim().split('\n').map((l) => `  ${l}`).join('\n')));
  }
}

const spent = purchases.reduce((s, p) => s + BigInt(p.paidUnits), 0n);
console.log(pc.bold(`\n📊 ${purchases.length} bought · ${rejections.length} skipped · ${usdt(spent)} spent`));
for (const p of purchases) console.log(`   ${p.compliant ? pc.green('✔') : pc.red('!')} ${p.car ? p.car.slice(0, 19) + '…' : 'unregistered'} · ${p.attestationHash.slice(0, 10)}… ${p.areaHa} ha · pay ${p.payTx.slice(0, 10)}… · ${p.compliant ? 'deforestation-free' : `${p.deforestedHa} ha deforested`}`);
console.log();
