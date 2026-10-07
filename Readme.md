# Chat Application Backend

This directory contains the Node.js backend for the chat application. It exposes a REST API and a Socket.IO server on the same HTTP server. MongoDB stores users, chats, friend requests, and messages; Cloudinary stores uploaded media.

This guide describes the behavior implemented in the repository today. The **Implementation notes and known issues** section calls out places where the code and its apparent intent do not currently match.

## Technology and Request Flow

- Node.js uses ES modules (`"type": "module"` in `package.json`).
- Express handles HTTP routes mounted under `/api/v1`.
- Socket.IO handles messages, typing/presence notifications, call signaling, and updates triggered by API operations.
- Mongoose connects to MongoDB and defines the four persisted models described below.
- Cookie-based JWT authentication protects user routes and the Socket.IO handshake.
- Multer accepts in-memory uploads; Cloudinary stores user avatars and chat attachments.
- `express-validator` validates selected request bodies and route parameters. Validation failures and application errors use the common error response described below.

Typical HTTP flow: Express middleware parses JSON, cookies, and CORS; a route may validate input and authenticate the cookie; a controller reads or mutates MongoDB; the controller returns JSON and may emit a Socket.IO event using the `io` instance stored on the Express app.

## Project Layout

| Path | Purpose |
| --- | --- |
| `app.js` | Creates Express and HTTP servers, configures MongoDB/Cloudinary/CORS, registers routes and Socket.IO handlers, and listens on the configured port. |
| `routes/` | Declares user, chat, and admin HTTP endpoints and their middleware order. |
| `controller/` | Implements endpoint behavior, database operations, response shaping, and API-triggered socket events. |
| `model/` | Mongoose schemas for users, chats, messages, and friend requests. |
| `middlewares/auth.js` | User JWT authentication, admin-cookie authentication, and Socket.IO authentication. |
| `middlewares/error.js` | Async controller wrapper and centralized Express error handler. |
| `middlewares/multer.js` | Avatar and attachment upload limits and multipart field names. |
| `utils/validator.js` | `express-validator` rules and validation-result handling. |
| `utils/features.js` | Mongo connection, token/cookie response helpers, Socket.IO API-event helper, Cloudinary upload helper. |
| `utils/utility.js` | `ErrorHandler`, the application error type. |
| `constants/config.js` | CORS origins and cookie names. |
| `constants/event.js` | General chat and presence event names. |
| `constants/events.js` | Audio call signaling event names plus repeated general event constants. |
| `lib/helper.js` | Resolves other chat members, user socket IDs, base64 upload input, and a called-user ID. |
| `seeders/user.js` | Faker-based sample-data functions; see the known issues below before using them. |

## Run Locally

Requirements: Node.js compatible with the Dockerfile's Node 20 image, npm, a reachable MongoDB instance, and a Cloudinary account for avatar/file uploads.

1. From this directory, install packages:

	```sh
	npm install
	```

2. Copy `sample.env` to `.env` and set real values. PowerShell example:

	```powershell
	Copy-Item sample.env .env
	```

3. Set at least `MONGO_URI`, `JWT_SECRET`, `ADMIN_SECRET_KEY`, and the Cloudinary credentials. Set `CLIENT_URL` to the frontend origin.
4. Start the development server with `npm run dev`, or run the production-style Node process with `npm start`.

The server defaults to port `4000`. Startup calls `connectDB()` and logs a MongoDB connection result; the HTTP server starts on the configured port. There is no automated test or database-seed command in `package.json`.

### Environment Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP and Socket.IO listening port; defaults to `4000`. |
| `MONGO_URI` | MongoDB connection string. Local MongoDB is commonly `mongodb://127.0.0.1:27017/chat-app`; inside the provided Compose network use `mongodb://mongo:27017/chat-app`. |
| `JWT_SECRET` | Signs and verifies user and admin JWTs. Must be set to a private, strong value. |
| `ADMIN_SECRET_KEY` | Shared secret submitted to `/api/v1/admin/verify`; the source currently has a fallback value if omitted, which should not be relied on. |
| `NODE_ENV` | Intended to indicate the environment. The current `envMode` expression in `app.js` is incorrect; see known issues. |
| `CLIENT_URL` | Additional allowed browser origin. `localhost:5173` and `localhost:4173` are also allowed in `constants/config.js`. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. |

The cookie options are `httpOnly`, `secure`, `sameSite: "none"`, and a 15-day max age for user login. This requires HTTPS-compatible cookie behavior in the browser; configure local development and production origins accordingly. Socket.IO uses credentialed CORS and authenticates from the same `chat-app` cookie.

### Docker Compose

The repository-level `compose.yml` starts MongoDB, backend, and frontend services. The backend container expects `chat-app-backend/.env`, exposes port `4000`, and runs `npm run dev`. When connecting from that container, use the Compose service hostname `mongo` in `MONGO_URI`, not `localhost`. The Compose file mounts the backend source directory into `/app`.

## HTTP API

All paths below are relative to `/api/v1`. Unless marked public, user and chat endpoints require a valid `chat-app` cookie. Send JSON for ordinary request bodies. The registration and attachment endpoints use `multipart/form-data`.

Successful responses generally include `success: true`. Error responses are generally:

```json
{ "success": false, "message": "Human-readable error" }
```

Validation errors return HTTP 400. Authentication failures generally return 401; authorization failures generally return 401 or 403 depending on the controller. Duplicate MongoDB fields are translated to HTTP 400. Invalid MongoDB ObjectId casts are translated to HTTP 400. Other uncaught errors default to HTTP 500.

### User Routes (`/user`)

| Method and path | Access | Input | Success response / behavior |
| --- | --- | --- | --- |
| `POST /user/new` | Public | Multipart fields `name`, `username`, `password`, `bio`, and file field `avatar`. Avatar is required; max upload size is 5 MB. | HTTP 201: `{ success, user, message }`; also sets the `chat-app` JWT cookie. Password is hashed before persistence. |
| `POST /user/login` | Public | JSON `{ "username": "...", "password": "..." }`. | HTTP 200: `{ success, user, message }`; sets the `chat-app` cookie. Invalid username/password returns 404 in the current controller. |
| `GET /user/myprofile` | User | None. | `{ success: true, user }` for the authenticated user ID. |
| `GET /user/logout` | User | None. | Clears `chat-app`; `{ success: true, message }`. |
| `GET /user/search?name=...` | User | Optional `name` query, case-insensitive substring match. | `{ success: true, users: [{ _id, name, avatar }] }`; excludes the current user and users found in any of the user's existing chats. `avatar` is the URL string. |
| `PUT /user/sendrequest` | User | JSON `{ "userId": "recipient-id" }`. | Creates a pending request and emits `NEW_REQUEST` to the recipient; `{ success: true, message }`. A request in either direction already existing returns 400. |
| `PUT /user/acceptrequest` | User | JSON `{ "requestId": "...", "accept": true }`; `accept` must be boolean. | On acceptance, creates a direct chat, deletes the request, emits `REFETCH_CHATS` to both users, and returns `{ success, message, senderId }`. On rejection, deletes the request and returns `{ success, message }`. Only the receiver may decide. |
| `GET /user/notification` | User | None. | `{ success: true, allRequest: [{ _id, sender: { _id, name, avatar } }] }` for requests received by the current user. |
| `GET /user/friends?chatId=...` | User | Optional chat ID. | `{ success: true, friends: [{ _id, name, avatar }] }`; returns the other participants from chats. With `chatId`, the controller attempts to return friends not already in that chat. |

The route spelling is `/notification` (singular); the controller function itself is named `getNotifaction`.

### Chat Routes (`/chat`)

Every route in this group requires user authentication.

| Method and path | Input | Success response / behavior |
| --- | --- | --- |
| `POST /chat/new` | JSON `{ "name": "group name", "members": ["user-id", "user-id"] }`. Members array validation requires 2-100 IDs; the authenticated creator is added automatically. | HTTP 201 `{ success: true, message: "Group Created" }`; emits `ALERT` and `REFETCH_CHATS`. |
| `GET /chat/my` | None. | `{ success: true, chats: [...] }`. Each chat is transformed to `_id`, `groupChat`, `avatar` (one URL for a direct chat or up to three URLs for a group), `name`, and `members` (other member IDs). |
| `GET /chat/my/groups` | None. | `{ success: true, groups: [...] }`; intended to return groups created by the current user. Each item has `_id`, `groupChat`, `name`, and up to three avatar URLs. |
| `PUT /chat/addmembers` | JSON `{ "chatId": "...", "members": ["user-id"] }`. | Creator-only group operation. Adds non-members, enforces a maximum group size of 100, emits `ALERT` and `REFETCH_CHATS`; `{ success, message }`. The route currently does not attach the defined `addMemberValidator`. |
| `PUT /chat/removemember` | JSON `{ "chatId": "...", "userId": "..." }`. | Creator-only group operation. The current controller rejects removal when the group currently has 3 or fewer members; successful removal emits `ALERT` and `REFETCH_CHATS`; `{ success, message }`. |
| `DELETE /chat/leave/:id` | Chat ID in `id`. | Leaves a group if at least 3 members will remain. If the creator leaves, a remaining member is selected randomly as creator. Returns `{ success, message }` and emits an `ALERT` to remaining members. |
| `POST /chat/message` | Multipart field `chatId`; one or more uploaded files in repeated field `files` (maximum 5 files, 5 MB each). | Uploads files to Cloudinary, persists an attachment message, emits `NEW_MESSAGE` and `NEW_MESSAGE_ALERT`, and returns `{ success: true, message }` containing the created message document. |
| `GET /chat/message/:id?page=1` | Chat ID in `id`; optional 1-based `page`. | Requires the requester to be a chat member. Returns `{ success, messages, totalPages }`. Page size is 20; results are returned oldest-to-newest within the selected page, and each sender is populated with their name. |
| `GET /chat/:id?populate=true` | Chat ID in `id`; optional `populate=true`. | `{ success: true, chat }`. Without populate, returns the raw chat document. With populate, members are represented by `_id`, `name`, and avatar URL. The controller currently checks that the chat exists but does not check that the requester is a member. |
| `PUT /chat/:id` | JSON `{ "name": "new group name" }`. | Creator-only group rename. Emits `REFETCH_CHATS`; returns `{ success, message }`. |
| `DELETE /chat/:id` | Chat ID in `id`. | Group deletion is creator-only; direct-chat deletion is restricted to a member. Deletes chat messages and attempts attachment cleanup, emits `REFETCH_CHATS`, and returns `{ success, message }`. Attachment cleanup is currently incomplete; see known issues. |

For group creation and renaming, the controller uses the property name `groupChat`; the Mongoose schema currently declares `groupchat`. This mismatch can affect the group behavior described above.

### Admin Routes (`/admin`)

`POST /admin/verify` and `GET /admin/logout` are public. The remaining routes require the `chat-app-admin-token` cookie, checked by `adminOnly`.

| Method and path | Input | Success response / behavior |
| --- | --- | --- |
| `POST /admin/verify` | JSON `{ "secretKey": "..." }`. | Compares with `ADMIN_SECRET_KEY`, sets a signed admin cookie with a 15-minute max age, and returns `{ success, message }`. Invalid key returns 401. |
| `GET /admin/logout` | None. | Clears the admin cookie; `{ success: true, message }`. This route does not require an existing admin cookie. |
| `GET /admin/` | Admin cookie. | `{ "admin": true }`. |
| `GET /admin/users` | Admin cookie. | `{ success: true, users: [...] }`; includes user name, username, avatar URL, ID, and computed `friends`/`groups` counts. Those counts are currently incorrect; see known issues. |
| `GET /admin/chats` | Admin cookie. | `{ success: true, allChats: [...] }`; includes chat name/type, avatar URLs, populated members, creator summary, member count, and message count. |
| `GET /admin/messages` | Admin cookie. | `{ success: true, messages: [...] }`; includes message content/attachments/time, chat ID/type, and sender ID/name/avatar. |
| `GET /admin/stats` | Admin cookie. | `{ success: true, stats: { groupsCount, usersCount, messagesCount, totalChatsCount, messagesChart } }`. `messagesChart` is a seven-element count array for the current trailing seven-day window, ordered oldest-to-newest. |

## Socket.IO

Socket.IO shares the HTTP server and uses the same credentialed CORS configuration. During the handshake, the server reads the `chat-app` cookie, verifies its JWT, looks up the user, and stores the user document at `socket.user`. Unauthenticated connections are rejected. The implementation keeps a `userSocketIDs` map from one user ID to one socket ID, plus an in-memory set of online user IDs.

Event strings are exported from `constants/event.js` for general chat events and `constants/events.js` for call signaling. General event strings include `NEW_MESSAGE`, `NEW_MESSAGE_ALERT`, `NEW_REQUEST`, `REFETCH_CHATS`, `ALERT`, `START_TYPING`, `STOP_TYPING`, `CHAT_JOINED`, `CHAT_LEAVED`, and `ONLINE_USERS`. The audio-call alert's literal event name is `USER_AUDIO_CALL`.

### Client-to-Server Events

| Event | Client payload | Server behavior |
| --- | --- | --- |
| `NEW_MESSAGE` | `{ chatId, members, message }` | Builds a real-time message with a UUID, sender ID/name, chat ID, content, and timestamp; emits `NEW_MESSAGE` with `{ chatId, message }` and `NEW_MESSAGE_ALERT` with `{ chatId }` to the supplied member sockets; then persists a message. The client supplies `members`. |
| `START_TYPING` | `{ members, chatId }` | Sends `START_TYPING` with `{ chatId }` to member sockets except the sender socket. |
| `STOP_TYPING` | `{ members, chatId }` | Sends `STOP_TYPING` with `{ chatId }` to member sockets except the sender socket. |
| `CHAT_JOINED` | `{ userId, members }` | Adds `userId` to the in-memory online set and emits `ONLINE_USERS` with the full ID array to the supplied member sockets. |
| `CHAT_LEAVED` | `{ userId, members }` | Removes `userId` from that set and emits the updated `ONLINE_USERS` array to the supplied member sockets. |
| `USER_AUDIO_CALL` | `{ chatId, userId, calledId }`; `calledId` may be an ID or an object containing `_id`. | Looks up the caller's user document and emits `USER_AUDIO_CALL` with `{ callerInfo, chatId }` to the called user's socket, if connected. |
| `ACCEPT_AUDIO_CALL` | `{ callerId, chatId }` | Forwards `ACCEPT_AUDIO_CALL` with the same fields to the caller's socket. |
| `NEW_AUDIO_CALL_OFFER` | `{ callerId, calledId, chatId, offer }` | Forwards the WebRTC offer to the called user's socket. |
| `NEW_AUDIO_CALL_ANSWER` | `{ callerId, calledId, chatId, answer }` | Forwards the WebRTC answer to the caller's socket. |
| `ICE_CANDIDATE` | `{ callerId, calledId, chatId, candidate }` | Determines the other participant from the authenticated socket user and forwards the candidate. |
| `END_AUDIO_CALL` | `{ callerId, calledId, chatId }` | Forwards the end-call event to the other participant. |

The server does not currently implement a reject-call event. WebRTC media itself is peer-to-peer; this backend relays call setup/signaling data, not audio streams.

### Server-to-Client Events

| Event | Payload / origin |
| --- | --- |
| `NEW_MESSAGE` | `{ chatId, message }` for a socket message, or `{ message, chatId }` from the HTTP attachment flow. The message includes content/attachment data, sender, chat, ID, and creation time as applicable. |
| `NEW_MESSAGE_ALERT` | `{ chatId }`; emitted after a text socket message or attachment upload. |
| `NEW_REQUEST` | Emitted to the recipient when a friend request is created. No meaningful data payload is supplied by the controller. |
| `REFETCH_CHATS` | Emitted after friend acceptance, group creation/membership changes, rename, or deletion so clients can reload chat lists. Most call sites provide no data payload. |
| `ALERT` | Emitted for group creation and membership changes. Payload is currently sometimes a string and sometimes an object with `message` and `chatId`. |
| `START_TYPING`, `STOP_TYPING` | `{ chatId }`, sent to other sockets among the supplied members. |
| `ONLINE_USERS` | Array of user ID strings. Emitted after join/leave and on disconnect. |
| `USER_AUDIO_CALL` | `{ callerInfo, chatId }` for a new incoming call. |
| `ACCEPT_AUDIO_CALL` | `{ callerId, chatId }` sent back to the caller. |
| `NEW_AUDIO_CALL_OFFER` | `{ callerId, calledId, chatId, offer }`. |
| `NEW_AUDIO_CALL_ANSWER` | `{ callerId, calledId, chatId, answer }`. |
| `ICE_CANDIDATE` | `{ callerId, calledId, chatId, candidate }`. |
| `END_AUDIO_CALL` | `{ callerId, calledId, chatId }`. |

API controllers emit events with `emitEvent(req, event, users, data)`. It maps user IDs to their current socket IDs and emits to those sockets. These API-triggered events and the raw Socket.IO handlers share the same event names, so clients should use the payloads described above and tolerate the currently variable `ALERT` payload.

## MongoDB Models

All four schemas use Mongoose timestamps (`createdAt`, `updatedAt`). ObjectId references connect users, chats, and messages.

### User (`model/user.js`)

- `name`: required string.
- `bio`: required string.
- `username`: required, unique string.
- `password`: required string, excluded from ordinary query selection; a `pre("save")` hook hashes modified passwords with bcrypt cost 10.
- `avatar`: required object with Cloudinary `public_id` and `url` strings.

### Chat (`model/chat.js`)

- `name`: required string.
- `groupchat`: boolean defaulting to `false` (note the lowercase `c` in the schema).
- `creator`: optional ObjectId reference to `User`.
- `members`: array of ObjectId references to `User`.

### Message (`model/message.js`)

- `content`: optional string.
- `attachment`: array of objects with required Cloudinary `public_id` and `url` strings (singular property name).
- `sender`: required ObjectId reference to `User`.
- `chat`: required ObjectId reference to `Chat`.

### Request (`model/request.js`)

- `status`: `pending`, `accepted`, or `rejected`; defaults to `pending`.
- `sender`, `receiver`: required ObjectId references to `User`.

## Uploads, Authentication, and Errors

- Avatar uploads use multipart field `avatar`; attachments use repeated multipart field `files` (up to five files per request). Multer enforces a 5 MB per-file limit and does not currently define a MIME-type allowlist.
- `uploadFilesToCloudinary` base64-encodes each in-memory file and uploads with `resource_type: "auto"` and a generated UUID public ID. The returned model data is `{ public_id, url }`, where the URL is Cloudinary's secure URL.
- User login/register cookies are named `chat-app`; admin cookies are named `chat-app-admin-token`. Both use `JWT_SECRET`. User token payload contains the user `_id`; admin token payload is the configured admin secret key.
- `isAuthenticated` verifies the user cookie and sets `req.user` to the token's user ID. `adminOnly` verifies the admin cookie and checks its decoded value against `ADMIN_SECRET_KEY`.
- `validateHandler` joins validation messages with commas and forwards an HTTP 400 error.
- `TryCatch` forwards rejected controller promises to `errorMiddleware`. The error middleware returns `{ success: false, message }` and maps duplicate-key and ObjectId cast errors to HTTP 400.
- The code configures Cloudinary deletion through `deleteFilesFromCloudinary`, but that helper currently has an empty implementation.

## Implementation Notes and Known Issues

These notes describe current behavior and are useful when debugging or extending the backend. They are not claims that the behavior is desirable.

1. **Group-chat schema naming mismatch:** `Chat` declares `groupchat`, while controllers and API responses use `groupChat`. Mongoose schemas are strict by default, so writes to the undeclared `groupChat` property may be discarded and group queries may not behave as intended. Unify the field name before relying on group creation, group listing, or group-only permissions.
2. **Attachment property mismatch:** `Message` declares `attachment`, but chat deletion searches for `attachments` and admin message transformation reads `attachments`. As a result, attachment cleanup/admin output do not match the persisted schema. In addition, `deleteFilesFromCloudinary` is empty, so remote files are not deleted.
3. **Sensitive auth response risk:** `sendToken` serializes the supplied Mongoose user document directly. Login explicitly selects `password`, and registration returns the just-created user document; do not assume `select: false` removes the password field from these response objects. Redact password before returning user data and verify existing API responses do not expose password hashes.
4. **Socket authorization:** The `NEW_MESSAGE` handler trusts the client-provided `members`, `chatId`, and message body. It does not verify that the authenticated user belongs to the chat before broadcasting or persisting. Other signaling events also rely on client-supplied participant IDs. Validate membership and derive recipients from trusted database state before exposing this backend publicly.
5. **Chat-details authorization:** `GET /chat/:id` verifies the chat exists but currently does not verify the requesting user is one of its members.
6. **One socket per user:** `userSocketIDs` stores one socket ID per user. A second tab/device overwrites the first; when either socket disconnects, the map entry is deleted without checking whether another connection remains. Online state and event delivery can therefore be inaccurate across multiple connections.
7. **Group-member filtering and validation:** `GET /user/friends?chatId=...` uses `Array.includes` with ObjectId values to test existing membership, which may not compare IDs by value. The add-members route defines no active validator despite an `addMemberValidator` existing, and its controller assumes supplied user IDs resolve to users.
8. **Admin user counts:** `getAllUsers` uses `Chat.groupChat` (the model constructor) as if it were a chat document field. The resulting `friends` and `groups` counts are not reliable.
9. **Environment-mode expression:** `app.js` defines `envMode` as `process.env.NODE_ENV === "DEVELOPEMENT" || "PRODUCTION"`. The misspelled value and `||` string make this behave differently from a normal development/production mode switch; the error middleware's development detail check will not work as intended.
10. **Socket authentication middleware is registered twice:** `app.js` installs two Socket.IO authentication middleware functions, both invoking `socketAuthenticator`. Keep one correctly configured cookie parser/authentication path to avoid duplicate work or handshake issues.
11. **Development seeder is incomplete:** `seeders/user.js` does not expose a package script. Some functions also contain runtime/logical defects (for example, `Chst` is undefined in message seeding, and group seeding treats a number as if it had a `.length`). Do not use it as a reliable setup step without fixing and testing it.
12. **Message consistency:** Socket text messages are broadcast before the database write completes, and their real-time `_id` is a UUID while the stored message receives a MongoDB ObjectId. A persistence failure can therefore leave clients displaying a message that was not saved, and the realtime ID differs from the later fetched ID.

## Scripts and Dependencies

Available npm scripts:

| Script | Command |
| --- | --- |
| `npm run dev` | Runs `nodemon app.js` for development. |
| `npm start` | Runs `node app.js`. |

Runtime dependencies are `bcrypt`, `cloudinary`, `cookie-parser`, `cors`, `dotenv`, `express`, `express-validator`, `jsonwebtoken`, `mongoose`, `multer`, `socket.io`, and `uuid`. `@faker-js/faker` and `nodemon` are development dependencies.