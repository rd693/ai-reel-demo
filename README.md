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

## What gets made: the topic queue

A series keeps a queue of planned topics, and the scheduler takes the top one.
Without it every scheduled reel was generated from `Series.niche` — the same
one line every run — so the writer re-picked a subject with no memory of the
last thirty reels and converged on the obvious ones.

`src/lib/pipeline/planTopics.ts` writes a batch in one model call, given:

- **Google Trends RSS** for the region (`TRENDS_GEO`, default `IN`). No key.
  This is a *general* feed: on a history channel most of any day's queries are
  cricket and markets, so the planner is told to use one only where a real
  bridge exists — a festival, an anniversary, a film about a historical figure
  — and to write an evergreen topic otherwise. At most 40% of a batch may be
  trend-tied, because a queue made entirely of this week's trends is worthless
  in three weeks.
- **YouTube search** for the niche, ordered by views (`YOUTUBE_API_KEY`,
  read-only, no OAuth). This is the signal that matters more: which subjects
  and title shapes are actually earning clicks. Skipped without a key.
- **Everything the series has already made or queued**, so topics do not repeat.

Each topic carries a title (in the series language, written to be clicked), a
`subject` (the entity an image model should depict — a title is not an image
subject), an angle, and a 0-100 score. Duplicates are prevented by a unique
index on a normalised title, not by asking a model not to repeat itself.

Plan from the series page, or let the scheduler refill when the queue drops to
three. `POST /api/series/<id>/topics` plans a batch; `GET` lists the queue.

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

When the reel came from a planned topic, that topic's title and angle go to
the writer as the promise the narration has to pay off, and the planned title
wins over the one the script model invents.

Rendering is a stage of its own, started either from the reel page
(`POST /api/render`) or by the worker, which renders any reel whose shots are
all present and has no MP4 yet. Jobs are rows, so progress and output survive a
restart, and the Remotion bundle is cached across renders. Only one render runs
at a time per process — two headless Chromiums on one laptop finish later than
the same two in sequence.

## Image quality

Two things decide how the shots look, in this order.

**Turn the premium stack on.** `FAL_KEY` is only used when the series has
`usePremiumImageStack` set. With it off, images come from the free ladder and
the last rung is Pollinations, the weakest generator in the chain.

**The prompt is short.** Every generator here is a FLUX-family model
conditioned by T5, and none of them have a negative channel. The previous
builder appended fifteen quality boosters and then concatenated a negative
prompt onto the positive one — so every image was literally asking for
"collage, split screen, extra limbs, text, watermark", the exact artefacts the
list was written to prevent. Now the subject leads, one style clause follows,
negations are stripped (`stripNegations`), and a real negative prompt goes only
to the one provider that has a field for it.

## Running the factory

Set a series to `daily` or `weekly` and leave the worker running:

```bash
npm run worker
```

It checks every `WORKER_INTERVAL_SECONDS` (default 300) and generates for any
active series whose newest reel is older than its interval. One reel per series
at a time. `Ctrl-C` finishes the reel in progress before exiting.

Each pass then renders what is ready, so an overnight run leaves finished MP4s
under `public/renders` rather than scenes waiting for somebody to click Export.
Keep `npm run dev` running alongside the worker: the renderer fetches every shot
over HTTP from `NEXT_PUBLIC_SITE_URL`, and a render fails immediately, with that
reason on the job row, if nothing is serving them.

To drive it from an external scheduler instead, `POST /api/cron/tick` does one
pass. `GET /api/cron/tick` is a dry run: it reports what would happen without
doing it.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Next app on :3000 |
| `npm run worker` | Scheduler loop |
| `npm run check:render` | Render three reels end to end, no API keys needed |
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
