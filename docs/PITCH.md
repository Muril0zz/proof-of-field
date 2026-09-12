# Proof of Field — 3-minute presentation (1 min pitch · 2 min demo) + 2 min Q&A

## Before walking up (checklist)
- Console open at http://localhost:5173, PRODES layer OFF, no field selected. Farmer A (port 4020) lists …9C62 (clean) and …4C8E (26 ha); Farmer B (port 4021, a neighbour, different key) lists …0A28 (18.6 ha). The lot = two farmers, three properties. Sales section empty (delete `data/farmer-payments.hsk-testnet.*.json` and restart the farmer agent if not).
- Terminal with this typed, NOT executed: `cd ~/Documents/Projetos_Codigo/eag-buildathon && NETWORK=hsk-testnet pnpm buyer:ai "Buy the proofs for every farm in this lot. Budget 30 USDT. Reject any farm with deforestation after 2020." http://localhost:4020 http://localhost:4021`
- Explorer tab: https://testnet-explorer.hsk.xyz/address/0xe0e5e881542266aac1b3457fdd33147c761b46dd
- Slides open on slide 1, fullscreen.

## 1 minute pitch (slides 1 → 5, ~12 s each)

**Slide 1 (0:00).** "This is Proof of Field. It turns the compliance paperwork behind every soy and beef shipment into something machines buy and sell."

**Slide 2 (0:10).** "Six traders move most of Brazil's soy and beef. Each clears thousands of farms per season, and every market now asks for the same proof per farm: Europe by law, banks for credit, China as the biggest buyer. Their compliance teams do it by hand."

**Slide 3 (0:22).** "Today it takes weeks. The farmer e-mails the entire farm map to a stranger, the trader pays a vendor per farm, and the result is a PDF nobody outside can verify. Then the next buyer asks again."

**Slide 4 (0:37).** "We turned it into a five-dollar API call. Each farmer's computer runs the official check, signs it, and puts it up for sale. The trader's AI agent buys across the whole lot, pays each farmer in stablecoin, and verifies everything on-chain. Two minutes, no humans, and no farm map ever leaves a farm."

**Slide 5 (0:50).** "The check is SQL, we run it locally. What isn't SQL is the trade: two companies that don't trust each other, two programs paying each other, and an AI holding money it cannot misuse. Let me show you."

## 2 minute demo (happy path only)

**0:00 [Console]** Click **…9C62**. Green verdict appears. → "This is a real 5,500-hectare property from Brazil's rural registry, checked against INPE's official deforestation map for Rondônia, Mato Grosso and Goiás. Clean."

**0:10 [Console]** Click **Sign attestation & anchor on-chain**. Wait for the hash and tx (~5 s). → "Signed by the farmer's key. Only the hash goes to HashKey Chain. The proof is now for sale."

**0:20 [Terminal]** Press **Enter**. → "This is the trading company's agent. It got one sentence from the operator: buy this lot, budget 30, reject deforestation. The lot is two different farmers, three properties." *(It runs ~70 s. Talk over it, don't wait in silence.)*

**0:30** as `list_proofs` / `policy_status` print → "It lists what the farmer sells and reads its own on-chain spending policy."

**0:45** as the first `buy_proof` prints → "HTTP 402, payment required. It pays five USDT through a wallet with hard limits. Gets the proof. Verifies the signature and the registry itself, without trusting the farmer or us."

**1:15** as `skip_proof` prints → "And these two it refuses: 26 hectares on one, 18 on the neighbour's. It says why, per farm."

**1:35 [Console]** Point at **Sales**: +5.00 USDT appeared by itself. → "The farmer was paid the second his data was used."

**1:45 [Explorer]** Click the payment tx. → "Every step is a public transaction on HashKey Chain."

**1:55** "Farmer paid. Trader cleared. Nobody e-mailed anyone. That's Proof of Field."

**Fallback** if the API stalls (>90 s): Ctrl-C, run `NETWORK=hsk-testnet pnpm buyer -- <proof URL from console>` (5 s, same four steps, no LLM). Say: "same flow, without the model deciding."

## Slides 6–8 are for Q&A only
Jump to 7 for "how does it work", 8 for "what's next / who are you".

## Demo script (90 s, in English — rehearse 3×)

Open BEFORE walking up: (A) farmer console in the browser, (B) terminal with the buyer command ready, (C) HSK explorer tab.

1. **[Console]** "This is the farmer's agent. It runs on his machine. These red areas are PRODES, the official deforestation map from Brazil's space agency, INPE." Click property …4C8E → 26 ha in 2022. "This one does not pass. The system says exactly where and when." Point at the red overlap on the map.
2. Click …9C62 → Deforestation-free. "This one passes." Click **Sign attestation & anchor on-chain** → hash + tx. "Only the hash went on-chain. The farm's map is still here, on his machine." Copy the proof URL.
3. **[Terminal B]** Run the LLM buyer agent (command pre-typed, just press Enter):
   `NETWORK=hsk-testnet pnpm buyer:ai "Buy the proofs for every farm in this lot. Budget 30 USDT. Reject any farm with deforestation after 2020." http://localhost:4020 http://localhost:4021`
   Narrate while it runs (~70 s, so start it EARLY, right after step 2, and talk over it): "This is the trading company's agent. It got one sentence from the operator. It lists what the farmer sells, checks its own on-chain spending policy, and decides. Watch: it buys the two clean farms over HTTP 402, five USDT each, verifies signature and registry on its own, and refuses the one with 26 hectares. Nobody pressed a button. The farmer was paid the second his data was used." Point at the final summary and the compliance report path.
   **Fallback** if the API is slow or fails: `NETWORK=hsk-testnet pnpm buyer -- <proofUrl>` (deterministic, 5 s, same four steps).
4. **[Explorer]** Show the attest tx and the payment tx on HSK. Done.

Fallback if HSK is down: run everything with `NETWORK=anvil` (identical, no explorer). Have the backup video ready.

## Q&A — answers in English

- **"Why blockchain? This works with a database and a bank transfer."** Two reasons. First, the buyer is a program. It has no bank account and cannot make a transfer. A stablecoin is the only way one machine pays another. Second, the public registry lets any buyer, bank or auditor verify the proof without trusting me or a certifier.
- **"PRODES is public. Why doesn't the trader just check it themselves?"** They don't have the farm polygon. What they are buying is the farmer's permission plus his signature saying "this is my area, verified on this date." The farmer stays the owner of the data and decides who gets access.
- **"Can't the farmer just draw the polygon around the deforested corner?"** Not for compliance. Compliance is judged on the **registered property** (CAR, Brazil's public rural registry), and the attestation of a registered property carries the CAR number and the hash of the *official* polygon. Any buyer can download the public CAR polygon, hash it, and see it matches `fieldId`: nothing was cut out. Hand-drawn fields are marked `registered: false`; the buyer agent skips them for compliance by default and only uses them for sub-field traceability. It did that on its own this morning: it flagged a drawn field as "no CAR reference".
- **"What if the farmer lies in other ways?"** He can't change the INPE data, and he can't change the polygon without changing the hash. What he could do is sign with a key that isn't the property owner's. Binding the farmer key to the CAR owner (a KYC'd attestation from the registry or a bank) is the natural next step.
- **"Is 5 USDT a real price?"** Illustrative. The mechanism is what we are showing. Today the trader pays, because the legal obligation is on the importer, per query. It could be the bank, or a subscription.
- **"Why HSK Chain?"** EVM, cheap, a sponsor, and the target buyer side is in Asia. The contracts are chain-agnostic.
- **"Is this real x402?"** The 402 body and `accepts[]` follow x402 v1. Settlement today is an on-chain transfer referenced by tx hash. EIP-3009 gasless settlement is the next step.
- **"Is PRODES enough? What about a farm outside your data?"** PRODES is INPE's official annual mapping, the same first-pass source commercial due-diligence providers use. Limits: minimum mapping unit 6.25 ha, annual cadence, Amazon biome only. We load Rondônia, Mato Grosso and Goiás across the Amazon and Cerrado biomes, about 103,000 polygons since 2021, indexed in memory on the farmer's machine. If a field is not fully inside a covered state and biome the agent refuses to attest: absence of data is not absence of deforestation. Adding a state is one download. Next: DETER alerts and IBAMA embargoes.
- **"Real privacy would be ZK."** Agreed. Today: commitment plus aggregates. A ZK proof of "empty intersection" is on the roadmap, and it is feasible because the geometry is simple.

## Timing warning

The LLM run takes ~70 s. Start it right after signing (step 2) and narrate over it. Total demo still fits in ~2:30 if you don't wait in silence.

## Opening line (memorize)

"Every shipment of soy or beef that leaves Brazil carries a piece of paper that took weeks and a stranger holding the farmer's map. Proof of Field makes that paper a five-dollar API call: the farm proves it, keeps the map, and gets paid, and the trader's AI agent buys it across a whole lot."
