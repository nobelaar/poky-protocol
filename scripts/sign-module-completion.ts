import { network } from "hardhat";
import { encodePacked, hexToBytes, keccak256 } from "viem";

const args = process.argv.slice(2);

if (args.length < 4) {
  console.error(
    "Usage: npx hardhat run scripts/sign-module-completion.ts --network <network> <ModuleProgress> <LearnerAddress> <ModuleId> <Nonce>",
  );
  process.exit(1);
}

const [moduleProgressAddress, learnerAddress, moduleIdArg, nonceArg] = args;

const moduleId = BigInt(moduleIdArg);
const nonce = BigInt(nonceArg);

const { viem } = await network.connect();
const [signer] = await viem.getWalletClients();

const digest = keccak256(
  encodePacked(
    ["address", "address", "uint256", "uint256"],
    [
      moduleProgressAddress as `0x${string}`,
      learnerAddress as `0x${string}`,
      moduleId,
      nonce,
    ],
  ),
);

const signature = await signer.signMessage({
  account: signer.account,
  message: { raw: hexToBytes(digest) },
});

console.log("Signer:", signer.account.address);
console.log("ModuleProgress:", moduleProgressAddress);
console.log("Learner:", learnerAddress);
console.log("Module ID:", moduleId.toString());
console.log("Nonce:", nonce.toString());
console.log("Signature:", signature);
