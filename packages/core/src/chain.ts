import { defineChain } from 'viem';
import { anvil } from 'viem/chains';

export const hskTestnet = defineChain({
  id: 133,
  name: 'HashKey Chain Testnet',
  nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hsk.xyz'] } },
  blockExplorers: { default: { name: 'HSK Explorer', url: 'https://testnet-explorer.hsk.xyz' } },
  testnet: true,
});

export const hskMainnet = defineChain({
  id: 177,
  name: 'HashKey Chain',
  nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.hsk.xyz'] } },
  blockExplorers: { default: { name: 'HSK Blockscout', url: 'https://hsk.blockscout.com' } },
});

export type NetworkName = 'anvil' | 'hsk-testnet' | 'hsk-mainnet';

export const chains = {
  anvil: { ...anvil, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } },
  'hsk-testnet': hskTestnet,
  'hsk-mainnet': hskMainnet,
} as const;

export function explorerTx(network: NetworkName, hash: string) {
  const c = chains[network];
  const base = (c as any).blockExplorers?.default?.url;
  return base ? `${base}/tx/${hash}` : hash;
}
export function explorerAddress(network: NetworkName, addr: string) {
  const c = chains[network];
  const base = (c as any).blockExplorers?.default?.url;
  return base ? `${base}/address/${addr}` : addr;
}

export interface Deployment {
  network: NetworkName;
  chainId: number;
  registry: `0x${string}`;
  usdt: `0x${string}`;
  agentWallet: `0x${string}`;
  deployedAt: string;
  deployBlock?: number;
}
