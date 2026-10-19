import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const startTime = Date.now();

export async function GET() {
  // Check if user is authenticated for detailed health info
  const session = await auth();
  const showDetails = !!session?.user;

  // Public response: minimal info for Docker health checks
  if (!showDetails) {
    return NextResponse.json({ status: "ok" });
  }

  // Authenticated response: full details
  return NextResponse.json({
    status: "healthy",
    service: "complibot",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
}
