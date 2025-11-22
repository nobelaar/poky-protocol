// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";
import {Types} from "../interfaces/Types.sol";

/// @title ModuleProgress
/// @notice Permissionless module completion tracker gated by author signatures
contract ModuleProgress {
    error InvalidSignature();
    error SignatureAlreadyUsed(bytes32 digest);
    error AlreadyCompleted(address user, uint256 moduleId);

    event ModuleCompleted(address indexed user, uint256 indexed moduleId);

    IModuleRegistry public immutable moduleRegistry;

    mapping(address user => mapping(uint256 moduleId => bool)) private completed;
    mapping(bytes32 digest => bool) public usedProofs;

    constructor(address moduleRegistryAddress) {
        require(moduleRegistryAddress != address(0), "invalid registry");
        moduleRegistry = IModuleRegistry(moduleRegistryAddress);
    }

    /// @notice Marks the calling user as having completed `moduleId`
    /// @param moduleId The module identifier within ModuleRegistry
    /// @param nonce Unique value for each completion proof
    /// @param signature Author-signed attestation for this completion
    function claimModuleCompletion(
        uint256 moduleId,
        uint256 nonce,
        bytes calldata signature
    ) external {
        bytes32 digest = keccak256(
            abi.encodePacked(address(this), msg.sender, moduleId, nonce)
        );

        if (usedProofs[digest]) {
            revert SignatureAlreadyUsed(digest);
        }

        if (completed[msg.sender][moduleId]) {
            revert AlreadyCompleted(msg.sender, moduleId);
        }

        Types.Module memory moduleData = moduleRegistry.getModule(moduleId);
        address recoveredSigner = _recoverSigner(digest, signature);

        if (recoveredSigner != moduleData.author) {
            revert InvalidSignature();
        }

        usedProofs[digest] = true;
        completed[msg.sender][moduleId] = true;

        emit ModuleCompleted(msg.sender, moduleId);
    }

    /// @notice Returns whether `user` completed `moduleId`
    function hasCompletedModule(address user, uint256 moduleId)
        external
        view
        returns (bool)
    {
        return completed[user][moduleId];
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature)
        private
        pure
        returns (address)
    {
        if (signature.length != 65) {
            revert InvalidSignature();
        }

        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)
        );

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := shr(248, calldataload(add(signature.offset, 0x40)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) {
            revert InvalidSignature();
        }

        address recovered = ecrecover(ethSignedMessageHash, v, r, s);
        if (recovered == address(0)) {
            revert InvalidSignature();
        }

        return recovered;
    }
}
