import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";

describe("ModuleRegistry", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, secondary] = await viem.getWalletClients();

  const deployModuleRegistry = () => viem.deployContract("ModuleRegistry");
  type ModuleRegistryContract = Awaited<
    ReturnType<typeof deployModuleRegistry>
  >;

  let moduleRegistry: ModuleRegistryContract;

  beforeEach(async () => {
    moduleRegistry = await deployModuleRegistry();
  });

  const createModule = async (options?: {
    title?: string;
    description?: string;
    image?: string;
    ipfsCid?: string;
    author?: typeof deployer.account;
  }) => {
    const args = {
      title: options?.title ?? "ZK 101",
      description: options?.description ?? "Intro to zero-knowledge",
      image: options?.image ?? "ipfs://module.png",
      ipfsCid: options?.ipfsCid ?? "bafy-module",
    };

    const txHash = await moduleRegistry.write.createModule(
      [args.title, args.description, args.image, args.ipfsCid],
      { account: options?.author ?? deployer.account },
    );

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const total = await moduleRegistry.read.totalModules();
    return total - 1n;
  };

  it("stores full metadata when creating a module", async () => {
    const metadata = {
      title: "Eigen Layer Basics",
      description: "How restaking works",
      image: "ipfs://image.png",
      ipfsCid: "bafy-image",
    };

    const txHash = await moduleRegistry.write.createModule(
      [metadata.title, metadata.description, metadata.image, metadata.ipfsCid],
      { account: deployer.account },
    );

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    const block = await publicClient.getBlock({
      blockNumber: receipt.blockNumber,
    });

    const module = await moduleRegistry.read.getModule([0n]);

    assert.equal(module.title, metadata.title);
    assert.equal(module.description, metadata.description);
    assert.equal(module.image, metadata.image);
    assert.equal(module.ipfsCid, metadata.ipfsCid);
    assert.equal(
      module.author.toLowerCase(),
      deployer.account.address.toLowerCase(),
    );
    assert.equal(module.createdAt, block.timestamp);
  });

  it("returns incremental module ids", async () => {
    const firstId = await createModule({
      title: "First Module",
    });
    const secondId = await createModule({
      title: "Second Module",
      author: secondary.account,
    });

    assert.equal(firstId, 0n);
    assert.equal(secondId, 1n);

    const first = await moduleRegistry.read.getModule([firstId]);
    const second = await moduleRegistry.read.getModule([secondId]);

    assert.equal(first.id, 0n);
    assert.equal(second.id, 1n);
  });

  it("exposes stored modules via getModule", async () => {
    const moduleId = await createModule({ title: "Stored Module" });

    const stored = await moduleRegistry.read.getModule([moduleId]);

    assert.equal(stored.title, "Stored Module");
  });

  it("tracks the total number of modules", async () => {
    assert.equal(await moduleRegistry.read.totalModules(), 0n);

    await createModule({ title: "Module A" });
    await createModule({ title: "Module B" });

    assert.equal(await moduleRegistry.read.totalModules(), 2n);
  });

  it("paginates modules with getModules", async () => {
    const titles = ["Alpha", "Beta", "Gamma", "Delta"];
    for (const title of titles) {
      await createModule({ title });
    }

    const page = await moduleRegistry.read.getModules([1n, 2n]);
    const pageTitles = page.map((module: any) => module.title);

    assert.deepEqual(pageTitles, ["Beta", "Gamma"]);
  });

  it("accepts ranges larger than the collection when paginating", async () => {
    const titles = ["Alpha", "Beta", "Gamma"];
    for (const title of titles) {
      await createModule({ title });
    }

    const page = await moduleRegistry.read.getModules([2n, 5n]);
    const pageTitles = page.map((module: any) => module.title);

    assert.deepEqual(pageTitles, ["Gamma"]);
  });

  it("reverts when fetching a module with an invalid id", async () => {
    await viem.assertions.revertWithCustomError(
      moduleRegistry.read.getModule([0n]),
      moduleRegistry,
      "ModuleNotFound",
    );
  });
});
