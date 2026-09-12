# Proof of Field

**Farmer-owned deforestation-free attestations, sold agent-to-agent for stablecoins.**
Built at the EAG Global Buildathon · Floripa, 12 Sep 2026 · Tracks: AI × Ethereum & Agent Economy · Local AI, Private AI & User-Owned Data · Real-World Ethereum Applications · HSK Chain (AI Agents / RWA / Payments)

## The problem

A soy or cattle buyer (trader, bank, importer) must prove the farm it buys from has not deforested since 2020. EUDR puts that burden on the importer; Brazilian banks and Chinese buyers are following. Today the farmer hands the full farm map and documents to a certifier, waits weeks, pays per buyer, and loses control of the most sensitive data they own.

## What this does

```
 FARMER'S MACHINE (private)                              BUYER (trading company / bank)
 ┌──────────────────────────────┐                        ┌──────────────────────────────┐
 │ Farmer console (web, map)    │                        │ Buyer agent (CLI)            │
 │  draws / loads field polygon │                        │  GET /proof/:hash            │
 │            │                 │                        │   ← 402 Payment Required     │
 │ Farmer agent                 │                        │  pays via AgentWallet        │
 │  ∩ INPE/PRODES polygons      │   x402 over HTTP       │   (policy-enforced)          │
 │  EIP-712 sign attestation ───┼───────────────────────▶│  GET again + X-PAYMENT       │
 │  anchor hash on-chain        │   USDT on HSK Chain    │   ← signed proof             │
 └──────────────┬───────────────┘                        │  verify sig + registry       │
                │ attest(hash, fieldId, …)                └──────────────┬───────────────┘
                ▼                                                        ▼
        ┌───────────────────────────  HSK Chain  ─────────────────────────────┐
        │ FieldAttestationRegistry · MockUSDT · AgentWallet (spending policy) │
        └─────────────────────────────────────────────────────────────────────┘
```

1. **Farmer selects a registered property** (CAR, the public rural registry; official polygon) in the console. Each farmer runs their own agent with their own key; a lot spans many farmers.
2. **The farmer agent** intersects it with INPE/PRODES yearly deforestation polygons (public, official, pure geometry, under a second across ~103k polygons) and signs an **EIP-712 attestation**: area, hectares deforested after the 2020 baseline, verdict, data source, timestamp.
3. Only `keccak(polygon)` and the attestation hash are **anchored on-chain**. The geometry never leaves the farmer's machine.
4. **The buyer agent** requests the proof, gets **HTTP 402** with x402 payment requirements, pays USDT through the company's **AgentWallet** (daily / per-payment limits, allow-listed payees), retries with `X-PAYMENT`, receives the proof, and **verifies it independently**: signature → signer == on-chain anchoring farmer → not revoked.

No human in the loop. The farmer is paid at the moment their data is used, and decides who gets it.

## Repo

```
contracts/            Foundry · FieldAttestationRegistry, MockUSDT, AgentWallet · 7 tests
packages/core/        PRODES intersection (turf), EIP-712 schema, x402 types, HSK chain config, ABIs
apps/farmer-agent/    Hono API · /check /attest /proof/:hash (x402) /attestations
apps/buyer-agent/     CLI · 402 → pay → verify
apps/web/             Farmer console · Vite + React + MapLibre + terra-draw · satellite + PRODES overlay
data/                 PRODES (bbox Abunã/RO, 2020+), 3 real CAR properties from Porto Velho/RO
deployments/          contract addresses per network
```

## Run it

Prereqs: Node 20+, pnpm, Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

```bash
pnpm install
./scripts/fetch-prodes.sh          # PRODES for RO, MT, GO (~150 MB); optional, falls back to a small RO extract
cp .env.example .env            # fill FARMER_PRIVATE_KEY / BUYER_PRIVATE_KEY (dev keys only)

# 1. local chain
pnpm anvil                                            # terminal A
cast send --rpc-url http://127.0.0.1:8545 --unlocked --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 $FARMER_ADDRESS --value 10ether
cast send --rpc-url http://127.0.0.1:8545 --unlocked --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 $BUYER_ADDRESS  --value 10ether
pnpm deploy:anvil                                     # writes deployments/anvil.json

# 2. farmer side
NETWORK=anvil pnpm farmer                             # terminal B · http://localhost:4020
pnpm web                                              # terminal C · http://localhost:5173

# 3. buyer side
NETWORK=anvil pnpm buyer -- --list http://localhost:4020
NETWORK=anvil pnpm buyer -- http://localhost:4020/proof/<attestationHash>

# optional: LLM-driven buyer (needs ANTHROPIC_API_KEY in .env)
NETWORK=anvil pnpm buyer:ai "Buy proofs for every farm in this lot, budget 30 USDT, reject any farm with deforestation." http://localhost:4020 http://localhost:4021   # a lot = many farmer agents
```

### HSK Chain testnet (chainId 133)

```bash
# fund FARMER_ADDRESS and BUYER_ADDRESS with test HSK: https://hskchain.net/faucet
set -a; source .env; set +a
pnpm deploy:hsk                                       # writes deployments/hsk-testnet.json
NETWORK=hsk-testnet pnpm farmer
NETWORK=hsk-testnet pnpm buyer -- <proofUrl>
```

Explorer: https://testnet-explorer.hsk.xyz · Set `HSK_TESTNET_RPC` to a dedicated node (e.g. Chainstack) for the demo; the public RPC is load-balanced and can lag on fresh receipts (handled with retries).

Live deployment (chainId 133):

| Contract | Address |
|---|---|
| FieldAttestationRegistry | [`0xe0e5e881542266aac1b3457fdd33147c761b46dd`](https://testnet-explorer.hsk.xyz/address/0xe0e5e881542266aac1b3457fdd33147c761b46dd) |
| MockUSDT | `0xc128d4550e859b75d2e84c736757cc39853bc7d7` |
| AgentWallet | `0xdba07b2211e4bdc07a228da01a647a4a4c6b82b3` |

Example: [attestation anchored](https://testnet-explorer.hsk.xyz/tx/0xd1a37a26ce852d537a1e83f62e1de51b85042373e0dcf66030a02893180c6705) · [agent-to-agent payment](https://testnet-explorer.hsk.xyz/tx/0x34d53225f578d91b5a15492ab3e26ee9f2a31b6358a287147bf934c363d89c03)

## Design notes

- **x402**: the farmer agent answers `402` with a v1-shaped `accepts[]` (scheme `exact`, network, `payTo`, `asset`, `maxAmountRequired`). Settlement here is an on-chain ERC-20 transfer referenced by tx hash in `X-PAYMENT`; the server verifies the `Transfer` log to its own address and rejects replays. Roadmap: EIP-3009 `transferWithAuthorization` so the buyer never needs gas.
- **AgentWallet** is the piece that makes autonomous buying safe: a company funds it once, sets a policy, and gives an agent a key that can *only* pay allow-listed sellers within limits.
- **Who gets paid**: the CAR registry is public, so anyone could compute a true-looking proof for someone else's farm. The buyer only pays suppliers it onboarded: the company allow-lists a supplier's address in its `AgentWallet` (`setPayee`) after contract/KYC, the buyer agent marks other sellers `knownSupplier: false` and flags the same CAR offered by two keys (`carConflict`). The demo includes an impostor farmer agent for exactly this. Next: a gov.br-signed wallet↔CAR-holder binding anchored on-chain, or a zkTLS proof of the SICAR login.
- **Privacy**: the attestation commits to the polygon (`fieldId = keccak(canonical GeoJSON)`) but reveals only aggregates. A buyer can verify the farmer's claim without ever learning where the field is. Selective disclosure of the geometry (to an auditor, under a separate paid resource) is a natural extension.
- **Data**: PRODES is INPE's official yearly deforestation mapping (Landsat/Sentinel, published as polygons; minimum mapping unit 6.25 ha, annual). `./scripts/fetch-prodes.sh` downloads 2021+ polygons for **Rondônia, Mato Grosso and Goiás across the Amazon and Cerrado biomes** (~103k polygons, ~150 MB, not in git) plus the state×biome polygons used for coverage. The farmer agent indexes them in memory (3 s startup, ~540 MB) and intersects with turf in 0.4–1.8 s. **Fields not fully inside a covered state×biome are refused** (`422 no_coverage`) rather than reported as clean. Without the download it falls back to the bundled Abunã/RO extract.

## Roadmap

- EIP-3009 gasless settlement + x402 facilitator
- ZK proof of "polygon ∩ PRODES = ∅" so even the aggregate hectares stay private
- Sentinel-2 change detection between PRODES releases (farmer-side model)
- IBAMA embargo list, CAR ownership cross-check
- Second asset class: cattle passports (animal identity + handling records) for beef traceability

## Team

Murilo Leite · built at the EAG Global Buildathon Floripa, 12 Sep 2026
