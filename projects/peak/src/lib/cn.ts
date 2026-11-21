import { twMerge } from 'tailwind-merge'

type ClassValue = string | number | null | false | undefined

export const cn = (...classes: ClassValue[]): string =>
  twMerge(classes.filter(Boolean).join(' '))

