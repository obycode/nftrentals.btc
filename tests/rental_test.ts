import {
  Clarinet,
  Tx,
  Chain,
  Account,
  types,
} from "https://deno.land/x/clarinet@v0.14.0/index.ts";
import { assertEquals } from "https://deno.land/std@0.90.0/testing/asserts.ts";

const err_nft_transfer_failed = 100;
const err_nft_not_found = 101;
const err_nft_not_rentable = 102;
const err_nft_already_rented = 103;
const err_price_too_low = 104;
const err_item_exists = 105;
const err_burn_failure = 106;
const err_forbidden = 107;
const err_mismatched_rental_length = 108;
const err_internal = 200;

declare global {
  interface Array<T> {
    expectNonFungibleTokenTransferEvent(
      assetId: String,
      sender: String,
      recipient: String,
      value: number
    ): Object;
    expectNonFungibleTokenMintEvent(
      assetId: String,
      recipient: String,
      value: number
    ): Object;
    expectNonFungibleTokenBurnEvent(
      token: String,
      sender: String,
      assetId: number
    ): Object;
  }

  interface Object {
    expectRentalItem(
      owner: String,
      endHeight: number,
      price: number,
      rentalLength: number,
      renter?: String
    ): Object;
  }
}

Array.prototype.expectNonFungibleTokenTransferEvent = function (
  assetId: String,
  sender: String,
  recipient: String,
  value: number
) {
  for (let event of this) {
    try {
      let e: any = {};
      e["assetId"] =
        event.nft_transfer_event.asset_identifier.expectPrincipal(assetId);
      e["sender"] = event.nft_transfer_event.sender.expectPrincipal(sender);
      e["recipient"] =
        event.nft_transfer_event.recipient.expectPrincipal(recipient);
      e["value"] = event.nft_transfer_event.value.expectUint(value);
      return e;
    } catch (error) {
      continue;
    }
  }
  throw new Error(`Unable to retrieve expected NonFungibleTokenTransferEvent`);
};

Array.prototype.expectNonFungibleTokenMintEvent = function (
  assetId: String,
  recipient: String,
  value: number
) {
  for (let event of this) {
    try {
      let e: any = {};
      e["assetId"] =
        event.nft_mint_event.asset_identifier.expectPrincipal(assetId);
      e["recipient"] =
        event.nft_mint_event.recipient.expectPrincipal(recipient);
      e["value"] = event.nft_mint_event.value.expectUint(value);
      return e;
    } catch (error) {
      continue;
    }
  }
  throw new Error(`Unable to retrieve expected NonFungibleTokenTransferEvent`);
};

Array.prototype.expectNonFungibleTokenBurnEvent = function (
  assetId: String,
  sender: String,
  value: number
) {
  for (let event of this) {
    try {
      let e: any = {};
      e["assetId"] =
        event.nft_burn_event.asset_identifier.expectPrincipal(assetId);
      e["sender"] = event.nft_burn_event.sender.expectPrincipal(sender);
      e["value"] = event.nft_burn_event.value.expectUint(value);
      return e;
    } catch (error) {
      continue;
    }
  }
  throw new Error(`Unable to retrieve expected NonFungibleTokenBurnEvent`);
};

Object.prototype.expectRentalItem = function (
  owner: String,
  endHeight: number,
  price: number,
  rentalLength: number,
  renter?: String
) {
  try {
    let item = this as RentalItem;
    item.owner.expectPrincipal(owner);
    if (renter) {
      item.renter.expectPrincipal(renter);
    } else {
      item.renter.expectNone();
    }
    item["end-height"].expectUint(endHeight);
    item.price.expectUint(price);
    item["rental-length"].expectUint(rentalLength);
    return item;
  } catch (err) {
    throw new Error(`Unable to retrieve rental item data: ${err}`);
  }
};

interface RentalItem {
  owner: String;
  renter: String;
  "end-height": String;
  price: String;
  "rental-length": String;
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
    block.receipts[0].events.expectNonFungibleTokenTransferEvent(
      `${deployer.address}.zebra::zebra`,
      nftOwner.address,
      `${deployer.address}.rental`,
      1
    );

    // Finally, check that the metadata is stored correctly
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "get-rental-item",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        nftOwner.address
      ),
    ]);
    block.receipts[0].result
      .expectSome()
      .expectTuple()
      .expectRentalItem(nftOwner.address, 100, 20, 10);
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
    block.receipts[0].result.expectErr().expectUint(err_nft_transfer_failed);
  },
});

Clarinet.test({
  name: "Rent an NFT",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Finally, rent it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectUint(1);
    block.receipts[0].events.expectSTXTransferEvent(
      20,
      nftRenter.address,
      nftOwner.address
    );
    block.receipts[0].events.expectNonFungibleTokenMintEvent(
      `${deployer.address}.rental::nftrentals`,
      nftRenter.address,
      1
    );
  },
});

Clarinet.test({
  name: "Try to rent an NFT with low price",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Finally, try to rent it, but don't offer a high enough price
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(10),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_price_too_low);
  },
});

Clarinet.test({
  name: "Try to rent an NFT that is not for rent",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Finally, try to rent a different NFT
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(2),
          types.uint(30),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_nft_not_found);
  },
});

Clarinet.test({
  name: "Try to rent an NFT that is already rented",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter1 = accounts.get("wallet_2")!;
    const nftRenter2 = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Rent the NFT
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter1.address
      ),
    ]);

    // Rent the NFT again (same renter)
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter1.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_nft_already_rented);

    // Rent the NFT again (different renter)
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter2.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_nft_already_rented);
  },
});

Clarinet.test({
  name: "Try to rent an NFT that is past its end height",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Advance the chain past the end height
    chain.mineEmptyBlockUntil(91);

    // Finally, try to rent the NFT
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_nft_not_rentable);
  },
});

Clarinet.test({
  name: "Try to rent an NFT with different rental length",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Finally, try to rent the NFT
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(20),
        ],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_mismatched_rental_length);
  },
});

Clarinet.test({
  name: "Pay more than the asking price",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Finally, try to rent the NFT
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(30),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectUint(1);
    block.receipts[0].events.expectSTXTransferEvent(
      30,
      nftRenter.address,
      nftOwner.address
    );
  },
});

Clarinet.test({
  name: "Delist an unrented NFT",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Finally, delist the NFT
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "delist-nft",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        nftOwner.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectNonFungibleTokenTransferEvent(
      `${deployer.address}.zebra::zebra`,
      `${deployer.address}.rental`,
      nftOwner.address,
      1
    );
  },
});

Clarinet.test({
  name: "Try to delist someone else's NFT",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

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

    // Finally, delist the NFT
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "delist-nft",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_forbidden);
  },
});

Clarinet.test({
  name: "Return an NFT",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

    // List the NFT for rental
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

    // Rent it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);

    // Advance the chain
    chain.mineEmptyBlockUntil(14);

    // Return it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "return-nft",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectNonFungibleTokenBurnEvent(
      `${deployer.address}.rental::nftrentals`,
      nftRenter.address,
      1
    );
  },
});

Clarinet.test({
  name: "Return someone else's NFT",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;
    const other = accounts.get("wallet_3")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

    // List the NFT for rental
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

    // Rent it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);

    // Advance the chain
    chain.mineEmptyBlockUntil(14);

    // Return it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "return-nft",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        other.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectNonFungibleTokenBurnEvent(
      `${deployer.address}.rental::nftrentals`,
      nftRenter.address,
      1
    );
  },
});

Clarinet.test({
  name: "Return an active NFT rental",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);

    // List the NFT for rental
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

    // Rent it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);

    // Return it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "return-nft",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        nftRenter.address
      ),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectNonFungibleTokenBurnEvent(
      `${deployer.address}.rental::nftrentals`,
      nftRenter.address,
      1
    );
  },
});

Clarinet.test({
  name: "Try to return someone else's active NFT rental",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const nftOwner = accounts.get("wallet_1")!;
    const nftRenter = accounts.get("wallet_2")!;
    const other = accounts.get("wallet_3")!;

    // First, get an NFT in nftOwner's wallet
    let block = chain.mineBlock([
      Tx.contractCall("zebra", "claim", [], nftOwner.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    assertEquals(block.receipts[0].events[0].type, "nft_mint_event");

    // List the NFT for rental
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

    // Rent it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "rent-nft",
        [
          types.principal(`${deployer.address}.zebra`),
          types.uint(1),
          types.uint(20),
          types.uint(10),
        ],
        nftRenter.address
      ),
    ]);

    // Return it
    block = chain.mineBlock([
      Tx.contractCall(
        "rental",
        "return-nft",
        [types.principal(`${deployer.address}.zebra`), types.uint(1)],
        other.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(err_forbidden);
  },
});
