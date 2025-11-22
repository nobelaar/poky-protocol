import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { encodePacked, keccak256 } from "viem";

describe("ModuleProgress (commit-reveal)", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [author, learner, attacker, secondLearner] = await viem.getWalletClients();

  const deployModuleRegistry = () => viem.deployContract("ModuleRegistry");
  const deployModuleProgress = (registryAddress: `0x${string}`) =>
    viem.deployContract("ModuleProgress", [registryAddress]);

  type ModuleRegistryContract = Awaited<
    ReturnType<typeof deployModuleRegistry>
  >;
  type ModuleProgressContract = Awaited<
    ReturnType<typeof deployModuleProgress>
  >;

  let moduleRegistry: ModuleRegistryContract;
  let moduleProgress: ModuleProgressContract;
  const moduleId = 0n;
  const sectionCount = 2n;

  const saltFor = (input: string) =>
    keccak256(encodePacked(["string"], [input]));
  const providedHashFor = (answer: string) =>
    keccak256(encodePacked(["string"], [answer]));
  const commitmentFor = (answer: string, saltSeed: string) => {
    const providedHash = providedHashFor(answer);
    const salt = saltFor(saltSeed);
    const commitment = keccak256(
      encodePacked(["bytes32", "bytes32"], [providedHash, salt]),
    );
    return { providedHash, salt, commitment };
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

    moduleProgress = await deployModuleProgress(moduleRegistry.address);
  });

  it("records module completion with matching commitment reveals", async () => {
    const section0 = commitmentFor("4", "salt1");
    const section1 = commitmentFor("5", "salt2");
    await moduleProgress.write.setSectionCommitment(
      [moduleId, section0.commitment],
      { account: author.account },
    );
    await moduleProgress.write.setSectionCommitment(
      [moduleId, section1.commitment],
      { account: author.account },
    );

    const tx0 = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, section0.providedHash, section0.salt],
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
      [moduleId, 1n, section1.providedHash, section1.salt],
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
    const { commitment, salt } = commitmentFor("4", "salt1");
    await moduleProgress.write.setSectionCommitment([moduleId, commitment], {
      account: author.account,
    });

    const wrongHash = providedHashFor("wrong");
    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, wrongHash, salt],
        { account: learner.account },
      ),
      moduleProgress,
      "CommitmentMismatch",
    );
  });

  it("prevents reusing hash+salt combinations within a section", async () => {
    const section0 = commitmentFor("4", "salt1");
    await moduleProgress.write.setSectionCommitment([moduleId, section0.commitment], {
      account: author.account,
    });

    const tx = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, section0.providedHash, section0.salt],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, section0.providedHash, section0.salt],
        { account: secondLearner.account },
      ),
      moduleProgress,
      "CommitmentAlreadyUsed",
    );
  });

  it("requires module commitments to be published", async () => {
    const section0 = commitmentFor("4", "salt1");

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, section0.providedHash, section0.salt],
        { account: learner.account },
      ),
      moduleProgress,
      "CommitmentNotSet",
    );
  });

  it("prevents double completions", async () => {
    const section0 = commitmentFor("4", "salt1");
    await moduleProgress.write.setSectionCommitment([moduleId, section0.commitment], {
      account: author.account,
    });
    const tx = await moduleProgress.write.claimSectionCompletion(
      [moduleId, 0n, section0.providedHash, section0.salt],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimSectionCompletion(
        [moduleId, 0n, section0.providedHash, section0.salt],
        { account: learner.account },
      ),
      moduleProgress,
      "SectionAlreadyCompleted",
    );
  });

  it("only allows module authors to set commitments", async () => {
    const section0 = commitmentFor("secret", "salt");
    await viem.assertions.revertWithCustomError(
      moduleProgress.write.setSectionCommitment([moduleId, section0.commitment], {
        account: attacker.account,
      }),
      moduleProgress,
      "NotModuleAuthor",
    );
  });
});
