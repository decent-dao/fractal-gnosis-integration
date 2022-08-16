//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./GnosisWrapper.sol";

import "@fractal-framework/core-contracts/contracts/ModuleFactoryBase.sol";

/// @dev GnosisWrapper Factory used to deploy Gnosis Modules
contract GnosisWrapperFactory is ModuleFactoryBase {
    event GnosisWrapperCreated(address gnosisSafe);

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

        createdContracts[0] = createGnosisWrapper(creator, data);

        emit GnosisWrapperCreated(createdContracts[0]);

        return createdContracts;
    }

    function createGnosisWrapper(address creator, bytes[] memory data)
        private
        returns (address gnosisWrapper)
    {
        // Create wrapper
        gnosisWrapper = Create2.deploy(
            0,
            keccak256(
                abi.encodePacked(
                    creator,
                    msg.sender,
                    block.chainid,
                    abi.decode(data[3], (bytes32)) // random salt
                )
            ),
            abi.encodePacked(
                type(ERC1967Proxy).creationCode,
                abi.encode(address(abi.decode(data[2], (address))), "") // impl address
            )
        );

        GnosisWrapper(gnosisWrapper).initialize(
            abi.decode(data[0], (address)),
            abi.decode(data[1], (address))
        ); // access Control, gnosisSafe
    }
}
