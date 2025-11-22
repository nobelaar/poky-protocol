import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { encodePacked, keccak256 } from "viem";

describe("ModuleProgress (ZK)", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [author, learner, attacker] = await viem.getWalletClients();

  const deployModuleRegistry = () => viem.deployContract("ModuleRegistry");
  const deployVerifier = () => viem.deployContract("MockGroth16Verifier");
  const deployModuleProgress = (
    registryAddress: `0x${string}`,
    verifierAddress: `0x${string}`,
  ) => viem.deployContract("ModuleProgress", [registryAddress, verifierAddress]);

  type ModuleRegistryContract = Awaited<
    ReturnType<typeof deployModuleRegistry>
  >;
  type MockVerifierContract = Awaited<ReturnType<typeof deployVerifier>>;
  type ModuleProgressContract = Awaited<
    ReturnType<typeof deployModuleProgress>
  >;

  let moduleRegistry: ModuleRegistryContract;
  let verifier: MockVerifierContract;
  let moduleProgress: ModuleProgressContract;
  const moduleId = 0n;

  const asUint = (address: `0x${string}`) => BigInt(address);

  const commitmentFor = (answer: string, salt: string) =>
    keccak256(encodePacked(["string", "string"], [answer, salt]));

  const defaultProof = (
    user: `0x${string}`,
    moduleIdParam: bigint,
    commitment: `0x${string}`,
  ) => {
    const a: [bigint, bigint] = [1n, 2n];
    const b: [[bigint, bigint], [bigint, bigint]] = [
      [3n, 4n],
      [5n, 6n],
    ];
    const c: [bigint, bigint] = [7n, 8n];
    const input = [
      asUint(user),
      moduleIdParam,
      BigInt(commitment),
    ];

    return { a, b, c, input };
  };

  const registerProof = async (proof: ReturnType<typeof defaultProof>) => {
    await verifier.write.setValidProof([
      proof.a,
      proof.b,
      proof.c,
      proof.input,
    ]);
  };

  beforeEach(async () => {
    moduleRegistry = await deployModuleRegistry();
    await moduleRegistry.write.createModule(
      ["Intro to Cryptography", "Hashes", "ipfs://module.png", "bafy-module"],
      { account: author.account },
    );

    verifier = await deployVerifier();
    moduleProgress = await deployModuleProgress(
      moduleRegistry.address,
      verifier.address,
    );
  });

  it("records module completion with a valid proof", async () => {
    const commitment = commitmentFor("4", "salt");
    await moduleProgress.write.setModuleCommitment(
      [moduleId, commitment],
      { account: author.account },
    );
    const proof = defaultProof(
      learner.account.address,
      moduleId,
      commitment,
    );
    await registerProof(proof);

    const txHash = await moduleProgress.write.claimModuleCompletion(
      [moduleId, proof.a, proof.b, proof.c, proof.input],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    assert.equal(
      await moduleProgress.read.hasCompletedModule([
        learner.account.address,
        moduleId,
      ]),
      true,
    );
  });

  it("rejects proofs if the Groth16 verifier returns false", async () => {
    const commitment = commitmentFor("4", "salt");
    await moduleProgress.write.setModuleCommitment(
      [moduleId, commitment],
      { account: author.account },
    );

    const proof = defaultProof(
      learner.account.address,
      moduleId,
      commitment,
    );

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion(
        [moduleId, proof.a, proof.b, proof.c, proof.input],
        { account: learner.account },
      ),
      moduleProgress,
      "InvalidProof",
    );
  });

  it("requires matching public inputs for user and module", async () => {
    const commitment = commitmentFor("4", "salt");
    await moduleProgress.write.setModuleCommitment(
      [moduleId, commitment],
      { account: author.account },
    );
    const proof = defaultProof(learner.account.address, moduleId, commitment);
    proof.input[0] = asUint(attacker.account.address);
    await registerProof(proof);

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion(
        [moduleId, proof.a, proof.b, proof.c, proof.input],
        { account: learner.account },
      ),
      moduleProgress,
      "InvalidPublicInputs",
    );
  });

  it("requires module commitments to be published", async () => {
    const proof = defaultProof(
      learner.account.address,
      moduleId,
      commitmentFor("4", "salt"),
    );
    await registerProof(proof);

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion(
        [moduleId, proof.a, proof.b, proof.c, proof.input],
        { account: learner.account },
      ),
      moduleProgress,
      "CommitmentNotSet",
    );
  });

  it("prevents double completions", async () => {
    const commitment = commitmentFor("4", "salt");
    await moduleProgress.write.setModuleCommitment(
      [moduleId, commitment],
      { account: author.account },
    );
    const proof = defaultProof(
      learner.account.address,
      moduleId,
      commitment,
    );
    await registerProof(proof);
    await moduleProgress.write.claimModuleCompletion(
      [moduleId, proof.a, proof.b, proof.c, proof.input],
      { account: learner.account },
    );

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion(
        [moduleId, proof.a, proof.b, proof.c, proof.input],
        { account: learner.account },
      ),
      moduleProgress,
      "AlreadyCompleted",
    );
  });

  it("only allows module authors to set commitments", async () => {
    const commitment = commitmentFor("secret", "salt");
    await viem.assertions.revertWithCustomError(
      moduleProgress.write.setModuleCommitment([moduleId, commitment], {
        account: attacker.account,
      }),
      moduleProgress,
      "NotModuleAuthor",
    );
  });
});
