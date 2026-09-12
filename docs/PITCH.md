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

## Demo script (90 s, ensaiar 3x)

Terminais abertos ANTES: (A) console do produtor no browser, (B) terminal do buyer com o comando pronto, (C) explorer HSK numa aba.

1. **[Console]** "Este é o agente do produtor. Roda na máquina dele. Estes vermelhos são o PRODES, o mapa oficial de desmatamento do INPE." Clica no imóvel …4C8E. → 26 ha em 2022. "Esse aqui não passa. O sistema diz exatamente onde e quando." Aponta o polígono vermelho no mapa.
2. Clica no …9C62. → Deforestation-free. "Esse passa." Clica **Sign attestation & anchor on-chain**. → hash + tx. "Só o hash foi pra chain. O desenho da fazenda continua aqui." Copy proof URL.
3. **[Terminal B]** Cola o URL no buyer agent. Narra as 4 linhas: 402 → pagou 5 USDT pela carteira com política → recebeu → verificou assinatura e registro. "Nenhum humano apertou botão. O produtor foi pago no segundo em que o dado foi usado."
4. **[Explorer]** Mostra a tx do attest e a do pagamento na HSK. Fim.

Fallback se a rede HSK cair: rodar tudo em `NETWORK=anvil` (idêntico, só sem explorer). Ter o vídeo gravado de manhã.

## Q&A — respostas prontas

- **"Por que blockchain? Isso funciona com banco de dados e Pix."** Duas razões. (1) O comprador é um programa: não abre conta em banco, não faz Pix. Stablecoin é a única forma de máquina pagar máquina. (2) O registro público deixa qualquer comprador, banco ou auditor verificar a prova sem confiar em mim nem numa certificadora.
- **"O PRODES é público, por que a trading não checa sozinha?"** Ela não tem o polígono da fazenda. O que ela compra é a permissão do produtor + a assinatura dele dizendo "essa é minha área, verificada nesta data". O produtor fica dono do dado e decide quem acessa.
- **"E se o produtor mentir sobre o polígono?"** O fieldId é o hash do polígono: se ele desenhar uma área diferente da que vende, o comprador pode exigir revelação seletiva (roadmap) ou cruzar com o CAR. Hoje a prova é "o produtor assinou que esta área X tem Y ha desmatados segundo o INPE". Igual a uma declaração assinada, só que verificável e barata.
- **"Preço de 5 USDT é real?"** Ilustrativo. O mecanismo é o que estamos mostrando. Quem paga hoje é a trading (obrigação legal é do importador), por consulta. Pode ser banco, pode ser assinatura.
- **"Por que HSK Chain?"** EVM, barata, patrocinadora, e o comprador-alvo é asiático. Os contratos são chain-agnostic.
- **"Isso é x402 de verdade?"** Formato de 402 e `accepts[]` seguem a v1 do x402. Settlement hoje é transfer on-chain referenciado por tx hash; EIP-3009 gasless é o próximo passo.
- **"Privacidade de verdade seria ZK."** Concordo. Hoje: commitment + agregado. ZK de "interseção vazia" é o roadmap e é factível porque a geometria é simples.
- **"Quem é o time / vocês vão continuar?"** Eu tenho fazenda em Abunã e já construo plataforma de talhões pra ela. Isso vira feature da plataforma. Pilotar com vizinhos este ano.
