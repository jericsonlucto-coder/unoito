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

// #region PUSHER HTTP API
const PUSHER_APP_ID = '2162488'
const PUSHER_KEY = '4de6e91a5e72dd9096db'
const PUSHER_SECRET = 'b9c26ec9196d0338ba7a'
const PUSHER_CLUSTER = 'ap1'

async function pusherTrigger(channel: string, event: string, data: unknown) {
    try {
        const body = JSON.stringify(data)
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const path = `/apps/${PUSHER_APP_ID}/events`

        const toSign = [
            'POST',
            path,
            [
                `auth_key=${PUSHER_KEY}`,
                `auth_timestamp=${timestamp}`,
                `auth_version=1.0`,
                `body_md5=${await md5(body)}`,
                `channel=${channel}`,
                `name=${event}`,
            ].sort().join('&'),
        ].join('\n')

        const signature = await hmacSHA256(PUSHER_SECRET, toSign)

        const params = new URLSearchParams({
            auth_key: PUSHER_KEY,
            auth_timestamp: timestamp,
            auth_version: '1.0',
            body_md5: await md5(body),
            channel,
            name: event,
            auth_signature: signature,
        })

        const url = `https://api-${PUSHER_CLUSTER}.pusher.com${path}?${params}`
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        })
    } catch (e) {
        console.error('Pusher trigger error:', e)
    }
}

async function md5(message: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(message)
    const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => null)
    if (!hashBuffer) {
        // Fallback simple hash for environments without MD5
        let hash = 0
        for (let i = 0; i < message.length; i++) {
            const char = message.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        return Math.abs(hash).toString(16).padStart(8, '0')
    }
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSHA256(secret: string, message: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(message)
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Pusher JS subscription (using Pusher JS CDN via dynamic script)
let pusherInstance: unknown = null
async function getPusherInstance(): Promise<unknown> {
    if (pusherInstance) return pusherInstance
    if (typeof window === 'undefined') return null
    // @ts-expect-error - Pusher loaded from CDN
    if (window.Pusher) {
        // @ts-expect-error - Pusher loaded from CDN
        pusherInstance = new window.Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER })
        return pusherInstance
    }
    return new Promise((resolve) => {
        const script = document.createElement('script')
        script.src = 'https://js.pusher.com/8.2.0/pusher.min.js'
        script.onload = () => {
            // @ts-expect-error - Pusher loaded from CDN
            pusherInstance = new window.Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER })
            resolve(pusherInstance)
        }
        document.head.appendChild(script)
    })
}
// #endregion

const GAME_OVER_SCORE = 100

// AI mode player order
const AI_PLAYER_ORDER: Player['id'][] = ['player', 'cpu2', 'cpu1', 'cpu3']

function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
}

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
    const [cpuVisible, setCpuVisible] = useState<{ [key: string]: boolean }>({
        cpu1: false, cpu2: false, cpu3: false,
    })
    const [direction, setDirection] = useState<'clockwise' | 'counter-clockwise'>('clockwise')

    // Multiplayer state
    const [mpState, setMpState] = useState<MultiplayerState>('lobby')
    const [roomCode, setRoomCode] = useState('')
    const [inputRoomCode, setInputRoomCode] = useState('')
    const [myPlayerId, setMyPlayerId] = useState<Player['id']>('player')
    const [myPlayerName, setMyPlayerName] = useState('Player 1')
    const [mpPlayerCount, setMpPlayerCount] = useState(2)
    const [mpConnectedPlayers, setMpConnectedPlayers] = useState<{ id: string; name: string }[]>([])
    const [mpError, setMpError] = useState('')
    const [isHost, setIsHost] = useState(false)
    const [mpChannel, setMpChannel] = useState<unknown>(null)
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
    const roomCodeRef = useRef(roomCode)
    const playerOrderRef = useRef(playerOrderState)

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
    useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
    useEffect(() => { playerOrderRef.current = playerOrderState }, [playerOrderState])
    // #endregion

    // #region AUDIO INIT
    useEffect(() => { audioManager.init() }, [])
    // #endregion

    // #region HELPERS
    const getPlayerById = useCallback((id: Player['id']) =>
        playersRef.current.find(p => p.id === id) || players.find(p => p.id === id)!,
    [players])

    const getNextTurn = useCallback((
        current: Player['id'],
        currentDirection: 'clockwise' | 'counter-clockwise',
        order: Player['id'][]
    ): Player['id'] => {
        const currentIndex = order.indexOf(current)
        let nextIndex: number
        if (currentDirection === 'clockwise') {
            nextIndex = (currentIndex + 1) % order.length
        } else {
            nextIndex = (currentIndex - 1 + order.length) % order.length
        }
        return order[nextIndex]
    }, [])

    const triggerUno = useCallback((playerId: string) => {
        audioManager.play('uno')
        setShowUno(prev => ({ ...prev, [playerId]: true }))
        setTimeout(() => {
            setShowUno(prev => ({ ...prev, [playerId]: false }))
        }, 2000)
    }, [])

    const tallyPoints = useCallback((hand: CardType[]): number => {
        return hand.reduce((sum, card) => sum + card.points, 0)
    }, [])

    const getCpuDelay = useCallback(() => {
        return Math.floor((Math.random() * 500) + 1000)
    }, [])
    // #endregion

    // #region MULTIPLAYER BROADCAST
    const broadcastGameState = useCallback(async (overrides?: Partial<{
        players: Player[]
        deck: CardType[]
        playPile: CardType[]
        currentTurn: Player['id']
        direction: 'clockwise' | 'counter-clockwise'
        colorPickerOpen: boolean
        gameOn: boolean
    }>) => {
        if (gameModeRef.current !== 'multiplayer') return
        const channel = `uno-room-${roomCodeRef.current}`
        await pusherTrigger(channel, 'game-state', {
            players: overrides?.players ?? playersRef.current,
            deck: overrides?.deck ?? deckRef.current,
            playPile: overrides?.playPile ?? playPileRef.current,
            currentTurn: overrides?.currentTurn ?? currentTurnRef.current,
            direction: overrides?.direction ?? directionRef.current,
            colorPickerOpen: overrides?.colorPickerOpen ?? colorPickerRef.current,
            gameOn: overrides?.gameOn ?? gameOnRef.current,
            playerOrder: playerOrderRef.current,
        })
    }, [])
    // #endregion

    // #region CHECK FOR WINNER
    const checkForWinner = useCallback((currentPlayers?: Player[]) => {
        const cp = currentPlayers ?? playersRef.current
        const winner = cp.find(p => p.hand.length === 0)
        if (winner) {
            const updatedPlayers = cp.map(p => {
                if (p.id === winner.id) {
                    const points = cp.reduce((sum, player) => {
                        if (player.id !== winner.id) return sum + tallyPoints(player.hand)
                        return sum
                    }, 0)
                    return { ...p, score: p.score + points }
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
            } else {
                setRoundWinner(winner.id === myPlayerIdRef.current ? 'You' : winner.name)
                setRoundVisible(true)
                setGameOn(false)
                gameOnRef.current = false
                audioManager.play('winRound')
                setTimeout(() => {
                    setRoundVisible(false)
                }, 3000)
            }
            return true
        }
        return false
    }, [tallyPoints])
    // #endregion

    // #region AI GAME
    const newAIGame = useCallback((existingScores?: { [key: string]: number }) => {
        setGameOn(true)
        gameOnRef.current = true
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setWildCardColor('')
        setSelectedWildColor('')
        setDirection('clockwise')
        directionRef.current = 'clockwise'
        setPlayerOrderState(AI_PLAYER_ORDER)
        playerOrderRef.current = AI_PLAYER_ORDER

        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)
        audioManager.play('shuffle')

        const newPlayers: Player[] = [
            { id: 'player', hand: [], score: existingScores?.player ?? 0, position: 'bottom', name: 'YOU', isHuman: true },
            { id: 'cpu1', hand: [], score: existingScores?.cpu1 ?? 0, position: 'top', name: 'CPU TOP', isHuman: false },
            { id: 'cpu2', hand: [], score: existingScores?.cpu2 ?? 0, position: 'left', name: 'CPU LEFT', isHuman: false },
            { id: 'cpu3', hand: [], score: existingScores?.cpu3 ?? 0, position: 'right', name: 'CPU RIGHT', isHuman: false },
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
        setPlayers(newPlayers)
        setDeckState(newDeck)
        setPlayPile(newPlayPile)
        setCurrentTurn('player')
        setMyPlayerId('player')
        currentTurnRef.current = 'player'
        playersRef.current = newPlayers
        deckRef.current = newDeck
        playPileRef.current = newPlayPile
        myPlayerIdRef.current = 'player'
    }, [])
    // #endregion

    // #region MULTIPLAYER SETUP
    const createRoom = useCallback(async () => {
        if (!myPlayerName.trim()) {
            setMpError('Please enter your name')
            return
        }
        const code = generateRoomCode()
        setRoomCode(code)
        roomCodeRef.current = code
        setIsHost(true)
        setMyPlayerId('player')
        myPlayerIdRef.current = 'player'

        const pusher = await getPusherInstance() as { subscribe: (ch: string) => unknown }
        const channel = pusher.subscribe(`uno-room-${code}`) as {
            bind: (event: string, cb: (data: unknown) => void) => void
        }
        setMpChannel(channel)

        const initialConnected = [{ id: 'player', name: myPlayerName }]
        setMpConnectedPlayers(initialConnected)

        channel.bind('player-joined', (data: { playerId: string; playerName: string }) => {
            setMpConnectedPlayers(prev => {
                if (prev.find(p => p.id === data.playerId)) return prev
                const updated = [...prev, { id: data.playerId, name: data.playerName }]
                return updated
            })
        })

        channel.bind('player-left', (data: { playerId: string }) => {
            setMpConnectedPlayers(prev => prev.filter(p => p.id !== data.playerId))
        })

        channel.bind('game-state', (data: {
            players: Player[]
            deck: CardType[]
            playPile: CardType[]
            currentTurn: Player['id']
            direction: 'clockwise' | 'counter-clockwise'
            colorPickerOpen: boolean
            gameOn: boolean
            playerOrder: Player['id'][]
        }) => {
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
        })

        channel.bind('uno-shout', (data: { playerId: string }) => {
            triggerUno(data.playerId)
        })

        channel.bind('round-winner', (data: { winnerId: string; winnerName: string }) => {
            setRoundWinner(data.winnerId === myPlayerIdRef.current ? 'You' : data.winnerName)
            setRoundVisible(true)
            setTimeout(() => setRoundVisible(false), 3000)
        })

        channel.bind('game-winner', (data: { winnerId: string; winnerName: string }) => {
            setGameWinner(data.winnerId === myPlayerIdRef.current ? 'You' : data.winnerName)
            setGameVisible(true)
            audioManager.play(data.winnerId === myPlayerIdRef.current ? 'winGame' : 'lose')
        })

        setMpState('waiting')
        setMpError('')
    }, [myPlayerName, triggerUno])

    const joinRoom = useCallback(async () => {
        if (!myPlayerName.trim()) {
            setMpError('Please enter your name')
            return
        }
        if (!inputRoomCode.trim()) {
            setMpError('Please enter a room code')
            return
        }
        const code = inputRoomCode.toUpperCase().trim()
        setRoomCode(code)
        roomCodeRef.current = code
        setIsHost(false)

        const pusher = await getPusherInstance() as { subscribe: (ch: string) => unknown }
        const channel = pusher.subscribe(`uno-room-${code}`) as {
            bind: (event: string, cb: (data: unknown) => void) => void
        }
        setMpChannel(channel)

        // Get slot from host
        channel.bind('slot-assigned', (data: { playerId: Player['id']; allPlayers: { id: string; name: string }[] }) => {
            if (data.playerId) {
                setMyPlayerId(data.playerId)
                myPlayerIdRef.current = data.playerId
            }
            if (data.allPlayers) {
                setMpConnectedPlayers(data.allPlayers)
            }
        })

        channel.bind('player-joined', (data: { playerId: string; playerName: string }) => {
            setMpConnectedPlayers(prev => {
                if (prev.find(p => p.id === data.playerId)) return prev
                return [...prev, { id: data.playerId, name: data.playerName }]
            })
        })

        channel.bind('player-left', (data: { playerId: string }) => {
            setMpConnectedPlayers(prev => prev.filter(p => p.id !== data.playerId))
        })

        channel.bind('game-state', (data: {
            players: Player[]
            deck: CardType[]
            playPile: CardType[]
            currentTurn: Player['id']
            direction: 'clockwise' | 'counter-clockwise'
            colorPickerOpen: boolean
            gameOn: boolean
            playerOrder: Player['id'][]
        }) => {
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
        })

        channel.bind('uno-shout', (data: { playerId: string }) => {
            triggerUno(data.playerId)
        })

        channel.bind('round-winner', (data: { winnerId: string; winnerName: string }) => {
            setRoundWinner(data.winnerId === myPlayerIdRef.current ? 'You' : data.winnerName)
            setRoundVisible(true)
            setTimeout(() => setRoundVisible(false), 3000)
        })

        channel.bind('game-winner', ( winnerName: string }) => {
            setGameWinner(data.winnerId === myPlayerIdRef.current ? 'You' : data.winnerName)
            setGameVisible(true)
            audioManager.play(data.winnerId === myPlayerIdRef.current ? 'winGame' : 'lose')
        })

        // Announce joining
        await pusherTrigger(`uno-room-${code}`, 'player-joined', {
            playerId: 'joining',
            playerName: myPlayerName,
            requestSlot: true,
        })

        setMpState('waiting')
        setMpError('')
    }, [myPlayerName, inputRoomCode, triggerUno])

    // Host assigns slot to new joiner
    useEffect(() => {
        if (!isHost || !mpChannel || gameMode !== 'multiplayer') return
        const channel = mpChannel as { bind: (event: string, cb: (data: unknown) => void) => void }
        channel.bind('player-joined', async (data: { playerId: string; playerName: string; requestSlot?: boolean }) => {
            if (!data.requestSlot) return
            const slots: Player['id'][] = ['p2', 'p3', 'p4']
            const usedIds = mpConnectedPlayers.map(p => p.id)
            const availableSlot = slots.find(s => !usedIds.includes(s))
            if (!availableSlot) return

            const newConnected = [...mpConnectedPlayers, { id: availableSlot, name: data.playerName }]
            setMpConnectedPlayers(newConnected)

            await pusherTrigger(`uno-room-${roomCode}`, 'slot-assigned', {
                playerId: availableSlot,
                allPlayers: newConnected,
            })
        })
    }, [isHost, mpChannel, mpConnectedPlayers, roomCode, gameMode])

    const startMultiplayerGame = useCallback(async () => {
        if (!isHost) return
        const count = mpConnectedPlayers.length
        if (count < 2) {
            setMpError('Need at least 2 players')
            return
        }

        const positions: Player['position'][] = ['bottom', 'top', 'left', 'right']
        const playerIds: Player['id'][] = ['player', 'p2', 'p3', 'p4']
        const order = playerIds.slice(0, count) as Player['id'][]

        const newPlayers: Player[] = mpConnectedPlayers.map((cp, i) => ({
            id: playerIds[i] as Player['id'],
            hand: [],
            score: 0,
            position: positions[i],
            name: cp.name,
            isHuman: true,
        }))

        // Fill remaining with CPU if needed (shouldn't happen in pure MP)
        while (newPlayers.length < 2) {
            newPlayers.push({
                id: `cpu${newPlayers.length}` as Player['id'],
                hand: [],
                score: 0,
                position: positions[newPlayers.length],
                name: `CPU ${newPlayers.length}`,
                isHuman: false,
            })
        }

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

        setPlayers(newPlayers)
        playersRef.current = newPlayers
        setDeckState(newDeck)
        deckRef.current = newDeck
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile
        setCurrentTurn('player')
        currentTurnRef.current = 'player'
        setDirection('clockwise')
        directionRef.current = 'clockwise'
        setPlayerOrderState(order)
        playerOrderRef.current = order
        setGameOn(true)
        gameOnRef.current = true
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setMpState('playing')

        await pusherTrigger(`uno-room-${roomCode}`, 'game-state', {
            players: newPlayers,
            deck: newDeck,
            playPile: newPlayPile,
            currentTurn: 'player',
            direction: 'clockwise',
            colorPickerOpen: false,
            gameOn: true,
            playerOrder: order,
        })

        audioManager.play('shuffle')
    }, [isHost, mpConnectedPlayers, roomCode])
    // #endregion

    // #region CPU LOGIC (AI mode only)
    const playCPU = useCallback(async (cpuId: Player['id']) => {
        if (currentTurnRef.current !== cpuId || !gameOnRef.current || colorPickerRef.current) return
        if (gameModeRef.current !== 'ai') return

        await new Promise(resolve => setTimeout(resolve, getCpuDelay()))
        if (currentTurnRef.current !== cpuId || !gameOnRef.current) return

        const order = playerOrderRef.current
        const cpu = playersRef.current.find(p => p.id === cpuId)!
        const currentPlayPile = [...playPileRef.current]
        const currentDeck = [...deckRef.current]
        const topCard = currentPlayPile[currentPlayPile.length - 1]
        const currentDirection = directionRef.current

        const playable: CardType[] = []
        const remaining: CardType[] = []
        for (const card of cpu.hand) {
            if (
                card.color === topCard.color ||
                card.value === topCard.value ||
                card.color === 'any' ||
                topCard.color === 'any'
            ) {
                playable.push(card)
            } else {
                remaining.push(card)
            }
        }

        if (playable.length === 0) {
            let newDeck = [...currentDeck]
            let newPlayPile = [...currentPlayPile]
            let drawnCard: CardType | null = null
            let newHand = [...cpu.hand]

            if (newDeck.length > 0) {
                drawnCard = newDeck.shift()!
                newHand.push(drawnCard)
            } else if (newPlayPile.length > 1) {
                const cardsToShuffle = newPlayPile.slice(0, -1)
                newDeck = shuffleDeck(cardsToShuffle)
                newPlayPile = [newPlayPile[newPlayPile.length - 1]]
                drawnCard = newDeck.shift()!
                newHand.push(drawnCard)
            }

            audioManager.play('drawCard')
            const updatedPlayers = playersRef.current.map(p =>
                p.id === cpuId ? { ...p, hand: newHand } : p
            )
            setPlayers(updatedPlayers)
            playersRef.current = updatedPlayers
            setDeckState(newDeck)
            deckRef.current = newDeck
            setPlayPile(newPlayPile)
            playPileRef.current = newPlayPile

            if (drawnCard) {
                const newTopCard = newPlayPile[newPlayPile.length - 1]
                const canPlay =
                    drawnCard.color === newTopCard.color ||
                    drawnCard.value === newTopCard.value ||
                    drawnCard.color === 'any' ||
                    newTopCard.color === 'any'
                if (canPlay && gameOnRef.current && currentTurnRef.current === cpuId) {
                    setTimeout(() => {
                        if (currentTurnRef.current === cpuId && gameOnRef.current && !colorPickerRef.current) {
                            playCPU(cpuId)
                        }
                    }, getCpuDelay())
                    return
                }
            }

            const nextTurn = getNextTurn(cpuId, currentDirection, order)
            setCurrentTurn(nextTurn)
            currentTurnRef.current = nextTurn
            return
        }

        let chosenCard: CardType
        let leftoverCards: CardType[]
        if (playable.length === 1) {
            chosenCard = playable[0]
            leftoverCards = remaining
        } else {
            const highestValue = Math.max(...playable.map(c => c.value))
            const cardIndex = playable.findIndex(c => c.value === highestValue)
            chosenCard = playable[cardIndex]
            leftoverCards = [...remaining, ...playable.filter((_, i) => i !== cardIndex)]
        }

        audioManager.playCardSound()
        const newPlayPile = [...currentPlayPile, { ...chosenCard, playedByPlayer: false }]
        const newCpuHand = [...leftoverCards]

        if (chosenCard.color === 'any' && chosenCard.drawValue === 0) {
            const colors = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            const pickedColor = colors[Math.floor(Math.random() * colors.length)]
            newPlayPile[newPlayPile.length - 1].color = pickedColor
            setWildCardColor(pickedColor)
            setSelectedWildColor(pickedColor)
            selectedWildColorRef.current = pickedColor
        }

        let newDirection = currentDirection
        if (chosenCard.value === 10) {
            newDirection = currentDirection === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDirection)
            directionRef.current = newDirection
        }

        if (chosenCard.drawValue > 0) {
            audioManager.play('plusCard')
            const nextPlayerId = getNextTurn(cpuId, newDirection, order)
            const nextPlayer = playersRef.current.find(p => p.id === nextPlayerId)!
            let updatedHand = [...nextPlayer.hand]
            let updatedDeck = [...currentDeck]
            let updatedPlayPile = [...newPlayPile]

            for (let i = 0; i < chosenCard.drawValue; i++) {
                let nd = [...updatedDeck]
                let np = [...updatedPlayPile]
                if (nd.length > 0) {
                    updatedHand.push(nd.shift()!)
                } else if (np.length > 1) {
                    const cardsToShuffle = np.slice(0, -1)
                    nd = shuffleDeck(cardsToShuffle)
                    np = [np[np.length - 1]]
                    updatedHand.push(nd.shift()!)
                }
                updatedDeck = nd
                updatedPlayPile = np
                audioManager.play('drawCard')
            }

            const updatedPlayers = playersRef.current.map(p => {
                if (p.id === nextPlayerId) return { ...p, hand: updatedHand }
                if (p.id === cpuId) return { ...p, hand: newCpuHand }
                return p
            })
            setPlayers(updatedPlayers)
            playersRef.current = updatedPlayers
            setDeckState(updatedDeck)
            deckRef.current = updatedDeck
            setPlayPile(updatedPlayPile)
            playPileRef.current = updatedPlayPile
        } else {
            const updatedPlayers = playersRef.current.map(p =>
                p.id === cpuId ? { ...p, hand: newCpuHand } : p
            )
            setPlayers(updatedPlayers)
            playersRef.current = updatedPlayers
            setPlayPile(newPlayPile)
            playPileRef.current = newPlayPile
        }

        if (newCpuHand.length === 1) triggerUno(cpuId)
        if (newCpuHand.length === 0) {
            checkForWinner()
            return
        }

        let nextTurn: Player['id']
        if (chosenCard.value === 11) {
            nextTurn = getNextTurn(getNextTurn(cpuId, newDirection, order), newDirection, order)
        } else {
            nextTurn = getNextTurn(cpuId, newDirection, order)
        }
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
    }, [triggerUno, checkForWinner, getCpuDelay, getNextTurn])
    // #endregion

    // #region PLAYER ACTIONS
    const handlePlayerCardClick = useCallback(async (index: number) => {
        if (currentTurnRef.current !== myPlayerIdRef.current || colorPickerRef.current || !gameOnRef.current) return

        const order = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)!
        const currentPlayPile = [...playPileRef.current]
        const topCard = currentPlayPile[currentPlayPile.length - 1]
        const card = player.hand[index]
        const currentDirection = directionRef.current

        const isPlayable =
            card.value === topCard.value ||
            card.color === topCard.color ||
            card.color === 'any' ||
            topCard.color === 'any'

        if (!isPlayable) return

        audioManager.playCardSound()
        const newPlayerHand = player.hand.filter((_, i) => i !== index)
        const playedCard = { ...card, playedByPlayer: true }
        const newPlayPile = [...currentPlayPile, playedCard]

        let newDirection = currentDirection
        if (playedCard.value === 10) {
            newDirection = currentDirection === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDirection)
            directionRef.current = newDirection
        }

        const updatedPlayers = playersRef.current.map(p =>
            p.id === myPlayerIdRef.current ? { ...p, hand: newPlayerHand } : p
        )
        setPlayers(updatedPlayers)
        playersRef.current = updatedPlayers
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        if (playedCard.color !== 'any') {
            setWildCardColor('')
            setSelectedWildColor('')
            selectedWildColorRef.current = ''
        }

        if (newPlayerHand.length === 1) {
            triggerUno(myPlayerIdRef.current)
            if (gameModeRef.current === 'multiplayer') {
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'uno-shout', {
                    playerId: myPlayerIdRef.current,
                })
            }
        }

        if (playedCard.drawValue > 0) {
            audioManager.play('plusCard')
            const nextPlayerId = getNextTurn(myPlayerIdRef.current, newDirection, order)
            const nextPlayer = playersRef.current.find(p => p.id === nextPlayerId)!
            let updatedHand = [...nextPlayer.hand]
            let updatedDeck = [...deckRef.current]
            let updatedPlayPile = [...newPlayPile]

            for (let i = 0; i < playedCard.drawValue; i++) {
                let nd = [...updatedDeck]
                let np = [...updatedPlayPile]
                if (nd.length > 0) {
                    updatedHand.push(nd.shift()!)
                } else if (np.length > 1) {
                    const cardsToShuffle = np.slice(0, -1)
                    nd = shuffleDeck(cardsToShuffle)
                    np = [np[np.length - 1]]
                    updatedHand.push(nd.shift()!)
                }
                updatedDeck = nd
                updatedPlayPile = np
                audioManager.play('drawCard')
            }

            const finalPlayers = playersRef.current.map(p => {
                if (p.id === nextPlayerId) return { ...p, hand: updatedHand }
                return p
            })
            setPlayers(finalPlayers)
            playersRef.current = finalPlayers
            setDeckState(updatedDeck)
            deckRef.current = updatedDeck
            setPlayPile(updatedPlayPile)
            playPileRef.current = updatedPlayPile
        }

        if (newPlayerHand.length === 0) {
            const won = checkForWinner(playersRef.current)
            if (won && gameModeRef.current === 'multiplayer') {
                const winner = playersRef.current.find(p => p.id === myPlayerIdRef.current)!
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'round-winner', {
                    winnerId: winner.id,
                    winnerName: winner.name,
                })
            }
            return
        }

        if (playedCard.color === 'any' && playedCard.drawValue === 0) {
            setColorPickerOpen(true)
            colorPickerRef.current = true
            if (gameModeRef.current === 'multiplayer') {
                await broadcastGameState({ colorPickerOpen: true })
            }
            return
        }

        let nextTurn: Player['id']
        if (playedCard.value === 11) {
            nextTurn = getNextTurn(getNextTurn(myPlayerIdRef.current, newDirection, order), newDirection, order)
        } else {
            nextTurn = getNextTurn(myPlayerIdRef.current, newDirection, order)
        }
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastGameState({ currentTurn: nextTurn, direction: newDirection })
        }
    }, [triggerUno, checkForWinner, getNextTurn, broadcastGameState])

    const handleDrawPileClick = useCallback(async () => {
        if (currentTurnRef.current !== myPlayerIdRef.current || colorPickerRef.current || !gameOnRef.current) return

        const order = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)!
        const currentDeck = [...deckRef.current]
        const currentPlayPile = [...playPileRef.current]
        const currentDirection = directionRef.current

        let newDeck = [...currentDeck]
        let newPlayPile = [...currentPlayPile]
        let drawnCard: CardType | null = null
        let newPlayerHand = [...player.hand]

        if (newDeck.length > 0) {
            drawnCard = newDeck.shift()!
            newPlayerHand.push(drawnCard)
        } else if (newPlayPile.length > 1) {
            const cardsToShuffle = newPlayPile.slice(0, -1)
            newDeck = shuffleDeck(cardsToShuffle)
            newPlayPile = [newPlayPile[newPlayPile.length - 1]]
            drawnCard = newDeck.shift()!
            newPlayerHand.push(drawnCard)
        } else {
            return
        }

        audioManager.play('drawCard')

        const updatedPlayers = playersRef.current.map(p =>
            p.id === myPlayerIdRef.current ? { ...p, hand: newPlayerHand } : p
        )
        setPlayers(updatedPlayers)
        playersRef.current = updatedPlayers
        setDeckState(newDeck)
        deckRef.current = newDeck
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        if (drawnCard) {
            const topCard = newPlayPile[newPlayPile.length - 1]
            const canPlay =
                drawnCard.color === topCard.color ||
                drawnCard.value === topCard.value ||
                drawnCard.color === 'any' ||
                topCard.color === 'any'
            if (canPlay) {
                if (gameModeRef.current === 'multiplayer') {
                    await broadcastGameState({
                        players: updatedPlayers,
                        deck: newDeck,
                        playPile: newPlayPile,
                    })
                }
                return
            }
        }

        const nextTurn = getNextTurn(myPlayerIdRef.current, currentDirection, order)
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastGameState({
                players: updatedPlayers,
                deck: newDeck,
                playPile: newPlayPile,
                currentTurn: nextTurn,
            })
        }
    }, [getNextTurn, broadcastGameState])

    const handleColorChosen = useCallback(async (color: string) => {
        audioManager.play('colorButton')
        const order = playerOrderRef.current
        const newPlayPile = [...playPileRef.current]
        newPlayPile[newPlayPile.length - 1] = {
            ...newPlayPile[newPlayPile.length - 1],
            color,
        }
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setWildCardColor(color)
        setSelectedWildColor(color)
        selectedWildColorRef.current = color

        const nextTurn = getNextTurn(myPlayerIdRef.current, directionRef.current, order)
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastGameState({
                playPile: newPlayPile,
                colorPickerOpen: false,
                currentTurn: nextTurn,
            })
        }
    }, [getNextTurn, broadcastGameState])
    // #endregion

    // #region AUTO CPU TURN
    useEffect(() => {
        if (gameMode === 'ai' && gameOn && currentTurn !== 'player' && !colorPickerOpen) {
            const player = players.find(p => p.id === currentTurn)
            if (player && !player.isHuman) {
                playCPU(currentTurn)
            }
        }
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
    const topCard = playPile[playPile.length - 1]
    const myPlayer = players.find(p => p.id === myPlayerId)

    const getCardName = (card: CardType) => {
        if (card.color === 'any') return card.drawValue === 4 ? 'Wild Draw 4' : 'Wild Card'
        const colorNames: Record<string, string> = {
            'rgb(255, 6, 0)': 'Red',
            'rgb(0, 170, 69)': 'Green',
            'rgb(0, 150, 224)': 'Blue',
            'rgb(255, 222, 0)': 'Yellow'
        }
        const valueNames: Record<number, string> = {
            10: 'Reverse', 11: 'Skip', 12: 'Draw 2', 13: 'Wild Card', 14: 'Wild Draw 4'
        }
        const value = valueNames[card.value] || card.value.toString()
        return `${colorNames[card.color] || card.color} ${value}`
    }

    const getDirectionDisplay = () =>
        direction === 'clockwise' ? 'CLOCKWISE →' : 'COUNTER-CLOCKWISE ←'

    // Get other players relative to myPlayer
    const getOtherPlayers = () => {
        return players.filter(p => p.id !== myPlayerId)
    }

    const getPositionStyle = (position: Player['position']) => {
        switch (position) {
            case 'top': return 'cpu-top'
            case 'left': return 'cpu-left'
            case 'right': return 'cpu-right'
            default: return ''
        }
    }
    // #endregion

    // #region MENU JSX
    if (gameMode === 'menu') {
        return (
            <main className="game-container" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                gap: '2rem',
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.7)',
                    borderRadius: '2rem',
                    padding: '3rem 4rem',
                    textAlign: 'center',
                    border: '2px solid rgba(255,215,0,0.4)',
                    backdropFilter: 'blur(10px)',
                }}>
                    <h1 style={{
                        fontSize: '4rem',
                        fontWeight: 'bold',
                        color: '#ffd700',
                        textShadow: '0 0 20px rgba(255,215,0,0.5)',
                        marginBottom: '0.5rem',
                    }}>🃏 UNO</h1>
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
                                padding: '1.2rem 3rem',
                                fontSize: '1.4rem',
                                fontWeight: 'bold',
                                background: 'linear-gradient(135deg, #4caf50, #2e7d32)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '1rem',
                                cursor: 'pointer',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                boxShadow: '0 4px 15px rgba(76,175,80,0.4)',
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
                                padding: '1.2rem 3rem',
                                fontSize: '1.4rem',
                                fontWeight: 'bold',
                                background: 'linear-gradient(135deg, #2196f3, #0d47a1)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '1rem',
                                cursor: 'pointer',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                boxShadow: '0 4px 15px rgba(33,150,243,0.4)',
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

    // #region MULTIPLAYER LOBBY JSX
    if (gameMode === 'multiplayer' && mpState !== 'playing') {
        return (
            <main className="game-container" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                gap: '1.5rem',
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.8)',
                    borderRadius: '2rem',
                    padding: '2.5rem 3rem',
                    width: '100%',
                    maxWidth: '500px',
                    border: '2px solid rgba(33,150,243,0.4)',
                    backdropFilter: 'blur(10px)',
                }}>
                    <button
                        onClick={() => { setGameMode('menu'); setMpState('lobby'); setMpError('') }}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.3)',
                            color: '#ccc',
                            padding: '0.4rem 1rem',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            marginBottom: '1.5rem',
                            fontSize: '0.9rem',
                        }}
                    >
                        ← Back
                    </button>
                    <h2 style={{ color: '#2196f3', fontSize: '2rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                        🌐 Multiplayer
                    </h2>

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
                                    placeholder="Enter your name..."
                                    maxLength={16}
                                    style={{
                                        width: '100%',
                                        padding: '0.8rem 1rem',
                                        borderRadius: '0.7rem',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(255,255,255,0.1)',
                                        color: 'white',
                                        fontSize: '1rem',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                                <button
                                    onClick={createRoom}
                                    style={{
                                        flex: 1,
                                        padding: '1rem',
                                        background: 'linear-gradient(135deg, #4caf50, #2e7d32)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '0.8rem',
                                        cursor: 'pointer',
                                        fontSize: '1rem',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    🏠 Create Room
                                </button>
                            </div>
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
                                            flex: 1,
                                            padding: '0.8rem 1rem',
                                            borderRadius: '0.7rem',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            background: 'rgba(255,255,255,0.1)',
                                            color: 'white',
                                            fontSize: '1rem',
                                            letterSpacing: '0.2em',
                                        }}
                                    />
                                    <button
                                        onClick={joinRoom}
                                        style={{
                                            padding: '0.8rem 1.5rem',
                                            background: 'linear-gradient(135deg, #2196f3, #0d47a1)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '0.7rem',
                                            cursor: 'pointer',
                                            fontSize: '1rem',
                                            fontWeight: 'bold',
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

                    {mpState === 'waiting' && (
                        <>
                            <div style={{
                                background: 'rgba(255,215,0,0.1)',
                                border: '2px dashed rgba(255,215,0,0.5)',
                                borderRadius: '1rem',
                                padding: '1.5rem',
                                textAlign: 'center',
                                marginBottom: '1.5rem',
                            }}>
                                <p style={{ color: '#ccc', marginBottom: '0.5rem' }}>Room Code</p>
                                <p style={{
                                    fontSize: '3rem',
                                    fontWeight: 'bold',
                                    color: '#ffd700',
                                    letterSpacing: '0.3em',
                                    fontFamily: 'monospace',
                                }}>
                                    {roomCode}
                                </p>
                                <p style={{ color: '#aaa', fontSize: '0.85rem' }}>
                                    Share this code with friends
                                </p>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <p style={{ color: '#ccc', marginBottom: '0.8rem' }}>
                                    Players ({mpConnectedPlayers.length}/{mpPlayerCount})
                                </p>
                                {mpConnectedPlayers.map((p, i) => (
                                    <div key={p.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.8rem',
                                        padding: '0.6rem 1rem',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '0.5rem',
                                        marginBottom: '0.4rem',
                                    }}>
                                        <span style={{ color: '#4caf50' }}>✓</span>
                                        <span style={{ color: 'white' }}>{p.name}</span>
                                        {i === 0 && <span style={{ color: '#ffd700', fontSize: '0.8rem', marginLeft: 'auto' }}>HOST</span>}
                                    </div>
                                ))}
                                {Array.from({ length: Math.max(0, mpPlayerCount - mpConnectedPlayers.length) }).map((_, i) => (
                                    <div key={`empty-${i}`} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.8rem',
                                        padding: '0.6rem 1rem',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderRadius: '0.5rem',
                                        marginBottom: '0.4rem',
                                        border: '1px dashed rgba(255,255,255,0.1)',
                                    }}>
                                        <span style={{ color: '#666' }}>⏳</span>
                                        <span style={{ color: '#666' }}>Waiting...</span>
                                    </div>
                                ))}
                            </div>

                            {isHost && (
                                <>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ color: '#ccc', display: 'block', marginBottom: '0.4rem' }}>
                                            Max Players
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {[2, 3, 4].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => setMpPlayerCount(n)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '0.6rem',
                                                        background: mpPlayerCount === n
                                                            ? 'rgba(33,150,243,0.6)'
                                                            : 'rgba(255,255,255,0.05)',
                                                        color: 'white',
                                                        border: mpPlayerCount === n
                                                            ? '2px solid #2196f3'
                                                            : '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: '0.5rem',
                                                        cursor: 'pointer',
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
                                            width: '100%',
                                            padding: '1rem',
                                            background: mpConnectedPlayers.length >= 2
                                                ? 'linear-gradient(135deg, #ff6b35, #f7931e)'
                                                : 'rgba(255,255,255,0.1)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '0.8rem',
                                            cursor: mpConnectedPlayers.length >= 2 ? 'pointer' : 'not-allowed',
                                            fontSize: '1.1rem',
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        {mpConnectedPlayers.length >= 2
                                            ? '🚀 Start Game!'
                                            : `⏳ Waiting for players... (${mpConnectedPlayers.length}/${Math.min(mpPlayerCount, 2)} min)`}
                                    </button>
                                </>
                            )}
                            {!isHost && (
                                <p style={{ color: '#aaa', textAlign: 'center' }}>
                                    ⏳ Waiting for host to start the game...
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

    // #region GAME JSX
    const otherPlayers = getOtherPlayers()

    return (
        <main className="game-container">
            {/* BACK TO MENU */}
            <button
                onClick={() => {
                    setGameMode('menu')
                    setGameOn(false)
                    setMpState('lobby')
                    setMpConnectedPlayers([])
                    setRoomCode('')
                }}
                style={{
                    position: 'fixed',
                    top: '1rem',
                    left: '1rem',
                    zIndex: 100,
                    background: 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#ccc',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                }}
            >
                ← Menu
            </button>

            {/* MODE INDICATOR */}
            <div style={{
                position: 'fixed',
                top: '1rem',
                right: '1rem',
                zIndex: 100,
                background: gameMode === 'ai'
                    ? 'rgba(76,175,80,0.3)'
                    : 'rgba(33,150,243,0.3)',
                border: `1px solid ${gameMode === 'ai' ? '#4caf50' : '#2196f3'}`,
                color: 'white',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
            }}>
                {gameMode === 'ai' ? '🤖 vs AI' : `🌐 Room: ${roomCode}`}
            </div>

            {/* OTHER PLAYERS */}
            {otherPlayers.map(op => {
                const posClass = getPositionStyle(op.position)
                const isVertical = op.position === 'left' || op.position === 'right'
                const isMyTurn = currentTurn === op.id
                return (
                    <div key={op.id} className={`cpu-player ${posClass}`}>
                        <div className="cpu-info" style={{
                            border: isMyTurn ? '2px solid #ffd700' : '2px solid transparent',
                            borderRadius: '0.5rem',
                            padding: '0.2rem 0.5rem',
                            background: isMyTurn ? 'rgba(255,215,0,0.15)' : 'transparent',
                        }}>
                            <div className="cpu-name">
                                {op.name}
                                {isMyTurn && ' 🎯'}
                                {op.isHuman && gameMode === 'multiplayer' && ' 👤'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#aaa' }}>
                                {op.hand.length} cards | {op.score}pts
                            </div>
                        </div>
                        <div className={isVertical ? 'cpu-hand-vertical' : 'cpu-hand'}>
                            {op.hand.map((card, i) => {
                                const showCard = gameMode === 'multiplayer' && op.isHuman
                                    ? false
                                    : cpuVisible[op.id]
                                return (
                                    <Image
                                        key={i}
                                        src={showCard ? card.src : '/images/back.png'}
                                        alt="card"
                                        width={isVertical ? 90 : 60}
                                        height={isVertical ? 60 : 90}
                                        className={isVertical ? 'cpu-card-vertical' : 'cpu-card'}
                                    />
                                )
                            })}
                        </div>
                        {showUno[op.id] && (
                            <div className={
                                op.position === 'top' ? 'cpu-animation-top' :
                                op.position === 'left' ? 'cpu-animation-left' :
                                'cpu-animation-right'
                            }>
                                <Image src="/images/uno!.png" alt="UNO!" width={80} height={40} />
                            </div>
                        )}
                    </div>
                )
            })}

            {/* CENTER PLAY AREA */}
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
                    <p style={{ fontSize: '1.2rem', marginTop: '0.5rem', color: '#ffd700' }}>
                        📍 {getDirectionDisplay()}
                    </p>
                </div>

                <div className="last-played">
                    <p>📋 Last Played</p>
                    <p className="last-played-card">
                        {topCard && getCardName(topCard)}
                        {topCard?.drawValue && topCard.drawValue > 0 ? ` (+${topCard.drawValue})` : ''}
                    </p>
                </div>

                <div className="table-cards">
                    <div className="play-pile">
                        {topCard && (
                            <Image
                                src={topCard.src}
                                alt="play pile"
                                width={120}
                                height={180}
                                style={{
                                    borderRadius: '10px',
                                    boxShadow: '0 0.8rem 1.6rem rgba(0,0,0,0.3)',
                                    transition: 'all 0.3s ease',
                                }}
                            />
                        )}
                    </div>
                    <div
                        className="draw-pile"
                        onClick={handleDrawPileClick}
                        style={{
                            cursor: currentTurn === myPlayerId && !colorPickerOpen && gameOn ? 'pointer' : 'not-allowed',
                            opacity: currentTurn === myPlayerId && !colorPickerOpen && gameOn ? 1 : 0.6,
                        }}
                    >
                        <Image src="/images/back.png" alt="draw pile" width={120} height={180} />
                        <div className="draw-text">Draw Card</div>
                    </div>
                </div>

                {/* Scores */}
                <div style={{
                    background: 'rgba(0,0,0,0.5)',
                    borderRadius: '0.8rem',
                    padding: '0.8rem 1.5rem',
                    marginTop: '0.8rem',
                    display: 'flex',
                    gap: '1.5rem',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                }}>
                    {players.map(p => (
                        <span key={p.id} style={{
                            color: p.id === myPlayerId ? '#ffd700' : '#ccc',
                            fontWeight: p.id === myPlayerId ? 'bold' : 'normal',
                            fontSize: '0.9rem',
                        }}>
                            {p.id === myPlayerId ? '👤' : '🤖'} {p.name}: {p.score}pts
                        </span>
                    ))}
                </div>
            </div>

            {/* PLAYER BOTTOM */}
            <div className="player-bottom">
                <div className="player-info">
                    <div className="player-name">
                        {myPlayer?.name ?? 'YOU'}
                        {currentTurn === myPlayerId && ' 🎯'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#aaa' }}>
                        {myPlayer?.hand.length ?? 0} cards | {myPlayer?.score ?? 0}pts
                    </div>
                </div>
                <div className="player-hand">
                    {(myPlayer?.hand ?? []).map((card, i) => {
                        const topC = playPile[playPile.length - 1]
                        const isPlayable = topC && (
                            card.value === topC.value ||
                            card.color === topC.color ||
                            card.color === 'any' ||
                            topC.color === 'any'
                        )
                        const canAct = currentTurn === myPlayerId && !colorPickerOpen && gameOn
                        return (
                            <Image
                                key={i}
                                src={card.src}
                                alt={`card ${i}`}
                                width={80}
                                height={120}
                                className="player-card"
                                onClick={() => handlePlayerCardClick(i)}
                                style={{
                                    cursor: canAct && isPlayable ? 'pointer' : 'not-allowed',
                                    opacity: canAct ? (isPlayable ? 1 : 0.5) : 0.6,
                                    transform: canAct && isPlayable ? 'translateY(-8px)' : 'translateY(0)',
                                    transition: 'transform 0.2s, opacity 0.2s',
                                    outline: canAct && isPlayable ? '2px solid rgba(255,215,0,0.6)' : 'none',
                                    borderRadius: '6px',
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

            {/* COLOR PICKER */}
            {colorPickerOpen && currentTurn === myPlayerId && (
                <div className="color-picker">
                    <p>🎨 SELECT A COLOR 🎨</p>
                    <div>
                        <button className="red" onClick={() => handleColorChosen('rgb(255, 6, 0)')}>🔴 RED</button>
                        <button className="green" onClick={() => handleColorChosen('rgb(0, 170, 69)')}>🟢 GREEN</button>
                        <button className="blue" onClick={() => handleColorChosen('rgb(0, 150, 224)')}>🔵 BLUE</button>
                        <button className="yellow" onClick={() => handleColorChosen('rgb(255, 222, 0)')}>🟡 YELLOW</button>
                    </div>
                </div>
            )}

            {/* END OF ROUND MODAL */}
            {roundVisible && (
                <div className="end-of-round">
                    <p>🏆 {roundWinner} won the round!</p>
                    {gameMode === 'ai' && (
                        <p style={{ fontSize: '0.9rem', color: '#aaa', marginTop: '0.5rem' }}>
                            Starting new round...
                        </p>
                    )}
                    {gameMode === 'multiplayer' && isHost && (
                        <button
                            onClick={handlePlayAgain}
                            style={{
                                marginTop: '1rem',
                                padding: '0.6rem 1.5rem',
                                background: '#4caf50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontSize: '1rem',
                            }}
                        >
                            Next Round
                        </button>
                    )}
                </div>
            )}

            {/* END OF GAME MODAL */}
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
