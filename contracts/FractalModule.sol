pragma solidity ^0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";

contract FractalModule is Module {
    mapping(address => bool) controllers; // A DAO may authorize users to act on the behalf of the parent DAO.

    /// @dev Initialize function
    /// @param initializeParams Parameters of initialization encoded
    function setUp(bytes memory initializeParams) public override initializer {
        __Ownable_init();
        (
            address _owner, // Controlling DAO
            address _avatar, // GSafe
            address _target, // GSafe or Modifier
            address[] memory _controllers // Authorized controllers
        ) = abi.decode(
                initializeParams,
                (address, address, address, address[])
            );

        setAvatar(_avatar);
        setTarget(_target);
        transferOwnership(_owner);
        for (uint256 i; i < _controllers.length; i++) {
            controllers[_controllers[i]] = true;
        }
    }

    function addController(address[] memory _controllers) public onlyOwner {
        for (uint256 i; i < _controllers.length; i++) {
            controllers[_controllers[i]] = true;
        }
    }

    // function clawBack(address[] memory tokens) public {
    //     require(
    //         exec(target, value, data, operation),
    //         "Module transaction failed"
    //     );
    // }
}
