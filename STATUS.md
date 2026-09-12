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
6. **Slides**: montar a partir de `docs/PITCH.md` (8 slides). Usar os screenshots de `docs/shots/`.
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
