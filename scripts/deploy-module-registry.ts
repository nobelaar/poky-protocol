import { network } from "hardhat";

const { viem } = await network.connect();

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

console.log("Deploying ModuleRegistry from", deployer.account.address);

const moduleRegistry = await viem.deployContract("ModuleRegistry");
const latestBlock = await publicClient.getBlockNumber();

console.log("ModuleRegistry deployed to:", moduleRegistry.address);
console.log("Deployment block:", latestBlock.toString());
console.log(
  "Initial total modules:",
  (await moduleRegistry.read.totalModules()).toString(),
);
