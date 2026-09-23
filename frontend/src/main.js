import { ethers } from "ethers";
import {
  CONFIG,
  CALLED_TOKEN_ABI,
  TOKEN_BANK_ABI,
} from "./contracts.js";

// 全局应用状态
const state = {
  isConnected: false,
  isCorrectNetwork: false,
  currentAccount: null,
  chainId: null,

  browserProvider: null,
  jsonRpcProvider: null,
  signer: null,
  tokenContract: null,
  bankContract: null,

  tokenBalance: "0.00",
  tokenBalanceRaw: 0n,
  depositedBalance: "0.00",
  depositedBalanceRaw: 0n,
  vaultTvl: "0.00",
  allowance: "0.00",
  allowanceRaw: 0n,

  activeTab: "deposit", // 'deposit' | 'withdraw'
  depositMode: "permit", // 'permit' (EIP-2612) | 'call' (transferAndCall) | 'standard' (approve + deposit)
  depositInput: "100.00",
  withdrawInput: "50.00",

  txFilter: "all", // 'all' | 'in' | 'out'
  transfers: [],
  transfersTotal: 0,
  transfersLoading: false,

  isTransacting: false,
  isApproving: false,
  isFauceting: false,
  indexerOnline: false,
  latestBlock: 0,
  toasts: [],
};

// 辅助格式化
function formatAmount(weiBigInt) {
  try {
    const formatted = ethers.formatUnits(weiBigInt, 18);
    const num = parseFloat(formatted);
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } catch {
    return "0.00";
  }
}

function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(timestamp) {
  if (!timestamp) return "刚刚";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 10) return "刚刚";
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

// 消息提示 Toast
function showToast(title, msg, type = "info") {
  const id = Date.now() + Math.random();
  state.toasts.push({ id, title, msg, type });
  renderToasts();
  setTimeout(() => {
    state.toasts = state.toasts.filter((t) => t.id !== id);
    renderToasts();
  }, 4500);
}

function renderToasts() {
  const container = document.getElementById("toast-container");
  if (!container) return;
  container.innerHTML = state.toasts
    .map((t) => {
      let icon = "info";
      let border = "border-primary/40 text-primary";
      if (t.type === "success") {
        icon = "check_circle";
        border = "border-tertiary/40 text-tertiary";
      } else if (t.type === "error") {
        icon = "error";
        border = "border-error/40 text-error";
      }
      return `
        <div class="flex items-start space-x-3 p-3.5 rounded-xl bg-surface-container-high/95 backdrop-blur-md border ${border} shadow-2xl transition-all duration-300 transform translate-y-0 w-84 max-w-full">
          <span class="material-symbols-outlined text-[20px] shrink-0 mt-0.5">${icon}</span>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-xs text-on-surface">${t.title}</div>
            <div class="text-[11px] text-on-surface-variant break-words mt-0.5 leading-relaxed">${t.msg}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// 初始化及钱包事件监听
async function init() {
  renderApp();
  state.jsonRpcProvider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

  checkIndexerStatus();

  if (window.ethereum) {
    // 监听账户变更
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length === 0) {
        state.isConnected = false;
        state.currentAccount = null;
        state.signer = null;
        showToast("已断开连接", "请在 MetaMask 中重新连接钱包", "info");
      } else {
        state.currentAccount = accounts[0];
        state.isConnected = true;
        showToast("账号已切换", `当前地址: ${shortenAddress(accounts[0])}`, "info");
        handleAccountConnected();
      }
      renderApp();
    });

    // 监听网络切换
    window.ethereum.on("chainChanged", (chainIdHex) => {
      const netId = parseInt(chainIdHex, 16);
      state.chainId = netId;
      state.isCorrectNetwork = netId === CONFIG.chainId;
      if (!state.isCorrectNetwork) {
        showToast("网络不匹配", `请切换至 ${CONFIG.chainName} (${CONFIG.chainId})`, "error");
      } else {
        showToast("网络就绪", `已连接至 ${CONFIG.chainName}`, "success");
      }
      renderApp();
      loadAllData();
    });

    // 检查是否已有授权账户
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        state.currentAccount = accounts[0];
        state.isConnected = true;
        await handleAccountConnected();
      }
    } catch (err) {
      console.warn("检查已授权账户异常:", err);
    }
  }

  setInterval(() => {
    if (state.isConnected) {
      loadAllData();
      checkIndexerStatus();
    }
  }, 4000);
}

// 连接 MetaMask 钱包
async function connectMetaMask() {
  if (!window.ethereum) {
    showToast("未检测到 MetaMask", "请在浏览器中安装 MetaMask 插件扩展", "error");
    window.open("https://metamask.io/download/", "_blank");
    return;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (accounts.length > 0) {
      state.currentAccount = accounts[0];
      state.isConnected = true;
      await handleAccountConnected();
      await ensureCorrectNetwork();
      showToast("连接成功 🎉", `已连接 MetaMask 账户: ${shortenAddress(accounts[0])}`, "success");
    }
  } catch (err) {
    console.error("连接钱包失败:", err);
    showToast("连接取消或失败", err.message, "error");
  } finally {
    renderApp();
  }
}

// 处理账户连接后的 Provider 和 Signer 绑定
async function handleAccountConnected() {
  state.browserProvider = new ethers.BrowserProvider(window.ethereum);
  const net = await state.browserProvider.getNetwork();
  state.chainId = Number(net.chainId);
  state.isCorrectNetwork = state.chainId === CONFIG.chainId;

  state.signer = await state.browserProvider.getSigner();
  state.tokenContract = new ethers.Contract(
    CONFIG.calledTokenAddress,
    CALLED_TOKEN_ABI,
    state.signer
  );
  state.bankContract = new ethers.Contract(
    CONFIG.tokenBankAddress,
    TOKEN_BANK_ABI,
    state.signer
  );

  await loadAllData();
}

// 确保连接在 Anvil 网络
async function ensureCorrectNetwork() {
  if (!window.ethereum) return;
  try {
    const currentChain = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(currentChain, 16) !== CONFIG.chainId) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CONFIG.chainIdHex }],
        });
      } catch (switchError) {
        // 4902 表示链尚未添加到 MetaMask
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CONFIG.chainIdHex,
                chainName: CONFIG.chainName,
                rpcUrls: [CONFIG.rpcUrl],
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }
    state.isCorrectNetwork = true;
  } catch (err) {
    console.warn("网络切换提示:", err);
    showToast("网络切换提示", "请将 MetaMask 网络切换至 Anvil 本地节点 (RPC: 8545)", "error");
  }
}

// 检查后端 indexer.js 状态
async function checkIndexerStatus() {
  try {
    const res = await fetch(`${CONFIG.backendApiUrl}/api/status`);
    if (res.ok) {
      const data = await res.json();
      state.indexerOnline = data.success;
      if (data.network?.currentBlock !== undefined) {
        state.latestBlock = data.network.currentBlock;
      }
    } else {
      state.indexerOnline = false;
    }
  } catch {
    state.indexerOnline = false;
  }
  renderHeader();
}

// 读取链上数据
async function loadAllData() {
  if (!state.isConnected || !state.currentAccount) return;

  try {
    const readToken = new ethers.Contract(
      CONFIG.calledTokenAddress,
      CALLED_TOKEN_ABI,
      state.browserProvider || state.jsonRpcProvider
    );
    const readBank = new ethers.Contract(
      CONFIG.tokenBankAddress,
      TOKEN_BANK_ABI,
      state.browserProvider || state.jsonRpcProvider
    );

    const [tokenBal, bankBal, tvl, allowance, block] = await Promise.all([
      readToken.balanceOf(state.currentAccount),
      readBank.balances(state.currentAccount),
      readToken.balanceOf(CONFIG.tokenBankAddress),
      readToken.allowance(state.currentAccount, CONFIG.tokenBankAddress),
      state.jsonRpcProvider.getBlockNumber(),
    ]);

    state.tokenBalanceRaw = tokenBal;
    state.tokenBalance = formatAmount(tokenBal);

    state.depositedBalanceRaw = bankBal;
    state.depositedBalance = formatAmount(bankBal);

    state.vaultTvl = formatAmount(tvl);

    state.allowanceRaw = allowance;
    state.allowance = formatAmount(allowance);

    state.latestBlock = block;

    renderOverview();
    renderConsole();
    renderHeader();
  } catch (err) {
    console.error("读取链上数据失败:", err);
  }

  fetchTransfers();
}

// 从后端 indexer.js 查询转账记录
async function fetchTransfers() {
  if (!state.currentAccount) return;
  state.transfersLoading = true;
  renderTransfers();

  try {
    const dirParam = state.txFilter === "all" ? "all" : state.txFilter;
    const url = `${CONFIG.backendApiUrl}/api/transfers/${state.currentAccount}?direction=${dirParam}&limit=20`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        state.transfers = json.data || [];
        state.transfersTotal = json.pagination?.total || state.transfers.length;
      }
    }
  } catch (err) {
    console.warn("拉取 indexer 记录失败:", err.message);
  } finally {
    state.transfersLoading = false;
    renderTransfers();
  }
}

// 快速填入比例
function setQuickAmount(pct, isDeposit = true) {
  if (isDeposit) {
    const rawVal = (state.tokenBalanceRaw * BigInt(Math.floor(pct * 100))) / 100n;
    state.depositInput = ethers.formatUnits(rawVal, 18);
    const el = document.getElementById("depositInput");
    if (el) el.value = state.depositInput;
  } else {
    const rawVal = (state.depositedBalanceRaw * BigInt(Math.floor(pct * 100))) / 100n;
    state.withdrawInput = ethers.formatUnits(rawVal, 18);
    const el = document.getElementById("withdrawInput");
    if (el) el.value = state.withdrawInput;
  }
}

// 执行 ERC20 授权 (Approve)
async function doApprove() {
  if (!state.tokenContract || !state.isConnected) {
    showToast("请先连接钱包", "请先点击右上角连接 MetaMask 钱包", "error");
    return;
  }

  const amtStr = state.depositInput;
  if (!amtStr || parseFloat(amtStr) <= 0) {
    showToast("金额错误", "请输入有效的存款金额", "error");
    return;
  }

  try {
    state.isApproving = true;
    renderConsole();
    const amountWei = ethers.parseUnits(amtStr, 18);
    showToast("MetaMask 交互", "请在 MetaMask 中确认 Approve 授权交易...", "info");

    const tx = await state.tokenContract.approve(CONFIG.tokenBankAddress, amountWei);
    showToast("授权交易已提交", `TxHash: ${shortenAddress(tx.hash)}，等待确认...`, "info");
    await tx.wait(1);

    showToast("授权成功 🎉", "额度已更新，现在可确认存入！", "success");
    await loadAllData();
  } catch (err) {
    console.error("Approve 失败:", err);
    showToast("授权失败", err.shortMessage || err.message, "error");
  } finally {
    state.isApproving = false;
    renderConsole();
  }
}

// 执行存款 (Deposit)
async function doDeposit() {
  if (!state.tokenContract || !state.bankContract || !state.isConnected) {
    showToast("请先连接钱包", "请先连接 MetaMask 钱包后再操作", "error");
    return;
  }

  const amtStr = state.depositInput;
  if (!amtStr || parseFloat(amtStr) <= 0) {
    showToast("金额错误", "请输入有效的存款金额", "error");
    return;
  }

  const amountWei = ethers.parseUnits(amtStr, 18);
  if (amountWei > state.tokenBalanceRaw) {
    showToast("代币余额不足", "钱包内的 CalledToken (MCTK) 余额不足", "error");
    return;
  }

  try {
    state.isTransacting = true;
    renderConsole();

    let tx;
    if (state.depositMode === "permit") {
      showToast("MetaMask 交互", "请在 MetaMask 中签署 EIP-2612 Permit 授权消息 (免 Gas)...", "info");

      // 1. 获取代币名称、网络信息及用户当前 nonce
      const [tokenName, network, nonce] = await Promise.all([
        state.tokenContract.name().catch(() => "MyPermitToken"),
        state.browserProvider.getNetwork(),
        state.tokenContract.nonces(state.currentAccount),
      ]);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1小时有效

      // 2. 构造 EIP-712 结构化数据
      const domain = {
        name: tokenName,
        version: "1",
        chainId: network.chainId,
        verifyingContract: CONFIG.calledTokenAddress,
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const values = {
        owner: state.currentAccount,
        spender: CONFIG.tokenBankAddress,
        value: amountWei,
        nonce: nonce,
        deadline: deadline,
      };

      // 3. 用户在钱包中签署 typed data
      const signature = await state.signer.signTypedData(domain, types, values);
      const sig = ethers.Signature.from(signature);

      showToast("签名成功", "已生成 Permit 签名，正在提交 TokenBank.permitDeposit 存入交易...", "info");

      // 4. 调用 TokenBank.permitDeposit
      tx = await state.bankContract.getFunction("permitDeposit(uint256,uint256,uint8,bytes32,bytes32)")(
        amountWei,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );
    } else if (state.depositMode === "call") {
      showToast("MetaMask 交互", "请在 MetaMask 中确认快捷一步存入 (transferAndCall)...", "info");
      tx = await state.tokenContract.transferAndCall(CONFIG.tokenBankAddress, amountWei);
    } else {
      if (state.allowanceRaw < amountWei) {
        showToast("需要授权", "当前授权额度不足，请先点击【1. 授权 (Approve)】", "error");
        state.isTransacting = false;
        renderConsole();
        return;
      }
      showToast("MetaMask 交互", "请在 MetaMask 中确认 TokenBank.deposit 存入交易...", "info");
      tx = await state.bankContract.deposit(amountWei);
    }

    showToast("交易已提交", `TxHash: ${shortenAddress(tx.hash)}，等待出块...`, "info");
    await tx.wait(1);

    showToast("存款成功 🎉", `成功存入 ${amtStr} MCTK 至 TokenBank！`, "success");
    setTimeout(loadAllData, 500);
    setTimeout(fetchTransfers, 1500);
  } catch (err) {
    console.error("存款失败:", err);
    showToast("存款失败", err.shortMessage || err.message, "error");
  } finally {
    state.isTransacting = false;
    renderConsole();
  }
}

// 执行取款 (Withdraw)
async function doWithdraw() {
  if (!state.bankContract || !state.isConnected) {
    showToast("请先连接钱包", "请先连接 MetaMask 钱包后再操作", "error");
    return;
  }

  const amtStr = state.withdrawInput;
  if (!amtStr || parseFloat(amtStr) <= 0) {
    showToast("金额错误", "请输入有效的提取金额", "error");
    return;
  }

  const amountWei = ethers.parseUnits(amtStr, 18);
  if (amountWei > state.depositedBalanceRaw) {
    showToast("存款不足", "在 TokenBank 中的存款不足，无法提取此数量", "error");
    return;
  }

  try {
    state.isTransacting = true;
    renderConsole();

    showToast("MetaMask 交互", "请在 MetaMask 中确认 TokenBank.withdraw 取款交易...", "info");
    const tx = await state.bankContract.withdraw(amountWei);
    showToast("交易已提交", `TxHash: ${shortenAddress(tx.hash)}，等待出块...`, "info");
    await tx.wait(1);

    showToast("取款成功 🎉", `成功赎回 ${amtStr} MCTK 返还至钱包！`, "success");
    setTimeout(loadAllData, 500);
    setTimeout(fetchTransfers, 1500);
  } catch (err) {
    console.error("取款失败:", err);
    showToast("取款失败", err.shortMessage || err.message, "error");
  } finally {
    state.isTransacting = false;
    renderConsole();
  }
}

// 空投水龙头：调用 Anvil 本地节点免私钥解锁部署者直接转账 1,000 MCTK
async function doFaucet() {
  if (!state.isConnected || !state.currentAccount) {
    showToast("请先连接钱包", "请连接您的 MetaMask 账户以接收测试代币", "error");
    return;
  }

  try {
    state.isFauceting = true;
    renderOverview();
    showToast("领取中...", `正在向您的地址 ${shortenAddress(state.currentAccount)} 发放 1,000 MCTK...`, "info");

    const transferData = new ethers.Interface(CALLED_TOKEN_ABI).encodeFunctionData(
      "transfer",
      [state.currentAccount, ethers.parseUnits("1000", 18)]
    );

    // Anvil 本地节点支持对默认账户的直接 RPC 发送，无需前端持有任何私钥
    const txHash = await state.jsonRpcProvider.send("eth_sendTransaction", [
      {
        from: CONFIG.deployerAddress,
        to: CONFIG.calledTokenAddress,
        data: transferData,
      },
    ]);

    showToast("领取成功 🎉", `1,000 MCTK 已发放至您的 MetaMask 钱包！Tx: ${shortenAddress(txHash)}`, "success");
    setTimeout(loadAllData, 600);
    setTimeout(fetchTransfers, 1600);
  } catch (err) {
    console.error("水龙头发放异常:", err);
    showToast("领取失败", err.message, "error");
  } finally {
    state.isFauceting = false;
    renderOverview();
  }
}

// 渲染顶栏
function renderHeader() {
  const container = document.getElementById("header-actions");
  if (!container) return;

  if (state.isConnected && state.currentAccount) {
    container.innerHTML = `
      <!-- Network Badge -->
      <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high border border-white/5">
        <span class="w-2 h-2 rounded-full ${state.isCorrectNetwork ? "bg-tertiary shadow-[0_0_8px_#4edea3]" : "bg-error animate-pulse"}"></span>
        <span class="font-bold text-xs ${state.isCorrectNetwork ? "text-on-surface" : "text-error"}">
          ${state.isCorrectNetwork ? `Anvil #${state.latestBlock}` : "错误网络 (请切至 31337)"}
        </span>
      </div>

      <!-- Account Badge -->
      <button id="btn-account-pill" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-primary/20 transition-all">
        <div class="w-5 h-5 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-[10px] font-bold text-surface">
          🦊
        </div>
        <span class="font-mono text-xs font-bold text-primary">${shortenAddress(state.currentAccount)}</span>
      </button>
    `;

    document.getElementById("btn-account-pill")?.addEventListener("click", () => {
      showToast("MetaMask 地址", `当前已连接: ${state.currentAccount}`, "info");
    });
  } else {
    container.innerHTML = `
      <button id="btn-connect-wallet" class="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary font-bold text-xs shadow-[0_0_16px_rgba(208,188,255,0.3)] hover:brightness-110 active:scale-[0.98] transition-all">
        <span class="text-sm">🦊</span>
        <span>连接 MetaMask</span>
      </button>
    `;

    document.getElementById("btn-connect-wallet")?.addEventListener("click", connectMetaMask);
  }
}

// 渲染总览看板
function renderOverview() {
  const container = document.getElementById("overview-card");
  if (!container) return;

  container.innerHTML = `
    <div class="absolute -top-12 -right-12 w-48 h-48 bg-primary-container/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-8 -left-8 w-40 h-40 bg-secondary/15 rounded-full blur-2xl pointer-events-none"></div>
    
    <div class="relative z-10 flex flex-col space-y-4">
      <!-- Top Row -->
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: 'FILL' 1;">account_balance</span>
          <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">CalledToken DeFi Vault</span>
        </div>
        <div class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-tertiary/10 border border-tertiary/20 shadow-[0_0_12px_rgba(78,222,163,0.25)]">
          <span class="w-2 h-2 rounded-full bg-tertiary animate-pulse shadow-[0_0_8px_#4edea3]"></span>
          <span class="text-xs text-tertiary font-bold">1-Click ERC1363 回调协议支持</span>
        </div>
      </div>

      <!-- Balance & Deposited Metrics -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- User Wallet Balance -->
        <div class="p-4 rounded-xl bg-surface-container-high/40 border border-white/5 flex flex-col justify-between">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-on-surface-variant font-medium">钱包代币余额 (CalledToken)</span>
            ${
              state.isConnected
                ? `
              <button id="btn-faucet" class="text-[11px] px-2.5 py-0.5 rounded-full bg-secondary/20 hover:bg-secondary/30 text-secondary font-bold transition-all flex items-center gap-1 ${
                state.isFauceting ? "opacity-50 cursor-not-allowed" : ""
              }">
                <span class="material-symbols-outlined text-[13px] ${state.isFauceting ? "spin-animate" : ""}">
                  ${state.isFauceting ? "sync" : "water_drop"}
                </span>
                <span>${state.isFauceting ? "发放中..." : "领取 1,000 MCTK 测试币"}</span>
              </button>
            `
                : ""
            }
          </div>
          <div class="flex items-baseline space-x-2">
            <span class="font-display text-3xl md:text-4xl text-on-surface font-bold tracking-tight">
              ${state.isConnected ? state.tokenBalance : "--"}
            </span>
            <span class="text-sm font-semibold text-secondary">MCTK</span>
          </div>
          <span class="text-[10px] text-on-surface-variant/80 mt-1">
            ${state.isConnected ? `MetaMask 账户: ${shortenAddress(state.currentAccount)}` : "请先连接 MetaMask 钱包"}
          </span>
        </div>

        <!-- User Deposited Balance -->
        <div class="p-4 rounded-xl bg-surface-container-high/60 border border-primary/20 flex flex-col justify-between glow-primary">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-primary font-medium flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">savings</span>
              我的存入资产 (My Deposited Balance)
            </span>
            <span class="text-[10px] text-tertiary px-1.5 py-0.5 rounded bg-tertiary/10 font-mono">随时取款</span>
          </div>
          <div class="flex items-baseline space-x-2">
            <span class="font-display text-3xl md:text-4xl text-primary font-bold tracking-tight">
              ${state.isConnected ? state.depositedBalance : "--"}
            </span>
            <span class="text-sm font-semibold text-primary/80">MCTK</span>
          </div>
          <span class="text-[10px] text-on-surface-variant/80 mt-1">
            已存入 TokenBank 合约，随时可提取回钱包
          </span>
        </div>
      </div>

      <!-- Quick Metrics Ribbon -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
        <div class="flex flex-col p-2.5 rounded-lg bg-surface-container-high/60 border border-white/5">
          <span class="text-[11px] text-on-surface-variant">TokenBank 总锁仓量 (TVL)</span>
          <span class="font-mono text-sm text-on-surface font-bold">${state.vaultTvl} MCTK</span>
        </div>
        <div class="flex flex-col p-2.5 rounded-lg bg-surface-container-high/60 border border-white/5">
          <span class="text-[11px] text-on-surface-variant">TokenBank 合约地址</span>
          <span class="font-mono text-xs text-secondary truncate" title="${CONFIG.tokenBankAddress}">${shortenAddress(CONFIG.tokenBankAddress)}</span>
        </div>
        <div class="col-span-2 sm:col-span-1 flex flex-col p-2.5 rounded-lg bg-surface-container-high/60 border border-white/5">
          <span class="text-[11px] text-on-surface-variant">传统授权额度 (Allowance)</span>
          <span class="font-mono text-xs text-tertiary">${state.isConnected ? `${state.allowance} MCTK` : "--"}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-faucet")?.addEventListener("click", doFaucet);
}

// 渲染存取款控制台
function renderConsole() {
  const container = document.getElementById("console-card");
  if (!container) return;

  if (!state.isConnected) {
    container.innerHTML = `
      <div class="py-10 flex flex-col items-center justify-center text-center space-y-3">
        <div class="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl shadow-[0_0_16px_rgba(208,188,255,0.2)]">
          🦊
        </div>
        <div class="font-bold text-base text-on-surface">连接 MetaMask 开始存取款</div>
        <p class="text-xs text-on-surface-variant max-w-sm">
          点击右上角或下方按钮连接您的 MetaMask 账户，并在 Anvil 本地网络进行 CalledToken 存款与取款操作。
        </p>
        <button id="btn-connect-console" class="px-5 py-2.5 rounded-full bg-primary text-on-primary font-bold text-xs shadow-[0_0_16px_rgba(208,188,255,0.3)] hover:brightness-110 active:scale-[0.98] transition-all">
          连接 MetaMask 钱包
        </button>
      </div>
    `;
    document.getElementById("btn-connect-console")?.addEventListener("click", connectMetaMask);
    return;
  }

  const isDeposit = state.activeTab === "deposit";
  const needsApprove =
    state.depositMode === "standard" &&
    state.allowanceRaw < ethers.parseUnits(state.depositInput || "0", 18);

  container.innerHTML = `
    <!-- Segmented Navigation: Deposit / Withdraw -->
    <div class="grid grid-cols-2 p-1 bg-surface-container-lowest rounded-full border border-white/5" id="modeTabs">
      <button class="min-h-[44px] flex items-center justify-center space-x-2 rounded-full font-bold transition-all ${
        isDeposit
          ? "bg-surface-container-high text-primary shadow-[0_0_16px_rgba(208,188,255,0.25)] border border-primary/20"
          : "text-on-surface-variant hover:text-on-surface"
      }" id="tabDeposit">
        <span class="material-symbols-outlined text-[18px]">south_west</span>
        <span>存款 (Deposit)</span>
      </button>
      <button class="min-h-[44px] flex items-center justify-center space-x-2 rounded-full font-bold transition-all ${
        !isDeposit
          ? "bg-surface-container-high text-secondary shadow-[0_0_16px_rgba(76,215,246,0.25)] border border-secondary/20"
          : "text-on-surface-variant hover:text-on-surface"
      }" id="tabWithdraw">
        <span class="material-symbols-outlined text-[18px]">north_east</span>
        <span>取款 (Withdraw)</span>
      </button>
    </div>

    ${
      isDeposit
        ? `
      <!-- Deposit Mode Selector -->
      <div class="flex flex-col space-y-3 pt-1">
        <div class="flex items-center justify-between text-xs text-on-surface-variant">
          <span class="font-medium">选择存款交互方式：</span>
          <span class="text-[11px] font-mono text-primary/80">3 种入账方式支持</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
          <!-- Mode 1: Permit -->
          <button id="mode-permit" class="p-3 rounded-xl border text-left transition-all ${
            state.depositMode === "permit"
              ? "bg-primary-container/20 border-primary text-primary shadow-[0_0_12px_rgba(208,188,255,0.2)]"
              : "bg-surface-container hover:bg-surface-container-high border-white/5 text-on-surface-variant"
          }">
            <div class="flex items-center gap-1.5 font-bold text-xs">
              <span class="material-symbols-outlined text-[16px]">draw</span>
              <span>✍️ Permit 签名一步存</span>
            </div>
            <p class="text-[11px] opacity-75 mt-1 leading-snug">EIP-2612 链下签名授权，免预先交易 Approve</p>
          </button>

          <!-- Mode 2: Callback -->
          <button id="mode-call" class="p-3 rounded-xl border text-left transition-all ${
            state.depositMode === "call"
              ? "bg-primary-container/20 border-primary text-primary shadow-[0_0_12px_rgba(208,188,255,0.2)]"
              : "bg-surface-container hover:bg-surface-container-high border-white/5 text-on-surface-variant"
          }">
            <div class="flex items-center gap-1.5 font-bold text-xs">
              <span class="material-symbols-outlined text-[16px]">bolt</span>
              <span>⚡ Callback 一步存</span>
            </div>
            <p class="text-[11px] opacity-75 mt-1 leading-snug">transferAndCall 回调通知 TokenBank 自动记账</p>
          </button>
          
          <!-- Mode 3: Standard -->
          <button id="mode-standard" class="p-3 rounded-xl border text-left transition-all ${
            state.depositMode === "standard"
              ? "bg-primary-container/20 border-primary text-primary shadow-[0_0_12px_rgba(208,188,255,0.2)]"
              : "bg-surface-container hover:bg-surface-container-high border-white/5 text-on-surface-variant"
          }">
            <div class="flex items-center gap-1.5 font-bold text-xs">
              <span class="material-symbols-outlined text-[16px]">shield</span>
              <span>🔒 传统两步存入</span>
            </div>
            <p class="text-[11px] opacity-75 mt-1 leading-snug">标准流程：先发 Approve 交易，再调用 deposit</p>
          </button>
        </div>

        <!-- Amount Input Container -->
        <div class="flex flex-col p-4 rounded-xl bg-surface-container space-y-2 border border-white/5 focus-within:border-primary/50 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface-variant">输入存入金额</span>
            <div class="flex items-center space-x-1">
              <span class="text-xs text-on-surface-variant">可用余额:</span>
              <span class="font-mono text-xs text-secondary font-semibold">${state.tokenBalance}</span>
              <span class="text-xs text-on-surface-variant">MCTK</span>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <input class="bg-transparent text-2xl font-bold font-mono text-on-surface focus:outline-none w-2/3 tracking-tight" id="depositInput" placeholder="0.00" type="number" value="${state.depositInput}">
            <button class="px-3 py-1 rounded-full bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold transition-all shadow-[0_0_8px_rgba(208,188,255,0.2)]" id="btn-max-dep" type="button">
              MAX
            </button>
          </div>
          <div class="flex items-center justify-between pt-1">
            <span class="text-xs text-on-surface-variant">存入目标: TokenBank 合约</span>
            <span class="text-xs text-tertiary flex items-center space-x-1">
              <span class="material-symbols-outlined text-[14px]">verified</span>
              <span>免手续费 · 随时赎回</span>
            </span>
          </div>
        </div>

        <!-- Percentage Quick Selectors -->
        <div class="grid grid-cols-4 gap-2">
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary font-mono text-xs font-bold transition-colors border border-white/5" id="pct-25">25%</button>
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary font-mono text-xs font-bold transition-colors border border-white/5" id="pct-50">50%</button>
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary font-mono text-xs font-bold transition-colors border border-white/5" id="pct-75">75%</button>
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-mono text-xs font-bold transition-colors border border-white/5" id="pct-100">100%</button>
        </div>

        <!-- Action Buttons -->
        ${
          state.depositMode === "permit"
            ? `
          <button class="min-h-[48px] w-full flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold shadow-[0_0_20px_rgba(208,188,255,0.3)] hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed" id="btn-do-deposit" ${state.isTransacting ? "disabled" : ""}>
            <span class="material-symbols-outlined text-[20px] ${state.isTransacting ? "spin-animate" : ""}">
              ${state.isTransacting ? "sync" : "draw"}
            </span>
            <span>${state.isTransacting ? "MetaMask 等待签名 / 交易确认中..." : "签名并一步存入 (permitDeposit)"}</span>
          </button>
        `
            : state.depositMode === "call"
            ? `
          <button class="min-h-[48px] w-full flex items-center justify-center space-x-2 rounded-xl bg-primary text-on-primary font-bold shadow-[0_0_20px_rgba(208,188,255,0.3)] hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed" id="btn-do-deposit" ${state.isTransacting ? "disabled" : ""}>
            <span class="material-symbols-outlined text-[20px] ${state.isTransacting ? "spin-animate" : ""}">
              ${state.isTransacting ? "sync" : "bolt"}
            </span>
            <span>${state.isTransacting ? "MetaMask 等待交易确认中..." : "确认一步存入 (transferAndCall)"}</span>
          </button>
        `
            : `
          <div class="grid grid-cols-2 gap-2">
            <button class="min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-all ${
              needsApprove
                ? "bg-primary-container text-on-primary-container font-bold shadow-[0_0_16px_rgba(160,120,255,0.3)] hover:brightness-110"
                : "bg-surface-container-high text-on-surface-variant/60 border border-white/5"
            }" id="btn-do-approve" ${state.isApproving || !needsApprove ? "disabled" : ""}>
              <div class="flex items-center space-x-1">
                <span class="material-symbols-outlined text-[18px] ${state.isApproving ? "spin-animate" : ""}">
                  ${state.isApproving ? "sync" : "verified_user"}
                </span>
                <span class="text-sm font-bold">${needsApprove ? "1. 授权 (Approve)" : "✓ 已授权"}</span>
              </div>
              <span class="text-[10px] opacity-80">${needsApprove ? "授予 TokenBank 扣款权限" : "当前额度充足"}</span>
            </button>
            <button class="min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-all ${
              !needsApprove
                ? "bg-primary text-on-primary font-bold shadow-[0_0_20px_rgba(208,188,255,0.3)] hover:brightness-110"
                : "bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed"
            }" id="btn-do-deposit" ${needsApprove || state.isTransacting ? "disabled" : ""}>
              <div class="flex items-center space-x-1">
                <span class="material-symbols-outlined text-[18px] ${state.isTransacting ? "spin-animate" : ""}">
                  ${state.isTransacting ? "sync" : "account_balance_wallet"}
                </span>
                <span class="text-sm font-bold">${state.isTransacting ? "存入中..." : "2. 确认存入"}</span>
              </div>
              <span class="text-[10px] opacity-70">${needsApprove ? "需先完成授权" : "调用 deposit 记账"}</span>
            </button>
          </div>
        `
        }
      </div>
    `
        : `
      <!-- Withdraw Operation Panel -->
      <div class="flex flex-col space-y-3 pt-1">
        <div class="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-white/5">
          <span class="text-xs text-on-surface-variant">当前在 TokenBank 可提取资产</span>
          <span class="font-mono text-sm text-tertiary font-bold">${state.depositedBalance} MCTK</span>
        </div>

        <div class="flex flex-col p-4 rounded-xl bg-surface-container space-y-2 border border-white/5 focus-within:border-secondary/50 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface-variant">输入提取数量</span>
            <span class="text-xs text-secondary">将直接返还至当前 MetaMask 钱包</span>
          </div>
          <div class="flex items-center justify-between">
            <input class="bg-transparent text-2xl font-bold font-mono text-on-surface focus:outline-none w-2/3 tracking-tight" id="withdrawInput" placeholder="0.00" type="number" value="${state.withdrawInput}">
            <button class="px-3 py-1 rounded-full bg-secondary/20 hover:bg-secondary/30 text-secondary text-xs font-bold" id="btn-max-wd" type="button">
              MAX
            </button>
          </div>
        </div>

        <!-- Percentage Quick Selectors -->
        <div class="grid grid-cols-4 gap-2">
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-secondary font-mono text-xs font-bold transition-colors border border-white/5" id="wd-pct-25">25%</button>
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-secondary font-mono text-xs font-bold transition-colors border border-white/5" id="wd-pct-50">50%</button>
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-secondary font-mono text-xs font-bold transition-colors border border-white/5" id="wd-pct-75">75%</button>
          <button class="py-2 flex items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high text-secondary font-mono text-xs font-bold transition-colors border border-white/5" id="wd-pct-100">100%</button>
        </div>

        <button class="min-h-[48px] w-full flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-secondary-container to-secondary text-on-secondary font-bold shadow-[0_0_20px_rgba(76,215,246,0.25)] hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed" id="btn-do-withdraw" ${state.isTransacting ? "disabled" : ""}>
          <span class="material-symbols-outlined text-[20px] ${state.isTransacting ? "spin-animate" : ""}">
            ${state.isTransacting ? "sync" : "eject"}
          </span>
          <span>${state.isTransacting ? "MetaMask 等待签名中..." : "确认赎回提取 (Withdraw)"}</span>
        </button>
      </div>
    `
    }
  `;

  // 绑定事件
  document.getElementById("tabDeposit")?.addEventListener("click", () => {
    state.activeTab = "deposit";
    renderConsole();
  });
  document.getElementById("tabWithdraw")?.addEventListener("click", () => {
    state.activeTab = "withdraw";
    renderConsole();
  });

  if (isDeposit) {
    document.getElementById("mode-permit")?.addEventListener("click", () => {
      state.depositMode = "permit";
      renderConsole();
    });
    document.getElementById("mode-call")?.addEventListener("click", () => {
      state.depositMode = "call";
      renderConsole();
    });
    document.getElementById("mode-standard")?.addEventListener("click", () => {
      state.depositMode = "standard";
      renderConsole();
    });

    document.getElementById("depositInput")?.addEventListener("input", (e) => {
      state.depositInput = e.target.value;
      if (state.depositMode === "standard") renderConsole();
    });

    document.getElementById("btn-max-dep")?.addEventListener("click", () => setQuickAmount(1.0, true));
    document.getElementById("pct-25")?.addEventListener("click", () => setQuickAmount(0.25, true));
    document.getElementById("pct-50")?.addEventListener("click", () => setQuickAmount(0.50, true));
    document.getElementById("pct-75")?.addEventListener("click", () => setQuickAmount(0.75, true));
    document.getElementById("pct-100")?.addEventListener("click", () => setQuickAmount(1.0, true));

    document.getElementById("btn-do-approve")?.addEventListener("click", doApprove);
    document.getElementById("btn-do-deposit")?.addEventListener("click", doDeposit);
  } else {
    document.getElementById("withdrawInput")?.addEventListener("input", (e) => {
      state.withdrawInput = e.target.value;
    });

    document.getElementById("btn-max-wd")?.addEventListener("click", () => setQuickAmount(1.0, false));
    document.getElementById("wd-pct-25")?.addEventListener("click", () => setQuickAmount(0.25, false));
    document.getElementById("wd-pct-50")?.addEventListener("click", () => setQuickAmount(0.50, false));
    document.getElementById("wd-pct-75")?.addEventListener("click", () => setQuickAmount(0.75, false));
    document.getElementById("wd-pct-100")?.addEventListener("click", () => setQuickAmount(1.0, false));

    document.getElementById("btn-do-withdraw")?.addEventListener("click", doWithdraw);
  }
}

// 渲染交易记录模块（对接 indexer.js）
function renderTransfers() {
  const container = document.getElementById("transfers-card");
  if (!container) return;

  const currentAddr = (state.currentAccount || "").toLowerCase();
  const bankAddr = CONFIG.tokenBankAddress.toLowerCase();

  let listHtml = "";

  if (!state.isConnected) {
    listHtml = `
      <div class="py-8 flex flex-col items-center justify-center text-on-surface-variant space-y-1">
        <span class="material-symbols-outlined text-[36px] text-outline-variant">link_off</span>
        <span class="text-xs">连接钱包后查看该地址的转账记录</span>
      </div>
    `;
  } else if (state.transfersLoading) {
    listHtml = `
      <div class="py-12 flex flex-col items-center justify-center text-on-surface-variant space-y-2">
        <span class="material-symbols-outlined text-[32px] text-primary spin-animate">sync</span>
        <span class="text-xs">正在从 indexer.js 接口实时同步记录...</span>
      </div>
    `;
  } else if (state.transfers.length === 0) {
    listHtml = `
      <div class="py-10 flex flex-col items-center justify-center text-on-surface-variant space-y-2">
        <span class="material-symbols-outlined text-[40px] text-outline-variant">receipt_long</span>
        <span class="text-xs">暂无该 MetaMask 地址的转账记录</span>
        <span class="text-[11px] opacity-60">使用上面的“领取 1,000 MCTK”或存款后，indexer 将自动入库并展示</span>
      </div>
    `;
  } else {
    listHtml = state.transfers
      .map((tx) => {
        const fromAddr = (tx.from || "").toLowerCase();
        const toAddr = (tx.to || "").toLowerCase();
        const isOut = fromAddr === currentAddr;
        const isDeposit = isOut && toAddr === bankAddr;
        const isWithdraw = !isOut && fromAddr === bankAddr;

        let badgeTitle = "普通转账";
        let badgeColor = "bg-primary/10 text-primary border-primary/20";
        let dirIcon = "arrow_forward";
        let dirColor = "text-primary";
        let iconBg = "bg-primary-container/20";
        let amtSign = isOut ? "-" : "+";
        let amtColor = isOut ? "text-error" : "text-tertiary";

        if (isDeposit) {
          badgeTitle = "金库存款 (Deposit)";
          badgeColor = "bg-primary-container/25 text-primary border-primary/30";
          dirIcon = "south_west";
          dirColor = "text-primary";
          iconBg = "bg-primary-container/30";
        } else if (isWithdraw) {
          badgeTitle = "金库取款 (Withdraw)";
          badgeColor = "bg-tertiary/15 text-tertiary border-tertiary/30";
          dirIcon = "north_east";
          dirColor = "text-tertiary";
          iconBg = "bg-tertiary-container/30";
        } else if (isOut) {
          badgeTitle = "转出代币";
          badgeColor = "bg-error/10 text-error border-error/20";
          dirIcon = "arrow_outward";
          dirColor = "text-error";
          iconBg = "bg-error-container/20";
        } else {
          badgeTitle = "收到代币";
          badgeColor = "bg-tertiary/15 text-tertiary border-tertiary/30";
          dirIcon = "arrow_downward";
          dirColor = "text-tertiary";
          iconBg = "bg-tertiary-container/30";
        }

        return `
          <div class="flex items-center justify-between p-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-white/5 transition-colors">
            <div class="flex items-center space-x-3 min-w-0">
              <div class="relative w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined ${dirColor} text-[20px]">${dirIcon}</span>
                <span class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface-container-highest flex items-center justify-center text-[9px] font-bold text-on-surface">₮</span>
              </div>
              <div class="flex flex-col min-w-0">
                <div class="flex items-center space-x-2">
                  <span class="font-bold text-xs text-on-surface truncate">${badgeTitle}</span>
                  <span class="inline-flex items-center px-1.5 py-0.2 rounded-full ${badgeColor} text-[10px] font-bold border">
                    区块 #${tx.blockNumber}
                  </span>
                </div>
                <div class="flex items-center space-x-1.5 text-on-surface-variant font-mono text-[11px] pt-1">
                  <span title="${tx.transactionHash}">${shortenAddress(tx.transactionHash)}</span>
                  <span>·</span>
                  <span>${timeAgo(tx.timestamp)}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end shrink-0 ml-3">
              <span class="font-mono text-sm font-bold ${amtColor}">${amtSign}${tx.amountFormatted} MCTK</span>
              <span class="text-[10px] text-on-surface-variant/80">From: ${shortenAddress(tx.from)}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  container.innerHTML = `
    <!-- Header with Filter Chips -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <span class="material-symbols-outlined text-primary text-[20px]">receipt_long</span>
        <h2 class="text-sm font-bold text-on-surface tracking-tight">转账与存取款记录 (Indexer 实时查询)</h2>
      </div>
      <button class="flex items-center text-xs text-primary hover:text-primary-fixed gap-1 p-1" id="btn-refresh-tx">
        <span class="material-symbols-outlined text-[16px] ${state.transfersLoading ? "spin-animate" : ""}">refresh</span>
        <span>刷新</span>
      </button>
    </div>

    <!-- Quick Filters -->
    <div class="flex items-center space-x-2 overflow-x-auto py-1">
      <button class="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
        state.txFilter === "all"
          ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_8px_rgba(208,188,255,0.15)]"
          : "bg-surface-container text-on-surface-variant border-white/5 hover:text-on-surface"
      }" id="filter-all">全部 (${state.transfersTotal})</button>
      <button class="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
        state.txFilter === "out"
          ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_8px_rgba(208,188,255,0.15)]"
          : "bg-surface-container text-on-surface-variant border-white/5 hover:text-on-surface"
      }" id="filter-out">存入 / 转出</button>
      <button class="px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
        state.txFilter === "in"
          ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_8px_rgba(208,188,255,0.15)]"
          : "bg-surface-container text-on-surface-variant border-white/5 hover:text-on-surface"
      }" id="filter-in">提取 / 转入</button>
    </div>

    <!-- Transaction List -->
    <div class="flex flex-col space-y-2">
      ${listHtml}
    </div>
  `;

  document.getElementById("btn-refresh-tx")?.addEventListener("click", () => {
    checkIndexerStatus();
    fetchTransfers();
  });
  document.getElementById("filter-all")?.addEventListener("click", () => {
    state.txFilter = "all";
    fetchTransfers();
  });
  document.getElementById("filter-out")?.addEventListener("click", () => {
    state.txFilter = "out";
    fetchTransfers();
  });
  document.getElementById("filter-in")?.addEventListener("click", () => {
    state.txFilter = "in";
    fetchTransfers();
  });
}

// 整体应用结构渲染
function renderApp() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <!-- Toast Notification Container -->
    <div id="toast-container" class="fixed top-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none"></div>

    <!-- Header Navigation -->
    <header class="fixed top-0 w-full z-40 bg-surface/85 backdrop-blur-xl border-b border-white/5">
      <div class="max-w-4xl mx-auto h-16 px-4 flex items-center justify-between gap-2">
        <!-- Brand Logo & Title -->
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-[0_0_12px_rgba(208,188,255,0.3)] shrink-0">
            <span class="material-symbols-outlined text-surface font-bold text-[22px]">account_balance</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-headline text-base text-on-surface font-bold tracking-tight truncate">TokenBank</span>
            <span class="text-[10px] text-primary/80 font-mono uppercase tracking-wider">CalledToken DeFi Vault</span>
          </div>
        </div>

        <!-- Header Actions: Network & MetaMask Connection -->
        <div id="header-actions" class="flex items-center gap-2 shrink-0"></div>
      </div>
    </header>

    <!-- Main Body -->
    <main class="flex-1 flex flex-col w-full max-w-4xl mx-auto pt-20 pb-20 px-4 space-y-5">
      <!-- 1. Vault Overview Card -->
      <div id="overview-card" class="relative w-full rounded-2xl bg-surface-container p-5 shadow-xl border border-white/5 overflow-hidden"></div>

      <!-- 2. Staking & Withdrawal Console -->
      <div id="console-card" class="flex flex-col w-full rounded-2xl bg-surface-container-low p-5 shadow-lg border border-white/5 space-y-4"></div>

      <!-- 3. Transaction History Feed (from indexer.js) -->
      <div id="transfers-card" class="flex flex-col space-y-3 w-full rounded-2xl bg-surface-container-low p-5 border border-white/5"></div>
    </main>

    <!-- Footer -->
    <footer class="w-full border-t border-white/5 py-4 text-center text-xs text-on-surface-variant">
      <span>MyPermitToken & CalledToken & TokenBank · MetaMask 纯钱包交互 · 支持 EIP-2612 Permit 签名存款</span>
    </footer>
  `;

  renderHeader();
  renderOverview();
  renderConsole();
  renderTransfers();
}

// 启动执行
window.addEventListener("DOMContentLoaded", init);
