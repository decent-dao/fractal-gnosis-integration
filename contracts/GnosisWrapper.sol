//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@fractal-framework/core-contracts/contracts/ModuleBase.sol";
import "./interfaces/IGnosisWrapper.sol";

contract GnosisWrapper is ModuleBase {
    address public gnosisSafe;

    function initialize(address _accessControl, address _gnosisSafe)
        public
        initializer
    {
        __initBase(_accessControl, msg.sender, "Wrapper Module");
        _registerInterface(type(IGnosisWrapper).interfaceId);
        gnosisSafe = _gnosisSafe;
    }
}
