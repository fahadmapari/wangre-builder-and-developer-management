# RealDev Internal Tool

Operations console for a real-estate developer: projects, units, transactions,
materials, inter-project transfers. Two roles — `admin` and `floor_manager`.

## Local setup

### 1. Run MongoDB as a single-node replica set

Mongo transactions require a replica set. The simplest local setup:

```bash
docker run -d --name realdev-mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec -it realdev-mongo mongosh --eval 'rs.initiate()'
```

Verify with `mongosh --eval 'rs.status().ok'` (returns `1`).

### 2. Set up Google OAuth

In the [Google Cloud Console](https://console.cloud.google.com), create an
OAuth 2.0 Client ID (Web application). Add `http://localhost:3000` as an
Authorized JavaScript Origin and
`http://localhost:3000/api/auth/callback/google` as an Authorized Redirect URI.

### 3. Configure env

```bash
cp .env.example .env.local
# Fill in AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ADMIN_EMAILS
npx auth secret    # writes AUTH_SECRET into .env.local
```

### 4. Initialize indexes

```bash
npm run db:init
```

### 5. Run

```bash
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`.

## Roles

- Emails listed in `ADMIN_EMAILS` (comma-separated) become `admin` on first sign-in.
- Everyone else becomes `floor_manager`.
- To change a role afterwards, edit the user document in the `users` collection
  directly. There is no user-management UI in v1.
