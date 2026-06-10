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
            setRoundVisible(false)
            setRoundWinner(null)
            setGameVisible(false)
            setGameWinner(null)
            setShowUno({})
            setColorPickerOpen(false)
            if (mpChannel) {
                try { mpChannel.unbind_all() } catch (e) { console.error('Cleanup error:', e) }
            }
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
                        let updDeck = [...deckRef.current], updPile = [...updatedPlayPile]
                        for (let i = 0; i < drawAmount; i++) {
                            if (updDeck.length > 0) { drawPlayer.hand.push(updDeck.shift()!); audioManager.play('drawCard') }
                            else if (updPile.length > 1) {
                                updDeck = shuffleDeck(updPile.slice(0, -1))
                                updPile = [updPile[updPile.length - 1]]
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
            const hand = info.hand.map((cardData: any) =>
                new Card(cardData.color, cardData.value, cardData.points,
                    cardData.value === 0 || (cardData.value >= 1 && cardData.value <= 9),
                    cardData.drawValue, cardData.src)
            )
            return { id: info.id as Player['id'], hand, score: info.score || 0, position, name: isMe ? `${info.name} (You)` : info.name, isHuman: true }
        })
        let startCardObj: CardType = new Card('rgb(255, 6, 0)', 0, 0, true, 0, '/images/red0.png')
        if (startCard) startCardObj = new Card(startCard.color, startCard.value, startCard.points,
            startCard.value === 0 || (startCard.value >= 1 && startCard.value <= 9), startCard.drawValue, startCard.src)
        const newPlayPile = [startCardObj]
        let currentDeck = shuffleDeck(createDeck())
        const currentPlayers = [...initializedPlayers]
        if (drawAmount && drawAmount > 0 && drawPlayerId) {
            const dp = currentPlayers.find(p => p.id === drawPlayerId)
            if (dp) {
                for (let i = 0; i < drawAmount; i++) if (currentDeck.length > 0) dp.hand.push(currentDeck.shift()!)
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
        setTimeout(() => { if (firstTurn === myPlayerIdRef.current) alert("It's your turn! 🎮") }, 500)
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
            setRoomCode(code); roomCodeRef.current = code
            setIsHost(true)
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
        if (!myPlayerName.trim())  { setMpError('Please enter your name');   return }
        if (!inputRoomCode.trim()) { setMpError('Please enter a room code'); return }
        if (joiningRef.current) return
        joiningRef.current = true
        try {
            const code = inputRoomCode.toUpperCase().trim()
            setRoomCode(code); roomCodeRef.current = code
            setIsHost(false); myPlayerNameRef.current = myPlayerName
            const tempId = ('temp_' + Date.now() + '_' + Math.random().toString(36).substring(7)) as Player['id']
            setMyPlayerId(tempId); myPlayerIdRef.current = tempId            const pusher = await getPusherInstance() as { subscribe: (ch: string) => PusherChannel }
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
        const newPlayers: Player[] = mpConnectedPlayers.map(cp => ({ id: cp.id as Player['id'], hand: [], score: 0, position: 'top', name: cp.name, isHuman: true }))
        let newDeck = shuffleDeck(createDeck())
        for (let i = 0; i < 7; i++) for (let j = 0; j < newPlayers.length; j++) if (newDeck.length > 0) newPlayers[j].hand.push(newDeck.shift()!)
        let startCardIndex = -1, startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) { if (newDeck[i].value >= 0 && newDeck[i].value <= 9 && newDeck[i].color !== 'any') { startCardIndex = i; startCard = newDeck[i]; break } }
        if (startCardIndex === -1) for (let i = 0; i < newDeck.length; i++) if (newDeck[i].color !== 'any') { startCardIndex = i; startCard = newDeck[i]; break }
        if (startCardIndex !== -1 && startCard) newDeck.splice(startCardIndex, 1)
        else if (newDeck.length > 0) startCard = newDeck.shift()!
        const firstPlayerIndex = Math.floor(Math.random() * playerOrder.length)
        let firstPlayer = playerOrder[firstPlayerIndex]
        let drawAmount = 0, drawPlayerId: Player['id'] | null = null
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
            playerOrder,
            startCard: startCard ? { color: startCard.color, value: startCard.value, points: startCard.points, drawValue: startCard.drawValue, src: startCard.src } : null,
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
        setMpState('lobby'); setMpConnectedPlayers([]); setMpError(''); setRoomCode(''); roomCodeRef.current = ''
        if (mpChannel) { try { mpChannel.unbind_all() } catch (e) { console.error('Error unbinding:', e) } setMpChannel(null) }
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
            { id: 'player', hand: [], score: existingScores?.player ?? 0, position: 'bottom', name: 'YOU',       isHuman: true  },
            { id: 'cpu1',   hand: [], score: existingScores?.cpu1   ?? 0, position: 'top',    name: 'CPU TOP',   isHuman: false },
            { id: 'cpu2',   hand: [], score: existingScores?.cpu2   ?? 0, position: 'left',   name: 'CPU LEFT',  isHuman: false },
            { id: 'cpu3',   hand: [], score: existingScores?.cpu3   ?? 0, position: 'right',  name: 'CPU RIGHT', isHuman: false },
        ]
        for (let i = 0; i < 7; i++) for (let j = 0; j < newPlayers.length; j++) newPlayers[j].hand.push(newDeck.shift()!)
        let startCardIndex = -1, startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) { if (newDeck[i].value >= 0 && newDeck[i].value <= 9 && newDeck[i].color !== 'any') { startCardIndex = i; startCard = newDeck[i]; break } }
        if (startCardIndex === -1) for (let i = 0; i < newDeck.length; i++) if (newDeck[i].color !== 'any') { startCardIndex = i; startCard = newDeck[i]; break }
        if (startCardIndex !== -1 && startCard) newDeck.splice(startCardIndex, 1)
        else if (newDeck.length > 0) startCard = newDeck.shift()!
        if (startCard?.value === 12) {
            const nextPlayer = newPlayers.find(p => p.id === 'cpu1')
            if (nextPlayer && newDeck.length >= 2) { nextPlayer.hand.push(newDeck.shift()!); nextPlayer.hand.push(newDeck.shift()!) }
            audioManager.play('plusCard')
        } else if (startCard?.value === 14) {
            const nextPlayer = newPlayers.find(p => p.id === 'cpu1')
            if (nextPlayer && newDeck.length >= 4) for (let i = 0; i < 4; i++) nextPlayer.hand.push(newDeck.shift()!)
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
        if (currentTurnRef.current !== cpuId || !gameOnRef.current || colorPickerRef.current || gameModeRef.current !== 'ai') return
        await new Promise(resolve => setTimeout(resolve, getCpuDelay()))
        if (currentTurnRef.current !== cpuId || !gameOnRef.current) return
        const order = playerOrderRef.current
        const cpu = playersRef.current.find(p => p.id === cpuId)
        if (!cpu) return
        const currentPlayPile = [...playPileRef.current]
        const currentDeck = [...deckRef.current]
        const topCard = currentPlayPile[currentPlayPile.length - 1]
        const currentDir = directionRef.current
        const playable: CardType[] = [], remaining: CardType[] = []
        for (const card of cpu.hand) {
            const canPlay = card.color === topCard.color || card.value === topCard.value || card.color === 'any' || topCard.color === 'any'
            canPlay ? playable.push(card) : remaining.push(card)
        }
        if (playable.length === 0) {
            let newDeck = [...currentDeck], newPlayPile = [...currentPlayPile]
            const newHand = [...cpu.hand]
            if (newDeck.length > 0) newHand.push(newDeck.shift()!)
            else if (newPlayPile.length > 1) { newDeck = shuffleDeck(newPlayPile.slice(0, -1)); newPlayPile = [newPlayPile[newPlayPile.length - 1]]; newHand.push(newDeck.shift()!) }
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
        let newDir = currentDir, nextTurn: Player['id']
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
                let updDeck = [...currentDeck], updPile = [...newPlayPile]
                for (let i = 0; i < chosenCard.drawValue; i++) {
                    if (updDeck.length > 0) { drawPlayer.hand.push(updDeck.shift()!); audioManager.play('drawCard') }
                    else if (updPile.length > 1) { updDeck = shuffleDeck(updPile.slice(0, -1)); updPile = [updPile[updPile.length - 1]]; drawPlayer.hand.push(updDeck.shift()!); audioManager.play('drawCard') }
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
        if (currentTurnRef.current !== myPlayerIdRef.current || colorPickerRef.current || !gameOnRef.current) return
        const order = playerOrderRef.current
        const player = playersRef.current.find(p => p.id === myPlayerIdRef.current)
        if (!player) return
        let newDeck = [...deckRef.current], newPlayPile = [...playPileRef.current]
        const newHand = [...player.hand]
        let drawnCard: CardType | null = null
        const currentDir = directionRef.current
        if (newDeck.length > 0) { drawnCard = newDeck.shift()!; newHand.push(drawnCard) }
        else if (newPlayPile.length > 1) {
            const toShuffle = newPlayPile.slice(0, -1)
            newDeck = shuffleDeck(toShuffle); newPlayPile = [newPlayPile[newPlayPile.length - 1]]
            drawnCard = newDeck.shift()!; newHand.push(drawnCard)
        } else return
        audioManager.play('drawCard')
        const updatedPlayers = playersRef.current.map(p => p.id === myPlayerIdRef.current ? { ...p, hand: [...newHand] } : p)
        setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
        setDeckState([...newDeck]); deckRef.current = newDeck
        setPlayPile([...newPlayPile]); playPileRef.current = newPlayPile
        if (gameModeRef.current === 'multiplayer') await broadcastAction('DRAW_CARD_UPDATE', { playerId: myPlayerIdRef.current, handCount: newHand.length })
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
        if (currentTurnRef.current !== myPlayerIdRef.current || colorPickerRef.current || !gameOnRef.current) return
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
        let nextTurn: Player['id'] | null = null, drawnTargetPlayer: Player['id'] | null = null
        if (playedCard.drawValue > 0) { audioManager.play('plusCard'); drawnTargetPlayer = getNextTurn(myPlayerIdRef.current, newDir, order); nextTurn = drawnTargetPlayer }
        else if (playedCard.value === 11) { const skipped = getNextTurn(myPlayerIdRef.current, newDir, order); nextTurn = getNextTurn(skipped, newDir, order) }
        setPlayers([...updatedPlayers]); playersRef.current = [...updatedPlayers]
        setPlayPile([...newPlayPile]); playPileRef.current = newPlayPile
        if (newPlayerHand.length === 1) { triggerUno(myPlayerIdRef.current); if (gameModeRef.current === 'multiplayer') await broadcastAction('UNO_SHOUT', { playerId: myPlayerIdRef.current }) }
        if (newPlayerHand.length === 0) { await checkForWinner(updatedPlayers); return }
        if (playedCard.color === 'any' && playedCard.value === 13) {
            if (gameModeRef.current === 'multiplayer') await broadcastAction('PLAY_CARD', { card: playedCard, playerHandCount: newPlayerHand.length, cardIndex: index, newDirection: newDir !== currentDir ? newDir : null, nextTurn: null, drawAmount: playedCard.drawValue, drawTargetPlayer: drawnTargetPlayer, colorChosen: true })
            setColorPickerOpen(true); colorPickerRef.current = true
            return
        }
        if (!playedCard.drawValue && playedCard.value !== 11 && !nextTurn) nextTurn = getNextTurn(myPlayerIdRef.current, newDir, order)
        if (nextTurn) { setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn }
        if (gameModeRef.current === 'multiplayer') await broadcastAction('PLAY_CARD', { card: playedCard, playerHandCount: newPlayerHand.length, cardIndex: index, newDirection: newDir !== currentDir ? newDir : null, nextTurn, drawAmount: playedCard.drawValue, drawTargetPlayer: drawnTargetPlayer })
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
        if (gameModeRef.current === 'multiplayer') { await broadcastAction('COLOR_CHOSEN', { color, nextTurn }); await broadcastAction('TURN_CHANGE', { nextTurn }) }
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
    const topCard      = playPile[playPile.length - 1]
    const myPlayer     = players.find(p => p.id === myPlayerId)
    const otherPlayers = players.filter(p => p.id !== myPlayerId)
    // #endregion
    // #region HAND CARD RESPONSIVE
    useEffect(() => {
        const playerHandContainer = document.querySelector('.player-hand')
        if (playerHandContainer && myPlayer) playerHandContainer.setAttribute('data-card-count', myPlayer.hand.length.toString())
    }, [myPlayer?.hand.length])
    // #endregion
    // #region HELPERS UI
    const getCardName = (card: CardType) => {
        if (card.color === 'any') return card.drawValue === 4 ? 'Wild Draw 4' : 'Wild Card'
        const colorNames: Record<string, string> = { 'rgb(255, 6, 0)': 'Red', 'rgb(0, 170, 69)': 'Green', 'rgb(0, 150, 224)': 'Blue', 'rgb(255, 222, 0)': 'Yellow' }
        const valueNames: Record<number, string> = { 10: 'Reverse', 11: 'Skip', 12: 'Draw 2', 13: 'Wild', 14: 'Wild Draw 4' }
        return `${colorNames[card.color] ?? card.color} ${valueNames[card.value] ?? card.value}`
    }
    const getDirectionDisplay = () => direction === 'clockwise' ? '↻ CW' : '↺ CCW'
    const getWildcardColorStyle = (color: string): React.CSSProperties => ({
        position: 'absolute', bottom: '6px', right: '6px',
        width: '20px', height: '20px', borderRadius: '50%',
        border: '2px solid white', backgroundColor: color,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    })
    // #endregion

    // #region MENU
    if (gameMode === 'menu') {
        return (
            <main style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '100vh',
                background: 'radial-gradient(ellipse at center, #1a4a1a 0%, #0d2b0d 50%, #050f05 100%)',
                fontFamily: "'Segoe UI', sans-serif",
                overflow: 'hidden', position: 'relative',
            }}>
                {/* Decorative rings */}
                {['#ff0600','#00aa45','#0096e0','#ffde00'].map((c, i) => (
                    <div key={i} style={{
                        position: 'absolute',
                        width: `${180 + i * 90}px`, height: `${180 + i * 90}px`,
                        borderRadius: '50%', border: `2px solid ${c}22`,
                        top: `${[15, 65, 25, 75][i]}%`, left: `${[8, 78, 48, 18][i]}%`,
                        transform: 'translate(-50%,-50%)', pointerEvents: 'none',
                    }} />
                ))}
                <div style={{
                    background: 'rgba(0,0,0,0.85)', borderRadius: '2.5rem',
                    padding: '4rem 5rem', textAlign: 'center',
                    border: '3px solid rgba(255,215,0,0.5)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 0 60px rgba(255,215,0,0.15), 0 20px 60px rgba(0,0,0,0.5)',
                    position: 'relative', zIndex: 1,
                }}>
                    <div style={{ fontSize: '5rem', marginBottom: '0.3rem' }}>🃏</div>
                    <h1 style={{
                        fontSize: '5.5rem', fontWeight: '900', color: '#ffd700',
                        textShadow: '0 0 30px rgba(255,215,0,0.7), 0 4px 8px rgba(0,0,0,0.5)',
                        margin: '0 0 0.4rem', letterSpacing: '0.1em', lineHeight: 1,
                    }}>UNO</h1>
                    <p style={{ color: '#aaa', marginBottom: '3rem', fontSize: '1.4rem', letterSpacing: '0.05em' }}>
                        Choose your game mode
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <button
                            onClick={() => { setGameMode('ai'); gameModeRef.current = 'ai'; newAIGame() }}
                            style={{
                                padding: '1.4rem 3.5rem', fontSize: '1.6rem', fontWeight: 'bold',
                                background: 'linear-gradient(135deg,#4caf50,#2e7d32)',
                                color: 'white', border: 'none', borderRadius: '1.2rem',
                                cursor: 'pointer', boxShadow: '0 6px 20px rgba(76,175,80,0.5)',
                                transition: 'transform 0.15s, box-shadow 0.15s', letterSpacing: '0.05em',
                            }}
                            onMouseEnter={e => { (e.currentTarget).style.transform = 'translateY(-3px)' }}
                            onMouseLeave={e => { (e.currentTarget).style.transform = 'none' }}
                        >🤖 Play vs AI</button>
                        <button
                            onClick={() => { setGameMode('multiplayer'); gameModeRef.current = 'multiplayer' }}
                            style={{
                                padding: '1.4rem 3.5rem', fontSize: '1.6rem', fontWeight: 'bold',
                                background: 'linear-gradient(135deg,#2196f3,#0d47a1)',
                                color: 'white', border: 'none', borderRadius: '1.2rem',
                                cursor: 'pointer', boxShadow: '0 6px 20px rgba(33,150,243,0.5)',
                                transition: 'transform 0.15s, box-shadow 0.15s', letterSpacing: '0.05em',
                            }}
                            onMouseEnter={e => { (e.currentTarget).style.transform = 'translateY(-3px)' }}
                            onMouseLeave={e => { (e.currentTarget).style.transform = 'none' }}
                        >🌐 Multiplayer</button>
                    </div>
                </div>
            </main>
        )
    }
    // #endregion

    // #region MULTIPLAYER LOBBY
    if (gameMode === 'multiplayer' && mpState !== 'playing') {
        return (
            <main style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '100vh',
                background: 'radial-gradient(ellipse at center, #0d2b4a 0%, #050f1a 100%)',
                fontFamily: "'Segoe UI', sans-serif",
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.88)', borderRadius: '2rem',
                    padding: '3rem 3.5rem', width: '100%', maxWidth: '520px',
                    border: '2px solid rgba(33,150,243,0.5)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 0 40px rgba(33,150,243,0.1), 0 20px 60px rgba(0,0,0,0.5)',
                }}>
                    <button onClick={() => {
                        if (roomCode && myPlayerIdRef.current)
                            pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
                        setGameMode('menu'); setMpState('lobby'); setMpError(''); setMpConnectedPlayers([]); setRoomCode('')
                        setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null)
                    }} style={{
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
                        color: '#ccc', padding: '0.5rem 1.2rem', borderRadius: '0.6rem',
                        cursor: 'pointer', marginBottom: '1.5rem', fontSize: '1rem',
                    }}>← Back</button>
                    <h2 style={{ color: '#2196f3', fontSize: '2.4rem', marginBottom: '1.8rem', textAlign: 'center', fontWeight: 'bold' }}>
                        🌐 Multiplayer
                    </h2>
                    {mpState === 'lobby' && (
                        <>
                            <div style={{ marginBottom: '1.4rem' }}>
                                <label style={{ color: '#ccc', display: 'block', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Your Name</label>
                                <input type="text" value={myPlayerName} onChange={e => setMyPlayerName(e.target.value)}
                                    placeholder="Enter your name…" maxLength={16}
                                    style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: '0.8rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '1.1rem', boxSizing: 'border-box', outline: 'none' }} />
                            </div>
                            <button onClick={createRoom} disabled={joiningRef.current}
                                style={{ width: '100%', padding: '1.1rem', marginBottom: '1.8rem', background: 'linear-gradient(135deg,#4caf50,#2e7d32)', color: 'white', border: 'none', borderRadius: '0.9rem', cursor: joiningRef.current ? 'not-allowed' : 'pointer', opacity: joiningRef.current ? 0.6 : 1, fontSize: '1.1rem', fontWeight: 'bold' }}>
                                {joiningRef.current ? '⏳ Creating...' : '🏠 Create Room'}
                            </button>
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.4rem' }}>
                                <label style={{ color: '#ccc', display: 'block', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Join with Room Code</label>
                                <div style={{ display: 'flex', gap: '0.8rem' }}>
                                    <input type="text" value={inputRoomCode} onChange={e => setInputRoomCode(e.target.value.toUpperCase())}
                                        placeholder="e.g. ABC123" maxLength={6}
                                        style={{ flex: 1, padding: '0.9rem 1.1rem', borderRadius: '0.8rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '1.1rem', letterSpacing: '0.2em', outline: 'none' }} />
                                    <button onClick={joinRoom} disabled={joiningRef.current}
                                        style={{ padding: '0.9rem 1.6rem', background: 'linear-gradient(135deg,#2196f3,#0d47a1)', color: 'white', border: 'none', borderRadius: '0.8rem', cursor: joiningRef.current ? 'not-allowed' : 'pointer', opacity: joiningRef.current ? 0.6 : 1, fontSize: '1.1rem', fontWeight: 'bold' }}>
                                        {joiningRef.current ? '⏳' : 'Join'}
                                    </button>
                                </div>
                            </div>
                            {mpError && <p style={{ color: '#f44336', marginTop: '1rem', textAlign: 'center', fontSize: '1rem' }}>⚠️ {mpError}</p>}
                        </>
                    )}
                    {mpState === 'waiting' && (
                        <>
                            <div style={{ background: 'rgba(255,215,0,0.08)', border: '2px dashed rgba(255,215,0,0.5)', borderRadius: '1rem', padding: '1.8rem', textAlign: 'center', marginBottom: '1.8rem' }}>
                                <p style={{ color: '#ccc', marginBottom: '0.4rem', fontSize: '1.1rem' }}>Room Code</p>
                                <p style={{ fontSize: '3.5rem', fontWeight: 'bold', color: '#ffd700', letterSpacing: '0.3em', fontFamily: 'monospace', margin: '0.3rem 0' }}>{roomCode}</p>
                                <p style={{ color: '#aaa', fontSize: '0.95rem' }}>Share this code with friends</p>
                            </div>
                            <p style={{ color: '#ccc', marginBottom: '0.8rem', fontSize: '1.1rem' }}>Players ({mpConnectedPlayers.length}/4)</p>
                            {mpConnectedPlayers.map((p, i) => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 1.1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.6rem', marginBottom: '0.5rem' }}>
                                    <span style={{ color: '#4caf50', fontSize: '1.1rem' }}>✓</span>
                                    <span style={{ color: 'white', fontSize: '1.1rem' }}>{p.name}</span>
                                    {i === 0 && isHost && <span style={{ color: '#ffd700', fontSize: '0.9rem', marginLeft: 'auto', fontWeight: 'bold' }}>HOST</span>}
                                </div>
                            ))}
                            {Array.from({ length: Math.max(0, 4 - mpConnectedPlayers.length) }).map((_, i) => (
                                <div key={`empty-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 1.1rem', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '0.6rem', marginBottom: '0.5rem' }}>
                                    <span style={{ color: '#555', fontSize: '1.1rem' }}>⏳</span>
                                    <span style={{ color: '#555', fontSize: '1.1rem' }}>Waiting for player...</span>
                                </div>
                            ))}
                            {isHost && (
                                <button onClick={startMultiplayerGame} disabled={mpConnectedPlayers.length < 2}
                                    style={{ width: '100%', padding: '1.1rem', marginTop: '1.2rem', background: mpConnectedPlayers.length >= 2 ? 'linear-gradient(135deg,#4caf50,#2e7d32)' : 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '0.9rem', cursor: mpConnectedPlayers.length >= 2 ? 'pointer' : 'not-allowed', fontSize: '1.2rem', fontWeight: 'bold' }}>
                                    {mpConnectedPlayers.length >= 2 ? '🚀 Start Game!' : `⏳ Need at least 2 players (${mpConnectedPlayers.length} joined)`}
                                </button>
                            )}
                            {!isHost && <p style={{ color: '#aaa', textAlign: 'center', marginTop: '1rem', fontSize: '1.1rem' }}>⏳ Waiting for host to start…</p>}
                        </>
                    )}
                </div>
            </main>
        )
    }
    // #endregion

    // #region GAME BOARD
    return (
        <main style={{
            minHeight: '100vh',
            width: '100vw',
            position: 'relative',
            overflow: 'visible', // FIXED: changed from 'hidden' to 'visible' to prevent clipping
            background: 'radial-gradient(ellipse at center, #1a5c1a 0%, #0d3a0d 50%, #050f05 100%)',
            fontFamily: "'Segoe UI', sans-serif",
        }}>
            {/* ── TOP BAR ── */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.6rem 1.2rem',
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                height: '52px', boxSizing: 'border-box',
            }}>
                <button onClick={() => {
                    if (roomCode && myPlayerIdRef.current)
                        pusherTrigger(`uno-room-${roomCode}`, 'player-left', { playerId: myPlayerIdRef.current, playerName: myPlayerNameRef.current }).catch(console.error)
                    if (gameMode === 'ai') { setRoundVisible(false); setRoundWinner(null); setGameVisible(false); setGameWinner(null); setShowUno({}); setColorPickerOpen(false); setGameOn(false); gameOnRef.current = false }
                    else if (gameMode === 'multiplayer') resetMultiplayerState()
                    setGameMode('menu'); gameModeRef.current = 'menu'; setMpState('lobby'); setMpConnectedPlayers([]); setRoomCode('')
                }} style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    color: 'white', padding: '0.4rem 1rem', borderRadius: '0.5rem',
                    cursor: 'pointer', fontSize: '0.95rem', fontWeight: 'bold',
                }}>← Menu</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{
                        background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)',
                        color: '#ffd700', padding: '0.3rem 0.9rem', borderRadius: '2rem',
                        fontSize: '0.95rem', fontWeight: 'bold',
                    }}>{getDirectionDisplay()}</div>
                    <div style={{
                        background: gameMode === 'ai' ? 'rgba(76,175,80,0.2)' : 'rgba(33,150,243,0.2)',
                        border: `1px solid ${gameMode === 'ai' ? '#4caf50' : '#2196f3'}`,
                        color: 'white', padding: '0.3rem 0.9rem', borderRadius: '2rem', fontSize: '0.95rem',
                    }}>{gameMode === 'ai' ? '🤖 vs AI' : `🌐 ${roomCode}`}</div>
                </div>
            </div>

            {/* ── TOP PLAYER ── */}
            {otherPlayers.filter(op => op.position === 'top').map(op => {
                const isMyTurn = currentTurn === op.id
                const handLen = op.hand.length
                const overlapMargin = handLen > 14 ? -20 : handLen > 10 ? -14 : handLen > 6 ? -8 : 2
                return (
                    <div key={op.id} style={{
                        position: 'fixed',
                        top: '58px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                    }}>
                        {/* Badge */}
                        <div style={{
                            background: isMyTurn ? 'rgba(255,215,0,0.25)' : 'rgba(0,0,0,0.8)',
                            border: isMyTurn ? '2px solid #ffd700' : '2px solid rgba(255,255,255,0.15)',
                            borderRadius: '1rem', padding: '3px 12px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: isMyTurn ? '0 0 16px rgba(255,215,0,0.4)' : 'none',
                            textAlign: 'center', whiteSpace: 'nowrap',
                        }}>
                            <span style={{ color: isMyTurn ? '#ffd700' : 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>
                                {op.name}{isMyTurn && ' 🎯'}
                            </span>
                            <span style={{ color: '#aaa', fontSize: '0.8rem', marginLeft: '6px' }}>
                                {handLen} · <span style={{ color: '#ffd700' }}>{op.score}pts</span>
                            </span>
                        </div>
                        {/* Cards row - no overflow cut */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            justifyContent: 'center',
                            flexWrap: 'nowrap',
                            overflow: 'visible',
                            padding: '2px 0',
                        }}>
                            {op.hand.map((_, i) => (
                                <div key={i} style={{
                                    marginLeft: i === 0 ? '0' : `${overlapMargin}px`,
                                    zIndex: i,
                                    position: 'relative',
                                    flexShrink: 0,
                                }}>
                                    <Image src="/images/back.png" alt="card" width={36} height={52}
                                        style={{ borderRadius: '3px', display: 'block', boxShadow: '0 2px 5px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }} />
                                </div>
                            ))}
                        </div>
                        {showUno[op.id] && (
                            <div style={{
                                position: 'absolute', top: '-30px', left: '50%', transform: 'translateX(-50%)',
                                background: 'linear-gradient(135deg,#ff6b35,#ff0600)',
                                color: 'white', fontWeight: '900', fontSize: '1.4rem',
                                padding: '2px 12px', borderRadius: '6px',
                                boxShadow: '0 0 16px rgba(255,0,0,0.6)',
                                whiteSpace: 'nowrap', zIndex: 999,
                            }}>UNO!</div>
                        )}
                    </div>
                )
            })}

            {/* ── LEFT PLAYER ── */}
            {otherPlayers.filter(op => op.position === 'left').map(op => {
                const isMyTurn = currentTurn === op.id
                const handLen = op.hand.length
                const overlapMargin = handLen > 14 ? -26 : handLen > 10 ? -20 : handLen > 6 ? -14 : -4
                return (
                    <div key={op.id} style={{
                        position: 'fixed',
                        left: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: '5px',
                    }}>
                        {/* Badge */}
                        <div style={{
                            background: isMyTurn ? 'rgba(255,215,0,0.25)' : 'rgba(0,0,0,0.8)',
                            border: isMyTurn ? '2px solid #ffd700' : '2px solid rgba(255,255,255,0.15)',
                            borderRadius: '1rem', padding: '6px 10px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: isMyTurn ? '0 0 16px rgba(255,215,0,0.4)' : 'none',
                            textAlign: 'center', flexShrink: 0,
                        }}>
                            <div style={{ color: isMyTurn ? '#ffd700' : 'white', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                {op.name}{isMyTurn && ' 🎯'}
                            </div>
                            <div style={{ color: '#aaa', fontSize: '0.75rem' }}>
                                {handLen} · <span style={{ color: '#ffd700' }}>{op.score}pts</span>
                            </div>
                        </div>
                        {/* Cards column - vertical fan */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            justifyContent: 'center',
                            flexWrap: 'nowrap',
                            overflow: 'visible',
                            padding: '0 2px',
                            maxHeight: 'calc(100vh - 180px)',
                        }}>
                            {op.hand.map((_, i) => (
                                <div key={i} style={{
                                    marginTop: i === 0 ? '0' : `${overlapMargin}px`,
                                    zIndex: i,
                                    position: 'relative',
                                    flexShrink: 0,
                                }}>
                                    <Image src="/images/back.png" alt="card" width={34} height={50}
                                        style={{ borderRadius: '3px', display: 'block', boxShadow: '0 2px 5px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }} />
                                </div>
                            ))}
                        </div>
                        {showUno[op.id] && (
                            <div style={{
                                position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)',
                                background: 'linear-gradient(135deg,#ff6b35,#ff0600)',
                                color: 'white', fontWeight: '900', fontSize: '1.3rem',
                                padding: '2px 10px', borderRadius: '6px',
                                boxShadow: '0 0 14px rgba(255,0,0,0.6)',
                                whiteSpace: 'nowrap', zIndex: 999,
                            }}>UNO!</div>
                        )}
                    </div>
                )
            })}

            {/* ── RIGHT PLAYER ── */}
            {otherPlayers.filter(op => op.position === 'right').map(op => {
                const isMyTurn = currentTurn === op.id
                const handLen = op.hand.length
                const overlapMargin = handLen > 14 ? -26 : handLen > 10 ? -20 : handLen > 6 ? -14 : -4
                return (
                    <div key={op.id} style={{
                        position: 'fixed',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        gap: '5px',
                    }}>
                        {/* Badge */}
                        <div style={{
                            background: isMyTurn ? 'rgba(255,215,0,0.25)' : 'rgba(0,0,0,0.8)',
                            border: isMyTurn ? '2px solid #ffd700' : '2px solid rgba(255,255,255,0.15)',
                            borderRadius: '1rem', padding: '6px 10px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: isMyTurn ? '0 0 16px rgba(255,215,0,0.4)' : 'none',
                            textAlign: 'center', flexShrink: 0,
                        }}>
                            <div style={{ color: isMyTurn ? '#ffd700' : 'white', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                {op.name}{isMyTurn && ' 🎯'}
                            </div>
                            <div style={{ color: '#aaa', fontSize: '0.75rem' }}>
                                {handLen} · <span style={{ color: '#ffd700' }}>{op.score}pts</span>
                            </div>
                        </div>
                        {/* Cards column */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            flexWrap: 'nowrap',
                            overflow: 'visible',
                            padding: '0 2px',
                            maxHeight: 'calc(100vh - 180px)',
                        }}>
                            {op.hand.map((_, i) => (
                                <div key={i} style={{
                                    marginTop: i === 0 ? '0' : `${overlapMargin}px`,
                                    zIndex: i,
                                    position: 'relative',
                                    flexShrink: 0,
                                }}>
                                    <Image src="/images/back.png" alt="card" width={34} height={50}
                                        style={{ borderRadius: '3px', display: 'block', boxShadow: '0 2px 5px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }} />
                                </div>
                            ))}
                        </div>
                        {showUno[op.id] && (
                            <div style={{
                                position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)',
                                background: 'linear-gradient(135deg,#ff6b35,#ff0600)',
                                color: 'white', fontWeight: '900', fontSize: '1.3rem',
                                padding: '2px 10px', borderRadius: '6px',
                                boxShadow: '0 0 14px rgba(255,0,0,0.6)',
                                whiteSpace: 'nowrap', zIndex: 999,
                            }}>UNO!</div>
                        )}
                    </div>
                )
            })}

            {/* ── OVAL GREEN TABLE ── */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(560px, 60vw)',
                height: 'min(360px, 46vw)',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse at 38% 38%, #2d8a3e 0%, #1a6b2a 45%, #0f4d1a 75%, #0a3a12 100%)',
                border: '10px solid #5a3a1a',
                boxShadow: '0 0 0 4px #3d2710, 0 0 60px rgba(0,0,0,0.7), inset 0 0 80px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                zIndex: 50,
            }}>
                {/* Felt texture rings */}
                <div style={{ position: 'absolute', inset: '12px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', inset: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.02)', pointerEvents: 'none' }} />

                {/* Turn indicator */}
                <div style={{
                    background: currentTurn === myPlayerId ? 'rgba(255,215,0,0.2)' : 'rgba(0,0,0,0.55)',
                    border: `2px solid ${currentTurn === myPlayerId ? '#ffd700' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '2rem', padding: '5px 18px',
                    boxShadow: currentTurn === myPlayerId ? '0 0 18px rgba(255,215,0,0.35)' : 'none',
                }}>
                    <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 'bold', color: currentTurn === myPlayerId ? '#ffd700' : 'white', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {currentTurn === myPlayerId
                            ? '🎮 YOUR TURN!'
                            : `🎯 ${players.find(p => p.id === currentTurn)?.name?.replace(' (You)', '')}'s TURN`}
                    </p>
                </div>

                {/* Draw & Play piles */}
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    {/* Draw pile */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <div onClick={handleDrawPileClick} style={{
                            cursor: currentTurn === myPlayerId && !colorPickerOpen && gameOn ? 'pointer' : 'not-allowed',
                            opacity: currentTurn === myPlayerId && !colorPickerOpen && gameOn ? 1 : 0.55,
                            transform: currentTurn === myPlayerId && !colorPickerOpen && gameOn ? 'scale(1.06)' : 'scale(1)',
                            transition: 'transform 0.15s',
                        }}>
                            <Image src="/images/back.png" alt="draw pile" width={80} height={118}
                                style={{ borderRadius: '7px', boxShadow: '0 6px 18px rgba(0,0,0,0.55)', border: '2px solid rgba(255,255,255,0.12)', display: 'block' }} />
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 'bold' }}>📥 DRAW</span>
                    </div>

                    {/* Play pile */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <div style={{ position: 'relative' }}>
                            {topCard ? (
                                <>
                                    <Image src={topCard.src} alt="play pile" width={80} height={118}
                                        style={{ borderRadius: '7px', boxShadow: '0 6px 18px rgba(0,0,0,0.55)', border: '2px solid rgba(255,255,255,0.15)', display: 'block' }} />
                                    {(topCard.value === 13 || topCard.value === 14) && topCard.color !== 'any' && (
                                        <div style={getWildcardColorStyle(topCard.color)} />
                                    )}
                                </>
                            ) : (
                                <div style={{ width: '80px', height: '118px', borderRadius: '7px', border: '2px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '0.8rem' }}>Empty</div>
                            )}
                        </div>
                        <span style={{ color: '#ffd700', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap', maxWidth: '90px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {topCard ? getCardName(topCard) : '—'}
                        </span>
                    </div>
                </div>

                {/* Scores */}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {players.map(p => (
                        <span key={p.id} style={{
                            color: p.id === myPlayerId ? '#ffd700' : '#ddd',
                            fontWeight: p.id === myPlayerId ? 'bold' : 'normal',
                            fontSize: '0.8rem',
                            background: 'rgba(0,0,0,0.45)', padding: '2px 8px', borderRadius: '1rem',
                            whiteSpace: 'nowrap',
                        }}>
                            {p.id === myPlayerId ? '👤' : '👥'} {p.name.replace(' (You)', '')}: <span style={{ color: '#ffd700' }}>{p.score}pts</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* ── PLAYER HAND (bottom) ── */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 150,
                background: 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.75) 75%, transparent 100%)',
                padding: '0.6rem 0.5rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px',
                overflow: 'visible', // FIXED: added to allow cards to lift without clipping
            }}>
                {/* Player info bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    background: currentTurn === myPlayerId ? 'rgba(255,215,0,0.15)' : 'rgba(0,0,0,0.55)',
                    border: `2px solid ${currentTurn === myPlayerId ? '#ffd700' : 'rgba(255,255,255,0.15)'}`,
                    borderRadius: '2rem', padding: '0.3rem 1.4rem',
                    boxShadow: currentTurn === myPlayerId ? '0 0 18px rgba(255,215,0,0.3)' : 'none',
                    flexShrink: 0,
                }}>
                    <span style={{ color: currentTurn === myPlayerId ? '#ffd700' : 'white', fontWeight: 'bold', fontSize: '1rem' }}>
                        👤 {myPlayer?.name ?? 'YOU'}{currentTurn === myPlayerId && ' 🎯'}
                    </span>
                    <span style={{ color: '#aaa', fontSize: '0.9rem' }}>
                        {myPlayer?.hand.length ?? 0} cards · <span style={{ color: '#ffd700' }}>{myPlayer?.score ?? 0}pts</span>
                    </span>
                </div>

                {/* Cards row */}
                <div
                    className="player-hand"
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'nowrap',
                        alignItems: 'flex-end', // FIXED: changed from 'center' to 'flex-end' so cards grow upward
                        justifyContent: 'center',
                        width: '100%',
                        overflowX: 'auto',
                        overflowY: 'visible', // FIXED: changed from 'hidden' to 'visible'
                        padding: '6px 12px 12px', // FIXED: added more bottom padding
                        scrollbarWidth: 'none',
                    }}
                >
                    {(myPlayer?.hand ?? []).map((card, i) => {
                        const tc = playPile[playPile.length - 1]
                        const playable = tc && (
                            card.value === tc.value || card.color === tc.color ||
                            card.color === 'any' || tc.color === 'any'
                        )
                        const canAct = currentTurn === myPlayerId && !colorPickerOpen && gameOn
                        const handLen = myPlayer?.hand.length ?? 1
                        // Dynamic overlap so all cards fit on screen
                        const overlapMargin =
                            handLen > 16 ? -42
                            : handLen > 13 ? -34
                            : handLen > 10 ? -24
                            : handLen > 7  ? -14
                            : handLen > 4  ? -4
                            : 4

                        return (
                            <div
                                key={i}
                                onClick={() => handlePlayerCardClick(i)}
                                style={{
                                    marginLeft: i === 0 ? '0' : `${overlapMargin}px`,
                                    zIndex: i,
                                    position: 'relative',
                                    flexShrink: 0,
                                    cursor: canAct && playable ? 'pointer' : 'not-allowed',
                                    transform: canAct && playable ? 'translateY(-28px)' : 'translateY(0px)', // FIXED: increased lift from -18px to -28px
                                    transition: 'transform 0.18s ease',
                                    marginBottom: canAct && playable ? '20px' : '0px', // FIXED: added margin to prevent clipping
                                }}
                            >
                                <Image
                                    src={card.src}
                                    alt={`card-${i}`}
                                    width={70}
                                    height={105}
                                    style={{
                                        borderRadius: '6px',
                                        display: 'block',
                                        opacity: canAct ? (playable ? 1 : 0.42) : 0.6,
                                        outline: canAct && playable ? '3px solid rgba(255,215,0,0.9)' : 'none',
                                        outlineOffset: '2px',
                                        boxShadow: canAct && playable
                                            ? '0 0 16px rgba(255,215,0,0.5), 0 5px 12px rgba(0,0,0,0.5)'
                                            : '0 3px 8px rgba(0,0,0,0.4)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                    }}
                                />
                            </div>
                        )
                    })}
                </div>

                {/* UNO shout for local player */}
                {showUno[myPlayerId] && (
                    <div style={{
                        position: 'absolute',
                        top: '-58px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(135deg,#ff6b35,#ff0600)',
                        color: 'white', fontWeight: '900', fontSize: '2rem',
                        padding: '0.35rem 1.4rem', borderRadius: '0.8rem',
                        boxShadow: '0 0 28px rgba(255,0,0,0.7)',
                        zIndex: 999, whiteSpace: 'nowrap',
                    }}>UNO! 🃏</div>
                )}
            </div>

            {/* ── COLOR PICKER ── */}
            {colorPickerOpen && currentTurn === myPlayerId && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 500,
                    background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'rgba(0,0,0,0.92)', border: '2px solid rgba(255,215,0,0.5)',
                        borderRadius: '2rem', padding: '3rem 4rem', textAlign: 'center',
                        boxShadow: '0 0 60px rgba(255,215,0,0.2)',
                    }}>
                        <p style={{ color: '#ffd700', fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', marginTop: 0 }}>
                            🎨 Choose a Color
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            {[
                                { color: 'rgb(255, 6, 0)',   label: '🔴 RED',    bg: 'linear-gradient(135deg,#ff3333,#cc0000)' },
                                { color: 'rgb(0, 170, 69)',  label: '🟢 GREEN',  bg: 'linear-gradient(135deg,#33cc66,#00aa45)' },
                                { color: 'rgb(0, 150, 224)', label: '🔵 BLUE',   bg: 'linear-gradient(135deg,#3399ff,#0066cc)' },
                                { color: 'rgb(255, 222, 0)', label: '🟡 YELLOW', bg: 'linear-gradient(135deg,#ffee33,#ccbb00)' },
                            ].map(({ color, label, bg }) => (
                                <button key={color} onClick={() => handleColorChosen(color)}
                                    style={{
                                        padding: '1.1rem 2rem', fontSize: '1.3rem', fontWeight: 'bold',
                                        background: bg, color: 'white', border: 'none', borderRadius: '1rem',
                                        cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                                        transition: 'transform 0.15s', minWidth: '150px',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget).style.transform = 'scale(1.08)' }}
                                    onMouseLeave={e => { (e.currentTarget).style.transform = 'scale(1)' }}
                                >{label}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── ROUND WINNER ── */}
            {roundVisible && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 600,
                    background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255,215,0,0.18), rgba(0,0,0,0.92))',
                        border: '3px solid #ffd700', borderRadius: '2rem',
                        padding: '3rem 5rem', textAlign: 'center',
                        boxShadow: '0 0 60px rgba(255,215,0,0.35)',
                    }}>
                        <div style={{ fontSize: '4rem', marginBottom: '0.8rem' }}>🏆</div>
                        <p style={{ color: '#ffd700', fontSize: '2.4rem', fontWeight: '900', margin: 0 }}>
                            {roundWinner} won the round!
                        </p>
                        <p style={{ color: '#aaa', fontSize: '1.1rem', marginTop: '0.6rem' }}>Next round starting soon…</p>
                    </div>
                </div>
            )}

            {/* ── GAME WINNER ── */}
            {gameVisible && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 700,
                    background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(0,0,0,0.96))',
                        border: '3px solid #ffd700', borderRadius: '2.5rem',
                        padding: '3.5rem 4.5rem', textAlign: 'center',
                        boxShadow: '0 0 80px rgba(255,215,0,0.25)',
                        minWidth: '360px', maxWidth: '90vw',
                    }}>
                        <div style={{ fontSize: '4.5rem', marginBottom: '0.8rem' }}>
                            {gameWinner === 'You' ? '🎉' : '😢'}
                        </div>
                        <p style={{
                            color: gameWinner === 'You' ? '#ffd700' : '#ff6b6b',
                            fontSize: '2.6rem', fontWeight: '900', margin: '0 0 0.4rem',
                        }}>
                            {gameWinner === 'You' ? 'YOU WIN!' : `${gameWinner} Wins!`}
                        </p>
                        <p style={{ color: '#aaa', fontSize: '1.1rem', marginBottom: '2rem' }}>
                            {gameWinner === 'You' ? 'Congratulations! 🎊' : 'Better luck next time!'}
                        </p>

                        {/* Score table */}
                        <div style={{ marginBottom: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '0.8rem 1rem' }}>
                            {players.map(p => (
                                <div key={p.id} style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    padding: '0.35rem 0.8rem',
                                    color: p.id === myPlayerId ? '#ffd700' : '#ccc',
                                    fontWeight: p.id === myPlayerId ? 'bold' : 'normal',
                                    fontSize: '1.05rem',
                                }}>
                                    <span>{p.id === myPlayerId ? '👤' : '👥'} {p.name.replace(' (You)', '')}</span>
                                    <span>{p.score} pts</span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {/* Play Again vs CPU */}
                            {gameMode === 'ai' && (
                                <button onClick={handlePlayAgain} style={{
                                    padding: '1rem 2.2rem', fontSize: '1.3rem', fontWeight: 'bold',
                                    background: 'linear-gradient(135deg,#4caf50,#2e7d32)',
                                    color: 'white', border: 'none', borderRadius: '1rem',
                                    cursor: 'pointer', boxShadow: '0 4px 18px rgba(76,175,80,0.5)',
                                    transition: 'transform 0.15s',
                                }}
                                    onMouseEnter={e => { (e.currentTarget).style.transform = 'scale(1.05)' }}
                                    onMouseLeave={e => { (e.currentTarget).style.transform = 'scale(1)' }}
                                >🤖 Play Again vs CPU</button>
                            )}
                            {/* Multiplayer host play again */}
                            {gameMode === 'multiplayer' && isHost && (
                                <button onClick={handlePlayAgain} style={{
                                    padding: '1rem 2.2rem', fontSize: '1.3rem', fontWeight: 'bold',
                                    background: 'linear-gradient(135deg,#2196f3,#0d47a1)',
                                    color: 'white', border: 'none', borderRadius: '1rem',
                                    cursor: 'pointer', boxShadow: '0 4px 18px rgba(33,150,243,0.5)',
                                }}>🔄 Play Again</button>
                            )}
                            <button onClick={() => {
                                setGameVisible(false)
                                if (gameMode === 'ai') { setRoundVisible(false); setRoundWinner(null); setGameWinner(null); setShowUno({}); setColorPickerOpen(false); setGameMode('menu'); gameModeRef.current = 'menu' }
                                else if (gameMode === 'multiplayer') { resetMultiplayerState(); setGameMode('menu'); gameModeRef.current = 'menu' }
                                else { setGameMode('menu'); gameModeRef.current = 'menu' }
                                setMpState('lobby')
                            }} style={{
                                padding: '1rem 2.2rem', fontSize: '1.3rem', fontWeight: 'bold',
                                background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)',
                                color: 'white', borderRadius: '1rem', cursor: 'pointer',
                                transition: 'transform 0.15s',
                            }}
                                onMouseEnter={e => { (e.currentTarget).style.transform = 'scale(1.05)' }}
                                onMouseLeave={e => { (e.currentTarget).style.transform = 'scale(1)' }}
                            >🏠 Main Menu</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
    // #endregion
}
