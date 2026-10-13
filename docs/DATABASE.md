# Database

SecureVault uses **MongoDB** through **Prisma ORM** (`provider = "mongodb"`).

- Prisma's MongoDB connector **requires a replica set** (it uses transactions). MongoDB Atlas clusters are replica sets out of the box.
- For local development, if `DATABASE_URL` is empty the API starts `MongoMemoryReplSet` (mongodb-memory-server), sets `DATABASE_URL` to it **before** creating the `PrismaClient`, and runs `prisma db push` to create the unique indexes (`server/src/config/db.js`).
- Fields named `enc*` contain ciphertext produced in the browser: the server can't read them.

## Prisma schema (`server/prisma/schema.prisma`)

```prisma
// SecureVault database schema (Prisma + MongoDB).
// Fields named enc* hold ciphertext produced in the browser (base64 of iv||ciphertext).
// The server can never read them – this is the zero-knowledge design.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

type KdfParams {
  alg  String
  m    Int?
  t    Int?
  p    Int?
  iter Int?
}

type Totp {
  enabled       Boolean  @default(false)
  encSecret     String?  // TOTP secret sealed with SERVER_ENC_KEY
  pendingSecret String?
  backupCodes   String[] // sha256 hashes, single use
}

model User {
  id                   String     @id @default(auto()) @map("_id") @db.ObjectId
  email                String     @unique
  name                 String     @default("")
  authHash             String     // argon2id(clientAuthKey)
  kdfSalt              String
  kdfParams            KdfParams
  encMasterKey         String     // AES-GCM(KEK, MK)
  encMasterKeyRecovery String     // AES-GCM(RecoveryKey, MK)
  recoveryHash         String     // argon2id(recoveryProof)
  totp                 Totp?
  storageUsed          Float      @default(0)
  storageQuota         Float
  failedLogins         Int        @default(0)
  lockedUntil          DateTime?
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt
  sessions             Session[]
  folders              Folder[]
  files                File[]
  versions             Version[]
  shares               Share[]
  activities           Activity[]
}

/// A signed-in device = one rotating refresh-token session.
model Session {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String   @db.ObjectId
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshHash String
  name        String
  ua          String
  ip          String
  lastSeen    DateTime @default(now())
  expiresAt   DateTime
  revoked     Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([userId])
}

model Folder {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  ownerId   String    @db.ObjectId
  owner     User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  parentId  String?   @db.ObjectId
  encName   String
  trashed   Boolean   @default(false)
  trashedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([ownerId, parentId])
}

model File {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  ownerId          String    @db.ObjectId
  owner            User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  folderId         String?   @db.ObjectId
  encName          String
  encMime          String
  size             Float     @default(0) // plaintext size of current version
  status           String    @default("uploading") // uploading | ready
  currentVersionId String?   @db.ObjectId
  versionCount     Int       @default(0)
  favorite         Boolean   @default(false)
  trashed          Boolean   @default(false)
  trashedAt        DateTime?
  lastOpenedAt     DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  versions         Version[]
  shares           Share[]

  @@index([ownerId, folderId])
}

/// Every upload (first or later) is a Version with its own file key and chunks.
model Version {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  fileId      String   @db.ObjectId
  file        File     @relation(fields: [fileId], references: [id], onDelete: Cascade)
  ownerId     String   @db.ObjectId
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  number      Int
  size        Float    // plaintext bytes
  storedBytes Float    @default(0)
  chunkSize   Int
  chunkCount  Int
  encFileKey  String   // AES-GCM(MK, FK)
  noncePrefix String   // 8 random bytes, base64
  storageKey  String
  partsDone   Int[]
  status      String   @default("uploading")
  device      String?
  createdAt   DateTime @default(now())
  shares      Share[]

  @@index([fileId])
}

model Share {
  id           String    @id @default(auto()) @map("_id") @db.ObjectId
  ownerId      String    @db.ObjectId
  owner        User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  fileId       String    @db.ObjectId
  file         File      @relation(fields: [fileId], references: [id], onDelete: Cascade)
  versionId    String    @db.ObjectId
  version      Version   @relation(fields: [versionId], references: [id], onDelete: Cascade)
  token        String    @unique
  label        String?
  encName      String    // filename encrypted with the link key (#fragment)
  encMime      String
  encFileKey   String    // FK wrapped with link key (+ password key if set)
  passSalt     String?
  passHash     String?
  expiresAt    DateTime?
  maxDownloads Int?
  downloads    Int       @default(0)
  revoked      Boolean   @default(false)
  createdAt    DateTime  @default(now())

  @@index([ownerId])
}

model Activity {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    String   @db.ObjectId
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  action    String
  detail    String   @default("")
  ip        String   @default("")
  ua        String   @default("")
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

## Models at a glance

| Model | Purpose | Notable fields |
|---|---|---|
| `User` | Account + key material | `authHash` (Argon2id of client auth key), `kdfSalt`, `kdfParams`, `encMasterKey`, `encMasterKeyRecovery`, `recoveryHash`, `totp` (embedded type), `storageUsed`, `storageQuota`, lockout counters |
| `Session` | One signed-in device | `refreshHash` (SHA-256), `name` (e.g. "Chrome on Windows"), `ip`, `lastSeen`, `expiresAt`, `revoked` |
| `Folder` | Tree of folders | `parentId` (null = root), `encName`, `trashed` |
| `File` | A file entry | `folderId`, `encName`, `encMime`, `size`, `currentVersionId`, `favorite`, `trashed`, `status` |
| `Version` | One uploaded version | `number`, `size`, `chunkSize`, `chunkCount`, `encFileKey`, `noncePrefix`, `storageKey`, `partsDone`, `status` |
| `Share` | Share link | `token` (unique), `versionId`, `encName`/`encMime`/`encFileKey` (wrapped with link key), `passSalt`, `passHash`, `expiresAt`, `maxDownloads`, `downloads`, `revoked` |
| `Activity` | Audit log | `action`, `detail`, `ip`, `ua`, `createdAt` |

## Relationships

```
User 1─* Session
User 1─* Folder (parentId → Folder)
User 1─* File   (folderId → Folder)
File 1─* Version
File 1─* Share *─1 Version
User 1─* Activity
```

## Storage accounting

`User.storageUsed` = sum of plaintext sizes of all **ready** versions. It increases on `/uploads/:vid/complete` and decreases when files are permanently deleted (`purgeFiles`). Quota is checked when an upload starts and again on completion.

## Indexes
- `User.email` unique, `Share.token` unique
- `Session(userId)`, `Folder(ownerId, parentId)`, `File(ownerId, folderId)`, `Version(fileId)`, `Share(ownerId)`, `Activity(userId, createdAt)`

## Common commands

```bash
cd server
npx prisma generate                       # regenerate the client after editing schema.prisma
DATABASE_URL="mongodb+srv://..." npx prisma db push   # create/update indexes on Atlas
npx prisma studio                         # browse data (needs DATABASE_URL)
```
