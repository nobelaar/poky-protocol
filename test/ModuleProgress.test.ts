import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { encodePacked, hexToBytes, keccak256 } from "viem";

describe("ModuleProgress", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [author, learner, attacker] = await viem.getWalletClients();

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

  beforeEach(async () => {
    moduleRegistry = await deployModuleRegistry();
    await moduleRegistry.write.createModule(
      ["Intro to Cryptography", "Hashes", "ipfs://module.png", "bafy-module"],
      { account: author.account },
    );

    moduleProgress = await deployModuleProgress(moduleRegistry.address);
  });

  const signCompletion = async (
    userAddress: `0x${string}`,
    moduleId: bigint,
    nonce: bigint,
    signer = author,
  ) => {
    const digest = keccak256(
      encodePacked(
        ["address", "address", "uint256", "uint256"],
        [moduleProgress.address, userAddress, moduleId, nonce],
      ),
    );

    return signer.signMessage({
      account: signer.account,
      message: { raw: hexToBytes(digest) },
    });
  };

  it("records module completion with a valid author signature", async () => {
    const moduleId = 0n;
    const nonce = 1n;
    const signature = await signCompletion(
      learner.account.address,
      moduleId,
      nonce,
    );

    const txHash = await moduleProgress.write.claimModuleCompletion(
      [moduleId, nonce, signature],
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

  it("rejects signatures from non-authors", async () => {
    const signature = await signCompletion(
      learner.account.address,
      0n,
      777n,
      attacker,
    );

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion([0n, 777n, signature], {
        account: learner.account,
      }),
      moduleProgress,
      "InvalidSignature",
    );
  });

  it("prevents replaying the same signature hash", async () => {
    const nonce = 42n;
    const signature = await signCompletion(
      learner.account.address,
      0n,
      nonce,
    );

    const firstTx = await moduleProgress.write.claimModuleCompletion(
      [0n, nonce, signature],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: firstTx });

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion([0n, nonce, signature], {
        account: learner.account,
      }),
      moduleProgress,
      "SignatureAlreadyUsed",
    );
  });

  it("blocks double completion even with fresh signatures", async () => {
    const firstSignature = await signCompletion(
      learner.account.address,
      0n,
      1n,
    );
    const firstTx = await moduleProgress.write.claimModuleCompletion(
      [0n, 1n, firstSignature],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: firstTx });

    const secondSignature = await signCompletion(
      learner.account.address,
      0n,
      2n,
    );

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion([0n, 2n, secondSignature], {
        account: learner.account,
      }),
      moduleProgress,
      "AlreadyCompleted",
    );
  });

  it("bubbles ModuleNotFound when claiming non-existent modules", async () => {
    const signature = await signCompletion(
      learner.account.address,
      5n,
      9n,
    );

    await viem.assertions.revertWithCustomError(
      moduleProgress.write.claimModuleCompletion([5n, 9n, signature], {
        account: learner.account,
      }),
      moduleRegistry,
      "ModuleNotFound",
    );
  });
});
