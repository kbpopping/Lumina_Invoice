# Security Specification (Payload-First TDD)

## 1. Data Invariants
1. A user account document `/users/{userId}` can only be read or written by the authenticated user whose `request.auth.uid == userId` and whose email is verified (`request.auth.token.email_verified == true` for writes).
2. All subcollection documents (`/profile/{profileId}`, `/invoices/{invoiceId}`, `/products/{productId}`, `/clients/{clientId}`) require the parent `/users/{userId}` document to exist (checked via `exists()` on single-document operations) and `userId == request.auth.uid`.
3. `userId` and `createdAt` are immutable once created (`incoming().userId == existing().userId` and `incoming().createdAt == existing().createdAt`).
4. `createdAt` and `updatedAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on update.
5. Once an invoice reaches `status == 'paid'`, it is terminal and locked against subsequent modifications (`existing().status != 'paid'`).
6. All bounded arrays (`items <= 100`, `taxes <= 20`, `bankAccounts <= 20`) and all strings have strict upper size bounds.
7. `allow list` queries strictly evaluate `resource.data.userId == request.auth.uid` without `get()` or `exists()` lookups.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-User Profile Read**: User B attempts `get(/users/userA/profile/default)`.
2. **Cross-User Invoice Create**: User B attempts `create(/users/userA/invoices/inv1)` with `userId: 'userB'`.
3. **Identity Spoofing on Invoice**: User A attempts `create(/users/userA/invoices/inv1)` with `userId: 'userB'`.
4. **Shadow Field Injection (Ghost Field)**: User A attempts `create` or `update` with an extra `isAdmin: true` field.
5. **Unverified Email Write**: User A with `email_verified: false` attempts to write a product.
6. **ID Poisoning**: User A attempts `create(/users/userA/products/../../admin$bad)` with invalid ID characters.
7. **Value Poisoning (Oversized String)**: User A attempts to set `clientName` to a 5,000-character string.
8. **Type Poisoning**: User A attempts to set `total: "9999"` (string instead of number) on an invoice.
9. **Terminal State Mutation**: User A attempts to update an invoice whose `existing().status == 'paid'` back to `'draft'`.
10. **Immutable Timestamp Forgery**: User A attempts `create` with a backdated `createdAt` instead of `request.time`.
11. **Unbounded Array Overflow**: User A attempts to create an invoice with 150 items (> 100 max).
12. **Blanket User List Scraping**: User A attempts `list(/users)` to enumerate all user accounts.

## 3. Red Team Verification
All 12 adversarial payloads are blocked by:
- Default-deny catch-all `match /{document=**} { allow read, write: if false; }`
- `isValidId()` regex guard on all document IDs
- `isOwner(userId)` + `isVerifiedUser()` on all reads/writes
- `isValid[Entity](incoming())` enforcing exact `hasAll` / `hasOnly` key allowlists, types, bounds, and `request.time`
- Terminal state lock `existing().status != 'paid'` on invoice updates
- `allow list: if isSignedIn() && isOwner(userId) && resource.data.userId == request.auth.uid`
