// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {FieldAttestationRegistry} from "../src/FieldAttestationRegistry.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {AgentWallet, IERC20} from "../src/AgentWallet.sol";

/// Deploys everything from the BUYER key (company), funds the agent wallet,
/// and allows the FARMER as payee. Farmer only needs gas to call attest().
contract Deploy is Script {
    function run() external {
        uint256 buyerPk = vm.envUint("BUYER_PRIVATE_KEY");
        address buyerAgent = vm.addr(buyerPk);
        address farmer = vm.envAddress("FARMER_ADDRESS");

        vm.startBroadcast(buyerPk);
        FieldAttestationRegistry reg = new FieldAttestationRegistry();
        MockUSDT usdt = new MockUSDT();
        // company == agent for the demo (same key), policy: 50 USDT/day, 10 USDT/payment
        AgentWallet wallet = new AgentWallet(buyerAgent, IERC20(address(usdt)), 50e6, 10e6);
        usdt.mint(address(wallet), 1_000e6);
        wallet.setPayee(farmer, true);
        vm.stopBroadcast();

        console2.log("REGISTRY=%s", address(reg));
        console2.log("USDT=%s", address(usdt));
        console2.log("AGENT_WALLET=%s", address(wallet));
    }
}
