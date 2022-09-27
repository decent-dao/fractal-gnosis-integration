//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
import "./IProxyCreationCallback.sol";


interface ICallbackGnosis is IProxyCreationCallback {
    /// @dev Method called once a proxy contract is created
    /// @param proxy GnosisSafe address
    /// @param _singleton GnosisSafe impl address
    /// @param initializer Payload used to setup GnosisSafe Configuration
    /// @param saltNonce Salt utilized for GnosisSafe Create2 opcode
    function proxyCreated(
        address proxy,
        address _singleton,
        bytes calldata initializer,
        uint256 saltNonce
    ) external;

    /// @notice Allows Gnosis Safe txs without knowledge of the Gnosis address
    /// @dev Utilized to bypass the txGuard / Sig Requirement
    /// @param _targets Contract Address / Address(0) == proxy
    /// @param _txs Target payload
    /// @param _proxy GnosisSafe Address
    function multiTx(
        address[] memory _targets,
        bytes[] memory _txs,
        address _proxy
    ) external;
}
