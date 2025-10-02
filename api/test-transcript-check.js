// Test endpoint for transcript settings check
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString(),
    env: {
      hasZoomAccountId: !!process.env.ZOOM_ACCOUNT_ID,
      hasZoomApiKey: !!process.env.ZOOM_API_KEY,
      hasZoomApiSecret: !!process.env.ZOOM_API_SECRET
    }
  });
}
