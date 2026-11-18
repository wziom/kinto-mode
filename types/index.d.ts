declare module 'claude-code' {
  interface PluginState {
    'goku': {
      phase: string
      percent: number
      level: number
      plan: Shaped<string[]>
      shenronAt: number
      ballsAt: Shaped<number[]>
      refresh: number
      powerFlash: number
      ssjTest: boolean
      thresholdsOverride: Shaped<number[]>
      ssjOverride: number
      langOverride: string
      soundOverride: string
      mutedOverride: Shaped<string[]>
      isFlying: boolean
      isStyled: boolean
      backdropChoice: string
    }
  }
}
