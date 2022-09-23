pragma solidity ^0.8.0;
import "./interfaces/IProxyCreationCallback.sol";
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

        (
            address[] memory targets,
            bytes[] memory datas,
            bool[] memory gnosisExecTx
        ) = abi.decode(txData, (address[], bytes[], bool[]));
        // I should send multiple tx - same time
        for (uint256 i; i < targets.length; i++) {
            if (gnosisExecTx[i]) {
                (bool success, ) = address(proxy).call(
                    abi.encodeWithSignature(
                        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
                        targets[i] == address(0) ? proxy : targets[i],
                        0,
                        datas[i],
                        0,
                        0,
                        0,
                        0,
                        address(0),
                        payable(0),
                        signature
                    )
                );
                require(success, "CB000");
            } else {
                (bool success, ) = address(
                    targets[i] == address(0) ? proxy : targets[i]
                ).call(datas[i]);
                require(success, "CB000");
            }
        }
    }
}
