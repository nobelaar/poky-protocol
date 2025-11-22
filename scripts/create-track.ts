import fs from "node:fs/promises";
import path from "node:path";

import { network } from "hardhat";

type NewModuleMetadata = {
  title: string;
  description: string;
  image: string;
  ipfsCid: string;
  sectionCount: number;
};

type TrackInput = {
  title: string;
  moduleIds?: (number | bigint)[];
  newModules?: NewModuleMetadata[];
};

type Addresses = {
  moduleRegistry: string;
  trackRegistry: string;
};

const getArgValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }

  return process.argv[index + 1];
};

const loadAddresses = (): Addresses => {
  const moduleRegistry =
    getArgValue("--moduleRegistry") ?? process.env.MODULE_REGISTRY_ADDRESS;
  const trackRegistry =
    getArgValue("--trackRegistry") ?? process.env.TRACK_REGISTRY_ADDRESS;

  if (!moduleRegistry || !trackRegistry) {
    throw new Error(
      "Addresses required. Use --moduleRegistry/--trackRegistry or set MODULE_REGISTRY_ADDRESS/TRACK_REGISTRY_ADDRESS env vars.",
    );
  }

  return { moduleRegistry, trackRegistry };
};

const readTrackFile = async (): Promise<TrackInput> => {
  const inputPath = getArgValue("--input") ?? getArgValue("-i");
  if (!inputPath) {
    throw new Error("Input JSON required. Pass it with --input <filePath>.");
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath);
  const raw = await fs.readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw) as TrackInput;

  if (!parsed.title || typeof parsed.title !== "string") {
    throw new Error("JSON must include a track title (string).");
  }

  return parsed;
};

const normalizeModuleIds = (moduleIds: (number | bigint)[] | undefined) => {
  if (!moduleIds) return [] as bigint[];

  return moduleIds.map((id, index) => {
    const asNumber = typeof id === "bigint" ? Number(id) : id;
    if (!Number.isInteger(asNumber)) {
      throw new Error(`moduleIds[${index}] must be an integer.`);
    }

    return BigInt(asNumber);
  });
};

const normalizeNewModules = (newModules: NewModuleMetadata[] | undefined) => {
  if (!newModules) return [] as NewModuleMetadata[];

  return newModules.map((module, index) => {
    for (const key of [
      "title",
      "description",
      "image",
      "ipfsCid",
      "sectionCount",
    ] as const) {
      if ((module as any)[key] === undefined) {
        throw new Error(`newModules[${index}] is missing ${key}`);
      }
    }

    if (!Number.isInteger(module.sectionCount) || module.sectionCount <= 0) {
      throw new Error(
        `newModules[${index}].sectionCount must be a positive integer.`,
      );
    }

    return module;
  });
};

const logDivider = () => console.log("-----------------------------");

const main = async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const input = await readTrackFile();
  const moduleIds = normalizeModuleIds(input.moduleIds);
  const newModules = normalizeNewModules(input.newModules);
  const addresses = loadAddresses();

  console.log("Network:", network.name);
  console.log("Deployer:", deployer.account.address);
  console.log("ModuleRegistry:", addresses.moduleRegistry);
  console.log("TrackRegistry:", addresses.trackRegistry);
  logDivider();

  const moduleRegistry = await viem.getContractAt(
    "ModuleRegistry",
    addresses.moduleRegistry,
  );
  const trackRegistry = await viem.getContractAt(
    "TrackRegistry",
    addresses.trackRegistry,
  );

  const totalBefore = await moduleRegistry.read.totalModules();
  console.log("Existing modules before script:", totalBefore.toString());

  moduleIds.forEach((id, index) => {
    if (id >= totalBefore) {
      throw new Error(
        `moduleIds[${index}] = ${id.toString()} does not exist on-chain.`,
      );
    }
  });

  const createdModuleIds: bigint[] = [];
  for (const [index, module] of newModules.entries()) {
    console.log(`Creating module ${index + 1}/${newModules.length}:`, {
      title: module.title,
      ipfsCid: module.ipfsCid,
      sectionCount: module.sectionCount,
    });

    const txHash = await moduleRegistry.write.createModule(
      [
        module.title,
        module.description,
        module.image,
        module.ipfsCid,
        BigInt(module.sectionCount),
      ],
      { account: deployer.account },
    );

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const newTotal = await moduleRegistry.read.totalModules();
    const createdId = newTotal - 1n;

    createdModuleIds.push(createdId);
    console.log(
      `  → Module created with id ${createdId.toString()} (tx: ${txHash}, block: ${receipt.blockNumber})`,
    );
  }

  const finalModuleIds = [...moduleIds, ...createdModuleIds];
  if (finalModuleIds.length === 0) {
    throw new Error("No module ids provided and no new modules created.");
  }

  const totalAfter = await moduleRegistry.read.totalModules();
  finalModuleIds.forEach((id, index) => {
    if (id >= totalAfter) {
      throw new Error(
        `final moduleIds[${index}] = ${id.toString()} does not exist after creation steps.`,
      );
    }
  });

  logDivider();
  console.log("Track payload:");
  console.log("  Title:", input.title);
  console.log("  Module IDs:", finalModuleIds.map((id) => id.toString()).join(", "));

  const trackTxHash = await trackRegistry.write.createTrack(
    [input.title, finalModuleIds],
    { account: deployer.account },
  );
  const trackReceipt = await publicClient.waitForTransactionReceipt({
    hash: trackTxHash,
  });
  const totalTracks = await trackRegistry.read.totalTracks();
  const trackId = totalTracks - 1n;

  logDivider();
  console.log("Track created successfully:");
  console.log("  Track ID:", trackId.toString());
  console.log("  Tx hash:", trackTxHash);
  console.log("  Block:", trackReceipt.blockNumber?.toString());
  console.log("  Final module order:",
    finalModuleIds.map((id) => id.toString()).join(", "));
};

main().catch((error) => {
  console.error("Script failed:", error);
  process.exitCode = 1;
});
