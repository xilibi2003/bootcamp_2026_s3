import hashlib
import time

def find_pow(prefix: str, target_zeros: int, start_nonce: int = 0):
    """
    寻找满足指定前导0个数的 Nonce
    :param prefix: 基础数据字符串，如 "tiny"
    :param target_zeros: 目标前导 0 的数量
    :param start_nonce: 起始 nonce，默认从 0 开始
    """
    target_prefix = "0" * target_zeros
    nonce = start_nonce
    start_time = time.perf_counter()
    
    print(f"\n[开始计算] 目标: {target_zeros} 个前导 0 ('{target_prefix}')，基底: '{prefix}'")
    
    while True:
        # 拼接 "tiny" + nonce
        text = f"{prefix}{nonce}"
        # 计算 SHA-256 哈希值
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        
        # 检查是否以指定数量的 0 开头
        if digest.startswith(target_prefix):
            elapsed_time = time.perf_counter() - start_time
            print(f"✅ 找到满足条件的 Nonce！")
            print(f"   - 最终内容: '{text}'")
            print(f"   - Nonce 值: {nonce}")
            print(f"   - 哈希值:   {digest}")
            print(f"   - 尝试次数: {nonce - start_nonce + 1}")
            print(f"   - 耗费时间: {elapsed_time:.4f} 秒")
            if elapsed_time > 0:
                print(f"   - 算力估算: {(nonce - start_nonce + 1) / elapsed_time:,.0f} 次/秒 (H/s)")
            return nonce, digest, elapsed_time
        
        nonce += 1

def main():
    base_prefix = "tiny"
    print("=" * 60)
    print(f"PoW (Proof of Work) 挖矿模拟演示 (Base: '{base_prefix}')")
    print("=" * 60)
    
    # 1. 寻找 4 个 0 开头
    find_pow(base_prefix, target_zeros=4, start_nonce=0)
    
    # 2. 寻找 5 个 0 开头
    find_pow(base_prefix, target_zeros=5, start_nonce=0)

if __name__ == "__main__":
    main()
