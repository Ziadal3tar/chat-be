# Real-Time Chat Backend

Production-oriented Node.js/Express backend for the Angular real-time chat application.

## Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- Socket.IO realtime events
- Cloudinary media storage
- Multer memory uploads

## Environment

Copy `config/.env.example` to `config/.env` and fill in the real values.

Never commit `config/.env`.

Required:

- `MONGO_URI`
- `JWT_SECRET`

For production, `JWT_SECRET` must be at least 32 characters.

## Run

```bash
npm install
npm start
```

The API health endpoint is:

```text
GET /ping
```

## Main API groups

```text
/api/auth
/api/user
/api/chat
/api/friends
/api/notifications
```

All protected routes use:

```text
Authorization: Bearer <JWT>
```

## Realtime

Socket.IO authenticates using the JWT supplied in:

```typescript
socket.handshake.auth.token
```

Users are joined to a private room:

```text
user:<userId>
```

Core events include:

- `receiveMessage`
- `messageUpdated`
- `messageDeleted`
- `messagesRead`
- `notificationCreated`
- `notificationRead`
- `notificationsReadAll`
- `notificationDeleted`
- `friendRequestReceived`
- `friendRequestAccepted`
- `friendRequestRejected`
- `friendRequestCancelled`
- `friendAdded`
- `friendRemoved`
- `presenceChanged`

## Message pagination

`POST /api/chat/getChat` supports cursor pagination.

The cursor is based on both:

```text
createdAt + _id
```

so equal timestamps cannot cause duplicate or skipped rows.

## Friendship consistency

Friend request, accept, reject, cancel, unfriend, and block operations use MongoDB transactions so the two users are updated atomically.

## Media

Uploads are kept in memory and sent directly to Cloudinary.

Allowed profile formats:

- JPEG
- PNG
- WebP

Allowed chat formats:

- JPEG
- PNG
- WebP
- GIF
- MP4
- WebM
- MOV
- PDF

The server stores Cloudinary `public_id` and resource type so old assets can be removed when replaced/deleted.

## Security

- Central JWT authentication
- Rate limiting
- Security headers
- Strict CORS allowlist
- Request body limits
- Upload size/type limits
- Production-safe error responses
- Password excluded from normal queries

## Migration notes

Existing chats without `participantKey` are backfilled lazily the first time the chat is accessed.

Existing users without `profileImagePublicId` continue to work; only newly uploaded profile images receive managed Cloudinary cleanup metadata.

The legacy duplicated upload/auth middleware files were removed because the active routes use the centralized implementations.

## Important

Rotate any MongoDB, JWT, Cloudinary, or SMTP credentials that were ever committed to source or shared in old seed/config files.
