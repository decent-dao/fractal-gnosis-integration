//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IVetoGuard.sol";
import "./interfaces/IVetoERC20Voting.sol";
import "./TransactionHasher.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @notice A contract for casting veto votes with an ERC20 votes token
contract VetoERC20Voting is IVetoERC20Voting, TransactionHasher, Initializable {
    bool public isFrozen;
    uint256 public vetoVotesThreshold;
    uint256 public freezeVotesThreshold;
    IVotes public votesToken;
    IVetoGuard public vetoGuard;
    mapping(bytes32 => uint256) public transactionVetoVotes;
    mapping(bytes32 => uint256) public transactionFreezeVotes;
    mapping(address => mapping(bytes32 => bool)) public userHasVoted;

    /// @notice Initializes the contract that can only be called once
    /// @param _vetoVotesThreshold The number of votes required to veto a transaction
    /// @param _freezeVotesThreshold The number of votes required to freeze the DAO
    /// @param _votesToken The address of the VotesToken contract
    /// @param _vetoGuard The address of the VetoGuard contract
    function initialize(
        uint256 _vetoVotesThreshold,
        uint256 _freezeVotesThreshold,
        address _votesToken,
        address _vetoGuard
    ) external initializer {
        vetoVotesThreshold = _vetoVotesThreshold;
        freezeVotesThreshold = _freezeVotesThreshold;
        votesToken = IVotes(_votesToken);
        vetoGuard = IVetoGuard(_vetoGuard);
    }

    /// @notice Allows the msg.sender to cast veto and freeze votes on the specified transaction
    /// @param _transactionHash The hash of the transaction data
    /// @param _freeze Bool indicating whether the voter thinks the DAO should also be frozen
    function castVetoVote(bytes32 _transactionHash, bool _freeze) external {
        // Check that user has not yet voted
        require(
            !userHasVoted[msg.sender][_transactionHash],
            "User has already voted"
        );

        // Get the block number the transaction was queued on the VetoGuard
        uint256 queuedBlockNumber = vetoGuard.getTransactionQueuedBlock(
            _transactionHash
        );

        // Check that the transaction has been queued
        require(queuedBlockNumber != 0, "Transaction has not yet been queued");

        uint256 vetoVotes = votesToken.getPastVotes(
            msg.sender,
            queuedBlockNumber - 1
        );

        // Add the user votes to the veto vote count for this transaction
        transactionVetoVotes[_transactionHash] += vetoVotes;

        // If the user is voting to freeze, count that vote as well
        if (_freeze) {
            transactionFreezeVotes[_transactionHash] += vetoVotes;
            // If enough freeze votes have been casted, then freeze the DAO
            if (
                !isFrozen &&
                transactionFreezeVotes[_transactionHash] > freezeVotesThreshold
            ) isFrozen = true;
        }

        // User has voted
        userHasVoted[msg.sender][_transactionHash] = true;

        emit VetoVoteCast(msg.sender, _transactionHash, vetoVotes, _freeze);
    }

    /// @notice Returns whether the specified transaction has been vetoed
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
            isFrozen || transactionVetoVotes[
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
