# Proof of Field — pitch (3 min) + Q&A prep (2 min)

## Slides (8)

1. **Title.** Proof of Field. "Farmer-owned deforestation proofs, sold agent-to-agent." Murilo Leite · Abunã, Rondônia. Foto real da fazenda se tiver.
2. **The problem, in one farmer.** Zé, 5.500 ha de soja em Rondônia. Pra vender pra uma trading, precisa provar área livre de desmatamento desde 2020 (EUDR / bancos / compradores chineses). Hoje: certificadora, entrega o mapa inteiro, semanas, pago por comprador, perde o dado.
3. **Who pays today.** Tradings e bancos já pagam due-diligence por fazenda (Agrotools, Serasa Agro). Brasil → China: maior fluxo de soja e carne do mundo. Cada lote precisa de prova. *(1 número só, grande.)*
4. **Demo.** (sai do slide, vai pro app — 90 segundos)
5. **How it works.** Diagrama do README: farmer agent (privado) ∩ PRODES → EIP-712 → hash on HSK Chain → buyer agent → 402 → AgentWallet pay → proof → verify. Destaque: *o polígono nunca sai da máquina do produtor.*
6. **Why Ethereum / HSK.** Robô não tem conta em banco: stablecoin é a única forma de programa pagar programa. Registry público = qualquer comprador verifica sem confiar em ninguém. AgentWallet com política = empresa dá dinheiro pro agente sem dar a chave.
7. **Open source & beyond.** Registry + AgentWallet + x402 farmer server são reutilizáveis pra qualquer "dado privado vendido como prova" (gado, água, carbono). Roadmap: EIP-3009 gasless, ZK (prova que ∩ = ∅ sem revelar hectares), Sentinel-2 entre releases do PRODES, passaporte bovino.
8. **Ask.** "Queremos rodar isso nas fazendas de Abunã este ano. Compradores e bancos que queiram pilotar, falem comigo." Contato.

## Demo script (90 s, in English — rehearse 3×)

Open BEFORE walking up: (A) farmer console in the browser, (B) terminal with the buyer command ready, (C) HSK explorer tab.

1. **[Console]** "This is the farmer's agent. It runs on his machine. These red areas are PRODES, the official deforestation map from Brazil's space agency, INPE." Click property …4C8E → 26 ha in 2022. "This one does not pass. The system says exactly where and when." Point at the red overlap on the map.
2. Click …9C62 → Deforestation-free. "This one passes." Click **Sign attestation & anchor on-chain** → hash + tx. "Only the hash went on-chain. The farm's map is still here, on his machine." Copy the proof URL.
3. **[Terminal B]** Paste the URL into the buyer agent. Narrate the four steps as they print: "402, payment required. It pays five USDT through a wallet with a spending policy. It gets the proof. It verifies the signature and the registry on its own. Nobody pressed a button. The farmer was paid the second his data was used."
4. **[Explorer]** Show the attest tx and the payment tx on HSK. Done.

Fallback if HSK is down: run everything with `NETWORK=anvil` (identical, no explorer). Have the backup video ready.

## Q&A — answers in English

- **"Why blockchain? This works with a database and a bank transfer."** Two reasons. First, the buyer is a program. It has no bank account and cannot make a transfer. A stablecoin is the only way one machine pays another. Second, the public registry lets any buyer, bank or auditor verify the proof without trusting me or a certifier.
- **"PRODES is public. Why doesn't the trader just check it themselves?"** They don't have the farm polygon. What they are buying is the farmer's permission plus his signature saying "this is my area, verified on this date." The farmer stays the owner of the data and decides who gets access.
- **"What if the farmer lies about the polygon?"** The fieldId is the hash of the polygon. If he draws a different area than the one he sells, the buyer can require selective disclosure (on the roadmap) or cross-check against the CAR registry. Today the proof is "the farmer signed that this area X has Y hectares deforested according to INPE." Like a signed declaration, but verifiable and cheap.
- **"Is 5 USDT a real price?"** Illustrative. The mechanism is what we are showing. Today the trader pays, because the legal obligation is on the importer, per query. It could be the bank, or a subscription.
- **"Why HSK Chain?"** EVM, cheap, a sponsor, and the target buyer side is in Asia. The contracts are chain-agnostic.
- **"Is this real x402?"** The 402 body and `accepts[]` follow x402 v1. Settlement today is an on-chain transfer referenced by tx hash. EIP-3009 gasless settlement is the next step.
- **"Real privacy would be ZK."** Agreed. Today: commitment plus aggregates. A ZK proof of "empty intersection" is on the roadmap, and it is feasible because the geometry is simple.
- **"Who is the team? Will you continue?"** I have a farm in Abunã and I already build a field-mapping platform for it. This becomes a feature of that platform. Pilot with neighbors this year.

## Opening line (memorize)

"Hi, I'm Murilo. I have a farm in the Amazon, and last month I learned that to sell my soy I have to hand my entire farm map to a stranger and wait three weeks. So I built the version where my computer proves it, keeps the map, and gets paid."
