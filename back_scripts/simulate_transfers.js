import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import {
  publicClient,
  createWallet,
  config,
  formatTokenAmount,
  parseTokenAmount,
} from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载 CalledToken ABI
const calledTokenAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, "abi", "CalledToken.json"), "utf-8")
);

const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

// 预设 5 个常用 Anvil 测试账户 (拥有默认 ETH 用于支付 Gas)
const accountNames = [
  "Alice (Account 0 / 部署者巨鲸)",
  "Bob (Account 1)",
  "Charlie (Account 2)",
  "David (Account 3)",
  "Eva (Account 4)",
];

export const ACCOUNTS = accountNames.map((name, index) => {
  const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
  return {
    name,
    account,
    address: account.address,
  };
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 查询指定账户的代币余额
 */
async function getBalance(address) {
  try {
    const bal = await publicClient.readContract({
      address: config.calledTokenAddress,
      abi: calledTokenAbi,
      functionName: "balanceOf",
      args: [address],
    });
    return bal;
  } catch (err) {
    console.error(`❌ 查询 ${address} 余额失败:`, err.message);
    return 0n;
  }
}

/**
 * 打印各账户当前余额表格
 */
async function printBalances(title = "当前各账户代币余额") {
  console.log(`\n📊 [${title}]`);
  console.log("----------------------------------------------------------------------");
  for (const acc of ACCOUNTS) {
    const bal = await getBalance(acc.address);
    console.log(`  ${acc.name.padEnd(30)} ${acc.address.slice(0, 10)}... | 余额: ${formatTokenAmount(bal)} 代币`);
  }
  console.log("----------------------------------------------------------------------\n");
}

/**
 * 执行普通 transfer
 */
async function doTransfer(fromAcc, toAddress, amountStr, toName = "") {
  const wallet = createWallet(fromAcc.account);
  const amountBig = parseTokenAmount(amountStr);

  console.log(`📤 [普通转账 transfer] ${fromAcc.name} ➡️ ${toName || toAddress}`);
  console.log(`   数量: ${amountStr} 代币`);

  const hash = await wallet.writeContract({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    functionName: "transfer",
    args: [toAddress, amountBig],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   ✅ 成功确认: 交易哈希 ${hash} (区块 #${receipt.blockNumber})\n`);
  return receipt;
}

/**
 * 执行授权代扣 approve + transferFrom
 */
async function doTransferFrom(ownerAcc, spenderAcc, toAddress, amountStr, toName = "") {
  const ownerWallet = createWallet(ownerAcc.account);
  const spenderWallet = createWallet(spenderAcc.account);
  const amountBig = parseTokenAmount(amountStr);

  console.log(`🔐 [授权 approve] ${ownerAcc.name} 授权给代理人 ${spenderAcc.name} 额度: ${amountStr} 代币`);
  const approveHash = await ownerWallet.writeContract({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    functionName: "approve",
    args: [spenderAcc.address, amountBig],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`   ✅ 授权成功 (交易哈希: ${approveHash})`);

  console.log(`🤝 [代理转账 transferFrom] 代理人 ${spenderAcc.name} 执行: 从 ${ownerAcc.name} 扣款 ➡️ 转给 ${toName || toAddress}`);
  const transferFromHash = await spenderWallet.writeContract({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    functionName: "transferFrom",
    args: [ownerAcc.address, toAddress, amountBig],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transferFromHash });
  console.log(`   ✅ 代理转账成功确认: 交易哈希 ${transferFromHash} (区块 #${receipt.blockNumber})\n`);
  return receipt;
}

/**
 * 执行 transferAndCall (无附加数据)
 */
async function doTransferAndCall(fromAcc, toAddress, amountStr, toName = "") {
  const wallet = createWallet(fromAcc.account);
  const amountBig = parseTokenAmount(amountStr);

  console.log(`📞 [回调转账 transferAndCall] ${fromAcc.name} ➡️ ${toName || toAddress}`);
  console.log(`   数量: ${amountStr} 代币 (若接收方为普通钱包地址则正常转账，不触发回调)`);

  const hash = await wallet.writeContract({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    functionName: "transferAndCall",
    args: [toAddress, amountBig],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   ✅ 成功确认: 交易哈希 ${hash} (区块 #${receipt.blockNumber})\n`);
  return receipt;
}

/**
 * 执行 transferAndCall (附带自定义 bytes 数据)
 */
async function doTransferAndCallWithData(fromAcc, toAddress, amountStr, dataHex = "0x123456", toName = "") {
  const wallet = createWallet(fromAcc.account);
  const amountBig = parseTokenAmount(amountStr);

  console.log(`📦 [附带数据回调转账 transferAndCall] ${fromAcc.name} ➡️ ${toName || toAddress}`);
  console.log(`   数量: ${amountStr} 代币, 附加数据: ${dataHex}`);

  const hash = await wallet.writeContract({
    address: config.calledTokenAddress,
    abi: calledTokenAbi,
    functionName: "transferAndCall",
    args: [toAddress, amountBig, dataHex],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   ✅ 成功确认: 交易哈希 ${hash} (区块 #${receipt.blockNumber})\n`);
  return receipt;
}

/**
 * 运行预设的完整模拟场景
 */
async function runBatchScenario() {
  console.log("========================================================");
  console.log("🚀 启动 CalledToken 转账全场景模拟流程");
  console.log("========================================================");
  console.log(`🪙 代币地址: ${config.calledTokenAddress}`);
  console.log(`🔌 RPC 节点: ${config.rpcUrl}`);
  console.log("--------------------------------------------------------");

  await printBalances("初始各账户余额");

  const [alice, bob, charlie, david, eva] = ACCOUNTS;

  // 场景 1: Alice 巨鲸向其他账户分发资金 (标准 transfer)
  console.log("🎬 === 场景 1: Alice 巨鲸向 Bob、Charlie、David 分发代币 (transfer) ===");
  await doTransfer(alice, bob.address, "1000", bob.name);
  await doTransfer(alice, charlie.address, "500", charlie.name);
  await doTransfer(alice, david.address, "200", david.name);

  // 场景 2: Bob 向 Eva 进行点对点转账 (标准 transfer)
  console.log("🎬 === 场景 2: Bob 向 Eva 转账 150 代币 (transfer) ===");
  await doTransfer(bob, eva.address, "150", eva.name);

  // 场景 3: 授权代理扣款 (approve + transferFrom)
  // Charlie 授权 100 代币给 David，由 David 将 80 代币转给 Eva
  console.log("🎬 === 场景 3: Charlie 授权 David，David 代理扣款转给 Eva (approve + transferFrom) ===");
  await doTransferFrom(charlie, david, eva.address, "80", eva.name);

  // 场景 4: transferAndCall 转账
  console.log("🎬 === 场景 4: Eva 使用 transferAndCall 向 Bob 转账 30 代币 ===");
  await doTransferAndCall(eva, bob.address, "30", bob.name);

  // 场景 5: transferAndCall 附带数据转账
  console.log("🎬 === 场景 5: David 使用 transferAndCall(带数据) 向 Charlie 转账 25 代币 ===");
  await doTransferAndCallWithData(david, charlie.address, "25", "0xdeadbeef", charlie.name);

  // 场景 6: 向随机新生成的外部测试地址小额空投 (转给陌生地址)
  const randomPrivateKey = generatePrivateKey();
  const randomAccount = privateKeyToAccount(randomPrivateKey);
  console.log(`🎬 === 场景 6: Bob 向一个随机外部地址空投 10 代币 ===`);
  console.log(`   随机目标地址: ${randomAccount.address}`);
  await doTransfer(bob, randomAccount.address, "10", "外部随机钱包");

  await printBalances("场景执行完毕后各账户余额");

  console.log("========================================================");
  console.log("🎉 所有模拟转账场景执行完成！");
  console.log("👉 您可以在已启动的 indexer 服务终端中观察到这些 Transfer 事件。");
  console.log("👉 您也可以调用 RESTful API 查看记录:");
  console.log(`   curl http://localhost:${config.port}/api/transfers/${bob.address}`);
  console.log(`   curl http://localhost:${config.port}/api/transfers/${eva.address}?direction=in`);
  console.log("========================================================\n");
}

/**
 * 持续循环随机转账模式（用于长期联调与监控展示）
 */
async function runLoopMode(intervalSeconds = 3) {
  console.log("========================================================");
  console.log(`🔄 启动持续随机转账模式 (每隔 ${intervalSeconds} 秒随机生成一笔转账)`);
  console.log("按下 Ctrl+C 停止运行...");
  console.log("========================================================\n");

  let counter = 1;

  while (true) {
    try {
      // 随机挑选两个不同账户
      const fromIdx = Math.floor(Math.random() * ACCOUNTS.length);
      let toIdx = Math.floor(Math.random() * ACCOUNTS.length);
      while (toIdx === fromIdx) {
        toIdx = Math.floor(Math.random() * ACCOUNTS.length);
      }

      const fromAcc = ACCOUNTS[fromIdx];
      const toAcc = ACCOUNTS[toIdx];

      // 检查余额，若发送方不足则由 Alice (巨鲸) 补充
      const bal = await getBalance(fromAcc.address);
      const randomAmountNum = (Math.random() * 20 + 1).toFixed(2); // 1 ~ 21 代币

      if (bal < parseTokenAmount(randomAmountNum)) {
        if (fromAcc.address !== ACCOUNTS[0].address) {
          console.log(`⚠️ ${fromAcc.name} 余额不足，巨鲸 Alice 为其补充 500 代币...`);
          await doTransfer(ACCOUNTS[0], fromAcc.address, "500", fromAcc.name);
        }
      }

      const transferTypes = ["transfer", "transferAndCall", "transferFrom"];
      const chosenType = transferTypes[Math.floor(Math.random() * transferTypes.length)];

      console.log(`🎲 [第 ${counter} 笔随机交易 - 方式: ${chosenType}]`);
      if (chosenType === "transfer") {
        await doTransfer(fromAcc, toAcc.address, randomAmountNum, toAcc.name);
      } else if (chosenType === "transferAndCall") {
        await doTransferAndCall(fromAcc, toAcc.address, randomAmountNum, toAcc.name);
      } else {
        // 第三方协助转账
        const thirdAcc = ACCOUNTS[(fromIdx + 1) % ACCOUNTS.length];
        await doTransferFrom(fromAcc, thirdAcc, toAcc.address, randomAmountNum, toAcc.name);
      }

      counter++;
      await sleep(intervalSeconds * 1000);
    } catch (err) {
      console.error("❌ 循环转账异常:", err.message);
      await sleep(2000);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isLoop = args.includes("--loop") || args.includes("-l");
  const intervalArg = args.find((a) => a.startsWith("--interval="));
  const interval = intervalArg ? parseInt(intervalArg.split("=")[1], 10) : 3;

  if (isLoop) {
    await runLoopMode(interval);
  } else {
    await runBatchScenario();
  }
}

main().catch((err) => {
  console.error("❌ 执行模拟脚本失败:", err);
  process.exit(1);
});
