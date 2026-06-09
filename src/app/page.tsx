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
            shuffle: new Audio('/audio/shuffle.wav'),
            playCard: new Audio('/audio/playCardNew.wav'),
            playCard2: new Audio('/audio/playCard2.wav'),
            drawCard: new Audio('/audio/drawCard.wav'),
            winRound: new Audio('/audio/winRound.wav'),
            winGame: new Audio('/audio/winGame.wav'),
            lose: new Audio('/audio/lose.wav'),
            plusCard: new Audio('/audio/plusCard.wav'),
            uno: new Audio('/audio/uno.wav'),
            colorButton: new Audio('/audio/colorButton.wav'),
            playAgain: new Audio('/audio/playAgain.wav'),
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
const PUSHER_KEY = '4de6e91a5e72dd9096db'
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

// #region STYLES
const styles = {
    // Layout
    gameContainer: {
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #1a4a2e 0%, #0d2818 40%, #071510 100%)',
        position: 'relative' as const,
        overflow: 'hidden',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
    },
    // Table felt
    tableFelt: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '520px',
        height: '320px',
        background: 'radial-gradient(ellipse at center, #2d7a4f 0%, #1e5c38 60%, #164a2c 100%)',
        borderRadius: '50%',
        boxShadow: '0 0 0 8px #12391f, 0 0 0 12px #0d2818, 0 20px 60px rgba(0,0,0,0.8), inset 0 2px 20px rgba(255,255,255,0.05)',
        zIndex: 1,
    },
    // Decorative ring
    tableRing: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '560px',
        height: '360px',
        borderRadius: '50%',
        border: '3px solid rgba(255,215,0,0.15)',
        zIndex: 0,
        pointerEvents: 'none' as const,
    },
    // Center area
    centerArea: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: '12px',
        zIndex: 10,
    },
    // Cards row
    cardsRow: {
        display: 'flex',
        gap: '24px',
        alignItems: 'center',
    },
    // Card pile wrapper
    cardPileWrapper: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: '6px',
    },
    cardPileLabel: {
        fontSize: '0.65rem',
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
        fontWeight: '600',
    },
    // Top card
    topCardWrapper: {
        position: 'relative' as const,
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
        transition: 'transform 0.2s ease',
    },
    // Draw pile
    drawPileWrapper: {
        position: 'relative' as const,
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
    },
    drawPileCount: {
        position: 'absolute' as const,
        top: '-8px',
        right: '-8px',
        background: 'linear-gradient(135deg, #ff6b35, #f7931e)',
        color: 'white',
        borderRadius: '50%',
        width: '22px',
        height: '22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.65rem',
        fontWeight: 'bold',
        border: '2px solid rgba(255,255,255,0.3)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        zIndex: 5,
    },
    // Turn banner
    turnBanner: {
        padding: '6px 16px',
        borderRadius: '20px',
        fontSize: '0.75rem',
        fontWeight: '700',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const,
    },
    // Direction pill
    directionPill: {
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,215,0,0.3)',
        borderRadius: '12px',
        padding: '3px 10px',
        fontSize: '0.65rem',
        color: 'rgba(255,215,0,0.8)',
        letterSpacing: '0.05em',
    },
    // Score bar
    scoreBar: {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        height: '48px',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 100,
        gap: '8px',
    },
    scoreItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '8px',
        fontSize: '0.75rem',
        whiteSpace: 'nowrap' as const,
    },
    // Player bottom
    playerBottom: {
        position: 'fixed' as const,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        paddingBottom: '12px',
    },
    playerNameTag: {
        marginBottom: '6px',
        padding: '4px 16px',
        borderRadius: '20px',
        fontSize: '0.7rem',
        fontWeight: '700',
        letterSpacing: '0.1em',
        textTransform: 'uppercase' as const,
    },
    playerHand: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        padding: '0 8px',
        overflowX: 'auto' as const,
        maxWidth: '100vw',
        gap: '-8px',
    },
    // CPU players
    cpuTop: {
        position: 'fixed' as const,
        top: '56px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: '6px',
        zIndex: 20,
    },
    cpuLeft: {
        position: 'fixed' as const,
        left: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: '6px',
        zIndex: 20,
    },
    cpuRight: {
        position: 'fixed' as const,
        right: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: '6px',
        zIndex: 20,
    },
    cpuNameTag: {
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '0.65rem',
        fontWeight: '700',
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const,
        transition: 'all 0.3s ease',
    },
    cpuHandHorizontal: {
        display: 'flex',
        justifyContent: 'center',
    },
    cpuHandVertical: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
    },
    // Modals
    modalOverlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
    },
    modalCard: {
        background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px',
        padding: '2.5rem',
        textAlign: 'center' as const,
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
        maxWidth: '400px',
        width: '90%',
    },
    // Color picker
    colorPickerOverlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
    },
    colorPickerCard: {
        background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
        border: '1px solid rgba(255,215,0,0.3)',
        borderRadius: '24px',
        padding: '2rem',
        textAlign: 'center' as const,
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
    },
    colorGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginTop: '1.2rem',
    },
    colorBtn: {
        padding: '14px 28px',
        borderRadius: '14px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '1rem',
        fontWeight: '700',
        letterSpacing: '0.05em',
        transition: 'all 0.15s ease',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    },
    // Menu
    menuWrapper: {
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #1a4a2e 0%, #0d2818 40%, #071510 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
    },
    menuCard: {
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(20px)',
        borderRadius: '28px',
        padding: '3rem 3.5rem',
        textAlign: 'center' as const,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
        maxWidth: '420px',
        width: '90%',
    },
    menuBtn: {
        width: '100%',
        padding: '1rem 2rem',
        borderRadius: '14px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '1.05rem',
        fontWeight: '700',
        letterSpacing: '0.05em',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
    },
    // Lobby
    lobbyWrapper: {
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #1a4a2e 0%, #0d2818 40%, #071510 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
    },
    lobbyCard: {
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '2rem',
        width: '100%',
        maxWidth: '460px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
    },
    input: {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.07)',
        color: 'white',
        fontSize: '0.95rem',
        outline: 'none',
        boxSizing: 'border-box' as const,
        transition: 'border-color 0.2s',
    },
    label: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: '0.8rem',
        fontWeight: '600',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        display: 'block',
        marginBottom: '6px',
    },
}
// #endregion

export default function UnoGame() {
    // #region STATE
    const [gameMode, setGameMode] = useState<GameMode>('menu')
    const [players, setPlayers] = useState<Player[]>([
        { id: 'player', hand: [], score: 0, position: 'bottom', name: 'YOU', isHuman: true },
        { id: 'cpu1', hand: [], score: 0, position: 'top', name: 'CPU TOP', isHuman: false },
        { id: 'cpu2', hand: [], score: 0, position: 'left', name: 'CPU LEFT', isHuman: false },
        { id: 'cpu3', hand: [], score: 0, position: 'right', name: 'CPU RIGHT', isHuman: false },
    ])
    const [deckState, setDeckState] = useState<CardType[]>([])
    const [playPile, setPlayPile] = useState<CardType[]>([])
    const [currentTurn, setCurrentTurn] = useState<Player['id']>('player')
    const [gameOn, setGameOn] = useState(false)
    const [colorPickerOpen, setColorPickerOpen] = useState(false)
    const [showUno, setShowUno] = useState<{ [key: string]: boolean }>({})
    const [roundVisible, setRoundVisible] = useState(false)
    const [roundWinner, setRoundWinner] = useState<string | null>(null)
    const [gameVisible, setGameVisible] = useState(false)
    const [gameWinner, setGameWinner] = useState<string | null>(null)
    const [wildCardColor, setWildCardColor] = useState<string>('')
    const [selectedWildColor, setSelectedWildColor] = useState<string>('')
    const [cpuVisible] = useState<{ [key: string]: boolean }>({ cpu1: false, cpu2: false, cpu3: false })
    const [direction, setDirection] = useState<'clockwise' | 'counter-clockwise'>('clockwise')
    // Multiplayer
    const [mpState, setMpState] = useState<MultiplayerState>('lobby')
    const [roomCode, setRoomCode] = useState('')
    const [inputRoomCode, setInputRoomCode] = useState('')
    const [myPlayerId, setMyPlayerId] = useState<Player['id']>('player')
    const [myPlayerName, setMyPlayerName] = useState('')
    const [mpPlayerCount, setMpPlayerCount] = useState(4)
    const [mpConnectedPlayers, setMpConnectedPlayers] = useState<{ id: string; name: string }[]>([])
    const [mpError, setMpError] = useState('')
    const [isHost, setIsHost] = useState(false)
    const [mpChannel, setMpChannel] = useState<PusherChannel | null>(null)
    const [playerOrderState, setPlayerOrderState] = useState<Player['id'][]>(AI_PLAYER_ORDER)
    // #endregion

    // #region REFS
    const gameOnRef = useRef(gameOn)
    const playersRef = useRef(players)
    const deckRef = useRef(deckState)
    const playPileRef = useRef(playPile)
    const currentTurnRef = useRef(currentTurn)
    const colorPickerRef = useRef(colorPickerOpen)
    const selectedWildColorRef = useRef(selectedWildColor)
    const directionRef = useRef(direction)
    const gameModeRef = useRef(gameMode)
    const myPlayerIdRef = useRef(myPlayerId)
    const myPlayerNameRef = useRef(myPlayerName)
    const roomCodeRef = useRef(roomCode)
    const playerOrderRef = useRef(playerOrderState)
    const mpConnectedRef = useRef(mpConnectedPlayers)
    const joiningRef = useRef(false)
    useEffect(() => { gameOnRef.current = gameOn }, [gameOn])
    useEffect(() => { playersRef.current = players }, [players])
    useEffect(() => { deckRef.current = deckState }, [deckState])
    useEffect(() => { playPileRef.current = playPile }, [playPile])
    useEffect(() => { currentTurnRef.current = currentTurn }, [currentTurn])
    useEffect(() => { colorPickerRef.current = colorPickerOpen }, [colorPickerOpen])
    useEffect(() => { selectedWildColorRef.current = selectedWildColor }, [selectedWildColor])
    useEffect(() => { directionRef.current = direction }, [direction])
    useEffect(() => { gameModeRef.current = gameMode }, [gameMode])
    useEffect(() => { myPlayerIdRef.current = myPlayerId }, [myPlayerId])
    useEffect(() => { myPlayerNameRef.current = myPlayerName }, [myPlayerName])
    useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
    useEffect(() => { playerOrderRef.current = playerOrderState }, [playerOrderState])
    useEffect(() => { mpConnectedRef.current = mpConnectedPlayers }, [mpConnectedPlayers])
    // #endregion

    // #region AUDIO INIT
    useEffect(() => { audioManager.init() }, [])
    // #endregion

    void wildCardColor
    void selectedWildColor
    void cpuVisible
    void mpPlayerCount

    // #region CLEANUP
    useEffect(() => {
        return () => {
            setRoundVisible(false); setRoundWinner(null)
            setGameVisible(false); setGameWinner(null)
            setShowUno({}); setColorPickerOpen(false)
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
                let newDeckForSimulation = [...deckRef.current]
                let newPlayPileForSimulation = [...playPileRef.current]
                if (newDeckForSimulation.length > 0) {
                    newDeckForSimulation.shift()
                } else if (newPlayPileForSimulation.length > 1) {
                    const toShuffle = newPlayPileForSimulation.slice(0, -1)
                    newDeckForSimulation = shuffleDeck(toShuffle)
                    newPlayPileForSimulation = [newPlayPileForSimulation[newPlayPileForSimulation.length - 1]]
                    newDeckForSimulation.shift()
                }
                const updatedPlayers = playersRef.current.map(p => {
                    if (p.id !== drawPlayerId) return p
                    const newHand: CardType[] = Array.from({ length: handCount }, () => ({
                        color: 'any', value: -1, points: 0, changeTurn: false,
                        drawValue: 0, src: '/images/back.png', playedByPlayer: false,
                    } as CardType))
                    return { ...p, hand: newHand }
                })
                setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
                setDeckState([...newDeckForSimulation]); deckRef.current = newDeckForSimulation
                setPlayPile([...newPlayPileForSimulation]); playPileRef.current = newPlayPileForSimulation
                audioManager.play('drawCard')
                break
            }
            case 'PLAY_CARD': {
                if (playerId === myPlayerIdRef.current) return
                const { card, playerHandCount, newDirection, nextTurn, colorChosen, drawAmount, drawTargetPlayer } = payload
                let updatedPlayPile = [...playPileRef.current]
                if (card) updatedPlayPile.push(card)
                setPlayPile([...updatedPlayPile]); playPileRef.current = updatedPlayPile
                const updatedPlayers = playersRef.current.map(p => {
                    if (p.id !== playerId) return p
                    const newHand: CardType[] = Array.from({ length: playerHandCount }, () => ({
                        color: 'any', value: -1, points: 0, changeTurn: false,
                        drawValue: 0, src: '/images/back.png', playedByPlayer: false,
                    } as CardType))
                    return { ...p, hand: newHand }
                })
                if (drawAmount && drawAmount > 0 && drawTargetPlayer) {
                    const drawPlayerIndex = updatedPlayers.findIndex(p => p.id === drawTargetPlayer)
                    if (drawPlayerIndex !== -1) {
                        const drawPlayer = { ...updatedPlayers[drawPlayerIndex], hand: [...updatedPlayers[drawPlayerIndex].hand] }
                        let updDeck = [...deckRef.current]; let updPile = [...updatedPlayPile]
                        for (let i = 0; i < drawAmount; i++) {
                            if (updDeck.length > 0) { drawPlayer.hand.push(updDeck.shift()!); audioManager.play('drawCard') }
                            else if (updPile.length > 1) {
                                updDeck = shuffleDeck(updPile.slice(0, -1)); updPile = [updPile[updPile.length - 1]]
                                drawPlayer.hand.push(updDeck.shift()!); audioManager.play('drawCard')
                            }
                        }
                        updatedPlayers[drawPlayerIndex] = drawPlayer
                        setDeckState([...updDeck]); deckRef.current = updDeck
                        setPlayPile([...updPile]); playPileRef.current = updPile
                    }
                }
                setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
                if (newDirection && newDirection !== directionRef.current) { setDirection(newDirection); directionRef.current = newDirection }
                if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
                if (colorChosen) {
                    setColorPickerOpen(true); colorPickerRef.current = true
                    setWildCardColor(colorChosen); setSelectedWildColor(colorChosen); selectedWildColorRef.current = colorChosen
                }
                if (playerHandCount === 1 && card && card.value !== 13) triggerUno(playerId)
                break
            }
            case 'DRAW_CARD': {
                if (playerId === myPlayerIdRef.current) return
                const { newHandCount, nextTurn } = payload
                const updatedPlayers = playersRef.current.map(p =>
                    p.id === playerId ? {
                        ...p, hand: Array.from({ length: newHandCount }, () => ({
                            color: 'any', value: -1, points: 0, changeTurn: false,
                            drawValue: 0, src: '/images/back.png', playedByPlayer: false,
                        } as CardType))
                    } : p
                )
                setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
                if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
                audioManager.play('drawCard')
                break
            }
            case 'COLOR_CHOSEN': {
                if (playerId === myPlayerIdRef.current) return
                const { color, nextTurn } = payload
                const updatedPile = [...playPileRef.current]
                const lastCard = updatedPile[updatedPile.length - 1]
                if (lastCard && lastCard.value === 13) updatedPile[updatedPile.length - 1] = { ...lastCard, color }
                setPlayPile([...updatedPile]); playPileRef.current = updatedPile
                setColorPickerOpen(false); colorPickerRef.current = false
                setWildCardColor(color); setSelectedWildColor(color); selectedWildColorRef.current = color
                if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
                break
            }
            case 'UNO_SHOUT': {
                if (playerId === myPlayerIdRef.current) return
                const { playerId: unoPlayerId } = payload
                triggerUno(unoPlayerId || playerId)
                break
            }
            case 'ROUND_WINNER': {
                if (playerId === myPlayerIdRef.current) return
                const { winnerId, winnerName, updatedPlayers } = payload
                setRoundWinner(winnerId === myPlayerIdRef.current ? 'You' : winnerName)
                setRoundVisible(true); setGameOn(false); gameOnRef.current = false
                if (updatedPlayers && Array.isArray(updatedPlayers)) {
                    const merged = playersRef.current.map(p => {
                        const info = updatedPlayers.find((up: any) => up.id === p.id)
                        if (!info) return p
                        return { ...p, score: info.score, name: p.id === myPlayerIdRef.current ? `${info.name} (You)` : info.name, hand: p.hand }
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
                if (finalScores && Array.isArray(finalScores)) {
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
                if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
                if (newDirection) { setDirection(newDirection); directionRef.current = newDirection }
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
            const myInfoIndex = playerInfo.findIndex((p: any) => p.name === myPlayerNameRef.current)
            if (myInfoIndex !== -1) {
                const correctId = playerOrder[myInfoIndex]
                setMyPlayerId(correctId); myPlayerIdRef.current = correctId; myIndex = myInfoIndex
            }
        }
        if (myIndex === -1) myIndex = 0
        const playerCount = playerOrder.length
        const playerPositions: { [key: string]: Player['position'] } = {}
        if (playerCount === 2) {
            playerPositions[playerOrder[myIndex]] = 'bottom'
            playerPositions[playerOrder[(myIndex + 1) % playerCount]] = 'top'
        } else if (playerCount === 3) {
            playerPositions[playerOrder[myIndex]] = 'bottom'
            playerPositions[playerOrder[(myIndex + 1) % playerCount]] = 'left'
            playerPositions[playerOrder[(myIndex + 2) % playerCount]] = 'right'
        } else {
            playerPositions[playerOrder[myIndex]] = 'bottom'
            playerPositions[playerOrder[(myIndex + 1) % playerCount]] = 'left'
            playerPositions[playerOrder[(myIndex + 2) % playerCount]] = 'top'
            playerPositions[playerOrder[(myIndex + 3) % playerCount]] = 'right'
        }
        const initializedPlayers: Player[] = playerInfo.map((info: any) => {
            const isMe = info.id === myPlayerIdRef.current
            const position = playerPositions[info.id] || (isMe ? 'bottom' : 'top')
            const displayName = isMe ? `${info.name} (You)` : info.name
            const hand = info.hand.map((cardData: any) =>
                new Card(cardData.color, cardData.value, cardData.points,
                    cardData.value === 0 || (cardData.value >= 1 && cardData.value <= 9),
                    cardData.drawValue, cardData.src)
            )
            return { id: info.id as Player['id'], hand, score: info.score || 0, position, name: displayName, isHuman: true }
        })
        let startCardObj: CardType = new Card('rgb(255, 6, 0)', 0, 0, true, 0, '/images/red0.png')
        if (startCard) {
            startCardObj = new Card(startCard.color, startCard.value, startCard.points,
                startCard.value === 0 || (startCard.value >= 1 && startCard.value <= 9),
                startCard.drawValue, startCard.src)
        }
        const newPlayPile = [startCardObj]
        let currentDeck = shuffleDeck(createDeck())
        const currentPlayers = [...initializedPlayers]
        if (drawAmount && drawAmount > 0 && drawPlayerId) {
            const dp = currentPlayers.find(p => p.id === drawPlayerId)
            if (dp) {
                for (let i = 0; i < drawAmount; i++) {
                    if (currentDeck.length > 0) dp.hand.push(currentDeck.shift()!)
                }
                audioManager.play('plusCard')
            }
        }
        setPlayers([...currentPlayers]); playersRef.current = [...currentPlayers]
        setDeckState([...currentDeck]); deckRef.current = currentDeck
        setPlayPile([...newPlayPile]); playPileRef.current = newPlayPile
        setCurrentTurn(firstTurn); currentTurnRef.current = firstTurn
        setDirection(startDirection || 'clockwise'); directionRef.current = startDirection || 'clockwise'
        setGameOn(true); gameOnRef.current = true
        setColorPickerOpen(false); colorPickerRef.current = false
        setMpState('playing')
        if (typeof document !== 'undefined') document.body.setAttribute('data-player-count', playerCount.toString())
        audioManager.play('shuffle')
        const isMyTurn = firstTurn === myPlayerIdRef.current
        setTimeout(() => { if (isMyTurn) alert("It's your turn! 🎮") }, 500)
    }, [])
    // #endregion

    // #region CHECK WINNER
    const checkForWinner = useCallback(async (currentPlayers?: Player[]) => {
        const cp = currentPlayers ?? playersRef.current
        const winner = cp.find(p => p.hand.length === 0)
        if (!winner) return false
        const updatedPlayers = cp.map(p => {
            if (p.id !== winner.id) return p
            const pts = cp.reduce((sum, pl) => pl.id !== winner.id ? sum + tallyPoints(pl.hand) : sum, 0)
            return { ...p, score: p.score + pts }
        })
        setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
        const gameWinnerPlayer = updatedPlayers.find(p => p.score >= GAME_OVER_SCORE)
        if (gameWinnerPlayer) {
            setGameOn(false); gameOnRef.current = false
            setGameWinner(gameWinnerPlayer.id === myPlayerIdRef.current ? 'You' : gameWinnerPlayer.name.replace(' (You)', ''))
            setGameVisible(true)
            audioManager.play(gameWinnerPlayer.id === myPlayerIdRef.current ? 'winGame' : 'lose')
            if (gameModeRef.current === 'multiplayer') {
                await broadcastAction('GAME_WINNER', {
                    winnerId: gameWinnerPlayer.id,
                    winnerName: gameWinnerPlayer.name.replace(' (You)', ''),
                    finalScores: updatedPlayers.map(p => ({ id: p.id, name: p.name.replace(' (You)', ''), score: p.score })),
                })
            }
        } else {
            setRoundWinner(winner.id === myPlayerIdRef.current ? 'You' : winner.name.replace(' (You)', ''))
            setRoundVisible(true); setGameOn(false); gameOnRef.current = false
            audioManager.play('winRound')
            if (gameModeRef.current === 'multiplayer') {
                await broadcastAction('ROUND_WINNER', {
                    winnerId: winner.id,
                    winnerName: winner.name.replace(' (You)', ''),
                    updatedPlayers: updatedPlayers.map(p => ({ id: p.id, score: p.score, handSize: p.hand.length, name: p.name.replace(' (You)', '') })),
                })
            }
            if (gameModeRef.current === 'ai') setTimeout(() => setRoundVisible(false), 3000)
        }
        return true
    }, [tallyPoints, broadcastAction])
    // #endregion

    // #region BIND CHANNEL EVENTS
    const bindChannelEvents = useCallback((channel: PusherChannel) => {
        channel.bind('game-action', (raw: unknown) => { applyGameAction(raw as GameAction) })
        channel.bind('game-started', (raw: unknown) => { initializeGameFromStart(raw as any) })
        channel.bind('player-joined', (raw: unknown) => {
            const data = raw as JoinPayload
            setMpConnectedPlayers(prev => {
                if (prev.find(p => p.id === data.playerId || p.name === data.playerName)) return prev
                return [...prev, { id: data.playerId, name: data.playerName }]
            })
        })
        channel.bind('player-left', (raw: unknown) => {
            const data = raw as { playerId: string; playerName?: string }
            setMpConnectedPlayers(prev => prev.filter(p => p.id !== data.playerId && p.name !== data.playerName))
            setMpError('')
        })
        channel.bind('slot-assigned', (raw: unknown) => {
            const data = raw as SlotPayload
            if (data.playerId && data.playerName === myPlayerNameRef.current) {
                setMyPlayerId(data.playerId); myPlayerIdRef.current = data.playerId
            }
            if (data.allPlayers) {
                const unique = Array.from(new Map(data.allPlayers.map(p => [p.name, p])).values())
                setMpConnectedPlayers(unique); mpConnectedRef.current = unique
            }
        })
        channel.bind('players-updated', (raw: unknown) => {
            const data = raw as { allPlayers: { id: string; name: string }[] }
            if (data.allPlayers) {
                const unique = Array.from(new Map(data.allPlayers.map(p => [p.name, p])).values())
                setMpConnectedPlayers(unique); mpConnectedRef.current = unique
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
            const initialConnected = [{ id: hostId, name: myPlayerName }]
            setMpConnectedPlayers(initialConnected); mpConnectedRef.current = initialConnected
            bindChannelEvents(channel)
            setMpState('waiting'); setMpError('')
        } catch (error) {
            console.error('Error creating room:', error)
            setMpError('Failed to create room. Please try again.')
        } finally {
            setTimeout(() => { joiningRef.current = false }, 1000)
        }
    }, [myPlayerName, bindChannelEvents])
    // #endregion

    // #region JOIN ROOM
    const joinRoom = useCallback(async () => {
        if (!myPlayerName.trim()) { setMpError('Please enter your name'); return }
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
            setMpConnectedPlayers(prev => {
                if (prev.find(p => p.name === myPlayerName)) return prev
                return [...prev, { id: tempId, name: myPlayerName }]
            })
            await pusherTrigger(`uno-room-${code}`, 'player-joined', { playerId: tempId, playerName: myPlayerName, requestSlot: true })
            setMpState('waiting'); setMpError('')
        } catch (error) {
            console.error('Error joining room:', error)
            setMpError('Failed to join room. Please try again.')
        } finally {
            setTimeout(() => { joiningRef.current = false }, 1000)
        }
    }, [myPlayerName, inputRoomCode, bindChannelEvents])
    // #endregion

    // #region HOST ASSIGNS SLOT
    useEffect(() => {
        if (!isHost || !mpChannel || gameMode !== 'multiplayer') return
        const availableSlots: Player['id'][] = ['player', 'p2', 'p3', 'p4']
        const assignedSlots: string[] = ['player']
        const pendingJoins = new Set<string>()
        const handlePlayerJoined = async (raw: unknown) => {
            const data = raw as JoinPayload
            if (!data.requestSlot) return
            if (pendingJoins.has(data.playerId)) return
            pendingJoins.add(data.playerId)
            try {
                if (mpConnectedRef.current.find(p => p.name === data.playerName)) return
                const nextSlot = availableSlots.find(s => !assignedSlots.includes(s))
                if (!nextSlot) { setMpError('Room is full!'); return }
                assignedSlots.push(nextSlot)
                const newConnected = [...mpConnectedRef.current]
                if (!newConnected.find(p => p.name === data.playerName)) {
                    newConnected.push({ id: nextSlot, name: data.playerName })
                    setMpConnectedPlayers(newConnected); mpConnectedRef.current = newConnected
                }
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'slot-assigned', { playerId: nextSlot, playerName: data.playerName, allPlayers: newConnected })
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'players-updated', { allPlayers: newConnected })
            } finally { pendingJoins.delete(data.playerId) }
        }
        mpChannel.bind('player-joined', handlePlayerJoined)
        mpChannel.bind('players-updated', (raw: unknown) => {
            const data = raw as { allPlayers: { id: string; name: string }[] }
            if (data.allPlayers) {
                const unique = Array.from(new Map(data.allPlayers.map(p => [p.name, p])).values())
                setMpConnectedPlayers(unique); mpConnectedRef.current = unique
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
        for (let i = 0; i < 7; i++)
            for (let j = 0; j < newPlayers.length; j++)
                if (newDeck.length > 0) newPlayers[j].hand.push(newDeck.shift()!)
        let startCardIndex = -1; let startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].value >= 0 && newDeck[i].value <= 9 && newDeck[i].color !== 'any') {
                startCardIndex = i; startCard = newDeck[i]; break
            }
        }
        if (startCardIndex === -1)
            for (let i = 0; i < newDeck.length; i++)
                if (newDeck[i].color !== 'any') { startCardIndex = i; startCard = newDeck[i]; break }
        if (startCardIndex !== -1 && startCard) newDeck.splice(startCardIndex, 1)
        else if (newDeck.length > 0) startCard = newDeck.shift()!
        const firstPlayerIndex = Math.floor(Math.random() * playerOrder.length)
        let firstPlayer = playerOrder[firstPlayerIndex]
        let drawAmount = 0; let drawPlayerId: Player['id'] | null = null
        if (startCard?.value === 12) {
            drawAmount = 2; audioManager.play('plusCard')
            const ni = (firstPlayerIndex + 1) % playerOrder.length; drawPlayerId = playerOrder[ni]
            const dp = newPlayers.find(p => p.id === drawPlayerId)
            if (dp) for (let i = 0; i < 2; i++) if (newDeck.length > 0) dp.hand.push(newDeck.shift()!)
            firstPlayer = drawPlayerId
        } else if (startCard?.value === 14) {
            drawAmount = 4; audioManager.play('plusCard')
            const ni = (firstPlayerIndex + 1) % playerOrder.length; drawPlayerId = playerOrder[ni]
            const dp = newPlayers.find(p => p.id === drawPlayerId)
            if (dp) for (let i = 0; i < 4; i++) if (newDeck.length > 0) dp.hand.push(newDeck.shift()!)
            const cols = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            if (startCard) startCard.color = cols[Math.floor(Math.random() * cols.length)]
            firstPlayer = drawPlayerId
        } else if (startCard?.value === 11) {
            firstPlayer = playerOrder[(firstPlayerIndex + 1) % playerOrder.length]
        }
        setPlayers([...newPlayers]); playersRef.current = [...newPlayers]
        setDeckState([...newDeck]); deckRef.current = newDeck
        setPlayPile(startCard ? [startCard] : []); playPileRef.current = startCard ? [startCard] : []
        setCurrentTurn(firstPlayer); currentTurnRef.current = firstPlayer
        setDirection('clockwise'); directionRef.current = 'clockwise'
        setPlayerOrderState(playerOrder); playerOrderRef.current = playerOrder
        setGameOn(true); gameOnRef.current = true
        setColorPickerOpen(false); colorPickerRef.current = false
        setMpState('playing'); audioManager.play('shuffle')
        await pusherTrigger(`uno-room-${roomCode}`, 'game-started', {
            playerOrder, startCard: startCard ? { color: startCard.color, value: startCard.value, points: startCard.points, drawValue: startCard.drawValue, src: startCard.src } : null,
            players: newPlayers.map(p => ({ id: p.id, name: p.name, score: p.score, hand: p.hand.map(c => ({ color: c.color, value: c.value, points: c.points, changeTurn: c.changeTurn, drawValue: c.drawValue, src: c.src, playedByPlayer: c.playedByPlayer })) })),
            firstTurn: firstPlayer, direction: 'clockwise', drawAmount, drawPlayerId,
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
        setMpState('lobby'); setMpConnectedPlayers([]); setMpError('')
        setRoomCode(''); roomCodeRef.current = ''
        if (mpChannel) { try { mpChannel.unbind_all() } catch (e) { console.error(e) } setMpChannel(null) }
    }, [mpChannel])
    // #endregion

    // #region NEW AI GAME
    const newAIGame = useCallback((existingScores?: { [key: string]: number }) => {
        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
        setShowUno({}); setColorPickerOpen(false); setWildCardColor(''); setSelectedWildColor('')
        setGameOn(true); gameOnRef.current = true
        setDirection('clockwise'); directionRef.current = 'clockwise'
        setPlayerOrderState(AI_PLAYER_ORDER); playerOrderRef.current = AI_PLAYER_ORDER
        setMyPlayerId('player'); myPlayerIdRef.current = 'player'
        let newDeck = shuffleDeck(createDeck())
        audioManager.play('shuffle')
        const newPlayers: Player[] = [
            { id: 'player', hand: [], score: existingScores?.player ?? 0, position: 'bottom', name: 'YOU', isHuman: true },
            { id: 'cpu1', hand: [], score: existingScores?.cpu1 ?? 0, position: 'top', name: 'CPU TOP', isHuman: false },
            { id: 'cpu2', hand: [], score: existingScores?.cpu2 ?? 0, position: 'left', name: 'CPU LEFT', isHuman: false },
            { id: 'cpu3', hand: [], score: existingScores?.cpu3 ?? 0, position: 'right', name: 'CPU RIGHT', isHuman: false },
        ]
        for (let i = 0; i < 7; i++)
            for (let j = 0; j < newPlayers.length; j++)
                newPlayers[j].hand.push(newDeck.shift()!)
        let startCardIndex = -1; let startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].value >= 0 && newDeck[i].value <= 9 && newDeck[i].color !== 'any') {
                startCardIndex = i; startCard = newDeck[i]; break
            }
        }
        if (startCardIndex === -1)
            for (let i = 0; i < newDeck.length; i++)
                if (newDeck[i].color !== 'any') { startCardIndex = i; startCard = newDeck[i]; break }
        if (startCardIndex !== -1 && startCard) newDeck.splice(startCardIndex, 1)
        else if (newDeck.length > 0) startCard = newDeck.shift()!
        if (startCard?.value === 12) {
            const nextPlayer = newPlayers.find(p => p.id === 'cpu1')
            if (nextPlayer && newDeck.length >= 2) { nextPlayer.hand.push(newDeck.shift()!); nextPlayer.hand.push(newDeck.shift()!) }
            audioManager.play('plusCard')
        } else if (startCard?.value === 14) {
            const nextPlayer = newPlayers.find(p => p.id === 'cpu1')
            if (nextPlayer && newDeck.length >= 4) { for (let i = 0; i < 4; i++) nextPlayer.hand.push(newDeck.shift()!) }
            const cols = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            if (startCard) startCard.color = cols[Math.floor(Math.random() * cols.length)]
            audioManager.play('plusCard')
        } else if (startCard?.value === 11) {
            if (startCard) startCard.playedByPlayer = true
        }
        setPlayers([...newPlayers]); playersRef.current = [...newPlayers]
        setDeckState([...newDeck]); deckRef.current = newDeck
        setPlayPile(startCard ? [startCard] : []); playPileRef.current = startCard ? [startCard] : []
        setCurrentTurn('player'); currentTurnRef.current = 'player'
        setColorPickerOpen(false); colorPickerRef.current = false
        setTimeout(() => { setRoundVisible(false); setGameVisible(false) }, 100)
    }, [])
    // #endregion

    // #region CPU LOGIC
    const playCPU = useCallback(async (cpuId: Player['id']) => {
        if (currentTurnRef.current !== cpuId) return
        if (!gameOnRef.current) return
        if (colorPickerRef.current) return
        if (gameModeRef.current !== 'ai') return
        await new Promise(resolve => setTimeout(resolve, getCpuDelay()))
        if (currentTurnRef.current !== cpuId || !gameOnRef.current) return
        const order = playerOrderRef.current
        const cpu = playersRef.current.find(p => p.id === cpuId)
        if (!cpu) return
        const currentPlayPile = [...playPileRef.current]
        const currentDeck = [...deckRef.current]
        const topCard = currentPlayPile[currentPlayPile.length - 1]
        const currentDir = directionRef.current
        const playable: CardType[] = []; const remaining: CardType[] = []
        for (const card of cpu.hand) {
            const canPlay = card.color === topCard.color || card.value === topCard.value || card.color === 'any' || topCard.color === 'any'
            canPlay ? playable.push(card) : remaining.push(card)
        }
        if (playable.length === 0) {
            let newDeck = [...currentDeck]; let newPlayPile = [...currentPlayPile]; const newHand = [...cpu.hand]
            if (newDeck.length > 0) { newHand.push(newDeck.shift()!) }
            else if (newPlayPile.length > 1) {
                newDeck = shuffleDeck(newPlayPile.slice(0, -1)); newPlayPile = [newPlayPile[newPlayPile.length - 1]]
                newHand.push(newDeck.shift()!)
            }
            audioManager.play('drawCard')
            const updated = playersRef.current.map(p => p.id === cpuId ? { ...p, hand: newHand } : p)
            setPlayers([...updated]); playersRef.current = [...updated]
            setDeckState([...newDeck]); deckRef.current = newDeck
            setPlayPile([...newPlayPile]); playPileRef.current = newPlayPile
            const next = getNextTurn(cpuId, currentDir, order)
            setCurrentTurn(next); currentTurnRef.current = next
            return
        }
        const chosenCard = playable[0]
        const leftover = [...remaining, ...playable.slice(1)]
        audioManager.playCardSound()
        const newPlayPile = [...currentPlayPile, { ...chosenCard, playedByPlayer: false }]
        const newCpuHand = [...leftover]
        let newDir = currentDir; let nextTurn: Player['id']
        if (chosenCard.value === 10) {
            newDir = currentDir === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDir); directionRef.current = newDir
            nextTurn = getNextTurn(cpuId, newDir, order)
        } else if (chosenCard.value === 11) {
            const skipped = getNextTurn(cpuId, newDir, order)
            nextTurn = getNextTurn(skipped, newDir, order)
        } else if (chosenCard.drawValue > 0) {
            audioManager.play('plusCard')
            const drawTarget = getNextTurn(cpuId, newDir, order)
            const drawIdx = playersRef.current.findIndex(p => p.id === drawTarget)
            if (drawIdx !== -1) {
                const drawPlayer = { ...playersRef.current[drawIdx], hand: [...playersRef.current[drawIdx].hand] }
                let updDeck = [...currentDeck]; let updPile = [...newPlayPile]
                for (let i = 0; i < chosenCard.drawValue; i++) {
                    if (updDeck.length > 0) { drawPlayer.hand.push(updDeck.shift()!); audioManager.play('drawCard') }
                    else if (updPile.length > 1) {
                        updDeck = shuffleDeck(updPile.slice(0, -1)); updPile = [updPile[updPile.length - 1]]
                        drawPlayer.hand.push(updDeck.shift()!); audioManager.play('drawCard')
                    }
                }
                const updatedPlayers = playersRef.current.map((p, i) => i === drawIdx ? { ...p, hand: drawPlayer.hand } : p)
                setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
                setDeckState([...updDeck]); deckRef.current = updDeck
                setPlayPile([...updPile]); playPileRef.current = updPile
            }
            nextTurn = drawTarget
        } else {
            nextTurn = getNextTurn(cpuId, newDir, order)
        }
        if (chosenCard.color === 'any' && chosenCard.value === 13) {
            const cols = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            newPlayPile[newPlayPile.length - 1].color = cols[Math.floor(Math.random() * cols.length)]
        }
        const updated = playersRef.current.map(p => p.id === cpuId ? { ...p, hand: newCpuHand } : p)
        setPlayers([...updated]); playersRef.current = [...updated]
        setPlayPile([...newPlayPile]); playPileRef.current = newPlayPile
        if (newCpuHand.length === 1) triggerUno(cpuId)
        if (newCpuHand.length === 0) { await checkForWinner(); return }
        setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn
    }, [triggerUno, checkForWinner, getCpuDelay, getNextTurn])
    // #endregion

    // #region DRAW PILE CLICK
    const handleDrawPileClick = useCallback(async () => {
        if (currentTurnRef.current !== myPlayerIdRef.current) return
        if (colorPickerRef.current) return
        if (!gameOnRef.current) return
        const order = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)
        if (!player) return
        let newDeck = [...deckRef.current]; let newPlayPile = [...playPileRef.current]
        const newHand = [...player.hand]; let drawnCard: CardType | null = null
        const currentDir = directionRef.current
        if (newDeck.length > 0) { drawnCard = newDeck.shift()!; newHand.push(drawnCard) }
        else if (newPlayPile.length > 1) {
            const toShuffle = newPlayPile.slice(0, -1)
            newDeck = shuffleDeck(toShuffle); newPlayPile = [newPlayPile[newPlayPile.length - 1]]
            drawnCard = newDeck.shift()!; newHand.push(drawnCard)
        } else { return }
        audioManager.play('drawCard')
        const updatedPlayers = playersRef.current.map(p => p.id === myPlayerIdRef.current ? { ...p, hand: [...newHand] } : p)
        setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
        setDeckState([...newDeck]); deckRef.current = newDeck
        setPlayPile([...newPlayPile]); playPileRef.current = newPlayPile
        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('DRAW_CARD_UPDATE', { playerId: myPlayerIdRef.current, handCount: newHand.length })
        }
        if (drawnCard) {
            const topCard = newPlayPile[newPlayPile.length - 1]
            const canPlay = drawnCard.color === topCard.color || drawnCard.value === topCard.value || drawnCard.color === 'any' || topCard.color === 'any'
            if (canPlay) return
        }
        const nextTurn = getNextTurn(myPlayerIdRef.current, currentDir, order)
        setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn
        if (gameModeRef.current === 'multiplayer') await broadcastAction('TURN_CHANGE', { nextTurn })
    }, [getNextTurn, broadcastAction])
    // #endregion

    // #region PLAYER CARD CLICK
    const handlePlayerCardClick = useCallback(async (index: number) => {
        if (currentTurnRef.current !== myPlayerIdRef.current) return
        if (colorPickerRef.current) return
        if (!gameOnRef.current) return
        const order = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)
        if (!player) return
        const currentPlayPile = [...playPileRef.current]
        const topCard = currentPlayPile[currentPlayPile.length - 1]
        const card = player.hand[index]
        const currentDir = directionRef.current
        const isPlayable = card.value === topCard.value || card.color === topCard.color || card.color === 'any' || topCard.color === 'any'
        if (!isPlayable) return
        audioManager.playCardSound()
        const newPlayerHand = player.hand.filter((_, i) => i !== index)
        const playedCard = { ...card, playedByPlayer: true }
        const newPlayPile = [...currentPlayPile, playedCard]
        let newDir = currentDir
        if (playedCard.value === 10) { newDir = currentDir === 'clockwise' ? 'counter-clockwise' : 'clockwise'; setDirection(newDir); directionRef.current = newDir }
        let updatedPlayers = playersRef.current.map(p => p.id === myPlayerIdRef.current ? { ...p, hand: newPlayerHand } : p)
        let nextTurn: Player['id'] | null = null; let drawnTargetPlayer: Player['id'] | null = null
        if (playedCard.drawValue > 0) { audioManager.play('plusCard'); drawnTargetPlayer = getNextTurn(myPlayerIdRef.current, newDir, order); nextTurn = drawnTargetPlayer }
        else if (playedCard.value === 11) { const skipped = getNextTurn(myPlayerIdRef.current, newDir, order); nextTurn = getNextTurn(skipped, newDir, order) }
        setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
        setPlayPile([...newPlayPile]); playPileRef.current = newPlayPile
        if (newPlayerHand.length === 1) {
            triggerUno(myPlayerIdRef.current)
            if (gameModeRef.current === 'multiplayer') await broadcastAction('UNO_SHOUT', { playerId: myPlayerIdRef.current })
        }
        if (newPlayerHand.length === 0) { await checkForWinner(updatedPlayers); return }
        if (playedCard.color === 'any' && playedCard.value === 13) {
            if (gameModeRef.current === 'multiplayer') {
                await broadcastAction('PLAY_CARD', { card: playedCard, playerHandCount: newPlayerHand.length, cardIndex: index, newDirection: newDir !== currentDir ? newDir : null, nextTurn: null, drawAmount: playedCard.drawValue, drawTargetPlayer: drawnTargetPlayer, colorChosen: true })
            }
            setColorPickerOpen(true); colorPickerRef.current = true
            return
        }
        if (!playedCard.drawValue && playedCard.value !== 11 && !nextTurn) nextTurn = getNextTurn(myPlayerIdRef.current, newDir, order)
        if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('PLAY_CARD', { card: playedCard, playerHandCount: newPlayerHand.length, cardIndex: index, newDirection: newDir !== currentDir ? newDir : null, nextTurn, drawAmount: playedCard.drawValue, drawTargetPlayer: drawnTargetPlayer })
        }
    }, [triggerUno, checkForWinner, getNextTurn, broadcastAction])
    // #endregion

    // #region COLOR CHOSEN
    const handleColorChosen = useCallback(async (color: string) => {
        audioManager.play('colorButton')
        const order = playerOrderRef.current
        const newPile = [...playPileRef.current]
        const lastCard = newPile[newPile.length - 1]
        if (lastCard && lastCard.value === 13) newPile[newPile.length - 1] = { ...lastCard, color }
        setPlayPile([...newPile]); playPileRef.current = newPile
        setColorPickerOpen(false); colorPickerRef.current = false
        setWildCardColor(color); setSelectedWildColor(color); selectedWildColorRef.current = color
        const nextTurn = getNextTurn(myPlayerIdRef.current, directionRef.current, order)
        setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn
        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('COLOR_CHOSEN', { color, nextTurn })
            await broadcastAction('TURN_CHANGE', { nextTurn })
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

    // #region DERIVED
    const topCard = playPile[playPile.length - 1]
    const myPlayer = players.find(p => p.id === myPlayerId)
    const otherPlayers = players.filter(p => p.id !== myPlayerId)

    const getCardName = (card: CardType) => {
        if (card.color === 'any') return card.drawValue === 4 ? 'Wild Draw 4' : 'Wild Card'
        const colorNames: Record<string, string> = {
            'rgb(255, 6, 0)': 'Red', 'rgb(0, 170, 69)': 'Green',
            'rgb(0, 150, 224)': 'Blue', 'rgb(255, 222, 0)': 'Yellow',
        }
        const valueNames: Record<number, string> = { 10: 'Reverse', 11: 'Skip', 12: 'Draw 2', 13: 'Wild', 14: 'Wild Draw 4' }
        return `${colorNames[card.color] ?? card.color} ${valueNames[card.value] ?? card.value}`
    }

    const getCardBorderColor = (card: CardType) => {
        if (card.color === 'rgb(255, 6, 0)') return '#ff4444'
        if (card.color === 'rgb(0, 170, 69)') return '#44cc66'
        if (card.color === 'rgb(0, 150, 224)') return '#44aaff'
        if (card.color === 'rgb(255, 222, 0)') return '#ffdd44'
        return 'rgba(255,255,255,0.3)'
    }

    const isMyTurnNow = currentTurn === myPlayerId && !colorPickerOpen && gameOn
    // #endregion

    // #region HAND CARD DATA ATTRIBUTE
    useEffect(() => {
        const playerHandContainer = document.querySelector('.player-hand')
        if (playerHandContainer && myPlayer) {
            playerHandContainer.setAttribute('data-card-count', myPlayer.hand.length.toString())
        }
    }, [myPlayer?.hand.length])
    // #endregion

    // #region MENU
    if (gameMode === 'menu') {
        return (
            <div style={styles.menuWrapper}>
                {/* Animated background dots */}
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                    {[...Array(6)].map((_, i) => (
                        <div key={i} style={{
                            position: 'absolute',
                            width: `${80 + i * 40}px`, height: `${80 + i * 40}px`,
                            borderRadius: '50%',
                            border: '1px solid rgba(255,215,0,0.06)',
                            top: `${10 + i * 12}%`, left: `${5 + i * 15}%`,
                        }} />
                    ))}
                </div>
                <div style={styles.menuCard}>
                    {/* Logo */}
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: '80px', height: '80px', borderRadius: '20px',
                            background: 'linear-gradient(135deg, #ff4444, #cc0000)',
                            boxShadow: '0 8px 24px rgba(255,68,68,0.4)',
                            marginBottom: '1rem',
                            fontSize: '2.5rem',
                        }}>🃏</div>
                        <h1 style={{
                            fontSize: '3.5rem', fontWeight: '900', color: 'white',
                            margin: 0, letterSpacing: '-0.02em',
                        }}>
                            <span style={{ color: '#ff4444' }}>U</span>
                            <span style={{ color: '#44cc66' }}>N</span>
                            <span style={{ color: '#44aaff' }}>O</span>
                        </h1>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '0.4rem', letterSpacing: '0.15em' }}>
                            CARD GAME
                        </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button
                            onClick={() => { setGameMode('ai'); gameModeRef.current = 'ai'; newAIGame() }}
                            style={{
                                ...styles.menuBtn,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                color: 'white',
                                boxShadow: '0 4px 20px rgba(34,197,94,0.35)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                        >
                            <span style={{ fontSize: '1.3rem' }}>🤖</span>
                            <span>Play vs AI</span>
                        </button>
                        <button
                            onClick={() => { setGameMode('multiplayer'); gameModeRef.current = 'multiplayer' }}
                            style={{
                                ...styles.menuBtn,
                                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                color: 'white',
                                boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                        >
                            <span style={{ fontSize: '1.3rem' }}>🌐</span>
                            <span>Multiplayer</span>
                        </button>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem', marginTop: '2rem', letterSpacing: '0.1em' }}>
                        FIRST TO 100 POINTS WINS
                    </p>
                </div>
            </div>
        )
    }
    // #endregion

    // #region MULTIPLAYER LOBBY
    if (gameMode === 'multiplayer' && mpState !== 'playing') {
        return (
            <div style={styles.lobbyWrapper}>
                <div style={styles.lobbyCard}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                        <button
                            onClick={() => {
                                if (roomCode && myPlayerIdRef.current)
                                    pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
                                setGameMode('menu'); setMpState('lobby'); setMpError(''); setMpConnectedPlayers([]); setRoomCode('')
                                setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
                            }}
                            style={{
                                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                                color: 'rgba(255,255,255,0.6)', padding: '6px 12px', borderRadius: '8px',
                                cursor: 'pointer', fontSize: '0.85rem',
                            }}
                        >← Back</button>
                        <h2 style={{ color: 'white', fontSize: '1.3rem', fontWeight: '700', margin: 0, flex: 1 }}>
                            {mpState === 'lobby' ? '🌐 Multiplayer' : `🏠 Room: ${roomCode}`}
                        </h2>
                    </div>

                    {mpState === 'lobby' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>Your Name</label>
                                <input type="text" value={myPlayerName}
                                    onChange={e => setMyPlayerName(e.target.value)}
                                    placeholder="Enter your name…" maxLength={16}
                                    style={styles.input}
                                    onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.6)')}
                                    onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
                                />
                            </div>
                            <button onClick={createRoom} disabled={joiningRef.current}
                                style={{
                                    ...styles.menuBtn,
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: 'white', opacity: joiningRef.current ? 0.6 : 1,
                                    cursor: joiningRef.current ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
                                }}>
                                {joiningRef.current ? '⏳ Creating...' : '🏠 Create Room'}
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem' }}>
                                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                OR
                                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                            </div>
                            <div>
                                <label style={styles.label}>Join with Room Code</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input type="text" value={inputRoomCode}
                                        onChange={e => setInputRoomCode(e.target.value.toUpperCase())}
                                        placeholder="ABC123" maxLength={6}
                                        style={{ ...styles.input, letterSpacing: '0.2em', textAlign: 'center', width: 'auto', flex: 1 }}
                                        onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.6)')}
                                        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.15)')}
                                    />
                                    <button onClick={joinRoom} disabled={joiningRef.current}
                                        style={{
                                            padding: '0.75rem 1.2rem', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                            color: 'white', border: 'none', borderRadius: '10px',
                                            cursor: joiningRef.current ? 'not-allowed' : 'pointer',
                                            opacity: joiningRef.current ? 0.6 : 1,
                                            fontWeight: '700', fontSize: '0.9rem', whiteSpace: 'nowrap',
                                        }}>
                                        {joiningRef.current ? '⏳' : 'Join →'}
                                    </button>
                                </div>
                            </div>
                            {mpError && (
                                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', color: '#f87171', fontSize: '0.85rem' }}>
                                    ⚠️ {mpError}
                                </div>
                            )}
                        </div>
                    )}

                    {mpState === 'waiting' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Room code display */}
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,215,0,0.04))',
                                border: '1px solid rgba(255,215,0,0.25)', borderRadius: '16px',
                                padding: '1.2rem', textAlign: 'center', marginBottom: '4px',
                            }}>
                                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', letterSpacing: '0.15em', margin: '0 0 6px' }}>ROOM CODE</p>
                                <p style={{ fontSize: '2.5rem', fontWeight: '900', color: '#ffd700', letterSpacing: '0.4em', fontFamily: 'monospace', margin: 0 }}>{roomCode}</p>
                                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '6px' }}>Share with friends</p>
                            </div>
                            {/* Players */}
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', letterSpacing: '0.1em', margin: 0 }}>
                                PLAYERS ({mpConnectedPlayers.length}/4)
                            </p>
                            {mpConnectedPlayers.map((p, i) => (
                                <div key={p.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 14px', background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
                                }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                                    <span style={{ color: 'white', fontWeight: '600', flex: 1 }}>{p.name}</span>
                                    {i === 0 && isHost && (
                                        <span style={{ color: '#ffd700', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em', background: 'rgba(255,215,0,0.1)', padding: '2px 8px', borderRadius: '6px' }}>HOST</span>
                                    )}
                                </div>
                            ))}
                            {Array.from({ length: Math.max(0, 4 - mpConnectedPlayers.length) }).map((_, i) => (
                                <div key={`empty-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                                    border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '10px',
                                }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
                                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>Waiting for player...</span>
                                </div>
                            ))}
                            {isHost && (
                                <button onClick={startMultiplayerGame} disabled={mpConnectedPlayers.length < 2}
                                    style={{
                                        ...styles.menuBtn, marginTop: '4px',
                                        background: mpConnectedPlayers.length >= 2 ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.06)',
                                        color: mpConnectedPlayers.length >= 2 ? 'white' : 'rgba(255,255,255,0.3)',
                                        cursor: mpConnectedPlayers.length >= 2 ? 'pointer' : 'not-allowed',
                                        border: 'none', boxShadow: mpConnectedPlayers.length >= 2 ? '0 4px 16px rgba(34,197,94,0.3)' : 'none',
                                    }}>
                                    {mpConnectedPlayers.length >= 2 ? '🚀 Start Game' : `Need ${2 - mpConnectedPlayers.length} more player(s)`}
                                </button>
                            )}
                            {!isHost && (
                                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', padding: '8px' }}>
                                    ⏳ Waiting for host to start…
                                </div>
                            )}
                            {mpError && (
                                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', color: '#f87171', fontSize: '0.85rem' }}>
                                    ⚠️ {mpError}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )
    }
    // #endregion

    // #region GAME BOARD
    return (
        <div style={styles.gameContainer}>
            {/* ── Top Bar ── */}
            <div style={styles.scoreBar}>
                {/* Back button */}
                <button
                    onClick={() => {
                        if (roomCode && myPlayerIdRef.current)
                            pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
                        if (gameMode === 'ai') {
                            setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
                            setShowUno({}); setColorPickerOpen(false); setGameOn(false); gameOnRef.current = false
                        } else if (gameMode === 'multiplayer') { resetMultiplayerState() }
                        setGameMode('menu'); gameModeRef.current = 'menu'; setMpState('lobby'); setMpConnectedPlayers([]); setRoomCode('')
                    }}
                    style={{
                        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.6)', padding: '5px 12px', borderRadius: '8px',
                        cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0,
                    }}
                >← Menu</button>

                {/* Score pills */}
                <div style={{ display: 'flex', gap: '6px', flex: 1, justifyContent: 'center', overflowX: 'auto', padding: '0 4px' }}>
                    {players.map(p => {
                        const isActive = currentTurn === p.id
                        const isMe = p.id === myPlayerId
                        return (
                            <div key={p.id} style={{
                                ...styles.scoreItem,
                                background: isActive ? 'rgba(255,215,0,0.15)' : isMe ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${isActive ? 'rgba(255,215,0,0.4)' : isMe ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)'}`,
                                borderRadius: '8px',
                            }}>
                                <span style={{ fontSize: '0.7rem' }}>{isMe ? '👤' : '🤖'}</span>
                                <span style={{ color: isActive ? '#ffd700' : isMe ? '#93c5fd' : 'rgba(255,255,255,0.55)', fontWeight: isMe ? '700' : '400', fontSize: '0.75rem' }}>
                                    {p.name.replace(' (You)', isMe ? ' ★' : '')}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>{p.score}pt</span>
                                <span style={{
                                    background: isActive ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.08)',
                                    color: isActive ? '#ffd700' : 'rgba(255,255,255,0.5)',
                                    borderRadius: '6px', padding: '1px 6px', fontSize: '0.7rem', fontWeight: '700',
                                }}>{p.hand.length}</span>
                            </div>
                        )
                    })}
                </div>

                {/* Mode badge */}
                <div style={{
                    background: gameMode === 'ai' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                    border: `1px solid ${gameMode === 'ai' ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`,
                    color: gameMode === 'ai' ? '#86efac' : '#93c5fd',
                    padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '600',
                    flexShrink: 0,
                }}>
                    {gameMode === 'ai' ? '🤖 AI' : `🌐 ${roomCode}`}
                </div>
            </div>

            {/* ── Decorative Table ── */}
            <div style={styles.tableRing} />
            <div style={styles.tableFelt} />

            {/* ── CPU Players ── */}
            {otherPlayers.map(op => {
                const isActive = currentTurn === op.id
                const isVert = op.position === 'left' || op.position === 'right'
                const posStyle = op.position === 'top' ? styles.cpuTop : op.position === 'left' ? styles.cpuLeft : styles.cpuRight

                return (
                    <div key={op.id} style={posStyle}>
                        {/* Name tag */}
                        <div style={{
                            ...styles.cpuNameTag,
                            background: isActive ? 'rgba(255,215,0,0.2)' : 'rgba(0,0,0,0.6)',
                            border: `2px solid ${isActive ? 'rgba(255,215,0,0.7)' : 'rgba(255,255,255,0.1)'}`,
                            color: isActive ? '#ffd700' : 'rgba(255,255,255,0.7)',
                            boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.3)' : 'none',
                        }}>
                            {isActive && <span style={{ marginRight: '4px' }}>▶</span>}
                            {op.name.replace(' (You)', '')}
                            <span style={{ marginLeft: '6px', opacity: 0.6 }}>{op.hand.length}</span>
                        </div>

                        {/* Cards */}
                        <div style={isVert ? styles.cpuHandVertical : styles.cpuHandHorizontal}>
                            {op.hand.map((_, i) => {
                                const overlap = isVert ? Math.min(-18, -60 / Math.max(op.hand.length, 1)) : Math.min(-12, -40 / Math.max(op.hand.length, 1))
                                return (
                                    <div key={i} style={{
                                        marginTop: isVert ? `${i === 0 ? 0 : overlap}px` : '0',
                                        marginLeft: !isVert ? `${i === 0 ? 0 : overlap}px` : '0',
                                        position: 'relative', zIndex: i,
                                    }}>
                                        <Image src="/images/back.png" alt="card back"
                                            width={isVert ? 40 : 36} height={isVert ? 28 : 52}
                                            style={{ borderRadius: '4px', display: 'block', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
                                        />
                                    </div>
                                )
                            })}
                        </div>

                        {/* UNO badge */}
                        {showUno[op.id] && (
                            <div style={{
                                position: 'absolute',
                                background: 'linear-gradient(135deg, #ff4444, #cc0000)',
                                color: 'white', fontWeight: '900', fontSize: '1.1rem',
                                padding: '6px 14px', borderRadius: '20px',
                                boxShadow: '0 4px 16px rgba(255,68,68,0.6)',
                                animation: 'pulse 0.5s ease-in-out',
                                zIndex: 50,
                                letterSpacing: '0.1em',
                            }}>UNO!</div>
                        )}
                    </div>
                )
            })}

            {/* ── Center Table Area ── */}
            <div style={styles.centerArea}>
                {/* Turn + direction */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{
                        ...styles.turnBanner,
                        background: isMyTurnNow ? 'linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,215,0,0.1))' : 'rgba(0,0,0,0.5)',
                        border: `1px solid ${isMyTurnNow ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        color: isMyTurnNow ? '#ffd700' : 'rgba(255,255,255,0.6)',
                        boxShadow: isMyTurnNow ? '0 0 20px rgba(255,215,0,0.2)' : 'none',
                    }}>
                        {isMyTurnNow ? '✦ YOUR TURN ✦' : `${players.find(p => p.id === currentTurn)?.name?.replace(' (You)', '') ?? '...'}'s TURN`}
                    </div>
                    <div style={styles.directionPill}>
                        {direction === 'clockwise' ? '↻ Clockwise' : '↺ Counter-Clockwise'}
                    </div>
                </div>

                {/* Cards */}
                <div style={styles.cardsRow}>
                    {/* Play pile */}
                    <div style={styles.cardPileWrapper}>
                        <span style={styles.cardPileLabel}>Played</span>
                        <div style={{
                            ...styles.topCardWrapper,
                            border: topCard ? `3px solid ${getCardBorderColor(topCard)}` : '3px solid transparent',
                            borderRadius: '12px',
                        }}>
                            {topCard && (
                                <>
                                    <Image src={topCard.src} alt="play pile" width={90} height={130}
                                        style={{ borderRadius: '9px', display: 'block' }}
                                    />
                                    {(topCard.value === 13 || topCard.value === 14) && topCard.color !== 'any' && (
                                        <div style={{
                                            position: 'absolute', bottom: '6px', right: '6px',
                                            width: '18px', height: '18px', borderRadius: '50%',
                                            backgroundColor: topCard.color,
                                            border: '2px solid rgba(255,255,255,0.8)',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                        }} />
                                    )}
                                </>
                            )}
                        </div>
                        {topCard && (
                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                {getCardName(topCard)}
                            </span>
                        )}
                    </div>

                    {/* Draw pile */}
                    <div style={styles.cardPileWrapper}>
                        <span style={styles.cardPileLabel}>Draw</span>
                        <div
                            onClick={handleDrawPileClick}
                            style={{
                                ...styles.drawPileWrapper,
                                opacity: isMyTurnNow ? 1 : 0.5,
                                cursor: isMyTurnNow ? 'pointer' : 'not-allowed',
                                transform: isMyTurnNow ? 'none' : 'none',
                                filter: isMyTurnNow ? 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))' : 'none',
                            }}
                            onMouseEnter={e => { if (isMyTurnNow) (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
                        >
                            <div style={styles.drawPileCount}>{deckState.length}</div>
                            <Image src="/images/back.png" alt="draw pile" width={90} height={130}
                                style={{ borderRadius: '9px', display: 'block' }}
                            />
                        </div>
                        <span style={{ fontSize: '0.6rem', color: isMyTurnNow ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                            {isMyTurnNow ? 'Click to draw' : `${deckState.length} cards`}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Player Bottom ── */}
            <div style={styles.playerBottom}>
                {/* Name tag */}
                <div style={{
                    ...styles.playerNameTag,
                    background: isMyTurnNow ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.08))' : 'rgba(0,0,0,0.6)',
                    border: `1px solid ${isMyTurnNow ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: isMyTurnNow ? '#ffd700' : 'rgba(255,255,255,0.6)',
                    boxShadow: isMyTurnNow ? '0 0 16px rgba(255,215,0,0.2)' : 'none',
                }}>
                    {myPlayer?.name?.replace(' (You)', '') ?? 'YOU'}
                    {isMyTurnNow && ' ← YOUR TURN'}
                    <span style={{ marginLeft: '8px', opacity: 0.6 }}>
                        {myPlayer?.hand.length ?? 0} cards · {myPlayer?.score ?? 0}pt
                    </span>
                </div>

                {/* Hand */}
                <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
                    padding: '0 8px 4px', overflowX: 'auto', maxWidth: '100vw',
                }}>
                    {(myPlayer?.hand ?? []).map((card, i) => {
                        const tc = playPile[playPile.length - 1]
                        const playable = tc && (card.value === tc.value || card.color === tc.color || card.color === 'any' || tc.color === 'any')
                        const canAct = isMyTurnNow
                        const cardCount = myPlayer?.hand.length ?? 0
                        const overlap = Math.min(-4, -Math.max(0, (cardCount - 7) * 4))

                        return (
                            <div
                                key={i}
                                onClick={() => handlePlayerCardClick(i)}
                                style={{
                                    marginLeft: i === 0 ? 0 : `${overlap}px`,
                                    position: 'relative', zIndex: canAct && playable ? 10 + i : i,
                                    cursor: canAct && playable ? 'pointer' : 'not-allowed',
                                    transition: 'transform 0.15s ease',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={e => {
                                    if (canAct && playable) (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-16px) scale(1.05)'
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLDivElement).style.transform = 'none'
                                }}
                            >
                                <Image
                                    src={card.src} alt={`card-${i}`}
                                    width={62} height={92}
                                    style={{
                                        borderRadius: '7px', display: 'block',
                                        opacity: canAct ? (playable ? 1 : 0.45) : 0.6,
                                        boxShadow: canAct && playable
                                            ? `0 0 0 2px ${getCardBorderColor(card)}, 0 4px 12px rgba(0,0,0,0.5)`
                                            : '0 2px 8px rgba(0,0,0,0.4)',
                                        filter: canAct && !playable ? 'grayscale(40%)' : 'none',
                                    }}
                                />
                            </div>
                        )
                    })}
                </div>

                {/* UNO badge */}
                {showUno[myPlayerId] && (
                    <div style={{
                        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                        background: 'linear-gradient(135deg, #ff4444, #cc0000)',
                        color: 'white', fontWeight: '900', fontSize: '1.5rem',
                        padding: '8px 20px', borderRadius: '20px',
                        boxShadow: '0 4px 20px rgba(255,68,68,0.7)',
                        letterSpacing: '0.1em',
                    }}>UNO!</div>
                )}
            </div>

            {/* ── Color Picker ── */}
            {colorPickerOpen && currentTurn === myPlayerId && (
                <div style={styles.colorPickerOverlay}>
                    <div style={styles.colorPickerCard}>
                        <p style={{ color: 'white', fontWeight: '700', fontSize: '1rem', margin: '0 0 4px', letterSpacing: '0.1em' }}>
                            🎨 CHOOSE A COLOR
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: '0 0 16px' }}>
                            Select the color to continue
                        </p>
                        <div style={styles.colorGrid}>
                            {[
                                { color: 'rgb(255, 6, 0)', label: 'Red', bg: 'linear-gradient(135deg,#ff4444,#cc0000)', shadow: 'rgba(255,68,68,0.5)' },
                                { color: 'rgb(0, 170, 69)', label: 'Green', bg: 'linear-gradient(135deg,#22c55e,#16a34a)', shadow: 'rgba(34,197,94,0.5)' },
                                { color: 'rgb(0, 150, 224)', label: 'Blue', bg: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', shadow: 'rgba(59,130,246,0.5)' },
                                { color: 'rgb(255, 222, 0)', label: 'Yellow', bg: 'linear-gradient(135deg,#fbbf24,#d97706)', shadow: 'rgba(251,191,36,0.5)' },
                            ].map(({ color, label, bg, shadow }) => (
                                <button key={color} onClick={() => handleColorChosen(color)}
                                    style={{
                                        ...styles.colorBtn,
                                        background: bg,
                                        color: 'white',
                                        boxShadow: `0 4px 16px ${shadow}`,
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Round Winner ── */}
            {roundVisible && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalCard}>
                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏆</div>
                        <h2 style={{ color: '#ffd700', fontSize: '1.5rem', fontWeight: '900', margin: '0 0 8px' }}>
                            Round Over!
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', margin: 0 }}>
                            <span style={{ color: 'white', fontWeight: '700' }}>{roundWinner}</span> won the round
                        </p>
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {players.map(p => (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>{p.name.replace(' (You)', '')}</span>
                                    <span style={{ color: '#ffd700', fontWeight: '700', fontSize: '0.85rem' }}>{p.score} pts</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Game Winner ── */}
            {gameVisible && (
                <div style={styles.modalOverlay}>
                    <div style={{ ...styles.modalCard, maxWidth: '440px' }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>
                            {gameWinner === 'You' ? '🎉' : '😔'}
                        </div>
                        <h2 style={{
                            fontSize: '1.8rem', fontWeight: '900', margin: '0 0 8px',
                            color: gameWinner === 'You' ? '#ffd700' : 'rgba(255,255,255,0.8)',
                        }}>
                            {gameWinner === 'You' ? 'You Win!' : `${gameWinner} Wins!`}
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 16px' }}>
                            Game over — reached {GAME_OVER_SCORE} points
                        </p>
                        {/* Final scores */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                            {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                                <div key={p.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '8px 12px',
                                    background: i === 0 ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${i === 0 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                    borderRadius: '10px',
                                }}>
                                    <span style={{ color: i === 0 ? '#ffd700' : 'rgba(255,255,255,0.3)', fontSize: '0.85rem', width: '20px' }}>
                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.8)', flex: 1, fontSize: '0.9rem' }}>{p.name.replace(' (You)', '')}</span>
                                    <span style={{ color: i === 0 ? '#ffd700' : 'rgba(255,255,255,0.5)', fontWeight: '700', fontSize: '0.9rem' }}>{p.score} pts</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {(gameMode === 'ai' || isHost) && (
                                <button onClick={handlePlayAgain} style={{
                                    flex: 1, padding: '12px', background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer',
                                    fontWeight: '700', fontSize: '0.95rem', boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
                                }}>🔄 Play Again</button>
                            )}
                            <button onClick={() => {
                                setGameVisible(false)
                                if (gameMode === 'multiplayer') { resetMultiplayerState() }
                                else { setRoundVisible(false); setRoundWinner(null); setGameWinner(null); setShowUno({}); setColorPickerOpen(false) }
                                setGameMode('menu'); gameModeRef.current = 'menu'; setMpState('lobby')
                            }} style={{
                                flex: 1, padding: '12px', background: 'rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '12px', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem',
                            }}>🏠 Menu</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
    // #endregion
}
