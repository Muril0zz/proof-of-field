import fs from 'fs';
for (const n of ['FieldAttestationRegistry', 'MockUSDT', 'AgentWallet']) {
  const j = JSON.parse(fs.readFileSync(`contracts/out/${n}.sol/${n}.json`, 'utf8'));
  fs.writeFileSync(`packages/core/abis/${n}.json`, JSON.stringify(j.abi, null, 1));
  console.log('abi', n, j.abi.length, 'entries');
}
