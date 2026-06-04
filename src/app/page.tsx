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
        color: string,
        value: number,
        points: number,
        changeTurn: boolean,
        drawValue: number,
        src: string
    ) {
        this.color = color
        this.value = value
        this.points = points
        this.changeTurn = changeTurn
        this.drawValue = drawValue
        this.src = src
        this.playedByPlayer = false
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

// All Pusher HTTP API calls go through our own API route to avoid CORS
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

// #region CONSTANTS & TYPES
const GAME_OVER_SCORE = 100
const AI_PLAYER_ORDER: Player['id'][] = ['player', 'cpu2', 'cpu1', 'cpu3']

function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
}

interface PusherChannel {
    bind: (event: string, cb: (data: unknown) => void) => void
    unbind_all: () => void
}

interface GameStatePayload {
    players: Player[]
    deck: CardType[]
    playPile: CardType[]
    currentTurn: Player['id']
    direction: 'clockwise' | 'counter-clockwise'
    colorPickerOpen: boolean
    gameOn: boolean
    playerOrder: Player['id'][]
}

interface WinnerPayload {
    winnerId: string
    winnerName: string
}

interface SlotPayload {
    playerId: Player['id']
    allPlayers: { id: string; name: string }[]
}

interface JoinPayload {
    playerId: string
    playerName: string
    requestSlot?: boolean
}
// #endregion

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
    const [myPlayerName, setMyPlayerName]                 = useState('Player 1')
    const [mpPlayerCount, setMpPlayerCount]               = useState(2)
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
    const roomCodeRef          = useRef(roomCode)
    const playerOrderRef       = useRef(playerOrderState)
    const mpConnectedRef       = useRef(mpConnectedPlayers)

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
    useEffect(() => { roomCodeRef.current          = roomCode },          [roomCode])
    useEffect(() => { playerOrderRef.current       = playerOrderState },  [playerOrderState])
    useEffect(() => { mpConnectedRef.current       = mpConnectedPlayers },[mpConnectedPlayers])
    // #endregion

    // #region AUDIO INIT
    useEffect(() => { audioManager.init() }, [])
    // #endregion

    // suppress unused warning for wildCardColor / selectedWildColor
    void wildCardColor
    void selectedWildColor

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

    // #region BROADCAST
    const broadcastGameState = useCallback(async (overrides?: Partial<GameStatePayload>) => {
        if (gameModeRef.current !== 'multiplayer') return
        const channel = `uno-room-${roomCodeRef.current}`
        await pusherTrigger(channel, 'game-state', {
            players:         overrides?.players         ?? playersRef.current,
            deck:            overrides?.deck            ?? deckRef.current,
            playPile:        overrides?.playPile        ?? playPileRef.current,
            currentTurn:     overrides?.currentTurn     ?? currentTurnRef.current,
            direction:       overrides?.direction       ?? directionRef.current,
            colorPickerOpen: overrides?.colorPickerOpen ?? colorPickerRef.current,
            gameOn:          overrides?.gameOn          ?? gameOnRef.current,
            playerOrder:     overrides?.playerOrder     ?? playerOrderRef.current,
        })
    }, [])
    // #endregion

    // #region CHECK WINNER
    const checkForWinner = useCallback(async (currentPlayers?: Player[]) => {
        const cp = currentPlayers ?? playersRef.current
        const winner = cp.find(p => p.hand.length === 0)
        if (!winner) return false

        const updatedPlayers = cp.map(p => {
            if (p.id === winner.id) {
                const pts = cp.reduce((sum, pl) =>
                    pl.id !== winner.id ? sum + tallyPoints(pl.hand) : sum, 0)
                return { ...p, score: p.score + pts }
            }
            return p
        })
        setPlayers(updatedPlayers)
        playersRef.current = updatedPlayers

        const gameWinnerPlayer = updatedPlayers.find(p => p.score >= GAME_OVER_SCORE)
        if (gameWinnerPlayer) {
            setGameOn(false)
            gameOnRef.current = false
            setGameWinner(gameWinnerPlayer.id === myPlayerIdRef.current ? 'You' : gameWinnerPlayer.name)
            setGameVisible(true)
            audioManager.play(gameWinnerPlayer.id === myPlayerIdRef.current ? 'winGame' : 'lose')
            if (gameModeRef.current === 'multiplayer') {
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'game-winner', {
                    winnerId:   gameWinnerPlayer.id,
                    winnerName: gameWinnerPlayer.name,
                })
            }
        } else {
            setRoundWinner(winner.id === myPlayerIdRef.current ? 'You' : winner.name)
            setRoundVisible(true)
            setGameOn(false)
            gameOnRef.current = false
            audioManager.play('winRound')
            if (gameModeRef.current === 'multiplayer') {
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'round-winner', {
                    winnerId:   winner.id,
                    winnerName: winner.name,
                })
            }
            if (gameModeRef.current === 'ai') {
                setTimeout(() => setRoundVisible(false), 3000)
            }
        }
        return true
    }, [tallyPoints])
    // #endregion

    // #region BIND CHANNEL EVENTS
    const bindChannelEvents = useCallback((channel: PusherChannel) => {
        channel.bind('game-state', (raw: unknown) => {
            const data = raw as GameStatePayload
            setPlayers(data.players)
            playersRef.current = data.players
            setDeckState(data.deck)
            deckRef.current = data.deck
            setPlayPile(data.playPile)
            playPileRef.current = data.playPile
            setCurrentTurn(data.currentTurn)
            currentTurnRef.current = data.currentTurn
            setDirection(data.direction)
            directionRef.current = data.direction
            setColorPickerOpen(data.colorPickerOpen)
            colorPickerRef.current = data.colorPickerOpen
            setGameOn(data.gameOn)
            gameOnRef.current = data.gameOn
            if (data.playerOrder) {
                setPlayerOrderState(data.playerOrder)
                playerOrderRef.current = data.playerOrder
            }
            if (data.gameOn) setMpState('playing')
        })

        channel.bind('uno-shout', (raw: unknown) => {
            const data = raw as { playerId: string }
            triggerUno(data.playerId)
        })

        channel.bind('round-winner', (raw: unknown) => {
            const data = raw as WinnerPayload
            setRoundWinner(data.winnerId === myPlayerIdRef.current ? 'You' : data.winnerName)
            setRoundVisible(true)
            setGameOn(false)
            gameOnRef.current = false
            setTimeout(() => setRoundVisible(false), 3000)
        })

        channel.bind('game-winner', (raw: unknown) => {
            const data = raw as WinnerPayload
            setGameWinner(data.winnerId === myPlayerIdRef.current ? 'You' : data.winnerName)
            setGameVisible(true)
            setGameOn(false)
            gameOnRef.current = false
            audioManager.play(data.winnerId === myPlayerIdRef.current ? 'winGame' : 'lose')
        })

        channel.bind('player-joined', (raw: unknown) => {
            const data = raw as JoinPayload
            setMpConnectedPlayers(prev => {
                if (prev.find(p => p.id === data.playerId)) return prev
                return [...prev, { id: data.playerId, name: data.playerName }]
            })
        })

        channel.bind('player-left', (raw: unknown) => {
            const data = raw as { playerId: string }
            setMpConnectedPlayers(prev => prev.filter(p => p.id !== data.playerId))
        })

        channel.bind('slot-assigned', (raw: unknown) => {
            const data = raw as SlotPayload
            if (data.playerId) {
                setMyPlayerId(data.playerId)
                myPlayerIdRef.current = data.playerId
            }
            if (data.allPlayers) {
                setMpConnectedPlayers(data.allPlayers)
            }
        })
    }, [triggerUno])
    // #endregion

    // #region CREATE ROOM
    const createRoom = useCallback(async () => {
        if (!myPlayerName.trim()) { setMpError('Please enter your name'); return }
        const code = generateRoomCode()
        setRoomCode(code)
        roomCodeRef.current = code
        setIsHost(true)
        setMyPlayerId('player')
        myPlayerIdRef.current = 'player'

        const pusher = await getPusherInstance() as { subscribe: (ch: string) => PusherChannel }
        const channel = pusher.subscribe(`uno-room-${code}`)
        setMpChannel(channel)

        const initialConnected = [{ id: 'player', name: myPlayerName }]
        setMpConnectedPlayers(initialConnected)
        mpConnectedRef.current = initialConnected

        bindChannelEvents(channel)
        setMpState('waiting')
        setMpError('')
    }, [myPlayerName, bindChannelEvents])
    // #endregion

    // #region JOIN ROOM
    const joinRoom = useCallback(async () => {
        if (!myPlayerName.trim())  { setMpError('Please enter your name');   return }
        if (!inputRoomCode.trim()) { setMpError('Please enter a room code'); return }

        const code = inputRoomCode.toUpperCase().trim()
        setRoomCode(code)
        roomCodeRef.current = code
        setIsHost(false)

        const pusher = await getPusherInstance() as { subscribe: (ch: string) => PusherChannel }
        const channel = pusher.subscribe(`uno-room-${code}`)
        setMpChannel(channel)

        bindChannelEvents(channel)

        await pusherTrigger(`uno-room-${code}`, 'player-joined', {
            playerId:    'joining',
            playerName:  myPlayerName,
            requestSlot: true,
        })

        setMpState('waiting')
        setMpError('')
    }, [myPlayerName, inputRoomCode, bindChannelEvents])
    // #endregion

    // #region HOST ASSIGNS SLOT
    useEffect(() => {
        if (!isHost || !mpChannel || gameMode !== 'multiplayer') return
        const slots: Player['id'][] = ['p2', 'p3', 'p4']

        mpChannel.bind('player-joined', async (raw: unknown) => {
            const data = raw as JoinPayload
            if (!data.requestSlot) return
            const usedIds       = mpConnectedRef.current.map(p => p.id)
            const availableSlot = slots.find(s => !usedIds.includes(s))
            if (!availableSlot) return

            const newConnected = [...mpConnectedRef.current, { id: availableSlot, name: data.playerName }]
            setMpConnectedPlayers(newConnected)
            mpConnectedRef.current = newConnected

            await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'slot-assigned', {
                playerId:   availableSlot,
                allPlayers: newConnected,
            })
        })
    }, [isHost, mpChannel, gameMode])
    // #endregion

    // #region START MULTIPLAYER GAME
    const startMultiplayerGame = useCallback(async () => {
        if (!isHost) return
        if (mpConnectedPlayers.length < 2) { setMpError('Need at least 2 players'); return }

        const positions: Player['position'][] = ['bottom', 'top', 'left', 'right']
        const playerIds: Player['id'][]       = ['player', 'p2', 'p3', 'p4']
        const count = Math.min(mpConnectedPlayers.length, 4)
        const order = playerIds.slice(0, count) as Player['id'][]

        const newPlayers: Player[] = mpConnectedPlayers.slice(0, count).map((cp, i) => ({
            id:       playerIds[i] as Player['id'],
            hand:     [],
            score:    0,
            position: positions[i],
            name:     cp.name,
            isHuman:  true,
        }))

        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)

        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < newPlayers.length; j++) {
                newPlayers[j].hand.push(newDeck.shift()!)
            }
        }

        let startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].color !== 'any' && newDeck[i].value <= 9) {
                startCard = newDeck.splice(i, 1)[0]
                break
            }
        }
        const newPlayPile = startCard ? [startCard] : []

        setPlayers(newPlayers);             playersRef.current     = newPlayers
        setDeckState(newDeck);              deckRef.current        = newDeck
        setPlayPile(newPlayPile);           playPileRef.current    = newPlayPile
        setCurrentTurn('player');           currentTurnRef.current = 'player'
        setDirection('clockwise');          directionRef.current   = 'clockwise'
        setPlayerOrderState(order);         playerOrderRef.current = order
        setGameOn(true);                    gameOnRef.current      = true
        setColorPickerOpen(false);          colorPickerRef.current = false
        setMpState('playing')

        audioManager.play('shuffle')

        await pusherTrigger(`uno-room-${roomCode}`, 'game-state', {
            players:         newPlayers,
            deck:            newDeck,
            playPile:        newPlayPile,
            currentTurn:     'player',
            direction:       'clockwise',
            colorPickerOpen: false,
            gameOn:          true,
            playerOrder:     order,
        })
    }, [isHost, mpConnectedPlayers, roomCode])
    // #endregion

    // #region NEW AI GAME
    const newAIGame = useCallback((existingScores?: { [key: string]: number }) => {
        setGameOn(true);                    gameOnRef.current      = true
        setColorPickerOpen(false);          colorPickerRef.current = false
        setWildCardColor('')
        setSelectedWildColor('');           selectedWildColorRef.current = ''
        setDirection('clockwise');          directionRef.current   = 'clockwise'
        setPlayerOrderState(AI_PLAYER_ORDER); playerOrderRef.current = AI_PLAYER_ORDER
        setMyPlayerId('player');            myPlayerIdRef.current  = 'player'
        setRoundVisible(false)
        setGameVisible(false)

        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)
        audioManager.play('shuffle')

        const newPlayers: Player[] = [
            { id: 'player', hand: [], score: existingScores?.player ?? 0, position: 'bottom', name: 'YOU',       isHuman: true  },
            { id: 'cpu1',   hand: [], score: existingScores?.cpu1   ?? 0, position: 'top',    name: 'CPU TOP',   isHuman: false },
            { id: 'cpu2',   hand: [], score: existingScores?.cpu2   ?? 0, position: 'left',   name: 'CPU LEFT',  isHuman: false },
            { id: 'cpu3',   hand: [], score: existingScores?.cpu3   ?? 0, position: 'right',  name: 'CPU RIGHT', isHuman: false },
        ]

        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < newPlayers.length; j++) {
                newPlayers[j].hand.push(newDeck.shift()!)
            }
        }

        let startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].color !== 'any' && newDeck[i].value <= 9) {
                startCard = newDeck.splice(i, 1)[0]
                break
            }
        }
        const newPlayPile = startCard ? [startCard] : []

        setPlayers(newPlayers);             playersRef.current     = newPlayers
        setDeckState(newDeck);              deckRef.current        = newDeck
        setPlayPile(newPlayPile);           playPileRef.current    = newPlayPile
        setCurrentTurn('player');           currentTurnRef.current = 'player'
    }, [])
    // #endregion

    // #region CPU LOGIC
    const playCPU = useCallback(async (cpuId: Player['id']) => {
        if (currentTurnRef.current !== cpuId) return
        if (!gameOnRef.current)               return
        if (colorPickerRef.current)           return
        if (gameModeRef.current !== 'ai')     return

        await new Promise(resolve => setTimeout(resolve, getCpuDelay()))
        if (currentTurnRef.current !== cpuId || !gameOnRef.current) return

        const order  = playerOrderRef.current
        const cpu    = playersRef.current.find(p => p.id === cpuId)
        if (!cpu) return

        const currentPlayPile = [...playPileRef.current]
        const currentDeck     = [...deckRef.current]
        const topCard         = currentPlayPile[currentPlayPile.length - 1]
        const currentDir      = directionRef.current

        const playable:  CardType[] = []
        const remaining: CardType[] = []

        for (const card of cpu.hand) {
            const canPlay =
                card.color === topCard.color ||
                card.value === topCard.value  ||
                card.color === 'any'           ||
                topCard.color === 'any'
            canPlay ? playable.push(card) : remaining.push(card)
        }

        // No playable card — draw
        if (playable.length === 0) {
            let newDeck     = [...currentDeck]
            let newPlayPile = [...currentPlayPile]
            let newHand     = [...cpu.hand]
            let drawnCard: CardType | null = null

            if (newDeck.length > 0) {
                drawnCard = newDeck.shift()!
                newHand.push(drawnCard)
            } else if (newPlayPile.length > 1) {
                const toShuffle = newPlayPile.slice(0, -1)
                newDeck     = shuffleDeck(toShuffle)
                newPlayPile = [newPlayPile[newPlayPile.length - 1]]
                drawnCard   = newDeck.shift()!
                newHand.push(drawnCard)
            }

            audioManager.play('drawCard')
            const updated = playersRef.current.map(p => p.id === cpuId ? { ...p, hand: newHand } : p)
            setPlayers(updated);            playersRef.current  = updated
            setDeckState(newDeck);          deckRef.current     = newDeck
            setPlayPile(newPlayPile);       playPileRef.current = newPlayPile

            if (drawnCard) {
                const newTop = newPlayPile[newPlayPile.length - 1]
                const canPlay =
                    drawnCard.color === newTop.color ||
                    drawnCard.value === newTop.value  ||
                    drawnCard.color === 'any'          ||
                    newTop.color    === 'any'
                if (canPlay && gameOnRef.current && currentTurnRef.current === cpuId) {
                    setTimeout(() => {
                        if (currentTurnRef.current === cpuId && gameOnRef.current && !colorPickerRef.current)
                            playCPU(cpuId)
                    }, getCpuDelay())
                    return
                }
            }

            const next = getNextTurn(cpuId, currentDir, order)
            setCurrentTurn(next); currentTurnRef.current = next
            return
        }

        // Choose best card
        let chosenCard: CardType
        let leftover:   CardType[]

        if (playable.length === 1) {
            chosenCard = playable[0]
            leftover   = remaining
        } else {
            const maxVal = Math.max(...playable.map(c => c.value))
            const idx    = playable.findIndex(c => c.value === maxVal)
            chosenCard   = playable[idx]
            leftover     = [...remaining, ...playable.filter((_, i) => i !== idx)]
        }

        audioManager.playCardSound()

        const newPlayPile = [...currentPlayPile, { ...chosenCard, playedByPlayer: false }]
        const newCpuHand  = [...leftover]

        // Wild colour
        if (chosenCard.color === 'any' && chosenCard.drawValue === 0) {
            const colours = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            const picked  = colours[Math.floor(Math.random() * colours.length)]
            newPlayPile[newPlayPile.length - 1].color = picked
            setWildCardColor(picked)
            setSelectedWildColor(picked)
            selectedWildColorRef.current = picked
        }

        // Reverse
        let newDir = currentDir
        if (chosenCard.value === 10) {
            newDir = currentDir === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDir)
            directionRef.current = newDir
        }

        // Draw penalty
        if (chosenCard.drawValue > 0) {
            audioManager.play('plusCard')
            const nextId     = getNextTurn(cpuId, newDir, order)
            const nextPlayer = playersRef.current.find(p => p.id === nextId)!
            let updHand      = [...nextPlayer.hand]
            let updDeck      = [...currentDeck]
            let updPile      = [...newPlayPile]

            for (let i = 0; i < chosenCard.drawValue; i++) {
                if (updDeck.length > 0) {
                    updHand.push(updDeck.shift()!)
                } else if (updPile.length > 1) {
                    const toShuffle = updPile.slice(0, -1)
                    updDeck = shuffleDeck(toShuffle)
                    updPile = [updPile[updPile.length - 1]]
                    updHand.push(updDeck.shift()!)
                }
                audioManager.play('drawCard')
            }

            const updated = playersRef.current.map(p => {
                if (p.id === nextId) return { ...p, hand: updHand }
                if (p.id === cpuId)  return { ...p, hand: newCpuHand }
                return p
            })
            setPlayers(updated);            playersRef.current  = updated
            setDeckState(updDeck);          deckRef.current     = updDeck
            setPlayPile(updPile);           playPileRef.current = updPile
        } else {
            const updated = playersRef.current.map(p =>
                p.id === cpuId ? { ...p, hand: newCpuHand } : p)
            setPlayers(updated);            playersRef.current  = updated
            setPlayPile(newPlayPile);       playPileRef.current = newPlayPile
        }

        if (newCpuHand.length === 1) triggerUno(cpuId)
        if (newCpuHand.length === 0) { await checkForWinner(); return }

        // Skip
        let nextTurn: Player['id']
        if (chosenCard.value === 11) {
            nextTurn = getNextTurn(getNextTurn(cpuId, newDir, order), newDir, order)
        } else {
            nextTurn = getNextTurn(cpuId, newDir, order)
        }
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
    }, [triggerUno, checkForWinner, getCpuDelay, getNextTurn])
    // #endregion

    // #region PLAYER CARD CLICK
    const handlePlayerCardClick = useCallback(async (index: number) => {
        if (currentTurnRef.current !== myPlayerIdRef.current) return
        if (colorPickerRef.current)                           return
        if (!gameOnRef.current)                               return

        const order  = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)
        if (!player) return

        const currentPlayPile = [...playPileRef.current]
        const topCard         = currentPlayPile[currentPlayPile.length - 1]
        const card            = player.hand[index]
        const currentDir      = directionRef.current

        const isPlayable =
            card.value === topCard.value ||
            card.color === topCard.color  ||
            card.color === 'any'           ||
            topCard.color === 'any'

        if (!isPlayable) return

        audioManager.playCardSound()

        const newPlayerHand = player.hand.filter((_, i) => i !== index)
        const playedCard    = { ...card, playedByPlayer: true }
        const newPlayPile   = [...currentPlayPile, playedCard]

        let newDir = currentDir
        if (playedCard.value === 10) {
            newDir = currentDir === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDir)
            directionRef.current = newDir
        }

        let updatedPlayers = playersRef.current.map(p =>
            p.id === myPlayerIdRef.current ? { ...p, hand: newPlayerHand } : p)
        setPlayers(updatedPlayers);         playersRef.current  = updatedPlayers
        setPlayPile(newPlayPile);           playPileRef.current = newPlayPile

        if (playedCard.color !== 'any') {
            setWildCardColor('')
            setSelectedWildColor('');       selectedWildColorRef.current = ''
        }

        if (newPlayerHand.length === 1) {
            triggerUno(myPlayerIdRef.current)
            if (gameModeRef.current === 'multiplayer') {
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'uno-shout', {
                    playerId: myPlayerIdRef.current,
                })
            }
        }

        // Draw penalty
        if (playedCard.drawValue > 0) {
            audioManager.play('plusCard')
            const nextId     = getNextTurn(myPlayerIdRef.current, newDir, order)
            const nextPlayer = playersRef.current.find(p => p.id === nextId)!
            let updHand      = [...nextPlayer.hand]
            let updDeck      = [...deckRef.current]
            let updPile      = [...newPlayPile]

            for (let i = 0; i < playedCard.drawValue; i++) {
                if (updDeck.length > 0) {
                    updHand.push(updDeck.shift()!)
                } else if (updPile.length > 1) {
                    const toShuffle = updPile.slice(0, -1)
                    updDeck = shuffleDeck(toShuffle)
                    updPile = [updPile[updPile.length - 1]]
                    updHand.push(updDeck.shift()!)
                }
                audioManager.play('drawCard')
            }

            updatedPlayers = playersRef.current.map(p => {
                if (p.id === nextId) return { ...p, hand: updHand }
                return p
            })
            setPlayers(updatedPlayers);     playersRef.current  = updatedPlayers
            setDeckState(updDeck);          deckRef.current     = updDeck
            setPlayPile(updPile);           playPileRef.current = updPile
        }

        if (newPlayerHand.length === 0) {
            await checkForWinner(playersRef.current)
            return
        }

        // Wild — open colour picker
        if (playedCard.color === 'any' && playedCard.drawValue === 0) {
            setColorPickerOpen(true)
            colorPickerRef.current = true
            if (gameModeRef.current === 'multiplayer') {
                await broadcastGameState({
                    players:         playersRef.current,
                    playPile:        playPileRef.current,
                    colorPickerOpen: true,
                })
            }
            return
        }

        let nextTurn: Player['id']
        if (playedCard.value === 11) {
            nextTurn = getNextTurn(getNextTurn(myPlayerIdRef.current, newDir, order), newDir, order)
        } else {
            nextTurn = getNextTurn(myPlayerIdRef.current, newDir, order)
        }
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastGameState({
                players:     playersRef.current,
                deck:        deckRef.current,
                playPile:    playPileRef.current,
                currentTurn: nextTurn,
                direction:   newDir,
            })
        }
    }, [triggerUno, checkForWinner, getNextTurn, broadcastGameState])
    // #endregion

    // #region DRAW PILE CLICK
    const handleDrawPileClick = useCallback(async () => {
        if (currentTurnRef.current !== myPlayerIdRef.current) return
        if (colorPickerRef.current)                           return
        if (!gameOnRef.current)                               return

        const order      = playerOrderRef.current
        const player     = playersRef.current.find(p => p.id === myPlayerIdRef.current)
        if (!player) return

        let newDeck     = [...deckRef.current]
        let newPlayPile = [...playPileRef.current]
        let newHand     = [...player.hand]
        let drawnCard: CardType | null = null
        const currentDir = directionRef.current

        if (newDeck.length > 0) {
            drawnCard = newDeck.shift()!
            newHand.push(drawnCard)
        } else if (newPlayPile.length > 1) {
            const toShuffle = newPlayPile.slice(0, -1)
            newDeck     = shuffleDeck(toShuffle)
            newPlayPile = [newPlayPile[newPlayPile.length - 1]]
            drawnCard   = newDeck.shift()!
            newHand.push(drawnCard)
        } else {
            return
        }

        audioManager.play('drawCard')

        const updatedPlayers = playersRef.current.map(p =>
            p.id === myPlayerIdRef.current ? { ...p, hand: newHand } : p)
        setPlayers(updatedPlayers);         playersRef.current  = updatedPlayers
        setDeckState(newDeck);              deckRef.current     = newDeck
        setPlayPile(newPlayPile);           playPileRef.current = newPlayPile

        if (drawnCard) {
            const topCard = newPlayPile[newPlayPile.length - 1]
            const canPlay =
                drawnCard.color === topCard.color ||
                drawnCard.value === topCard.value  ||
                drawnCard.color === 'any'           ||
                topCard.color   === 'any'
            if (canPlay) {
                if (gameModeRef.current === 'multiplayer') {
                    await broadcastGameState({
                        players:  updatedPlayers,
                        deck:     newDeck,
                        playPile: newPlayPile,
                    })
                }
                return
            }
        }

        const nextTurn = getNextTurn(myPlayerIdRef.current, currentDir, order)
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastGameState({
                players:     updatedPlayers,
                deck:        newDeck,
                playPile:    newPlayPile,
                currentTurn: nextTurn,
            })
        }
    }, [getNextTurn, broadcastGameState])
    // #endregion

    // #region COLOUR CHOSEN
    const handleColorChosen = useCallback(async (color: string) => {
        audioManager.play('colorButton')
        const order   = playerOrderRef.current
        const newPile = [...playPileRef.current]
        newPile[newPile.length - 1] = { ...newPile[newPile.length - 1], color }

        setPlayPile(newPile);               playPileRef.current    = newPile
        setColorPickerOpen(false);          colorPickerRef.current = false
        setWildCardColor(color)
        setSelectedWildColor(color);        selectedWildColorRef.current = color

        const nextTurn = getNextTurn(myPlayerIdRef.current, directionRef.current, order)
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastGameState({
                playPile:        newPile,
                colorPickerOpen: false,
                currentTurn:     nextTurn,
            })
        }
    }, [getNextTurn, broadcastGameState])
    // #endregion

    // #region AUTO CPU TURN
    useEffect(() => {
        if (gameMode !== 'ai')    return
        if (!gameOn)              return
        if (colorPickerOpen)      return
        if (currentTurn === 'player') return
        const p = players.find(pl => pl.id === currentTurn)
        if (p && !p.isHuman) playCPU(currentTurn)
    }, [currentTurn, gameOn, colorPickerOpen, playCPU, gameMode, players])
    // #endregion

    // #region PLAY AGAIN
    const handlePlayAgain = useCallback(() => {
        audioManager.play('playAgain')
        setGameVisible(false)
        setRoundVisible(false)
        if (gameMode === 'ai') {
            const scores: { [key: string]: number } = {}
            playersRef.current.forEach(p => { scores[p.id] = p.score })
            newAIGame(scores)
        } else if (gameMode === 'multiplayer' && isHost) {
            startMultiplayerGame()
        }
    }, [gameMode, newAIGame, isHost, startMultiplayerGame])
    // #endregion

    // #region DERIVED
    const topCard      = playPile[playPile.length - 1]
    const myPlayer     = players.find(p => p.id === myPlayerId)
    const otherPlayers = players.filter(p => p.id !== myPlayerId)

    const getCardName = (card: CardType) => {
        if (card.color === 'any') return card.drawValue === 4 ? 'Wild Draw 4' : 'Wild Card'
        const colorNames: Record<string, string> = {
            'rgb(255, 6, 0)':   'Red',
            'rgb(0, 170, 69)':  'Green',
            'rgb(0, 150, 224)': 'Blue',
            'rgb(255, 222, 0)': 'Yellow',
        }
        const valueNames: Record<number, string> = {
            10: 'Reverse', 11: 'Skip', 12: 'Draw 2', 13: 'Wild', 14: 'Wild Draw 4',
        }
        const v = valueNames[card.value] ?? card.value.toString()
        return `${colorNames[card.color] ?? card.color} ${v}`
    }

    const getPositionClass = (pos: Player['position']) => {
        if (pos === 'top')   return 'cpu-top'
        if (pos === 'left')  return 'cpu-left'
        if (pos === 'right') return 'cpu-right'
        return ''
    }

    const getDirectionDisplay = () =>
        direction === 'clockwise' ? 'CLOCKWISE →' : 'COUNTER-CLOCKWISE ←'
    // #endregion

    // =====================================================================
    // #region MENU
    // =====================================================================
    if (gameMode === 'menu') {
        return (
            <main className="game-container" style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.75)',
                    borderRadius: '2rem',
                    padding: '3rem 4rem',
                    textAlign: 'center',
                    border: '2px solid rgba(255,215,0,0.4)',
                    backdropFilter: 'blur(10px)',
                }}>
                    <h1 style={{
                        fontSize: '4rem', fontWeight: 'bold',
                        color: '#ffd700', textShadow: '0 0 20px rgba(255,215,0,0.5)',
                        marginBottom: '0.5rem',
                    }}>
                        🃏 UNO
                    </h1>
                    <p style={{ color: '#ccc', marginBottom: '2.5rem', fontSize: '1.2rem' }}>
                        Choose your game mode
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <button
                            onClick={() => {
                                setGameMode('ai')
                                gameModeRef.current = 'ai'
                                newAIGame()
                            }}
                            style={{
                                padding: '1.2rem 3rem', fontSize: '1.4rem', fontWeight: 'bold',
                                background: 'linear-gradient(135deg,#4caf50,#2e7d32)',
                                color: 'white', border: 'none', borderRadius: '1rem',
                                cursor: 'pointer', boxShadow: '0 4px 15px rgba(76,175,80,0.4)',
                                transition: 'transform 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        >
                            🤖 Play vs AI
                        </button>
                        <button
                            onClick={() => {
                                setGameMode('multiplayer')
                                gameModeRef.current = 'multiplayer'
                            }}
                            style={{
                                padding: '1.2rem 3rem', fontSize: '1.4rem', fontWeight: 'bold',
                                background: 'linear-gradient(135deg,#2196f3,#0d47a1)',
                                color: 'white', border: 'none', borderRadius: '1rem',
                                cursor: 'pointer', boxShadow: '0 4px 15px rgba(33,150,243,0.4)',
                                transition: 'transform 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        >
                            🌐 Multiplayer
                        </button>
                    </div>
                </div>
            </main>
        )
    }
    // #endregion

    // =====================================================================
    // #region MULTIPLAYER LOBBY
    // =====================================================================
    if (gameMode === 'multiplayer' && mpState !== 'playing') {
        return (
            <main className="game-container" style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.82)',
                    borderRadius: '2rem', padding: '2.5rem 3rem',
                    width: '100%', maxWidth: '480px',
                    border: '2px solid rgba(33,150,243,0.4)',
                    backdropFilter: 'blur(10px)',
                }}>
                    {/* Back */}
                    <button
                        onClick={() => { setGameMode('menu'); setMpState('lobby'); setMpError('') }}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.25)',
                            color: '#ccc', padding: '0.4rem 1rem',
                            borderRadius: '0.5rem', cursor: 'pointer',
                            marginBottom: '1.5rem', fontSize: '0.9rem',
                        }}
                    >
                        ← Back
                    </button>

                    <h2 style={{
                        color: '#2196f3', fontSize: '2rem',
                        marginBottom: '1.5rem', textAlign: 'center',
                    }}>
                        🌐 Multiplayer
                    </h2>

                    {/* ---- LOBBY ---- */}
                    {mpState === 'lobby' && (
                        <>
                            <div style={{ marginBottom: '1.2rem' }}>
                                <label style={{ color: '#ccc', display: 'block', marginBottom: '0.4rem' }}>
                                    Your Name
                                </label>
                                <input
                                    type="text"
                                    value={myPlayerName}
                                    onChange={e => setMyPlayerName(e.target.value)}
                                    placeholder="Enter your name…"
                                    maxLength={16}
                                    style={{
                                        width: '100%', padding: '0.8rem 1rem',
                                        borderRadius: '0.7rem',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(255,255,255,0.1)',
                                        color: 'white', fontSize: '1rem',
                                        boxSizing: 'border-box',
                                        outline: 'none',
                                    }}
                                />
                            </div>

                            <button
                                onClick={createRoom}
                                style={{
                                    width: '100%', padding: '1rem', marginBottom: '1.5rem',
                                    background: 'linear-gradient(135deg,#4caf50,#2e7d32)',
                                    color: 'white', border: 'none', borderRadius: '0.8rem',
                                    cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold',
                                }}
                            >
                                🏠 Create Room
                            </button>

                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.2rem' }}>
                                <label style={{ color: '#ccc', display: 'block', marginBottom: '0.4rem' }}>
                                    Join with Room Code
                                </label>
                                <div style={{ display: 'flex', gap: '0.8rem' }}>
                                    <input
                                        type="text"
                                        value={inputRoomCode}
                                        onChange={e => setInputRoomCode(e.target.value.toUpperCase())}
                                        placeholder="e.g. ABC123"
                                        maxLength={6}
                                        style={{
                                            flex: 1, padding: '0.8rem 1rem',
                                            borderRadius: '0.7rem',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            background: 'rgba(255,255,255,0.1)',
                                            color: 'white', fontSize: '1rem',
                                            letterSpacing: '0.2em', outline: 'none',
                                        }}
                                    />
                                    <button
                                        onClick={joinRoom}
                                        style={{
                                            padding: '0.8rem 1.5rem',
                                            background: 'linear-gradient(135deg,#2196f3,#0d47a1)',
                                            color: 'white', border: 'none',
                                            borderRadius: '0.7rem', cursor: 'pointer',
                                            fontSize: '1rem', fontWeight: 'bold',
                                        }}
                                    >
                                        Join
                                    </button>
                                </div>
                            </div>

                            {mpError && (
                                <p style={{ color: '#f44336', marginTop: '1rem', textAlign: 'center' }}>
                                    ⚠️ {mpError}
                                </p>
                            )}
                        </>
                    )}

                    {/* ---- WAITING ---- */}
                    {mpState === 'waiting' && (
                        <>
                            {/* Room code display */}
                            <div style={{
                                background: 'rgba(255,215,0,0.08)',
                                border: '2px dashed rgba(255,215,0,0.5)',
                                borderRadius: '1rem', padding: '1.5rem',
                                textAlign: 'center', marginBottom: '1.5rem',
                            }}>
                                <p style={{ color: '#ccc', marginBottom: '0.4rem' }}>Room Code</p>
                                <p style={{
                                    fontSize: '3rem', fontWeight: 'bold', color: '#ffd700',
                                    letterSpacing: '0.3em', fontFamily: 'monospace',
                                }}>
                                    {roomCode}
                                </p>
                                <p style={{ color: '#aaa', fontSize: '0.85rem' }}>
                                    Share this code with friends
                                </p>
                            </div>

                            {/* Player list */}
                            <p style={{ color: '#ccc', marginBottom: '0.8rem' }}>
                                Players ({mpConnectedPlayers.length}/{mpPlayerCount})
                            </p>
                            {mpConnectedPlayers.map((p, i) => (
                                <div key={p.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.8rem',
                                    padding: '0.6rem 1rem',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '0.5rem', marginBottom: '0.4rem',
                                }}>
                                    <span style={{ color: '#4caf50' }}>✓</span>
                                    <span style={{ color: 'white' }}>{p.name}</span>
                                    {i === 0 && (
                                        <span style={{
                                            color: '#ffd700', fontSize: '0.8rem', marginLeft: 'auto',
                                        }}>
                                            HOST
                                        </span>
                                    )}
                                </div>
                            ))}
                            {Array.from({ length: Math.max(0, mpPlayerCount - mpConnectedPlayers.length) }).map((_, i) => (
                                <div key={`empty-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.8rem',
                                    padding: '0.6rem 1rem',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px dashed rgba(255,255,255,0.1)',
                                    borderRadius: '0.5rem', marginBottom: '0.4rem',
                                }}>
                                    <span style={{ color: '#555' }}>⏳</span>
                                    <span style={{ color: '#555' }}>Waiting…</span>
                                </div>
                            ))}

                            {/* Host controls */}
                            {isHost && (
                                <>
                                    <div style={{ margin: '1rem 0' }}>
                                        <label style={{ color: '#ccc', display: 'block', marginBottom: '0.4rem' }}>
                                            Max Players
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {[2, 3, 4].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => setMpPlayerCount(n)}
                                                    style={{
                                                        flex: 1, padding: '0.6rem',
                                                        background: mpPlayerCount === n
                                                            ? 'rgba(33,150,243,0.5)'
                                                            : 'rgba(255,255,255,0.05)',
                                                        color: 'white',
                                                        border: mpPlayerCount === n
                                                            ? '2px solid #2196f3'
                                                            : '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: '0.5rem', cursor: 'pointer',
                                                        fontSize: '1rem',
                                                    }}
                                                >
                                                    {n}P
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={startMultiplayerGame}
                                        disabled={mpConnectedPlayers.length < 2}
                                        style={{
                                            width: '100%', padding: '1rem',
                                            background: mpConnectedPlayers.length >= 2
                                                ? 'linear-gradient(135deg,#ff6b35,#f7931e)'
                                                : 'rgba(255,255,255,0.1)',
                                            color: 'white', border: 'none',
                                            borderRadius: '0.8rem',
                                            cursor: mpConnectedPlayers.length >= 2 ? 'pointer' : 'not-allowed',
                                            fontSize: '1.1rem', fontWeight: 'bold',
                                        }}
                                    >
                                        {mpConnectedPlayers.length >= 2
                                            ? '🚀 Start Game!'
                                            : `⏳ Need at least 2 players (${mpConnectedPlayers.length} joined)`}
                                    </button>
                                </>
                            )}

                            {!isHost && (
                                <p style={{ color: '#aaa', textAlign: 'center', marginTop: '1rem' }}>
                                    ⏳ Waiting for host to start…
                                </p>
                            )}

                            {mpError && (
                                <p style={{ color: '#f44336', marginTop: '1rem', textAlign: 'center' }}>
                                    ⚠️ {mpError}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </main>
        )
    }
    // #endregion

    // =====================================================================
    // #region GAME BOARD
    // =====================================================================
    return (
        <main className="game-container">

            {/* Back to menu */}
            <button
                onClick={() => {
                    setGameMode('menu')
                    setGameOn(false)
                    gameOnRef.current = false
                    setMpState('lobby')
                    setMpConnectedPlayers([])
                    setRoomCode('')
                }}
                style={{
                    position: 'fixed', top: '1rem', left: '1rem', zIndex: 200,
                    background: 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#ccc', padding: '0.4rem 0.8rem',
                    borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem',
                }}
            >
                ← Menu
            </button>

            {/* Mode badge */}
            <div style={{
                position: 'fixed', top: '1rem', right: '1rem', zIndex: 200,
                background: gameMode === 'ai'
                    ? 'rgba(76,175,80,0.25)'
                    : 'rgba(33,150,243,0.25)',
                border: `1px solid ${gameMode === 'ai' ? '#4caf50' : '#2196f3'}`,
                color: 'white', padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem', fontSize: '0.85rem',
            }}>
                {gameMode === 'ai' ? '🤖 vs AI' : `🌐 ${roomCode}`}
            </div>

            {/* OTHER PLAYERS */}
            {otherPlayers.map(op => {
                const isVertical = op.position === 'left' || op.position === 'right'
                const isMyTurn   = currentTurn === op.id
                const showFace   = gameMode === 'ai' ? (cpuVisible[op.id] ?? false) : false

                return (
                    <div key={op.id} className={`cpu-player ${getPositionClass(op.position)}`}>
                        <div className="cpu-info" style={{
                            border: isMyTurn
                                ? '2px solid #ffd700'
                                : '2px solid transparent',
                            borderRadius: '0.5rem',
                            padding: '0.2rem 0.5rem',
                            background: isMyTurn ? 'rgba(255,215,0,0.12)' : 'transparent',
                            transition: 'all 0.3s',
                        }}>
                            <div className="cpu-name">
                                {op.name}
                                {isMyTurn && ' 🎯'}
                                {op.isHuman && gameMode === 'multiplayer' && ' 👤'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#aaa' }}>
                                {op.hand.length} cards · {op.score} pts
                            </div>
                        </div>

                        <div className={isVertical ? 'cpu-hand-vertical' : 'cpu-hand'}>
                            {op.hand.map((card, i) => (
                                <Image
                                    key={i}
                                    src={showFace ? card.src : '/images/back.png'}
                                    alt="card"
                                    width={isVertical ? 90 : 60}
                                    height={isVertical ? 60 : 90}
                                    className={isVertical ? 'cpu-card-vertical' : 'cpu-card'}
                                />
                            ))}
                        </div>

                        {showUno[op.id] && (
                            <div className={
                                op.position === 'top'   ? 'cpu-animation-top'   :
                                op.position === 'left'  ? 'cpu-animation-left'  :
                                                          'cpu-animation-right'
                            }>
                                <Image src="/images/uno!.png" alt="UNO!" width={80} height={40} />
                            </div>
                        )}
                    </div>
                )
            })}

            {/* CENTER AREA */}
            <div className="center-area">
                <div className="turn-indicator">
                    <p className="turn-text">
                        {currentTurn === myPlayerId ? (
                            <span className="turn-player">🎮 YOUR TURN 🎮</span>
                        ) : (
                            <span className="turn-cpu">
                                🎯 {players.find(p => p.id === currentTurn)?.name ?? currentTurn}&apos;s TURN
                            </span>
                        )}
                    </p>
                    <p style={{ fontSize: '1.1rem', marginTop: '0.4rem', color: '#ffd700' }}>
                        📍 {getDirectionDisplay()}
                    </p>
                </div>

                <div className="last-played">
                    <p>📋 Last Played</p>
                    <p className="last-played-card">
                        {topCard && (
                            <>
                                {topCard.playedByPlayer ? '👤 ' : '🤖 '}
                                {getCardName(topCard)}
                                {topCard.drawValue > 0 && ` (+${topCard.drawValue})`}
                            </>
                        )}
                    </p>
                </div>

                <div className="table-cards">
                    {/* Play pile */}
                    <div className="play-pile">
                        {topCard && (
                            <Image
                                src={topCard.src}
                                alt="play pile"
                                width={120}
                                height={180}
                                style={{
                                    borderRadius: '10px',
                                    boxShadow: '0 0.8rem 1.6rem rgba(0,0,0,0.35)',
                                    transition: 'all 0.3s ease',
                                }}
                            />
                        )}
                    </div>

                    {/* Draw pile */}
                    <div
                        className="draw-pile"
                        onClick={handleDrawPileClick}
                        style={{
                            cursor: currentTurn === myPlayerId && !colorPickerOpen && gameOn
                                ? 'pointer' : 'not-allowed',
                            opacity: currentTurn === myPlayerId && !colorPickerOpen && gameOn
                                ? 1 : 0.55,
                        }}
                    >
                        <Image src="/images/back.png" alt="draw pile" width={120} height={180} />
                        <div className="draw-text">Draw Card</div>
                    </div>
                </div>

                {/* Score strip */}
                <div style={{
                    display: 'flex', gap: '1.2rem', flexWrap: 'wrap',
                    justifyContent: 'center', marginTop: '0.8rem',
                    background: 'rgba(0,0,0,0.45)',
                    borderRadius: '0.8rem', padding: '0.6rem 1.2rem',
                }}>
                    {players.map(p => (
                        <span key={p.id} style={{
                            color: p.id === myPlayerId ? '#ffd700' : '#ccc',
                            fontWeight: p.id === myPlayerId ? 'bold' : 'normal',
                            fontSize: '0.88rem',
                        }}>
                            {p.id === myPlayerId ? '👤' : p.isHuman ? '👥' : '🤖'} {p.name}: {p.score}
                        </span>
                    ))}
                </div>
            </div>

            {/* PLAYER HAND */}
            <div className="player-bottom">
                <div className="player-info">
                    <div className="player-name">
                        {myPlayer?.name ?? 'YOU'}
                        {currentTurn === myPlayerId && ' 🎯'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#aaa' }}>
                        {myPlayer?.hand.length ?? 0} cards · {myPlayer?.score ?? 0} pts
                    </div>
                </div>

                <div className="player-hand">
                    {(myPlayer?.hand ?? []).map((card, i) => {
                        const tc = playPile[playPile.length - 1]
                        const playable = tc && (
                            card.value === tc.value ||
                            card.color === tc.color  ||
                            card.color === 'any'      ||
                            tc.color   === 'any'
                        )
                        const canAct = currentTurn === myPlayerId && !colorPickerOpen && gameOn
                        return (
                            <Image
                                key={i}
                                src={card.src}
                                alt={`card-${i}`}
                                width={80}
                                height={120}
                                className="player-card"
                                onClick={() => handlePlayerCardClick(i)}
                                style={{
                                    cursor:       canAct && playable ? 'pointer' : 'not-allowed',
                                    opacity:      canAct ? (playable ? 1 : 0.45) : 0.6,
                                    transform:    canAct && playable ? 'translateY(-10px)' : 'none',
                                    outline:      canAct && playable
                                        ? '2px solid rgba(255,215,0,0.7)' : 'none',
                                    borderRadius: '6px',
                                    transition:   'transform 0.15s, opacity 0.15s',
                                }}
                            />
                        )
                    })}
                </div>

                {showUno[myPlayerId] && (
                    <div className="player-animation">
                        <Image src="/images/uno!.png" alt="UNO!" width={100} height={50} />
                    </div>
                )}
            </div>

            {/* COLOUR PICKER */}
            {colorPickerOpen && currentTurn === myPlayerId && (
                <div className="color-picker">
                    <p>🎨 SELECT A COLOR 🎨</p>
                    <div>
                        <button className="red"    onClick={() => handleColorChosen('rgb(255, 6, 0)')}>
                            🔴 RED
                        </button>
                        <button className="green"  onClick={() => handleColorChosen('rgb(0, 170, 69)')}>
                            🟢 GREEN
                        </button>
                        <button className="blue"   onClick={() => handleColorChosen('rgb(0, 150, 224)')}>
                            🔵 BLUE
                        </button>
                        <button className="yellow" onClick={() => handleColorChosen('rgb(255, 222, 0)')}>
                            🟡 YELLOW
                        </button>
                    </div>
                </div>
            )}

            {/* ROUND END */}
            {roundVisible && (
                <div className="end-of-round">
                    <p>🏆 {roundWinner} won the round!</p>
                    {gameMode === 'ai' && (
                        <p style={{ fontSize: '0.9rem', color: '#aaa', marginTop: '0.4rem' }}>
                            Starting new round…
                        </p>
                    )}
                    {gameMode === 'multiplayer' && isHost && (
                        <button
                            onClick={handlePlayAgain}
                            style={{
                                marginTop: '1rem', padding: '0.6rem 1.5rem',
                                background: '#4caf50', color: 'white',
                                border: 'none', borderRadius: '0.5rem',
                                cursor: 'pointer', fontSize: '1rem',
                            }}
                        >
                            Next Round
                        </button>
                    )}
                </div>
            )}

            {/* GAME OVER */}
            {gameVisible && (
                <div className="end-of-game">
                    <p>🎉 {gameWinner} won the game!</p>
                    {(gameMode === 'ai' || isHost) && (
                        <button onClick={handlePlayAgain}>Play Again</button>
                    )}
                    <button
                        onClick={() => {
                            setGameVisible(false)
                            setGameMode('menu')
                            setMpState('lobby')
                        }}
                        style={{ marginTop: '0.5rem' }}
                    >
                        Main Menu
                    </button>
                </div>
            )}
        </main>
    )
    // #endregion
}
