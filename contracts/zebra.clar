;; This NFT is here just to test the rental contract. It should not be deployed.

;; SIP009 NFT trait on mainnet
;; (impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
;; (use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

;; SIP090 NFT trait on testnet
;; (impl-trait 'ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.nft-trait.nft-trait)
;; (use-trait nft-trait 'ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.nft-trait.nft-trait)

;; SIP009 NFT trait for Clarinet
(impl-trait .sip009-nft-trait.sip009-nft-trait)
(use-trait nft-trait .sip009-nft-trait.sip009-nft-trait)

;; define a new NFT
(define-non-fungible-token zebra uint)

;; Store the last issued token ID
(define-data-var last-id uint u0)

;; Claim a new NFT
(define-public (claim)
  (mint tx-sender))

;; SIP009: Transfer token to a specified principal
(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (if (and
        (is-eq tx-sender sender))
      (match (nft-transfer? zebra token-id sender recipient)
        success (ok success)
        error (err error))
      (err u500)))

;; SIP009: Get the owner of the specified token ID
(define-read-only (get-owner (token-id uint)) 
  (ok (nft-get-owner? zebra token-id)))

;; SIP009: Get the last token ID
(define-read-only (get-last-token-id)
  (ok (var-get last-id)))

;; SIP009: Get the token URI. You can set it to any other URI
(define-read-only (get-token-uri (token-id uint)) 
  (ok (some "https://obycode.com")))

;; Internal - Mint new NFT
(define-private (mint (new-owner principal))
 (let ((next-id (+ u1 (var-get last-id))))
  (match (nft-mint? zebra next-id new-owner)
    success
      (begin
        (var-set last-id next-id)
        (ok true))
    error
      (err error))))