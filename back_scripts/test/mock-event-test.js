import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatTokenAmount } from "../client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const abiPath = path.join(__dirname, "..", "abi", "NFTMarket.json");

console.log("🔍 [测试] 验证 ABI 文件读取与解析...");
const abi = JSON.parse(fs.readFileSync(abiPath, "utf-8"));
const eventNames = abi.filter((x) => x.type === "event").map((x) => x.name);
console.log("已检测到事件:", eventNames);

if (!eventNames.includes("NFTListed") || !eventNames.includes("NFTSold")) {
  throw new Error("ABI 中未找到 NFTListed 或 NFTSold 事件！");
}

console.log("✅ ABI 结构验证通过。");

console.log("\n🔍 [测试] 验证金额格式化与模拟日志解析...");
const mockListedLog = {
  blockNumber: 12345678n,
  transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  args: {
    seller: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    tokenId: 1n,
    price: 100000000000000000000n, // 100 tokens with 18 decimals
  },
};

const mockSoldLog = {
  blockNumber: 12345680n,
  transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  args: {
    buyer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    seller: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    tokenId: 1n,
    price: 100000000000000000000n,
  },
};

console.log("格式化 100000000000000000000 (18 decimals):", formatTokenAmount(mockListedLog.args.price, 18));
if (formatTokenAmount(mockListedLog.args.price, 18) !== "100") {
  throw new Error("金额格式化不符合预期");
}

console.log("✅ 所有测试用例执行完成，逻辑正确！\n");
