/** Callback to inform of a value updates. */
export type Subscriber<T> = (value: T) => void

/** Unsubscribes from value updates. */
export type Unsubscriber = () => void

/** Callback to update a value. */
export type Updater<T> = (value: T) => T

/** Readable interface for subscribing. */
export interface Readable<T> {
  /**
   * Subscribe on value changes.
   * @param run subscription callback
   * @param invalidate cleanup callback
   */
  subscribe(run: Subscriber<T>): Unsubscriber
}

/** Writable interface for both updating and subscribing. */
export interface Writable<T> extends Readable<T> {
  /**
   * Set value and inform subscribers.
   * @param value to set
   */
  set(value: T): void
  /**
   * Update value using callback and inform subscribers.
   * @param updater callback
   */
  update(updater: Updater<T>): void
}

export type ColorMode = string

export interface PerfectDarkModeOptions {
  prefix?: string
  modes?: string[]
}

export type EnhancedUpdater = (
  value: ColorMode | undefined,
  modes: ColorMode[],
  modeIndex: number,
) => ColorMode

export interface ColorModeWritableWithEnhancedUpdater
  extends Writable<ColorMode | undefined> {
  update: (updater: EnhancedUpdater) => void
}

export interface PerfectDarkMode {
  /**
   * The resolved color mode, can be set or updated.
   */
  mode: ColorModeWritableWithEnhancedUpdater
  /**
   * The saved color mode, probably only useful for debugging.
   */
  modeSaved: Writable<ColorMode | undefined>
  /**
   * The system color mode, probably only useful for debugging.
   */
  modeOS: Readable<ColorMode>
  /**
   * A list of color modes.
   */
  modes: Writable<ColorMode[]>
}

export const createPerfectDarkMode = ({
  prefix = 'pdm',
  modes = ['light', 'dark'],
}: PerfectDarkModeOptions = {}): PerfectDarkMode => {
  const colorModeKey = prefix
  const localStorage = window.localStorage

  // ------------------------------------------------------
  // Modes
  // ------------------------------------------------------
  let currentModes = modes
  const modesListeners = new Set<Function>()
  const modesSet = (v: string[]) => {
    currentModes = v
    modesListeners.forEach((cb) => cb(v))
  }
  const modesWritable: Writable<ColorMode[]> = {
    subscribe(cb) {
      cb(currentModes)
      modesListeners.add(cb)
      return () => modesListeners.delete(cb)
    },
    set: modesSet,
    update(updater) {
      modesSet(updater(currentModes))
    },
  }

  // ------------------------------------------------------
  // ModeOS
  // ------------------------------------------------------
  const modeOSListeners = new Set<Function>()
  const modeOSMediaQuery = matchMedia('(prefers-color-scheme: dark)')
  let modeOSColorMode: ColorMode
  const modeOSOnChangeMediaQuery = ({ matches }: { matches: boolean }) => {
    modeOSColorMode = matches ? 'dark' : 'light'
    modeOSListeners.forEach((cb) => cb(modeOSColorMode))
  }
  modeOSMediaQuery.addEventListener
    ? modeOSMediaQuery.addEventListener('change', modeOSOnChangeMediaQuery)
    : modeOSMediaQuery.addListener(modeOSOnChangeMediaQuery)
  modeOSOnChangeMediaQuery(modeOSMediaQuery)
  const modeOS: Readable<ColorMode> = {
    subscribe(cb) {
      cb(modeOSColorMode)
      modeOSListeners.add(cb)
      return () => modeOSListeners.delete(cb)
    },
  }

  // ------------------------------------------------------
  // ModeSaved
  // ------------------------------------------------------
  const modeSavedParseMode = (mode: string | null): ColorMode | undefined => {
    if (!mode || !currentModes.includes(mode)) {
      return undefined
    }
    return mode as ColorMode
  }
  const modeSavedListeners = new Set<Function>()
  let modeSavedMode: ColorMode | undefined = modeSavedParseMode(
    localStorage.getItem(colorModeKey),
  )
  const modeSavedSet = (colorMode?: ColorMode, save: boolean = true) => {
    if (colorMode === modeSavedMode) {
      return
    }
    if (save) {
      if (colorMode !== undefined) {
        localStorage.setItem(colorModeKey, colorMode)
      } else {
        localStorage.removeItem(colorModeKey)
      }
    }
    modeSavedListeners.forEach((cb) => cb(colorMode))
    modeSavedMode = colorMode
  }
  window.addEventListener(
    'storage',
    (e) =>
      e.key === colorModeKey && modeSavedSet(e.newValue || undefined, false),
  )
  const modeSaved: Writable<ColorMode | undefined> = {
    subscribe(cb) {
      cb(modeSavedMode)
      modeSavedListeners.add(cb)
      return () => modeSavedListeners.delete(cb)
    },
    set: modeSavedSet,
    update(updater) {
      modeSavedSet(updater(modeSavedMode))
    },
  }

  // ------------------------------------------------------
  // Mode
  // ------------------------------------------------------
  let cmSaved: ColorMode | undefined
  let cmOS: ColorMode
  let cmMerged: ColorMode
  const listeners = new Set<Function>()
  const onChange = () => {
    const newMode = cmSaved || cmOS
    if (newMode !== cmMerged) {
      cmMerged = newMode
      listeners.forEach((cb) => cb(cmMerged))
    }
  }
  modeSaved.subscribe((v) => {
    cmSaved = v
    onChange()
  })
  modeOS.subscribe((v) => {
    cmOS = v
    onChange()
  })
  const mode: ColorModeWritableWithEnhancedUpdater = {
    subscribe(cb) {
      cb(cmMerged)
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    set: modeSaved.set,
    update(updater) {
      let index = currentModes.indexOf(cmMerged)
      index = index === -1 ? 0 : index
      modeSaved.set(updater(cmMerged, currentModes, index))
    },
  }

  const htmlClassList = document.documentElement.classList
  let prevMode: string | undefined
  mode.subscribe((v) => {
    if (prevMode) {
      htmlClassList.remove(`${prefix}-${prevMode}`)
    }
    htmlClassList.add(`${prefix}-${v}`)
    prevMode = v
  })

  htmlClassList.add(prefix)
  return {
    mode,
    modes: modesWritable,
    modeOS,
    modeSaved,
  }
}
