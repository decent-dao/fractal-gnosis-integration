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

    event VetoGuardSetup(
        address creator,
        uint256 executionDelayBlocks,
        address indexed owner,
        address indexed vetoERC20Voting,
        address indexed gnosisSafe
    );

    event TransactionQueued(
      address indexed queuer,
      bytes32 indexed transactionHash,
      bytes indexed signatures
    );

    /// @notice Gets the block number that the transaction was queued at
    /// @param _transactionHash The hash of the transaction data
    /// @return uint256 The block number
    function getTransactionQueuedBlock(bytes32 _transactionHash)
        external
        view
        returns (uint256);
}
