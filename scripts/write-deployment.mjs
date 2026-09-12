// Reads the latest forge broadcast and writes deployments/<network>.json
import fs from 'fs';
const network = process.argv[2];
const chainId = { anvil: 31337, 'hsk-testnet': 133, 'hsk-mainnet': 177 }[network];
const run = JSON.parse(fs.readFileSync(`contracts/broadcast/Deploy.s.sol/${chainId}/run-latest.json`, 'utf8'));
const byName = {};
for (const tx of run.transactions) if (tx.transactionType === 'CREATE') byName[tx.contractName] = tx.contractAddress;
const dep = { network, chainId, registry: byName.FieldAttestationRegistry, usdt: byName.MockUSDT, agentWallet: byName.AgentWallet, deployedAt: new Date().toISOString() };
fs.mkdirSync('deployments', { recursive: true });
fs.writeFileSync(`deployments/${network}.json`, JSON.stringify(dep, null, 2));
console.log(dep);
