import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile, hasPermission } from "@/lib/auth/session";
import { isDriveId } from "@/lib/drive/media-types";
import { DriveSourceError, resolveClientDriveAsset } from "@/lib/drive/sources";
import { fetchDriveThumbnail, getDriveItemMeta } from "@/lib/integrations/google-drive";
import { getClientById } from "@/lib/services/clients";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";

// Thumbnail of a Drive image/video the user may see. The Drive request is made server-side
// (the OAuth token never reaches the browser) after the same checks as the pickers: signed-in
// staff with content/campaigns access to the client, and either
//   ?client&source&file — a file inside one of that client's configured Drive sources, or
//   ?client&creative    — the Drive file of one of that client's Drive creatives.
export async function GET(request: NextRequest) {
  const profile = await getAdminProfile();
  if (!profile) return new NextResponse(null, { status: 401 });
  if (!hasPermission(profile, "content") && !hasPermission(profile, "campaigns")) return new NextResponse(null, { status: 403 });

  const params = request.nextUrl.searchParams;
  const clientId = params.get("client") ?? "";
  if (!isUuid(clientId)) return new NextResponse(null, { status: 400 });
  const client = await getClientById(clientId); // RLS: only clients this user can access
  if (!client) return new NextResponse(null, { status: 404 });

  try {
    let thumbnailLink: string | null = null;
    const creativeId = params.get("creative");
    if (creativeId) {
      if (!isUuid(creativeId)) return new NextResponse(null, { status: 400 });
      const supabase = await createClient();
      const { data } = await supabase
        .from("creatives")
        .select("drive_file_id, source")
        .eq("client_id", client.id)
        .eq("id", creativeId)
        .maybeSingle();
      if (!data?.drive_file_id || !isDriveId(data.drive_file_id)) return new NextResponse(null, { status: 404 });
      thumbnailLink = (await getDriveItemMeta(data.drive_file_id))?.thumbnailLink ?? null;
    } else {
      const sourceId = params.get("source") ?? "";
      if (!isUuid(sourceId)) return new NextResponse(null, { status: 400 });
      const { file } = await resolveClientDriveAsset(client.id, sourceId, params.get("file") ?? "");
      thumbnailLink = file.thumbnailLink;
    }
    const thumb = thumbnailLink ? await fetchDriveThumbnail(thumbnailLink) : null;
    if (!thumb) return new NextResponse(null, { status: 404 });
    return new NextResponse(thumb.bytes, {
      headers: { "Content-Type": thumb.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return new NextResponse(null, { status: error instanceof DriveSourceError ? 404 : 502 });
  }
}
