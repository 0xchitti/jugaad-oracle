// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/JugaadOracle.sol";

contract DeployJugaadOracle is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        uint256 fee = vm.envOr("VERIFICATION_FEE", uint256(0.001 ether)); // ~$0.005 on Celo

        vm.startBroadcast(deployerPrivateKey);
        
        JugaadOracle oracle = new JugaadOracle(operator, fee);
        
        console.log("JugaadOracle deployed at:", address(oracle));
        console.log("Operator:", operator);
        console.log("Fee:", fee);
        
        vm.stopBroadcast();
    }
}
