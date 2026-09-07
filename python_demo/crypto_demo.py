import os
import sys
import glob
import hashlib

# 自动兼容本地 .venv 环境（免去手动 source 激活虚拟环境的麻烦）
venv_pkgs = glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".venv/lib/python*/site-packages"))
if venv_pkgs and venv_pkgs[0] not in sys.path:
    sys.path.insert(0, venv_pkgs[0])

try:
    from cryptography.hazmat.primitives.asymmetric import rsa, ec, padding
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.exceptions import InvalidSignature
except ImportError:
    print("❌ 缺少 cryptography 库，请先执行: pip install cryptography")
    sys.exit(1)


def get_pow_message() -> str:
    """
    获取满足 5 个 0 开头的 PoW 字符串
    在 pow_demo.py 中计算得到的 Nonce 为 1587678
    """
    prefix = "tiny"
    nonce = 1587678
    message = f"{prefix}{nonce}"
    hash_val = hashlib.sha256(message.encode("utf-8")).hexdigest()
    
    assert hash_val.startswith("00000"), "Hash 不满足 5 个 0 开头"
    print("=" * 70)
    print("【1. 目标消息（来自 PoW 结果）】")
    print(f"原始消息内容: '{message}'")
    print(f"SHA-256 哈希: {hash_val}")
    print("=" * 70)
    return message


def demo_rsa(message_bytes: bytes):
    """
    演示 RSA 非对称加密签名与验签
    """
    print("\n" + "=" * 70)
    print("【2. RSA 非对称签名与验签实践】")
    print("=" * 70)
    
    # 1. 生成 RSA 密钥对 (2048 位)
    print("[1] 正在生成 RSA 2048 位密钥对...")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    public_key = private_key.public_key()
    
    # 格式化导出 PEM 便于查看
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")
    
    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")
    
    print(f"   RSA 私钥预览:\n{pem_private.splitlines()[0]} ... {pem_private.splitlines()[-1]}")
    print(f"   RSA 公钥预览:\n{pem_public.strip()}")

    # 2. 使用私钥签名 (SHA-256 + PSS 填充)
    print("\n[2] 使用【私钥】对消息进行签名 (SHA-256 + PSS Padding)...")
    signature = private_key.sign(
        message_bytes,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH
        ),
        hashes.SHA256()
    )
    print(f"   签名生成成功 (长度: {len(signature)} 字节 / {len(signature) * 8} 位)")
    print(f"   签名十六进制: {signature.hex()[:64]}...[已截断显示]")

    # 3. 使用公钥验签 - 正常情况
    print("\n[3] 使用【公钥】验证签名...")
    try:
        public_key.verify(
            signature,
            message_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        print("   ✅ RSA 验签成功！证实该消息确实由持有私钥方签署且未被篡改。")
    except InvalidSignature:
        print("   ❌ 验签失败！")

    # 4. 防篡改测试 - 篡改消息后的验签
    tampered_message = message_bytes + b"_tampered"
    print(f"\n[4] 防篡改安全测试: 将消息篡改为 '{tampered_message.decode()}'，再次尝试用公钥验证...")
    try:
        public_key.verify(
            signature,
            tampered_message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        print("   ❌ 漏洞：篡改内容居然验签通过！")
    except InvalidSignature:
        print("   🛡️ 防篡改生效：捕获到 InvalidSignature 异常，篡改数据被成功拦截拒绝！")


def demo_ecc(message_bytes: bytes):
    """
    演示 ECC (椭圆曲线密码学 - SECP256k1) 签名与验签
    SECP256k1 是比特币/以太坊等区块链网络采用的核心椭圆曲线
    """
    print("\n" + "=" * 70)
    print("【3. ECC (ECDSA 椭圆曲线) 签名与验签实践 - SECP256k1】")
    print("=" * 70)
    
    # 1. 生成 ECC 密钥对
    print("[1] 正在生成 ECC (SECP256k1) 密钥对...")
    private_key = ec.generate_private_key(ec.SECP256K1())
    public_key = private_key.public_key()
    
    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")
    print(f"   ECC 公钥:\n{pem_public.strip()}")

    # 2. 使用私钥签名 (ECDSA + SHA-256)
    print("\n[2] 使用【私钥】对消息进行 ECDSA 签名 (SHA-256)...")
    signature = private_key.sign(
        message_bytes,
        ec.ECDSA(hashes.SHA256())
    )
    print(f"   签名生成成功 (ECDSA 签名长度: {len(signature)} 字节，显著短于 RSA)")
    print(f"   签名十六进制: {signature.hex()}")

    # 3. 使用公钥验证
    print("\n[3] 使用【公钥】验证 ECDSA 签名...")
    try:
        public_key.verify(
            signature,
            message_bytes,
            ec.ECDSA(hashes.SHA256())
        )
        print("   ✅ ECC 验签成功！证明由私钥所有者签署，且数据完整。")
    except InvalidSignature:
        print("   ❌ 验签失败！")

    # 4. 防篡改测试
    tampered_message = b"tiny1587679"  # 更改了一个数字
    print(f"\n[4] 防篡改安全测试: 将消息微调为 '{tampered_message.decode()}'，再次尝试用公钥验证...")
    try:
        public_key.verify(
            signature,
            tampered_message,
            ec.ECDSA(hashes.SHA256())
        )
        print("   ❌ 漏洞：篡改内容居然验签通过！")
    except InvalidSignature:
        print("   🛡️ 防篡改生效：捕获到 InvalidSignature 异常，椭圆曲线签名有效识别出篡改！")


def main():
    # 获取由 5 个 0 开头的 PoW 字符串
    message_str = get_pow_message()
    message_bytes = message_str.encode("utf-8")
    
    # 演示 RSA 方案
    demo_rsa(message_bytes)
    
    # 演示 ECC 方案（区块链主流）
    demo_ecc(message_bytes)


if __name__ == "__main__":
    main()
