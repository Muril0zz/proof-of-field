# Proof of Field — 3-minute presentation (1 min pitch · 2 min demo) + 2 min Q&A

## Before walking up (checklist)
- Console open at http://localhost:5173, PRODES layer OFF, no field selected. Two proofs already listed: …9C62 (clean) and …4C8E (26 ha). Sales section empty (delete `data/farmer-payments.hsk-testnet.*.json` and restart the farmer agent if not).
- Terminal with this typed, NOT executed: `cd ~/Documents/Projetos_Codigo/eag-buildathon && NETWORK=hsk-testnet pnpm buyer:ai "Buy the proofs for every farm in this lot. Budget 30 USDT. Reject any farm with deforestation after 2020."`
- Explorer tab: https://testnet-explorer.hsk.xyz/address/0xe0e5e881542266aac1b3457fdd33147c761b46dd
- Slides open on slide 1, fullscreen.

## 1 minute pitch (slides 1 → 5, ~12 s each)

**Slide 1 (0:00).** "Hi, I'm Murilo. I have a farm in the Amazon. This is Proof of Field."

**Slide 2 (0:10).** "Every bag of soy or beef that leaves Brazil needs one piece of paper: proof the farm didn't deforest after 2020. Europe demands it by law, banks demand it for credit, China, our biggest buyer, is starting to demand it too."

**Slide 3 (0:22).** "Today that paper takes three weeks. The farmer e-mails his entire farm map to a stranger, the trader pays a vendor per farm, and the result is a PDF nobody can verify. Then the next buyer asks again."

**Slide 4 (0:37).** "We turned it into a five-dollar API call. The farmer's computer runs the official check, signs it, and puts it up for sale. The trader's AI agent buys it, pays the farmer in stablecoin, and verifies it on-chain. Two minutes, no humans, and the farm map never leaves the farm."

**Slide 5 (0:50).** "The check is SQL, we run it locally. What isn't SQL is the trade: two companies that don't trust each other, two programs paying each other, and an AI holding money it cannot misuse. Let me show you."

## 2 minute demo (happy path only)

**0:00 [Console]** Click **…9C62**. Green verdict appears. → "This is a real 5,500-hectare property from Brazil's rural registry, checked against INPE's official deforestation map. Clean."

**0:10 [Console]** Click **Sign attestation & anchor on-chain**. Wait for the hash and tx (~5 s). → "Signed by the farmer's key. Only the hash goes to HashKey Chain. The proof is now for sale."

**0:20 [Terminal]** Press **Enter**. → "This is the trading company's agent. It got one sentence from the operator: buy this lot, budget 30, reject deforestation." *(It runs ~70 s. Talk over it, don't wait in silence.)*

**0:30** as `list_proofs` / `policy_status` print → "It lists what the farmer sells and reads its own on-chain spending policy."

**0:45** as the first `buy_proof` prints → "HTTP 402, payment required. It pays five USDT through a wallet with hard limits. Gets the proof. Verifies the signature and the registry itself, without trusting the farmer or us."

**1:15** as `skip_proof` prints → "And this one it refuses: 26 hectares cleared in 2022. It says why."

**1:35 [Console]** Point at **Sales**: +5.00 USDT appeared by itself. → "The farmer was paid the second his data was used."

**1:45 [Explorer]** Click the payment tx. → "Every step is a public transaction on HashKey Chain."

**1:55** "Farmer paid. Trader cleared. Nobody e-mailed anyone. That's Proof of Field."

**Fallback** if the API stalls (>90 s): Ctrl-C, run `NETWORK=hsk-testnet pnpm buyer -- <proof URL from console>` (5 s, same four steps, no LLM). Say: "same flow, without the model deciding."

## Slides 6–8 are for Q&A only
Jump to 7 for "how does it work", 8 for "what's next / who are you".

## Slides (8)

1. **Title.** Proof of Field. "Farmer-owned deforestation proofs, sold agent-to-agent." Murilo Leite · Abunã, Rondônia. Foto real da fazenda se tiver.
2. **The problem, in one farmer.** Zé, 5.500 ha de soja em Rondônia. Pra vender pra uma trading, precisa provar área livre de desmatamento desde 2020 (EUDR / bancos / compradores chineses). Hoje: certificadora, entrega o mapa inteiro, semanas, pago por comprador, perde o dado.
3. **Who asks.** A trading sells to the world and every main market asks the same thing: EU by law (EUDR, importer liable), banks for credit, China (largest buyer) now moving to the same 2020 baseline. Trader answers per farm, per market, by hand.
4. **Demo.** (sai do slide, vai pro app — 90 segundos)
5. **How it works.** Diagrama do README: farmer agent (privado) ∩ PRODES → EIP-712 → hash on HSK Chain → buyer agent → 402 → AgentWallet pay → proof → verify. Destaque: *o polígono nunca sai da máquina do produtor.*
6. **Why Ethereum / HSK.** Robô não tem conta em banco: stablecoin é a única forma de programa pagar programa. Registry público = qualquer comprador verifica sem confiar em ninguém. AgentWallet com política = empresa dá dinheiro pro agente sem dar a chave.
7. **Open source & beyond.** Registry + AgentWallet + x402 farmer server são reutilizáveis pra qualquer "dado privado vendido como prova" (gado, água, carbono). Roadmap: EIP-3009 gasless, ZK (prova que ∩ = ∅ sem revelar hectares), Sentinel-2 entre releases do PRODES, passaporte bovino.
8. **Ask.** "Queremos rodar isso nas fazendas de Abunã este ano. Compradores e bancos que queiram pilotar, falem comigo." Contato.

## Demo script (90 s, in English — rehearse 3×)

Open BEFORE walking up: (A) farmer console in the browser, (B) terminal with the buyer command ready, (C) HSK explorer tab.

1. **[Console]** "This is the farmer's agent. It runs on his machine. These red areas are PRODES, the official deforestation map from Brazil's space agency, INPE." Click property …4C8E → 26 ha in 2022. "This one does not pass. The system says exactly where and when." Point at the red overlap on the map.
2. Click …9C62 → Deforestation-free. "This one passes." Click **Sign attestation & anchor on-chain** → hash + tx. "Only the hash went on-chain. The farm's map is still here, on his machine." Copy the proof URL.
3. **[Terminal B]** Run the LLM buyer agent (command pre-typed, just press Enter):
   `NETWORK=hsk-testnet pnpm buyer:ai "Buy the proofs for every farm in this lot. Budget 30 USDT. Reject any farm with deforestation after 2020."`
   Narrate while it runs (~70 s, so start it EARLY, right after step 2, and talk over it): "This is the trading company's agent. It got one sentence from the operator. It lists what the farmer sells, checks its own on-chain spending policy, and decides. Watch: it buys the two clean farms over HTTP 402, five USDT each, verifies signature and registry on its own, and refuses the one with 26 hectares. Nobody pressed a button. The farmer was paid the second his data was used." Point at the final summary and the compliance report path.
   **Fallback** if the API is slow or fails: `NETWORK=hsk-testnet pnpm buyer -- <proofUrl>` (deterministic, 5 s, same four steps).
4. **[Explorer]** Show the attest tx and the payment tx on HSK. Done.

Fallback if HSK is down: run everything with `NETWORK=anvil` (identical, no explorer). Have the backup video ready.

## Q&A — answers in English

- **"Why blockchain? This works with a database and a bank transfer."** Two reasons. First, the buyer is a program. It has no bank account and cannot make a transfer. A stablecoin is the only way one machine pays another. Second, the public registry lets any buyer, bank or auditor verify the proof without trusting me or a certifier.
- **"PRODES is public. Why doesn't the trader just check it themselves?"** They don't have the farm polygon. What they are buying is the farmer's permission plus his signature saying "this is my area, verified on this date." The farmer stays the owner of the data and decides who gets access.
- **"What if the farmer lies about the polygon?"** The fieldId is the hash of the polygon. If he draws a different area than the one he sells, the buyer can require selective disclosure (on the roadmap) or cross-check against the CAR registry. Today the proof is "the farmer signed that this area X has Y hectares deforested according to INPE." Like a signed declaration, but verifiable and cheap.
- **"Is 5 USDT a real price?"** Illustrative. The mechanism is what we are showing. Today the trader pays, because the legal obligation is on the importer, per query. It could be the bank, or a subscription.
- **"Why HSK Chain?"** EVM, cheap, a sponsor, and the target buyer side is in Asia. The contracts are chain-agnostic.
- **"Is this real x402?"** The 402 body and `accepts[]` follow x402 v1. Settlement today is an on-chain transfer referenced by tx hash. EIP-3009 gasless settlement is the next step.
- **"Is PRODES enough? What about a farm outside your data?"** PRODES is INPE's official annual mapping, the same first-pass source commercial due-diligence providers use. Limits: minimum mapping unit 6.25 ha, annual cadence, Amazon biome only. For the demo we loaded the Abunã region (3,445 polygons, 2020–2025, Rondônia plus the Amazonas border). If a field falls outside the loaded extent the agent refuses to attest: absence of data is not absence of deforestation. Production loads the full biome and adds DETER alerts and IBAMA embargoes.
- **"Real privacy would be ZK."** Agreed. Today: commitment plus aggregates. A ZK proof of "empty intersection" is on the roadmap, and it is feasible because the geometry is simple.
- **"Who is the team? Will you continue?"** I have a farm in Abunã and I already build a field-mapping platform for it. This becomes a feature of that platform. Pilot with neighbors this year.

## Timing warning

The LLM run takes ~70 s. Start it right after signing (step 2) and narrate over it. Total demo still fits in ~2:30 if you don't wait in silence.

## Opening line (memorize)

"Hi, I'm Murilo. I have a farm in the Amazon. To sell my soy to Europe, to a bank, or increasingly to China, I have to hand my entire farm map to a stranger and wait three weeks. So I built the version where my computer proves it, keeps the map, and gets paid."
