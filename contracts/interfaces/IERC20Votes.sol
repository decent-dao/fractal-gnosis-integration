//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IERC20Votes {
    function getPastVotes(address account, uint256 blockNumber)
        external
        view
        returns (uint256);
}
