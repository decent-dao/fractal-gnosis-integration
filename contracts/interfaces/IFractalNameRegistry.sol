//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IFractalNameRegistry {
    event FractalNameUpdated(
        address indexed daoAddress,
        string daoName
    );

  /// @notice Updates the DAO's registered aname
  /// @param _name The new DAO name
  function updateDAOName(string memory _name) external;

  /// @notice Gets the registered name of a DAO address
  /// @param _daoAddress The address of the DAO
  /// @return string The DAO name
  function getDAOName(address _daoAddress) external view returns (string memory);
}