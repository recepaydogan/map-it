import gbFlag from 'flag-icons/flags/4x3/gb.svg'
import ruFlag from 'flag-icons/flags/4x3/ru.svg'
import cnFlag from 'flag-icons/flags/4x3/cn.svg'
import brFlag from 'flag-icons/flags/4x3/br.svg'
import type { AppLanguage } from '../../store/preferences'

export const APP_LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English', flag: gbFlag },
  { code: 'ru', name: 'Русский', flag: ruFlag },
  { code: 'zh-Hans', name: '简体中文', flag: cnFlag },
  { code: 'pt-BR', name: 'Português (Brasil)', flag: brFlag },
] as const satisfies ReadonlyArray<{ code: AppLanguage; name: string; flag: string }>
