import {
  Clarinet,
  Tx,
  Chain,
  Account,
  types,
} from "https://deno.land/x/clarinet@v0.14.0/index.ts";
import { assertEquals } from "https://deno.land/std@0.90.0/testing/asserts.ts";

interface RentalItem {
    owner: String,
    renter: String,
    "end-height": String,
    price: String,
    "rental-length": String,
}

Clarinet.test({
  name: "List an NFT",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    assertEquals(block.receipts[0].events[0].type, "nft_mint_event");

    // Next, list the NFT for rental
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "offer-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(100),
          types.uint(20),
          types.uint(10),
        ],
        nftOwner.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    assertEquals(block.receipts[0].events[0].type, "nft_transfer_event");
    let nftTransferEvent = block.receipts[0].events[0].nft_transfer_event;
    assertEquals(nftTransferEvent.sender, nftOwner.address);
    assertEquals(nftTransferEvent.recipient, `${deployer.address}.rental`);

    // Finally, check that the metadata is stored correctly
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "get-rental-item",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        nftOwner.address
      ),
    ]);
    let rentalItem = block.receipts[0].result.expectSome().expectTuple() as RentalItem;
    rentalItem["owner"].expectPrincipal(nftOwner.address);
    rentalItem["renter"].expectNone();
    rentalItem["end-height"].expectUint(100);
    rentalItem["price"].expectUint(20);
    rentalItem["rental-length"].expectUint(10);
  },
});

Clarinet.test({
    name: "List an NFT that you do not own",
    async fn(chain: Chain, accounts: Map<string, Account>) {
      const deployer = accounts.get("deployer")!;
      const nftOwner = accounts.get("wallet_1")!;
      const nftRenter = accounts.get("wallet_2")!;
  
      // List the NFT for rental
      let block = chain.mineBlock([
        Tx.contractCall(
          "rental",
          "offer-nft",
          [
            types.principal(`${deployer.address}.zebra`),
            types.uint(1),
            types.uint(100),
            types.uint(20),
            types.uint(10),
          ],
          nftOwner.address
        ),
      ]);
      block.receipts[0].result.expectErr().expectUint(100);
    },
  });  
