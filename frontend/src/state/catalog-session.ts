import { Catalog } from '../catalog/client.ts';
import { SnapshotSession } from './snapshot-session.ts';
import {uiLanguage,setLanguage} from '../i18n/index.ts';

export const catalogSession = new SnapshotSession(async(id, offline, signal, locale) => {
  const catalog=await Catalog.open(id, { offline, signal, language:uiLanguage(locale)??undefined });
  if(signal.aborted){catalog.close();signal.throwIfAborted();}
  if(catalog.locale)setLanguage(catalog.locale);
  return catalog;
});
