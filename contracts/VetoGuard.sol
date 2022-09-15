//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IVetoGuard.sol";
import "./interfaces/IVetoERC20Voting.sol";
import "./TransactionHasher.sol";
import "@gnosis.pm/zodiac/contracts/guard/BaseGuard.sol";
import "@gnosis.pm/zodiac/contracts/factory/FactoryFriendly.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";

contract VetoGuard is TransactionHasher, FactoryFriendly, BaseGuard, IVetoGuard {
    // address public gnosisSafe;
    uint256 public executionDelayBlocks;
    IVetoERC20Voting public vetoERC20Voting;
    mapping(bytes32 => uint256) transactionQueuedBlock;

    constructor(
        address _owner,
        uint256 _executionDelayBlocks,
        address _vetoERC20Voting
    ) {
        bytes memory initializeParams = abi.encode(
            _owner,
            _executionDelayBlocks,
            _vetoERC20Voting
        );
        setUp(initializeParams);
    }

    /// @dev Initialize function, will be triggered when a new proxy is deployed
    /// @param initializeParams Parameters of initialization encoded
    function setUp(bytes memory initializeParams) public override initializer {
        __Ownable_init();
        (
            address _owner,
            uint256 _executionDelayBlocks,
            address _vetoERC20Voting
        ) = abi.decode(initializeParams, (address, uint256, address));

        transferOwnership(_owner);
        executionDelayBlocks = _executionDelayBlocks;
        vetoERC20Voting = IVetoERC20Voting(_vetoERC20Voting);

        emit VetoGuardSetup(msg.sender, _owner);
    }

    function queueTransaction(
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

        require(
            transactionQueuedBlock[transactionHash] == 0,
            "Transaction has already been queued"
        );

        // todo: Add in checkSignatures to ensure transaction is valid and has been signed

        transactionQueuedBlock[transactionHash] = block.number;
    }

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
        bytes memory signatures,
        address msgSender
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

        require(
            transactionQueuedBlock[transactionHash] != 0,
            "Transaction has not been queued yet"
        );

        require(
            block.number >=
                transactionQueuedBlock[transactionHash] + executionDelayBlocks,
            "Transaction delay period has not completed yet"
        );

        require(
            !vetoERC20Voting.getIsVetoed(
                to,
                value,
                data,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver
            ),
            "Transaction has been vetoed"
        );
    }

    function checkAfterExecution(bytes32 txHash, bool success)
        external
        view
        override
    {}

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
