// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RigValleyDistributor} from "../src/RigValleyDistributor.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";

/// @notice Deploys the distribution contract.
/// Env:
///   DEPLOYER_PRIVATE_KEY   key that pays for deployment
///   TOKEN_ADDRESS          NVDA Stock Token address (VERIFY against Robinhood's official list).
///                          Leave empty with DEPLOY_MOCK_TOKEN=true for local/testnet only.
///   DEPLOY_MOCK_TOKEN      "true" to deploy a MockStockToken (never on mainnet)
///   OWNER_ADDRESS          treasury / owner (hardware wallet). Defaults to deployer.
///   VOUCHER_SIGNER_ADDRESS game server voucher-signing address
///   PAUSER_ADDRESS         emergency pause key (optional)
///   PERIOD_SECONDS         payout period length (default 1 day)
///   PERIOD_CEILING         max payout per period in token units
///   MAX_CLAIM              max payout per voucher in token units
///   MOCK_FUND_AMOUNT       mock only: amount minted to the distributor
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        bool mock = vm.envOr("DEPLOY_MOCK_TOKEN", false);
        address owner = vm.envOr("OWNER_ADDRESS", deployer);
        address signer = vm.envAddress("VOUCHER_SIGNER_ADDRESS");
        address pauser = vm.envOr("PAUSER_ADDRESS", address(0));
        uint256 period = vm.envOr("PERIOD_SECONDS", uint256(1 days));
        uint256 ceiling = vm.envOr("PERIOD_CEILING", uint256(500e18));
        uint256 maxClaim = vm.envOr("MAX_CLAIM", uint256(50e18));

        vm.startBroadcast(deployerKey);
        address tokenAddr;
        if (mock) {
            require(block.chainid != 4663, "No mock token on mainnet");
            MockStockToken t = new MockStockToken("NVIDIA Stock Token (Test)", "NVDA", 18, deployer);
            tokenAddr = address(t);
        } else {
            tokenAddr = vm.envAddress("TOKEN_ADDRESS");
        }
        RigValleyDistributor dist =
            new RigValleyDistributor(IERC20(tokenAddr), owner, signer, pauser, period, ceiling, maxClaim);
        if (mock) {
            MockStockToken(tokenAddr).mint(address(dist), vm.envOr("MOCK_FUND_AMOUNT", uint256(10_000e18)));
        }
        vm.stopBroadcast();

        console2.log("TOKEN_ADDRESS", tokenAddr);
        console2.log("DISTRIBUTOR_ADDRESS", address(dist));
    }
}
