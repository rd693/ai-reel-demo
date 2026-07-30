# AI Reel Factory

Generates faceless vertical videos end to end: an LLM writes the script,
ElevenLabs voices it, an image model draws each scene, and Remotion renders a
1080x1920 MP4. Series can generate on a schedule, unattended.

## Setup

```bash
npm install                 # also runs prisma generate
cp .env.example .env.local  # then fill in your keys
npm run db:deploy           # creates dev.db from prisma/migrations
npm run dev
```

`ELEVEN_LABS_API_KEY` is required — without it generation stops at the voiceover
stage. At least one of `ANTHROPIC_API_KEY`, `GROK_API_KEY` or `GEMINI_API_KEY`
is needed for scripts. Everything else in `.env.example` is optional and has a
free fallback.

## How a reel is made

`src/lib/pipeline/generateReel.ts` runs four stages and saves after each one:

| Stage | Produces | Stored as |
| --- | --- | --- |
| script | title, narration, one visual prompt per scene | `Reel.script`, `Scene` rows |
| voiceover | MP3 plus word-level timings | `/voiceovers/*.mp3`, `Reel.captionWords` |
| timing | scene start/end from the word timings | `Scene.startMs` / `endMs` |
| visuals | one image per scene, saved as it arrives | `/uploads/*`, `Scene.backgroundPath` |

What still needs doing is derived from what is on the row, not from
`generationStatus`. Retrying a reel that failed at image 7 of 10 regenerates
three images and nothing else — no second LLM or TTS bill.

Rendering is a separate step (`POST /api/render`). Jobs are rows, so progress
and output survive a restart, and the Remotion bundle is cached across renders.

## Running the factory

Set a series to `daily` or `weekly` and leave the worker running:

```bash
npm run worker
```

It checks every `WORKER_INTERVAL_SECONDS` (default 300) and generates for any
active series whose newest reel is older than its interval. One reel per series
at a time. `Ctrl-C` finishes the reel in progress before exiting.

To drive it from an external scheduler instead, `POST /api/cron/tick` does one
pass. `GET /api/cron/tick` is a dry run: it reports what would happen without
doing it.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Next app on :3000 |
| `npm run worker` | Scheduler loop |
| `npm run db:migrate` | Create a migration after editing the schema |
| `npm run db:studio` | Browse the database |
| `npm run studio` | Remotion Studio, for editing the composition |
| `npm run lint` | ESLint plus `tsc` |

## Layout

```
src/lib/pipeline/    generation stages and scene timing
src/lib/scheduler/   due-date rules and the tick that acts on them
src/lib/db/          Prisma client, repositories, row <-> domain mapping
src/lib/audio/       ElevenLabs synthesis, transcription
src/lib/visuals/     image generation with provider fallbacks
src/compositions/    the Remotion composition that becomes the MP4
src/app/api/         route handlers, thin wrappers over lib/
scripts/worker.ts    the standalone scheduler process
```

Generated media lives under `public/` (`voiceovers`, `uploads`, `renders`) and
is gitignored, as is `dev.db`. The schema in `prisma/migrations` is tracked, so
`npm run db:deploy` rebuilds an empty database anywhere.
