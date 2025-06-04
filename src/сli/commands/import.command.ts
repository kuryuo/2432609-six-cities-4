import { Command } from './command.interface.js';
import { TsvFileReader } from '../../shared/libs/file-reader/index.js';
import { createOffer, getErrorMessage, getMongoURI } from '../../shared/helpers/index.js';
import { ConsoleLogger } from '../../shared/libs/logger/console.logger.js';
import { Logger } from '../../shared/libs/logger/index.js';
import { MongoDatabaseClient, DatabaseClient } from '../../shared/libs/database-client/index.js';
import { OfferModel, DefaultOfferService, OfferService } from '../../shared/modules/offer/index.js';
import { UserModel, DefaultUserService, UserService } from '../../shared/modules/user/index.js';
import { FavoriteModel } from '../../shared/modules/favorite/index.js';
import { Offer } from '../../shared/types/index.js';
import { DEFAULT_DB_PORT, DEFAULT_USER_PASSWORD } from './command.constant.js';

export class ImportCommand implements Command {
  private userService: UserService;
  private offerService: OfferService;
  private databaseClient: DatabaseClient;
  private logger: Logger;
  private salt: string;

  constructor() {
    this.onImportedLine = this.onImportedLine.bind(this);
    this.onCompleteImport = this.onCompleteImport.bind(this);

    this.logger = new ConsoleLogger();
    this.offerService = new DefaultOfferService(OfferModel, FavoriteModel);
    this.userService = new DefaultUserService(this.logger, UserModel);
    this.databaseClient = new MongoDatabaseClient(this.logger);
  }

  public getName(): string {
    return '--import';
  }

  public async execute(
    filename: string,
    login: string,
    password: string,
    host: string,
    dbname: string,
    salt: string
  ): Promise<void> {

    const uri = getMongoURI(login, password, host, DEFAULT_DB_PORT, dbname);
    this.salt = salt;

    await this.databaseClient.connect(uri);

    const fileReader = new TsvFileReader(filename.trim());

    fileReader.on('line', this.onImportedLine);
    fileReader.on('end', this.onCompleteImport);

    try {
      await fileReader.read();
    } catch (error) {
      console.error(`Can't import data from file: ${filename}`);
      console.error(getErrorMessage(error));
    }
  }

  private async onImportedLine(line: string, resolve: () => void) {
    const offer = createOffer(line);
    await this.saveOffer(offer);
    resolve();
  }

  private onCompleteImport(count: number): void {
    console.info(`${count} rows imported.`);
    this.databaseClient.disconnect();
  }

  private async saveOffer(offer: Offer): Promise<void> {
    const user = await this.userService.findOrCreate(
      {
        ...offer.author,
        password: DEFAULT_USER_PASSWORD,
      },
      this.salt
    );

    await this.offerService.create({
      userId: user.id,
      title: offer.title,
      description: offer.description,
      previewPath: offer.previewPath,
      date: offer.date,
      cost: offer.cost,
      apartmentType: offer.apartmentType,
      images: offer.images,
      city: offer.city,
      isPremium: offer.isPremium,
      isFavorite: offer.isFavorite,
      rating: offer.rating,
      roomCount: offer.roomCount,
      guestCount: offer.guestCount,
      amenities: offer.amenities,
      author: user.id,
      latitude: offer.latitude,
      longitude: offer.longitude,
    });
  }
}
