#!/usr/bin/env bash
# One-shot local demo stack: anvil → fund wallets → deploy → farmer agent → web.
# Usage: ./scripts/dev-up.sh            (local anvil)
#        NETWORK=hsk-testnet ./scripts/dev-up.sh   (assumes deployments/hsk-testnet.json exists and wallets are funded)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source .env; set +a
export NETWORK="${NETWORK:-anvil}"
mkdir -p .logs
kill_port() { lsof -ti :"$1" | xargs kill -9 2>/dev/null || true; }

if [ "$NETWORK" = "anvil" ]; then
  kill_port 8545
  nohup anvil --chain-id 31337 --block-time 1 --silent > .logs/anvil.log 2>&1 < /dev/null &
  sleep 2
  DEV0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  cast send --rpc-url http://127.0.0.1:8545 --unlocked --from $DEV0 "$FARMER_ADDRESS" --value 10ether > /dev/null
  cast send --rpc-url http://127.0.0.1:8545 --unlocked --from $DEV0 "$BUYER_ADDRESS"  --value 10ether > /dev/null
  [ -n "${FARMER2_ADDRESS:-}" ] && cast send --rpc-url http://127.0.0.1:8545 --unlocked --from $DEV0 "$FARMER2_ADDRESS" --value 10ether > /dev/null
  (cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -q > /dev/null)
  node scripts/write-deployment.mjs anvil > /dev/null
  echo "✔ anvil up, contracts deployed → deployments/anvil.json"
else
  [ -f "deployments/$NETWORK.json" ] || { echo "missing deployments/$NETWORK.json — run: pnpm deploy:hsk"; exit 1; }
fi

kill_port 4020; kill_port 4021; kill_port 4022; kill_port 4030; kill_port 5173
# João Silva (FARMER_* key) owns two CAR properties; Maria Souza (FARMER2_* key) owns the third.
(cd apps/farmer-agent && FARMER_NAME="João Silva" FARMER_SAMPLES=9C62FD55,4C8EDDBB nohup npx tsx src/index.ts > ../../.logs/farmer.log 2>&1 < /dev/null &)
if [ -n "${FARMER2_PRIVATE_KEY:-}" ]; then
  (cd apps/farmer-agent && FARMER_NAME="Maria Souza" FARMER_PRIVATE_KEY=$FARMER2_PRIVATE_KEY FARMER_PORT=4021 FARMER_PUBLIC_URL=http://localhost:4021 FARMER_SAMPLES=0A28442F nohup npx tsx src/index.ts > ../../.logs/farmer2.log 2>&1 < /dev/null &)
fi
# Pedro Lima (FARMER3_* key): an IMPOSTOR for the demo — offers João's CAR with a key the company never onboarded. Not allow-listed, not funded.
if [ -n "${FARMER3_PRIVATE_KEY:-}" ]; then
  (cd apps/farmer-agent && FARMER_NAME="Pedro Lima" FARMER_PRIVATE_KEY=$FARMER3_PRIVATE_KEY FARMER_PORT=4022 FARMER_PUBLIC_URL=http://localhost:4022 FARMER_SAMPLES=9C62FD55 nohup npx tsx src/index.ts > ../../.logs/farmer3.log 2>&1 < /dev/null &)
fi
(cd apps/web && nohup npx vite --port 5173 > ../../.logs/web.log 2>&1 < /dev/null &)
(cd apps/buyer-agent && nohup npx tsx src/desk.ts > ../../.logs/desk.log 2>&1 < /dev/null &)
sleep 4
echo "✔ farmer agent João Silva  http://localhost:4020   (log: .logs/farmer.log)"
[ -n "${FARMER2_PRIVATE_KEY:-}" ] && echo "✔ farmer agent Maria Souza http://localhost:4021   (log: .logs/farmer2.log)"
[ -n "${FARMER3_PRIVATE_KEY:-}" ] && echo "✔ farmer agent Pedro Lima  http://localhost:4022   (impostor · log: .logs/farmer3.log)"
echo "✔ farmer console http://localhost:5173   (log: .logs/web.log)"
echo "✔ buyer desk     http://localhost:4030   (log: .logs/desk.log)"
echo
echo "buyer:  NETWORK=$NETWORK pnpm buyer -- --list http://localhost:4020 http://localhost:4021 http://localhost:4022"
echo "        NETWORK=$NETWORK pnpm buyer -- <proofUrl>"
echo "LLM:    NETWORK=$NETWORK pnpm buyer:ai \"Buy the proofs for every farm in this lot. Budget 30 USDT. Reject any farm with deforestation after 2020.\" http://localhost:4020 http://localhost:4021 http://localhost:4022"
disown -a 2>/dev/null || true
exit 0
