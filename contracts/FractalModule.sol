pragma solidity ^0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";

contract FractalModule is Module {
    /// @dev Initialize function
    /// @param initializeParams Parameters of initialization encoded
    function setUp(bytes memory initializeParams) public override initializer {
        __Ownable_init();
        (
            address _owner, // Controlling DAO
            address _avatar, // GSafe
            address _target // GSafe or Modifier
        ) = abi.decode(initializeParams, (address, address, address));

        setAvatar(_avatar);
        setTarget(_target);
        transferOwnership(_owner);
    }
}
