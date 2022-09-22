//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "../interfaces/IVetoGuard.sol";
import "../interfaces/IVetoERC20Voting.sol";
import "../interfaces/IGnosisSafe.sol";
import "../TransactionHasher.sol";
import "@gnosis.pm/zodiac/contracts/guard/BaseGuard.sol";
import "@gnosis.pm/zodiac/contracts/factory/FactoryFriendly.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

/// @notice A guard contract that prevents transactions that have been vetoed from being executed on the Gnosis Safe
contract MockVetoGuard is
    TransactionHasher,
    FactoryFriendly,
    BaseGuard,
    IVetoGuard
{
    uint256 public executionDelayBlocks;
    IVetoERC20Voting public vetoERC20Voting;
    IGnosisSafe public gnosisSafe;
    mapping(bytes32 => uint256) transactionQueuedBlock;

    constructor(
        address _owner,
        uint256 _executionDelayBlocks,
        address _vetoERC20Voting,
        address _gnosisSafe
    ) {
        bytes memory initializeParams = abi.encode(
            _executionDelayBlocks,
            _owner,
            _vetoERC20Voting,
            _gnosisSafe
        );
        setUp(initializeParams);
    }

    /// @notice Initialize function, will be triggered when a new proxy is deployed
    /// @param initializeParams Parameters of initialization encoded
    function setUp(bytes memory initializeParams) public override initializer {
        __Ownable_init();
        (
            uint256 _executionDelayBlocks,
            address _owner,
            address _vetoERC20Voting,
            address _gnosisSafe
        ) = abi.decode(initializeParams, (uint256, address, address, address));

        executionDelayBlocks = _executionDelayBlocks;
        transferOwnership(_owner);
        vetoERC20Voting = IVetoERC20Voting(_vetoERC20Voting);
        gnosisSafe = IGnosisSafe(_gnosisSafe);

        emit VetoGuardSetup(
            msg.sender,
            _executionDelayBlocks,
            _owner,
            _vetoERC20Voting,
            _gnosisSafe
        );
    }

    /// @notice This function is called by the Gnosis Safe to check if the transaction should be able to be executed
    /// @notice Reverts if this transaction cannot be executed
    /// @param to Destination address.
    /// @param value Ether value.
    /// @param data Data payload.
    /// @param operation Operation type.
    /// @param safeTxGas Gas that should be used for the safe transaction.
    /// @param baseGas Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
    /// @param gasPrice Maximum gas price that should be used for this transaction.
    /// @param gasToken Token address (or 0 if ETH) that is used for the payment.
    /// @param refundReceiver Address of receiver of gas payment (or 0 if tx.origin).
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory,
        address
    ) external view override {
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
    }

    /// @notice Does checks after transaction is executed on the Gnosis Safe
    /// @param txHash The hash of the transaction that was executed
    /// @param success Boolean indicating whether the Gnosis Safe successfully executed the tx
    function checkAfterExecution(bytes32 txHash, bool success)
        external
        view
        override
    {}

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
    ) public view returns (uint256) {
        return
            transactionQueuedBlock[
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
