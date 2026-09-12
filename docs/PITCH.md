# Proof of Field — 3-minute presentation (1 min pitch · 2 min demo) + 2 min Q&A

## Before walking up (checklist)
- ONE browser tab, fullscreen: **http://localhost:4030/demo** (left = FARM, right = TRADER). Nothing else on screen. Reload the page before starting.
- Farm side: dropdown on **João Silva** (three registered properties), none selected. Pedro Lima is the other option (one real CAR property in Nova Mamoré). Trader side: instruction pre-filled; under each supplier, every property ticked with its verdict pill. The trader can untick any property.
- Sales ledger empty (STATUS.md has the command). Slides open in another window, fullscreen, on slide 1.
- Backup only if the page breaks: terminal with `NETWORK=hsk-testnet pnpm buyer -- <proof URL>`.

## 90-second pitch (slides 1 → 2 → 3 → 4 → 5 → 8; skip 6, 7)

**[1] 0:00** "This is Proof of Field. It turns the compliance paper behind every soy and beef shipment into a portable proof: signed once by the farm, bought and verified by AI agents."

**[2] 0:10** "Six traders move most of Brazil's soy and beef. Each clears thousands of farms every season, because every market now demands the same thing: proof the land didn't deforest after 2020. Europe by law. Banks for credit. China as the biggest buyer."

**[3] 0:25** "Today that proof takes weeks. The farm e-mails its entire map to a stranger, a vendor is paid per farm, and the result is a PDF nobody outside can verify. Then the next buyer asks again."

**[4] 0:40** "We make the proof portable. The farm's computer crosses its official CAR polygon with government data, INPE deforestation, indigenous lands, conservation units, and signs once. Any buyer's agent picks up that same proof, verifies it on-chain, and pays the farm per use. The middleman's job splits four ways: agents collect, open software checks, anyone can recompute, and it's done once."

**[5] 1:00** "The check runs on the farm's own computer. What needs the chain is the trade: two companies that don't trust each other, two programs paying each other, and an AI holding money it cannot misuse. The model decides; the contract enforces. That's why it's on HashKey Chain."

**[8] 1:15** "It's live on testnet with real properties and one hundred thousand real polygons. Cooperatives first, banks second, traders last. Let me show you."

## 90-second demo, two clicks (http://localhost:4030/demo)

- **0:00** Click **…9C62**. → "A real property from the registry. Clean."
- **0:10** Click **Sign once & put the proof up for sale**. → "One signature. Only the hash goes on-chain. It's for sale."
- **0:20** Point at the ticked suppliers, click **Run agent**. → "The trader ticks its suppliers and types one sentence. That's all a human does."
- **0:30–1:15**, as the cards appear: "It lists the proofs. Reads its own spending limit on-chain. Buys the clean one over HTTP 402 and verifies the signature and the registry itself. Refuses two properties with clearing. Refuses Pedro: real proof, but a supplier the trader never onboarded. Only onboarded suppliers get paid."
- **1:15** Point left: "And the farm was just paid." Scroll the report: "The dossier writes itself. Same proof next season. That's Proof of Field."

Two sentences to repeat in every Q&A answer: **"The model decides; the contract enforces."** · **"Signed once, verified by anyone, paid per use."**

## Slides 6–10 are for Q&A only
Jump to 7 for "how does it work", 8 for adoption, 9 for the roadmap, 10 for the expected questions with answers (open it if a question you can't answer comes up).

## Demo script (90 s, in English — rehearse 3×)

Open BEFORE walking up: (A) farmer console in the browser, (B) terminal with the buyer command ready, (C) HSK explorer tab.

1. **[Console]** "This is the farmer's agent. It runs on his machine. These red areas are PRODES, the official deforestation map from Brazil's space agency, INPE." Click property …4C8E → 26 ha in 2022. "This one does not pass. The system says exactly where and when." Point at the red overlap on the map.
2. Click …9C62 → Deforestation-free. "This one passes." Click **Sign attestation & anchor on-chain** → hash + tx. "Only the hash went on-chain. The farm's map is still here, on his machine." Copy the proof URL.
3. **[Terminal B]** Run the LLM buyer agent (command pre-typed, just press Enter):
   `NETWORK=hsk-testnet pnpm buyer:ai "Buy the proofs for every farm in this lot. Budget 30 USDT. Reject any farm with deforestation after 2020." http://localhost:4020 http://localhost:4022`
   Narrate while it runs (~70 s, so start it EARLY, right after step 2, and talk over it): "This is the trading company's agent. It got one sentence from the operator. It lists what the farmer sells, checks its own on-chain spending policy, and decides. Watch: it buys the two clean farms over HTTP 402, five USDT each, verifies signature and registry on its own, and refuses the one with 26 hectares. Nobody pressed a button. The farmer was paid the second his data was used." Point at the final summary and the compliance report path.
   **Fallback** if the API is slow or fails: `NETWORK=hsk-testnet pnpm buyer -- <proofUrl>` (deterministic, 5 s, same four steps).
4. **[Explorer]** Show the attest tx and the payment tx on HSK. Done.

Fallback if HSK is down: run everything with `NETWORK=anvil` (identical, no explorer). Have the backup video ready.

## Q&A — answers in English

- **"Why blockchain? This works with a database and a bank transfer."** Three reasons. The buyer is a program: no bank account, so a stablecoin is the only way one machine pays another. The registry belongs to nobody, so any buyer, bank or auditor verifies the proof without trusting the farmer, a certifier, or us. And the spending policy lives in a contract, so nobody can quietly change what the AI is allowed to pay.
- **"PRODES is public. Why doesn't the trader just check it themselves?"** They don't have the farm polygon. What they are buying is the farmer's permission plus his signature saying "this is my area, verified on this date." The farmer stays the owner of the data and decides who gets access.
- **"What stops anyone from taking a public CAR and selling a proof for someone else's farm?"** Nothing stops them from computing it; the check is public. What stops them from getting paid is the same thing that works today: the buyer only pays suppliers it has onboarded. The company allow-lists a supplier's address in its AgentWallet after contract and KYC. In the demo, Pedro Lima offers a real property with a key the trader never onboarded: the agent marks him UNKNOWN, refuses, and the wallet would reject the payment anyway. If someone copies another farm's CAR, the agent also flags the same CAR offered by two keys (CAR-CONFLICT). Next: a gov.br-signed binding "wallet X belongs to the CPF that holds CAR Y" anchored on-chain, or a zkTLS proof of the SICAR login.
- **"Can't the farmer just draw the polygon around the deforested corner?"** Not for compliance. Compliance is judged on the **registered property** (CAR, Brazil's public rural registry), and the attestation of a registered property carries the CAR number and the hash of the *official* polygon. Any buyer can download the public CAR polygon, hash it, and see it matches `fieldId`: nothing was cut out. Hand-drawn fields are marked `registered: false`; the buyer agent skips them for compliance by default and only uses them for sub-field traceability. It did that on its own this morning: it flagged a drawn field as "no CAR reference".
- **"What if the farmer lies in other ways?"** He can't change the INPE data, and he can't change the polygon without changing the hash. What he could do is sign with a key that isn't the property owner's. Binding the farmer key to the CAR owner (a KYC'd attestation from the registry or a bank) is the natural next step.
- **"Is 5 USDT a real price? Will traders really pay farmers?"** Today traders pay a due-diligence vendor per farm and the farmer works for free. We are not selling "traders pay farmers" as the reason to adopt; the reason is a portable proof that clears a shipment in minutes and that banks and importers accept without redoing. The payment is the mechanism that lets two programs transact; who pays and how much is a business decision. Some traders already pay premiums for verified origin, so it is not alien to the sector.
- **"Don't traders verify before buying, not after?"** Yes, and that's when the agent runs: at supplier onboarding, before any contract, and again each season because INPE's map changes yearly. The export dossier then reuses the same proofs; nobody is consulted again. That's what "portable" buys you: one signature, three moments of use.
- **"How does this remove the middleman? That's all the work."** The middleman does four things. Collecting the farm's papers: the buyer's agent fetches the proof itself. Running the check: it's open-source software crossing the official CAR polygon with the same public government data the vendor uses. Being the trusted party: not needed, because the inputs are public and the stamp is on a public registry, so anyone can recompute and verify. Repeating it per buyer, per season: gone, signed once and reused. What remains is thin: someone vouches that the key belongs to the farm (co-op, bank, gov.br), and that role is replaceable.
- **"What exactly does the farmer sign?"** A declaration of origin with the evidence attached: "this registered property is my supply source, and on this date it shows X ha deforested and Y ha in protected areas according to INPE, FUNAI and ICMBio." That is the supplier declaration EUDR already requires, signed once instead of e-mailed to every buyer.
- **"Farmers won't run software."** Large farms will; small ones won't. The farmer agent can be hosted by the cooperative for hundreds of members, with the farmer only authorizing from a phone. That's why cooperatives are first in the adoption path.
- **"Farmers don't want USDT."** Correct. The mechanism is the same with a BRL stablecoin or an automatic off-ramp; we used a mock USDT because that's what the testnet has. Not solved today, and I won't pretend it is.
- **"How does the buyer find a supplier's agent?"** At onboarding the supplier registers the agent's address, the way they register a bank account today. In the demo it's a list; publishing it in the registry is a small next step.
- **"What does the buyer side look like?"** One text box. The compliance desk types the instruction, watches the agent's decisions stream in, and gets the dossier rendered underneath. That's the buyer desk you saw; in production it lives inside the tool they already use.
- **"Who adopts first?"** Cooperatives: one compliance desk answering for hundreds of member farms to every buyer, every season. Then banks and insurers, who need the proof to lend and have no field team. Traders last, once proofs already circulate among their suppliers.
- **"Only deforestation?"** No: the attestation is a claim against official layers. Today: PRODES deforestation, FUNAI indigenous lands, ICMBio/MMA conservation units (strict-protection blocks, sustainable-use flags). Next: DETER real-time alerts, IBAMA embargoes; then non-geographic lists (soy moratorium, slave-labour list) once the wallet is bound to a CPF/CNPJ.
- **"Why HSK Chain?"** EVM, cheap, a sponsor, and the target buyer side is in Asia. The contracts are chain-agnostic.
- **"Is this real x402?"** The 402 body and `accepts[]` follow x402 v1. Settlement today is an on-chain transfer referenced by tx hash. EIP-3009 gasless settlement is the next step.
- **"Is PRODES enough? What about a farm outside your data?"** PRODES is INPE's official annual mapping, the same first-pass source commercial due-diligence providers use. Limits: minimum mapping unit 6.25 ha, annual cadence, Amazon biome only. We load Rondônia, Mato Grosso and Goiás across the Amazon and Cerrado biomes, about 103,000 polygons since 2021, indexed in memory on the farmer's machine. If a field is not fully inside a covered state and biome the agent refuses to attest: absence of data is not absence of deforestation. Adding a state is one download. Next: DETER alerts and IBAMA embargoes.
- **"Real privacy would be ZK."** Agreed. Today: commitment plus aggregates. A ZK proof of "empty intersection" is on the roadmap, and it is feasible because the geometry is simple.

## Timing warning

The LLM run takes ~70 s. Start it right after signing (step 2) and narrate over it. Total demo still fits in ~2:30 if you don't wait in silence.

## Opening line (memorize)

"Every shipment of soy or beef that leaves Brazil carries a piece of paper that took weeks and a stranger holding the farmer's map. Proof of Field makes that paper a five-dollar API call: the farm proves it, keeps the map, and gets paid, and the trader's AI agent buys it across a whole lot."
