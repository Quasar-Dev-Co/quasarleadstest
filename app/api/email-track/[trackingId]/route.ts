import { NextRequest, NextResponse } from 'next/server';
import { markEmailOpened } from '@/lib/email-tracking';

/**
 * GET handler — serves a 1x1 transparent GIF pixel and marks the email as opened.
 * This endpoint is hit when a recipient's email client loads the tracking pixel image.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  const { trackingId } = await params;

  if (trackingId) {
    // Fire-and-forget: mark the email as opened
    markEmailOpened(trackingId).catch(() => {});
  }

  // 1x1 transparent GIF
  const transparentGif = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
    0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
    0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
    0x01, 0x00, 0x3b,
  ]);

  return new NextResponse(transparentGif, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': transparentGif.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
