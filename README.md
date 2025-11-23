# Poky Protocol – Minimal Knowledge Registry

This repo hosts the first smart contracts for Poky, a minimal knowledge protocol where authors publish learning modules and bundle them into curated tracks. The stack uses **Hardhat 3**, the native `node:test` runner, and [`viem`](https://viem.sh/) for all contract interactions.


## Contracts

- `contracts/core/ModuleRegistry.sol` stores immutable metadata for learning modules (titles, descriptions, images, IPFS CIDs, authors, timestamps). IDs are the array index and events surface the author/IPFS pair.
- `contracts/core/TrackRegistry.sol` keeps higher-level learning tracks composed of ordered module IDs. Tracks require at least one module and also store the author + timestamp.
- `contracts/core/ModuleProgress.sol` stores section commitments for each module and validates learner proofs against those commitments before emitting `ModuleCompleted`.
- `contracts/core/LearningBadges.sol` mints soulbound badges for module or track completions once `ModuleProgress` shows every prerequisite is done (users mint their own badges; transfers are blocked; burning is opt-in).
- Structs live in `contracts/interfaces/Types.sol`; external-facing interfaces sit in `contracts/interfaces/IModuleRegistry.sol` and `contracts/interfaces/ITrackRegistry.sol`.

## Completion + Badge Flow

1. **Module + track creation:** authors register modules (and optional tracks).
2. **Publish commitments:** the module author records a commitment hash per section via `ModuleProgress.setSectionCommitment`. Each call registers the next section until reaching the module's `sectionCount`.
3. **Learner proves completion:** off-chain tooling produces a proof tied to the stored commitment and calls `claimModuleCompletion(moduleId, sectionId, proof)`.
4. **On-chain verification:** `ModuleProgress` builds the public inputs array from the stored commitment, calls the verifier, and records the proof hash to prevent replays before emitting `ModuleCompleted` once all sections are finished.
5. **Badge mint:** learners call `mintModuleBadge(msg.sender, moduleId)` or `mintTrackBadge(trackId)` from `LearningBadges`. The contract checks `ModuleProgress` state, prevents duplicates, and allows optional burns.

### Badge mint demo

After recording completions, learners can mint badges permissionlessly:

```bash
npx hardhat viem call LearningBadges mintModuleBadge --args "<yourAddress>" "<moduleId>"
npx hardhat viem call LearningBadges mintTrackBadge --args "<trackId>"
```

Both functions emit `ModuleBadgeMinted` / `TrackBadgeMinted` events and reuse the same soulbound supply counter.

## Tests 

TypeScript tests in `test/ModuleRegistry.test.ts` and `test/TrackRegistry.test.ts` rely on `node:test`, Hardhat’s viem helper, and viem assertions to cover:

- Sequential ID generation for modules and tracks.
- Metadata persistence (title, description/image/IPFS, authors, timestamps).
- Pagination helpers (`getModules`, `getTracks`) including overflows.
- Total counters.
- Custom-error reverts for invalid IDs and empty module arrays.
- `test/ModuleProgress.test.ts` checks the commitment + proof completion flow across multiple sections, verifier failures, reuse prevention, and author-only commitment publishing.
- `test/LearningBadges.test.ts` covers module and track badge minting, duplicate prevention, and burns on top of the proof-gated completions.

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
npx hardhat run scripts/deploy-mock-verifier.ts --network <networkName>
```

The scripts log the deployer account, target block, and initial totals so you can verify deployments quickly.

### Create a track from a JSON payload

Create modules that are missing and then register the track in one go by feeding a JSON file to `scripts/create-track.ts`.

Subsections that collect answers must provide salted hashes instead of plaintext solutions: `answerHash` for `SIMPLE_SELECTION` and `answersHash` for `MULTIPLE_SELECTION`, both as 32-byte hex strings. Use the `computeAnswersHash([...], "<salt>")` helper inside `scripts/create-track.ts` (or replicate it elsewhere) to derive the hashes with `keccak256(encodePacked(["uint256[]", "string"], [answers, salt]))`; the script rejects payloads that expose `answer`/`answers` directly.

Example payload (`track.json`) with sections/subsections. The script derives `sectionCount = sections.length` and sends only that value on-chain. You can provide `ipfsCid` directly or set `IPFS_API_URL` (+ optional `IPFS_API_TOKEN`) so `contentMdPath` uploads the Markdown blob to IPFS automatically:

```json
{
  "title": "Foundations",
  "moduleIds": [0, 1],
  "newModules": [
    {
      "title": "ZK 101",
      "description": "Intro to zero-knowledge proofs",
      "image": "ipfs://zk.png",
      "contentMdPath": "content/zk-101.md",
      "sections": [
        {
          "title": "Bienvenida",
          "subsections": [
            { "type": "INFO", "content": "¿Qué es un zkSNARK?" },
            {
              "type": "MULTIPLE_SELECTION",
              "content": "Selecciona las afirmaciones correctas",
              "options": [
                "Prueban conocimiento sin revelar secretos",
                "Requieren que el verificador revele su clave privada"
              ],
              "answersHash": "0x22fc2d2e64c0bc7311c787e74184b094478a1549fb06fc84ca57044ca9417d73"
            }
          ]
        },
        { "title": "Demo guiada", "subsections": [] }
      ]
    }
  ]
}
```

Run the script by passing registry addresses via flags or environment variables:

```bash
npx hardhat run scripts/create-track.ts --network <networkName> \
  --input track.json \
  --moduleRegistry <moduleRegistryAddress> \
  --trackRegistry <trackRegistryAddress>
```

The script validates existing module IDs, creates any additional modules from the JSON (logging the generated IDs), and finally submits the `createTrack` transaction with the full ordered list.

### Token basics example track (Spanish)

For a longer example focused on ERC-20/721 fundamentals—including introductory info plus multiple-selection quizzes—you can use `examples/token-basics-track.json` as the input file. It now ships with sections/subsections for every module, ready for the script to derive `sectionCount` automatically:

1. **Bienvenida y setup de billetera** – onboarding, safety reminders, and a quick install checklist.
2. **Fungibles vs no fungibles** – compares ERC-20 vs ERC-721/1155 with classification quizzes.
3. **Transferencias, approvals y gas** – covers allowances, transfer flows, and safe-sending checks.
4. **Buenas prácticas y riesgos** – security checklist with scenarios to spot phishing or excessive permissions.

Run it the same way as any JSON payload:

```bash
npx hardhat run scripts/create-track.ts --network <networkName> \
  --input examples/token-basics-track.json \
  --moduleRegistry <moduleRegistryAddress> \
  --trackRegistry <trackRegistryAddress>
```

### Answer commitments in example tracks

Example tracks now commit to quiz solutions instead of shipping plaintext answers. `examples/stablecoins-track.json` stores a
root-level `answerSalt` string and replaces `answer`/`answers` with `answerHash`/`answersHash` fields that were precomputed
off-chain. To reproduce a commitment, normalize the learner response with **NFKC**, trim it, collapse internal whitespace to a
single space, and lowercase the result. For single-selection quizzes, hash the normalized option text with
`keccak256(abi.encodePacked(normalizedAnswer, answerSalt))`; for multiple-selection quizzes, sort the zero-based option indices,
join them with commas (e.g. `0,1,3,4`), and hash that string with the same salt via `keccak256(abi.encodePacked(indexes, answerSalt))`.

Because only hashes are present, any consumer of the track JSON should treat `answerSalt` as the sole preimage hint and avoid
expecting clear-text solutions.

## Networks & Configuration

- Hardhat config (`hardhat.config.ts`) enables the Hardhat 3 + viem toolbox and ships with profiles for the default local chain, an OP-style simulation (`hardhatOp`), and Sepolia.
- For Sepolia deployments, set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` via environment variables or `npx hardhat keystore set`.
- To target Zircuit, configure `ZIRCUIT_RPC_URL` and `ZIRCUIT_PRIVATE_KEY` (environment variables or `npx hardhat keystore set`). Then run scripts with `--network zircuit`, for example:

  ```bash
  npx hardhat run scripts/deploy.ts --network zircuit
  npx hardhat run scripts/create-track.ts --network zircuit \
    --input examples/token-basics-track.json \
    --moduleRegistry <moduleRegistryAddress> \
    --trackRegistry <trackRegistryAddress>
  ```

## Roadmap

Next steps include hardening the commitment tooling (e.g. helper CLIs for deriving salts and preimages), adding optional ZK proof integrations, and integrating badge-aware frontends. Contributions are welcome—open an issue or PR if you want to extend Poky!***
