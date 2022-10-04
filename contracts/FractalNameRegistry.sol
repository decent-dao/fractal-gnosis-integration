//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IFractalNameRegistry.sol";

/// @notice A contract for registering Fractal DAO name strings
/// @notice These names are non-unique, and should not be used as the identifer of a DAO
contract FractalNameRegistry is IFractalNameRegistry {
  mapping(address => string) public daoNames;

  /// @notice Updates the DAO's registered aname
  /// @param _name The new DAO name
  function updateDAOName(string memory _name) external {
    daoNames[msg.sender] = _name;

    emit FractalNameUpdated(msg.sender, _name);
  }

  /// @notice Gets the registered name of a DAO address
  /// @param _daoAddress The address of the DAO
  /// @return string The DAO name
  function getDAOName(address _daoAddress) external view returns (string memory) {
    return daoNames[_daoAddress];
  }
}