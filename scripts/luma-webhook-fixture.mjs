#!/usr/bin/env node
/**
 * Signed Luma `guest.updated` fixtures for Probe checks 3–7.
 *
 * Signs the same way as `verifyWebhookSignature` in `src/lib/luma.ts`:
 *   HMAC-SHA256(secret, `${unixSeconds}.${rawBody}`) → hex
 *   header: `webhook-signature: t=<unixSeconds>,v1=<hex>`
 * Signatures older than 5 minutes are rejected. Generate them at send time.
 *
 * This file's default signer is a local fixture string, not a Luma or Vercel
 * secret. Do not put a real webhook secret in the repo. Set the same fixture
 * string on the server under test:
 *
 *   LUMA_WEBHOOK_SECRET=fixture-not-a-real-secret
 *   LUMA_EVENT_ID=evt_probe
 *
 * Usage:
 *   node scripts/luma-webhook-fixture.mjs
 *   node scripts/luma-webhook-fixture.mjs --base http://127.0.0.1:3000
 *   node scripts/luma-webhook-fixture.mjs --print-curl
 *   node scripts/luma-webhook-fixture.mjs --expect-inactive
 *
 * `--print-curl` prints replayable curls and does not send them.
 * `--expect-inactive` expects POST /api/luma/webhook → 503 (secret unset)
 * and, on localhost, that POST /api/bots still spawns.
 *
 * The default run calls DELETE /api/bots first (clears the in-memory field).
 * Non-localhost hosts require `--allow-reset`.
 */

import { createHmac } from "node:crypto";

const FIXTURE_SECRET = "fixture-not-a-real-secret";
const FIXTURE_EVENT_ID = "evt_probe";
const CHECKED_IN_AT = "2026-09-26T12:00:00.000Z";

const ADA_ID = "gst_probe_ada";
const GRACE_ID = "gst_probe_grace";
const LIN_ID = "gst_probe_lin";
const UMA_ID = "gst_probe_uma";

function usage() {
  console.log(`Signed Luma webhook fixture.

Default signer (not a real secret): ${FIXTURE_SECRET}
Default event id (evt_… form): ${FIXTURE_EVENT_ID}

Options:
  --base <url>         Server origin (default http://127.0.0.1:3000)
  --secret <string>    Signer. Prefer env LUMA_WEBHOOK_SECRET.
  --event <evt_…>      Expected event id. Prefer env LUMA_EVENT_ID.
  --print-curl         Print signed curls. Does not send.
  --expect-inactive    Expect 503 because the server secret is unset.
  --allow-reset        Allow DELETE /api/bots on a non-localhost host.
  --help               Show this help.
`);
}

function parseArgs(argv) {
  const opts = {
    base: process.env.FIXTURE_BASE_URL || "http://127.0.0.1:3000",
    secret: process.env.LUMA_WEBHOOK_SECRET || FIXTURE_SECRET,
    eventId: process.env.LUMA_EVENT_ID || FIXTURE_EVENT_ID,
    printCurl: false,
    expectInactive: false,
    allowReset: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--print-curl") {
      opts.printCurl = true;
    } else if (arg === "--expect-inactive") {
      opts.expectInactive = true;
    } else if (arg === "--allow-reset") {
      opts.allowReset = true;
    } else if (arg === "--base") {
      opts.base = argv[++i];
    } else if (arg === "--secret") {
      opts.secret = argv[++i];
    } else if (arg === "--event") {
      opts.eventId = argv[++i];
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
      process.exit(2);
    }
    if ((arg === "--base" || arg === "--secret" || arg === "--event") && !argv[i]) {
      console.error(`Missing value for ${arg}`);
      process.exit(2);
    }
  }

  opts.base = opts.base.replace(/\/$/, "");
  opts.secret = opts.secret.trim();
  opts.eventId = opts.eventId.trim();
  return opts;
}

function sign(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function corrupt(signature) {
  const match = signature.match(/^(t=\d+,v1=)([0-9a-f]+)$/);
  if (!match) throw new Error("Could not corrupt signature");
  const hex = match[2];
  const flipped = (hex[0] === "0" ? "1" : "0") + hex.slice(1);
  return `${match[1]}${flipped}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function guestUpdated(data) {
  return JSON.stringify({ type: "guest.updated", data });
}

function isLocalHost(base) {
  const hostname = new URL(base).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function curlCommand(base, rawBody, signature) {
  const lines = [
    `curl -sS -X POST ${shellQuote(`${base}/api/luma/webhook`)}`,
    `  -H ${shellQuote("content-type: application/json")}`,
  ];
  if (signature) {
    lines.push(`  -H ${shellQuote(`webhook-signature: ${signature}`)}`);
  }
  lines.push(`  --data-binary ${shellQuote(rawBody)}`);
  return lines.join(" \\\n");
}

function buildPayloads(eventId) {
  const otherEventId = eventId === "evt_other" ? "evt_not_this_one" : "evt_other";
  return {
    ada: guestUpdated({
      id: ADA_ID,
      user_name: "Ada Lovelace",
      name: "Not Ada",
      event_api_id: eventId,
      checked_in_at: CHECKED_IN_AT,
    }),
    grace: guestUpdated({
      id: GRACE_ID,
      user_name: "Grace Hopper",
      event: { id: eventId },
      event_tickets: [{ checked_in_at: CHECKED_IN_AT }],
    }),
    lin: guestUpdated({
      id: LIN_ID,
      name: "Lin Name",
      event_api_id: eventId,
      checked_in_at: CHECKED_IN_AT,
    }),
    uma: guestUpdated({
      id: UMA_ID,
      user: { name: "Uma User" },
      event_api_id: eventId,
      checked_in_at: CHECKED_IN_AT,
    }),
    otherEvent: guestUpdated({
      id: "gst_probe_other_event",
      user_name: "Should Not Spawn",
      event_api_id: otherEventId,
      checked_in_at: CHECKED_IN_AT,
    }),
    missingEvent: guestUpdated({
      id: "gst_probe_no_event",
      user_name: "No Event",
      checked_in_at: CHECKED_IN_AT,
    }),
    notCheckedIn: guestUpdated({
      id: "gst_probe_not_checked_in",
      user_name: "Not Checked In",
      event_api_id: eventId,
      event: { id: eventId },
      checked_in_at: null,
      event_tickets: [{ checked_in_at: null }],
    }),
    badSig: guestUpdated({
      id: "gst_probe_bad_sig",
      user_name: "Bad Signature",
      event_api_id: eventId,
      checked_in_at: CHECKED_IN_AT,
    }),
    missingSig: guestUpdated({
      id: "gst_probe_missing_sig",
      user_name: "Missing Signature",
      event_api_id: eventId,
      checked_in_at: CHECKED_IN_AT,
    }),
  };
}

async function readJson(res) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function postWebhook(base, rawBody, signature) {
  const headers = { "content-type": "application/json" };
  if (signature) headers["webhook-signature"] = signature;
  const res = await fetch(`${base}/api/luma/webhook`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  const parsed = await readJson(res);
  return { status: res.status, ...parsed };
}

async function listBots(base) {
  const res = await fetch(`${base}/api/bots`);
  const { json, text } = await readJson(res);
  if (!res.ok || !json || !Array.isArray(json.bots)) {
    throw new Error(`GET /api/bots failed (${res.status}): ${text}`);
  }
  return json.bots;
}

function fail(message, detail) {
  console.error(`FAIL ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

function ok(message) {
  console.log(`ok  ${message}`);
}

async function expectInactive(opts) {
  const res = await postWebhook(opts.base, "{}", null);
  if (res.status !== 503) {
    fail("inactive webhook should return 503", res);
  }
  ok("secret unset → 503");

  if (!isLocalHost(opts.base) && !opts.allowReset) {
    console.log("skipped demo spawn check (pass --allow-reset to POST /api/bots on this host)");
    return;
  }

  const spawn = await fetch(`${opts.base}/api/bots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Fixture Demo" }),
  });
  const spawned = await readJson(spawn);
  if (spawn.status !== 201 || spawned.json?.bot?.name !== "Fixture Demo") {
    fail("demo spawn should still work while the webhook is inactive", {
      status: spawn.status,
      ...spawned,
    });
  }
  ok("POST /api/bots still spawns while webhook is inactive");

  const reset = await fetch(`${opts.base}/api/bots`, { method: "DELETE" });
  if (!reset.ok) fail("DELETE /api/bots failed after inactive spawn check", reset.status);
  ok("cleared fixture demo bot");
}

function printCurls(opts, payloads) {
  console.log("# Signatures expire after 5 minutes. Regenerate with this script.");
  console.log("# Server must use the same LUMA_WEBHOOK_SECRET and LUMA_EVENT_ID.");
  console.log("# The signer is not printed.");
  const adaSig = sign(opts.secret, payloads.ada);
  const cases = [
    ["3 checked-in, event_api_id matches, user_name wins", payloads.ada, adaSig],
    ["3 official shape: event.id + event_tickets[].checked_in_at", payloads.grace, sign(opts.secret, payloads.grace)],
    ["3 name fallback (no user_name)", payloads.lin, sign(opts.secret, payloads.lin)],
    ["3 user.name fallback", payloads.uma, sign(opts.secret, payloads.uma)],
    ["4 replay the first body with a fresh signature (no second bot)", payloads.ada, sign(opts.secret, payloads.ada)],
    ["5 different event_api_id → ignore", payloads.otherEvent, sign(opts.secret, payloads.otherEvent)],
    ["5 missing event id while LUMA_EVENT_ID is set → ignore", payloads.missingEvent, sign(opts.secret, payloads.missingEvent)],
    ["6 not checked-in → ignore", payloads.notCheckedIn, sign(opts.secret, payloads.notCheckedIn)],
    ["7 bad signature → 401", payloads.badSig, corrupt(sign(opts.secret, payloads.badSig))],
    ["7 missing signature → 401", payloads.missingSig, null],
  ];
  for (const [title, body, signature] of cases) {
    console.log(`\n# ${title}`);
    console.log(curlCommand(opts.base, body, signature));
  }
}

async function runChecks(opts) {
  if (!isLocalHost(opts.base) && !opts.allowReset) {
    fail(
      "Refusing to DELETE /api/bots on a non-localhost host. Pass --allow-reset to continue.",
    );
  }

  const reset = await fetch(`${opts.base}/api/bots`, { method: "DELETE" });
  if (!reset.ok) fail("DELETE /api/bots failed", reset.status);
  ok("reset field");

  const payloads = buildPayloads(opts.eventId);

  const ada = await postWebhook(opts.base, payloads.ada, sign(opts.secret, payloads.ada));
  if (ada.status !== 200 || ada.json?.bot?.id !== ADA_ID || ada.json?.bot?.name !== "Ada Lovelace") {
    fail("checked-in guest on the configured event should spawn user_name", ada);
  }
  ok("3 checked-in event_api_id → Ada Lovelace");

  const afterAda = await listBots(opts.base);
  const adaBot = afterAda.find((bot) => bot.id === ADA_ID);
  if (afterAda.length !== 1 || !adaBot) fail("field should contain only Ada", afterAda);

  const replay = await postWebhook(opts.base, payloads.ada, sign(opts.secret, payloads.ada));
  if (replay.status !== 200 || replay.json?.bot?.id !== ADA_ID) {
    fail("replay should return the same guest id", replay);
  }
  const afterReplay = await listBots(opts.base);
  const adaAgain = afterReplay.filter((bot) => bot.id === ADA_ID);
  if (afterReplay.length !== 1 || adaAgain.length !== 1 || adaAgain[0].createdAt !== adaBot.createdAt) {
    fail("same guest id must not create a second bot", afterReplay);
  }
  ok("4 same guest id → no second bot");

  const grace = await postWebhook(opts.base, payloads.grace, sign(opts.secret, payloads.grace));
  if (grace.status !== 200 || grace.json?.bot?.name !== "Grace Hopper") {
    fail("official event.id + ticket checked_in_at should spawn", grace);
  }
  ok("3 official event.id payload → Grace Hopper");

  const lin = await postWebhook(opts.base, payloads.lin, sign(opts.secret, payloads.lin));
  if (lin.status !== 200 || lin.json?.bot?.name !== "Lin Name") {
    fail("name fallback should spawn", lin);
  }
  ok("3 name fallback → Lin Name");

  const uma = await postWebhook(opts.base, payloads.uma, sign(opts.secret, payloads.uma));
  if (uma.status !== 200 || uma.json?.bot?.name !== "Uma User") {
    fail("user.name fallback should spawn", uma);
  }
  ok("3 user.name fallback → Uma User");

  const beforeIgnore = await listBots(opts.base);

  const other = await postWebhook(
    opts.base,
    payloads.otherEvent,
    sign(opts.secret, payloads.otherEvent),
  );
  if (other.status !== 200 || other.json?.ignored !== true || other.json?.reason !== "other_event") {
    fail("different event_api_id should be ignored", other);
  }
  ok("5 different event_api_id → ignored");

  const missingEvent = await postWebhook(
    opts.base,
    payloads.missingEvent,
    sign(opts.secret, payloads.missingEvent),
  );
  if (
    missingEvent.status !== 200 ||
    missingEvent.json?.ignored !== true ||
    missingEvent.json?.reason !== "other_event"
  ) {
    fail("missing event id should be ignored when LUMA_EVENT_ID is set", missingEvent);
  }
  ok("5 missing event id → ignored");

  const quiet = await postWebhook(
    opts.base,
    payloads.notCheckedIn,
    sign(opts.secret, payloads.notCheckedIn),
  );
  if (quiet.status !== 200 || quiet.json?.ignored !== true || quiet.json?.reason !== "not_checked_in") {
    fail("guest.updated that is not checked in should be ignored", quiet);
  }
  ok("6 not checked-in → ignored");

  const bad = await postWebhook(
    opts.base,
    payloads.badSig,
    corrupt(sign(opts.secret, payloads.badSig)),
  );
  if (bad.status !== 401) fail("bad signature should return 401", bad);
  ok("7 bad signature → 401");

  const missing = await postWebhook(opts.base, payloads.missingSig, null);
  if (missing.status !== 401) fail("missing signature should return 401", missing);
  ok("7 missing signature → 401");

  const finalBots = await listBots(opts.base);
  const ids = finalBots.map((bot) => bot.id).sort();
  const expected = [ADA_ID, GRACE_ID, LIN_ID, UMA_ID].sort();
  if (JSON.stringify(ids) !== JSON.stringify(expected) || finalBots.length !== beforeIgnore.length) {
    fail("ignored and rejected payloads must not spawn", finalBots);
  }
  ok("field has only the four admitted guests");
}

const opts = parseArgs(process.argv.slice(2));
const payloads = buildPayloads(opts.eventId);

if (!opts.printCurl && !opts.expectInactive) {
  if (!opts.secret) {
    fail("Signer is empty. Set LUMA_WEBHOOK_SECRET to the fixture signer.");
  }
  if (!opts.eventId) {
    fail("Event id is empty. Set LUMA_EVENT_ID to the evt_… id configured on the server.");
  }
}

if (opts.printCurl) {
  printCurls(opts, payloads);
} else if (opts.expectInactive) {
  await expectInactive(opts);
} else {
  await runChecks(opts);
}
