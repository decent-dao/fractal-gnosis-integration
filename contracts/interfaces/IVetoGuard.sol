//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

interface IVetoGuard {
    enum TransactionState {
        pending, // 0
        queued, // 1
        readyToExecute, // 2
        vetoed // 3
    }

    event VetoGuardSetup(address indexed creator, address indexed owner);

    function getTransactionQueuedBlock(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver
    ) external view returns (uint256);
}