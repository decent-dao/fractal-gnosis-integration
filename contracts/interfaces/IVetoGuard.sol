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
    /// @param to Destination address.
    /// @param value Ether value.
    /// @param data Data payload.
    /// @param operation Operation type.
    /// @param safeTxGas Gas that should be used for the safe transaction.
    /// @param baseGas Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
    /// @param gasPrice Maximum gas price that should be used for this transaction.
    /// @param gasToken Token address (or 0 if ETH) that is used for the payment.
    /// @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
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
