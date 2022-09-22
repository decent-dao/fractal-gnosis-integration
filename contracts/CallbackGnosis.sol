pragma solidity ^0.8.0;
import "./interfaces/IProxyCreationCallback.sol";
import "./interfaces/IGnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "hardhat/console.sol";

contract CallbackGnosis {
    event Hi(string);

    function proxyCreated(
        address proxy,
        address _singleton,
        bytes calldata initializer,
        uint256 saltNonce
    ) external {
        (bytes memory init, bytes memory guard) = abi.decode(
            initializer,
            (bytes, bytes)
        );

        (address[] memory _owners, uint256 _threshold) = abi.decode(
            init,
            (address[], uint256)
        );

        (bytes memory data, bytes memory signatures) = abi.decode(
            guard,
            (bytes, bytes)
        );

        IGnosisSafe(proxy).setup(
            _owners,
            1,
            address(0),
            "",
            address(0),
            address(0),
            0,
            payable(0)
        );

        IGnosisSafe(proxy).execTransaction(
            proxy,
            0,
            data,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(0),
            signatures
        );
    }
}
