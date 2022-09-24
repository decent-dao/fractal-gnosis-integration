//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./VetoGuard.sol";
import "@fractal-framework/core-contracts/contracts/ModuleFactoryBase.sol";
import "hardhat/console.sol";

/// @dev GnosisWrapper Factory used to deploy Gnosis Modules
contract VetoGuardFactory is ModuleFactoryBase {
    event VetoGuardCreated(address guard);

    function initialize() external initializer {
        __initFactoryBase();
    }

    /// @dev Creates a GnosisWrapper module
    /// @param creator The address creating the module
    /// @param data The array of bytes used to create the module
    /// @return address[] The array of addresses of the created module
    function create(address creator, bytes[] calldata data)
        external
        override
        returns (address[] memory)
    {
        address[] memory createdContracts = new address[](1);

        createdContracts[0] = createVeto(data);

        emit VetoGuardCreated(createdContracts[0]);

        return createdContracts;
    }

    function createVeto(bytes[] memory data) private returns (address guard) {
        // Create wrapper
        guard = Create2.deploy(
            0,
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    abi.decode(data[0], (bytes32)) // random salt
                )
            ),
            abi.encodePacked(type(VetoGuard).creationCode)
        );
    }
}
