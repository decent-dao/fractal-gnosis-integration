//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IMetaFactory.sol";
import "@fractal-framework/core-contracts/contracts/interfaces/IDAO.sol";
import "@fractal-framework/core-contracts/contracts/interfaces/IModuleFactoryBase.sol";

/// @notice A factory contract for deploying DAOs along with any desired modules within one transaction
/// @dev For the Metafactory to be able to call the execute function on the created DAO, it needs to be given
/// @dev a role that has permissions to call this function. It is critical to have the MetaFactory then revoke
/// @dev this role within the same transaction, so that the MetaFactory cannot be used to perform arbitrary
/// @dev execution calls on the DAO in the future.
contract MetaFactory is IMetaFactory, ERC165 {
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
  ) external {
    createDAO(daoFactory, createDAOParams);
    createModules(moduleFactories, moduleFactoriesBytes);
    execute(targets, values, calldatas);
  }

  /// @notice A function for creating the DAO and Access Control contracts
  /// @param daoFactory The address of the DAO factory
  /// @param createDAOParams The struct of parameters used for creating the DAO and Access Control contracts
  function createDAO(
    address daoFactory,
    IDAOFactory.CreateDAOParams memory createDAOParams
  ) internal {
    (address dao, address accessControl) = IDAOFactory(daoFactory).createDAO(
      msg.sender,
      createDAOParams
    );

    emit DAOCreated(dao, accessControl, msg.sender);
  }

  function createModules(
    address[] calldata moduleFactories,
    bytes[][] calldata moduleFactoriesBytes
  ) internal {
    if (moduleFactories.length != moduleFactoriesBytes.length)
      revert UnequalArrayLengths();

    for (uint256 i; i < moduleFactories.length; i++) {
      IModuleFactoryBase(moduleFactories[i]).create(msg.sender, moduleFactoriesBytes[i]);
    }
  }

  /// @notice A function for executing function calls to deploy an MVD, modules, and initialize them
  /// @param targets An array of addresses to target for the function calls
  /// @param values An array of ether values to send with the function calls
  /// @param calldatas An array of bytes defining the function calls
  function execute(
    address[] calldata targets,
    uint256[] calldata values,
    bytes[] calldata calldatas
  ) internal {
    if (targets.length != values.length || targets.length != calldatas.length)
      revert UnequalArrayLengths();
    string memory errorMessage = "MetaFactory: call reverted without message";
    uint256 targetlength = targets.length;
    for (uint256 i = 0; i < targetlength; ) {
      (bool success, bytes memory returndata) = targets[i].call{
        value: values[i]
      }(calldatas[i]);
      Address.verifyCallResult(success, returndata, errorMessage);
      unchecked {
        i++;
      }
    }
    emit Executed(targets, values, calldatas);
  }

  /// @notice Returns whether a given interface ID is supported
  /// @param interfaceId An interface ID bytes4 as defined by ERC-165
  /// @return bool Indicates whether the interface is supported
  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override
    returns (bool)
  {
    return
      interfaceId == type(IMetaFactory).interfaceId ||
      super.supportsInterface(interfaceId);
  }
}
