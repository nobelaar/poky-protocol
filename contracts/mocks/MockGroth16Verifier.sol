// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";

/// @notice Development helper that allows registering arbitrary proofs as valid
contract MockGroth16Verifier is IGroth16Verifier {
    mapping(bytes32 => bool) private validProofs;
    address public immutable owner;

    constructor() {
        owner = msg.sender;
    }

    function setValidProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external {
        require(msg.sender == owner, "Only owner");
        bytes32 key = keccak256(abi.encode(a, b, c, input));
        validProofs[key] = true;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external view override returns (bool) {
        bytes32 key = keccak256(abi.encode(a, b, c, input));
        return validProofs[key];
    }
}
