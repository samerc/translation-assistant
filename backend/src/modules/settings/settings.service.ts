import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from './entities/app-settings.entity.js';
import { Language } from './entities/language.entity.js';
import { LabelOption } from './entities/label-option.entity.js';
import { FreeformJobType } from './entities/freeform-job-type.entity.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto.js';
import {
  CreateLabelOptionDto,
  UpdateLabelOptionDto,
  LabelCategory,
} from './dto/label-option.dto.js';
import {
  CreateFreeformJobTypeDto,
  UpdateFreeformJobTypeDto,
} from './dto/freeform-job-type.dto.js';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
    @InjectRepository(Language)
    private readonly languageRepository: Repository<Language>,
    @InjectRepository(LabelOption)
    private readonly labelOptionRepository: Repository<LabelOption>,
    @InjectRepository(FreeformJobType)
    private readonly freeformJobTypeRepository: Repository<FreeformJobType>,
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

  // ── Label Options ──

  async findAllLabels(): Promise<Record<string, string[]>> {
    const labels = await this.labelOptionRepository.find({
      order: { category: 'ASC', sortOrder: 'ASC', value: 'ASC' },
    });

    const grouped: Record<string, string[]> = { email: [], phone: [], address: [] };
    for (const label of labels) {
      if (!grouped[label.category]) grouped[label.category] = [];
      grouped[label.category].push(label.value);
    }
    return grouped;
  }

  async findLabelsByCategory(category: LabelCategory): Promise<LabelOption[]> {
    return this.labelOptionRepository.find({
      where: { category },
      order: { sortOrder: 'ASC', value: 'ASC' },
    });
  }

  async createLabel(dto: CreateLabelOptionDto): Promise<LabelOption> {
    const label = this.labelOptionRepository.create(dto);
    return this.labelOptionRepository.save(label);
  }

  async updateLabel(id: number, dto: UpdateLabelOptionDto): Promise<LabelOption> {
    const label = await this.labelOptionRepository.findOne({ where: { id } });
    if (!label) throw new NotFoundException('Label option not found');
    Object.assign(label, dto);
    return this.labelOptionRepository.save(label);
  }

  async removeLabel(id: number): Promise<void> {
    const label = await this.labelOptionRepository.findOne({ where: { id } });
    if (!label) throw new NotFoundException('Label option not found');
    await this.labelOptionRepository.remove(label);
  }

  // ── Freeform Job Types ──

  async findAllFreeformJobTypes(): Promise<FreeformJobType[]> {
    return this.freeformJobTypeRepository.find({ order: { name: 'ASC' } });
  }

  async createFreeformJobType(dto: CreateFreeformJobTypeDto): Promise<FreeformJobType> {
    const type = this.freeformJobTypeRepository.create(dto);
    return this.freeformJobTypeRepository.save(type);
  }

  async updateFreeformJobType(id: number, dto: UpdateFreeformJobTypeDto): Promise<FreeformJobType> {
    const type = await this.freeformJobTypeRepository.findOne({ where: { id } });
    if (!type) throw new NotFoundException('Freeform job type not found');
    Object.assign(type, dto);
    return this.freeformJobTypeRepository.save(type);
  }

  async removeFreeformJobType(id: number): Promise<void> {
    const type = await this.freeformJobTypeRepository.findOne({ where: { id } });
    if (!type) throw new NotFoundException('Freeform job type not found');
    await this.freeformJobTypeRepository.remove(type);
  }
}
