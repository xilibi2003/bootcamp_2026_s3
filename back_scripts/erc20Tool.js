#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  formatUnits,
  parseUnits,
  formatGwei,
  formatEther,
  encodeFunctionData,
} from "viem";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, ".env") });

// 配置信息
const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const TOKEN_ADDRESS = (process.env.SEPOLIA_TOKEN_ADDRESS || "0x55f2ef375b1d34a630f8616063bc25f566ce33d8").toLowerCase();
const WALLET_FILE_PATH = path.resolve(__dirname, "data/wallet.json");

// ERC20 标准 ABI
const ERC20_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

// 创建 Sepolia Public Client
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

/**
 * 确保目录存在
 */
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 持久化保存钱包信息
 */
function saveWallet(data) {
  ensureDir(WALLET_FILE_PATH);
  fs.writeFileSync(WALLET_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

/**
 * 读取本地钱包信息
 */
function loadWallet() {
  if (!fs.existsSync(WALLET_FILE_PATH)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(WALLET_FILE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 获取 ERC20 代币元数据 (名称、符号、精度)
 */
async function getTokenMetadata() {
  try {
    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "name",
      }).catch(() => "Unknown Token"),
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "symbol",
      }).catch(() => "TOKEN"),
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "decimals",
      }).catch(() => 18),
    ]);

    return { name, symbol, decimals: Number(decimals) };
  } catch (err) {
    return { name: "ERC20 Token", symbol: "TOKEN", decimals: 18 };
  }
}

/**
 * 1. createAccount 命令：生成私钥并保存
 */
async function handleCreateAccount() {
  console.log("\n==========================================");
  console.log("          生成新账户 (createAccount)       ");
  console.log("==========================================");

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const walletData = {
    address: account.address,
    privateKey,
    createdAt: new Date().toISOString(),
    network: "sepolia",
    chainId: sepolia.id,
  };

  saveWallet(walletData);

  console.log(`\n  账户已生成并安全保存到: ${path.relative(process.cwd(), WALLET_FILE_PATH)}`);
  console.log(`  以太坊地址 (Address)   : ${account.address}`);
  console.log(`  账户私钥   (PrivateKey): ${privateKey}`);
  console.log(`  当前网络   (Network)   : Sepolia (ChainID: ${sepolia.id})`);
  console.log("\n[提示] 后续的 send 命令将默认使用该账号进行离线签名！");
  console.log("[提示] 转账前请确保向该地址转入足够的 Sepolia 测试网 ETH (用于 Gas) 和对应 ERC20 代币。");
  console.log("==========================================\n");
}

/**
 * 2. getBalance 命令：查询 ERC20 余额
 */
async function handleGetBalance(addressInput) {
  console.log("\n==========================================");
  console.log("          查询余额 (getBalance)           ");
  console.log("==========================================");

  let targetAddress = addressInput;

  // 若未输入地址，自动使用当前保存的钱包地址
  if (!targetAddress) {
    const wallet = loadWallet();
    if (wallet?.address) {
      targetAddress = wallet.address;
      console.log(`  未指定查询地址，自动使用本地钱包地址: ${targetAddress}`);
    } else {
      console.error("\n[错误] 请指定要查询的以太坊地址！用法: ./erc20Tool getBalance <address>\n");
      process.exit(1);
    }
  }

  if (!isAddress(targetAddress)) {
    console.error(`\n[错误] 无效的以太坊地址: ${targetAddress}\n`);
    process.exit(1);
  }

  const { name, symbol, decimals } = await getTokenMetadata();

  console.log(`\n  正在从 Sepolia 网络查询地址 [${targetAddress}] ...`);

  // 并行获取 ERC20 余额 与 原生 ETH 余额
  const [tokenBalance, ethBalance] = await Promise.all([
    publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [targetAddress],
    }).catch((err) => {
      console.warn(`  [警告] 读取代币余额失败: ${err.shortMessage || err.message}`);
      return 0n;
    }),
    publicClient.getBalance({ address: targetAddress }).catch(() => 0n),
  ]);

  const formattedTokenBalance = formatUnits(tokenBalance, decimals);
  const formattedEthBalance = formatEther(ethBalance);

  console.log(`\n  查询结果:`);
  console.log(`  ----------------------------------------`);
  console.log(`  目标地址      : ${targetAddress}`);
  console.log(`  ERC20 合约    : ${TOKEN_ADDRESS}`);
  console.log(`  代币名称      : ${name} (${symbol})`);
  console.log(`  代币精度      : ${decimals}`);
  console.log(`  ERC20 余额    : ${formattedTokenBalance} ${symbol} (${tokenBalance.toString()} 最小单位)`);
  console.log(`  Sepolia ETH   : ${formattedEthBalance} ETH (${ethBalance.toString()} wei)`);
  console.log("==========================================\n");
}

/**
 * 3. send 命令：构建 EIP-1559 交易并离线签名发送
 */
async function handleSend(toInput, amountInput) {
  console.log("\n==========================================");
  console.log("          发送交易 (send - EIP 1559)      ");
  console.log("==========================================");

  // 1. 加载本地保存的账户
  const wallet = loadWallet();
  if (!wallet || !wallet.privateKey) {
    console.error("\n[错误] 未找到本地钱包私钥！请先运行 createAccount 命令生成账户:");
    console.error("       ./erc20Tool createAccount\n");
    process.exit(1);
  }

  const account = privateKeyToAccount(wallet.privateKey);
  console.log(`\n  发起账户 (From) : ${account.address}`);

  // 2. 校验接收方地址
  if (!toInput || !isAddress(toInput)) {
    console.error(`\n[错误] 请提供有效的收款人地址 (to)！`);
    console.error("       用法: ./erc20Tool send <to> <amount>\n");
    process.exit(1);
  }
  const toAddress = toInput;
  console.log(`  接收账户 (To)   : ${toAddress}`);

  // 3. 校验金额
  if (!amountInput || isNaN(Number(amountInput)) || Number(amountInput) <= 0) {
    console.error(`\n[错误] 请提供有效的转账数量 (amount)，必须为大于 0 的数字！`);
    console.error("       用法: ./erc20Tool send <to> <amount>\n");
    process.exit(1);
  }

  // 4. 获取代币精度并解析转账数量
  const { name, symbol, decimals } = await getTokenMetadata();
  let parsedAmount;
  try {
    parsedAmount = parseUnits(amountInput, decimals);
  } catch (err) {
    console.error(`\n[错误] 解析代币数量失败: ${err.message}\n`);
    process.exit(1);
  }

  console.log(`  转账代币        : ${name} (${symbol})`);
  console.log(`  代币合约        : ${TOKEN_ADDRESS}`);
  console.log(`  转账数量        : ${amountInput} ${symbol} (${parsedAmount.toString()} 最小单位)`);

  // 5. 检查账户余额
  console.log(`\n  [1/5] 正在检查账户余额 ...`);
  const [tokenBalance, ethBalance] = await Promise.all([
    publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }).catch(() => 0n),
    publicClient.getBalance({ address: account.address }).catch(() => 0n),
  ]);

  console.log(`        当前代币余额: ${formatUnits(tokenBalance, decimals)} ${symbol}`);
  console.log(`        当前 ETH 余额: ${formatEther(ethBalance)} ETH`);

  if (tokenBalance < parsedAmount) {
    console.error(`\n[错误] 代币余额不足！`);
    console.error(`       当前代币余额为 ${formatUnits(tokenBalance, decimals)} ${symbol}，无法转账 ${amountInput} ${symbol}\n`);
    process.exit(1);
  }

  if (ethBalance === 0n) {
    console.error(`\n[错误] 账户中无 Sepolia ETH！无法支付交易 Gas 费用。`);
    console.error(`       请先通过 Sepolia 水龙头向 ${account.address} 领水或转入 ETH。\n`);
    process.exit(1);
  }

  // 6. 构建 ERC20 transfer 调用数据
  console.log(`\n  [2/5] 编码 ERC20 转账 CallData ...`);
  const callData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toAddress, parsedAmount],
  });
  console.log(`        CallData: ${callData}`);

  // 7. 获取 Nonce、EIP-1559 费率和估算 Gas
  console.log(`\n  [3/5] 获取 EIP-1559 参数 (Nonce, Gas Limit, MaxFeePerGas, PriorityFee) ...`);
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  const fees = await publicClient.estimateFeesPerGas();

  // 估算 Gas Limit (若模拟失败则使用稳健默认值 65000n)
  let gasLimit;
  try {
    gasLimit = await publicClient.estimateGas({
      account,
      to: TOKEN_ADDRESS,
      data: callData,
      value: 0n,
    });
    // 增加 20% buffer 避免因状态变动偶发 OOG
    gasLimit = (gasLimit * 120n) / 100n;
  } catch (err) {
    console.warn(`        [提示] 自动估算 Gas 失败 (${err.shortMessage || "可能缺少代币或权限"})，使用默认 Gas Limit: 65,000`);
    gasLimit = 65000n;
  }

  console.log(`        - Nonce                : ${nonce}`);
  console.log(`        - Gas Limit            : ${gasLimit.toString()}`);
  console.log(`        - Max Fee Per Gas      : ${formatGwei(fees.maxFeePerGas)} Gwei (${fees.maxFeePerGas.toString()} wei)`);
  console.log(`        - Max Priority Fee     : ${formatGwei(fees.maxPriorityFeePerGas)} Gwei (${fees.maxPriorityFeePerGas.toString()} wei)`);
  console.log(`        - 交易类型 (Type)      : 0x02 (EIP-1559)`);
  console.log(`        - Chain ID             : ${sepolia.id}`);

  // 8. 组装交易对象并由本地私钥进行离线签名
  console.log(`\n  [4/5] 正在构建 EIP-1559 交易并使用私钥签名 ...`);
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
    gas: gasLimit,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    type: "eip1559",
  };

  const serializedTx = await walletClient.signTransaction(txRequest);
  console.log(`        签名成功！`);
  console.log(`        已序列化的 Raw Transaction (${serializedTx.length} 字符):`);
  console.log(`        ${serializedTx.slice(0, 66)}...`);

  // 9. 广播交易至 Sepolia 网络
  console.log(`\n  [5/5] 发送原始交易 (sendRawTransaction) 到 Sepolia ...`);
  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: serializedTx,
  });

  console.log(`\n  ========================================`);
  console.log(`  ✅ 交易已成功广播至 Sepolia 网络！`);
  console.log(`  交易哈希 (Tx Hash): ${txHash}`);
  console.log(`  区块浏览器链接     : https://sepolia.etherscan.io/tx/${txHash}`);
  console.log(`  ========================================`);

  console.log(`\n  正在等待交易确认 (waitForTransactionReceipt) ...`);
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    console.log(`\n  🎉 交易已成功上链！`);
    console.log(`  ----------------------------------------`);
    console.log(`  状态 (Status)     : ${receipt.status === "success" ? "成功 (SUCCESS)" : "失败 (REVERTED)"}`);
    console.log(`  区块高度 (Block)  : ${receipt.blockNumber}`);
    console.log(`  实际 Gas 消耗     : ${receipt.gasUsed.toString()}`);
    console.log(`  有效 Gas 单价     : ${formatGwei(receipt.effectiveGasPrice)} Gwei`);
    console.log(`  ========================================\n`);
  } catch (err) {
    console.log(`\n  [提示] 交易已广播，等待收据超时或未立即确认。您可以稍后通过区块浏览器查看:`);
    console.log(`  https://sepolia.etherscan.io/tx/${txHash}\n`);
  }
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
ERC20 命令行钱包工具 (erc20Tool) - Sepolia 测试网

使用方法:
  ./erc20Tool <command> [arguments]

可用命令:
  1. createAccount
     生成新的以太坊私钥并派生地址，将信息保存到 data/wallet.json。
     后续的 send 命令将默认读取该账号作为发起方。
     示例:
       ./erc20Tool createAccount

  2. getBalance [address]
     查询指定地址的 ERC20 余额及原生 Sepolia ETH 余额。
     若不带参数，默认使用本地钱包地址。
     示例:
       ./erc20Tool getBalance 0x55f2ef375b1d34a630f8616063bc25f566ce33d8
       ./erc20Tool getBalance

  3. send <to> <amount>
     使用本地保存的账号构建 ERC20 转账交易，完成 EIP-1559 本地签名并广播至 Sepolia 网络。
     示例:
       ./erc20Tool send 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 10

当前配置:
  网络 (Network)       : Sepolia (ChainID 11155111)
  RPC 节点             : ${RPC_URL}
  ERC20 合约地址       : ${TOKEN_ADDRESS}
  本地钱包存储         : ${WALLET_FILE_PATH}
`);
}

/**
 * CLI 命令行入口
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      case "createAccount":
        await handleCreateAccount();
        break;

      case "getBalance":
        await handleGetBalance(args[1]);
        break;

      case "send":
        await handleSend(args[1], args[2]);
        break;

      default:
        console.error(`\n[错误] 未知命令: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n[执行异常] ${err.shortMessage || err.message}`);
    if (process.env.DEBUG) {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
