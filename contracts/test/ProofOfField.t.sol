// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FieldAttestationRegistry} from "../src/FieldAttestationRegistry.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {AgentWallet, IERC20} from "../src/AgentWallet.sol";

contract ProofOfFieldTest is Test {
    FieldAttestationRegistry reg;
    MockUSDT usdt;
    AgentWallet wallet;

    address farmer = makeAddr("farmer");
    address company = makeAddr("company");
    address agent = makeAddr("agent");

    bytes32 constant ATT = keccak256("attestation");
    bytes32 constant FIELD = keccak256("field-polygon");
    bytes32 constant SCHEMA = keccak256("FieldAttestation.v1");

    function setUp() public {
        reg = new FieldAttestationRegistry();
        usdt = new MockUSDT();
        vm.prank(company);
        wallet = new AgentWallet(agent, IERC20(address(usdt)), 20e6, 5e6);
        usdt.mint(address(wallet), 100e6);
    }

    function test_attest_and_verify() public {
        vm.prank(farmer);
        reg.attest(ATT, FIELD, SCHEMA, 1700000000, true);
        assertTrue(reg.isValid(ATT, farmer));
        assertFalse(reg.isValid(ATT, company));
        FieldAttestationRegistry.Record memory r = reg.get(ATT);
        assertEq(r.farmer, farmer);
        assertEq(r.fieldId, FIELD);
        assertTrue(r.compliant);
        assertEq(reg.attestationsOf(FIELD).length, 1);
        assertEq(reg.totalAttestations(), 1);
    }

    function test_attest_twice_reverts() public {
        vm.startPrank(farmer);
        reg.attest(ATT, FIELD, SCHEMA, 1, true);
        vm.expectRevert(FieldAttestationRegistry.AlreadyAnchored.selector);
        reg.attest(ATT, FIELD, SCHEMA, 1, true);
    }

    function test_revoke_only_farmer() public {
        vm.prank(farmer);
        reg.attest(ATT, FIELD, SCHEMA, 1, true);
        vm.prank(company);
        vm.expectRevert(FieldAttestationRegistry.NotFarmer.selector);
        reg.revoke(ATT);
        vm.prank(farmer);
        reg.revoke(ATT);
        assertFalse(reg.isValid(ATT, farmer));
    }

    function test_agent_pays_within_policy() public {
        vm.prank(company);
        wallet.setPayee(farmer, true);
        vm.prank(agent);
        wallet.pay(farmer, 5e6, ATT);
        assertEq(usdt.balanceOf(farmer), 5e6);
        assertEq(wallet.remainingToday(), 15e6);
    }

    function test_agent_blocked_by_policy() public {
        vm.prank(company);
        wallet.setPayee(farmer, true);
        vm.startPrank(agent);
        vm.expectRevert(AgentWallet.OverPerPaymentLimit.selector);
        wallet.pay(farmer, 6e6, ATT);
        wallet.pay(farmer, 5e6, ATT);
        wallet.pay(farmer, 5e6, ATT);
        wallet.pay(farmer, 5e6, ATT);
        wallet.pay(farmer, 5e6, ATT);
        vm.expectRevert(AgentWallet.OverDailyLimit.selector);
        wallet.pay(farmer, 1e6, ATT);
        vm.stopPrank();
        // window resets after 24h
        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        wallet.pay(farmer, 1e6, ATT);
    }

    function test_agent_blocked_unknown_payee() public {
        vm.prank(agent);
        vm.expectRevert(AgentWallet.PayeeNotAllowed.selector);
        wallet.pay(farmer, 1e6, ATT);
    }

    function test_only_agent_can_pay() public {
        vm.prank(company);
        wallet.setPayee(farmer, true);
        vm.prank(company);
        vm.expectRevert(AgentWallet.NotAgent.selector);
        wallet.pay(farmer, 1e6, ATT);
    }
}
