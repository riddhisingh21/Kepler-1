import { api } from "./api.js";

export const SLASH_COMMANDS = [
  { name: "/help", desc: "Show available commands" },
  { name: "/clear", desc: "Clear the current conversation" },
  { name: "/retrain", desc: "Retrain the classifier from intents.json" },
  { name: "/intents", desc: "List all intents the bot knows" },
  { name: "/whoami", desc: "Show the currently signed-in user" },
];

export function isSlashCommand(text) {
  return text.trim().startsWith("/");
}

export async function runSlashCommand(text, ctx) {
  const raw = text.trim().slice(1);
  const [name, ...rest] = raw.split(/\s+/);
  const args = rest.join(" ");
  switch (name.toLowerCase()) {
    case "help":
      return {
        text:
          "**Available commands**\n\n" +
          SLASH_COMMANDS.map((c) => `- \`${c.name}\` — ${c.desc}`).join("\n"),
      };
    case "clear":
      await ctx.clear();
      return { text: "_Conversation cleared._" };
    case "retrain": {
      const start = performance.now();
      const stats = await api.train();
      const ms = Math.round(performance.now() - start);
      return {
        text:
          `**Model retrained** in ${ms} ms\n\n` +
          `- samples: **${stats.num_samples}**\n` +
          `- intents: **${stats.num_intents}**`,
      };
    }
    case "intents": {
      const list = await api.intents();
      if (!list.length) return { text: "_No intents configured._" };
      return {
        text:
          "**Known intents**\n\n" +
          list
            .map(
              (i) =>
                `- \`${i.tag}\` — ${i.num_patterns} patterns, ${i.num_responses} responses`,
            )
            .join("\n"),
      };
    }
    case "whoami":
      return ctx.user
        ? { text: `Signed in as **@${ctx.user.username}**` }
        : { text: "_Not signed in (anonymous session)._" };
    default:
      return {
        text: `Unknown command \`/${name}\`. Try \`/help\`.${args ? ` (args: ${args})` : ""}`,
      };
  }
}
