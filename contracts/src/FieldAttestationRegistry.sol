// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FieldAttestationRegistry
/// @notice Anchors farmer-signed "Proof of Field" attestations on-chain.
///         The raw field polygon never leaves the farmer's machine: only a
///         commitment (fieldId) and the hash of the EIP-712 attestation are stored.
///         Anyone can verify an off-chain attestation by checking that its hash
///         is registered here and that the registered farmer matches the EIP-712 signer.
contract FieldAttestationRegistry {
    struct Record {
        address farmer;     // who anchored (must equal EIP-712 signer)
        bytes32 fieldId;    // keccak256 of canonical polygon GeoJSON (private commitment)
        bytes32 schemaId;   // keccak256 of the attestation schema string
        uint64 issuedAt;    // farmer-declared issue time
        uint64 anchoredAt;  // block timestamp
        bool compliant;     // deforestation-free since baseline
        bool revoked;
    }

    mapping(bytes32 => Record) private _records;      // attestationHash => Record
    mapping(bytes32 => bytes32[]) private _byField;   // fieldId => attestation hashes
    uint256 public totalAttestations;

    event Attested(
        bytes32 indexed attestationHash,
        bytes32 indexed fieldId,
        address indexed farmer,
        bytes32 schemaId,
        bool compliant,
        uint64 issuedAt
    );
    event Revoked(bytes32 indexed attestationHash, address indexed farmer);

    error AlreadyAnchored();
    error NotFound();
    error NotFarmer();

    function attest(
        bytes32 attestationHash,
        bytes32 fieldId,
        bytes32 schemaId,
        uint64 issuedAt,
        bool compliant
    ) external {
        if (_records[attestationHash].farmer != address(0)) revert AlreadyAnchored();
        _records[attestationHash] = Record({
            farmer: msg.sender,
            fieldId: fieldId,
            schemaId: schemaId,
            issuedAt: issuedAt,
            anchoredAt: uint64(block.timestamp),
            compliant: compliant,
            revoked: false
        });
        _byField[fieldId].push(attestationHash);
        unchecked { totalAttestations++; }
        emit Attested(attestationHash, fieldId, msg.sender, schemaId, compliant, issuedAt);
    }

    function revoke(bytes32 attestationHash) external {
        Record storage r = _records[attestationHash];
        if (r.farmer == address(0)) revert NotFound();
        if (r.farmer != msg.sender) revert NotFarmer();
        r.revoked = true;
        emit Revoked(attestationHash, msg.sender);
    }

    function get(bytes32 attestationHash) external view returns (Record memory) {
        return _records[attestationHash];
    }

    function isValid(bytes32 attestationHash, address expectedFarmer) external view returns (bool) {
        Record storage r = _records[attestationHash];
        return r.farmer != address(0) && !r.revoked && r.farmer == expectedFarmer;
    }

    function attestationsOf(bytes32 fieldId) external view returns (bytes32[] memory) {
        return _byField[fieldId];
    }
}
