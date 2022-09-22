pragma solidity ^0.8.0;
import "./interfaces/IProxyCreationCallback.sol";
import "./interfaces/IGnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "hardhat/console.sol";

contract CallbackGnosis {
    function proxyCreated(
        address proxy,
        address _singleton,
        bytes calldata initializer,
        uint256 saltNonce
    ) external {
        (bytes memory txData, bytes memory signature) = abi.decode(
            initializer,
            (bytes, bytes)
        );

        (address[] memory to, bytes[] memory data) = abi.decode(
            txData,
            (address[], bytes[])
        );

        for (uint256 i; i < to.length; i++) {
            if (i == 0) {
                initSetup(proxy, data[0]);
            } else {
                IGnosisSafe(proxy).execTransaction(
                    to[i] == address(0) ? proxy : to[i],
                    0,
                    data[i],
                    Enum.Operation.Call,
                    0,
                    0,
                    0,
                    address(0),
                    payable(0),
                    signature
                );
            }
        }
    }

    function initSetup(address proxy, bytes memory setupData) public {
        address[] memory callback = new address[](1);
        callback[0] = address(this);
        (
            ,
            ,
            ,
            ,
            address fallbackHandler,
            address paymentToken,
            uint256 payment,
            address paymentReceiver
        ) = abi.decode(
                setupData,
                (
                    address[],
                    uint256,
                    address,
                    bytes,
                    address,
                    address,
                    uint256,
                    address
                )
            );
        IGnosisSafe(proxy).setup(
            callback,
            1,
            address(0),
            "",
            fallbackHandler,
            paymentToken,
            payment,
            payable(paymentReceiver)
        );
    }
}
