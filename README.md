# FriendTech Proxy Contract

These are open-source smart contracts for anyone to build on top of.

Feel free to fork and build more features and/or build a UI to allow people to use easily!

Why are we building this?
- We want to do our part in adding value to the community.
- A significant pain point in FriendTech right now is that big accounts can't launch without getting sniped by bots.
- Bots take profit and usually take value out of the ecosystem, which is not helpful for growth.
- Snipe prevention on its own is cool, but it actually gates other users from entering at early prices because the creator hoards the early keys.
- Creators have no way of distributing to loyal fans / creating a diverse group of key holders.

## Build instructions

```
// Build contracts
npm run build
// Test
npm run test
```

NOTE: This repository is a work in progress. Use at your own risk.

## Documentation

In general, any user can buy or sell keys into the proxy contract. Keys that are bought using the proxy contract are transferrable. Note that keys that were bought directly on the platform still won't be transferrable.
The proxy contract holds the keys and maps the amount of keys it holds for a user for any number of accounts. Users that own keys on the proxy contract won't gain direct access to FriendTech rooms and they won't qualify for points.

However, transferrability of keys has many use cases.
1. Keys can be gifted to friends
2. Self-sniped keys can be distributed for free and/or via presales for fairer launches
3. Keys can be used by external protocols and platforms (e.g. lend/borrow) to build a wider ecosystem on top of FriendTech outside of simple analytics/tooling

### Functions

#### Reading Balances

`internalBalances(address _sharesSubject, address _holder)`
- Returns a `uint256` representing the number of keys that `_holder` has of `_sharesSubject`

#### Core write functions

`transferShares(address _sharesSubject, address _to, uint256 _amount)`
- `msg.sender` transfers `_amount` shares of `_sharesSubject` that they own on the proxy contract to `_to`
- Reverts if `msg.sender` does not have enough shares of `_sharesSubject` that they are trying to transfer

`transferMany(address[] calldata _sharesSubjects, address[] calldata _toAddresses, uint256[] calldata _amounts)`
- Same as `transferShares` but allows for bulk transfers

`approve(address _sharesSubject, address _to, uint256 _amount)`
- `msg.sender` approves `_to` address to transfer `_amount` shares of `_sharesSubject`
- This function allows users to approve external platforms to transfer their shares within the proxy contract
- Similar to the `approve` functionality on ERC20 contracts

`transferFrom(address _sharesSubject, address _from, address _to, uint256 _amount)`
- Transfers `_amount` shares of `_sharesSubject` from `_from` address to `_to` address
- Reverts if `_from` address has not approved `msg.sender` to transfer at least the `_amount` of shares specified

`buyShares(address _sharesSubject, address _to, uint256 _amount)`
- Payable function that buys `_amount` shares of `_sharesSubject` to `_to` address through the FriendTech smart contract
- Reverts if not enough ETH sent to cover the cost of the shares

`sellShares(address _sharesSubject, address _to, uint256 _amount)`
- Sells `_amount` shares of `_sharesSubject` held by `msg.sender` and sends the ETH to `_to` address
- Reverts if `msg.sender` does not hold enough shares of `_sharesSubject` within the proxy contract

#### Presale-specific write functions

`setPresalePrice(uint256 _price)`
- Sets `_price` (in wei) per key of presale for `msg.sender`

`setWhitelist(address[] calldata _addresses, uint256[] calldata _keysAllowed)`
- Sets whitelist for presale for `msg.sender`
- Can set limits on keys allowed to be bought per address

`contribute(address _sharesSubject, uint256 _keys)`
- Allows user to contribute to a presale for `_sharesSubject` for a specific number of `_keys`
- Reverts if the user is not whitelisted for the number of `_keys` they are trying to purchase or if they don't send enough ETH in `msg.value`

`claimProceeds()`
- `msg.sender` claims all proceeds for their presale, receiving the ETH contributed from users
- Reverts if `msg.sender` has not settled the presale contributors

`settleContributors()`
- `msg.sender` settles all contributors in the presale, transferring them the corresponding number of keys that they purchased
- Reverts if presale has already been settled
- Receiver of the key(s) can hold/transfer/sell the key(s)
- If account creator wants to impose some sort of pre-communicated lockup, they can do so by calling this function later. However, they won't be able to claim proceeds until this function has been called in order to ensure settlement to contributors.

## Deployments

Base: `0x1a7D3f98036CB9FbE658e21c0EBF2482f535cf06`

You can find the verified code on: https://basescan.org/address/0x1a7D3f98036CB9FbE658e21c0EBF2482f535cf06#code
