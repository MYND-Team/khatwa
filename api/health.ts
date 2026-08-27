export default function handler(req: any, res: any) {
  res.status(200).json({
    status: 'ok',
    message: 'Serverless runtime is healthy',
    timestamp: new Date().toISOString(),
  });
}
