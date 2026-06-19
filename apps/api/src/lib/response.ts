import type { Response } from 'express';

export function success<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({ success: true, data });
}

export function paginated<T>(res: Response, items: T[], total: number, page: number, pageSize: number): Response {
  return res.json({
    success: true,
    data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
}
