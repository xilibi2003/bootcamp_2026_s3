// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BaseERC20
 * @dev 满足 ERC20 标准的基础代币合约，适合在 Remix 中直接编译与测试
 */
contract BaseERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev 构造函数：部署时分配初始代币给部署者
     * 若未传参（或传空/0），使用默认值: "BaseERC20", "BERC", 1000000 代币
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    ) {
        name = bytes(_name).length > 0 ? _name : "BaseERC20";
        symbol = bytes(_symbol).length > 0 ? _symbol : "BERC";
        decimals = 18;

        uint256 supply = _initialSupply > 0 ? _initialSupply : 1_000_000;
        _mint(msg.sender, supply * (10 ** uint256(decimals)));
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");

        unchecked {
            allowance[from][msg.sender] = currentAllowance - amount;
        }

        return _transfer(from, to, amount);
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal returns (bool) {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");

        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }

        emit Transfer(from, to, amount);
        return true;
    }

    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: mint to the zero address");

        totalSupply += amount;
        unchecked {
            balanceOf[account] += amount;
        }

        emit Transfer(address(0), account, amount);
    }
}
