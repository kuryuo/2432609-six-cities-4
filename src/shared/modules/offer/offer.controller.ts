import { inject, injectable } from 'inversify';
import { Request, Response } from 'express';
import { CommentRdo, CommentService } from '../comment/index.js';
import {
  BaseController,
  DocumentExistsMiddleware,
  HttpMethod, PrivateRouteMiddleware,
  ValidateDtoMiddleware,
  ValidateObjectIdMiddleware,
  MergeOfferIdMiddleware,
} from '../../libs/rest/index.js';
import { Logger } from '../../libs/logger/index.js';
import { City, Component } from '../../types/index.js';
import { OfferService } from './offer-service.interface.js';
import { fillDTO } from '../../helpers/index.js';
import { OfferRdo } from './rdo/offer.rdo.js';
import { CreateOfferDto } from './dto/create-offer.dto.js';
import { UpdateOfferDto } from './dto/update-offer.dto.js';
import { CreateCommentDto } from '../comment/dto/create-comment.dto.js';

@injectable()
export class OfferController extends BaseController {
  constructor(
      @inject(Component.Logger) protected logger: Logger,
      @inject(Component.OfferService) private readonly offerService: OfferService,
      @inject(Component.CommentService) private readonly commentService: CommentService
  ) {
    super(logger);

    this.logger.info('Register routes for OfferController...');

    this.addRoute({ path: '/', method: HttpMethod.Get, handler: this.index });
    this.addRoute({ path: '/', method: HttpMethod.Post, handler: this.create, middlewares: [new PrivateRouteMiddleware(), new ValidateDtoMiddleware(CreateOfferDto)] });
    this.addRoute({ path: '/favorites', method: HttpMethod.Get, handler: this.getFavorites, middlewares: [new PrivateRouteMiddleware()] });
    this.addRoute({ path: '/:offerId', method: HttpMethod.Get, handler: this.show, middlewares: [
      new ValidateObjectIdMiddleware('offerId'),
      new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId'),
    ]});
    this.addRoute({ path: '/:offerId', method: HttpMethod.Patch, handler: this.update,middlewares: [
      new PrivateRouteMiddleware(),
      new ValidateObjectIdMiddleware('offerId'),
      new ValidateDtoMiddleware(UpdateOfferDto),
      new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId')
    ] });
    this.addRoute({ path: '/:offerId', method: HttpMethod.Delete, handler: this.delete, middlewares: [
      new PrivateRouteMiddleware(),
      new ValidateObjectIdMiddleware('offerId'),
      new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId')
    ] });
    this.addRoute({ path: '/:city/premium', method: HttpMethod.Get, handler: this.getPremium });
    this.addRoute({ path: '/:offerId/favorite', method: HttpMethod.Post, handler: this.addFavorite, middlewares: [new ValidateObjectIdMiddleware('offerId')] });
    this.addRoute({ path: '/:offerId/favorite', method: HttpMethod.Delete, handler: this.removeFavorite, middlewares: [new ValidateObjectIdMiddleware('offerId')] });
    this.addRoute({ path: '/:offerId/comments', method: HttpMethod.Get, handler: this.getComments, middlewares: [
      new ValidateObjectIdMiddleware('offerId'),
      new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId'),
    ] });
    this.addRoute({
      path: '/:offerId/comments',
      method: HttpMethod.Post,
      handler: this.createComment,
      middlewares: [
        new PrivateRouteMiddleware(),
        new ValidateObjectIdMiddleware('offerId'),
        new MergeOfferIdMiddleware('offerId'),
        new ValidateDtoMiddleware(CreateCommentDto),
        new DocumentExistsMiddleware(this.offerService, 'Offer', 'offerId')
      ]
    });
  }

  public async index(req: Request, res: Response): Promise<void> {
    const count = req.query.limit ? Number(req.query.limit) : 60;
    const userId = req.tokenPayload?.id;
    const offers = await this.offerService.findAll(count, userId);
    this.ok(res, fillDTO(OfferRdo, offers));
  }

  public async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateOfferDto;
    const userId = req.tokenPayload?.id;

    const result = await this.offerService.create({ ...dto, userId });
    const offer = await this.offerService.findById(result.id, userId);
    this.created(res, fillDTO(OfferRdo, offer));
  }

  public async show(req: Request, res: Response): Promise<void> {
    const offer = await this.offerService.findById(req.params.offerId, req.body?.userId);
    this.ok(res, fillDTO(OfferRdo, offer));
  }

  public async update(req: Request, res: Response): Promise<void> {
    const dto = req.body as UpdateOfferDto;
    const updatedOffer = await this.offerService.updateById(req.params.offerId, dto);
    this.ok(res, fillDTO(OfferRdo, updatedOffer));
  }

  public async delete(req: Request, res: Response): Promise<void> {
    await this.offerService.deleteById(req.params.offerId);

    await this.commentService.deleteByOfferId(req.params.offerId);

    this.noContent(res, {});
  }

  public async getPremium(req: Request, res: Response): Promise<void> {
    const city = req.params.city as City;
    const userId = req.tokenPayload?.id;
    const offers = await this.offerService.findPremiumOffersByCity(city, userId);
    this.ok(res, fillDTO(OfferRdo, offers));
  }

  public async getFavorites(req: Request, res: Response): Promise<void> {
    const userId = req.tokenPayload?.id;
    const favorites = await this.offerService.getUserFavorites(userId);
    this.ok(res, fillDTO(OfferRdo, favorites));
  }

  public async addFavorite(req: Request, res: Response): Promise<void> {
    const userId = req.tokenPayload?.id;
    const { offerId } = req.params;
    const updated = await this.offerService.addFavorite(userId, offerId);
    this.ok(res, fillDTO(OfferRdo, updated));
  }

  public async removeFavorite(req: Request, res: Response): Promise<void> {
    const userId = req.tokenPayload?.id;
    const { offerId } = req.params;
    await this.offerService.deleteFavorite(userId, offerId);
    this.noContent(res, {});
  }

  public async getComments(req: Request, res: Response): Promise<void> {
    const { offerId } = req.params;

    const comments = await this.commentService.findByOfferId(offerId);
    this.ok(res, fillDTO(CommentRdo, comments));
  }

  public async createComment(req: Request, res: Response): Promise<void> {
    const { offerId } = req.params;
    req.body.offerId = offerId;
    const userId = req.tokenPayload?.id;
    const dto = req.body;

    const comment = await this.commentService.create({ ...dto, offerId, userId });

    await this.offerService.incCommentCount(offerId);

    this.created(res, fillDTO(CommentRdo, comment));
  }
}
