//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IERC20Votes.sol";
import "./interfaces/IVetoGuard.sol";
import "./interfaces/IVetoERC20Voting.sol";
import "./TransactionHasher.sol";
import "@fractal-framework/core-contracts/contracts/ModuleBase.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

/// @notice A contract for casting veto votes with an ERC20 votes token
contract VetoERC20Voting is IVetoERC20Voting, TransactionHasher, ModuleBase {
    uint256 public vetoVotesThreshold;
    IERC20Votes public votesToken;
    IVetoGuard public vetoGuard;
    mapping(bytes32 => uint256) public transactionVetoVotes;
    mapping(address => mapping(bytes32 => bool)) public userHasVoted;

  /// @notice Initializes the contract that can only be called once
  /// @param _vetoVotesThreshold The number of votes required to veto a transaction
  /// @param _votesToken The 
  /// @param _vetoGuard The address of the VetoGuard contract
  /// @param _accessControl The address of the access control contract
    function initialize(
        uint256 _vetoVotesThreshold,
        address _votesToken,
        address _vetoGuard,
        address _accessControl
    ) external initializer {
        __initBase(_accessControl, msg.sender, "Veto ERC20 Voting");
        vetoVotesThreshold = _vetoVotesThreshold;
        votesToken = IERC20Votes(_votesToken);
        vetoGuard = IVetoGuard(_vetoGuard);
    }

    /// @notice Allows the msg.sender to cast veto votes on the specified transaction
    /// @param to Destination address.
    /// @param value Ether value.
    /// @param data Data payload.
    /// @param operation Operation type.
    /// @param safeTxGas Gas that should be used for the safe transaction.
    /// @param baseGas Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
    /// @param gasPrice Maximum gas price that should be used for this transaction.
    /// @param gasToken Token address (or 0 if ETH) that is used for the payment.
    /// @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
    function castVetoVote(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver
    ) external {
        // Get the transaction hash
        bytes32 transactionHash = getTransactionHash(
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver
        );

        // Check that user has not yet voted
        require(
            !userHasVoted[msg.sender][transactionHash],
            "User has already voted"
        );

        // Get the block number the transaction was queued on the VetoGuard
        uint256 queuedBlockNumber = vetoGuard.getTransactionQueuedBlock(
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver
        );

        // Check that the transaction has been queued
        require(queuedBlockNumber != 0, "Transaction has not yet been queued");

        uint256 vetoVotes = votesToken.getPastVotes(
            msg.sender,
            queuedBlockNumber
        );

        // Add the user votes to the veto vote count for this transaction
        transactionVetoVotes[transactionHash] += vetoVotes;

        // User has voted
        userHasVoted[msg.sender][transactionHash] = true;

        emit VetoVoteCast(msg.sender, transactionHash, vetoVotes);
    }

    /// @notice Returns whether the specified functions has been vetoed
    /// @param to Destination address.
    /// @param value Ether value.
    /// @param data Data payload.
    /// @param operation Operation type.
    /// @param safeTxGas Gas that should be used for the safe transaction.
    /// @param baseGas Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
    /// @param gasPrice Maximum gas price that should be used for this transaction.
    /// @param gasToken Token address (or 0 if ETH) that is used for the payment.
    /// @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
    /// @return bool True if the transaction is vetoed
    function getIsVetoed(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver
    ) external view returns (bool) {
        return
            transactionVetoVotes[
                getTransactionHash(
                    to,
                    value,
                    data,
                    operation,
                    safeTxGas,
                    baseGas,
                    gasPrice,
                    gasToken,
                    refundReceiver
                )
            ] > vetoVotesThreshold;
    }

    /// @notice Returns the number of votes that have been cast to veto the specified transaction
    /// @param to Destination address.
    /// @param value Ether value.
    /// @param data Data payload.
    /// @param operation Operation type.
    /// @param safeTxGas Gas that should be used for the safe transaction.
    /// @param baseGas Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
    /// @param gasPrice Maximum gas price that should be used for this transaction.
    /// @param gasToken Token address (or 0 if ETH) that is used for the payment.
    /// @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
    /// @return uint256 The number of veto votes that have been cast
    function getVetoVotes(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver
    ) external view returns (uint256) {
        return
            transactionVetoVotes[
                getTransactionHash(
                    to,
                    value,
                    data,
                    operation,
                    safeTxGas,
                    baseGas,
                    gasPrice,
                    gasToken,
                    refundReceiver
                )
            ];
    }
}
