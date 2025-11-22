// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IModuleProgress {
    function hasCompletedModule(address user, uint256 moduleId)
        external
        view
        returns (bool);
}
