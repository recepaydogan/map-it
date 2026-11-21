import { createContext } from 'react'
import type { ItemSourceViewProps } from './item-acquisition-sections'

export const ItemSourceContext = createContext<ItemSourceViewProps | null>(null)
