pragma solidity ^0.8.0;
import "./interfaces/IProxyCreationCallback.sol";
import "./interfaces/IGnosisSafe.sol";
import "hardhat/console.sol";

contract CallbackGnosis {
    event Hi(string);

    function proxyCreated(
        address proxy,
        address _singleton,
        bytes calldata initializer,
        uint256 saltNonce
    ) external {
        (
            address[] memory _owners,
            uint256 _threshold,
            address to,
            bytes memory data,
            address fallbackHandler,
            address paymentToken,
            uint256 payment,
            address payable paymentReceiver
        ) = abi.decode(
                initializer,
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
            _owners,
            _threshold,
            to,
            data,
            fallbackHandler,
            paymentToken,
            payment,
            paymentReceiver
        );
    }

    function test() public {
        console.log(msg.sender);
    }
}
