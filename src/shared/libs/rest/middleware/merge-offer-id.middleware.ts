import { Request, Response, NextFunction } from 'express';
import { Middleware } from './middleware.interface.js';

export class MergeOfferIdMiddleware implements Middleware {
  constructor(private readonly paramName: string) {}

  execute(req: Request, _res: Response, next: NextFunction): void {
    req.body.offerId = req.params[this.paramName];
    next();
  }
}
