import { hashTypedData, keccak256, toHex, stringToHex, type Address, type Hex, verifyTypedData } from 'viem';

/** EIP-712 schema for a Proof of Field attestation. */
export const ATTESTATION_TYPES = {
  FieldAttestation: [
    { name: 'fieldId', type: 'bytes32' },
    { name: 'farmer', type: 'address' },
    { name: 'areaHa100', type: 'uint256' },
    { name: 'deforestedHa100', type: 'uint256' },
    { name: 'baselineYear', type: 'uint256' },
    { name: 'dataYear', type: 'uint256' },
    { name: 'source', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'compliant', type: 'bool' },
  ],
} as const;

export const SCHEMA_STRING =
  'FieldAttestation(bytes32 fieldId,address farmer,uint256 areaHa100,uint256 deforestedHa100,uint256 baselineYear,uint256 dataYear,string source,uint256 issuedAt,bool compliant)';
export const SCHEMA_ID: Hex = keccak256(stringToHex(SCHEMA_STRING));

export interface FieldAttestation {
  fieldId: Hex;
  farmer: Address;
  areaHa100: bigint;
  deforestedHa100: bigint;
  baselineYear: bigint;
  dataYear: bigint;
  source: string;
  issuedAt: bigint;
  compliant: boolean;
}

export function domain(chainId: number, registry: Address) {
  return { name: 'ProofOfField', version: '1', chainId, verifyingContract: registry } as const;
}

export function attestationHash(att: FieldAttestation, chainId: number, registry: Address): Hex {
  return hashTypedData({ domain: domain(chainId, registry), types: ATTESTATION_TYPES, primaryType: 'FieldAttestation', message: att });
}

export async function verifyAttestationSignature(
  att: FieldAttestation, signature: Hex, chainId: number, registry: Address,
): Promise<boolean> {
  return verifyTypedData({
    address: att.farmer, domain: domain(chainId, registry), types: ATTESTATION_TYPES,
    primaryType: 'FieldAttestation', message: att, signature,
  });
}

/** Canonical commitment to a polygon: keccak of rounded coordinates (6 decimals ≈ 10 cm). */
export function fieldIdFromPolygon(geometry: any): Hex {
  const canon = JSON.stringify(roundCoords(geometry.coordinates));
  return keccak256(toHex(`${geometry.type}:${canon}`));
}
function roundCoords(c: any): any {
  if (typeof c === 'number') return Math.round(c * 1e6) / 1e6;
  return c.map(roundCoords);
}

/** JSON-safe form (bigint → string) for transport. */
export function serializeAttestation(a: FieldAttestation) {
  return { ...a, areaHa100: a.areaHa100.toString(), deforestedHa100: a.deforestedHa100.toString(), baselineYear: a.baselineYear.toString(), dataYear: a.dataYear.toString(), issuedAt: a.issuedAt.toString() };
}
export function deserializeAttestation(j: any): FieldAttestation {
  return { ...j, areaHa100: BigInt(j.areaHa100), deforestedHa100: BigInt(j.deforestedHa100), baselineYear: BigInt(j.baselineYear), dataYear: BigInt(j.dataYear), issuedAt: BigInt(j.issuedAt) };
}
