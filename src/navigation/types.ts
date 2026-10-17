import type { Mode } from '@/core/types';

export type RootStackParamList = {
  Tabs: undefined;
  Generate: { mode: Mode; topic?: string; category?: string; topicId?: string; bankEntryId?: string };
  Project: { id: string };
  Storyboard: { id: string };
  Voice: { id: string };
  Assembly: { id: string };
  Thumbnail: { id: string };
  Publish: { id: string };
  TopicBank: undefined;
  Ypp: undefined;
  SeoAudit: undefined;
  MetadataUpdate: undefined;
};

export type TabParamList = {
  Studio: undefined;
  Research: undefined;
  Library: undefined;
  Settings: undefined;
};
