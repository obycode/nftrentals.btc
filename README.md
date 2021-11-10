![nftrentals.btc logo](public/logo.png?raw=true)

# nftrentals.btc

This project defines a smart contract to provide a way for NFT owners to rent
out their NFTs to others. There are many different scenarios in which this could
be useful, including NFTs used in online games, NFTs providing access to a
physical item (e.g. using NFT to unlock a property), or NFTs with any other
functionality which provides access to some benefit to the holder of the NFT.

I have seen projects on other blockchains which enable renting by actually
transferring the original NFT to the renter, and requiring collateral from the
renter that covers more than the full value of the NFT. This is bad for the
owner of the NFT - because of the risk that the NFT will go up in value while
rented and the renter will decide to keep it and sacrifice their collateral. It
is also bad for the renter of the NFT - because they need to put up a
significant amount of collateral, just to rent an NFT for some potentially short
amount of time.

This smart contract solves that problem by creating an intermediate holder of
the NFT, the contract itself, while it is rented out. This enables the renter to
only pay an amount that is reasonable for the rental period, with no collateral
required. It also removes the risk to the owner of the NFT. There is zero chance
that a renter can just never return the NFT, since the contract holds the NFT
and never transfers it to the renter. When the rental contract term is up, the
rental NFT can be burned, and the original NFT is available to be returned to
the owner, no matter what the renter does.

The downside of this is that since the contract holds the original NFT and mints
a rental NFT for the renter, the end users of the NFT will need to support the
rented NFT. It should be possible to standardize this rental relationship and
handle it generically. The key to making it work is that it is easy to verify
that the rental contract owns the NFT that is being rented.

## Smart Contract

### offer-nft

Offer an NFT for rent in the marketplace.

Parameters:

- collection: Principal specifying the NFT collection
- nft-id: ID of the NFT within the collection
- end-height: Block height at which the NFT will no longer be available to rent
- price: Price to rent the NFT for the specified length of time
- rental-length: Number of blocks for one rental period

### delist-nft

Delist an NFT from the marketplace.

Parameters:

- collection: Principal specifying the NFT collection
- nft-id: ID of the NFT within the collection

### rent-nft

Rent an NFT.

Parameters:

- collection: Principal specifying the NFT collection
- nft-id: ID of the NFT within the collection
- price: Price offered for one rental period

### return-nft

Return a rented NFT. Note that this can be called by anyone, not just the renter
or owner. This allows for a new renter to force the last renter whose term has
expired to return the item so that it may be rented again. What actually happens
is that the rental NFT is burned by the contract and it is removed from the
internal map of rented items.

Parameters:

- collection: Principal specifying the NFT collection
- nft-id: ID of the NFT within the collection

### nftrentals NFT

The NFT rental contract defines a new NFT, nftrentals, which is used to define a
rental. This NFT is minted each time a rental is initiated. It is held by the
renter for the duration of the rental period, and then is burned by someone
"returning" the rented NFT. This return may be performed by the renter (though
there is currently no incentive for them to do so), by the owner (incentivized
to return the item so that it may be rented again), or by another user
(incentivized to return the item so that they may rent it themselves).

Nothing prevents a renter from "sub-leasing" a rented NFT if they think that the
rental price is lower than the current market price for the item, and this could
be a common occurence which would help to stabilize the price of rentals.

## Frontend

For this hackathon, I was unable to complete any frontend for this smart
contract, but the design is clear. There would be a marketplace of NFTs
available for rent, showing the rental length and the price. Users could click a
button to rent an NFT, which would prompt them to approve the transaction to pay
the rental fee and mint the rental NFT. The NFTs available for rent should be
searchable and also organized into collections, similar to the way that
[StacksArt](https://www.stacksart.com/) or [STXNFT](https://stxnft.com/) are
organized for NFT sales.

When a user has their wallet connected, they would be able to enter a view which
shows all of their NFTs, and showing a button to offer each NFT as a rental,
prompting for the rental length and price. Any existing rentals would show the
current status (rented or not rented), block height ending the current rental
(if applicable), a button to delist the item, and another button to show
historic data on an NFT (how many rentals, how much in fees, cycles rented vs.
unrented, etc.).

Since a call to the smart contract is required to "return" a rented NFT, there
will need to be a button to return a rental which has expired. As described
above, this burns the rental NFT and clears the data from the map of rented
items. To ensure that this happens in a timely fashion, to avoid giving the
renter bonus time, the marketplace could offer a paid service to automate
calling this return-nft function.

## Future Work

Obviously the key future work would be to create a frontend for the marketplace
of items. The smart contract would also need to be deployed once all final
changes are in place. Prior to publication, the contract could be modified to
include a fee for listing or it could be setup to take a portion of the rental
fee to go to the deployer of the contract. It currently does not include any
such fees and payment is only going from renter to owner directly, with the
contract simply serving as an escrow to hold the NFTs while they are rented and
to coordinate the peer-to-peer interaction.
