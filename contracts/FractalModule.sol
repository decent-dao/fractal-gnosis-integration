//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

contract FractalModule is Module {
    mapping(address => bool) public controllers; // A DAO may authorize users to act on the behalf of the parent DAO.
    event ControllersAdded(address[] controllers);
    event ControllersRemoved(address[] controllers);

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier OnlyAuthorized() {
        require(
            owner() == msg.sender || controllers[msg.sender],
            "Not Authorized"
        );
        _;
    }

    /// @dev Initialize function
    /// @param initializeParams Parameters of initialization encoded
    function setUp(bytes memory initializeParams) public override initializer {
        __Ownable_init();
        (
            address _owner, // Controlling DAO
            address _avatar, // GSafe // Address(0) == msg.sender
            address _target, // GSafe or Modifier  // Address(0) == msg.sender
            address[] memory _controllers // Authorized controllers
        ) = abi.decode(
                initializeParams,
                (address, address, address, address[])
            );

        setAvatar(_avatar == address(0) ? msg.sender : _avatar);
        setTarget(_target == address(0) ? msg.sender : _target);
        addControllers(_controllers);
        transferOwnership(_owner);
    }

    function batchExecTxs(bytes memory execTxData) public OnlyAuthorized {
        (
            address target,
            uint256 value,
            bytes memory data,
            Enum.Operation operation
        ) = abi.decode(execTxData, (address, uint256, bytes, Enum.Operation));
        require(
            exec(target, value, data, operation),
            "Module transaction failed"
        );
    }

    function addControllers(address[] memory _controllers) public onlyOwner {
        for (uint256 i; i < _controllers.length; i++) {
            controllers[_controllers[i]] = true;
        }
        emit ControllersAdded(_controllers);
    }

    function removeControllers(address[] memory _controllers)
        external
        onlyOwner
    {
        for (uint256 i; i < _controllers.length; i++) {
            controllers[_controllers[i]] = false;
        }
        emit ControllersRemoved(_controllers);
    }

    // function supportsInterface(bytes4 interfaceId)
    //     external
    //     pure
    //     override
    //     returns (bool)
    // {
    //     return
    //         interfaceId == type(IGuard).interfaceId || // 0xe6d7a83a
    //         interfaceId == type(IERC165).interfaceId; // 0x01ffc9a7
    // }
}
