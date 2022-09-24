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
            address[][] memory targets,
            bytes[][] memory txs,
            bool[] memory gnosisExecTxs
        ) = abi.decode(txData, (address[][], bytes[][], bool[]));

        for (uint256 i; i < targets.length; i++) {
            if (gnosisExecTxs[i]) {
                gnosisExecTx(targets[i], txs[i], proxy, signature);
            } else {
                for(uint j; j < targets[i].length; j++) {
                    // could this be a multisend as well?
                    txCall(targets[i][j], txs[i][j], proxy);
                }
            }
        }
    }

    function multiSend(
        address[] memory _targets,
        bytes[] memory _datas,
        address _proxy
    ) public {
        for (uint256 i; i < _targets.length; i++) {
            (bool success, ) = address(_targets[i] == address(0) ? _proxy : _targets[i])
                .call(_datas[i]);
                require(success, "CB001");
        }
    }

    function gnosisExecTx(address[] memory targets, bytes[] memory txs, address proxy, bytes memory signature) internal {
        (bool success, ) = address(proxy).call(
                    abi.encodeWithSignature(
                        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
                        address(this), // multisend address
                        0,
                        abi.encodeWithSignature(
                            "multiSend(address[],bytes[],address)",
                            targets,
                            txs,
                            proxy
                        ), // data
                        1,
                        0,
                        0,
                        0,
                        address(0),
                        payable(0),
                        signature
                    )
                );
                require(success, "CB000");
    }

    function txCall(address _target, bytes memory _tx, address proxy) internal {
                (bool success, ) = address(
                    _target == address(0) ? proxy : _target
                ).call(_tx);
                require(success, "CB002");
               
    }
}
