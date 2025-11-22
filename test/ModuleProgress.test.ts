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
  const sectionCount = 2n;

  const asUint = (address: `0x${string}`) => BigInt(address);

  const commitmentFor = (answer: string, salt: string) =>
    keccak256(encodePacked(["string", "string"], [answer, salt]));

  const defaultProof = (
    user: `0x${string}`,
    moduleIdParam: bigint,
    sectionId: bigint,
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
      sectionId,
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
      [
        "Intro to Cryptography",
        "Hashes",
        "ipfs://module.png",
        "bafy-module",
        sectionCount,
      ],
      { account: author.account },
    );

    verifier = await deployVerifier();
    moduleProgress = await deployModuleProgress(
      moduleRegistry.address,
      verifier.address,
    );
  });

  it("records module completion with a valid proof", async () => {
    const commitment0 = commitmentFor("4", "salt");
    const commitment1 = commitmentFor("5", "salt");
    await moduleProgress.write.setSectionCommitment(
      [moduleId, commitment0],
      { account: author.account },
    );
    await moduleProgress.write.setSectionCommitment(
      [moduleId, commitment1],
      { account: author.account },
    );

    const proof0 = defaultProof(
      learner.account.address,
      moduleId,
      0n,
      commitment0,
    );
    await registerProof(proof0);
    const txHash0 = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, proof0.a, proof0.b, proof0.c, proof0.input],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash0 });

    assert.equal(
      await moduleProgress.read.hasCompletedSection([
        learner.account.address,
        moduleId,
        0n,
      ]),
      true,
    );

    const proof1 = defaultProof(
      learner.account.address,
      moduleId,
      1n,
      commitment1,
    );
    await registerProof(proof1);
    const txHash1 = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 1n, proof1.a, proof1.b, proof1.c, proof1.input],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash1 });

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
    await moduleProgress.write.setSectionCommitment(
      [moduleId, commitment],
      { account: author.account },
    );

    const proof = defaultProof(
      learner.account.address,
      moduleId,
      0n,
      commitment,
    );

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, proof.a, proof.b, proof.c, proof.input],
        { account: learner.account },
      ),
      moduleProgress,
      "InvalidProof",
    );
  });

  it("requires matching public inputs for user and module", async () => {
    const commitment = commitmentFor("4", "salt");
    await moduleProgress.write.setSectionCommitment(
      [moduleId, commitment],
      { account: author.account },
    );
    const proof = defaultProof(
      learner.account.address,
      moduleId,
      0n,
      commitment,
    );
    proof.input[0] = asUint(attacker.account.address);
    await registerProof(proof);

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, proof.a, proof.b, proof.c, proof.input],
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
      0n,
      commitmentFor("4", "salt"),
    );
    await registerProof(proof);

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, proof.a, proof.b, proof.c, proof.input],
        { account: learner.account },
      ),
      moduleProgress,
      "CommitmentNotSet",
    );
  });

  it("prevents double completions", async () => {
    const commitment = commitmentFor("4", "salt");
    await moduleProgress.write.setSectionCommitment(
      [moduleId, commitment],
      { account: author.account },
    );
    const proof = defaultProof(
      learner.account.address,
      moduleId,
      0n,
      commitment,
    );
    await registerProof(proof);
    await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, proof.a, proof.b, proof.c, proof.input],
      { account: learner.account },
    );

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, proof.a, proof.b, proof.c, proof.input],
        { account: learner.account },
      ),
      moduleProgress,
      "SectionAlreadyCompleted",
    );
  });

  it("only allows module authors to set commitments", async () => {
    const commitment = commitmentFor("secret", "salt");
    await viem.assertions.revertWithCustomError(
      moduleProgress.write.setSectionCommitment([moduleId, commitment], {
        account: attacker.account,
      }),
      moduleProgress,
      "NotModuleAuthor",
    );
  });
});
