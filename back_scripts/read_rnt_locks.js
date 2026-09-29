import { createPublicClient, http, keccak256, toHex, pad, getAddress } from "viem";
import { localhost } from "viem/chains";
import dotenv from "dotenv";

dotenv.config();

// 合约地址：支持环境变量配置或命令行参数传入，默认使用 anvil 上部署的地址
const CONTRACT_ADDRESS =
  process.argv[2] ||
  process.env.RNT_CONTRACT_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

const client = createPublicClient({
  chain: localhost,
  transport: http(RPC_URL),
});

/**
 * EVM 动态数组与结构体存储布局说明：
 * 1. `LockInfo[] private _locks` 位于 Slot 0。
 *    - Slot 0 存储数组长度 length。
 * 2. 数组元素的存储起始槽位 baseSlot = keccak256(uint256(0))。
 * 3. 每个 LockInfo 包含：
 *    - address user (20 字节 = 160 位，offset 0)
 *    - uint64 startTime (8 字节 = 64 位，offset 20)
 *    - uint256 amount (32 字节 = 256 位，offset 0, slot 1)
 *    因此 user 和 startTime 紧凑打包在同一槽位 (20 + 8 = 28 字节 <= 32 字节)。
 *    每个元素占用 2 个存储槽位：
 *    - 槽位 A (user + startTime): baseSlot + i * 2
 *    - 槽位 B (amount): baseSlot + i * 2 + 1
 */
async function readLocks() {
  console.log(`\n正在从合约 ${CONTRACT_ADDRESS} 读取 _locks 数组存储...\n`);

  // 1. 读取 Slot 0 获取 _locks 数组长度
  const lengthSlot = pad(toHex(0), { size: 32 });
  const rawLength = await client.getStorageAt({
    address: CONTRACT_ADDRESS,
    slot: lengthSlot,
  });

  const length = rawLength ? Number(BigInt(rawLength)) : 0;
  console.log(`检测到 _locks 数组长度: ${length}\n`);

  if (length === 0) {
    console.log("数组为空或未找到数据。");
    return;
  }

  // 2. 计算动态数组起始槽位 baseSlot
  const baseSlot = BigInt(keccak256(lengthSlot));

  // 3. 逐个读取并解析每个元素
  for (let i = 0; i < length; i++) {
    // 当前元素占用的两个槽位
    const slot0 = pad(toHex(baseSlot + BigInt(i * 2)), { size: 32 });
    const slot1 = pad(toHex(baseSlot + BigInt(i * 2 + 1)), { size: 32 });

    const data0 = await client.getStorageAt({
      address: CONTRACT_ADDRESS,
      slot: slot0,
    });

    const data1 = await client.getStorageAt({
      address: CONTRACT_ADDRESS,
      slot: slot1,
    });

    if (!data0 || !data1) {
      console.warn(`locks[${i}]: 读取失败或槽位为空`);
      continue;
    }

    // data0 是 32 字节十六进制 (0x + 64 个 hex 字符)
    // 低 20 字节 (最后 40 个字符) 为 user
    const userHex = "0x" + data0.slice(26, 66);
    const user = getAddress(userHex);

    // 接下来往左的 8 字节 (16 个 hex 字符，字符下标 10 到 26) 为 startTime
    const startTimeHex = "0x" + data0.slice(10, 26);
    const startTime = BigInt(startTimeHex).toString();

    // data1 是完整的 uint256 amount (32 字节)
    const amount = BigInt(data1).toString();

    // 按照指定格式打印：locks[0]: user:…… ,startTime:……,amount:……
    console.log(`locks[${i}]: user:${user} ,startTime:${startTime},amount:${amount}`);
  }
  console.log("");
}

readLocks().catch((err) => {
  console.error("读取出错:", err);
  process.exit(1);
});
