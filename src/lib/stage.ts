import { createContext } from 'react'

/**
 * While The Long Play walks through the page, the id of the one chapter on
 * stage (or of a stop that isn't a chapter); null the rest of the time.
 */
export const OnStage = createContext<string | null>(null)

/** True inside a chapter that is waiting offstage, so things it portals out of itself can hide too */
export const Offstage = createContext(false)
