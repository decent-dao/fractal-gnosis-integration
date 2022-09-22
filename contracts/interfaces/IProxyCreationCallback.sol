
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

interface IProxyCreationCallback {
    function proxyCreated(
        address proxy,
        address _singleton,
        bytes calldata initializer,
        uint256 saltNonce
    ) external;
}