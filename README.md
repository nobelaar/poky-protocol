# Poky Protocol – Minimal Knowledge Registry

This repo hosts the first smart contracts for Poky, a minimal knowledge protocol where authors publish learning modules and bundle them into curated tracks. The stack uses **Hardhat 3**, the native `node:test` runner, and [`viem`](https://viem.sh/) for all contract interactions.


## Contracts

- `contracts/core/ModuleRegistry.sol` stores immutable metadata for learning modules (titles, descriptions, images, IPFS CIDs, authors, timestamps). IDs are the array index and events surface the author/IPFS pair.
- `contracts/core/TrackRegistry.sol` keeps higher-level learning tracks composed of ordered module IDs. Tracks require at least one module and also store the author + timestamp.
- `contracts/core/ModuleProgress.sol` lets learners permissionlessly record completed modules using author-signed attestations, emitting `ModuleCompleted` events that future badge mechanics can consume.
- Structs live in `contracts/interfaces/Types.sol`; external-facing interfaces sit in `contracts/interfaces/IModuleRegistry.sol` and `contracts/interfaces/ITrackRegistry.sol`.

## Tests 

TypeScript tests in `test/ModuleRegistry.test.ts` and `test/TrackRegistry.test.ts` rely on `node:test`, Hardhat’s viem helper, and viem assertions to cover:

- Sequential ID generation for modules and tracks.
- Metadata persistence (title, description/image/IPFS, authors, timestamps).
- Pagination helpers (`getModules`, `getTracks`) including overflows.
- Total counters.
- Custom-error reverts for invalid IDs and empty module arrays.

Run them with:

```bash
npx hardhat test
```

Each case deploys a fresh registry on the fly via `viem.deployContract`.

## Deployment Scripts

Use the provided scripts to deploy the MVP contracts to any configured network:

```bash
npx hardhat run scripts/deploy-module-registry.ts --network <networkName>
npx hardhat run scripts/deploy-track-registry.ts --network <networkName>
```

The scripts log the deployer account, target block, and initial totals so you can verify deployments quickly.

## Networks & Configuration

- Hardhat config (`hardhat.config.ts`) enables the Hardhat 3 + viem toolbox and ships with profiles for the default local chain, an OP-style simulation (`hardhatOp`), and Sepolia.
- For Sepolia deployments, set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` via environment variables or `npx hardhat keystore set`.

## Roadmap

The current MVP focuses on read/write registries with clean pagination. Next steps include learning badges, richer validation, and frontend helpers. Contributions are welcome—open an issue or PR if you want to extend Poky!***
