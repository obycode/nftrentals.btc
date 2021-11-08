;; rental
;; This contract enables NFT owners to securely rent out their NFTs to untrusted renters.

;; SIP009 NFT trait on mainnet
;; (impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
;; (use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

;; SIP090 NFT trait on testnet
;; (impl-trait 'ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.nft-trait.nft-trait)
;; (use-trait nft-trait 'ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.nft-trait.nft-trait)

;; SIP009 NFT trait for Clarinet
(impl-trait .sip009-nft-trait.sip009-nft-trait)
(use-trait nft-trait .sip009-nft-trait.sip009-nft-trait)

;; constants
;;
(define-constant contract-owner tx-sender)

(define-constant err-nft-transfer-failed (err u100))
(define-constant err-nft-not-found (err u101))
(define-constant err-nft-not-rentable (err u102))
(define-constant err-nft-already-rented (err u103))
(define-constant err-price-too-low (err u104))
(define-constant err-item-exists (err u105))
(define-constant err-burn-failure (err u106))
(define-constant err-forbidden (err u107))
(define-constant err-internal (err u200))

;; data maps and vars
;;

;; Store the items available to rent
(define-map rental-items
  {
    collection: principal,
    nft-id: uint
  }
  {
    owner: principal,
    renter: (optional principal),
    end-height: uint,
    price: uint,
    rental-length: uint,
    rental-id: uint
  }
)

;; Store the items currently rented
(define-map rented-items
  uint
  {
    uri: (optional (string-ascii 256)),
    collection: principal,
    nft-id: uint,
    end-height: uint,
  }
)

;; private functions
;;
(define-read-only (get-rental-item (collection principal) (nft-id uint))
  (map-get? rental-items {collection: collection, nft-id: nft-id})
)

;; public functions
;;

;; Offer an NFT for rental
(define-public (offer-nft (collection <nft-trait>) (nft-id uint) (end-height uint) (price uint) (rental-length uint))
  (begin
    (unwrap!
      (contract-call? collection transfer
        nft-id tx-sender (as-contract tx-sender))
      err-nft-transfer-failed)

    (asserts! (map-insert rental-items
      {
        collection: (contract-of collection),
        nft-id: nft-id
      }
      {
        owner: tx-sender,
        renter: none,
        end-height: end-height,
        price: price,
        rental-length: rental-length,
        rental-id: u0
      }
    ) err-item-exists)

    (print {
      type: "offer-nft",
      nft: {
        collection: collection,
        nft-id: nft-id,
      }
    })
    (ok true)
  )
)

;; Delist an NFT from the marketplace
(define-public (delist-nft (collection <nft-trait>) (nft-id uint))
  (let ((nft (unwrap! (get-rental-item (contract-of collection) nft-id)
                      err-nft-not-found)))
    (asserts! (is-eq tx-sender (get owner nft)) err-forbidden)
    ;; If there is currently a renter:
    ;;   - If their rental term is in progress, cannot delist.
    ;;   - If not, burn the rental nft.
    (and
      (is-some (get renter nft))
      (let
        ((rental (unwrap! (map-get? rented-items (get rental-id nft))
                          err-internal)))
        (asserts! (< (get end-height rental) block-height)
          err-nft-already-rented)
        (unwrap! (nft-burn?
            nftrentals
            (get rental-id nft)
            (unwrap! (get renter nft) err-internal))
          err-burn-failure)
      )
    )
    (print {
      type: "delist-nft",
      nft: {
        collection: collection,
        nft-id: nft-id,
      }
    })
    ;; Return the NFT to the owner
    (as-contract (contract-call? collection transfer nft-id (as-contract tx-sender)
       (get owner nft)))
  )
)

;; Rent an NFT
(define-public (rent-nft (collection <nft-trait>) (nft-id uint) (price uint))
  (let ((nft (unwrap! (get-rental-item (contract-of collection) nft-id) err-nft-not-found)))
    (asserts! (<= (+ block-height (get rental-length nft)) (get end-height nft)) err-nft-not-rentable)
    (asserts! (is-none (get renter nft)) err-nft-already-rented)
    (asserts! (>= price (get price nft)) err-price-too-low)

    ;; Mint the rental NFT
    (let ((next-id (+ u1 (var-get last-id))))
      ;; Update the rental items map
      (map-set rental-items
        {
          collection: (contract-of collection),
          nft-id: nft-id
        }
        {
          owner: (get owner nft),
          renter: (some tx-sender),
          end-height: (get end-height nft),
          price: price,
          rental-length: (get rental-length nft),
          rental-id: next-id
        }
      )

      (try! (stx-transfer? price tx-sender (get owner nft)))
      (match (nft-mint? nftrentals next-id tx-sender)
        success
          (begin
            (map-set rented-items
              next-id
              {
                uri: (try! (contract-call? collection get-token-uri nft-id)),
                collection: (contract-of collection),
                nft-id: nft-id,
                end-height: (+ block-height (get rental-length nft)),
              }
            )
            (print {
              type: "rent-nft",
              rental-id: next-id,
              nft: {
                collection: collection,
                nft-id: nft-id,
              }
            })
            (ok next-id)
          )
        error
          (err error)
      )
    )
  )
)

;; SIP009: nft-trait
(define-non-fungible-token nftrentals uint)

;; Store the last issued token ID
(define-data-var last-id uint u0)

;; SIP009: Transfer token to a specified principal
(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (if (and
        (is-eq tx-sender sender))
      (match (nft-transfer? nftrentals token-id sender recipient)
        success (ok success)
        error (err error))
      (err u500)))

;; SIP009: Get the owner of the specified token ID
(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? nftrentals token-id)))

;; SIP009: Get the last token ID
(define-read-only (get-last-token-id)
  (ok (var-get last-id)))

;; SIP009: Get the token URI. You can set it to any other URI
(define-read-only (get-token-uri (token-id uint))
  (ok (get uri (unwrap! (map-get? rented-items token-id) err-nft-not-found)))
)