// SPDX-License-Identifier: MIT-LICENSE

pragma solidity >=0.7.6;
pragma abicoder v2;

import {SafeMath} from "./libraries/SafeMath.sol";
import {Ownable} from "./Ownable.sol";
import {IFriendtechSharesV1} from "./interfaces/IFriendtechSharesV1.sol";
import {IERC20} from "./interfaces/IERC20.sol";

contract FriendTechProxy is Ownable {
    using SafeMath for uint256;

    IFriendtechSharesV1 public constant friendTech = IFriendtechSharesV1(0xCF205808Ed36593aa40a44F10c7f7C2F67d4A4d4);
    // Internal Key Balances for SharesSubject => (User => Balance)
    mapping(address => mapping(address => uint256)) public internalBalances;
    // Internal Key Approvals for SharesSubject => (User => (Approvee => Balance))
    mapping(address => mapping(address => mapping(address => uint256))) public approvals;
    // Whitelist for SharesSubject => (Buyer => keysAllowed)
    mapping(address => mapping(address => uint256)) public whitelist;
    // Contributions for SharesSubject => (Buyer => keysBought)
    mapping(address => mapping(address => uint256)) public contributions;
    // SharesSubject => keyPrice
    mapping(address => uint256) public presalePricePerKey;
    // SharesSubject => proceeds
    mapping(address => uint256) public proceeds;
    // SharesSubject => Arr of Contribution
    mapping (address => Contribution[]) public contributionArrays;
    // SharesSubject => number of settlements
    mapping(address => uint256) public presaleSettled;

    struct Contribution {
        address buyer;
        uint256 keysBought;
    }

    event Transfer(address indexed sharesSubject, address indexed from, address indexed to, uint256 value);
    event Approval(address indexed sharesSubject, address indexed from, address indexed to, uint256 value);

    receive() external payable {}

    fallback() external payable {}

    // If for some reason ERC20 tokens of value gets transferred into this contract, allow withdrawal
    function emergencyWithdraw(address _token, address _to, uint256 _amount) external onlyOwner {
        if (_token == 0x0000000000000000000000000000000000000000) {
            (bool sent, ) = payable(_to).call{value: _amount}("");
            require(sent, "Error sending Ether!");
        } else {
            IERC20(_token).transfer(_to, _amount);
        }
    }

    function snipeShares(uint256 _amount) public payable {
        uint256 buyPrice = friendTech.getBuyPriceAfterFee(msg.sender, _amount);
        require(buyPrice <= msg.value, "Not enough ETH received");
        friendTech.buyShares{value: buyPrice}(msg.sender, _amount);
        internalBalances[msg.sender][msg.sender] = _amount;

        (bool sent, ) = payable(msg.sender).call{value: msg.value.sub(buyPrice)}("");
        require(sent, "Failed to send Ether!");

        emit Transfer(msg.sender, address(0), msg.sender, _amount);
    }

    function _transfer(address _sharesSubject, address _from, address _to, uint256 _amount) internal {
        internalBalances[_sharesSubject][_from] = internalBalances[_sharesSubject][_from].sub(_amount);
        internalBalances[_sharesSubject][_to] = internalBalances[_sharesSubject][_to].add(_amount);

        emit Transfer(_sharesSubject, _from, _to, _amount);
    }

    function _approve(address _sharesSubject, address _from, address _to, uint256 _amount) internal {
        approvals[_sharesSubject][_from][_to] = _amount;
        
        emit Approval(_sharesSubject, _from, _to, _amount);
    }

    // Transfers shares from current owner to receiver. Can be used for gifting or distributing shares.
    function transferShares(address _sharesSubject, address _to, uint256 _amount) external {
        require(_amount <= internalBalances[_sharesSubject][msg.sender], "Not enough shares to transfer");
        _transfer(_sharesSubject, msg.sender, _to, _amount);
    }

    // Bulk transfers
    function transferMany(address[] calldata _sharesSubjects, address[] calldata _toAddresses, uint256[] calldata _amounts) external {
        for(uint i=0; i<_sharesSubjects.length; i++) {
            require(_amounts[i] <= internalBalances[_sharesSubjects[i]][msg.sender], "Not enough shares to transfer");
            _transfer(_sharesSubjects[i], msg.sender, _toAddresses[i], _amounts[i]);
        }
    }

    function _spendAllowance(address _sharesSubject, address _owner, address _spender, uint256 _amount) internal {
        uint256 currentAllowance = approvals[_sharesSubject][_owner][_spender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= _amount, "Not enough approved");
            _approve(_sharesSubject, _owner, _spender, currentAllowance.sub(_amount));
        }
    }

    // Transfers from address, spends allowance
    function transferFrom(address _sharesSubject, address _from, address _to, uint256 _amount) external {
        address spender = msg.sender;
        _spendAllowance(_sharesSubject, _from, spender, _amount);
        _transfer(_sharesSubject, _from, _to, _amount);
    }

    // Approve shares from current owner to aprove.
    function approve(address _sharesSubject, address _to, uint256 _amount) external {
        _approve(_sharesSubject, msg.sender, _to, _amount);
    }

    // Bulk approvals
    function approveMany(address[] calldata _sharesSubjects, address[] calldata _toAddresses, uint256[] calldata _amounts) external {
        for(uint i=0; i<_sharesSubjects.length; i++) {
            _approve(_sharesSubjects[i], msg.sender, _toAddresses[i], _amounts[i]);
        }
    }

    // Set presale price
    function setPresalePrice(uint256 _price) external {
        presalePricePerKey[msg.sender] = _price;
    }

    // Contribute to presale
    function contribute(address _sharesSubject, uint256 _keys) external payable {
        require(whitelist[_sharesSubject][msg.sender] >= _keys, "Not whitelisted");
        uint256 amount = _keys.mul(presalePricePerKey[_sharesSubject]);
        require(msg.value >= amount, "Not enough ETH");
        whitelist[_sharesSubject][msg.sender] = whitelist[_sharesSubject][msg.sender].sub(_keys);
        contributions[_sharesSubject][msg.sender] = contributions[_sharesSubject][msg.sender].add(_keys);
        contributionArrays[_sharesSubject].push(Contribution({
            buyer: msg.sender,
            keysBought: _keys
        }));
        proceeds[_sharesSubject] = proceeds[_sharesSubject].add(msg.value);

        (bool sent, ) = payable(msg.sender).call{value: msg.value.sub(amount)}("");
        require(sent, "Failed to send Ether!");

    }

    // Set whitelist
    function setWhitelist(address[] calldata _addresses, uint256[] calldata _keysAllowed) external {
        for(uint i=0; i<_addresses.length; i++) {
            whitelist[msg.sender][_addresses[i]] = _keysAllowed[i];
        }
    }

    // Creator claim proceeds
    function claimProceeds() external {
        require(presaleSettled[msg.sender] >= contributionArrays[msg.sender].length, "Presale not settled");
        uint256 amount = proceeds[msg.sender];
        proceeds[msg.sender] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "Failed to send Ether");
    }

    // Bulk settle presale contributors. Won't work if you did too massive of a presale but this is unlikely given FriendTech bonding curve being exponential
    function settleContributors() external {
        require(presaleSettled[msg.sender] == 0, "Already settled");
        for (uint i=0; i<contributionArrays[msg.sender].length; i++) {
            Contribution memory c = contributionArrays[msg.sender][i];
            _transfer(msg.sender, msg.sender, c.buyer, c.keysBought);
        }
        presaleSettled[msg.sender] = contributionArrays[msg.sender].length;
    }

    // In case we get massive arrays
    function settleContributorsSpecific(uint256 _start, uint256 _end) external {
        for (uint i=_start; i<_end; i++) {
            Contribution storage c = contributionArrays[msg.sender][i];
            require(c.buyer != address(0), "Already settled user");
            _transfer(msg.sender, msg.sender, c.buyer, c.keysBought);
            c.buyer = address(0);
        }
        presaleSettled[msg.sender] = presaleSettled[msg.sender].add(_end).sub(_start);
    }

    // Buy shares for yourself or someone else on proxy contract
    function buyShares(address _sharesSubject, address _to, uint256 _amount) external payable {
        uint256 buyPrice = friendTech.getBuyPriceAfterFee(_sharesSubject, _amount);
        require(buyPrice <= msg.value, "Not enough ETH received");
        friendTech.buyShares{value: buyPrice}(_sharesSubject, _amount);
        internalBalances[_sharesSubject][_to] = internalBalances[_sharesSubject][_to].add(_amount);

        (bool sent, ) = payable(msg.sender).call{value: msg.value.sub(buyPrice)}("");
        require(sent, "Failed to send Ether!");

        emit Transfer(_sharesSubject, address(0), _to, _amount);
    }

    // Sell your shares on proxy contract and receive proceeds to specified address
    function sellShares(address _sharesSubject, address _to, uint256 _amount) external {
        require(_amount <= internalBalances[_sharesSubject][msg.sender], "Not enough shares to sell");
        internalBalances[_sharesSubject][msg.sender] = internalBalances[_sharesSubject][msg.sender].sub(_amount);
        uint256 sellPrice = friendTech.getSellPriceAfterFee(_sharesSubject, _amount);
        friendTech.sellShares(_sharesSubject, _amount);
        (bool sent,) = _to.call{value: sellPrice}("");
        require(sent, "Failed to send Ether");

        emit Transfer(_sharesSubject, msg.sender, address(0), _amount);
    }
}