import { network } from "hardhat";

const { viem } = await network.connect();
const [deployer] = await viem.getWalletClients();

console.log("Deploying MockGroth16Verifier from", deployer.account.address);

const verifier = await viem.deployContract("MockGroth16Verifier");

console.log("MockGroth16Verifier deployed at", verifier.address);
