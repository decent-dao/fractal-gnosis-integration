//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IVetoGuard.sol";
import "./interfaces/IVetoERC20Voting.sol";
import "./TransactionHasher.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice A contract for casting veto votes with an ERC20 votes token
contract VetoERC20Voting is
    IVetoERC20Voting,
    TransactionHasher,
    Initializable,
    Ownable
{
    uint256 public vetoVotesThreshold; // Number of votes required to veto a transaction
    uint256 public freezeVotesThreshold; // Number of freeze votes required to activate a freeze
    uint256 public freezeProposalCreatedBlock; // Block number the freeze proposal was created at
    uint256 public freezeProposalVoteCount; // Number of accrued freeze votes
    uint256 public freezeProposalBlockDuration; // Number of blocks a freeze proposal has to succeed
    uint256 public freezeBlockDuration; // Number of blocks a freeze last, from time of freeze proposal creation
    IVotes public votesToken;
    IVetoGuard public vetoGuard;
    mapping(bytes32 => uint256) public transactionVetoVotes;
    mapping(address => mapping(bytes32 => bool)) public userHasVoted;
    mapping(address => mapping(uint256 => bool)) public userHasFreezeVoted;

    /// @notice Initializes the contract that can only be called once
    /// @param _owner The owner address that can update configurable parameters
    /// @param _vetoVotesThreshold The number of votes required to veto a transaction
    /// @param _freezeVotesThreshold The number of votes required to freeze the DAO
    /// @param _freezeProposalBlockDuration The number of blocks a freeze proposal has to succeed
    /// @param _freezeBlockDuration The number of blocks a freeze last, from time of freeze proposal creation
    /// @param _votesToken The address of the VotesToken contract
    /// @param _vetoGuard The address of the VetoGuard contract
    function initialize(
        address _owner,
        uint256 _vetoVotesThreshold,
        uint256 _freezeVotesThreshold,
        uint256 _freezeProposalBlockDuration,
        uint256 _freezeBlockDuration,
        address _votesToken,
        address _vetoGuard
    ) external initializer {
        _transferOwnership(_owner);
        vetoVotesThreshold = _vetoVotesThreshold;
        freezeVotesThreshold = _freezeVotesThreshold;
        freezeProposalBlockDuration = _freezeProposalBlockDuration;
        freezeBlockDuration = _freezeBlockDuration;
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

        require(vetoVotes > 0, "User has no votes");

        // Add the user votes to the veto vote count for this transaction
        transactionVetoVotes[_transactionHash] += vetoVotes;

        // If the user is voting to freeze, count that vote as well
        if (_freeze) {
            castFreezeVote();
        }

        // User has voted
        userHasVoted[msg.sender][_transactionHash] = true;

        emit VetoVoteCast(msg.sender, _transactionHash, vetoVotes, _freeze);
    }

    /// @notice Allows a user to cast a freeze vote if there is an active freeze proposal
    /// @notice If there isn't an active freeze proposal, it is created and the user's votes are cast
    function castFreezeVote() public {
        uint256 userVotes;

        if (
            block.number >
            freezeProposalCreatedBlock + freezeProposalBlockDuration
        ) {
            // Create freeze proposal, set total votes to msg.sender's vote count
            freezeProposalCreatedBlock = block.number;

            userVotes = votesToken.getPastVotes(
                msg.sender,
                freezeProposalCreatedBlock - 1
            );
            require(userVotes > 0, "User has no votes");

            freezeProposalVoteCount = userVotes;

            emit FreezeProposalCreated(msg.sender);
        } else {
            // There is an existing freeze proposal, count user's votes
            require(
                !userHasFreezeVoted[msg.sender][freezeProposalCreatedBlock],
                "User has already voted"
            );

            userVotes = votesToken.getPastVotes(
                msg.sender,
                freezeProposalCreatedBlock - 1
            );
            require(userVotes > 0, "User has no votes");

            freezeProposalVoteCount += userVotes;
        }

        userHasFreezeVoted[msg.sender][freezeProposalCreatedBlock] = true;

        emit FreezeVoteCast(msg.sender, userVotes);
    }

    /// @notice Unfreezes the DAO, only callable by the owner
    function defrost() public onlyOwner {
        require(isFrozen(), "DAO is not already frozen");
        freezeProposalCreatedBlock = 0;
        freezeProposalVoteCount = 0;
    }

    /// @notice Updates the veto votes threshold, only callable by the owner
    /// @param _vetoVotesThreshold The number of votes required to veto a transaction
    function updateVetoVotesThreshold(uint256 _vetoVotesThreshold)
        external
        onlyOwner
    {
        vetoVotesThreshold = _vetoVotesThreshold;
    }

    /// @notice Updates the freeze votes threshold, only callable by the owner
    /// @param _freezeVotesThreshold Number of freeze votes required to activate a freeze
    function updateFreezeVotesThreshold(uint256 _freezeVotesThreshold)
        external
        onlyOwner
    {
        freezeVotesThreshold = _freezeVotesThreshold;
    }

    /// @notice Updates the freeze proposal blocks duration, only callable by the owner
    /// @param _freezeProposalBlockDuration The number of blocks a freeze proposal has to succeed
    function updateFreezeProposalBlockDuration(
        uint256 _freezeProposalBlockDuration
    ) external onlyOwner {
        freezeProposalBlockDuration = _freezeProposalBlockDuration;
    }

    /// @notice Updates the freeze block duration, only callable by the owner
    /// @param _freezeBlockDuration The number of blocks a freeze last, from time of freeze proposal creation
    function updateFreezeBlockDuration(uint256 _freezeBlockDuration)
        external
        onlyOwner
    {
        freezeBlockDuration = _freezeBlockDuration;
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

    /// @notice Returns true if the DAO is currently frozen
    /// @return bool Indicates whether the DAO is currently frozen
    function isFrozen() public view returns (bool) {
        if (
            freezeProposalVoteCount > freezeVotesThreshold &&
            block.number < freezeProposalCreatedBlock + freezeBlockDuration
        ) {
            return true;
        }

        return false;
    }
}
