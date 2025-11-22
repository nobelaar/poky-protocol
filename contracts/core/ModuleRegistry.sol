// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";
import {Types} from "../interfaces/Types.sol";

/// @title ModuleRegistry
/// @notice Minimal storage for module metadata
contract ModuleRegistry is IModuleRegistry {
    error ModuleNotFound(uint256 moduleId);

    Types.Module[] private modules;

    /// @inheritdoc IModuleRegistry
    function createModule(
        string calldata title,
        string calldata description,
        string calldata image,
        string calldata ipfsCid,
        uint256 sectionCount
    ) external override returns (uint256 moduleId) {
        require(sectionCount > 0, "sectionCount required");
        moduleId = modules.length;

        Types.Module memory newModule = Types.Module({
            id: moduleId,
            title: title,
            description: description,
            image: image,
            author: msg.sender,
            ipfsCid: ipfsCid,
            sectionCount: sectionCount,
            version: 1,
            createdAt: block.timestamp
        });

        modules.push(newModule);

        emit ModuleCreated(moduleId, msg.sender, ipfsCid);
    }

    /// @inheritdoc IModuleRegistry
    function getModule(uint256 moduleId)
        public
        view
        override
        returns (Types.Module memory)
    {
        if (moduleId >= modules.length) {
            revert ModuleNotFound(moduleId);
        }

        return modules[moduleId];
    }

    /// @inheritdoc IModuleRegistry
    function totalModules() external view override returns (uint256) {
        return modules.length;
    }

    /// @inheritdoc IModuleRegistry
    function getModules(uint256 offset, uint256 limit)
        external
        view
        override
        returns (Types.Module[] memory)
    {
        uint256 total = modules.length;
        if (offset >= total) {
            return new Types.Module[](0);
        }

        uint256 remaining = total - offset;
        uint256 sliceSize = limit < remaining ? limit : remaining;

        Types.Module[] memory results = new Types.Module[](sliceSize);
        for (uint256 i = 0; i < sliceSize; ) {
            results[i] = modules[offset + i];
            unchecked {
                ++i;
            }
        }

        return results;
    }

    /// @inheritdoc IModuleRegistry
    function getModulesByAuthor(address author)
        external
        view
        override
        returns (Types.Module[] memory)
    {
        uint256 total = modules.length;
        uint256 count;

        for (uint256 i = 0; i < total; ) {
            if (modules[i].author == author) {
                unchecked {
                    ++count;
                }
            }

            unchecked {
                ++i;
            }
        }

        Types.Module[] memory results = new Types.Module[](count);
        uint256 index;

        for (uint256 i = 0; i < total; ) {
            if (modules[i].author == author) {
                results[index] = modules[i];
                unchecked {
                    ++index;
                }
            }

            unchecked {
                ++i;
            }
        }

        return results;
    }
}
