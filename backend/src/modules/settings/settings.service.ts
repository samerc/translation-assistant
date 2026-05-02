import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from './entities/app-settings.entity.js';
import { Language } from './entities/language.entity.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto.js';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
    @InjectRepository(Language)
    private readonly languageRepository: Repository<Language>,
  ) {}

  // ── App Settings ──

  async getSettings(): Promise<AppSettings> {
    let settings = await this.settingsRepository.findOne({ where: { id: 1 } });
    if (!settings) {
      settings = this.settingsRepository.create({});
      await this.settingsRepository.save(settings);
    }
    return settings;
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<AppSettings> {
    const settings = await this.getSettings();
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  // ── Languages ──

  async findAllLanguages(): Promise<Language[]> {
    return this.languageRepository.find({ order: { name: 'ASC' } });
  }

  async findOneLanguage(id: number): Promise<Language> {
    const language = await this.languageRepository.findOne({ where: { id } });
    if (!language) throw new NotFoundException('Language not found');
    return language;
  }

  async createLanguage(dto: CreateLanguageDto): Promise<Language> {
    const language = this.languageRepository.create(dto);
    return this.languageRepository.save(language);
  }

  async updateLanguage(id: number, dto: UpdateLanguageDto): Promise<Language> {
    const language = await this.findOneLanguage(id);
    Object.assign(language, dto);
    return this.languageRepository.save(language);
  }

  async removeLanguage(id: number): Promise<void> {
    const language = await this.findOneLanguage(id);
    await this.languageRepository.remove(language);
  }
}
