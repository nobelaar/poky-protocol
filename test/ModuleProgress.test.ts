import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { encodePacked, keccak256 } from "viem";

describe("ModuleProgress (commit-reveal)", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [author, learner, attacker, secondLearner] = await viem.getWalletClients();

  const deployModuleRegistry = () => viem.deployContract("ModuleRegistry");
  const deployVerifier = () => viem.deployContract("MockVerifier");
  const deployModuleProgress = (
    registryAddress: `0x${string}`,
    verifier: `0x${string}`,
  ) => viem.deployContract("ModuleProgress", [registryAddress, verifier]);

  type ModuleRegistryContract = Awaited<
    ReturnType<typeof deployModuleRegistry>
  >;
  type ModuleProgressContract = Awaited<
    ReturnType<typeof deployModuleProgress>
  >;
  type VerifierContract = Awaited<ReturnType<typeof deployVerifier>>;

  let moduleRegistry: ModuleRegistryContract;
  let verifier: VerifierContract;
  let moduleProgress: ModuleProgressContract;
  const moduleId = 0n;
  const sectionCount = 2n;

  const commitmentFor = (label: string) =>
    keccak256(encodePacked(["string"], [label]));
  const proofFor = (label: string) =>
    encodePacked(["string"], [`proof-${label}`]);
  const registerProof = async (
    proof: `0x${string}`,
    commitment: `0x${string}`,
  ) => {
    await verifier.write.setValidProof([proof, [commitment]]);
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

  it("records module completion with matching commitment reveals", async () => {
    const section0 = commitmentFor("4");
    const section1 = commitmentFor("5");
    await moduleProgress.write.setSectionCommitment([moduleId, section0], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([moduleId, section1], {
      account: author.account,
    });
    const proof0 = proofFor("4");
    const proof1 = proofFor("5");
    await registerProof(proof0, section0);
    await registerProof(proof1, section1);

    const tx0 = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, proof0],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx0 });

    assert.equal(
      await moduleProgress.read.hasCompletedSection([
        learner.account.address,
        moduleId,
        0n,
      ]),
      true,
    );

    const tx1 = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 1n, proof1],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx1 });

    assert.equal(
      await moduleProgress.read.hasCompletedModule([
        learner.account.address,
        moduleId,
      ]),
      true,
    );
  });

  it("rejects mismatched preimages", async () => {
    const commitment = commitmentFor("4");
    await moduleProgress.write.setSectionCommitment([moduleId, commitment], {
      account: author.account,
    });

    const wrongProof = proofFor("wrong");
    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, wrongProof],
        { account: learner.account },
      ),
      moduleProgress,
      "InvalidProof",
    );
  });

  it("allows different users to reuse a section commitment", async () => {
    const section0 = commitmentFor("4");
    await moduleProgress.write.setSectionCommitment([moduleId, section0], {
      account: author.account,
    });
    const proof = proofFor("4");
    await registerProof(proof, section0);

    const tx = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, proof],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });

    const tx2 = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, proof],
      { account: secondLearner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx2 });

    assert.equal(
      await moduleProgress.read.hasCompletedSection([
        learner.account.address,
        moduleId,
        0n,
      ]),
      true,
    );

    assert.equal(
      await moduleProgress.read.hasCompletedSection([
        secondLearner.account.address,
        moduleId,
        0n,
      ]),
      true,
    );
  });

  it("requires module commitments to be published", async () => {
    const proof = proofFor("4");

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, proof],
        { account: learner.account },
      ),
      moduleProgress,
      "CommitmentNotSet",
    );
  });

  it("prevents double completions", async () => {
    const section0 = commitmentFor("4");
    await moduleProgress.write.setSectionCommitment([moduleId, section0], {
      account: author.account,
    });
    const proof = proofFor("4");
    await registerProof(proof, section0);
    const tx = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, proof],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, proof],
        { account: learner.account },
      ),
      moduleProgress,
      "SectionAlreadyCompleted",
    );
  });

  it("only allows module authors to set commitments", async () => {
    const section0 = commitmentFor("secret");
    await viem.assertions.revertWithCustomError(
      moduleProgress.write.setSectionCommitment([moduleId, section0], {
        account: attacker.account,
      }),
      moduleProgress,
      "NotModuleAuthor",
    );
  });
});
