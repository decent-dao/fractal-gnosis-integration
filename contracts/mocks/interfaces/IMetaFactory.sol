//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@fractal-framework/core-contracts/contracts/interfaces/IDAOFactory.sol";

interface IMetaFactory {
    event DAOCreated(address indexed daoAddress, address indexed accessControl, address indexed creator);
    event Executed(address[] targets, uint256[] values, bytes[] calldatas);

    error UnequalArrayLengths();

  /// @notice Creates a DAO, Access Control, and any modules specified
  /// @param daoFactory The address of the DAO factory
  /// @param createDAOParams The struct of parameters used for creating the DAO and Access Control contracts
  /// @param moduleFactories Array of addresses of the module factories to call
  /// @param moduleFactoriesBytes Array of array of bytes to pass to module factory calls
  /// @param targets An array of addresses to target for the function calls
  /// @param values An array of ether values to send with the function calls
  /// @param calldatas An array of bytes defining the function calls
  function createDAOAndExecute(
    address daoFactory,
    IDAOFactory.CreateDAOParams memory createDAOParams,
    address[] calldata moduleFactories,
    bytes[][] calldata moduleFactoriesBytes,
    address[] calldata targets,
    uint256[] calldata values,
    bytes[] calldata calldatas
  ) external;
}
