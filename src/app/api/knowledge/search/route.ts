import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { hybridSearch } from "@/lib/services/SearchService";
import { searchKnowledgeSchema } from "@/lib/validators/knowledge";

// POST /api/knowledge/search - Semantic search
export const POST = apiHandler(
  async ({ body, organizationId }) => {
    const results = await hybridSearch(
      organizationId,
      body.query,
      body.limit,
      body.domain,
    );

    return NextResponse.json({ results, count: results.length });
  },
  { schema: searchKnowledgeSchema },
);
