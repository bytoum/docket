<div align="center" width="100%">
    <img src="./frontend/public/icon.svg" width="128" alt="Docket logo" />
</div>

# Docket

A fancy, easy-to-use and reactive self-hosted docker compose.yaml stack-oriented manager.

Docket is based on [Dockge](https://github.com/louislam/dockge) by Louis Lam, with a redesigned interface and visual editors for containers, networks, volumes and environment variables.

[![GitHub last commit (branch)](https://img.shields.io/github/last-commit/bytoum/docket/main?logo=github)](https://github.com/bytoum/docket/commits/main/) [![Docker Image Version (latest semver)](https://img.shields.io/docker/v/bytoum/docket/latest?label=docker%20image%20ver.)](https://hub.docker.com/r/bytoum/docket/tags)

## ⭐ Features

- 🧑‍💼 Manage your `compose.yaml` files
  - Create/Edit/Start/Stop/Restart/Delete
  - Update Docker Images
- ⌨️ Interactive Editor for `compose.yaml`
- 🧩 Visual stack editor - Add and edit containers, networks and volumes in side panels. Changes are written to your `compose.yaml`
- 🔑 Environment variable editor for each container, as a list or as raw `KEY=value` text
- 📜 Live logs in a console dock - Filter by container or text, clear, and resize
- 🦦 Interactive Web Terminal
- 👥 Multiple users - Each person logs in with their own account. The owner adds, disables and removes users
- ⏱️ Session expiry - Logins end after a set time (1 day by default)
- 🕷️ Multiple agents support - You can manage multiple stacks from different Docker hosts in one single interface
- 🏪 Convert `docker run ...` commands into `compose.yaml`
- 📙 File based structure - Docket won't kidnap your compose files, they are stored on your drive as usual. You can interact with them using normal `docker compose` commands
- 🚄 Reactive - Everything is just responsive. Progress (Pull/Up/Down) and terminal output are in real-time

## 🔧 How to Install

Requirements:
- [Docker](https://docs.docker.com/engine/install/) 20+ / Podman
- (Podman only) podman-docker (Debian: `apt install podman-docker`)
- OS:
  - Major Linux distros that can run Docker/Podman such as:
     - ✅ Ubuntu
     - ✅ Debian (Bullseye or newer)
     - ✅ Raspbian (Bullseye or newer)
     - ✅ CentOS
     - ✅ Fedora
     - ✅ ArchLinux
  - ❌ Debian/Raspbian Buster or lower is not supported
  - ❌ Windows (Will be supported later)
- Arch: armv7, arm64, amd64 (a.k.a x86_64)

### Basic

- Default Stacks Directory: `/opt/stacks`
- Default Port: 5001

```
# Create directories that store your stacks and Docket's own compose file
mkdir -p /opt/stacks /opt/docket
cd /opt/docket

# Download the compose.yaml
curl https://raw.githubusercontent.com/bytoum/docket/main/compose.yaml --output compose.yaml

# Start the server
docker compose up -d

# If you are using docker-compose V1 or Podman
# docker-compose up -d
```

Docket is now running on http://localhost:5001

### Switching from Dockge

1. In your Dockge `compose.yaml`, change the image to `bytoum/docket:latest`.
2. Rename the environment variables from `DOCKGE_*` to `DOCKET_*`, for example `DOCKGE_STACKS_DIR` to `DOCKET_STACKS_DIR`. The old names are no longer read, and Docket logs a warning for each one it finds.
3. Run `docker compose up -d`.

Your data carries over: on first start, `data/dockge.db` is renamed to `data/docket.db`, and stack URLs saved under `x-dockge` in your compose files still work (they move to `x-docket` the next time you save them). You can keep the `/opt/dockge` directory and the `dockge` service name.

### Custom stacks directory

Copy and paste the compose file below. To store your stacks in another directory, change both the stacks volume and the `DOCKET_STACKS_DIR` environment variable.

Add `PUID` and `PGID` to set the owner of the stack files and folders; otherwise they are owned by `root`.

compose:
```
services:
  docket:
    image: bytoum/docket:latest
    restart: unless-stopped
    ports:
      # Host Port:Container Port
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
        
      # If you want to use private registries, you need to share the auth file with Docket:
      # - /root/.docker/:/root/.docker

      # Stacks Directory
      # Your stacks directory in the host (The paths inside container must be the same as the host)
      # ⚠️ If you did it wrong, your data could end up be written into a wrong path.
      # ✔️ CORRECT EXAMPLE: - /my-stacks:/my-stacks (Both paths match)
      # ❌ WRONG EXAMPLE: - /docker:/my-stacks (Both paths do not match)
      - /opt/stacks:/opt/stacks
    environment:
      # Tell Docket where your stacks directory is
      - DOCKET_STACKS_DIR=/opt/stacks
      # Both PUID and PGID must be set for it to do anything
      - PUID=1000 # Set the stack file/dir ownership to this user
      - PGID=1000 # Set the stack file/dir ownership to this group
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DOCKET_STACKS_DIR` | `/opt/stacks` | Directory that holds your stacks |
| `DOCKET_DATA_DIR` | `./data/` | Directory for the database (users, settings, agents) |
| `DOCKET_PORT` | `5001` | Port to listen on |
| `DOCKET_HOSTNAME` | all interfaces | Address to bind to |
| `DOCKET_SSL_KEY`, `DOCKET_SSL_CERT` | | Key and certificate files to serve over HTTPS |
| `DOCKET_SSL_KEY_PASSPHRASE` | | Passphrase for the SSL key |
| `DOCKET_SESSION_EXPIRY` | `1d` | How long a login lasts, such as `30m`, `12h` or `7d`, or `never` |
| `DOCKET_ENABLE_CONSOLE` | `false` | Allow the host console (a shell on the Docker host) |
| `PUID`, `PGID` | | Owner of the stack files and folders. Both must be set |
| `TZ` | system timezone | Timezone, such as `Europe/Paris` |

[.env.example](./.env.example) lists them all with comments.

## 👥 Users

The account created on first start is the **owner**. Under **Settings → Users**, the owner can add users, disable or enable them, and delete them. Disabled and deleted users are logged out right away. Every user has full access to stacks, terminals, settings and agents.

When upgrading from a single-user install, the existing user becomes the owner.

To reset a forgotten password, run the command below. With several users, it asks which one to reset.

```bash
cd /opt/docket
docker compose exec docket npm run reset-password
```

## 🚀 Deploy from GitHub Actions

There are two kinds of webhook. Each one is a secret URL:

- **Stack webhook.** Pulls the stack's images and recreates the containers. Open the stack, click the **⌄** button at the end of the Start / Restart / Update / Stop buttons, then choose **Webhook**.
- **Container webhook.** Pulls one service's image and restarts only that container, leaving the other services alone. Use it when CI builds the image of just one service. Click the link icon on that container's card.

Both kinds always run: a stopped stack or container is started too. A stack webhook is the same as `docker compose pull && docker compose up -d`.

1. Open the webhook panel as described above, then click **Create webhook**.
2. Copy the URL. It is shown only once; if you lose it, use **Regenerate URL**, which also turns the old one off.
3. In your GitHub repository, add it as the secret `DOCKET_WEBHOOK_URL` (Settings → Secrets and variables → Actions).
4. Add a step at the end of your workflow, after the image is pushed:

```yaml
- name: Redeploy on Docket
  run: curl -fsS -X POST --max-time 600 "${{ secrets.DOCKET_WEBHOOK_URL }}"
```

The request waits for the update to finish, so the step fails when the update fails. Docket answers with:

| Status | Meaning |
|---|---|
| `200` | Updated |
| `404` | Unknown URL, or the stack no longer exists |
| `409` | Another operation is running on the stack; try again |
| `429` | More than 30 calls with unknown URLs in a minute (valid URLs are never limited) |
| `500` | The pull or the restart failed; the Docket log has details |

Docket must be reachable from GitHub's runners (or use a self-hosted runner). If it runs behind a reverse proxy, raise the proxy's read timeout (for example `proxy_read_timeout 600s;` in nginx) so a long pull isn't cut off. A stack on a remote agent gets a URL on that agent's host.

## How to Update

```bash
cd /opt/docket
docker compose pull && docker compose up -d
```

## How to Build the Image

```bash
npm run build:frontend
docker buildx build --platform linux/amd64,linux/arm64 \
  -t bytoum/docket:latest --target release -f ./docker/Dockerfile . --push
```

The frontend must be built first: the image copies `frontend-dist/`, not the `frontend/` sources.

## Run from Source

Requires Node.js 22 and Docker with `docker compose`.

```bash
npm install
cp .env.example .env   # then edit .env, for example DOCKET_STACKS_DIR
npm run dev            # frontend on :5000, backend on :5001
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more.

## 🗣️ Community and Contribution

### Bug Report
https://github.com/bytoum/docket/issues

### Translation
Translations come from Dockge. To translate into your language, please read the [Translation Guide](https://github.com/louislam/dockge/blob/master/frontend/src/lang/README.md).

### Create a Pull Request

Be sure to read the [guide](./CONTRIBUTING.md) first.

## FAQ

#### "Docket"?

A docket is a list of things to be dealt with, like a court's list of cases. Docket keeps the list of your compose stacks and runs them. It is based on [Dockge](https://github.com/louislam/dockge), whose name came from Twitch emotes like `sadge`, `bedge` or `wokege`.

#### Can I manage a single container without `compose.yaml`?

The main objective of Docket is to try to use the docker `compose.yaml` for everything. If you want to manage a single container, you can just use Portainer or Docker CLI.

#### Can I manage existing stacks?

Yes, you can. However, you need to move your compose file into the stacks directory:

1. Stop your stack
2. Move your compose file into `/opt/stacks/<stackName>/compose.yaml`
3. In Docket, click the " Scan Stacks Folder" button in the top-right corner's dropdown menu
4. Now you should see your stack in the list

#### Is Docket a Portainer replacement?

Yes or no. Portainer provides a lot of Docker features. While Docket is currently only focusing on docker-compose with a better user interface and better user experience.

If you want to manage your container with docker-compose only, the answer may be yes.

If you still need to manage things outside of compose stacks, like single containers or host-wide networks and volumes, the answer may be no. Networks and volumes that belong to a stack can be managed in Docket.

#### Can I install both Docket and Portainer?

Yes, you can.

## Others

Docket is built on top of [Compose V2](https://docs.docker.com/compose/migrate/). `compose.yaml`  also known as `docker-compose.yml`.

## License

MIT. Docket is a fork of [Dockge](https://github.com/louislam/dockge), © 2023 Louis Lam; see [LICENSE](./LICENSE).
