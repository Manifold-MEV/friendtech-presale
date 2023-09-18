import { parseEther, parseGwei } from "viem";
import { iFriendtechSharesV1ABI, friendTechProxyABI } from "../../src/gen/generated";
import { cast0x } from "../utils/utils";
import FriendTechProxy from "../../out/FriendTechProxy.sol/FriendTechProxy.json";
import { test, describe, before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { anvilFork, walletClient, publicClient, testClient } from "../utils/common";

describe("FriendTech Proxy Tests", { concurrency: false }, async () => {
    let testId: `0x${string}`;
    let ownerOfProxyContract: `0x${string}`;
    let account1: `0x${string}`;
    let account2: `0x${string}`;
    let account3: `0x${string}`;
    let proxyContractAddress: `0x${string}`;
    const friendTechContractAddress : `0x${string}` = "0xCF205808Ed36593aa40a44F10c7f7C2F67d4A4d4";

    before(async () => {
      await anvilFork.start();
      await testClient.reset();
    })
  
    beforeEach(async () => {
      ownerOfProxyContract = (await walletClient.getAddresses())[0];
      account1 = (await walletClient.getAddresses())[1];
      account2 = (await walletClient.getAddresses())[2];
      account3 = (await walletClient.getAddresses())[2];

      await testClient.setBalance({
        address: ownerOfProxyContract,
        value: parseEther('50')
      })
      await testClient.setBalance({
        address: account1,
        value: parseEther('50')
      })
      await testClient.setBalance({
        address: account2,
        value: parseEther('50')
      })
      await testClient.setBalance({
        address: account3,
        value: parseEther('50')
      })
      await testClient.mine({ blocks: 1 })

      const friendTechProxyHash = await walletClient.deployContract({
        abi: friendTechProxyABI,
        account: ownerOfProxyContract,
        bytecode: cast0x(FriendTechProxy.bytecode.object),
        args: [],
      });
      await testClient.mine({ blocks: 1 })
      const txr = await publicClient.getTransactionReceipt({ hash: friendTechProxyHash });
      assert.strictEqual(txr.status, "success");
  
      proxyContractAddress = txr.contractAddress!;

      testId = await testClient.snapshot();
    });
  
    afterEach(async () => {
      await testClient.reset();
    });
    after(async () => {
      await anvilFork.stop();
    });

    test("Snipe into proxy test", async () => {
        const buyFirstShareRequest = await publicClient.simulateContract({
            account: account1,
            address: friendTechContractAddress,
            abi: iFriendtechSharesV1ABI,
            functionName: "buyShares",
            args: [account1, 1n],
            maxFeePerGas: parseGwei("0.17"),
            maxPriorityFeePerGas: parseGwei("0.17"),
            gas: 3000000n
        })

        await walletClient.writeContract(buyFirstShareRequest.request);
        // await testClient.mine({ blocks: 1 })

        const shareRead1 = await publicClient.readContract({
            address: friendTechContractAddress,
            abi: iFriendtechSharesV1ABI,
            functionName: "sharesBalance",
            args: [account1, account1]
        })

        assert.equal(shareRead1, 1n);

        const sharesToSnipe = 30n
        const priceRead1 : bigint = await publicClient.readContract({
            address: friendTechContractAddress,
            abi: iFriendtechSharesV1ABI,
            functionName: "getBuyPriceAfterFee",
            args: [account1, sharesToSnipe]
        }) as bigint

        // Revert with correct error - not enough ETH
        try {
            await publicClient.simulateContract({
                account: account1,
                address: proxyContractAddress,
                abi: friendTechProxyABI,
                functionName: "snipeShares",
                args: [sharesToSnipe],
                maxFeePerGas: parseGwei("0.17"),
                maxPriorityFeePerGas: parseGwei("0.17"),
                gas: 3000000n,
                value: priceRead1 - 1n
            })
        } catch (e) {
          assert(String(e).includes("Not enough ETH received"))
        }

        const snipeShareRequest = await publicClient.simulateContract({
          account: account1,
          address: proxyContractAddress,
          abi: friendTechProxyABI,
          functionName: "snipeShares",
          args: [sharesToSnipe],
          maxFeePerGas: parseGwei("0.17"),
          maxPriorityFeePerGas: parseGwei("0.17"),
          gas: 3000000n,
          value: priceRead1
        })

        await walletClient.writeContract(snipeShareRequest.request);
        await testClient.mine({ blocks: 1 })

        const shareRead2 = await publicClient.readContract({
          address: friendTechContractAddress,
          abi: iFriendtechSharesV1ABI,
          functionName: "sharesBalance",
          args: [account1, proxyContractAddress]
        })

        assert.equal(shareRead2, sharesToSnipe);

        const internalBalanceRead1 = await publicClient.readContract({
          address: proxyContractAddress,
          abi: friendTechProxyABI,
          functionName: "internalBalances",
          args: [account1, account1]
        })

        assert.equal(internalBalanceRead1, sharesToSnipe);
    })

    test("Transfer tests", async () => {
      // Initialize account1 market
      const buyFirstShareRequest = await publicClient.simulateContract({
          account: account1,
          address: friendTechContractAddress,
          abi: iFriendtechSharesV1ABI,
          functionName: "buyShares",
          args: [account1, 1n],
          maxFeePerGas: parseGwei("0.17"),
          maxPriorityFeePerGas: parseGwei("0.17"),
          gas: 3000000n
      })

      await walletClient.writeContract(buyFirstShareRequest.request);

      // Initialize account2 market
      const buyFirstShareRequest2 = await publicClient.simulateContract({
        account: account2,
        address: friendTechContractAddress,
        abi: iFriendtechSharesV1ABI,
        functionName: "buyShares",
        args: [account2, 1n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(buyFirstShareRequest2.request);

      const sharesToSnipe = 30n
      const priceRead1 : bigint = await publicClient.readContract({
          address: friendTechContractAddress,
          abi: iFriendtechSharesV1ABI,
          functionName: "getBuyPriceAfterFee",
          args: [account1, sharesToSnipe]
      }) as bigint

      // account2 buy account1 using proxy contract
      const snipeShareRequest = await publicClient.simulateContract({
        account: account2,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "snipeShares",
        args: [sharesToSnipe],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n,
        value: priceRead1
      })

      await walletClient.writeContract(snipeShareRequest.request);
      await testClient.mine({ blocks: 1 })

      // account3 try to transfer but fail because it doesn't have any shares
      try {
        await publicClient.simulateContract({
          account: account3,
          address: proxyContractAddress,
          abi: friendTechProxyABI,
          functionName: "transferShares",
          args: [account1, account2, 1n],
          maxFeePerGas: parseGwei("0.17"),
          maxPriorityFeePerGas: parseGwei("0.17"),
          gas: 3000000n
        })
      } catch (e) {
        assert(String(e).includes("Not enough shares to transfer"))
      }

      // account2 transfer some account1 to account3
      const transferRequest1 = await publicClient.simulateContract({
        account: account2,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "transferShares",
        args: [account3, account1, 1n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(transferRequest1.request);
      await testClient.mine({ blocks: 1 })

      const internalBalanceRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account3]
      })

      assert.equal(internalBalanceRead1, 1n);

      const internalBalanceRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account2]
      })

      assert.equal(internalBalanceRead2, 29n);

      // account2 transferMany account1 & account2 to account3
    })
})