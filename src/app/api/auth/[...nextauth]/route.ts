import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers ?? {
  GET: () => Response.json({ error: "Auth not configured" }, { status: 500 }),
  POST: () => Response.json({ error: "Auth not configured" }, { status: 500 }),
};
