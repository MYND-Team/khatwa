export default async function handler(req: any, res: any) {
  try {
    const appModule = await import('../backend/src/app');
    const app = appModule.default || appModule;
    return app(req, res);
  } catch (err: any) {
    console.error('Vercel Serverless Function Error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVERLESS_FUNCTION_INIT_ERROR',
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
  }
}
