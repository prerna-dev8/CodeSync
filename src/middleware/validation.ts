import { Request, Response, NextFunction } from 'express';

export const validateSessionTitle = (req: Request, res: Response, next: NextFunction) => {
  const { title } = req.body;
  if (!title || title.trim().length < 3 || title.trim().length > 100) {
    return res.status(400).json({ message: 'Session title must be 3-100 characters' });
  }
  req.body.title = title.trim();
  next();
};

