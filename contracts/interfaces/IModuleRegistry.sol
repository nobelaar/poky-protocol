// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./Types.sol";

interface IModuleRegistry {
    /// @notice Emitted when a new module is created
    event ModuleCreated(
        uint256 indexed moduleId,
        address indexed author,
        string ipfsCid
    );

    /// @notice Creates a new module pointing to content in IPFS/Filecoin
    /// @dev ipfsCid should resolve to a JSON/Markdown that contiene sections/subsections
    function createModule(
        string calldata title,
        string calldata description,
        string calldata image,
        string calldata ipfsCid
    ) external returns (uint256 moduleId);

    /// @notice Returns a single module by id
    function getModule(uint256 moduleId)
        external
        view
        returns (Types.Module memory);

    /// @notice Returns total number of modules registered
    function totalModules() external view returns (uint256);

    /// @notice Simple pagination helper for frontends
    /// @param offset starting index (0-based)
    /// @param limit max number of modules to return
    function getModules(uint256 offset, uint256 limit)
        external
        view
        returns (Types.Module[] memory);

    /// @notice Optional helper: modules created by a specific author
    function getModulesByAuthor(address author)
        external
        view
        returns (Types.Module[] memory);
}
