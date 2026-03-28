import { Request, Response } from 'express';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    res.status(200).json({ message: 'Webhook received successfully' });
  } catch (error) {
    console.error('Error storing webhook data in Redis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
