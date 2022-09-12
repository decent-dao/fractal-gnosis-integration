//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol,
        address _hodler,
        uint256 _supply
    ) ERC20(_name, _symbol) {
      _mint(_hodler, _supply);
    }
}
  