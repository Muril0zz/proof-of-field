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
  (cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -q > /dev/null)
  node scripts/write-deployment.mjs anvil > /dev/null
  echo "✔ anvil up, contracts deployed → deployments/anvil.json"
else
  [ -f "deployments/$NETWORK.json" ] || { echo "missing deployments/$NETWORK.json — run: pnpm deploy:hsk"; exit 1; }
fi

kill_port 4020; kill_port 5173
(cd apps/farmer-agent && nohup npx tsx src/index.ts > ../../.logs/farmer.log 2>&1 < /dev/null &)
(cd apps/web && nohup npx vite --port 5173 > ../../.logs/web.log 2>&1 < /dev/null &)
sleep 4
echo "✔ farmer agent  http://localhost:4020   (log: .logs/farmer.log)"
echo "✔ farmer console http://localhost:5173   (log: .logs/web.log)"
echo
echo "buyer:  NETWORK=$NETWORK pnpm buyer -- --list http://localhost:4020"
echo "        NETWORK=$NETWORK pnpm buyer -- <proofUrl>"
disown -a 2>/dev/null || true
exit 0
