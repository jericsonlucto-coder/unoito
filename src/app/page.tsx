'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'

// #region TYPES
interface CardType {
    color: string
    value: number
    points: number
    changeTurn: boolean
    drawValue: number
    src: string
    playedByPlayer: boolean
}
interface Player {
    id: 'player' | 'cpu1' | 'cpu2' | 'cpu3' | 'p2' | 'p3' | 'p4'
    hand: CardType[]
    score: number
    position: 'bottom' | 'top' | 'left' | 'right'
    name: string
    isHuman: boolean
}
type GameMode = 'menu' | 'ai' | 'multiplayer'
type MultiplayerState = 'lobby' | 'waiting' | 'playing'
interface GameAction {
    action: string
    payload: any
    timestamp: number
    playerId: string
}
// #endregion

// #region CARD CLASS
class Card implements CardType {
    color: string
    value: number
    points: number
    changeTurn: boolean
    drawValue: number
    src: string
    playedByPlayer: boolean
    constructor(
        color: string, value: number, points: number,
        changeTurn: boolean, drawValue: number, src: string
    ) {
        this.color = color; this.value = value; this.points = points
        this.changeTurn = changeTurn; this.drawValue = drawValue
        this.src = src; this.playedByPlayer = false
    }
}
// #endregion

// #region DECK FUNCTIONS
const createCard = (rgb: string, color: string, deck: CardType[]): void => {
    for (let i = 0; i <= 14; i++) {
        if (i === 0) {
            deck.push(new Card(rgb, i, i, true, 0, `/images/${color}${i}.png`))
        } else if (i > 0 && i <= 9) {
            deck.push(new Card(rgb, i, i, true, 0, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, i, true, 0, `/images/${color}${i}.png`))
        } else if (i === 10) {
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
        } else if (i === 11) {
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
        } else if (i === 12) {
            deck.push(new Card(rgb, i, 20, false, 2, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, 20, false, 2, `/images/${color}${i}.png`))
        } else if (i === 13) {
            deck.push(new Card('any', i, 50, true, 0, `/images/wild13.png`))
        } else if (i === 14) {
            deck.push(new Card('any', i, 50, true, 4, `/images/wild14.png`))
        }
    }
}
const createDeck = (): CardType[] => {
    const deck: CardType[] = []
    const colors = [
        { rgb: 'rgb(255, 6, 0)', name: 'red' },
        { rgb: 'rgb(0, 170, 69)', name: 'green' },
        { rgb: 'rgb(0, 150, 224)', name: 'blue' },
        { rgb: 'rgb(255, 222, 0)', name: 'yellow' },
    ]
    colors.forEach(({ rgb, name }) => createCard(rgb, name, deck))
    return deck
}
const shuffleDeck = (deck: CardType[]): CardType[] => {
    const shuffled = [...deck]
    for (let i = shuffled.length - 1; i > 0; i--) {
        shuffled[i].playedByPlayer = false
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}
// #endregion

// #region AUDIO
class AudioManager {
    private sounds: Record<string, HTMLAudioElement> = {}
    init() {
        if (typeof window === 'undefined') return
        this.sounds = {
            shuffle:     new Audio('/audio/shuffle.wav'),
            playCard:    new Audio('/audio/playCardNew.wav'),
            playCard2:   new Audio('/audio/playCard2.wav'),
            drawCard:    new Audio('/audio/drawCard.wav'),
            winRound:    new Audio('/audio/winRound.wav'),
            winGame:     new Audio('/audio/winGame.wav'),
            lose:        new Audio('/audio/lose.wav'),
            plusCard:    new Audio('/audio/plusCard.wav'),
            uno:         new Audio('/audio/uno.wav'),
            colorButton: new Audio('/audio/colorButton.wav'),
            playAgain:   new Audio('/audio/playAgain.wav'),
        }
    }
    play(sound: string) {
        if (this.sounds[sound]) {
            this.sounds[sound].currentTime = 0
            this.sounds[sound].play().catch(() => {})
        }
    }
    playCardSound() { this.play('playCard2') }
}
const audioManager = new AudioManager()
// #endregion

// #region PUSHER
const PUSHER_KEY     = '4de6e91a5e72dd9096db'
const PUSHER_CLUSTER = 'ap1'
async function pusherTrigger(channel: string, event: string, data: unknown) {
    try {
        const res = await fetch('/api/pusher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, event, data }),
        })
        if (!res.ok) {
            const err = await res.text()
            console.error('pusherTrigger failed:', res.status, err)
        }
    } catch (e) {
        console.error('pusherTrigger error:', e)
    }
}
let pusherInstance: unknown = null
async function getPusherInstance(): Promise<unknown> {
    if (pusherInstance) return pusherInstance
    if (typeof window === 'undefined') return null
    // @ts-expect-error Pusher loaded from CDN
    if (window.Pusher) {
        // @ts-expect-error Pusher loaded from CDN
        pusherInstance = new window.Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER })
        return pusherInstance
    }
    return new Promise((resolve) => {
        const script = document.createElement('script')
        script.src = 'https://js.pusher.com/8.2.0/pusher.min.js'
        script.onload = () => {
            // @ts-expect-error Pusher loaded from CDN
            pusherInstance = new window.Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER })
            resolve(pusherInstance)
        }
        document.head.appendChild(script)
    })
}
// #endregion

// #region CONSTANTS
const GAME_OVER_SCORE = 100
const AI_PLAYER_ORDER: Player['id'][] = ['player', 'cpu2', 'cpu1', 'cpu3']
function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
}
interface PusherChannel {
    bind: (event: string, cb: (data: unknown) => void) => void
    unbind_all: () => void
}
interface JoinPayload {
    playerId: string
    playerName: string
    requestSlot?: boolean
}
interface SlotPayload {
    playerId: Player['id']
    playerName?: string
    allPlayers: { id: string; name: string }[]
}
// #endregion

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
    // colours
    bg:          '#0f1923',
    surface:     'rgba(255,255,255,0.04)',
    surfaceHigh: 'rgba(255,255,255,0.09)',
    border:      'rgba(255,255,255,0.10)',
    borderBright:'rgba(255,255,255,0.22)',
    gold:        '#f5c518',
    goldDim:     'rgba(245,197,24,0.18)',
    green:       '#22c55e',
    greenDark:   '#15803d',
    blue:        '#3b82f6',
    blueDark:    '#1d4ed8',
    red:         '#ef4444',
    text:        '#f1f5f9',
    textMuted:   '#94a3b8',
    textDim:     '#475569',
    // shadows
    shadowCard:  '0 8px 32px rgba(0,0,0,0.55)',
    shadowGlow:  '0 0 24px rgba(245,197,24,0.35)',
    // radii
    rSm:  '8px',
    rMd:  '14px',
    rLg:  '22px',
    rXl:  '32px',
    // font sizes
    fXs:  '0.82rem',
    fSm:  '0.95rem',
    fMd:  '1.1rem',
    fLg:  '1.3rem',
    fXl:  '1.6rem',
    f2xl: '2.2rem',
    f3xl: '3rem',
}

// ─── SHARED STYLE HELPERS ─────────────────────────────────────────────────────
const glassPanel = (extra?: React.CSSProperties): React.CSSProperties => ({
    background:    T.surface,
    border:        `1px solid ${T.border}`,
    borderRadius:  T.rLg,
    backdropFilter:'blur(18px)',
    ...extra,
})

const pill = (color: string, bg: string): React.CSSProperties => ({
    display:       'inline-flex',
    alignItems:    'center',
    gap:           '0.35rem',
    padding:       '0.3rem 0.85rem',
    borderRadius:  '999px',
    background:    bg,
    color,
    fontSize:      T.fSm,
    fontWeight:    700,
    letterSpacing: '0.03em',
})

const btn = (
    variant: 'primary' | 'secondary' | 'danger' | 'ghost',
    extra?: React.CSSProperties
): React.CSSProperties => {
    const map = {
        primary:   { background: `linear-gradient(135deg, ${T.green}, ${T.greenDark})`,   color: '#fff', boxShadow: '0 4px 18px rgba(34,197,94,0.35)'  },
        secondary: { background: `linear-gradient(135deg, ${T.blue},  ${T.blueDark})`,    color: '#fff', boxShadow: '0 4px 18px rgba(59,130,246,0.35)'  },
        danger:    { background: `linear-gradient(135deg, ${T.red},   #b91c1c)`,          color: '#fff', boxShadow: '0 4px 18px rgba(239,68,68,0.35)'   },
        ghost:     { background: 'rgba(255,255,255,0.07)', color: T.textMuted, boxShadow: 'none' },
    }
    return {
        padding:       '0.85rem 2rem',
        fontSize:      T.fMd,
        fontWeight:    700,
        border:        'none',
        borderRadius:  T.rMd,
        cursor:        'pointer',
        transition:    'transform 0.12s, opacity 0.12s',
        letterSpacing: '0.04em',
        ...map[variant],
        ...extra,
    }
}

export default function UnoGame() {
    // #region STATE
    const [gameMode, setGameMode] = useState<GameMode>('menu')
    const [players, setPlayers] = useState<Player[]>([
        { id: 'player', hand: [], score: 0, position: 'bottom', name: 'YOU',       isHuman: true  },
        { id: 'cpu1',   hand: [], score: 0, position: 'top',    name: 'CPU TOP',   isHuman: false },
        { id: 'cpu2',   hand: [], score: 0, position: 'left',   name: 'CPU LEFT',  isHuman: false },
        { id: 'cpu3',   hand: [], score: 0, position: 'right',  name: 'CPU RIGHT', isHuman: false },
    ])
    const [deckState, setDeckState]                   = useState<CardType[]>([])
    const [playPile, setPlayPile]                     = useState<CardType[]>([])
    const [currentTurn, setCurrentTurn]               = useState<Player['id']>('player')
    const [gameOn, setGameOn]                         = useState(false)
    const [colorPickerOpen, setColorPickerOpen]       = useState(false)
    const [showUno, setShowUno]                       = useState<{ [key: string]: boolean }>({})
    const [roundVisible, setRoundVisible]             = useState(false)
    const [roundWinner, setRoundWinner]               = useState<string | null>(null)
    const [gameVisible, setGameVisible]               = useState(false)
    const [gameWinner, setGameWinner]                 = useState<string | null>(null)
    const [wildCardColor, setWildCardColor]           = useState<string>('')
    const [selectedWildColor, setSelectedWildColor]   = useState<string>('')
    const [cpuVisible]                                = useState<{ [key: string]: boolean }>({
        cpu1: false, cpu2: false, cpu3: false,
    })
    const [direction, setDirection] = useState<'clockwise' | 'counter-clockwise'>('clockwise')
    // Multiplayer
    const [mpState, setMpState]                           = useState<MultiplayerState>('lobby')
    const [roomCode, setRoomCode]                         = useState('')
    const [inputRoomCode, setInputRoomCode]               = useState('')
    const [myPlayerId, setMyPlayerId]                     = useState<Player['id']>('player')
    const [myPlayerName, setMyPlayerName]                 = useState('')
    const [mpPlayerCount, setMpPlayerCount]               = useState(4)
    const [mpConnectedPlayers, setMpConnectedPlayers]     = useState<{ id: string; name: string }[]>([])
    const [mpError, setMpError]                           = useState('')
    const [isHost, setIsHost]                             = useState(false)
    const [mpChannel, setMpChannel]                       = useState<PusherChannel | null>(null)
    const [playerOrderState, setPlayerOrderState]         = useState<Player['id'][]>(AI_PLAYER_ORDER)
    // #endregion

    // #region REFS
    const gameOnRef            = useRef(gameOn)
    const playersRef           = useRef(players)
    const deckRef              = useRef(deckState)
    const playPileRef          = useRef(playPile)
    const currentTurnRef       = useRef(currentTurn)
    const colorPickerRef       = useRef(colorPickerOpen)
    const selectedWildColorRef = useRef(selectedWildColor)
    const directionRef         = useRef(direction)
    const gameModeRef          = useRef(gameMode)
    const myPlayerIdRef        = useRef(myPlayerId)
    const myPlayerNameRef      = useRef(myPlayerName)
    const roomCodeRef          = useRef(roomCode)
    const playerOrderRef       = useRef(playerOrderState)
    const mpConnectedRef       = useRef(mpConnectedPlayers)
    const joiningRef           = useRef(false)
    useEffect(() => { gameOnRef.current            = gameOn },            [gameOn])
    useEffect(() => { playersRef.current           = players },           [players])
    useEffect(() => { deckRef.current              = deckState },         [deckState])
    useEffect(() => { playPileRef.current          = playPile },          [playPile])
    useEffect(() => { currentTurnRef.current       = currentTurn },       [currentTurn])
    useEffect(() => { colorPickerRef.current       = colorPickerOpen },   [colorPickerOpen])
    useEffect(() => { selectedWildColorRef.current = selectedWildColor }, [selectedWildColor])
    useEffect(() => { directionRef.current         = direction },         [direction])
    useEffect(() => { gameModeRef.current          = gameMode },          [gameMode])
    useEffect(() => { myPlayerIdRef.current        = myPlayerId },        [myPlayerId])
    useEffect(() => { myPlayerNameRef.current      = myPlayerName },      [myPlayerName])
    useEffect(() => { roomCodeRef.current          = roomCode },          [roomCode])
    useEffect(() => { playerOrderRef.current       = playerOrderState },  [playerOrderState])
    useEffect(() => { mpConnectedRef.current       = mpConnectedPlayers },[mpConnectedPlayers])
    // #endregion

    // #region AUDIO INIT
    useEffect(() => { audioManager.init() }, [])
    // #endregion

    void wildCardColor
    void selectedWildColor
    void cpuVisible
    void mpPlayerCount

    // #region CLEANUP ON UNMOUNT
    useEffect(() => {
        return () => {
            setRoundVisible(false); setRoundWinner(null)
            setGameVisible(false);  setGameWinner(null)
            setShowUno({});         setColorPickerOpen(false)
            if (mpChannel) { try { mpChannel.unbind_all() } catch (e) { console.error(e) } }
        }
    }, [mpChannel])
    // #endregion

    // #region HELPERS
    const getNextTurn = useCallback((
        current: Player['id'],
        currentDirection: 'clockwise' | 'counter-clockwise',
        order: Player['id'][]
    ): Player['id'] => {
        const idx = order.indexOf(current)
        if (idx === -1) return order[0]
        const nextIdx = currentDirection === 'clockwise'
            ? (idx + 1) % order.length
            : (idx - 1 + order.length) % order.length
        return order[nextIdx]
    }, [])

    const triggerUno = useCallback((playerId: string) => {
        audioManager.play('uno')
        setShowUno(prev => ({ ...prev, [playerId]: true }))
        setTimeout(() => setShowUno(prev => ({ ...prev, [playerId]: false })), 2000)
    }, [])

    const tallyPoints = useCallback((hand: CardType[]): number =>
        hand.reduce((sum, card) => sum + card.points, 0), [])

    const getCpuDelay = useCallback(() =>
        Math.floor(Math.random() * 500 + 1000), [])
    // #endregion

    // #region BROADCAST ACTION
    const broadcastAction = useCallback(async (action: string, payload: any) => {
        if (gameModeRef.current !== 'multiplayer') return
        if (!gameOnRef.current && action !== 'ROUND_WINNER' && action !== 'GAME_WINNER' && action !== 'DRAW_CARD_UPDATE') return
        const channel = `uno-room-${roomCodeRef.current}`
        try {
            await pusherTrigger(channel, 'game-action', {
                action, payload, timestamp: Date.now(), playerId: myPlayerIdRef.current,
            } as GameAction)
        } catch (error) {
            console.error(`Failed to broadcast ${action}:`, error)
        }
    }, [])
    // #endregion

    // #region APPLY GAME ACTION
    const applyGameAction = useCallback((gameAction: GameAction) => {
        const { action, payload, playerId } = gameAction
        if (action !== 'DRAW_CARD_UPDATE' && playerId === myPlayerIdRef.current) return
        switch (action) {
            case 'DRAW_CARD_UPDATE': {
                const { playerId: drawPlayerId, handCount } = payload
                if (drawPlayerId === myPlayerIdRef.current) return
                let newDeck = [...deckRef.current]
                let newPile = [...playPileRef.current]
                if (newDeck.length > 0) newDeck.shift()
                else if (newPile.length > 1) {
                    newDeck = shuffleDeck(newPile.slice(0, -1))
                    newPile = [newPile[newPile.length - 1]]
                    newDeck.shift()
                }
                const up = playersRef.current.map(p => p.id !== drawPlayerId ? p : {
                    ...p, hand: Array.from({ length: handCount }, () => ({
                        color: 'any', value: -1, points: 0, changeTurn: false,
                        drawValue: 0, src: '/images/back.png', playedByPlayer: false,
                    } as CardType))
                })
                setPlayers([...up]);        playersRef.current = [...up]
                setDeckState([...newDeck]); deckRef.current    = newDeck
                setPlayPile([...newPile]);  playPileRef.current= newPile
                audioManager.play('drawCard')
                break
            }
            case 'PLAY_CARD': {
                if (playerId === myPlayerIdRef.current) return
                const { card, playerHandCount, newDirection, nextTurn, colorChosen, drawAmount, drawTargetPlayer } = payload
                let updPile = [...playPileRef.current]
                if (card) updPile.push(card)
                setPlayPile([...updPile]); playPileRef.current = updPile
                const up = playersRef.current.map(p => p.id !== playerId ? p : {
                    ...p, hand: Array.from({ length: playerHandCount }, () => ({
                        color: 'any', value: -1, points: 0, changeTurn: false,
                        drawValue: 0, src: '/images/back.png', playedByPlayer: false,
                    } as CardType))
                })
                if (drawAmount && drawAmount > 0 && drawTargetPlayer) {
                    const di = up.findIndex(p => p.id === drawTargetPlayer)
                    if (di !== -1) {
                        const dp = { ...up[di], hand: [...up[di].hand] }
                        let ud = [...deckRef.current], upPile = [...updPile]
                        for (let i = 0; i < drawAmount; i++) {
                            if (ud.length > 0) { dp.hand.push(ud.shift()!); audioManager.play('drawCard') }
                            else if (upPile.length > 1) {
                                ud = shuffleDeck(upPile.slice(0, -1))
                                upPile = [upPile[upPile.length - 1]]
                                dp.hand.push(ud.shift()!); audioManager.play('drawCard')
                            }
                        }
                        up[di] = dp
                        setDeckState([...ud]);     deckRef.current     = ud
                        setPlayPile([...upPile]);  playPileRef.current = upPile
                    }
                }
                setPlayers([...up]); playersRef.current = [...up]
                if (newDirection && newDirection !== directionRef.current) {
                    setDirection(newDirection); directionRef.current = newDirection
                }
                if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
                if (colorChosen) {
                    setColorPickerOpen(true); colorPickerRef.current = true
                    setWildCardColor(colorChosen); setSelectedWildColor(colorChosen)
                    selectedWildColorRef.current = colorChosen
                }
                if (playerHandCount === 1 && card && card.value !== 13) triggerUno(playerId)
                break
            }
            case 'DRAW_CARD': {
                if (playerId === myPlayerIdRef.current) return
                const { newHandCount, nextTurn } = payload
                const up = playersRef.current.map(p => p.id !== playerId ? p : {
                    ...p, hand: Array.from({ length: newHandCount }, () => ({
                        color: 'any', value: -1, points: 0, changeTurn: false,
                        drawValue: 0, src: '/images/back.png', playedByPlayer: false,
                    } as CardType))
                })
                setPlayers([...up]); playersRef.current = [...up]
                if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
                audioManager.play('drawCard')
                break
            }
            case 'COLOR_CHOSEN': {
                if (playerId === myPlayerIdRef.current) return
                const { color, nextTurn } = payload
                const up = [...playPileRef.current]
                const lc = up[up.length - 1]
                if (lc && lc.value === 13) up[up.length - 1] = { ...lc, color }
                setPlayPile([...up]); playPileRef.current = up
                setColorPickerOpen(false); colorPickerRef.current = false
                setWildCardColor(color); setSelectedWildColor(color)
                selectedWildColorRef.current = color
                if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
                break
            }
            case 'UNO_SHOUT': {
                if (playerId === myPlayerIdRef.current) return
                triggerUno(payload.playerId || playerId)
                break
            }
            case 'ROUND_WINNER': {
                if (playerId === myPlayerIdRef.current) return
                const { winnerId, winnerName, updatedPlayers } = payload
                setRoundWinner(winnerId === myPlayerIdRef.current ? 'You' : winnerName)
                setRoundVisible(true); setGameOn(false); gameOnRef.current = false
                if (updatedPlayers) {
                    const merged = playersRef.current.map(p => {
                        const info = updatedPlayers.find((up: any) => up.id === p.id)
                        if (!info) return p
                        return { ...p, score: info.score, name: p.id === myPlayerIdRef.current ? `${info.name} (You)` : info.name }
                    })
                    setPlayers([...merged]); playersRef.current = [...merged]
                }
                setTimeout(() => setRoundVisible(false), 3000)
                break
            }
            case 'GAME_WINNER': {
                if (playerId === myPlayerIdRef.current) return
                const { winnerId, winnerName, finalScores } = payload
                setGameWinner(winnerId === myPlayerIdRef.current ? 'You' : winnerName)
                setGameVisible(true); setGameOn(false); gameOnRef.current = false
                audioManager.play(winnerId === myPlayerIdRef.current ? 'winGame' : 'lose')
                if (finalScores) {
                    const merged = playersRef.current.map(p => {
                        const info = finalScores.find((fs: any) => fs.id === p.id)
                        if (!info) return p
                        return { ...p, score: info.score, name: p.id === myPlayerIdRef.current ? `${info.name} (You)` : info.name }
                    })
                    setPlayers([...merged]); playersRef.current = [...merged]
                }
                break
            }
            case 'TURN_CHANGE': {
                if (playerId === myPlayerIdRef.current) return
                const { nextTurn, newDirection } = payload
                if (nextTurn)     { setCurrentTurn(nextTurn);   currentTurnRef.current = nextTurn   }
                if (newDirection) { setDirection(newDirection); directionRef.current   = newDirection }
                break
            }
        }
    }, [triggerUno])
    // #endregion

    // #region INITIALIZE GAME FROM START
    const initializeGameFromStart = useCallback(async (payload: any) => {
        const { playerOrder, startCard, players: playerInfo, firstTurn, direction: startDirection, drawAmount, drawPlayerId } = payload
        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null); setShowUno({})
        setPlayerOrderState(playerOrder); playerOrderRef.current = playerOrder
        let myIndex = playerOrder.findIndex((id: Player['id']) => id === myPlayerIdRef.current)
        if (myIndex === -1 && myPlayerNameRef.current) {
            const mi = playerInfo.findIndex((p: any) => p.name === myPlayerNameRef.current)
            if (mi !== -1) {
                const correctId = playerOrder[mi]
                setMyPlayerId(correctId); myPlayerIdRef.current = correctId; myIndex = mi
            }
        }
        if (myIndex === -1) myIndex = 0
        const pc = playerOrder.length
        const pos: { [key: string]: Player['position'] } = {}
        if (pc === 2) {
            pos[playerOrder[myIndex]] = 'bottom'; pos[playerOrder[(myIndex+1)%pc]] = 'top'
        } else if (pc === 3) {
            pos[playerOrder[myIndex]] = 'bottom'; pos[playerOrder[(myIndex+1)%pc]] = 'left'; pos[playerOrder[(myIndex+2)%pc]] = 'right'
        } else {
            pos[playerOrder[myIndex]] = 'bottom'; pos[playerOrder[(myIndex+1)%pc]] = 'left'
            pos[playerOrder[(myIndex+2)%pc]] = 'top'; pos[playerOrder[(myIndex+3)%pc]] = 'right'
        }
        const initPlayers: Player[] = playerInfo.map((info: any) => {
            const isMe = info.id === myPlayerIdRef.current
            return {
                id: info.id as Player['id'],
                hand: info.hand.map((c: any) => new Card(c.color, c.value, c.points, c.value === 0 || (c.value >= 1 && c.value <= 9), c.drawValue, c.src)),
                score: info.score || 0,
                position: pos[info.id] || (isMe ? 'bottom' : 'top'),
                name: isMe ? `${info.name} (You)` : info.name,
                isHuman: true,
            }
        })
        const sc = startCard ? new Card(startCard.color, startCard.value, startCard.points, startCard.value === 0 || (startCard.value >= 1 && startCard.value <= 9), startCard.drawValue, startCard.src)
            : new Card('rgb(255, 6, 0)', 0, 0, true, 0, '/images/red0.png')
        let curDeck = shuffleDeck(createDeck())
        const curPlayers = [...initPlayers]
        if (drawAmount && drawAmount > 0 && drawPlayerId) {
            const dp = curPlayers.find(p => p.id === drawPlayerId)
            if (dp) { for (let i = 0; i < drawAmount; i++) if (curDeck.length > 0) dp.hand.push(curDeck.shift()!) }
            audioManager.play('plusCard')
        }
        setPlayers([...curPlayers]);    playersRef.current     = [...curPlayers]
        setDeckState([...curDeck]);     deckRef.current        = curDeck
        setPlayPile([sc]);              playPileRef.current    = [sc]
        setCurrentTurn(firstTurn);      currentTurnRef.current = firstTurn
        setDirection(startDirection || 'clockwise'); directionRef.current = startDirection || 'clockwise'
        setGameOn(true);                gameOnRef.current      = true
        setColorPickerOpen(false);      colorPickerRef.current = false
        setMpState('playing')
        if (typeof document !== 'undefined') document.body.setAttribute('data-player-count', pc.toString())
        audioManager.play('shuffle')
        setTimeout(() => { if (firstTurn === myPlayerIdRef.current) alert("It's your turn! 🎮") }, 500)
    }, [])
    // #endregion

    // #region CHECK WINNER
    const checkForWinner = useCallback(async (currentPlayers?: Player[]) => {
        const cp = currentPlayers ?? playersRef.current
        const winner = cp.find(p => p.hand.length === 0)
        if (!winner) return false
        const updated = cp.map(p => p.id !== winner.id ? p : {
            ...p, score: p.score + cp.reduce((s, pl) => pl.id !== winner.id ? s + tallyPoints(pl.hand) : s, 0)
        })
        setPlayers([...updated]); playersRef.current = [...updated]
        const gw = updated.find(p => p.score >= GAME_OVER_SCORE)
        if (gw) {
            setGameOn(false); gameOnRef.current = false
            setGameWinner(gw.id === myPlayerIdRef.current ? 'You' : gw.name.replace(' (You)', ''))
            setGameVisible(true)
            audioManager.play(gw.id === myPlayerIdRef.current ? 'winGame' : 'lose')
            if (gameModeRef.current === 'multiplayer')
                await broadcastAction('GAME_WINNER', {
                    winnerId: gw.id, winnerName: gw.name.replace(' (You)', ''),
                    finalScores: updated.map(p => ({ id: p.id, name: p.name.replace(' (You)', ''), score: p.score })),
                })
        } else {
            setRoundWinner(winner.id === myPlayerIdRef.current ? 'You' : winner.name.replace(' (You)', ''))
            setRoundVisible(true); setGameOn(false); gameOnRef.current = false
            audioManager.play('winRound')
            if (gameModeRef.current === 'multiplayer')
                await broadcastAction('ROUND_WINNER', {
                    winnerId: winner.id, winnerName: winner.name.replace(' (You)', ''),
                    updatedPlayers: updated.map(p => ({ id: p.id, score: p.score, handSize: p.hand.length, name: p.name.replace(' (You)', '') })),
                })
            if (gameModeRef.current === 'ai') setTimeout(() => setRoundVisible(false), 3000)
        }
        return true
    }, [tallyPoints, broadcastAction])
    // #endregion

    // #region BIND CHANNEL EVENTS
    const bindChannelEvents = useCallback((channel: PusherChannel) => {
        channel.bind('game-action',    (raw: unknown) => applyGameAction(raw as GameAction))
        channel.bind('game-started',   (raw: unknown) => initializeGameFromStart(raw as any))
        channel.bind('player-joined',  (raw: unknown) => {
            const data = raw as JoinPayload
            setMpConnectedPlayers(prev => prev.find(p => p.id === data.playerId || p.name === data.playerName)
                ? prev : [...prev, { id: data.playerId, name: data.playerName }])
        })
        channel.bind('player-left',    (raw: unknown) => {
            const data = raw as { playerId: string; playerName?: string }
            setMpConnectedPlayers(prev => prev.filter(p => p.id !== data.playerId && p.name !== data.playerName))
            setMpError('')
        })
        channel.bind('slot-assigned',  (raw: unknown) => {
            const data = raw as SlotPayload
            if (data.playerId && data.playerName === myPlayerNameRef.current) {
                setMyPlayerId(data.playerId); myPlayerIdRef.current = data.playerId
            }
            if (data.allPlayers) {
                const u = Array.from(new Map(data.allPlayers.map(p => [p.name, p])).values())
                setMpConnectedPlayers(u); mpConnectedRef.current = u
            }
        })
        channel.bind('players-updated', (raw: unknown) => {
            const data = raw as { allPlayers: { id: string; name: string }[] }
            if (data.allPlayers) {
                const u = Array.from(new Map(data.allPlayers.map(p => [p.name, p])).values())
                setMpConnectedPlayers(u); mpConnectedRef.current = u
            }
        })
    }, [applyGameAction, initializeGameFromStart])
    // #endregion

    // #region CREATE ROOM
    const createRoom = useCallback(async () => {
        if (!myPlayerName.trim()) { setMpError('Please enter your name'); return }
        if (joiningRef.current) return
        joiningRef.current = true
        try {
            const code = generateRoomCode()
            setRoomCode(code); roomCodeRef.current = code; setIsHost(true)
            const hostId: Player['id'] = 'player'
            setMyPlayerId(hostId); myPlayerIdRef.current = hostId; myPlayerNameRef.current = myPlayerName
            const pusher = await getPusherInstance() as { subscribe: (ch: string) => PusherChannel }
            const channel = pusher.subscribe(`uno-room-${code}`)
            setMpChannel(channel)
            const init = [{ id: hostId, name: myPlayerName }]
            setMpConnectedPlayers(init); mpConnectedRef.current = init
            bindChannelEvents(channel)
            setMpState('waiting'); setMpError('')
        } catch (e) { console.error(e); setMpError('Failed to create room.') }
        finally { setTimeout(() => { joiningRef.current = false }, 1000) }
    }, [myPlayerName, bindChannelEvents])
    // #endregion

    // #region JOIN ROOM
    const joinRoom = useCallback(async () => {
        if (!myPlayerName.trim())  { setMpError('Please enter your name');   return }
        if (!inputRoomCode.trim()) { setMpError('Please enter a room code'); return }
        if (joiningRef.current) return
        joiningRef.current = true
        try {
            const code = inputRoomCode.toUpperCase().trim()
            setRoomCode(code); roomCodeRef.current = code; setIsHost(false)
            myPlayerNameRef.current = myPlayerName
            const tempId = (`temp_${Date.now()}_${Math.random().toString(36).substring(7)}`) as Player['id']
            setMyPlayerId(tempId); myPlayerIdRef.current = tempId
            const pusher = await getPusherInstance() as { subscribe: (ch: string) => PusherChannel }
            const channel = pusher.subscribe(`uno-room-${code}`)
            setMpChannel(channel); bindChannelEvents(channel)
            setMpConnectedPlayers(prev => prev.find(p => p.name === myPlayerName) ? prev : [...prev, { id: tempId, name: myPlayerName }])
            await pusherTrigger(`uno-room-${code}`, 'player-joined', { playerId: tempId, playerName: myPlayerName, requestSlot: true })
            setMpState('waiting'); setMpError('')
        } catch (e) { console.error(e); setMpError('Failed to join room.') }
        finally { setTimeout(() => { joiningRef.current = false }, 1000) }
    }, [myPlayerName, inputRoomCode, bindChannelEvents])
    // #endregion

    // #region HOST ASSIGNS SLOT
    useEffect(() => {
        if (!isHost || !mpChannel || gameMode !== 'multiplayer') return
        const slots: Player['id'][] = ['player', 'p2', 'p3', 'p4']
        const assigned: string[] = ['player']
        const pending = new Set<string>()
        const handleJoined = async (raw: unknown) => {
            const data = raw as JoinPayload
            if (!data.requestSlot || pending.has(data.playerId)) return
            pending.add(data.playerId)
            try {
                if (mpConnectedRef.current.find(p => p.name === data.playerName)) return
                const next = slots.find(s => !assigned.includes(s))
                if (!next) { setMpError('Room is full!'); return }
                assigned.push(next)
                const nc = [...mpConnectedRef.current]
                if (!nc.find(p => p.name === data.playerName)) {
                    nc.push({ id: next, name: data.playerName })
                    setMpConnectedPlayers(nc); mpConnectedRef.current = nc
                }
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'slot-assigned', { playerId: next, playerName: data.playerName, allPlayers: nc })
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'players-updated', { allPlayers: nc })
            } finally { pending.delete(data.playerId) }
        }
        mpChannel.bind('player-joined', handleJoined)
        mpChannel.bind('players-updated', (raw: unknown) => {
            const data = raw as { allPlayers: { id: string; name: string }[] }
            if (data.allPlayers) {
                const u = Array.from(new Map(data.allPlayers.map(p => [p.name, p])).values())
                setMpConnectedPlayers(u); mpConnectedRef.current = u
            }
        })
        return () => { mpChannel.unbind_all() }
    }, [isHost, mpChannel, gameMode])
    // #endregion

    // #region SYNC PLAYER LIST
    useEffect(() => {
        if (!isHost || !mpChannel || gameMode !== 'multiplayer' || mpState !== 'waiting') return
        const id = setInterval(() => {
            if (mpConnectedRef.current.length > 0)
                pusherTrigger(`uno-room-${roomCodeRef.current}`, 'players-updated', { allPlayers: mpConnectedRef.current }).catch(console.error)
        }, 5000)
        return () => clearInterval(id)
    }, [isHost, mpChannel, gameMode, mpState])
    // #endregion

    // #region PAGE LEAVE
    useEffect(() => {
        const onUnload = () => {
            if (gameMode === 'multiplayer' && roomCode)
                pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
        }
        window.addEventListener('beforeunload', onUnload)
        return () => {
            window.removeEventListener('beforeunload', onUnload)
            if (gameMode === 'multiplayer' && roomCode && myPlayerIdRef.current)
                pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
        }
    }, [gameMode, roomCode])
    // #endregion

    // #region START MULTIPLAYER GAME
    const startMultiplayerGame = useCallback(async () => {
        if (!isHost) return
        if (mpConnectedPlayers.length < 2) { setMpError('Need at least 2 players'); return }
        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null); setShowUno({})
        const playerOrder: Player['id'][] = mpConnectedPlayers.map(p => p.id as Player['id'])
        const newPlayers: Player[] = mpConnectedPlayers.map(cp => ({
            id: cp.id as Player['id'], hand: [], score: 0, position: 'top', name: cp.name, isHuman: true,
        }))
        let newDeck = shuffleDeck(createDeck())
        for (let i = 0; i < 7; i++) for (let j = 0; j < newPlayers.length; j++) if (newDeck.length > 0) newPlayers[j].hand.push(newDeck.shift()!)
        let si = -1, sc: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].value >= 0 && newDeck[i].value <= 9 && newDeck[i].color !== 'any') { si = i; sc = newDeck[i]; break }
        }
        if (si === -1) for (let i = 0; i < newDeck.length; i++) if (newDeck[i].color !== 'any') { si = i; sc = newDeck[i]; break }
        if (si !== -1 && sc) newDeck.splice(si, 1); else if (newDeck.length > 0) sc = newDeck.shift()!
        const fpi = Math.floor(Math.random() * playerOrder.length)
        let fp = playerOrder[fpi], da = 0, dtp: Player['id'] | null = null
        if (sc?.value === 12) {
            da = 2; audioManager.play('plusCard')
            const ni = (fpi + 1) % playerOrder.length; dtp = playerOrder[ni]
            const dp = newPlayers.find(p => p.id === dtp); if (dp) for (let i = 0; i < 2; i++) if (newDeck.length > 0) dp.hand.push(newDeck.shift()!)
            fp = dtp
        } else if (sc?.value === 14) {
            da = 4; audioManager.play('plusCard')
            const ni = (fpi + 1) % playerOrder.length; dtp = playerOrder[ni]
            const dp = newPlayers.find(p => p.id === dtp); if (dp) for (let i = 0; i < 4; i++) if (newDeck.length > 0) dp.hand.push(newDeck.shift()!)
            const cols = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            if (sc) sc.color = cols[Math.floor(Math.random() * cols.length)]
            fp = dtp
        } else if (sc?.value === 11) {
            fp = playerOrder[(fpi + 1) % playerOrder.length]
        }
        setPlayers([...newPlayers]);      playersRef.current     = [...newPlayers]
        setDeckState([...newDeck]);       deckRef.current        = newDeck
        setPlayPile(sc ? [sc] : []);      playPileRef.current    = sc ? [sc] : []
        setCurrentTurn(fp);               currentTurnRef.current = fp
        setDirection('clockwise');        directionRef.current   = 'clockwise'
        setPlayerOrderState(playerOrder); playerOrderRef.current = playerOrder
        setGameOn(true);                  gameOnRef.current      = true
        setColorPickerOpen(false);        colorPickerRef.current = false
        setMpState('playing');            audioManager.play('shuffle')
        await pusherTrigger(`uno-room-${roomCode}`, 'game-started', {
            playerOrder, startCard: sc ? { color: sc.color, value: sc.value, points: sc.points, drawValue: sc.drawValue, src: sc.src } : null,
            players: newPlayers.map(p => ({ id: p.id, name: p.name, score: p.score, hand: p.hand.map(c => ({ color: c.color, value: c.value, points: c.points, changeTurn: c.changeTurn, drawValue: c.drawValue, src: c.src, playedByPlayer: c.playedByPlayer })) })),
            firstTurn: fp, direction: 'clockwise', drawAmount: da, drawPlayerId: dtp,
        })
    }, [isHost, mpConnectedPlayers, roomCode])
    // #endregion

    // #region RESET MULTIPLAYER STATE
    const resetMultiplayerState = useCallback(() => {
        setGameOn(false); gameOnRef.current = false
        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
        setShowUno({}); setColorPickerOpen(false); setWildCardColor(''); setSelectedWildColor('')
        setDirection('clockwise'); directionRef.current = 'clockwise'
        setCurrentTurn('player'); currentTurnRef.current = 'player'
        setMpState('lobby'); setMpConnectedPlayers([]); setMpError(''); setRoomCode(''); roomCodeRef.current = ''
        if (mpChannel) { try { mpChannel.unbind_all() } catch (e) { console.error(e) } setMpChannel(null) }
    }, [mpChannel])
    // #endregion

    // #region NEW AI GAME
    const newAIGame = useCallback((existingScores?: { [key: string]: number }) => {
        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
        setShowUno({}); setColorPickerOpen(false); setWildCardColor(''); setSelectedWildColor('')
        setGameOn(true);                      gameOnRef.current      = true
        setDirection('clockwise');            directionRef.current   = 'clockwise'
        setPlayerOrderState(AI_PLAYER_ORDER); playerOrderRef.current = AI_PLAYER_ORDER
        setMyPlayerId('player');              myPlayerIdRef.current  = 'player'
        let newDeck = shuffleDeck(createDeck())
        audioManager.play('shuffle')
        const np: Player[] = [
            { id: 'player', hand: [], score: existingScores?.player ?? 0, position: 'bottom', name: 'YOU',       isHuman: true  },
            { id: 'cpu1',   hand: [], score: existingScores?.cpu1   ?? 0, position: 'top',    name: 'CPU TOP',   isHuman: false },
            { id: 'cpu2',   hand: [], score: existingScores?.cpu2   ?? 0, position: 'left',   name: 'CPU LEFT',  isHuman: false },
            { id: 'cpu3',   hand: [], score: existingScores?.cpu3   ?? 0, position: 'right',  name: 'CPU RIGHT', isHuman: false },
        ]
        for (let i = 0; i < 7; i++) for (let j = 0; j < np.length; j++) np[j].hand.push(newDeck.shift()!)
        let si = -1, sc: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].value >= 0 && newDeck[i].value <= 9 && newDeck[i].color !== 'any') { si = i; sc = newDeck[i]; break }
        }
        if (si === -1) for (let i = 0; i < newDeck.length; i++) if (newDeck[i].color !== 'any') { si = i; sc = newDeck[i]; break }
        if (si !== -1 && sc) newDeck.splice(si, 1); else if (newDeck.length > 0) sc = newDeck.shift()!
        if (sc?.value === 12) {
            const next = np.find(p => p.id === 'cpu1')
            if (next && newDeck.length >= 2) { next.hand.push(newDeck.shift()!); next.hand.push(newDeck.shift()!) }
            audioManager.play('plusCard')
        } else if (sc?.value === 14) {
            const next = np.find(p => p.id === 'cpu1')
            if (next && newDeck.length >= 4) for (let i = 0; i < 4; i++) next.hand.push(newDeck.shift()!)
            const cols = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            if (sc) sc.color = cols[Math.floor(Math.random() * cols.length)]
            audioManager.play('plusCard')
        } else if (sc?.value === 11) {
            if (sc) sc.playedByPlayer = true
        }
        setPlayers([...np]);           playersRef.current     = [...np]
        setDeckState([...newDeck]);    deckRef.current        = newDeck
        setPlayPile(sc ? [sc] : []);   playPileRef.current    = sc ? [sc] : []
        setCurrentTurn('player');      currentTurnRef.current = 'player'
        setColorPickerOpen(false);     colorPickerRef.current = false
        setTimeout(() => { setRoundVisible(false); setGameVisible(false) }, 100)
    }, [])
    // #endregion

    // #region CPU LOGIC
    const playCPU = useCallback(async (cpuId: Player['id']) => {
        if (currentTurnRef.current !== cpuId || !gameOnRef.current || colorPickerRef.current || gameModeRef.current !== 'ai') return
        await new Promise(resolve => setTimeout(resolve, getCpuDelay()))
        if (currentTurnRef.current !== cpuId || !gameOnRef.current) return
        const order = playerOrderRef.current
        const cpu = playersRef.current.find(p => p.id === cpuId)
        if (!cpu) return
        const pile = [...playPileRef.current], deck = [...deckRef.current]
        const top = pile[pile.length - 1], dir = directionRef.current
        const playable: CardType[] = [], remaining: CardType[] = []
        for (const card of cpu.hand) {
            (card.color === top.color || card.value === top.value || card.color === 'any' || top.color === 'any')
                ? playable.push(card) : remaining.push(card)
        }
        if (playable.length === 0) {
            let nd = [...deck], np = [...pile]
            const nh = [...cpu.hand]
            if (nd.length > 0) nh.push(nd.shift()!)
            else if (np.length > 1) { nd = shuffleDeck(np.slice(0, -1)); np = [np[np.length - 1]]; nh.push(nd.shift()!) }
            audioManager.play('drawCard')
            const up = playersRef.current.map(p => p.id === cpuId ? { ...p, hand: nh } : p)
            setPlayers([...up]); playersRef.current = [...up]
            setDeckState([...nd]); deckRef.current = nd
            setPlayPile([...np]); playPileRef.current = np
            const next = getNextTurn(cpuId, dir, order)
            setCurrentTurn(next); currentTurnRef.current = next
            return
        }
        const chosen = playable[0]
        const leftover = [...remaining, ...playable.slice(1)]
        audioManager.playCardSound()
        const np2 = [...pile, { ...chosen, playedByPlayer: false }]
        let nd2 = dir, nt: Player['id']
        if (chosen.value === 10) {
            nd2 = dir === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(nd2); directionRef.current = nd2; nt = getNextTurn(cpuId, nd2, order)
        } else if (chosen.value === 11) {
            const sk = getNextTurn(cpuId, nd2, order); nt = getNextTurn(sk, nd2, order)
        } else if (chosen.drawValue > 0) {
            audioManager.play('plusCard')
            const dt = getNextTurn(cpuId, nd2, order)
            const di = playersRef.current.findIndex(p => p.id === dt)
            if (di !== -1) {
                const dp = { ...playersRef.current[di], hand: [...playersRef.current[di].hand] }
                let ud = [...deck], up2 = [...np2]
                for (let i = 0; i < chosen.drawValue; i++) {
                    if (ud.length > 0) { dp.hand.push(ud.shift()!); audioManager.play('drawCard') }
                    else if (up2.length > 1) { ud = shuffleDeck(up2.slice(0, -1)); up2 = [up2[up2.length - 1]]; dp.hand.push(ud.shift()!); audioManager.play('drawCard') }
                }
                const upd = playersRef.current.map((p, i) => i === di ? { ...p, hand: dp.hand } : p)
                setPlayers([...upd]); playersRef.current = [...upd]
                setDeckState([...ud]); deckRef.current = ud
                setPlayPile([...up2]); playPileRef.current = up2
            }
            nt = dt
        } else {
            nt = getNextTurn(cpuId, nd2, order)
        }
        if (chosen.color === 'any' && chosen.value === 13) {
            const cols = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            np2[np2.length - 1].color = cols[Math.floor(Math.random() * cols.length)]
        }
        const up3 = playersRef.current.map(p => p.id === cpuId ? { ...p, hand: leftover } : p)
        setPlayers([...up3]); playersRef.current = [...up3]
        setPlayPile([...np2]); playPileRef.current = np2
        if (leftover.length === 1) triggerUno(cpuId)
        if (leftover.length === 0) { await checkForWinner(); return }
        setCurrentTurn(nt); currentTurnRef.current = nt
    }, [triggerUno, checkForWinner, getCpuDelay, getNextTurn])
    // #endregion

    // #region DRAW PILE CLICK
    const handleDrawPileClick = useCallback(async () => {
        if (currentTurnRef.current !== myPlayerIdRef.current || colorPickerRef.current || !gameOnRef.current) return
        const order = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)
        if (!player) return
        let nd = [...deckRef.current], np = [...playPileRef.current]
        const nh = [...player.hand]
        let drawn: CardType | null = null
        const dir = directionRef.current
        if (nd.length > 0) { drawn = nd.shift()!; nh.push(drawn) }
        else if (np.length > 1) {
            nd = shuffleDeck(np.slice(0, -1)); np = [np[np.length - 1]]
            drawn = nd.shift()!; nh.push(drawn)
        } else return
        audioManager.play('drawCard')
        const up = playersRef.current.map(p => p.id === myPlayerIdRef.current ? { ...p, hand: [...nh] } : p)
        setPlayers([...up]); playersRef.current = [...up]
        setDeckState([...nd]); deckRef.current = nd
        setPlayPile([...np]); playPileRef.current = np
        if (gameModeRef.current === 'multiplayer')
            await broadcastAction('DRAW_CARD_UPDATE', { playerId: myPlayerIdRef.current, handCount: nh.length })
        if (drawn) {
            const top = np[np.length - 1]
            const canPlay = drawn.color === top.color || drawn.value === top.value || drawn.color === 'any' || top.color === 'any'
            if (canPlay) return
        }
        const next = getNextTurn(myPlayerIdRef.current, dir, order)
        setCurrentTurn(next); currentTurnRef.current = next
        if (gameModeRef.current === 'multiplayer') await broadcastAction('TURN_CHANGE', { nextTurn: next })
    }, [getNextTurn, broadcastAction])
    // #endregion

    // #region PLAYER CARD CLICK
    const handlePlayerCardClick = useCallback(async (index: number) => {
        if (currentTurnRef.current !== myPlayerIdRef.current || colorPickerRef.current || !gameOnRef.current) return
        const order = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)
        if (!player) return
        const pile = [...playPileRef.current], top = pile[pile.length - 1]
        const card = player.hand[index], dir = directionRef.current
        const ok = card.value === top.value || card.color === top.color || card.color === 'any' || top.color === 'any'
        if (!ok) return
        audioManager.playCardSound()
        const nh = player.hand.filter((_, i) => i !== index)
        const played = { ...card, playedByPlayer: true }
        const np = [...pile, played]
        let nd = dir
        if (played.value === 10) { nd = dir === 'clockwise' ? 'counter-clockwise' : 'clockwise'; setDirection(nd); directionRef.current = nd }
        let up = playersRef.current.map(p => p.id === myPlayerIdRef.current ? { ...p, hand: nh } : p)
        let nt: Player['id'] | null = null, dtp: Player['id'] | null = null
        if (played.drawValue > 0) { audioManager.play('plusCard'); dtp = getNextTurn(myPlayerIdRef.current, nd, order); nt = dtp }
        else if (played.value === 11) { const sk = getNextTurn(myPlayerIdRef.current, nd, order); nt = getNextTurn(sk, nd, order) }
        setPlayers([...up]); playersRef.current = [...up]
        setPlayPile([...np]); playPileRef.current = np
        if (nh.length === 1) {
            triggerUno(myPlayerIdRef.current)
            if (gameModeRef.current === 'multiplayer') await broadcastAction('UNO_SHOUT', { playerId: myPlayerIdRef.current })
        }
        if (nh.length === 0) { await checkForWinner(up); return }
        if (played.color === 'any' && played.value === 13) {
            if (gameModeRef.current === 'multiplayer')
                await broadcastAction('PLAY_CARD', { card: played, playerHandCount: nh.length, cardIndex: index, newDirection: nd !== dir ? nd : null, nextTurn: null, drawAmount: played.drawValue, drawTargetPlayer: dtp, colorChosen: true })
            setColorPickerOpen(true); colorPickerRef.current = true
            return
        }
        if (!played.drawValue && played.value !== 11 && !nt) nt = getNextTurn(myPlayerIdRef.current, nd, order)
        if (nt) { setCurrentTurn(nt); currentTurnRef.current = nt }
        if (gameModeRef.current === 'multiplayer')
            await broadcastAction('PLAY_CARD', { card: played, playerHandCount: nh.length, cardIndex: index, newDirection: nd !== dir ? nd : null, nextTurn: nt, drawAmount: played.drawValue, drawTargetPlayer: dtp })
    }, [triggerUno, checkForWinner, getNextTurn, broadcastAction])
    // #endregion

    // #region COLOR CHOSEN
    const handleColorChosen = useCallback(async (color: string) => {
        audioManager.play('colorButton')
        const order = playerOrderRef.current
        const np = [...playPileRef.current]
        const lc = np[np.length - 1]
        if (lc && lc.value === 13) np[np.length - 1] = { ...lc, color }
        setPlayPile([...np]); playPileRef.current = np
        setColorPickerOpen(false); colorPickerRef.current = false
        setWildCardColor(color); setSelectedWildColor(color); selectedWildColorRef.current = color
        const nt = getNextTurn(myPlayerIdRef.current, directionRef.current, order)
        setCurrentTurn(nt); currentTurnRef.current = nt
        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('COLOR_CHOSEN', { color, nextTurn: nt })
            await broadcastAction('TURN_CHANGE', { nextTurn: nt })
        }
    }, [getNextTurn, broadcastAction])
    // #endregion

    // #region PLAY AGAIN
    const handlePlayAgain = useCallback(() => {
        audioManager.play('playAgain')
        setGameVisible(false); setRoundVisible(false); setRoundWinner(null); setGameWinner(null); setShowUno({})
        if (gameMode === 'ai') {
            const scores: { [key: string]: number } = {}
            playersRef.current.forEach(p => { scores[p.id] = p.score })
            newAIGame(scores)
        } else if (gameMode === 'multiplayer' && isHost) {
            startMultiplayerGame()
        }
    }, [gameMode, newAIGame, isHost, startMultiplayerGame])
    // #endregion

    // #region AUTO CPU TURN
    useEffect(() => {
        if (gameMode !== 'ai' || !gameOn || colorPickerOpen || currentTurn === 'player') return
        const p = players.find(pl => pl.id === currentTurn)
        if (p && !p.isHuman) playCPU(currentTurn)
    }, [currentTurn, gameOn, colorPickerOpen, playCPU, gameMode, players])
    // #endregion

    // #region HAND CARD DATA ATTRIBUTE
    useEffect(() => {
        const el = document.querySelector('.player-hand')
        if (el && myPlayer) el.setAttribute('data-card-count', myPlayer.hand.length.toString())
    }, [myPlayer?.hand.length])
    // #endregion

    // #region DERIVED
    const topCard      = playPile[playPile.length - 1]
    const myPlayer     = players.find(p => p.id === myPlayerId)
    const otherPlayers = players.filter(p => p.id !== myPlayerId)

    const getCardName = (card: CardType) => {
        if (card.color === 'any') return card.drawValue === 4 ? 'Wild Draw 4' : 'Wild Card'
        const cn: Record<string, string> = { 'rgb(255, 6, 0)': 'Red', 'rgb(0, 170, 69)': 'Green', 'rgb(0, 150, 224)': 'Blue', 'rgb(255, 222, 0)': 'Yellow' }
        const vn: Record<number, string> = { 10: 'Reverse', 11: 'Skip', 12: 'Draw 2', 13: 'Wild', 14: 'Wild Draw 4' }
        return `${cn[card.color] ?? card.color} ${vn[card.value] ?? card.value}`
    }

    const getPositionClass = (pos: Player['position']) =>
        pos === 'top' ? 'cpu-top' : pos === 'left' ? 'cpu-left' : pos === 'right' ? 'cpu-right' : ''

    const getWildcardColorClass = (color: string) => {
        if (color === 'rgb(255, 6, 0)')   return 'red'
        if (color === 'rgb(0, 170, 69)')  return 'green'
        if (color === 'rgb(0, 150, 224)') return 'blue'
        if (color === 'rgb(255, 222, 0)') return 'yellow'
        return ''
    }
    // #endregion

    // ─── MENU ──────────────────────────────────────────────────────────────────
    if (gameMode === 'menu') {
        return (
            <main style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `radial-gradient(ellipse at 50% 30%, #1a2e1a 0%, ${T.bg} 70%)`,
                fontFamily: "'Segoe UI', system-ui, sans-serif",
            }}>
                {/* Decorative background circles */}
                <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
                    {[
                        { w: 600, h: 600, top: '-15%', left: '-10%', c: 'rgba(34,197,94,0.06)' },
                        { w: 500, h: 500, bottom: '-10%', right: '-8%', c: 'rgba(59,130,246,0.07)' },
                        { w: 300, h: 300, top: '40%', left: '60%', c: 'rgba(245,197,24,0.05)' },
                    ].map((b, i) => (
                        <div key={i} style={{
                            position: 'absolute', width: b.w, height: b.h,
                            top: (b as any).top, left: (b as any).left,
                            bottom: (b as any).bottom, right: (b as any).right,
                            borderRadius: '50%', background: b.c, filter: 'blur(60px)',
                        }} />
                    ))}
                </div>

                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '1rem' }}>
                    {/* Logo */}
                    <div style={{ marginBottom: '2.5rem' }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 110, height: 110, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #f5c518, #e67e22)',
                            boxShadow: '0 0 60px rgba(245,197,24,0.4)',
                            marginBottom: '1.2rem', fontSize: '3.5rem',
                        }}>🃏</div>
                        <h1 style={{
                            fontSize: 'clamp(3rem, 8vw, 5.5rem)', fontWeight: 900,
                            background: 'linear-gradient(135deg, #f5c518, #f97316)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            letterSpacing: '-0.02em', lineHeight: 1, margin: 0,
                        }}>UNO</h1>
                        <p style={{ color: T.textMuted, fontSize: T.fLg, marginTop: '0.6rem', letterSpacing: '0.12em' }}>
                            CARD GAME
                        </p>
                    </div>

                    {/* Mode cards */}
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {[
                            {
                                icon: '🤖', label: 'Play vs AI', sub: 'Challenge the computer',
                                grad: `linear-gradient(135deg, ${T.green}, ${T.greenDark})`,
                                glow: 'rgba(34,197,94,0.3)',
                                onClick: () => { setGameMode('ai'); gameModeRef.current = 'ai'; newAIGame() },
                            },
                            {
                                icon: '🌐', label: 'Multiplayer', sub: 'Play with friends online',
                                grad: `linear-gradient(135deg, ${T.blue}, ${T.blueDark})`,
                                glow: 'rgba(59,130,246,0.3)',
                                onClick: () => { setGameMode('multiplayer'); gameModeRef.current = 'multiplayer' },
                            },
                        ].map(m => (
                            <button key={m.label} onClick={m.onClick} style={{
                                width: 220, padding: '2rem 1.5rem',
                                background: T.surface,
                                border: `1px solid ${T.border}`,
                                borderRadius: T.rXl, cursor: 'pointer', color: T.text,
                                transition: 'transform 0.15s, box-shadow 0.15s',
                                backdropFilter: 'blur(12px)',
                            }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-6px)'
                                    ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 20px 50px ${m.glow}`
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
                                    ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
                                }}
                            >
                                <div style={{
                                    width: 64, height: 64, borderRadius: '50%', background: m.grad,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2rem', margin: '0 auto 1.2rem', boxShadow: `0 8px 24px ${m.glow}`,
                                }}>{m.icon}</div>
                                <div style={{ fontSize: T.fXl, fontWeight: 800, marginBottom: '0.4rem' }}>{m.label}</div>
                                <div style={{ fontSize: T.fSm, color: T.textMuted }}>{m.sub}</div>
                            </button>
                        ))}
                    </div>

                    <p style={{ color: T.textDim, fontSize: T.fXs, marginTop: '2.5rem', letterSpacing: '0.08em' }}>
                        First to 100 points wins
                    </p>
                </div>
            </main>
        )
    }

    // ─── MULTIPLAYER LOBBY ─────────────────────────────────────────────────────
    if (gameMode === 'multiplayer' && mpState !== 'playing') {
        const inputStyle: React.CSSProperties = {
            width: '100%', padding: '0.9rem 1.1rem', borderRadius: T.rMd,
            border: `1px solid ${T.border}`, background: T.surfaceHigh,
            color: T.text, fontSize: T.fMd, outline: 'none', boxSizing: 'border-box',
            letterSpacing: '0.02em',
        }
        return (
            <main style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `radial-gradient(ellipse at 50% 30%, #0d1b2e 0%, ${T.bg} 70%)`,
                fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '1rem',
            }}>
                <div style={{
                    ...glassPanel({ padding: '2.5rem', width: '100%', maxWidth: 460 }),
                    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                }}>
                    {/* Back */}
                    <button onClick={() => {
                        if (roomCode && myPlayerIdRef.current)
                            pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
                        setGameMode('menu'); setMpState('lobby'); setMpError(''); setMpConnectedPlayers([]); setRoomCode('')
                        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
                    }} style={{ ...btn('ghost', { padding: '0.5rem 1rem', fontSize: T.fSm, marginBottom: '1.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }) }}>
                        ← Back
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '2rem' }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${T.blue}, ${T.blueDark})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
                        }}>🌐</div>
                        <h2 style={{ margin: 0, fontSize: T.f2xl, fontWeight: 800, color: T.text }}>Multiplayer</h2>
                    </div>

                    {mpState === 'lobby' && (
                        <>
                            <div style={{ marginBottom: '1.4rem' }}>
                                <label style={{ color: T.textMuted, display: 'block', marginBottom: '0.5rem', fontSize: T.fSm, fontWeight: 600, letterSpacing: '0.06em' }}>
                                    YOUR NAME
                                </label>
                                <input type="text" value={myPlayerName}
                                    onChange={e => setMyPlayerName(e.target.value)}
                                    placeholder="Enter your name…" maxLength={16}
                                    style={inputStyle} />
                            </div>

                            <button onClick={createRoom} disabled={joiningRef.current}
                                style={{ ...btn('primary', { width: '100%', marginBottom: '1.8rem', opacity: joiningRef.current ? 0.6 : 1, cursor: joiningRef.current ? 'not-allowed' : 'pointer' }) }}>
                                {joiningRef.current ? '⏳ Creating…' : '🏠 Create Room'}
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.4rem' }}>
                                <div style={{ flex: 1, height: 1, background: T.border }} />
                                <span style={{ color: T.textDim, fontSize: T.fXs, letterSpacing: '0.1em' }}>OR JOIN</span>
                                <div style={{ flex: 1, height: 1, background: T.border }} />
                            </div>

                            <label style={{ color: T.textMuted, display: 'block', marginBottom: '0.5rem', fontSize: T.fSm, fontWeight: 600, letterSpacing: '0.06em' }}>
                                ROOM CODE
                            </label>
                            <div style={{ display: 'flex', gap: '0.8rem' }}>
                                <input type="text" value={inputRoomCode}
                                    onChange={e => setInputRoomCode(e.target.value.toUpperCase())}
                                    placeholder="ABC123" maxLength={6}
                                    style={{ ...inputStyle, flex: 1, letterSpacing: '0.25em', fontFamily: 'monospace', fontSize: T.fLg }} />
                                <button onClick={joinRoom} disabled={joiningRef.current}
                                    style={{ ...btn('secondary', { padding: '0.9rem 1.4rem', opacity: joiningRef.current ? 0.6 : 1, cursor: joiningRef.current ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }) }}>
                                    {joiningRef.current ? '⏳' : 'Join →'}
                                </button>
                            </div>

                            {mpError && (
                                <div style={{
                                    marginTop: '1.2rem', padding: '0.8rem 1rem', borderRadius: T.rSm,
                                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                    color: '#fca5a5', fontSize: T.fSm,
                                }}>⚠️ {mpError}</div>
                            )}
                        </>
                    )}

                    {mpState === 'waiting' && (
                        <>
                            {/* Room code display */}
                            <div style={{
                                background: T.goldDim, border: `2px dashed rgba(245,197,24,0.4)`,
                                borderRadius: T.rLg, padding: '1.8rem', textAlign: 'center', marginBottom: '2rem',
                            }}>
                                <p style={{ color: T.textMuted, fontSize: T.fSm, margin: '0 0 0.5rem', letterSpacing: '0.1em' }}>ROOM CODE</p>
                                <p style={{
                                    fontSize: 'clamp(2.5rem, 8vw, 3.5rem)', fontWeight: 900, color: T.gold,
                                    letterSpacing: '0.35em', fontFamily: 'monospace', margin: '0 0 0.5rem',
                                }}>{roomCode}</p>
                                <p style={{ color: T.textDim, fontSize: T.fXs, margin: 0 }}>Share this code with friends</p>
                            </div>

                            {/* Player list */}
                            <p style={{ color: T.textMuted, fontSize: T.fSm, fontWeight: 600, letterSpacing: '0.08em', marginBottom: '0.8rem' }}>
                                PLAYERS ({mpConnectedPlayers.length}/4)
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                {mpConnectedPlayers.map((p, i) => (
                                    <div key={p.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.8rem',
                                        padding: '0.75rem 1rem', background: T.surfaceHigh,
                                        borderRadius: T.rMd, border: `1px solid ${T.border}`,
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: `linear-gradient(135deg, ${T.green}, ${T.greenDark})`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.9rem', flexShrink: 0,
                                        }}>✓</div>
                                        <span style={{ color: T.text, fontSize: T.fMd, fontWeight: 600, flex: 1 }}>{p.name}</span>
                                        {i === 0 && isHost && (
                                            <span style={{ ...pill(T.gold, T.goldDim), fontSize: T.fXs }}>HOST</span>
                                        )}
                                    </div>
                                ))}
                                {Array.from({ length: Math.max(0, 4 - mpConnectedPlayers.length) }).map((_, i) => (
                                    <div key={`empty-${i}`} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.8rem',
                                        padding: '0.75rem 1rem',
                                        background: 'transparent', borderRadius: T.rMd,
                                        border: `1px dashed ${T.border}`,
                                    }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: T.surface, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
                                        }}>⏳</div>
                                        <span style={{ color: T.textDim, fontSize: T.fSm }}>Waiting for player…</span>
                                    </div>
                                ))}
                            </div>

                            {isHost ? (
                                <button onClick={startMultiplayerGame} disabled={mpConnectedPlayers.length < 2}
                                    style={{ ...btn(mpConnectedPlayers.length >= 2 ? 'primary' : 'ghost', { width: '100%', opacity: mpConnectedPlayers.length >= 2 ? 1 : 0.5, cursor: mpConnectedPlayers.length >= 2 ? 'pointer' : 'not-allowed' }) }}>
                                    {mpConnectedPlayers.length >= 2 ? '🚀 Start Game!' : `⏳ Need at least 2 players (${mpConnectedPlayers.length} joined)`}
                                </button>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '1rem', color: T.textMuted, fontSize: T.fMd }}>
                                    ⏳ Waiting for host to start…
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        )
    }

    // ─── GAME BOARD ────────────────────────────────────────────────────────────
    const isMyTurnNow = currentTurn === myPlayerId
    const dirLabel    = direction === 'clockwise' ? '↻ Clockwise' : '↺ Counter-clockwise'

    return (
        <main className="game-container" style={{
            background: `radial-gradient(ellipse at 50% 50%, #132013 0%, ${T.bg} 75%)`,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            minHeight: '100vh', position: 'relative', overflow: 'hidden',
        }}>
            {/* ── Top HUD ── */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.7rem 1.2rem',
                background: 'rgba(10,14,20,0.82)', backdropFilter: 'blur(16px)',
                borderBottom: `1px solid ${T.border}`,
            }}>
                {/* Back button */}
                <button onClick={() => {
                    if (roomCode && myPlayerIdRef.current)
                        pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
                    if (gameMode === 'ai') {
                        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
                        setShowUno({}); setColorPickerOpen(false); setGameOn(false); gameOnRef.current = false
                    } else if (gameMode === 'multiplayer') { resetMultiplayerState() }
                    setGameMode('menu'); gameModeRef.current = 'menu'; setMpState('lobby'); setMpConnectedPlayers([]); setRoomCode('')
                }} style={{ ...btn('ghost', { padding: '0.45rem 1rem', fontSize: T.fSm, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }) }}>
                    ← Menu
                </button>

                {/* Centre: turn indicator */}
                <div style={{ textAlign: 'center' }}>
                    {isMyTurnNow ? (
                        <div style={{
                            ...pill('#fff', 'rgba(245,197,24,0.22)'),
                            border: `1px solid rgba(245,197,24,0.5)`,
                            fontSize: T.fMd, animation: 'pulse 1.5s infinite',
                        }}>
                            🎮 YOUR TURN
                        </div>
                    ) : (
                        <div style={{ ...pill(T.textMuted, T.surface), border: `1px solid ${T.border}`, fontSize: T.fMd }}>
                            🎯 {players.find(p => p.id === currentTurn)?.name?.replace(' (You)', '')}&apos;s turn
                        </div>
                    )}
                    <div style={{ color: T.textDim, fontSize: T.fXs, marginTop: '0.25rem' }}>{dirLabel}</div>
                </div>

                {/* Mode badge */}
                <div style={{
                    ...pill(gameMode === 'ai' ? T.green : T.blue,
                        gameMode === 'ai' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)'),
                    border: `1px solid ${gameMode === 'ai' ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`,
                    fontSize: T.fXs,
                }}>
                    {gameMode === 'ai' ? '🤖 vs AI' : `🌐 ${roomCode}`}
                </div>
            </div>

            {/* ── Opponent Players ── */}
            {otherPlayers.map(op => {
                const isTheirTurn = currentTurn === op.id
                const isVert      = op.position === 'left' || op.position === 'right'
                return (
                    <div key={op.id} className={`cpu-player ${getPositionClass(op.position)}`}>
                        {/* Name badge */}
                        <div style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            padding: '0.5rem 1rem', borderRadius: T.rMd,
                            background: isTheirTurn ? 'rgba(245,197,24,0.15)' : T.surface,
                            border: isTheirTurn ? `2px solid rgba(245,197,24,0.6)` : `1px solid ${T.border}`,
                            backdropFilter: 'blur(8px)',
                            boxShadow: isTheirTurn ? T.shadowGlow : 'none',
                            transition: 'all 0.3s',
                        }}>
                            <span style={{ fontSize: T.fMd, fontWeight: 700, color: isTheirTurn ? T.gold : T.text }}>
                                {isTheirTurn ? '🎯 ' : ''}{op.name}
                            </span>
                            <span style={{ fontSize: T.fXs, color: T.textMuted }}>
                                {op.hand.length} cards · {op.score} pts
                            </span>
                        </div>

                        {/* Cards */}
                        <div className={isVert ? 'cpu-hand-vertical' : 'cpu-hand'} style={{ marginTop: '0.5rem' }}>
                            {op.hand.map((_, i) => (
                                <Image key={i} src="/images/back.png" alt="card back"
                                    width={isVert ? 90 : 60} height={isVert ? 60 : 90}
                                    className={isVert ? 'cpu-card-vertical' : 'cpu-card'}
                                    style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }} />
                            ))}
                        </div>

                        {/* UNO bubble */}
                        {showUno[op.id] && (
                            <div className={
                                op.position === 'top'  ? 'cpu-animation-top'  :
                                op.position === 'left' ? 'cpu-animation-left' : 'cpu-animation-right'
                            }>
                                <Image src="/images/uno!.png" alt="UNO!" width={80} height={40} />
                            </div>
                        )}
                    </div>
                )
            })}

            {/* ── Centre Table ── */}
            <div className="center-area" style={{ paddingTop: '5rem' }}>

                {/* Score strip */}
                <div style={{
                    display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center',
                    marginBottom: '1rem',
                }}>
                    {players.map(p => (
                        <div key={p.id} style={{
                            padding: '0.35rem 0.9rem', borderRadius: '999px',
                            background: p.id === myPlayerId ? T.goldDim : T.surface,
                            border: `1px solid ${p.id === myPlayerId ? 'rgba(245,197,24,0.4)' : T.border}`,
                            color: p.id === myPlayerId ? T.gold : T.textMuted,
                            fontSize: T.fSm, fontWeight: p.id === myPlayerId ? 700 : 400,
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}>
                            {p.id === myPlayerId ? '👤' : '👥'}
                            <span>{p.name.replace(' (You)', '')}</span>
                            <span style={{ fontWeight: 700 }}>{p.score}</span>
                            <span style={{ color: T.textDim, fontSize: T.fXs }}>({p.hand.length})</span>
                        </div>
                    ))}
                </div>

                {/* Card area */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2.5rem' }}>
                    {/* Play pile */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: T.textMuted, fontSize: T.fXs, letterSpacing: '0.1em' }}>PLAY PILE</span>
                        <div style={{ position: 'relative' }}>
                            {topCard && (
                                <>
                                    <Image src={topCard.src} alt="play pile" width={120} height={180}
                                        style={{ borderRadius: 12, boxShadow: T.shadowCard, display: 'block' }} />
                                    {(topCard.value === 13 || topCard.value === 14) && topCard.color !== 'any' && (
                                        <div className={`wildcard-color-indicator ${getWildcardColorClass(topCard.color)}`}
                                            style={{
                                                position: 'absolute', bottom: 10, right: 10,
                                                width: 22, height: 22, borderRadius: '50%',
                                                border: '2.5px solid white', backgroundColor: topCard.color,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                                            }} />
                                    )}
                                </>
                            )}
                        </div>
                        {topCard && (
                            <span style={{ color: T.textMuted, fontSize: T.fXs, textAlign: 'center', maxWidth: 130 }}>
                                {topCard.playedByPlayer ? '👤' : '🤖'} {getCardName(topCard)}
                                {topCard.drawValue > 0 && ` (+${topCard.drawValue})`}
                            </span>
                        )}
                    </div>

                    {/* Draw pile */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: T.textMuted, fontSize: T.fXs, letterSpacing: '0.1em' }}>DRAW PILE</span>
                        <div onClick={handleDrawPileClick} style={{
                            cursor: isMyTurnNow && !colorPickerOpen && gameOn ? 'pointer' : 'not-allowed',
                            opacity: isMyTurnNow && !colorPickerOpen && gameOn ? 1 : 0.45,
                            transition: 'transform 0.15s, opacity 0.2s',
                            position: 'relative',
                        }}
                            onMouseEnter={e => { if (isMyTurnNow && !colorPickerOpen && gameOn) (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-6px) scale(1.04)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
                        >
                            <Image src="/images/back.png" alt="draw pile" width={120} height={180}
                                style={{ borderRadius: 12, boxShadow: T.shadowCard, display: 'block' }} />
                            {isMyTurnNow && !colorPickerOpen && gameOn && (
                                <div style={{
                                    position: 'absolute', inset: 0, borderRadius: 12,
                                    border: `2px solid rgba(245,197,24,0.6)`,
                                    boxShadow: '0 0 20px rgba(245,197,24,0.25)',
                                    pointerEvents: 'none',
                                }} />
                            )}
                        </div>
                        <span style={{ color: T.textMuted, fontSize: T.fXs }}>
                            {deckState.length} cards left
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Player Hand ── */}
            <div className="player-bottom" style={{ paddingBottom: '1rem' }}>
                {/* Player info bar */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '1rem',
                    padding: '0.6rem 1.4rem', borderRadius: T.rMd,
                    background: isMyTurnNow ? 'rgba(245,197,24,0.12)' : T.surface,
                    border: isMyTurnNow ? `1px solid rgba(245,197,24,0.4)` : `1px solid ${T.border}`,
                    marginBottom: '0.8rem', backdropFilter: 'blur(8px)',
                }}>
                    <span style={{ fontSize: T.fLg, fontWeight: 800, color: isMyTurnNow ? T.gold : T.text }}>
                        {isMyTurnNow && '🎯 '}{myPlayer?.name ?? 'YOU'}
                    </span>
                    <span style={{ color: T.textMuted, fontSize: T.fSm }}>
                        {myPlayer?.hand.length ?? 0} cards
                    </span>
                    <div style={{
                        padding: '0.2rem 0.7rem', borderRadius: '999px',
                        background: 'rgba(245,197,24,0.15)', color: T.gold,
                        fontSize: T.fSm, fontWeight: 700,
                    }}>{myPlayer?.score ?? 0} pts</div>
                </div>

                {/* Cards */}
                <div className="player-hand">
                    {(myPlayer?.hand ?? []).map((card, i) => {
                        const tc      = playPile[playPile.length - 1]
                        const playable = tc && (card.value === tc.value || card.color === tc.color || card.color === 'any' || tc.color === 'any')
                        const canAct   = isMyTurnNow && !colorPickerOpen && gameOn
                        return (
                            <Image key={i} src={card.src} alt={`card-${i}`}
                                width={80} height={120} className="player-card"
                                onClick={() => handlePlayerCardClick(i)}
                                style={{
                                    cursor:    canAct && playable ? 'pointer' : 'not-allowed',
                                    opacity:   canAct ? (playable ? 1 : 0.38) : 0.55,
                                    transform: canAct && playable ? 'translateY(-14px) scale(1.06)' : 'none',
                                    outline:   canAct && playable ? `3px solid rgba(245,197,24,0.75)` : 'none',
                                    outlineOffset: '2px',
                                    borderRadius: 8,
                                    filter:    canAct && playable ? 'drop-shadow(0 8px 16px rgba(245,197,24,0.35))' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                                    transition: 'transform 0.15s, opacity 0.15s, filter 0.15s',
                                }} />
                        )
                    })}
                </div>

                {showUno[myPlayerId] && (
                    <div className="player-animation">
                        <Image src="/images/uno!.png" alt="UNO!" width={100} height={50} />
                    </div>
                )}
            </div>

            {/* ── Colour Picker ── */}
            {colorPickerOpen && currentTurn === myPlayerId && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
                }}>
                    <div style={{
                        ...glassPanel({ padding: '2.5rem', textAlign: 'center', maxWidth: 380, width: '90%' }),
                        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
                    }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎨</div>
                        <h3 style={{ color: T.text, fontSize: T.fXl, fontWeight: 800, margin: '0 0 0.4rem' }}>
                            Choose a Colour
                        </h3>
                        <p style={{ color: T.textMuted, fontSize: T.fSm, marginBottom: '1.8rem' }}>
                            Pick the colour for your Wild card
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                            {[
                                { label: '🔴 Red',    color: 'rgb(255, 6, 0)',   bg: '#ef4444', shadow: 'rgba(239,68,68,0.45)'    },
                                { label: '🟢 Green',  color: 'rgb(0, 170, 69)',  bg: '#22c55e', shadow: 'rgba(34,197,94,0.45)'   },
                                { label: '🔵 Blue',   color: 'rgb(0, 150, 224)', bg: '#3b82f6', shadow: 'rgba(59,130,246,0.45)'  },
                                { label: '🟡 Yellow', color: 'rgb(255, 222, 0)', bg: '#eab308', shadow: 'rgba(234,179,8,0.45)'   },
                            ].map(c => (
                                <button key={c.label} onClick={() => handleColorChosen(c.color)}
                                    style={{
                                        padding: '1rem', borderRadius: T.rMd, border: 'none', cursor: 'pointer',
                                        background: c.bg, color: '#fff', fontSize: T.fLg, fontWeight: 800,
                                        boxShadow: `0 6px 20px ${c.shadow}`,
                                        transition: 'transform 0.12s, box-shadow 0.12s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.06)' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                                >{c.label}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Round Winner Banner ── */}
            {roundVisible && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                    pointerEvents: 'none',
                }}>
                    <div style={{
                        ...glassPanel({ padding: '2.5rem 4rem', textAlign: 'center' }),
                        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                        animation: 'fadeInScale 0.4s ease',
                    }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>🏆</div>
                        <h2 style={{ color: T.gold, fontSize: T.f2xl, fontWeight: 900, margin: '0 0 0.4rem' }}>
                            Round Over!
                        </h2>
                        <p style={{ color: T.text, fontSize: T.fXl, margin: 0 }}>
                            <strong>{roundWinner}</strong> won the round!
                        </p>
                    </div>
                </div>
            )}

            {/* ── Game Winner Modal ── */}
            {gameVisible && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
                }}>
                    <div style={{
                        ...glassPanel({ padding: '3rem', textAlign: 'center', maxWidth: 420, width: '90%' }),
                        boxShadow: '0 32px 100px rgba(0,0,0,0.65)',
                    }}>
                        <div style={{ fontSize: '4rem', marginBottom: '0.6rem' }}>
                            {gameWinner === 'You' ? '🎉' : '😔'}
                        </div>
                        <h2 style={{
                            fontSize: T.f3xl, fontWeight: 900, margin: '0 0 0.5rem',
                            background: gameWinner === 'You'
                                ? 'linear-gradient(135deg, #f5c518, #f97316)'
                                : 'linear-gradient(135deg, #94a3b8, #64748b)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            {gameWinner === 'You' ? 'You Win!' : 'Game Over'}
                        </h2>
                        <p style={{ color: T.textMuted, fontSize: T.fLg, marginBottom: '2rem' }}>
                            {gameWinner === 'You' ? 'Congratulations! 🎊' : `${gameWinner} won the game!`}
                        </p>

                        {/* Score table */}
                        <div style={{ marginBottom: '2rem' }}>
                            {players.sort((a, b) => b.score - a.score).map((p, i) => (
                                <div key={p.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '0.65rem 1rem', borderRadius: T.rSm, marginBottom: '0.4rem',
                                    background: i === 0 ? T.goldDim : T.surface,
                                    border: `1px solid ${i === 0 ? 'rgba(245,197,24,0.3)' : T.border}`,
                                }}>
                                    <span style={{ color: i === 0 ? T.gold : T.textMuted, fontSize: T.fSm }}>
                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '4️⃣'} {p.name.replace(' (You)', '')}
                                    </span>
                                    <span style={{ color: T.text, fontWeight: 700, fontSize: T.fMd }}>{p.score} pts</span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center' }}>
                            {(gameMode === 'ai' || isHost) && (
                                <button onClick={handlePlayAgain} style={{ ...btn('primary', { fontSize: T.fMd }) }}>
                                    🔄 Play Again
                                </button>
                            )}
                            <button onClick={() => {
                                setGameVisible(false)
                                if (gameMode === 'ai') {
                                    setRoundVisible(false); setRoundWinner(null); setGameWinner(null)
                                    setShowUno({}); setColorPickerOpen(false)
                                    setGameMode('menu'); gameModeRef.current = 'menu'
                                } else if (gameMode === 'multiplayer') {
                                    resetMultiplayerState(); setGameMode('menu'); gameModeRef.current = 'menu'
                                } else { setGameMode('menu'); gameModeRef.current = 'menu' }
                                setMpState('lobby')
                            }} style={{ ...btn('ghost', { fontSize: T.fMd }) }}>
                                🏠 Main Menu
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Keyframe styles injected inline */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.7; }
                }
                @keyframes fadeInScale {
                    from { opacity: 0; transform: scale(0.88); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </main>
    )
}
