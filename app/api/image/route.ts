import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

interface AuthData {
  serverUrl?: string;
  user?: {
    AccessToken?: string;
  };
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get("url");

  if (!imageUrl) {
    return new NextResponse("Missing image URL", { status: 400 });
  }

  const cookieStore = await cookies();
  const authCookie = cookieStore.get("jellyfin-auth")?.value;

  if (!authCookie) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let auth: AuthData;
  try {
    auth = JSON.parse(authCookie) as AuthData;
  } catch {
    return new NextResponse("Invalid auth cookie", { status: 401 });
  }

  if (!auth.serverUrl) {
    return new NextResponse("Missing Jellyfin server URL", { status: 401 });
  }

  let target: URL;
  let allowedOrigin: URL;
  try {
    target = new URL(imageUrl);
    allowedOrigin = new URL(auth.serverUrl);
  } catch {
    return new NextResponse("Invalid image URL", { status: 400 });
  }

  if (target.origin !== allowedOrigin.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const headers: HeadersInit = {};
  if (auth.user?.AccessToken) {
    headers.Authorization = `MediaBrowser Token="${auth.user.AccessToken}"`;
  }

  try {
    const upstream = await fetch(target, {
      headers,
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return new NextResponse("Image not found", {
        status: upstream.status || 502,
      });
    }

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }
    responseHeaders.set(
      "cache-control",
      "private, max-age=3600, stale-while-revalidate=86400"
    );

    return new NextResponse(upstream.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return new NextResponse("Image proxy error", { status: 502 });
  }
}
