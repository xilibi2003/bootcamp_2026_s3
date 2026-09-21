import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseUnits,
  isAddress,
  formatUnits,
} from "viem";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log("=== 开始运行 erc20Tool 自动化测试 ===");

  const TOKEN_ADDRESS = "0x55f2ef375b1d34a630f8616063bc25f566ce33d8";
  const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  // 测试 1: 验证 Token 合约元数据
  console.log("[测试 1] 验证 Sepolia 上 ERC20 合约元数据...");
  const abi = [
    { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
    { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
    { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
    {
      type: "function",
      name: "transfer",
      inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
      outputs: [{ type: "bool" }],
      stateMutability: "nonpayable",
    },
  ];

  const [name, symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: TOKEN_ADDRESS, abi, functionName: "name" }),
    publicClient.readContract({ address: TOKEN_ADDRESS, abi, functionName: "symbol" }),
    publicClient.readContract({ address: TOKEN_ADDRESS, abi, functionName: "decimals" }),
  ]);

  assert.strictEqual(typeof name, "string");
  assert.strictEqual(symbol, "MTK");
  assert.strictEqual(decimals, 18);
  console.log(`  ✓ 代币名称: ${name}, 符号: ${symbol}, 精度: ${decimals}`);

  // 测试 2: 验证私钥与账户派生
  console.log("[测试 2] 验证账户创建与地址派生...");
  const privKey = generatePrivateKey();
  assert.ok(privKey.startsWith("0x"));
  assert.strictEqual(privKey.length, 66);
  const account = privateKeyToAccount(privKey);
  assert.ok(isAddress(account.address));
  console.log(`  ✓ 成功派生有效地址: ${account.address}`);

  // 测试 3: 验证 EIP-1559 离线签名构造
  console.log("[测试 3] 验证 EIP-1559 转账交易构建与私钥签名...");
  const toAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const amount = parseUnits("5.5", 18);

  const callData = encodeFunctionData({
    abi,
    functionName: "transfer",
    args: [toAddress, amount],
  });
  assert.ok(callData.startsWith("0xa9059cbb"));

  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  const fees = await publicClient.estimateFeesPerGas();

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const txRequest = {
    account,
    chain: sepolia,
    to: TOKEN_ADDRESS,
    data: callData,
    value: 0n,
    nonce,
    gas: 65000n,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    type: "eip1559",
  };

  const serializedTx = await walletClient.signTransaction(txRequest);
  assert.ok(serializedTx.startsWith("0x02"), "EIP-1559 交易类型标识符应为 0x02 开头");
  console.log(`  ✓ 成功签名 EIP-1559 交易, 数据长度: ${serializedTx.length} 字节`);

  console.log("\n🎉 erc20Tool 所有单元测试全部通过！");
}

runTests().catch((err) => {
  console.error("❌ 测试失败:", err);
  process.exit(1);
});
