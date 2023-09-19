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
      account3 = (await walletClient.getAddresses())[3];

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
      await testClient.mine({ blocks: 1 });

      const friendTechProxyHash = await walletClient.deployContract({
        abi: friendTechProxyABI,
        account: ownerOfProxyContract,
        bytecode: cast0x(FriendTechProxy.bytecode.object),
        args: [],
      });
      await testClient.mine({ blocks: 1 });
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
        await testClient.mine({ blocks: 1 });

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
        functionName: "buyShares",
        args: [account1, account2, sharesToSnipe],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n,
        value: priceRead1
      })

      await walletClient.writeContract(snipeShareRequest.request);
      await testClient.mine({ blocks: 1 });

      const priceRead2 : bigint = await publicClient.readContract({
        address: friendTechContractAddress,
        abi: iFriendtechSharesV1ABI,
        functionName: "getBuyPriceAfterFee",
        args: [account2, 1n]
      }) as bigint

      // account2 buy account1 using proxy contract
      const snipeShareRequest2 = await publicClient.simulateContract({
        account: account2,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "buyShares",
        args: [account2, account2, 1n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n,
        value: priceRead2
      })

      await walletClient.writeContract(snipeShareRequest2.request);
      await testClient.mine({ blocks: 1 });

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
        args: [account1, account3, 1n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(transferRequest1.request);
      await testClient.mine({ blocks: 1 });

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

      // account2 transferMany account1 & account2 to account3 & account1
      const transferManyRequest1 = await publicClient.simulateContract({
        account: account2,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "transferMany",
        args: [[account1, account2], [account3, account1], [29n, 1n]],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(transferManyRequest1.request);
      await testClient.mine({ blocks: 1 });

      const internalBalanceRead3 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account3]
      })

      assert.equal(internalBalanceRead3, 30n);

      const internalBalanceRead4 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account2, account1]
      })

      assert.equal(internalBalanceRead4, 1n);
    })

    test("Approval & transfer from tests", async () => {
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
        functionName: "buyShares",
        args: [account1, account2, sharesToSnipe],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n,
        value: priceRead1
      })

      await walletClient.writeContract(snipeShareRequest.request);
      await testClient.mine({ blocks: 1 });
      
      // account2 approve some account1 shares to account3
      const approveRequest1 = await publicClient.simulateContract({
        account: account2,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "approve",
        args: [account1, account3, 20n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(approveRequest1.request);
      await testClient.mine({ blocks: 1 });

      const approvalRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "approvals",
        args: [account1, account2, account3]
      })

      assert.equal(approvalRead1, 20n);

      // account3 try to transfer 30 but fail because they don't have enough approved
      try {
        await publicClient.simulateContract({
          account: account3,
          address: proxyContractAddress,
          abi: friendTechProxyABI,
          functionName: "transferFrom",
          args: [account1, account2, account3, 30n],
          maxFeePerGas: parseGwei("0.17"),
          maxPriorityFeePerGas: parseGwei("0.17"),
          gas: 3000000n
        })
      } catch (e) {
        assert(String(e).includes("Not enough approved"))
      }
      
      const transferFromRequest = await publicClient.simulateContract({
        account: account3,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "transferFrom",
        args: [account1, account2, account3, 20n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(transferFromRequest.request);
      await testClient.mine({ blocks: 1 });

      const approvalRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "approvals",
        args: [account1, account2, account3]
      })

      assert.equal(approvalRead2, 0n);

      const internalBalanceRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account2]
      })

      assert.equal(internalBalanceRead1, 10n);

      const internalBalanceRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account3]
      })

      assert.equal(internalBalanceRead2, 20n);
    })

    test("Buy and sell shares test", async () => {
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
        functionName: "buyShares",
        args: [account1, account2, sharesToSnipe],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n,
        value: priceRead1
      })

      await walletClient.writeContract(snipeShareRequest.request);
      await testClient.mine({ blocks: 1 });

      const shareRead1 = await publicClient.readContract({
        address: friendTechContractAddress,
        abi: iFriendtechSharesV1ABI,
        functionName: "sharesBalance",
        args: [account1, proxyContractAddress]
      })

      assert.equal(shareRead1, 30n);

      const internalBalanceRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account2]
      })

      assert.equal(internalBalanceRead1, 30n);

      const priceRead2 : bigint = await publicClient.readContract({
          address: friendTechContractAddress,
          abi: iFriendtechSharesV1ABI,
          functionName: "getSellPriceAfterFee",
          args: [account1, sharesToSnipe]
      }) as bigint

      // Try to sell more than the account owns
      try {
        await publicClient.simulateContract({
          account: account2,
          address: proxyContractAddress,
          abi: friendTechProxyABI,
          functionName: "sellShares",
          args: [account1, account2, 31n],
          maxFeePerGas: parseGwei("0.17"),
          maxPriorityFeePerGas: parseGwei("0.17"),
          gas: 3000000n
        })
      } catch (e) {
        assert(String(e).includes("Not enough shares to sell"))
      }

      // account2 sell account1 using proxy contract
      const sellSharesRequest = await publicClient.simulateContract({
        account: account2,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "sellShares",
        args: [account1, account2, sharesToSnipe],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(sellSharesRequest.request);
      await testClient.mine({ blocks: 1 });

      const internalBalanceRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account2]
      })

      assert.equal(internalBalanceRead2, 0n);

      const shareRead2 = await publicClient.readContract({
        address: friendTechContractAddress,
        abi: iFriendtechSharesV1ABI,
        functionName: "sharesBalance",
        args: [account1, proxyContractAddress]
      })

      assert.equal(shareRead2, 0n);

      const newBalance = await publicClient.getBalance({ 
        address: account2,
      })

      const delta = priceRead1 - priceRead2;
      const approxBalance = parseEther("50") - delta

      if (newBalance < approxBalance - parseEther("0.01") || newBalance > approxBalance + parseEther("0.01")) {
        assert(false)
      }
    })

    test("Presale tests", async () => {
      const setPresalePriceRequest = await publicClient.simulateContract({
        account: account1,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "setPresalePrice",
        args: [parseEther("0.1")],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(setPresalePriceRequest.request);
      await testClient.mine({ blocks: 1 });

      const presalePriceRead = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "presalePricePerKey",
        args: [account1]
      })

      assert.equal(presalePriceRead, parseEther("0.1"));

      const setWhiteListRequest = await publicClient.simulateContract({
        account: account1,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "setWhitelist",
        args: [[account2, account3], [1n, 2n]],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(setWhiteListRequest.request);
      await testClient.mine({ blocks: 1 });

      const whitelistRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "whitelist",
        args: [account1, account2]
      })

      assert.equal(whitelistRead1, 1n);

      const whitelistRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "whitelist",
        args: [account1, account3]
      })

      assert.equal(whitelistRead2, 2n);

      // Try to contribute with a non-whitelisted account
      try {
        await publicClient.simulateContract({
          account: account1,
          address: proxyContractAddress,
          abi: friendTechProxyABI,
          functionName: "contribute",
          args: [account1, 1n],
          maxFeePerGas: parseGwei("0.17"),
          maxPriorityFeePerGas: parseGwei("0.17"),
          gas: 3000000n
        })
      } catch (e) {
        assert(String(e).includes("Not whitelisted"))
      }

      // Try to contribute less than key price
      try {
        await publicClient.simulateContract({
          account: account3,
          address: proxyContractAddress,
          abi: friendTechProxyABI,
          functionName: "contribute",
          args: [account1, 2n],
          maxFeePerGas: parseGwei("0.17"),
          maxPriorityFeePerGas: parseGwei("0.17"),
          gas: 3000000n,
          value: parseEther("0.199")
        })
      } catch (e) {
        assert(String(e).includes("Not enough ETH"))
      }

      const contributeRequest1 = await publicClient.simulateContract({
        account: account2,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "contribute",
        args: [account1, 1n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n,
        value: parseEther("0.1")
      })

      await walletClient.writeContract(contributeRequest1.request);
      await testClient.mine({ blocks: 1 });

      const contributeRequest2 = await publicClient.simulateContract({
        account: account3,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "contribute",
        args: [account1, 2n],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n,
        value: parseEther("0.2")
      })

      await walletClient.writeContract(contributeRequest2.request);
      await testClient.mine({ blocks: 1 });

      const whitelistRead3 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "whitelist",
        args: [account1, account2]
      })

      assert.equal(whitelistRead3, 0n);

      const whitelistRead4 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "whitelist",
        args: [account1, account3]
      })

      assert.equal(whitelistRead4, 0n);

      const contributionsRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "contributions",
        args: [account1, account2]
      })

      assert.equal(contributionsRead1, 1n);

      const contributionsRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "contributions",
        args: [account1, account3]
      })

      assert.equal(contributionsRead2, 2n);

      const proceedsRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "proceeds",
        args: [account1]
      })

      assert.equal(proceedsRead1, parseEther("0.3"))

      const contributionsArrayRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "contributionArrays",
        args: [account1, 0]
      }) as any[]

      assert.equal(contributionsArrayRead1[0], account2)
      assert.equal(contributionsArrayRead1[1], 1n)

      const contributionsArrayRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "contributionArrays",
        args: [account1, 1]
      }) as any[]

      assert.equal(contributionsArrayRead2[0], account3)
      assert.equal(contributionsArrayRead2[1], 2n)

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

      const sharesToSnipe = 30n
      const priceRead1 : bigint = await publicClient.readContract({
          address: friendTechContractAddress,
          abi: iFriendtechSharesV1ABI,
          functionName: "getBuyPriceAfterFee",
          args: [account1, sharesToSnipe]
      }) as bigint
      
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
      await testClient.mine({ blocks: 1 });

      const settleContributorsRequest = await publicClient.simulateContract({
        account: account1,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "settleContributors",
        args: [],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(settleContributorsRequest.request);
      await testClient.mine({ blocks: 1 });

      const internalBalanceRead1 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account1]
      })

      assert.equal(internalBalanceRead1, 27n);

      const internalBalanceRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account2]
      })

      assert.equal(internalBalanceRead2, 1n);

      const internalBalanceRead3 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "internalBalances",
        args: [account1, account3]
      })

      assert.equal(internalBalanceRead3, 2n);
      
      const claimProceedsRequest = await publicClient.simulateContract({
        account: account1,
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "claimProceeds",
        args: [],
        maxFeePerGas: parseGwei("0.17"),
        maxPriorityFeePerGas: parseGwei("0.17"),
        gas: 3000000n
      })

      await walletClient.writeContract(claimProceedsRequest.request);
      await testClient.mine({ blocks: 1 });

      const proceedsRead2 = await publicClient.readContract({
        address: proxyContractAddress,
        abi: friendTechProxyABI,
        functionName: "proceeds",
        args: [account1]
      })

      assert.equal(proceedsRead2, 0n)

      const balance = await publicClient.getBalance({ 
        address: account1,
      })

      if (balance < parseEther("49.678") || balance > parseEther("49.68")) {
        assert(false)
      }
    })
})