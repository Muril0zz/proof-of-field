# STATUS — lido ao acordar (sáb 12/09)

## O que está pronto (testado ponta a ponta na chain local)
- **Contratos** (Foundry, 7 testes passando): `FieldAttestationRegistry`, `MockUSDT`, `AgentWallet` (política de gasto do agente comprador).
- **Farmer agent** (`apps/farmer-agent`): interseção PRODES (~100 ms), assinatura EIP-712, âncora on-chain, `/proof/:hash` com fluxo HTTP 402 (x402), verificação de pagamento on-chain, anti-replay.
- **Buyer agent CLI** (`apps/buyer-agent`): 402 → paga pela AgentWallet → recebe prova → verifica assinatura + registro. Output bonito pra demo.
- **Farmer console** (`apps/web`): mapa satélite + PRODES, desenhar talhão, 3 imóveis reais do CAR (Porto Velho/RO), veredito, assinar e ancorar, copiar URL da prova. Testado headless, sem erros, mobile ok.
- **Dados**: PRODES 2020+ recortado em Abunã (3.445 polígonos). Imóvel …9C62 = limpo; …4C8E = 26 ha (2022/23); …0A28 = 18,6 ha.
- **Sales**: seção no console que mostra pagamentos chegando ao vivo (polling 2,5 s) — na demo, rode o buyer e o console acende sozinho.
- Vídeo de backup do console em `docs/video/farmer-console-demo.webm`; output do buyer renderizado em `docs/shots/08-buyer-agent-cli.png`.
- README com arquitetura e comandos. `docs/PITCH.md` com slides, roteiro de demo e Q&A. Screenshots em `docs/shots/`.

## Subir tudo (1 comando)
```bash
cd ~/Documents/Projetos_Codigo/eag-buildathon
./scripts/dev-up.sh            # anvil + deploy + farmer agent + web
# http://localhost:5173  (console)   http://localhost:4020 (agent)
NETWORK=anvil pnpm buyer -- --list http://localhost:4020
NETWORK=anvil pnpm buyer -- <proofUrl copiado do console>
```
Precisa de `~/.foundry/bin` no PATH (o script já adiciona).

## FEITO 12/09 manhã
- Devfolio: rascunho completo (`proof-of-field-a49c`), 3 trilhas, screenshots, repo, links HSK. Falta só PUBLICAR.
- GitHub público: https://github.com/Muril0zz/proof-of-field
- **HSK testnet ao vivo**: registry `0xe0e5…46dd`, attest tx `0xd1a3…6705`, pagamento `0x34d5…9c03`. Rodar: `NETWORK=hsk-testnet ./scripts/dev-up.sh`
- **Buyer com LLM testado na HSK** (`NETWORK=hsk-testnet pnpm buyer:ai "..."`): compra as conformes, recusa a de 26 ha, escreve relatório em docs/reports/. ~70 s por execução. Limite diário da AgentWallet subiu pra 300 MockUSDT (token de teste, sem valor).
- Chave da Anthropic está no .env (fora do git). **Rotacionar depois do evento**, ela passou pelo chat.

## FEITO 12/09 ~11:00
- **Lote com vários produtores**: Fazenda A (porta 4020, imóveis …9C62 e …4C8E) e Fazenda B (porta 4021, chave FARMER2, imóvel …0A28). `./scripts/dev-up.sh` sobe os dois. Buyer LLM recebe a lista de agentes.
- Atestados carregam o **número do CAR** (polígono oficial); comprador pula "unregistered" por padrão. Fora da cobertura PRODES → recusa (422).
- `registry_stats`: lê o registro on-chain (4 atestados, 2 produtores). Corrida de recibo entre RPCs corrigida (retry dos dois lados).
- Deck depersonalizado: sem Nixar/Abunã/nome; slide 2 com as grandes tradings; slide 8 "built to scale".
- Comando da demo: `NETWORK=hsk-testnet pnpm buyer:ai "Buy the proofs for every farm in this lot. Budget 30 USDT. Reject any farm with deforestation after 2020." http://localhost:4020 http://localhost:4021`

- **PRODES ampliado**: RO, MT, GO (Amazônia + Cerrado), 103k polígonos, `./scripts/fetch-prodes.sh` (150 MB, fora do git). Cobertura por estado×bioma; fora → recusa.

- **Impostor na demo**: Fazenda C (porta 4022, chave FARMER3, sem gás, não cadastrada) vende o CAR da Fazenda A. Agente marca UNKNOWN + CAR-CONFLICT e recusa. Comando da demo agora tem 3 URLs.

- **Áreas protegidas**: terras indígenas (FUNAI) e unidades de conservação (ICMBio/MMA) dos dois biomas entram na checagem (1.101 polígonos). TI e proteção integral reprovam; APA só alerta. Atestado ganhou `protectedHa100` (esquema novo; tudo re-atestado na HSK).
- **Pitch**: manchete "portable proof"; slide 8 = caminho de adoção (cooperativas → bancos → tradings).

- **Buyer desk** (interface do comprador): http://localhost:4030, caixa de texto + log ao vivo + relatório. `./scripts/dev-up.sh` sobe junto. Testado ponta a ponta.

- **DEMO = uma tela**: http://localhost:4030/demo (FARM à esquerda, TRADER à direita). Dois cliques. Roteiro no topo do docs/PITCH.md.

## PUBLICADO no Devfolio às 12:20 — continua editável até 15:00
- https://devfolio.co/projects/proof-of-field-a49c · time no Devfolio: você + Afonso Fagundes.
- Slide 4 = "onde vai o trabalho do intermediário" (coletar / checar / confiar / repetir). Slide 5 = "quem fala com quem, não há marketplace".
- Demo: http://localhost:4030/demo (dois cliques). Ledger de vendas zerado.

## VOCÊ precisa fazer (eu não consigo)
1. **Devfolio**: criar conta e aplicar em https://eag-global-buildathon.devfolio.co (5 min). Na submissão marcar **Brazil Hackathon** + trilha EAG + **HSK Chain**.
2. **Telegram** do evento (link no Notion).
3. **Faucet HSK testnet** (tem reCAPTCHA): https://hskchain.net/faucet — colar os DOIS endereços:
   - FARMER `0xFC388ccd41d4Ac65c6f00C599cB4F1294Af69191`
   - BUYER  `0x37376DAbf385c1B36e63E6F69FE8AFcfAf0B2b54`
   (chaves em `.env`, são carteiras descartáveis de testnet). Se o faucet falhar: bridge de Sepolia ETH via docs.hskchain.net.
4. Depois de fundar (dry-run já validado contra a RPC da HSK: deploy custa ~0,007 HSK; peça o máximo que o faucet der, BUYER faz o deploy e FARMER só paga o `attest`), deploy na HSK:
   ```bash
   set -a; source .env; set +a
   pnpm deploy:hsk                       # escreve deployments/hsk-testnet.json
   NETWORK=hsk-testnet ./scripts/dev-up.sh
   NETWORK=hsk-testnet pnpm buyer -- <proofUrl>
   ```
   Explorer: https://testnet-explorer.hsk.xyz
5. **Renomear os imóveis** em `data/samples.json` se algum for a sua fazenda de verdade (hoje estão como "CAR …9C62 · Porto Velho/RO"). Não inventei nomes de propósito.
6. **Slides**: deck HTML pronto em `docs/slides/index.html` (abrir no Chrome, F = fullscreen, ← → navega, P = imprimir PDF). Ajustar slide 8 (link do GitHub) e o que quiser. Roteiro e Q&A em `docs/PITCH.md`.
7. **Gravar vídeo de backup** da demo assim que a HSK estiver funcionando.

## Riscos / fragilidades que sobraram
- Faucet HSK pode estar seco ou lento → demo roda idêntica em `anvil`, só sem explorer. Não deixa isso te travar.
- Tiles de satélite (Esri) dependem de internet do local. Se o WiFi for ruim, o mapa fica cinza mas o fluxo funciona.
- `deployments/anvil.json` muda a cada reinício do anvil? Não: anvil é determinístico, os endereços repetem. O store do produtor fica em `data/farmer-store.<network>.<registry>.json`.
- Settlement x402 é por tx hash (não EIP-3009). Já está na resposta pronta do Q&A.
- Labels dos imóveis do CAR são placeholders (ver item 5).

## Ideias se sobrar tempo no evento (ordem de valor)
1. Endpoint pago separado pra revelar a geometria a um auditor (selective disclosure).
2. Lista de embargos IBAMA como segunda checagem.
