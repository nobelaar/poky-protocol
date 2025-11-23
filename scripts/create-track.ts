import fs from "node:fs/promises";
import path from "node:path";

import { network } from "hardhat";
import { create as createIpfsClient, type IPFSHTTPClient } from "ipfs-http-client";
import {
  encodePacked,
  keccak256,
  isAddress,
  type Address,
} from "viem";

type SubsectionType = "INFO" | "SIMPLE_SELECTION" | "MULTIPLE_SELECTION";

type SubsectionInput = {
  title?: string;
  type: SubsectionType;
  content: string;
  options?: string[];
  answerHash?: string;
  answersHash?: string;
};

type SectionInput = {
  title: string;
  subsections?: SubsectionInput[];
};

type NewModuleInput = {
  title: string;
  description: string;
  image: string;
  ipfsCid?: string;
  contentMdPath?: string;
  sections: SectionInput[];
};

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
  newModules?: NewModuleInput[];
};

type Addresses = {
  moduleRegistry: Address;
  trackRegistry: Address;
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

  if (!isAddress(moduleRegistry)) {
    throw new Error("Invalid moduleRegistry address.");
  }
  if (!isAddress(trackRegistry)) {
    throw new Error("Invalid trackRegistry address.");
  }

  return {
    moduleRegistry,
    trackRegistry,
  };
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

const HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

const computeAnswersHash = (answers: number | number[], salt: string) => {
  const answersArray = Array.isArray(answers) ? answers : [answers];
  if (
    !Array.isArray(answersArray) ||
    answersArray.length === 0 ||
    answersArray.some(
      (value) =>
        !Number.isInteger(value) || Number.isNaN(value) || value < 0 || !Number.isSafeInteger(value),
    )
  ) {
    throw new Error("answers must be a non-empty array of non-negative integers");
  }

  if (typeof salt !== "string" || salt.trim() === "") {
    throw new Error("salt must be a non-empty string to derive an answers hash");
  }

  const normalizedAnswers = answersArray.map((value) => BigInt(value));

  return keccak256(
    encodePacked(["uint256[]", "string"], [normalizedAnswers, salt]),
  );
};

export { computeAnswersHash };

const ensureHash = (value: string | undefined, path: string) => {
  if (!value || typeof value !== "string" || !HASH_REGEX.test(value)) {
    throw new Error(`${path} must be a 0x-prefixed 32-byte hex hash`);
  }
};

const ensureOptions = (
  subsection: SubsectionInput,
  moduleIndex: number,
  sectionIndex: number,
  subsectionIndex: number,
) => {
  if (!Array.isArray(subsection.options) || subsection.options.length === 0) {
    throw new Error(
      `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].options must be a non-empty string array for ${subsection.type}`,
    );
  }

  subsection.options.forEach((option, optionIndex) => {
    if (typeof option !== "string" || option.trim() === "") {
      throw new Error(
        `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].options[${optionIndex}] must be a non-empty string`,
      );
    }
  });
};

const assertNoPlainAnswers = (
  subsection: SubsectionInput,
  moduleIndex: number,
  sectionIndex: number,
  subsectionIndex: number,
) => {
  if ("answer" in subsection || "answers" in subsection) {
    throw new Error(
      `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}] contains plaintext answers. Provide answerHash/answersHash instead (derive them with computeAnswersHash([...], "<salt>") and remove the plaintext fields).`,
    );
  }
};

const validateSubsections = (
  subsections: SubsectionInput[] | undefined,
  moduleIndex: number,
  sectionIndex: number,
) => {
  if (!subsections) return [] as SubsectionInput[];

  return subsections.map((subsection, subsectionIndex) => {
    if (!subsection.content || typeof subsection.content !== "string") {
      throw new Error(
        `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].content must be a non-empty string`,
      );
    }

    assertNoPlainAnswers(subsection, moduleIndex, sectionIndex, subsectionIndex);

    if (
      subsection.type !== "INFO" &&
      subsection.type !== "SIMPLE_SELECTION" &&
      subsection.type !== "MULTIPLE_SELECTION"
    ) {
      throw new Error(
        `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].type must be INFO, SIMPLE_SELECTION or MULTIPLE_SELECTION`,
      );
    }

    if (
      subsection.type === "MULTIPLE_SELECTION" ||
      subsection.type === "SIMPLE_SELECTION"
    ) {
      ensureOptions(subsection, moduleIndex, sectionIndex, subsectionIndex);
      if (subsection.type === "SIMPLE_SELECTION") {
        if (subsection.answersHash) {
          throw new Error(
            `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].answersHash is not valid for SIMPLE_SELECTION. Use answerHash instead.`,
          );
        }
        ensureHash(
          subsection.answerHash,
          `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].answerHash`,
        );
      } else {
        if (subsection.answerHash) {
          throw new Error(
            `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].answerHash is not valid for MULTIPLE_SELECTION. Use answersHash instead.`,
          );
        }
        ensureHash(
          subsection.answersHash,
          `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].answersHash`,
        );
      }
    } else if (subsection.options) {
      throw new Error(
        `newModules[${moduleIndex}].sections[${sectionIndex}].subsections[${subsectionIndex}].options is only allowed for SIMPLE_SELECTION or MULTIPLE_SELECTION subsections`,
      );
    }

    return subsection;
  });
};

const validateSections = (
  sections: SectionInput[],
  moduleIndex: number,
) => {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error(
      `newModules[${moduleIndex}].sections must be a non-empty array of sections`,
    );
  }

  return sections.map((section, sectionIndex) => {
    if (!section.title || typeof section.title !== "string") {
      throw new Error(
        `newModules[${moduleIndex}].sections[${sectionIndex}].title must be a non-empty string`,
      );
    }

    return {
      ...section,
      subsections: validateSubsections(
        section.subsections,
        moduleIndex,
        sectionIndex,
      ),
    };
  });
};

const createIpfsClientFromEnv = (): IPFSHTTPClient | undefined => {
  const ipfsApi = process.env.IPFS_API_URL;
  if (!ipfsApi) return undefined;

  const authToken = process.env.IPFS_API_TOKEN;
  const headers = authToken ? { authorization: `Bearer ${authToken}` } : undefined;

  return createIpfsClient({ url: ipfsApi, headers });
};

const uploadMdToIpfs = async (
  ipfsClient: IPFSHTTPClient,
  mdPath: string,
  moduleIndex: number,
) => {
  const resolvedPath = path.resolve(process.cwd(), mdPath);
  const content = await fs.readFile(resolvedPath);

  const { cid } = await ipfsClient.add(content);
  const cidString = cid.toString();
  console.log(
    `Uploaded Markdown for newModules[${moduleIndex}] to IPFS (${cidString}) from ${resolvedPath}`,
  );
  return cidString;
};

const normalizeNewModules = async (
  newModules: NewModuleInput[] | undefined,
  ipfsClient: IPFSHTTPClient | undefined,
) => {
  if (!newModules) return [] as NewModuleMetadata[];

  const results: NewModuleMetadata[] = [];
  for (const [index, module] of newModules.entries()) {
    for (const key of ["title", "description", "image", "sections"] as const) {
      if ((module as any)[key] === undefined) {
        throw new Error(`newModules[${index}] is missing ${key}`);
      }
    }

    const validatedSections = validateSections(module.sections, index);
    const sectionCount = validatedSections.length;
    if (!Number.isInteger(sectionCount) || sectionCount <= 0) {
      throw new Error(
        `newModules[${index}].sections must contain at least one section to derive sectionCount`,
      );
    }

    let ipfsCid = module.ipfsCid;
    if (!ipfsCid && module.contentMdPath) {
      if (!ipfsClient) {
        throw new Error(
          `IPFS upload requested for newModules[${index}] but IPFS_API_URL is not set`,
        );
      }

      ipfsCid = await uploadMdToIpfs(ipfsClient, module.contentMdPath, index);
    }

    if (!ipfsCid) {
      throw new Error(
        `newModules[${index}] requires an ipfsCid or a contentMdPath + IPFS_API_URL to upload content`,
      );
    }

    results.push({
      title: module.title,
      description: module.description,
      image: module.image,
      ipfsCid,
      sectionCount,
    });
  }

  return results;
};

const logDivider = () => console.log("-----------------------------");

const main = async () => {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const input = await readTrackFile();
  const moduleIds = normalizeModuleIds(input.moduleIds);
  const ipfsClient = createIpfsClientFromEnv();
  const newModules = await normalizeNewModules(input.newModules, ipfsClient);
  const addresses = loadAddresses();

  console.log("Network:", connection.networkName);
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

  const totalBefore = (await moduleRegistry.read.totalModules()) as bigint;
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
    const newTotal = (await moduleRegistry.read.totalModules()) as bigint;
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

  const totalAfter = (await moduleRegistry.read.totalModules()) as bigint;
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
  const totalTracks = (await trackRegistry.read.totalTracks()) as bigint;
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
