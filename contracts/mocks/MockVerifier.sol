// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IVerifier} from "../interfaces/IVerifier.sol";

/// @notice Development helper that allows registering arbitrary proofs as valid
contract MockVerifier is IVerifier {
    mapping(bytes32 => bool) private validProofs;

    function setValidProof(bytes calldata proof, bytes32[] calldata publicInputs)
        external
    {
        bytes32 key = keccak256(abi.encode(proof, publicInputs));
        validProofs[key] = true;
    }

    function verify(bytes calldata proof, bytes32[] calldata publicInputs)
        external
        view
        override
        returns (bool)
    {
        bytes32 key = keccak256(abi.encode(proof, publicInputs));
        return validProofs[key];
    }
}
