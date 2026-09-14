/**
 * Slack Events Webhook
 *
 * POST /api/webhooks/slack
 * Receives Slack events:
 * - slash commands (/cyncro)
 * - button interactions
 * - message events
 *
 * Slack sends a challenge request on subscription - respond with challenge
 */

import { ensureCoreSchema, coreDb } from "@/lib/core/db";

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();

    const body = (await request.json()) as Record<string, unknown>;
    const type = body.type;
    const challenge = body.challenge;

    // Respond to Slack URL verification challenge
    if (type === "url_verification") {
      return Response.json({ challenge });
    }

    // Handle slash commands
    if (type === "slash_command" || body.command) {
      return handleSlashCommand(body as Record<string, unknown>);
    }

    // Handle interactive actions (buttons, select menus)
    if (body.type === "block_actions" || body.actions) {
      return handleBlockActions(body as Record<string, unknown>);
    }

    // Handle events
    if (type === "event_callback") {
      const event = body.event as Record<string, unknown>;
      console.log("slack.event", { event_type: event.type });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("webhook.slack.failed", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleSlashCommand(body: Record<string, unknown>): Promise<Response> {
  const command = String(body.command || "");
  const text = String(body.text || "");
  const userId = String(body.user_id || "");
  const teamId = String(body.team_id || "");

  console.log("slack.command", { command, text, userId });

  if (command === "/cyncro") {
    const args = text.split(" ");
    const action = args[0];

    if (action === "help") {
      return Response.json({
        response_type: "ephemeral",
        text: `*Cyncro Slack Commands*\n/cyncro help - Show this message\n/cyncro contact [email] - Look up a contact\n/cyncro deals - Show your open deals\n/cyncro today - Show today's summary`,
      });
    }

    if (action === "contact" && args[1]) {
      // Mock contact lookup
      return Response.json({
        response_type: "in_channel",
        text: `Looking up contact: ${args[1]}...`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Contact: ${args[1]}*\nEmail: ${args[1]}\nPhone: +1-555-0100\nLast activity: 2 days ago`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View in Cyncro" },
                action_id: "view_contact",
              },
              {
                type: "button",
                text: { type: "plain_text", text: "Log Activity" },
                action_id: "log_activity",
              },
            ],
          },
        ],
      });
    }

    if (action === "deals") {
      return Response.json({
        response_type: "in_channel",
        text: "Your open deals:",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Open Deals (5)*\n💰 Enterprise Plan - $50k\n💰 Growth Package - $25k\n💰 Startup License - $5k`,
            },
          },
        ],
      });
    }

    if (action === "today") {
      return Response.json({
        response_type: "ephemeral",
        text: "Today's Summary",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Today's Summary*\n📊 New Leads: 3\n📈 Deals Updated: 2\n📅 Bookings: 5\n⏰ Follow-ups Due: 2`,
            },
          },
        ],
      });
    }

    return Response.json({
      response_type: "ephemeral",
      text: "Use `/cyncro help` to see available commands",
    });
  }

  return Response.json({ ok: false }, { status: 404 });
}

async function handleBlockActions(body: Record<string, unknown>): Promise<Response> {
  const actions = body.actions as Array<Record<string, unknown>>;
  const userId = String(body.user?.id || "");
  const teamId = String(body.team?.id || "");

  if (!actions || actions.length === 0) {
    return Response.json({ ok: true });
  }

  for (const action of actions) {
    const actionId = String(action.action_id || "");
    const value = String(action.value || "");

    console.log("slack.action", { actionId, value, userId });

    if (actionId === "view_contact") {
      console.log(`Opening contact ${value} for user ${userId}`);
    } else if (actionId === "view_deal") {
      console.log(`Opening deal ${value} for user ${userId}`);
    } else if (actionId === "view_booking") {
      console.log(`Opening booking ${value} for user ${userId}`);
    }
  }

  return Response.json({ ok: true });
}
