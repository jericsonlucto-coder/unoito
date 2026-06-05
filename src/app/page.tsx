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
        if (!gameOnRef.current && action !== 'ROUND_WINNER' && action !== 'GAME_WINNER') return
        
        const channel = `uno-room-${roomCodeRef.current}`
        try {
            await pusherTrigger(channel, 'game-action', {
                action,
                payload,
                timestamp: Date.now(),
                playerId: myPlayerIdRef.current,
            } as GameAction)
            console.log(`Broadcasted ${action}:`, payload)
        } catch (error) {
            console.error(`Failed to broadcast ${action}:`, error)
        }
    }, [])

    // Apply game action to local state
    const applyGameAction = useCallback((gameAction: GameAction) => {
        const { action, payload, playerId } = gameAction
        
        if (playerId === myPlayerIdRef.current) return
        
        console.log('Applying action:', action, payload)
        
        switch(action) {
            case 'PLAY_CARD': {
                const { card, newHand, newPlayPile, newDirection, nextTurn, colorChosen, drawAmount, drawnCards, drawTargetPlayer, updatedPlayers: receivedUpdatedPlayers } = payload

                let updatedPlayPile = [...playPileRef.current]
                
                if (newPlayPile && newPlayPile.length > 0) {
                    updatedPlayPile = newPlayPile
                } else if (card) {
                    updatedPlayPile.push(card)
                }
                
                setPlayPile(updatedPlayPile)
                playPileRef.current = updatedPlayPile

                let updatedPlayers: Player[] = []
                
                if (receivedUpdatedPlayers && Array.isArray(receivedUpdatedPlayers)) {
                    updatedPlayers = receivedUpdatedPlayers.map((p: any) => {
                        const existingPlayer = playersRef.current.find(ex => ex.id === p.id)
                        const displayName = p.id === myPlayerIdRef.current ? `${p.name} (You)` : p.name
                        
                        let handToUse = p.hand.map((cardData: any) => 
                            new Card(
                                cardData.color,
                                cardData.value,
                                cardData.points,
                                cardData.value === 0 || (cardData.value >= 1 && cardData.value <= 9),
                                cardData.drawValue,
                                cardData.src
                            )
                        )
                        
                        if (p.id === myPlayerIdRef.current && existingPlayer && card && card.value === 13 && existingPlayer.hand.length > handToUse.length) {
                            console.log(`Preserving local hand for ${p.id} (Wild Card case): ${existingPlayer.hand.length} vs received ${handToUse.length}`)
                            handToUse = existingPlayer.hand
                        }
                        
                        return {
                            ...p,
                            name: displayName,
                            hand: handToUse,
                            position: existingPlayer?.position || p.position || 'top',
                        }
                    })
                } else {
                    updatedPlayers = playersRef.current.map(p =>
                        p.id === playerId ? { ...p, hand: newHand } : p
                    )
                    
                    if (drawAmount && drawAmount > 0 && drawTargetPlayer) {
                        const drawPlayerIndex = updatedPlayers.findIndex(p => p.id === drawTargetPlayer)
                        
                        if (drawPlayerIndex !== -1 && drawnCards) {
                            const newDrawCards = drawnCards.map((cardData: any) => 
                                new Card(
                                    cardData.color,
                                    cardData.value,
                                    cardData.points,
                                    cardData.value === 0 || (cardData.value >= 1 && cardData.value <= 9),
                                    cardData.drawValue,
                                    cardData.src
                                )
                            )
                            updatedPlayers[drawPlayerIndex].hand.push(...newDrawCards)
                            audioManager.play('drawCard')
                        }
                    }
                }
                
                setPlayers(updatedPlayers)
                playersRef.current = updatedPlayers

                if (newDirection && newDirection !== directionRef.current) {
                    setDirection(newDirection)
                    directionRef.current = newDirection
                }

                if (nextTurn) {
                    setCurrentTurn(nextTurn)
                    currentTurnRef.current = nextTurn
                }

                if (colorChosen) {
                    setColorPickerOpen(true)
                    colorPickerRef.current = true
                    setWildCardColor(colorChosen)
                    setSelectedWildColor(colorChosen)
                    selectedWildColorRef.current = colorChosen
                }

                if (newHand && newHand.length === 1 && card && card.value !== 13) {
                    triggerUno(playerId)
                }
                break
            }
        
            case 'DRAW_CARD': {
                const { newHand, newDeck, newPlayPile, nextTurn } = payload

                const updatedPlayers = playersRef.current.map(p =>
                    p.id === playerId ? { ...p, hand: newHand } : p
                )
                setPlayers(updatedPlayers)
                playersRef.current = updatedPlayers

                if (newDeck) {
                    setDeckState(newDeck)
                    deckRef.current = newDeck
                }
                if (newPlayPile) {
                    setPlayPile(newPlayPile)
                    playPileRef.current = newPlayPile
                }

                if (nextTurn) {
                    setCurrentTurn(nextTurn)
                    currentTurnRef.current = nextTurn
                }

                audioManager.play('drawCard')
                break
            }
        
            case 'DRAW_CARD_UPDATE': {
                const { newHand, newDeck, newPlayPile, playerId: drawPlayerId } = payload
                
                console.log('Applying draw card update for player:', drawPlayerId)
                
                const updatedPlayers = playersRef.current.map(p =>
                    p.id === drawPlayerId ? { ...p, hand: newHand } : p
                )
                setPlayers(updatedPlayers)
                playersRef.current = updatedPlayers
                
                if (newDeck) {
                    setDeckState(newDeck)
                    deckRef.current = newDeck
                }
                if (newPlayPile) {
                    setPlayPile(newPlayPile)
                    playPileRef.current = newPlayPile
                }
                
                audioManager.play('drawCard')
                break
            }
        
            case 'COLOR_CHOSEN': {
                const { color, newPlayPile, nextTurn } = payload

                if (newPlayPile) {
                    setPlayPile(newPlayPile)
                    playPileRef.current = newPlayPile
                } else {
                    const updatedPile = [...playPileRef.current]
                    const lastCard = updatedPile[updatedPile.length - 1]
                    if (lastCard && lastCard.value === 13) {
                        updatedPile[updatedPile.length - 1] = { ...lastCard, color }
                    }
                    setPlayPile(updatedPile)
                    playPileRef.current = updatedPile
                }

                setColorPickerOpen(false)
                colorPickerRef.current = false
                setWildCardColor(color)
                setSelectedWildColor(color)
                selectedWildColorRef.current = color

                if (nextTurn) {
                    setCurrentTurn(nextTurn)
                    currentTurnRef.current = nextTurn
                }
                break
            }
        
            case 'UNO_SHOUT': {
                const { playerId: unoPlayerId } = payload
                triggerUno(unoPlayerId || playerId)
                break
            }
        
            case 'ROUND_WINNER': {
                const { winnerId, winnerName, updatedPlayers } = payload
                
                setRoundWinner(winnerId === myPlayerIdRef.current ? 'You' : winnerName)
                setRoundVisible(true)
                setGameOn(false)
                gameOnRef.current = false

                if (updatedPlayers && Array.isArray(updatedPlayers)) {
                    const updatedPlayersWithHands = playersRef.current.map(p => {
                        const updatedInfo = updatedPlayers.find((up: any) => up.id === p.id)
                        if (updatedInfo) {
                            const displayName = p.id === myPlayerIdRef.current ? `${updatedInfo.name} (You)` : updatedInfo.name
                            return { ...p, score: updatedInfo.score, name: displayName }
                        }
                        return p
                    })
                    setPlayers(updatedPlayersWithHands)
                    playersRef.current = updatedPlayersWithHands
                }

                setTimeout(() => {
                    setRoundVisible(false)
                }, 3000)
                break
            }
        
            case 'GAME_WINNER': {
                const { winnerId, winnerName, finalScores } = payload
                
                setGameWinner(winnerId === myPlayerIdRef.current ? 'You' : winnerName)
                setGameVisible(true)
                setGameOn(false)
                gameOnRef.current = false
                audioManager.play(winnerId === myPlayerIdRef.current ? 'winGame' : 'lose')
                
                if (finalScores && Array.isArray(finalScores)) {
                    const updatedPlayersWithFinalScores = playersRef.current.map(p => {
                        const finalInfo = finalScores.find((fs: any) => fs.id === p.id)
                        if (finalInfo) {
                            const displayName = p.id === myPlayerIdRef.current ? `${finalInfo.name} (You)` : finalInfo.name
                            return { ...p, score: finalInfo.score, name: displayName }
                        }
                        return p
                    })
                    setPlayers(updatedPlayersWithFinalScores)
                    playersRef.current = updatedPlayersWithFinalScores
                }
                break
            }
        
            case 'TURN_CHANGE': {
                const { nextTurn, newDirection } = payload
                if (nextTurn) {
                    setCurrentTurn(nextTurn)
                    currentTurnRef.current = nextTurn
                }
                if (newDirection) {
                    setDirection(newDirection)
                    directionRef.current = newDirection
                }
                break
            }
        }
    }, [triggerUno])
    // #endregion

    // #region INITIALIZE GAME FROM START
    const initializeGameFromStart = useCallback(async (payload: any) => {
        console.log('=== INITIALIZE GAME FROM START ===')
        console.log('Received payload:', payload)
        
        const { playerOrder, startCard, players: playerInfo, firstTurn, direction: startDirection, drawAmount, drawPlayerId } = payload
        
        setPlayerOrderState(playerOrder)
        playerOrderRef.current = playerOrder
        
        let myIndex = playerOrder.findIndex((id: Player['id']) => id === myPlayerIdRef.current)
        
        if (myIndex === -1 && myPlayerNameRef.current) {
            console.log(`Player ID ${myPlayerIdRef.current} not found, trying to find by name: ${myPlayerNameRef.current}`)
            const myInfoIndex = playerInfo.findIndex((p: any) => p.name === myPlayerNameRef.current)
            if (myInfoIndex !== -1) {
                const correctId = playerOrder[myInfoIndex]
                console.log(`Found by name match! Setting myPlayerId from ${myPlayerIdRef.current} to ${correctId}`)
                setMyPlayerId(correctId)
                myPlayerIdRef.current = correctId
                myIndex = myInfoIndex
            }
        }
        
        if (myIndex === -1) {
            console.warn('Could not find player in order, using index 0')
            myIndex = 0
        }
        
        const playerCount = playerOrder.length
        
        console.log(`My index: ${myIndex}, My ID: ${myPlayerIdRef.current}, My Name: ${myPlayerNameRef.current}`)
        console.log('Player order:', playerOrder)
        
        const playerPositions: { [key: string]: Player['position'] } = {}
        
        if (playerCount === 2) {
            playerPositions[playerOrder[myIndex]] = 'bottom'
            playerPositions[playerOrder[(myIndex + 1) % playerCount]] = 'top'
        } else if (playerCount === 3) {
            playerPositions[playerOrder[myIndex]] = 'bottom'
            playerPositions[playerOrder[(myIndex + 1) % playerCount]] = 'left'
            playerPositions[playerOrder[(myIndex + 2) % playerCount]] = 'right'
        } else if (playerCount === 4) {
            playerPositions[playerOrder[myIndex]] = 'bottom'
            playerPositions[playerOrder[(myIndex + 1) % playerCount]] = 'left'
            playerPositions[playerOrder[(myIndex + 2) % playerCount]] = 'top'
            playerPositions[playerOrder[(myIndex + 3) % playerCount]] = 'right'
        }
        
        console.log('Player positions:', playerPositions)
        
        const initializedPlayers: Player[] = playerInfo.map((info: any) => {
            const isMe = info.id === myPlayerIdRef.current
            const position = playerPositions[info.id] || (isMe ? 'bottom' : 'top')
            const displayName = isMe ? `${info.name} (You)` : info.name
            
            const hand = info.hand.map((cardData: any) => 
                new Card(
                    cardData.color,
                    cardData.value,
                    cardData.points,
                    cardData.value === 0 || (cardData.value >= 1 && cardData.value <= 9),
                    cardData.drawValue,
                    cardData.src
                )
            )
            
            console.log(`Player ${info.id}: name=${displayName}, position=${position}, handSize=${hand.length}, isMe=${isMe}`)
            
            return {
                id: info.id as Player['id'],
                hand: hand,
                score: info.score || 0,
                position: position,
                name: displayName,
                isHuman: true,
            }
        })
        
        let startCardObj: CardType | null = null
        if (startCard) {
            startCardObj = new Card(
                startCard.color,
                startCard.value,
                startCard.points,
                startCard.value === 0 || (startCard.value >= 1 && startCard.value <= 9),
                startCard.drawValue,
                startCard.src
            )
        } else {
            console.warn('No start card provided, creating default')
            startCardObj = new Card('rgb(255, 6, 0)', 0, 0, true, 0, '/images/red0.png')
        }
        
        const newPlayPile = startCardObj ? [startCardObj] : []
        let currentDeck = createDeck()
        currentDeck = shuffleDeck(currentDeck)
        let nextTurn = firstTurn
        let currentPlayers = [...initializedPlayers]
        
        if (drawAmount && drawAmount > 0 && drawPlayerId) {
            const drawPlayer = currentPlayers.find(p => p.id === drawPlayerId)
            if (drawPlayer) {
                for (let i = 0; i < drawAmount; i++) {
                    if (currentDeck.length > 0) {
                        drawPlayer.hand.push(currentDeck.shift()!)
                    }
                }
                audioManager.play('plusCard')
            }
        }
        
        const isMyTurn = nextTurn === myPlayerIdRef.current
        
        console.log('Final players:', currentPlayers.map(p => ({ id: p.id, name: p.name, position: p.position, handSize: p.hand.length })))
        
        setPlayers(currentPlayers)
        playersRef.current = currentPlayers
        setDeckState(currentDeck)
        deckRef.current = currentDeck
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
        setDirection(startDirection || 'clockwise')
        directionRef.current = startDirection || 'clockwise'
        setGameOn(true)
        gameOnRef.current = true
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setMpState('playing')
        
        if (typeof document !== 'undefined') {
            document.body.setAttribute('data-player-count', playerCount.toString())
        }
        
        audioManager.play('shuffle')
        
        setTimeout(() => {
            if (isMyTurn) {
                alert("It's your turn! 🎮")
            }
        }, 500)
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
            setGameWinner(gameWinnerPlayer.id === myPlayerIdRef.current ? 'You' : gameWinnerPlayer.name.replace(' (You)', ''))
            setGameVisible(true)
            audioManager.play(gameWinnerPlayer.id === myPlayerIdRef.current ? 'winGame' : 'lose')
            
            if (gameModeRef.current === 'multiplayer') {
                await broadcastAction('GAME_WINNER', {
                    winnerId: gameWinnerPlayer.id,
                    winnerName: gameWinnerPlayer.name.replace(' (You)', ''),
                    finalScores: updatedPlayers.map(p => ({
                        id: p.id,
                        name: p.name.replace(' (You)', ''),
                        score: p.score
                    }))
                })
            }
        } else {
            setRoundWinner(winner.id === myPlayerIdRef.current ? 'You' : winner.name.replace(' (You)', ''))
            setRoundVisible(true)
            setGameOn(false)
            gameOnRef.current = false
            audioManager.play('winRound')
            
            if (gameModeRef.current === 'multiplayer') {
                await broadcastAction('ROUND_WINNER', {
                    winnerId: winner.id,
                    winnerName: winner.name.replace(' (You)', ''),
                    updatedPlayers: updatedPlayers.map(p => ({
                        id: p.id,
                        score: p.score,
                        handSize: p.hand.length,
                        name: p.name.replace(' (You)', ''),
                    })),
                })
            }
            
            if (gameModeRef.current === 'ai') {
                setTimeout(() => setRoundVisible(false), 3000)
            }
        }
        return true
    }, [tallyPoints, broadcastAction])
    // #endregion

    // #region BIND CHANNEL EVENTS
    const bindChannelEvents = useCallback((channel: PusherChannel) => {
        channel.bind('game-action', (raw: unknown) => {
            const gameAction = raw as GameAction
            applyGameAction(gameAction)
        })

        channel.bind('game-started', (raw: unknown) => {
            const payload = raw as any
            console.log('Received game-started event:', payload)
            initializeGameFromStart(payload)
        })

        channel.bind('player-joined', (raw: unknown) => {
            const data = raw as JoinPayload
            console.log('Player joined:', data)
            setMpConnectedPlayers(prev => {
                const exists = prev.find(p => p.id === data.playerId || p.name === data.playerName)
                if (exists) return prev
                console.log('Adding player to list:', data.playerName)
                return [...prev, { id: data.playerId, name: data.playerName }]
            })
        })

        channel.bind('player-left', (raw: unknown) => {
            const data = raw as { playerId: string; playerName?: string }
            console.log('Player left:', data)
            setMpConnectedPlayers(prev => {
                const filtered = prev.filter(p => p.id !== data.playerId && p.name !== data.playerName)
                console.log('Players after removal:', filtered)
                return filtered
            })
            setMpError('')
        })

        channel.bind('slot-assigned', (raw: unknown) => {
            const data = raw as SlotPayload
            console.log('Slot assigned received:', data)
            console.log('Current myPlayerNameRef:', myPlayerNameRef.current)
            console.log('Current myPlayerId:', myPlayerIdRef.current)
            
            if (data.playerId && data.playerName === myPlayerNameRef.current) {
                console.log(`Setting myPlayerId from ${myPlayerIdRef.current} to ${data.playerId} (name match: ${data.playerName})`)
                setMyPlayerId(data.playerId)
                myPlayerIdRef.current = data.playerId
            }
            
            if (data.allPlayers) {
                const uniquePlayers = Array.from(
                    new Map(data.allPlayers.map(p => [p.name, p])).values()
                )
                console.log('Setting connected players from slot-assigned:', uniquePlayers)
                setMpConnectedPlayers(uniquePlayers)
                mpConnectedRef.current = uniquePlayers
            }
        })
        
        channel.bind('players-updated', (raw: unknown) => {
            const data = raw as { allPlayers: { id: string; name: string }[] }
            console.log('Players updated event received (non-host):', data)
            if (data.allPlayers) {
                const uniquePlayers = Array.from(
                    new Map(data.allPlayers.map(p => [p.name, p])).values()
                )
                setMpConnectedPlayers(uniquePlayers)
                mpConnectedRef.current = uniquePlayers
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
            setRoomCode(code)
            roomCodeRef.current = code
            setIsHost(true)
            
            const hostId = 'player'
            setMyPlayerId(hostId)
            myPlayerIdRef.current = hostId
            myPlayerNameRef.current = myPlayerName

            const pusher = await getPusherInstance() as { subscribe: (ch: string) => PusherChannel }
            const channel = pusher.subscribe(`uno-room-${code}`)
            setMpChannel(channel)

            const initialConnected = [{ id: hostId, name: myPlayerName }]
            setMpConnectedPlayers(initialConnected)
            mpConnectedRef.current = initialConnected

            bindChannelEvents(channel)
            setMpState('waiting')
            setMpError('')
            
            console.log('Room created - Host ID:', hostId, 'Name:', myPlayerName)
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
            setRoomCode(code)
            roomCodeRef.current = code
            setIsHost(false)
            
            myPlayerNameRef.current = myPlayerName
            
            const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substring(7)
            setMyPlayerId(tempId as Player['id'])
            myPlayerIdRef.current = tempId as Player['id']

            const pusher = await getPusherInstance() as { subscribe: (ch: string) => PusherChannel }
            const channel = pusher.subscribe(`uno-room-${code}`)
            setMpChannel(channel)

            bindChannelEvents(channel)

            setMpConnectedPlayers(prev => {
                const exists = prev.find(p => p.name === myPlayerName)
                if (!exists) {
                    return [...prev, { id: tempId, name: myPlayerName }]
                }
                return prev
            })

            await pusherTrigger(`uno-room-${code}`, 'player-joined', {
                playerId:    tempId,
                playerName:  myPlayerName,
                requestSlot: true,
            })

            setMpState('waiting')
            setMpError('')
            
            console.log('Joined room - Temp ID:', tempId, 'Name:', myPlayerName)
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
        const assignedSlots: string[] = []
        
        const hostSlot = 'player'
        assignedSlots.push(hostSlot)
        
        console.log('Host assigned to slot:', hostSlot)
        console.log('Available slots for players:', availableSlots.filter(s => !assignedSlots.includes(s)))

        const pendingJoins = new Set<string>()

        const handlePlayerJoined = async (raw: unknown) => {
            const data = raw as JoinPayload
            if (!data.requestSlot) return
            
            console.log('Processing player join request:', data)
            
            if (pendingJoins.has(data.playerId)) {
                console.log('Already processing join for:', data.playerId)
                return
            }
            pendingJoins.add(data.playerId)
            
            try {
                const existingPlayer = mpConnectedRef.current.find(p => p.name === data.playerName)
                if (existingPlayer) {
                    console.log('Player with this name already exists:', data.playerName)
                    return
                }
                
                const nextSlot = availableSlots.find(slot => !assignedSlots.includes(slot))
                
                if (!nextSlot) {
                    console.log('No available slots for player:', data.playerName)
                    setMpError('Room is full! Max 4 players allowed.')
                    return
                }
                
                assignedSlots.push(nextSlot)
                
                console.log(`Assigning player ${data.playerName} to slot:`, nextSlot)
                console.log(`Remaining slots:`, availableSlots.filter(s => !assignedSlots.includes(s)))
                
                const newPlayer = { id: nextSlot, name: data.playerName }
                
                const newConnected = [...mpConnectedRef.current]
                const alreadyExists = newConnected.find(p => p.name === data.playerName)
                if (!alreadyExists) {
                    newConnected.push(newPlayer)
                    setMpConnectedPlayers(newConnected)
                    mpConnectedRef.current = newConnected
                    console.log('Updated connected players:', newConnected)
                }

                const slotPayload = {
                    playerId: nextSlot,
                    playerName: data.playerName,
                    allPlayers: newConnected,
                }
                console.log('Sending slot-assigned payload:', slotPayload)
                
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'slot-assigned', slotPayload)
                
                await pusherTrigger(`uno-room-${roomCodeRef.current}`, 'players-updated', {
                    allPlayers: newConnected
                })
            } catch (error) {
                console.error('Error handling player join:', error)
            } finally {
                pendingJoins.delete(data.playerId)
            }
        }

        mpChannel.bind('player-joined', handlePlayerJoined)
        
        mpChannel.bind('players-updated', (raw: unknown) => {
            const data = raw as { allPlayers: { id: string; name: string }[] }
            console.log('Players updated event received:', data)
            if (data.allPlayers) {
                const uniquePlayers = Array.from(
                    new Map(data.allPlayers.map(p => [p.name, p])).values()
                )
                setMpConnectedPlayers(uniquePlayers)
                mpConnectedRef.current = uniquePlayers
                console.log('Connected players updated from broadcast:', uniquePlayers)
            }
        })
        
        return () => {
            mpChannel.unbind_all()
        }
    }, [isHost, mpChannel, gameMode])
    // #endregion

    // #region SYNC PLAYER LIST
    useEffect(() => {
        if (!isHost || !mpChannel || gameMode !== 'multiplayer' || mpState !== 'waiting') return
        
        const syncInterval = setInterval(() => {
            if (mpConnectedRef.current.length > 0) {
                console.log('Syncing player list...')
                pusherTrigger(`uno-room-${roomCodeRef.current}`, 'players-updated', {
                    allPlayers: mpConnectedRef.current
                }).catch(console.error)
            }
        }, 5000)
        
        return () => clearInterval(syncInterval)
    }, [isHost, mpChannel, gameMode, mpState])
    // #endregion

    // #region HANDLE PAGE LEAVE/CLEANUP
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (gameMode === 'multiplayer' && roomCode) {
                pusherTrigger(`uno-room-${roomCode}`, 'player-left', {
                    playerId: myPlayerIdRef.current,
                    playerName: myPlayerNameRef.current
                }).catch(console.error)
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
            if (gameMode === 'multiplayer' && roomCode && myPlayerIdRef.current) {
                pusherTrigger(`uno-room-${roomCode}`, 'player-left', {
                    playerId: myPlayerIdRef.current,
                    playerName: myPlayerNameRef.current
                }).catch(console.error)
            }
        }
    }, [gameMode, roomCode])
    // #endregion

    // #region START MULTIPLAYER GAME
    const startMultiplayerGame = useCallback(async () => {
        if (!isHost) return
        if (mpConnectedPlayers.length < 2) { setMpError('Need at least 2 players'); return }

        const playerOrder: Player['id'][] = mpConnectedPlayers.map(p => p.id as Player['id'])
        const playerCount = playerOrder.length
        
        console.log('=== STARTING MULTIPLAYER GAME ===')
        console.log('Player order:', playerOrder)
        console.log('Player count:', playerCount)
        console.log('My ID (host):', myPlayerIdRef.current)

        const newPlayers: Player[] = mpConnectedPlayers.map((cp) => ({
            id: cp.id as Player['id'],
            hand: [],
            score: 0,
            position: 'top',
            name: cp.name,
            isHuman: true,
        }))

        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)

        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < newPlayers.length; j++) {
                if (newDeck.length > 0) {
                    newPlayers[j].hand.push(newDeck.shift()!)
                }
            }
        }

        let startCardIndex = -1
        let startCard: CardType | null = null
        
        for (let i = 0; i < newDeck.length; i++) {
            const card = newDeck[i]
            if (card.value >= 0 && card.value <= 9 && card.color !== 'any') {
                startCardIndex = i
                startCard = newDeck[i]
                break
            }
        }
        
        if (startCardIndex === -1) {
            for (let i = 0; i < newDeck.length; i++) {
                const card = newDeck[i]
                if (card.color !== 'any') {
                    startCardIndex = i
                    startCard = newDeck[i]
                    break
                }
            }
        }
        
        if (startCardIndex !== -1 && startCard) {
            newDeck.splice(startCardIndex, 1)
        } else if (newDeck.length > 0) {
            startCard = newDeck.shift()!
        }
        
        const newPlayPile = startCard ? [startCard] : []
        
        console.log('Start card selected:', startCard?.value, startCard?.color)
        
        const firstPlayerIndex = Math.floor(Math.random() * playerOrder.length)
        let firstPlayer = playerOrder[firstPlayerIndex]
        let drawAmount = 0
        let drawPlayerId: Player['id'] | null = null
        
        if (startCard && startCard.value === 12) {
            drawAmount = 2
            audioManager.play('plusCard')
            const nextPlayerIndex = (firstPlayerIndex + 1) % playerOrder.length
            drawPlayerId = playerOrder[nextPlayerIndex]
            const drawPlayer = newPlayers.find(p => p.id === drawPlayerId)
            if (drawPlayer) {
                for (let i = 0; i < drawAmount; i++) {
                    if (newDeck.length > 0) {
                        drawPlayer.hand.push(newDeck.shift()!)
                    }
                }
            }
            firstPlayer = drawPlayerId
        } else if (startCard && startCard.value === 14) {
            drawAmount = 4
            audioManager.play('plusCard')
            const nextPlayerIndex = (firstPlayerIndex + 1) % playerOrder.length
            drawPlayerId = playerOrder[nextPlayerIndex]
            const drawPlayer = newPlayers.find(p => p.id === drawPlayerId)
            if (drawPlayer) {
                for (let i = 0; i < drawAmount; i++) {
                    if (newDeck.length > 0) {
                        drawPlayer.hand.push(newDeck.shift()!)
                    }
                }
            }
            const colors = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            const randomColor = colors[Math.floor(Math.random() * colors.length)]
            if (startCard) startCard.color = randomColor
            firstPlayer = drawPlayerId
        } else if (startCard && startCard.value === 10) {
            console.log('Reverse card - direction will be counter-clockwise')
        } else if (startCard && startCard.value === 11) {
            firstPlayer = playerOrder[(firstPlayerIndex + 1) % playerOrder.length]
            console.log(`Skip card! First player skipped, now ${firstPlayer}'s turn`)
        }
        
        console.log('Final first player:', firstPlayer)

        setPlayers(newPlayers)
        playersRef.current = newPlayers
        setDeckState(newDeck)
        deckRef.current = newDeck
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile
        setCurrentTurn(firstPlayer)
        currentTurnRef.current = firstPlayer
        setDirection('clockwise')
        directionRef.current = 'clockwise'
        setPlayerOrderState(playerOrder)
        playerOrderRef.current = playerOrder
        setGameOn(true)
        gameOnRef.current = true
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setMpState('playing')

        audioManager.play('shuffle')

        const gameStartPayload = {
            playerOrder: playerOrder,
            startCard: startCard ? {
                color: startCard.color,
                value: startCard.value,
                points: startCard.points,
                drawValue: startCard.drawValue,
                src: startCard.src,
            } : null,
            players: newPlayers.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                hand: p.hand.map(card => ({
                    color: card.color,
                    value: card.value,
                    points: card.points,
                    changeTurn: card.changeTurn,
                    drawValue: card.drawValue,
                    src: card.src,
                    playedByPlayer: card.playedByPlayer,
                })),
            })),
            firstTurn: firstPlayer,
            direction: 'clockwise',
            drawAmount: drawAmount,
            drawPlayerId: drawPlayerId,
        }
        
        console.log('Broadcasting game-started payload')
        await pusherTrigger(`uno-room-${roomCode}`, 'game-started', gameStartPayload)
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

        let startCardIndex = -1
        let startCard: CardType | null = null
        
        for (let i = 0; i < newDeck.length; i++) {
            const card = newDeck[i]
            if (card.value >= 0 && card.value <= 9 && card.color !== 'any') {
                startCardIndex = i
                startCard = newDeck[i]
                break
            }
        }
        
        if (startCardIndex === -1) {
            for (let i = 0; i < newDeck.length; i++) {
                const card = newDeck[i]
                if (card.color !== 'any') {
                    startCardIndex = i
                    startCard = newDeck[i]
                    break
                }
            }
        }
        
        if (startCardIndex !== -1 && startCard) {
            newDeck.splice(startCardIndex, 1)
        } else if (newDeck.length > 0) {
            startCard = newDeck.shift()!
        }
        
        const newPlayPile = startCard ? [startCard] : []

        setPlayers(newPlayers);             playersRef.current     = newPlayers
        setDeckState(newDeck);              deckRef.current        = newDeck
        setPlayPile(newPlayPile);           playPileRef.current    = newPlayPile
        setCurrentTurn('player');           currentTurnRef.current = 'player'
        
        console.log('AI Game - Start card:', startCard?.value, startCard?.color)
    }, [])
    // #endregion

    // #region CPU LOGIC - FIXED FOR SKIP CARD
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

        const playable: CardType[] = []
        const remaining: CardType[] = []

        for (const card of cpu.hand) {
            const canPlay = card.color === topCard.color || card.value === topCard.value || card.color === 'any' || topCard.color === 'any'
            canPlay ? playable.push(card) : remaining.push(card)
        }

        if (playable.length === 0) {
            let newDeck = [...currentDeck]
            let newPlayPile = [...currentPlayPile]
            let newHand = [...cpu.hand]
            let drawnCard: CardType | null = null

            if (newDeck.length > 0) {
                drawnCard = newDeck.shift()!
                newHand.push(drawnCard)
            } else if (newPlayPile.length > 1) {
                const toShuffle = newPlayPile.slice(0, -1)
                newDeck = shuffleDeck(toShuffle)
                newPlayPile = [newPlayPile[newPlayPile.length - 1]]
                drawnCard = newDeck.shift()!
                newHand.push(drawnCard)
            }

            audioManager.play('drawCard')
            const updated = playersRef.current.map(p => p.id === cpuId ? { ...p, hand: newHand } : p)
            setPlayers(updated)
            playersRef.current = updated
            setDeckState(newDeck)
            deckRef.current = newDeck
            setPlayPile(newPlayPile)
            playPileRef.current = newPlayPile

            const next = getNextTurn(cpuId, currentDir, order)
            setCurrentTurn(next)
            currentTurnRef.current = next
            return
        }

        let chosenCard = playable[0]
        let leftover = [...remaining, ...playable.slice(1)]

        audioManager.playCardSound()

        const newPlayPile = [...currentPlayPile, { ...chosenCard, playedByPlayer: false }]
        const newCpuHand = [...leftover]

        let newDir = currentDir
        let nextTurn: Player['id']

        if (chosenCard.value === 10) {
            newDir = currentDir === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDir)
            directionRef.current = newDir
            nextTurn = getNextTurn(cpuId, newDir, order)
        } else if (chosenCard.value === 11) {
            // Skip card - skip the next player
            const skippedPlayer = getNextTurn(cpuId, newDir, order)
            nextTurn = getNextTurn(skippedPlayer, newDir, order)
            console.log(`CPU Skip card played! Skipping ${skippedPlayer}, next turn: ${nextTurn}`)
        } else {
            nextTurn = getNextTurn(cpuId, newDir, order)
        }

        if (chosenCard.color === 'any' && chosenCard.value === 13) {
            const colours = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            const picked = colours[Math.floor(Math.random() * colours.length)]
            newPlayPile[newPlayPile.length - 1].color = picked
        }

        const updated = playersRef.current.map(p => p.id === cpuId ? { ...p, hand: newCpuHand } : p)
        setPlayers(updated)
        playersRef.current = updated
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        if (newCpuHand.length === 1) triggerUno(cpuId)
        if (newCpuHand.length === 0) { await checkForWinner(); return }

        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
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

        let newDeck = [...deckRef.current]
        let newPlayPile = [...playPileRef.current]
        let newHand = [...player.hand]
        let drawnCard: CardType | null = null
        const currentDir = directionRef.current

        if (newDeck.length > 0) {
            drawnCard = newDeck.shift()!
            newHand.push(drawnCard)
            console.log(`Drew card: ${drawnCard.value} of ${drawnCard.color}, new hand size: ${newHand.length}`)
        } else if (newPlayPile.length > 1) {
            const toShuffle = newPlayPile.slice(0, -1)
            newDeck = shuffleDeck(toShuffle)
            newPlayPile = [newPlayPile[newPlayPile.length - 1]]
            drawnCard = newDeck.shift()!
            newHand.push(drawnCard)
            console.log(`Reshuffled and drew card: ${drawnCard.value} of ${drawnCard.color}, new hand size: ${newHand.length}`)
        } else {
            return
        }

        audioManager.play('drawCard')

        const updatedPlayers = playersRef.current.map(p =>
            p.id === myPlayerIdRef.current ? { ...p, hand: newHand } : p
        )
        
        setPlayers(updatedPlayers)
        playersRef.current = updatedPlayers
        setDeckState(newDeck)
        deckRef.current = newDeck
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('DRAW_CARD_UPDATE', {
                newHand: newHand,
                newDeck: newDeck,
                newPlayPile: newPlayPile,
                playerId: myPlayerIdRef.current,
            })
        }

        if (drawnCard) {
            const topCard = newPlayPile[newPlayPile.length - 1]
            const canPlay = drawnCard.color === topCard.color || 
                           drawnCard.value === topCard.value || 
                           drawnCard.color === 'any' || 
                           topCard.color === 'any'
            
            if (canPlay) {
                console.log('Drawn card can be played! Keeping turn to allow play.')
                return
            }
        }

        const nextTurn = getNextTurn(myPlayerIdRef.current, currentDir, order)
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('TURN_CHANGE', { nextTurn })
        }
    }, [getNextTurn, broadcastAction])
    // #endregion

    // #region PLAYER CARD CLICK - FIXED FOR SKIP CARD
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
        if (playedCard.value === 10) {
            newDir = currentDir === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDir)
            directionRef.current = newDir
        }

        let updatedPlayers = playersRef.current.map(p =>
            p.id === myPlayerIdRef.current ? { ...p, hand: newPlayerHand } : p
        )

        let nextTurn: Player['id'] | null = null

        // Handle draw cards (Draw 2 or Wild Draw 4)
        if (playedCard.drawValue > 0) {
            audioManager.play('plusCard')
            const drawTargetPlayer = getNextTurn(myPlayerIdRef.current, newDir, order)
            const drawPlayerIndex = updatedPlayers.findIndex(p => p.id === drawTargetPlayer)

            if (drawPlayerIndex !== -1) {
                const drawPlayer = updatedPlayers[drawPlayerIndex]
                let updDeck = [...deckRef.current]
                let updPile = [...newPlayPile]

                for (let i = 0; i < playedCard.drawValue; i++) {
                    if (updDeck.length > 0) {
                        const drawnCard = updDeck.shift()!
                        drawPlayer.hand.push(drawnCard)
                        audioManager.play('drawCard')
                    } else if (updPile.length > 1) {
                        const toShuffle = updPile.slice(0, -1)
                        updDeck = shuffleDeck(toShuffle)
                        updPile = [updPile[updPile.length - 1]]
                        const drawnCard = updDeck.shift()!
                        drawPlayer.hand.push(drawnCard)
                        audioManager.play('drawCard')
                    }
                }
                updatedPlayers[drawPlayerIndex] = drawPlayer
                setDeckState(updDeck)
                deckRef.current = updDeck
                setPlayPile(updPile)
                playPileRef.current = updPile
            }
            nextTurn = drawTargetPlayer
        }
        // Handle skip card (value 11)
        else if (playedCard.value === 11) {
            // Skip the next player
            const skippedPlayer = getNextTurn(myPlayerIdRef.current, newDir, order)
            // Get the player after the skipped player
            nextTurn = getNextTurn(skippedPlayer, newDir, order)
            console.log(`Skip card played! Skipping ${skippedPlayer}, next turn: ${nextTurn}`)
        }

        setPlayers(updatedPlayers)
        playersRef.current = updatedPlayers
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        // Check for UNO
        if (newPlayerHand.length === 1) {
            triggerUno(myPlayerIdRef.current)
            if (gameModeRef.current === 'multiplayer') {
                await broadcastAction('UNO_SHOUT', { playerId: myPlayerIdRef.current })
            }
        }

        // Check for winner
        if (newPlayerHand.length === 0) {
            await checkForWinner(updatedPlayers)
            return
        }

        // Handle Wild Card (value 13)
        if (playedCard.color === 'any' && playedCard.value === 13) {
            if (gameModeRef.current === 'multiplayer') {
                await broadcastAction('PLAY_CARD', {
                    card: playedCard,
                    newHand: newPlayerHand,
                    newPlayPile: newPlayPile,
                    newDirection: newDir !== currentDir ? newDir : null,
                    nextTurn: null,
                    drawAmount: playedCard.drawValue,
                    drawTargetPlayer: null,
                    updatedPlayers: updatedPlayers.map(p => ({
                        id: p.id,
                        name: p.name.replace(' (You)', ''),
                        score: p.score,
                        position: p.position,
                        hand: p.hand.map(c => ({
                            color: c.color,
                            value: c.value,
                            points: c.points,
                            drawValue: c.drawValue,
                            src: c.src,
                        })),
                    })),
                })
            }
            
            setColorPickerOpen(true)
            colorPickerRef.current = true
            return
        }

        // If next turn not set yet (normal card), get the next player
        if (!nextTurn) {
            nextTurn = getNextTurn(myPlayerIdRef.current, newDir, order)
        }

        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('PLAY_CARD', {
                card: playedCard,
                newHand: newPlayerHand,
                newPlayPile: newPlayPile,
                newDirection: newDir !== currentDir ? newDir : null,
                nextTurn: nextTurn,
                drawAmount: playedCard.drawValue,
                drawTargetPlayer: playedCard.drawValue > 0 ? nextTurn : null,
                updatedPlayers: updatedPlayers.map(p => ({
                    id: p.id,
                    name: p.name.replace(' (You)', ''),
                    score: p.score,
                    position: p.position,
                    hand: p.hand.map(c => ({
                        color: c.color,
                        value: c.value,
                        points: c.points,
                        drawValue: c.drawValue,
                        src: c.src,
                    })),
                })),
            })
        }
    }, [triggerUno, checkForWinner, getNextTurn, broadcastAction])
    // #endregion

    // #region COLOUR CHOSEN
    const handleColorChosen = useCallback(async (color: string) => {
        audioManager.play('colorButton')
        const order = playerOrderRef.current
        const newPile = [...playPileRef.current]
        const lastCard = newPile[newPile.length - 1]
        if (lastCard && lastCard.value === 13) {
            newPile[newPile.length - 1] = { ...lastCard, color }
        }

        setPlayPile(newPile)
        playPileRef.current = newPile
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setWildCardColor(color)
        setSelectedWildColor(color)
        selectedWildColorRef.current = color

        const nextTurn = getNextTurn(myPlayerIdRef.current, directionRef.current, order)
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn

        if (gameModeRef.current === 'multiplayer') {
            await broadcastAction('COLOR_CHOSEN', { 
                color, 
                nextTurn,
                newPlayPile: newPile
            })
            
            await broadcastAction('TURN_CHANGE', { nextTurn })
        }
    }, [getNextTurn, broadcastAction])
    // #endregion

    // #region AUTO CPU TURN
    useEffect(() => {
        if (gameMode !== 'ai') return
        if (!gameOn) return
        if (colorPickerOpen) return
        if (currentTurn === 'player') return
        const p = players.find(pl => pl.id === currentTurn)
        if (p && !p.isHuman) playCPU(currentTurn)
    }, [currentTurn, gameOn, colorPickerOpen, playCPU, gameMode, players])
    // #endregion

    // #region DEBUG LOGGING
    useEffect(() => {
        if (gameMode === 'multiplayer' && mpState === 'playing') {
            console.log('=== CURRENT GAME STATE ===')
            console.log('Current turn:', currentTurn)
            console.log('My player ID:', myPlayerIdRef.current)
            console.log('Players:', players.map(p => ({ id: p.id, name: p.name, position: p.position, handSize: p.hand?.length || 0 })))
        }
    }, [currentTurn, players, mpState, gameMode])
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
    const otherPlayers = players.filter(p => p.id !== myPlayerId)

    const getCardName = (card: CardType) => {
        if (card.color === 'any') return card.drawValue === 4 ? 'Wild Draw 4' : 'Wild Card'
        const colorNames: Record<string, string> = {
            'rgb(255, 6, 0)': 'Red',
            'rgb(0, 170, 69)': 'Green',
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
        if (pos === 'top') return 'cpu-top'
        if (pos === 'left') return 'cpu-left'
        if (pos === 'right') return 'cpu-right'
        return ''
    }

    const getDirectionDisplay = () =>
        direction === 'clockwise' ? 'CLOCKWISE →' : 'COUNTER-CLOCKWISE ←'
    
    const getWildcardColorClass = (color: string) => {
        if (color === 'rgb(255, 6, 0)') return 'red'
        if (color === 'rgb(0, 170, 69)') return 'green'
        if (color === 'rgb(0, 150, 224)') return 'blue'
        if (color === 'rgb(255, 222, 0)') return 'yellow'
        return ''
    }
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
                    <button
                        onClick={() => { 
                            if (roomCode && myPlayerIdRef.current) {
                                pusherTrigger(`uno-room-${roomCode}`, 'player-left', {
                                    playerId: myPlayerIdRef.current,
                                    playerName: myPlayerNameRef.current
                                }).catch(console.error)
                            }
                            setGameMode('menu')
                            setMpState('lobby')
                            setMpError('')
                            setMpConnectedPlayers([])
                            setRoomCode('')
                        }}
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
                                disabled={joiningRef.current}
                                style={{
                                    width: '100%', padding: '1rem', marginBottom: '1.5rem',
                                    background: 'linear-gradient(135deg,#4caf50,#2e7d32)',
                                    color: 'white', border: 'none', borderRadius: '0.8rem',
                                    cursor: joiningRef.current ? 'not-allowed' : 'pointer',
                                    opacity: joiningRef.current ? 0.6 : 1,
                                    fontSize: '1rem', fontWeight: 'bold',
                                }}
                            >
                                {joiningRef.current ? '⏳ Creating...' : '🏠 Create Room'}
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
                                        disabled={joiningRef.current}
                                        style={{
                                            padding: '0.8rem 1.5rem',
                                            background: 'linear-gradient(135deg,#2196f3,#0d47a1)',
                                            color: 'white', border: 'none',
                                            borderRadius: '0.7rem', cursor: joiningRef.current ? 'not-allowed' : 'pointer',
                                            opacity: joiningRef.current ? 0.6 : 1,
                                            fontSize: '1rem', fontWeight: 'bold',
                                        }}
                                    >
                                        {joiningRef.current ? '⏳ Joining...' : 'Join'}
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

                            <p style={{ color: '#ccc', marginBottom: '0.8rem' }}>
                                Players ({mpConnectedPlayers.length}/4)
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
                                    {i === 0 && isHost && (
                                        <span style={{
                                            color: '#ffd700', fontSize: '0.8rem', marginLeft: 'auto',
                                        }}>
                                            HOST
                                        </span>
                                    )}
                                </div>
                            ))}
                            {Array.from({ length: Math.max(0, 4 - mpConnectedPlayers.length) }).map((_, i) => (
                                <div key={`empty-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.8rem',
                                    padding: '0.6rem 1rem',
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px dashed rgba(255,255,255,0.1)',
                                    borderRadius: '0.5rem', marginBottom: '0.4rem',
                                }}>
                                    <span style={{ color: '#555' }}>⏳</span>
                                    <span style={{ color: '#555' }}>Waiting for player...</span>
                                </div>
                            ))}

                            {isHost && (
                                <button
                                    onClick={startMultiplayerGame}
                                    disabled={mpConnectedPlayers.length < 2}
                                    style={{
                                        width: '100%', padding: '1rem', marginTop: '1rem',
                                        background: mpConnectedPlayers.length >= 2
                                            ? 'linear-gradient(135deg,#4caf50,#2e7d32)'
                                            : 'rgba(255,255,255,0.1)',
                                        color: 'white', border: 'none', borderRadius: '0.8rem',
                                        cursor: mpConnectedPlayers.length >= 2 ? 'pointer' : 'not-allowed',
                                        fontSize: '1.1rem', fontWeight: 'bold',
                                    }}
                                >
                                    {mpConnectedPlayers.length >= 2
                                        ? '🚀 Start Game!'
                                        : `⏳ Need at least 2 players (${mpConnectedPlayers.length} joined)`}
                                </button>
                            )}

                            {!isHost && (
                                <p style={{ color: '#aaa', textAlign: 'center', marginTop: '1rem' }}>
                                    ⏳ Waiting for host to start…
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
            <button
                onClick={() => {
                    if (roomCode && myPlayerIdRef.current) {
                        pusherTrigger(`uno-room-${roomCode}`, 'player-left', {
                            playerId: myPlayerIdRef.current,
                            playerName: myPlayerNameRef.current
                        }).catch(console.error)
                    }
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

            {otherPlayers.map(op => {
                const isMyTurn = currentTurn === op.id
                const isVertical = op.position === 'left' || op.position === 'right'
                
                return (
                    <div key={op.id} className={`cpu-player ${getPositionClass(op.position)}`}>
                        <div className="cpu-info" style={{
                            border: isMyTurn
                                ? '3px solid #ffd700'
                                : '2px solid transparent',
                            borderRadius: '0.5rem',
                            padding: '0.2rem 0.5rem',
                            background: isMyTurn ? 'rgba(255,215,0,0.2)' : 'rgba(0,0,0,0.5)',
                        }}>
                            <div className="cpu-name">
                                {op.name}
                                {isMyTurn && ' 🎯'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#aaa' }}>
                                {op.hand.length} cards · {op.score} pts
                            </div>
                        </div>

                        <div className={isVertical ? 'cpu-hand-vertical' : 'cpu-hand'}>
                            {op.hand.map((_, i) => (
                                <Image
                                    key={i}
                                    src={'/images/back.png'}
                                    alt="card back"
                                    width={isVertical ? 90 : 60}
                                    height={isVertical ? 60 : 90}
                                    className={isVertical ? 'cpu-card-vertical' : 'cpu-card'}
                                />
                            ))}
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

            <div className="center-area">
                <div className="turn-indicator">
                    <p className="turn-text">
                        {currentTurn === myPlayerId ? (
                            <span className="turn-player">🎮 YOUR TURN 🎮</span>
                        ) : (
                            <span className="turn-cpu">
                                🎯 {players.find(p => p.id === currentTurn)?.name?.replace(' (You)', '')}&apos;s TURN
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
                    <div className="play-pile">
                        {topCard && (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <Image
                                    src={topCard.src}
                                    alt="play pile"
                                    width={120}
                                    height={180}
                                    style={{ borderRadius: '10px', boxShadow: '0 0.8rem 1.6rem rgba(0,0,0,0.35)' }}
                                />
                                {(topCard.value === 13 || topCard.value === 14) && topCard.color !== 'any' && (
                                    <div 
                                        className={`wildcard-color-indicator ${getWildcardColorClass(topCard.color)}`}
                                        style={{
                                            position: 'absolute',
                                            bottom: '8px',
                                            right: '8px',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            border: '2px solid white',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                            backgroundColor: topCard.color,
                                        }}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    <div
                        className="draw-pile"
                        onClick={handleDrawPileClick}
                        style={{
                            cursor: currentTurn === myPlayerId && !colorPickerOpen && gameOn ? 'pointer' : 'not-allowed',
                            opacity: currentTurn === myPlayerId && !colorPickerOpen && gameOn ? 1 : 0.55,
                        }}
                    >
                        <Image src="/images/back.png" alt="draw pile" width={120} height={180} />
                        <div className="draw-text">Draw Card</div>
                    </div>
                </div>

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
                            {p.id === myPlayerId ? '👤' : '👥'} {p.name}: {p.score}
                        </span>
                    ))}
                </div>
            </div>

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
                            card.color === tc.color ||
                            card.color === 'any' ||
                            tc.color === 'any'
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
                                    cursor: canAct && playable ? 'pointer' : 'not-allowed',
                                    opacity: canAct ? (playable ? 1 : 0.45) : 0.6,
                                    transform: canAct && playable ? 'translateY(-10px)' : 'none',
                                    outline: canAct && playable ? '2px solid rgba(255,215,0,0.7)' : 'none',
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

            {roundVisible && (
                <div className="end-of-round">
                    <p>🏆 {roundWinner} won the round!</p>
                </div>
            )}

            {gameVisible && (
                <div className="end-of-game">
                    <p>🎉 {gameWinner} won the game!</p>
                    {(gameMode === 'ai' || isHost) && (
                        <button onClick={handlePlayAgain}>Play Again</button>
                    )}
                    <button onClick={() => { setGameVisible(false); setGameMode('menu'); setMpState('lobby'); }}>
                        Main Menu
                    </button>
                </div>
            )}
        </main>
    )
    // #endregion
}
