# Instagram Reel Auto-Reposter

### Share a Reel by DM, and your channel posts it automatically, with your brand frame and a new AI caption

---

## What this does, in plain English

1. You scroll Instagram on your **personal account** (we call it **Account A**).
2. You find a Reel you like and tap **Share → send it by DM to your channel account** (**Account B**).
3. Within about 1–3 minutes, with no further action from you, the system:
   - checks that the DM came from **you** (anyone else who DMs your channel is ignored)
   - downloads the Reel
   - puts your **Canva brand frame** (border/logo) on top of it
   - writes a **new catchy caption with 5 hashtags** using Google's free Gemini AI
   - **publishes it as a Reel on Account B**
   - sends you a DM back: "✅ Reposted to your channel!" with a link (or "❌ Could not repost" with the reason)

```
 Your phone (Account A)                 YOUR COMPUTER (runs this project)                     Instagram
 ─────────────────────                  ────────────────────────────────────                  ─────────
  Share Reel by DM  ───► Instagram ───►  ngrok/Cloudflare ─► n8n workflow                    
  to Account B           (webhook)       public address      │ 1. Is it from Account A?         
                                                             │ 2. Add Canva frame (FFmpeg)      
                                                             │ 3. AI caption (Gemini)           
                                                             │ 4. Upload + publish  ─────────►  New Reel
                                                             └ 5. DM you "✅ Posted"            on Account B
```

> **Important:** everything runs **on your computer**. The computer must be **switched on, awake, and connected to the internet**, with **Docker Desktop running**, for Reels to be posted. If the computer is off when you share a Reel, that Reel is skipped and is not posted later. Share it again once the computer is back on.

---

## Contents

| Step | What | Time |
|---|---|---|
| [1](#step-1--what-you-need) | What you need | 2 min |
| [2](#step-2--install-docker-desktop) | Install Docker Desktop | 10 min |
| [3](#step-3--put-the-project-on-your-computer) | Put the project on your computer | 2 min |
| [4](#step-4--get-a-free-public-address-ngrok) | Get a free public address (ngrok) | 5 min |
| [5](#step-5--make-your-canva-frame) | Make your Canva frame | 10 min |
| [6](#step-6--get-a-free-gemini-ai-key) | Get a free Gemini AI key | 2 min |
| [7](#step-7--first-start) | First start + create your n8n login | 10 min |
| [8](#step-8--connect-instagram-meta-developer-setup) | Connect Instagram (Meta developer setup) | 30 min |
| [9](#step-9--tell-the-system-which-account-is-you) | Tell the system which account is you | 5 min |
| [10](#step-10--test-safely-then-go-live) | Test safely, then go live | 10 min |
| [11](#everyday-use) | Everyday use | — |
| [12](#starting-stopping-and-changing-settings) | Starting, stopping and changing settings | — |
| [13](#troubleshooting) | Troubleshooting | — |
| [14](#limits-risks-and-good-practice) | Limits, risks and good practice | — |
| [15](#reference) | Reference (files and settings) | — |

Total first-time setup takes about **1.5 hours**. You only do it once.

---

## Step 1 — What you need

| Item | Notes | Cost |
|---|---|---|
| A computer that can stay on | Windows 10/11 (64-bit) or a Mac (2016 or newer, Intel or Apple Silicon). 8 GB RAM recommended, ~5 GB free disk space. | — |
| **Account A** | Your personal Instagram account (the one you scroll with). | Free |
| **Account B** | The channel that will post. It must be a **Professional account** (Business or Creator) and **linked to a Facebook Page** that you manage. Step 8.1 shows how. | Free |
| A Facebook account | The one that manages the Facebook Page linked to Account B. | Free |
| Canva account | For designing the frame. The free plan is enough. | Free |
| Google account | For the Gemini AI key. | Free |
| ngrok account | Gives your computer a fixed public web address. | Free |

You do **not** need to know how to code. You'll copy and paste a few values into one settings file.

---

## Step 2 — Install Docker Desktop

Docker is a free program that runs all parts of this system in the background, so you don't have to install them one by one.

### Windows
1. Go to **https://www.docker.com/products/docker-desktop/** and click **Download for Windows**.
2. Run the installer. Leave **"Use WSL 2 instead of Hyper-V"** ticked. Click **OK / Close** when done.
3. **Restart your computer** if it asks you to.
4. Open **Docker Desktop** from the Start menu. Accept the terms. You can skip signing in and skip the survey.
5. Wait until the bottom-left of the Docker window shows **"Engine running"** (green).
6. Open the gear icon (**Settings**) → **General** → tick **"Start Docker Desktop when you sign in to your computer"**. Then Docker starts by itself after a reboot.

> If Docker says **"WSL needs updating"**, click the link it shows, or open the Start menu, type `PowerShell`, open it and run `wsl --update`, then restart Docker Desktop.
> If it says **"Virtualization not enabled"**, it has to be switched on in your computer's BIOS. Search "*your laptop model* enable virtualization" for instructions.

### Mac
1. Go to **https://www.docker.com/products/docker-desktop/**, click **Download for Mac** and choose **Apple Silicon** (M1/M2/M3/M4) or **Intel**. If you're not sure, click  → *About This Mac* and look at "Chip".
2. Open the downloaded `.dmg` and drag **Docker** into **Applications**.
3. Open Docker from Applications and accept the terms.
4. Wait until the whale icon in the top menu bar stops animating, which means Docker is running.
5. Docker **Settings** → **General** → tick **"Start Docker Desktop when you sign in"**.

---

## Step 3 — Put the project on your computer

1. Download this project as a ZIP. On GitHub: green **Code** button → **Download ZIP**.
2. Unzip it somewhere simple, for example:
   - Windows: `C:\ReelReposter`
   - Mac: your **Documents** folder → `ReelReposter`

> **Windows tip:** don't put the folder inside OneDrive. OneDrive sync can lock files while Docker is using them. Your Desktop is often synced to OneDrive, so `C:\ReelReposter` is safer.

Inside the folder you'll see:

```
ReelReposter/
├── README.md              ← this guide
├── .env.example           ← settings template (the setup creates your ".env" from it)
├── branding/              ← put your Canva frame here as frame.png
├── windows/               ← double-click tools for Windows (1-setup.bat, etc.)
├── scripts/               ← tools for Mac (and the Windows setup script)
├── workflows/             ← the n8n automation (imported automatically)
├── ffmpeg-api/            ← the part that adds your frame to videos
├── caddy/                 ← security "doorman" config
└── docker-compose.yml     ← tells Docker what to run
```

> **Can't see `.env.example`?** Files starting with a dot are hidden by default.
> Windows: in File Explorer click **View → Show → Hidden items**. Mac: in Finder press **Cmd + Shift + .**

---

## Step 4 — Get a free public address (ngrok)

Instagram needs a web address to send your DMs to. Your home computer doesn't have one, so **ngrok** gives it a free, permanent address such as `calm-tiger-example.ngrok-free.app`.

1. Sign up at **https://dashboard.ngrok.com/signup** (free).
2. **Get your Authtoken:** in the left menu, open **Getting Started → Your Authtoken** and click **Copy**. Keep this page open.
3. **Get your free domain:** in the left menu, open **Universal Gateway → Domains** (on some accounts it's under **Cloud Edge → Domains**). You'll see one free domain already created, or a **+ Create Domain** / **New Domain** button. Copy the domain name, which looks like `something-something-1234.ngrok-free.app`.

You'll paste both into the settings file in Step 7.

<details>
<summary><b>Alternative: Cloudflare Tunnel (only if you own a domain name)</b></summary>

If you own a domain (e.g. `mybrand.com`) and it is managed in Cloudflare:

1. Go to **https://one.dash.cloudflare.com** → **Networks → Tunnels** → **Create a tunnel** → choose **Cloudflared** → give it a name → **Save**.
2. On the "Install connector" screen, pick **Docker**. You'll see a command containing `--token eyJ...`. Copy **only** the long token after `--token`.
3. Click **Next**. Add a **Public hostname**: Subdomain `reels`, Domain `mybrand.com`, Service type **HTTP**, URL **`caddy:80`**. Save.
4. In `.env` (Step 7) set:
   ```
   COMPOSE_PROFILES=cloudflare
   PUBLIC_DOMAIN=reels.mybrand.com
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...your token...
   ```
</details>

---

## Step 5 — Make your Canva frame

The frame is a picture with a **see-through middle** that is laid on top of every Reel. Your border, logo, @handle, colours and so on go around the edges.

1. Open **https://www.canva.com** → **Create a design** → **Custom size** → **1080 × 1920 px**. Or search for "Instagram Reel", which is the same size.
2. Design only the **edges**: for example a coloured border, your logo in a corner, your @handle in a top or bottom bar.
   - **Leave the centre empty.** That's where the video shows.
   - Keep important things away from the very bottom (~250 px) and the right side, because Instagram's buttons and caption cover those areas in the app.
3. **Remove the background:** click on an empty part of the page, then click the background colour square and choose **no colour / transparent**. If there's a background picture, delete it.
4. **Export:** **Share → Download** → File type **PNG** → tick **"Transparent background"** → **Download**.
   - ⚠️ "Transparent background" needs **Canva Pro**. If you're on the free plan:
     - Canva often offers a **free 30-day Pro trial**. You only need to export the frame once, so you can export and then cancel.
     - Or export a normal PNG with a pure black or white centre and remove the centre for free at **https://www.remove.bg** or **https://www.photopea.com** (Magic Wand → select the centre → Delete → File → Export as → PNG).
5. Rename the downloaded file to exactly **`frame.png`** and put it in the project's **`branding`** folder.

**Want to try things first?** The `branding` folder contains `example-frame.png` (an orange border with dark bars). Copy it and rename the copy to `frame.png`.

> You can replace `frame.png` at any time. The next Reel uses the new one, and you don't need to restart anything.

<details>
<summary><b>Alternative: host the frame online (Cloudinary)</b></summary>

If you'd rather keep the frame online:
1. Sign up free at **https://cloudinary.com** → **Media Library** → **Upload** your PNG.
2. Click the uploaded image → **Copy URL**. It looks like `https://res.cloudinary.com/yourname/image/upload/v123/frame.png`.
3. In `.env` set `CANVA_FRAME_PNG_URL=` followed by that link. While this setting is filled in, it is used instead of `branding/frame.png`.
</details>

---

## Step 6 — Get a free Gemini AI key

1. Go to **https://aistudio.google.com/apikey** and sign in with your Google account.
2. Click **Create API key**. If asked, choose **Create API key in new project**.
3. Copy the key (it starts with `AIza...`).

The free tier is far more than this system needs. If the AI is ever unavailable, the Reel is **still posted** with a simple fallback caption (the first line of the original description plus your `FALLBACK_HASHTAGS`).

---

## Step 7 — First start

### 7.1 Create and fill your settings file

**Windows:** open the `windows` folder and **double-click `1-setup.bat`**.
**Mac:** open the **Terminal** app, type `cd ` (with a space after it), drag the project folder into the Terminal window, press **Enter**, then run:
```bash
bash scripts/setup.sh
```

The first time, it creates a file called **`.env`** (your personal settings) and opens it in Notepad or TextEdit. Fill in **section A** now:

```ini
COMPOSE_PROFILES=ngrok
PUBLIC_DOMAIN=calm-tiger-example.ngrok-free.app      ← your ngrok domain (no https://)
NGROK_AUTHTOKEN=2abc...your token...                 ← from ngrok Step 4
```

While the file is open, also fill in:

```ini
GEMINI_API_KEY=AIza...your key...                    ← from Step 6
CHANNEL_NICHE=Describe your channel in one sentence  ← the AI uses this for captions
CAPTION_FOOTER=Follow @yourchannel for more!         ← optional, added under every caption
```

Leave the Meta values empty for now. **Save and close** the file.

> **Rules for the .env file:** one setting per line, `NAME=value`, **no spaces around `=`**, no quote marks. Lines starting with `#` are just notes.
> Mac TextEdit users: if TextEdit adds formatting, choose **Format → Make Plain Text** before saving.

### 7.2 Start everything

Run the setup again: **double-click `windows\1-setup.bat`** (Windows) or `bash scripts/setup.sh` (Mac).

The **first run downloads about 1 GB** and can take **5–15 minutes**. You'll see a lot of text scrolling past, which is normal. It finishes with a box like this:

```
=================== ALL SET ===================
 n8n editor (this computer only):  http://localhost:5678
 Public check (open in browser):   https://calm-tiger-example.ngrok-free.app/healthz

 For the Meta webhook settings (README step 8.6):
   Callback URL:  https://calm-tiger-example.ngrok-free.app/webhook/ig-dm
   Verify token:  verify_3f9a1c...

 Mode: DRY RUN (test mode, nothing is posted)
===============================================
```

**Keep this window open or copy the Callback URL and Verify token.** You need them in Step 8.6. Running the setup again shows them again.

### 7.3 Check the public address works

Open the **Public check** link (`https://YOUR-DOMAIN/healthz`) in your browser. You should see:
> ok - your Reel reposter is reachable

(ngrok may first show a "You are about to visit…" page. Click **Visit Site**. That page only appears in browsers and doesn't affect Instagram.)

### 7.4 Create your n8n login

1. Open **http://localhost:5678** in your browser. This address only works on this computer, so nobody on the internet can reach your editor.
2. Fill in the **Set up owner account** form (email, name, password). This is a local login stored on your computer. **Write the password down.**
3. Skip the questions and the "paid features" offer. They're optional.
4. On the **Overview / Workflows** page, open **"Instagram Reel Auto-Reposter"**. You'll see the whole automation as boxes connected by lines.
5. Check the toggle at the **top right** says **Active** (newer n8n versions show a **Published** state instead).
   - If it is **off / not published**, click it to switch it on, and confirm.

> **About the workflow:** every box reads its settings from your `.env` file, so you never need to type tokens into n8n. If you change the workflow in n8n, note that **running setup again re-imports the original workflow** and overwrites your changes.

---

## Step 8 — Connect Instagram (Meta developer setup)

This is the longest step. Take it slowly. Meta changes its screen layouts often, so the names of buttons may differ slightly from what's written here. Look for the closest match.

We use Meta's **Development Mode**: the app is used only by you (as its Admin), so you **don't need Meta's App Review or Business Verification**.

### 8.1 Prepare Account B (the channel)

1. **Make it a Professional account:** In the Instagram app on Account B → **profile** → **☰ menu** → **Settings and privacy** → **Account type and tools** → **Switch to professional account** → choose **Creator** or **Business**.
2. **Link it to a Facebook Page:**
   - If you don't have a Page: on Facebook → **Menu → Pages → Create new Page** (any name, e.g. your channel's name).
   - In Instagram (Account B): **Edit profile** → **Page** (under "Public business information") → **Connect** the Page. Or on Facebook: **Page → Settings → Linked accounts → Instagram → Connect account**.
3. **Allow access to messages** (needed so DMs reach the system):
   Instagram app (Account B) → **Settings and privacy** → **Messages and story replies** → **Message controls** → **Connected tools** → turn **"Allow access to messages" ON**.
4. **From Account A, follow Account B, and send it one normal DM** ("hi"). On Account B, **accept** the message request if one appears. This makes sure future shares land in the main inbox.

### 8.2 Create a Meta developer account and app

1. Go to **https://developers.facebook.com** and log in with the **Facebook account that manages the Page**.
2. If this is your first time, click **Get Started** / **Register** and follow the prompts (verify your phone/email).
3. Click **My Apps** → **Create App**.
4. Give it a name such as `Reel Reposter` and enter your email. Click **Next**.
5. **Use case / app type:**
   - If asked for a **use case**, choose **"Other"** → **Next** → app type **"Business"**. If you see a use case called **"Manage messaging & content on Instagram"**, that one also works.
   - If asked "Connect a business portfolio", choose **"I don't want to connect a business portfolio yet"**.
6. Click **Create app** and re-enter your Facebook password if asked.

### 8.3 Add the Instagram product

1. In your app's dashboard, find **Add products to your app** (or **Use cases → Customize**).
2. Find **Instagram** (it may say **"Instagram API with Facebook Login"**, or **"Instagram Graph API"**) → click **Set up**.
3. Also add **Webhooks** with **Set up** if it's listed separately. Some layouts include it inside the Instagram product.

### 8.4 Make sure you are the app's Admin

Open **App roles → Roles** in the left menu. Your Facebook account should already be listed as **Administrator** because you created the app. If someone else created the app, ask them to add you as **Administrator** here, then accept the invitation at https://developers.facebook.com/requests.

Leave the app in **Development** mode (the toggle at the top of the dashboard). **Don't switch it to Live.**

### 8.5 Get your never-expiring token (with the helper)

**a) Get your App ID and App Secret**
App dashboard → **App settings → Basic**. Copy the **App ID**. Click **Show** next to **App Secret** and copy it too.

**b) Get a temporary token from the Graph API Explorer**
1. Open **https://developers.facebook.com/tools/explorer/**
2. At the top right, under **Meta App**, pick your app (`Reel Reposter`).
3. Under **User or Page**, choose **User Token**.
4. Under **Permissions**, add **all** of these. Start typing each name and click it:
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_messages`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `business_management`
5. Click **Generate Access Token**. A Facebook window opens:
   - Click **Continue as …**
   - When asked which **Pages** to allow, **select the Page linked to Account B**.
   - When asked which **Instagram accounts**, **select Account B**.
   - Keep all permissions switched on → **Save / Done**.
6. Back in the Explorer, the **Access Token** box now contains a long token. Click the copy icon next to it.

**c) Run the helper**
**Windows:** double-click **`windows\2-meta-token.bat`**
**Mac:** `bash scripts/reposter.sh meta-token`

Paste the **App ID**, **App Secret** and the **token** when asked. To paste in the black window, right-click (Windows) or press Cmd+V (Mac), then press **Enter** after each one.

The helper:
- exchanges the temporary token for a **never-expiring Page token**
- finds Account B's **Instagram Business Account ID**
- connects your Page to the app so DMs are delivered

It finishes with:
```
================  COPY THESE INTO YOUR .env FILE  ================

META_PAGE_ACCESS_TOKEN=EAAG...very long...
IG_BUSINESS_ACCOUNT_ID=17841400000000000

==================================================================
```
Open `.env`, paste these two lines over the empty ones, and save.

Then **run the setup again** (`windows\1-setup.bat` or `bash scripts/setup.sh`) so the new values are applied.

> 🔒 **Keep the token secret.** Anyone who has it can post to Account B. If it ever leaks, change your Facebook password or remove the app at Facebook → Settings → Business integrations. Both invalidate the token.

<details>
<summary><b>No helper? Doing it by hand</b></summary>

1. Long-lived user token: open this in your browser (replace the CAPITALS):
   `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN`
   Copy the `access_token` value.
2. In the Graph API Explorer, paste that long-lived token into the Access Token box and run:
   `me/accounts?fields=name,access_token,instagram_business_account`
3. For your Page, `access_token` is your **META_PAGE_ACCESS_TOKEN** (never expires) and `instagram_business_account.id` is your **IG_BUSINESS_ACCOUNT_ID**.
4. Subscribe the Page: in the Explorer, switch the method to **POST**, use the Page token, and run `PAGE_ID/subscribed_apps?subscribed_fields=messages`.
5. You can check the token at https://developers.facebook.com/tools/debug/accesstoken/. It should say **Expires: Never**.
</details>

### 8.6 Connect the webhook (how Instagram tells your computer about DMs)

1. Make sure the system is running: you ran setup and the `/healthz` check from Step 7.3 works.
2. In the app dashboard, open **Webhooks** (left menu, or inside the Instagram product → **Configure webhooks**).
3. If there is a dropdown for the object type, choose **Instagram**. Click **Subscribe to this object** or **Edit subscription**.
4. Enter:
   - **Callback URL:** `https://YOUR-DOMAIN/webhook/ig-dm` (shown at the end of setup)
   - **Verify token:** the `META_VERIFY_TOKEN` value (shown at the end of setup, also in your `.env`)
5. Click **Verify and save**. If it saves without an error, the connection works. ✅
6. In the list of fields that appears, find **`messages`** and click **Subscribe** (switch it **on**). Leave the others off.

> If **Verify and save** fails, see [Troubleshooting](#troubleshooting) → "Meta says the callback URL couldn't be validated".

---

## Step 9 — Tell the system which account is you

Instagram doesn't send your @username. It sends a long number that identifies Account A to your channel. You put this number in `.env` so the system only accepts Reels from you.

1. From **Account A**, open any Reel → tap the **paper-plane (Share)** icon → send it to **Account B**.
2. On your computer, open **http://localhost:5678** → open the workflow → click the **Executions** tab (top centre).
3. Click the newest execution (a few seconds old). It will show the path stopping at **"Ignore (not from you / not a Reel)"**. That's expected, because the system doesn't know you yet.
4. Click the **"Parse DM Event"** box and look at the **Output** panel on the right. Find:
   ```
   senderId:       1234567890123456     ← THIS is your ALLOWED_SENDER_IG_ID
   attachmentType: ig_reel
   mediaUrl:       https://lookaside.fbsbx.com/...
   ```
5. Open `.env` and set:
   ```ini
   ALLOWED_SENDER_IG_ID=1234567890123456
   ```
6. Save, then **run the setup again**.

> **No execution appeared?** The DM didn't reach your computer. See [Troubleshooting](#troubleshooting) → "No executions appear when I send a DM".

---

## Step 10 — Test safely, then go live

Your `.env` starts with **`DRY_RUN=true`**. In this mode the system does everything **except** post to Instagram, so you can check the frame and captions first.

### 10.1 Preview your frame (no Instagram involved)
**Windows:** double-click `windows\3-test-frame.bat`  **Mac:** `bash scripts/reposter.sh test-frame`

This makes two short test videos with your frame and prints two links (`http://localhost:8080/files/sample-branded-...mp4`). Open them in your browser and check:
- Is the frame the right way round and fully visible?
- Is the centre see-through? If the video is hidden, the PNG background wasn't transparent. Go back to Step 5.

### 10.2 Test the whole automation with a fake DM
**Windows:** double-click `windows\4-test-pipeline.bat`  **Mac:** `bash scripts/reposter.sh test-pipeline`

Then go to **http://localhost:5678** → workflow → **Executions** → open the newest one. After about a minute, click the green **"Dry Run Complete"** box to see:
- `caption`: the AI-written caption
- `previewOnThisComputer`: a link to the branded video

### 10.3 Test with a real Reel (still dry run)
From Account A, share a real Reel to Account B. Check the execution again, and open the preview link to check the result.

### 10.4 Go live 🚀
1. Open `.env` and change:
   ```ini
   DRY_RUN=false
   ```
2. Save and **run the setup again**. The summary now says `Mode: LIVE`.
3. Share a Reel from Account A. Within about 1–3 minutes it's on Account B, and you get a "✅ Reposted" DM.

---

## Everyday use

- **To post:** share any Reel from Account A to Account B by DM. That's all.
- **Check the computer is ready:** Docker Desktop is open (whale icon in the system tray or menu bar), and the computer is awake and online.
- **See what happened:** http://localhost:5678 → workflow → **Executions**. Green means it worked; red means it failed. Click a red one, then the red box, to see why.
- **Text-only DMs, photos from other people, and messages from anyone except Account A are ignored.**
- If you share the same Reel twice, it is posted twice. Meta's automatic *retries* of the same message are detected and ignored.

### Keep the computer awake
- **Windows:** Settings → System → **Power** (& battery) → **Screen and sleep** → set *"When plugged in, put my device to sleep after"* to **Never**. The screen can still turn off.
- **Mac:** System Settings → **Energy** (or Battery → Options) → turn on **"Prevent automatic sleeping when the display is off"** (on power adapter).

---

## Starting, stopping and changing settings

| I want to… | Windows (double-click in `windows\`) | Mac (Terminal, inside the project folder) |
|---|---|---|
| Start / restart / **apply .env changes** | `1-setup.bat` | `bash scripts/setup.sh` |
| Stop everything | `stop.bat` | `bash scripts/reposter.sh stop` |
| See if it's running | `show-status.bat` | `bash scripts/reposter.sh status` |
| See live logs | `show-logs.bat` | `bash scripts/reposter.sh logs` |
| Get / renew the Meta token | `2-meta-token.bat` | `bash scripts/reposter.sh meta-token` |
| Preview the frame | `3-test-frame.bat` | `bash scripts/reposter.sh test-frame` |
| Dry-run test | `4-test-pipeline.bat` | `bash scripts/reposter.sh test-pipeline` |

- **After a reboot:** if Docker Desktop is set to start on login (Step 2), everything starts again automatically within a minute or two. You don't need to run anything.
- **After editing `.env`:** always run setup again. Changes are only applied then.
- **Changing the frame:** just replace `branding/frame.png`. No restart is needed.
- **Updating n8n:** run setup again. It fetches the newest version (`N8N_VERSION=latest`).

---

## Troubleshooting

| Problem | What to do |
|---|---|
| **Setup says "Docker Desktop is not running"** | Open Docker Desktop and wait for "Engine running" (Windows) or a still whale icon (Mac). Then run setup again. |
| **Windows: double-clicking the .bat flashes and closes, or "running scripts is disabled"** | Right-click `1-setup.bat` → **Run as administrator** once. Or open PowerShell in the project folder and run `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1`. |
| **`https://YOUR-DOMAIN/healthz` doesn't load** | Check `PUBLIC_DOMAIN` and `NGROK_AUTHTOKEN` in `.env` (no spaces, no `https://`). Run `show-logs.bat` and look for lines from `ngrok`. Errors such as "authentication failed" mean a wrong token, and "domain not found" means a wrong domain. You can only use the **one** domain shown in your ngrok dashboard. |
| **Meta says "The callback URL or verify token couldn't be validated"** | 1) Does `/healthz` work? 2) Is the workflow **Active / Published** in n8n? 3) The verify token in Meta must be **exactly** the `META_VERIFY_TOKEN` in `.env`, and you must run setup after changing it. 4) The URL must end in `/webhook/ig-dm`, **not** `/webhook-test/...`. |
| **No executions appear when I send a DM** | Check, in this order: (a) Step 8.1.3, "Allow access to messages", is ON for Account B. (b) The `messages` field is **subscribed** in the Meta Webhooks page. (c) Run the Meta token helper again and check it says "Subscribed". (d) The workflow is Active. (e) **Development mode:** Meta only delivers DMs from people who have a role on the app. Make sure **Account A is connected to the same Facebook account that is the app's Admin** (Instagram app on Account A → Settings → **Accounts Center** → add your Facebook account). If Account A belongs to someone else, add their Facebook account under **App roles → Roles** as a Tester or Admin, and they must accept the invite. (f) Accept any message request from Account A on Account B. |
| **Execution stops at "Ignore (not from you / not a Reel)"** | Open **Parse DM Event** → Output. If `senderId` ≠ your `ALLOWED_SENDER_IG_ID`, update `.env` and run setup. If `attachmentType` is `none` or `mediaUrl` is empty, you sent text, or Instagram didn't include a video link (see the next row). |
| **"Download failed (HTTP 403)" at the Render step** | That Reel is from a **private or restricted account**, or the creator blocked sharing. Instagram won't let it be downloaded, so try a different Reel. This can't be fixed in this system. |
| **"No Canva frame found"** | Put `frame.png` in the `branding` folder (exact name, lowercase), or set `CANVA_FRAME_PNG_URL`. |
| **Error at "Create Media Container": "Invalid OAuth access token" / code 190** | The token is wrong or was revoked (for example after a Facebook password change). Repeat Step 8.5 and run setup. |
| **Error code 10 or 200, "permission"** | The token is missing a permission. Repeat Step 8.5 and tick **all** listed permissions, plus select the right Page and Instagram account in the login pop-up. |
| **"Instagram status ERROR" / "Media upload has failed"** | Instagram rejected the video. This usually happens with very long (>15 min) or very short (<3 s) Reels. Try a different Reel. If it happens for **all** Reels, check that `https://YOUR-DOMAIN/files/...` links open from your phone on mobile data (not Wi-Fi). |
| **"Application request limit reached" / code 4 or 9** | Instagram allows about **50 API posts per 24 hours** per account. Wait and try again tomorrow. |
| **Caption is the plain fallback, not AI** | Open the **Build Caption** box: `aiError` explains. Usually it's a wrong `GEMINI_API_KEY` or the free quota is used up for the day. Posting still works. |
| **No "✅ Reposted" DM** | Posting worked. Only the reply failed, usually because the token lacks `instagram_manage_messages`. Set `SEND_DM_CONFIRMATIONS=false` to turn replies off, or redo Step 8.5. |
| **Meta says Graph API v22.0 is deprecated** | Change `GRAPH_API_VERSION` in `.env` to the newest version Meta lists (e.g. `v24.0`) and run setup. |
| **Something else** | Run `show-logs.bat` (or `bash scripts/reposter.sh logs`). Also check the red box in the failed execution in n8n, which shows the exact error message. |

**Full reset (last resort):** run `docker compose down -v` in the project folder. This **erases** n8n's data, including your n8n login and execution history. Then run setup again and redo Step 7.4.

---

## Limits, risks and good practice

- **Copyright:** Even with your frame and a new caption, **reposting other creators' content can lead to copyright reports**, removed posts, or a restricted account. Good practice: credit the creator (the AI adds `Credit: @username` when the original description mentions one), and ask permission for content you repost often.
- **Instagram limits:** about **50 published posts per 24 hours** through the API. Reels between **3 seconds and 15 minutes**.
- **Private Reels** can't be downloaded (see Troubleshooting).
- **Computer must be on.** DMs sent while it is off, asleep or offline are **not** processed later.
- **Development mode** is intended for personal use by the app's Admin/Testers. It's the officially supported way to use your own accounts without App Review.
- **Security:**
  - The n8n editor is only reachable at `http://localhost:5678` on your computer. It is **not** exposed to the internet.
  - From the internet, only the webhook (`/webhook/...`) and the finished videos (`/files/...`) are reachable.
  - Branded videos are deleted automatically after **48 hours**.
  - Never share your `.env` file or post screenshots of it.

---

## Reference

### What each part does

| Part | What it does |
|---|---|
| **n8n** | The automation engine. Runs the workflow `workflows/ig_reel_reposter.json`. Editor at http://localhost:5678. |
| **ffmpeg-api** | A small service that downloads the Reel, resizes it to 1080×1920, puts `frame.png` on top, and makes an Instagram-ready MP4 (H.264 + AAC). |
| **caddy** | The "doorman": lets only the webhook and finished videos through from the internet. Preview videos at http://localhost:8080/files/… |
| **ngrok / cloudflared** | Gives your computer its public https address. |

### The workflow, box by box

| # | Box | Purpose |
|---|---|---|
| 1 | **Meta Verify (GET)** → **Is Valid Verification?** → **Return Challenge** | Answers Meta's one-time check when you click "Verify and save". |
| 2 | **Instagram DM (POST)** | Receives every DM event from Instagram (and replies "OK" immediately). |
| 3 | **Config** | Loads all settings from `.env`. |
| 4 | **Parse DM Event** | Pulls out sender ID, attachment type, video link and original description. Ignores duplicates. |
| 5 | **Allowed Sender & Reel?** | Continues only if it's from Account A **and** is a Reel/post/video. |
| 6 | **Prepare Job** → **Generate Caption (Gemini)** → **Build Caption** | Writes a 2-line hook + 5 hashtags (with a fallback if the AI fails). |
| 7 | **Render Branded Video (FFmpeg)** | Adds your Canva frame and returns a public video link. |
| 8 | **Dry Run?** | In test mode, stops at **Dry Run Complete** and shows the result. |
| 9 | **Create Media Container** | Uploads the video + caption to Instagram. |
| 10 | **Wait 15s** → **Check Container Status** → **Ready to Publish?** | Waits until Instagram has processed the video (checks every 15 s, up to 10 min). |
| 11 | **Publish Reel** → **Get Permalink** → **DM: Posted** | Publishes, then DMs you the link. |
| 12 | **Describe Failure** → **DM: Failed** → **Stop: Repost Failed** | If anything fails, DMs you the reason and marks the run red. |

### All settings (`.env`)

| Setting | Required | Description |
|---|---|---|
| `COMPOSE_PROFILES` | ✅ | `ngrok` or `cloudflare`, depending on which tunnel you use. |
| `PUBLIC_DOMAIN` | ✅ | Your public domain, without `https://`. |
| `NGROK_AUTHTOKEN` | ngrok | From the ngrok dashboard. |
| `CLOUDFLARE_TUNNEL_TOKEN` | cloudflare | From Cloudflare Zero Trust → Tunnels. |
| `META_VERIFY_TOKEN` | ✅ | A password for the webhook check. Auto-generated if empty. |
| `META_PAGE_ACCESS_TOKEN` | ✅ | Never-expiring Page token (Step 8.5). |
| `IG_BUSINESS_ACCOUNT_ID` | ✅ | Account B's Instagram Business ID (Step 8.5). |
| `ALLOWED_SENDER_IG_ID` | ✅ | Account A's ID as seen by Account B (Step 9). |
| `GRAPH_API_VERSION` | | Default `v22.0`. |
| `CANVA_FRAME_PNG_URL` | | Leave empty to use `branding/frame.png`, or set a public PNG link. |
| `GEMINI_API_KEY` | ✅ | Google AI Studio key. |
| `GEMINI_MODEL` | | Default `gemini-2.5-flash`. |
| `CHANNEL_NICHE` | ✅ | One sentence about your channel. It strongly affects caption quality. |
| `CAPTION_FOOTER` | | Text added under every caption. |
| `FALLBACK_HASHTAGS` | | Used when the AI is unavailable. |
| `SEND_DM_CONFIRMATIONS` | | `true` / `false`: whether you get "✅ Posted" / "❌ Failed" DMs. |
| `DRY_RUN` | | `true` = test mode (nothing posted), `false` = live. |
| `TIMEZONE` | | e.g. `Europe/London`, `America/New_York`, `Asia/Kolkata`. |
| `FFMPEG_API_KEY` | | Auto-generated internal password. |
| `N8N_VERSION` | | `latest`, or a specific version number if an update ever causes problems. |

<details>
<summary><b>Advanced: using n8n Cloud instead of local n8n</b></summary>

The workflow can be imported into n8n Cloud (**Workflows → ⋯ → Import from File**), but you would still need to run the `ffmpeg-api` service somewhere reachable from the internet, and n8n Cloud cannot read your `.env` file. In the **Config** box, you would replace each `{{ $env.X }}` with the real value and point `FFMPEG_API_URL` to a public render service. Because your computer is needed for video rendering anyway, the local setup in this guide is the simpler and recommended option.
</details>

<details>
<summary><b>For developers</b></summary>

- `workflows/ig_reel_reposter.json` is generated by `dev/build-workflow.js`. Edit the generator and run `node dev/build-workflow.js`.
- The render service API is `POST http://ffmpeg-api:8080/render` with `{source, frame, jobId}` and header `x-api-key`, which returns `{url, filename, durationSec, ...}`. Output is served at `GET /files/<name>.mp4` (Range supported) and cleaned up after 48 h.
- FFmpeg filter: `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30` → overlay frame → `yuv420p`, libx264 High@4.1, AAC 48 kHz (audio is re-encoded rather than `-c:a copy` for Instagram compatibility; silent audio is added if the source has none; photo posts become 8-second videos).
- Webhook signature (`X-Hub-Signature-256`) isn't verified. Protection comes from the sender whitelist, plus processing only `ig_reel` / `ig_post` / `video` attachments.
</details>
